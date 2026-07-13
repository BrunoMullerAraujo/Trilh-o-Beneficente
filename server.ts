import express from "express";
import cors from "cors";
import rateLimit from "express-rate-limit";
import path from "path";
import "dotenv/config";
import { fileURLToPath } from "url";
import { createServer as createViteServer } from "vite";
import { MercadoPagoConfig, Payment } from "mercadopago";
import { randomUUID, createHmac, timingSafeEqual } from "crypto";
import admin from "firebase-admin";
import { FieldValue, getFirestore } from "firebase-admin/firestore";
import firebaseConfig from "./firebase-applet-config.json";
import { approveRegistration, syncApproved, healRegistrationNumber } from "./api/_lib/registrations";
import { generateConfirmationPdf, generateTermPdf } from "./api/_lib/pdf";
import { initEmailWorker, enqueueMessage, retryMessage, enqueueCampaignBatch } from "./api/_lib/whatsapp";
import { getMetaWhatsAppConfigStatus } from "./api/_lib/whatsappMeta";
import QRCode from "qrcode";

// Initialize Firebase Admin
if (!admin.apps.length) {
  let credential: admin.credential.Credential | undefined;
  const serviceAccountKey = process.env.FIREBASE_SERVICE_ACCOUNT_KEY;
  if (serviceAccountKey) {
    credential = admin.credential.cert(JSON.parse(serviceAccountKey.replace(/^﻿/, "")));
  } else {
    const clientEmail = process.env.FIREBASE_CLIENT_EMAIL;
    const privateKey = process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, "\n");
    if (clientEmail && privateKey) {
      credential = admin.credential.cert({ projectId: firebaseConfig.projectId, clientEmail, privateKey });
    }
  }
  admin.initializeApp({ projectId: firebaseConfig.projectId, ...(credential ? { credential } : {}) });
}
const adminApp = admin.app();
const adminDb = getFirestore(adminApp, firebaseConfig.firestoreDatabaseId);
const adminAuth = admin.auth(adminApp);

const EVENT_PRICE = Number(process.env.EVENT_PRICE) || 1;
const VOUCHER_PRICE = 0.10;
const MAX_VOUCHERS = 20;
const ADMIN_EMAIL = process.env.ADMIN_EMAIL || "bwk.bruno@gmail.com";
const SHIRT_SIZES = ["P", "M", "G", "GG", "XGG", "EX"] as const;

if (process.env.NODE_ENV === "production" && !process.env.WEBHOOK_SECRET) {
  console.warn("[SECURITY] WEBHOOK_SECRET não configurado — webhooks do Mercado Pago não são verificados.");
}

if (
  process.env.NODE_ENV === "production" &&
  process.env.WHATSAPP_ENABLED === "true" &&
  process.env.WHATSAPP_DRY_RUN === "false" &&
  !process.env.META_APP_SECRET
) {
  console.error("[SECURITY] WhatsApp Meta ativo em produção sem META_APP_SECRET. Configure o secret antes de enviar mensagens reais.");
}

const EMAIL_SUBJECTS: Record<string, string> = {
  confirmation: "Confirmação de inscrição",
  pending: "Inscrição pendente",
  term: "Termo de responsabilidade",
  reminder1: "Finalize sua inscricao - PIX aguardando",
  reminder2: "Sua vaga ainda esta reservada",
  reminder3: "Sua inscricao vence em 12 horas",
  reminder4: "Ultimas 4 horas - inscricao sera cancelada",
  cancelled_auto: "Inscricao cancelada - voce pode se re-inscrever",
};

async function sendEmailLogged(reg: any, docId: string, type: "confirmation" | "pending" | "term" | "reminder1" | "reminder2" | "reminder3" | "reminder4" | "cancelled_auto") {
  await enqueueMessage({
    channel: "email",
    to: reg.email,
    name: reg.name || "—",
    subject: EMAIL_SUBJECTS[type],
    emailType: type,
    registrationId: docId,
  });
}

async function sendWhatsAppLogged(
  reg: any,
  docId: string | undefined,
  type: "confirmation" | "reminder1" | "reminder2" | "reminder3" | "reminder4" | "cancelled_auto" = "confirmation",
) {
  if (!reg.phone) return;
  await enqueueMessage({
    channel: "whatsapp",
    to: reg.phone,
    name: reg.name || "—",
    subject: "WhatsApp",
    emailType: type,
    registrationId: docId,
  });
}

function verifyMpWebhookSignature(req: express.Request): boolean {
  const secret = process.env.WEBHOOK_SECRET;
  if (!secret) return true; // sem secret configurado — modo dev/teste

  const xSignature = req.headers["x-signature"] as string | undefined;
  const xRequestId = req.headers["x-request-id"] as string | undefined;
  if (!xSignature) return false;

  let ts = "";
  let v1 = "";
  for (const part of xSignature.split(",")) {
    const [k, val] = part.trim().split("=");
    if (k === "ts") ts = val ?? "";
    if (k === "v1") v1 = val ?? "";
  }
  if (!ts || !v1) return false;

  const dataId = String(req.body?.data?.id ?? "");
  const manifest = `id:${dataId};request-id:${xRequestId ?? ""};ts:${ts}`;
  const expected = createHmac("sha256", secret).update(manifest).digest("hex");
  try {
    return timingSafeEqual(Buffer.from(v1, "hex"), Buffer.from(expected, "hex"));
  } catch {
    return false;
  }
}

async function verifyAdminToken(req: express.Request): Promise<{ email: string; name: string } | null> {
  const authHeader = req.headers.authorization;
  if (!authHeader?.startsWith("Bearer ")) return null;
  const idToken = authHeader.slice(7);
  try {
    const decoded = await adminAuth.verifyIdToken(idToken);
    const email = decoded.email || "";
    let isAdmin = email === ADMIN_EMAIL || (await adminDb.collection("admins").doc(decoded.uid).get()).exists;
    if (!isAdmin && email) {
      const allowedSnap = await adminDb.collection("settings").doc("allowed_admins").get();
      const allowedEmails: string[] = allowedSnap.exists ? (allowedSnap.data()?.emails ?? []) : [];
      isAdmin = allowedEmails.includes(email);
    }
    if (!isAdmin) return null;
    return { email, name: decoded.name || email };
  } catch {
    return null;
  }
}

function getMercadoPagoClient() {
  const accessToken = process.env.MERCADO_PAGO_ACCESS_TOKEN;

  if (!accessToken || accessToken.length < 10 || accessToken.includes("MY_MERCADO_PAGO")) {
    return null;
  }

  return new MercadoPagoConfig({ accessToken });
}

const MP_API_BASE = "https://api.mercadopago.com";

async function createPixPayment(accessToken: string, body: {
  transaction_amount: number;
  description: string;
  external_reference: string;
  notification_url?: string;
  payer: {
    email: string;
    first_name?: string;
    last_name?: string;
    identification: { type: string; number: string };
  };
}): Promise<any> {
  const resp = await fetch(`${MP_API_BASE}/v1/payments`, {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${accessToken}`,
      "Content-Type": "application/json",
      "X-Idempotency-Key": randomUUID(),
    },
    body: JSON.stringify({ ...body, payment_method_id: "pix" }),
  });
  const json = await resp.json();
  if (!resp.ok) {
    const err = new Error(json?.message || `Payments API error ${resp.status}`) as any;
    err.status = resp.status;
    err.cause = json;
    throw err;
  }
  return json;
}

async function getOrder(accessToken: string, orderId: string): Promise<any> {
  const resp = await fetch(`${MP_API_BASE}/v1/orders/${orderId}`, {
    headers: { "Authorization": `Bearer ${accessToken}` },
  });
  const json = await resp.json();
  if (!resp.ok) {
    const detail = json?.errors?.[0]?.details?.[0] || json?.errors?.[0]?.message || json?.message;
    const err = new Error(detail || `Orders API error ${resp.status}`) as any;
    err.status = resp.status;
    throw err;
  }
  return json;
}

function getMercadoPagoNotificationUrl() {
  const appUrl = process.env.APP_URL;

  if (!appUrl || appUrl.includes("MY_APP_URL")) {
    return undefined;
  }

  try {
    const url = new URL(appUrl);
    const isLocalhost = ["localhost", "127.0.0.1", "::1"].includes(url.hostname);

    if (url.protocol !== "https:" || isLocalhost) {
      return undefined;
    }

    return new URL("/api/webhook/mercadopago", url).toString();
  } catch {
    return undefined;
  }
}

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// ─────────────────────────────────────────────────────────────────────────────
// Worker de lembretes de pagamento — executa a cada 30 minutos
// ─────────────────────────────────────────────────────────────────────────────

async function regeneratePixInternal(docId: string, reg: any): Promise<void> {
  const accessToken = process.env.MERCADO_PAGO_ACCESS_TOKEN;
  if (!accessToken || accessToken.length < 10) throw new Error("MP token nao configurado");
  const nameParts = String(reg.name || "").trim().split(/\s+/);
  const payment = await createPixPayment(accessToken, {
    transaction_amount: reg.amount,
    description: "Inscricao 8o Trilhao da Solidariedade",
    external_reference: `trilhao-${Date.now()}`,
    notification_url: getMercadoPagoNotificationUrl(),
    payer: {
      email: reg.email,
      first_name: nameParts[0] || reg.name,
      last_name: nameParts.slice(1).join(" ") || "Participante",
      identification: { type: "CPF", number: String(reg.cpf).replace(/\D/g, "") },
    },
  });
  // NÃO atualiza createdAt — preserva o tempo original de inscrição
  await adminDb.collection("registrations").doc(docId).update({
    paymentId: payment.external_reference,
    orderId: String(payment.id),
    pixCode: payment.point_of_interaction?.transaction_data?.qr_code_base64 || "",
    copyPaste: payment.point_of_interaction?.transaction_data?.qr_code || "",
    updatedAt: FieldValue.serverTimestamp(),
  });
}

async function autoCancelRegistration(docId: string, reg: any): Promise<void> {
  const now = new Date().toISOString();
  const vouchers = ((reg.vouchers as any[]) || []).map((v: any) =>
    v.used ? v : { ...v, cancelled: true, cancelledAt: now }
  );
  await adminDb.collection("registrations").doc(docId).update({
    status: "cancelled",
    cancelledAt: FieldValue.serverTimestamp(),
    updatedAt: FieldValue.serverTimestamp(),
    cancelOperatorEmail: "sistema@auto",
    cancelOperatorName: "Cancelamento automatico (24h sem pagamento)",
    ...(vouchers.length && { vouchers }),
  });
  // Restaurar estoque apenas se foi reservado ao criar a inscrição pendente
  if (reg.shirtSize && reg.inventoryReserved) {
    try {
      const inventoryRef = adminDb.collection("settings").doc("shirt_inventory");
      await adminDb.runTransaction(async (tx: any) => {
        const inv = await tx.get(inventoryRef);
        const current = inv.exists ? (inv.data()?.[reg.shirtSize] ?? 0) : 0;
        tx.set(inventoryRef, { [reg.shirtSize]: current + 1 }, { merge: true });
      });
    } catch (err) {
      console.error(`[reminder] Falha ao restaurar estoque para ${docId}:`, err);
    }
  }
  sendEmailLogged(reg, docId, "cancelled_auto").catch(err =>
    console.error(`[reminder] Falha ao enfileirar email cancelamento para ${docId}:`, err)
  );
  sendWhatsAppLogged(reg, docId, "cancelled_auto").catch(err =>
    console.error(`[reminder] Falha ao enfileirar WhatsApp cancelamento para ${docId}:`, err)
  );
  console.log(`[reminder] Inscricao ${docId} cancelada automaticamente apos 24h.`);
}

let reminderWorkerRunning = false;

async function processReminderWorker(): Promise<void> {
  if (reminderWorkerRunning) return;
  reminderWorkerRunning = true;
  try {
    const now = Date.now();
    const snap = await adminDb.collection("registrations")
      .where("status", "==", "pending")
      .get();

    for (const docSnap of snap.docs) {
      const reg = docSnap.data();
      const docId = docSnap.id;

      // Aceita createdAt como Firestore Timestamp ou string ISO
      const raw = reg.createdAt;
      const createdMs = raw?.toDate ? raw.toDate().getTime() : new Date(raw).getTime();
      if (isNaN(createdMs)) continue;

      const ageH = (now - createdMs) / (1000 * 60 * 60);
      const remindersSent: number = reg.remindersSent ?? 0;

      try {
        if (ageH >= 24) {
          await autoCancelRegistration(docId, reg);
        } else if (ageH >= 20 && remindersSent < 4) {
          await adminDb.collection("registrations").doc(docId).update({ remindersSent: 4 });
          sendEmailLogged(reg, docId, "reminder4").catch(console.error);
          sendWhatsAppLogged(reg, docId, "reminder4").catch(console.error);
          console.log(`[reminder] Lembrete 4 enfileirado para ${docId}`);
        } else if (ageH >= 12 && remindersSent < 3) {
          await adminDb.collection("registrations").doc(docId).update({ remindersSent: 3 });
          sendEmailLogged(reg, docId, "reminder3").catch(console.error);
          sendWhatsAppLogged(reg, docId, "reminder3").catch(console.error);
          console.log(`[reminder] Lembrete 3 enfileirado para ${docId}`);
        } else if (ageH >= 6 && remindersSent < 2) {
          await adminDb.collection("registrations").doc(docId).update({ remindersSent: 2 });
          sendEmailLogged(reg, docId, "reminder2").catch(console.error);
          sendWhatsAppLogged(reg, docId, "reminder2").catch(console.error);
          console.log(`[reminder] Lembrete 2 enfileirado para ${docId}`);
        } else if (ageH >= 1 && remindersSent < 1) {
          await adminDb.collection("registrations").doc(docId).update({ remindersSent: 1 });
          sendEmailLogged(reg, docId, "reminder1").catch(console.error);
          sendWhatsAppLogged(reg, docId, "reminder1").catch(console.error);
          console.log(`[reminder] Lembrete 1 enfileirado para ${docId}`);
        }
      } catch (err) {
        console.error(`[reminder] Erro ao processar ${docId}:`, err);
      }
    }
  } catch (err) {
    console.error("[reminder] Erro no worker:", err);
  } finally {
    reminderWorkerRunning = false;
  }
}

function startReminderWorker(): void {
  const INTERVAL_MS = 30 * 60 * 1000;
  processReminderWorker().catch(err => console.error("[reminder] Erro inicial:", err));
  setInterval(() => processReminderWorker().catch(err => console.error("[reminder] Erro:", err)), INTERVAL_MS);
  console.log("[reminder] Worker iniciado - rodada a cada 30 minutos.");
}

async function startServer() {
  const app = express();
  app.set("trust proxy", 1);
  const PORT = Number(process.env.PORT) || 3000;

  const allowedOrigins = process.env.ALLOWED_ORIGINS
    ? process.env.ALLOWED_ORIGINS.split(",").map(o => o.trim())
    : ["http://localhost:3000", "http://localhost:5173"];
  if (process.env.APP_URL) allowedOrigins.push(process.env.APP_URL.replace(/\/$/, ""));

  app.use(cors({
    origin: (origin, cb) => {
      if (!origin || allowedOrigins.includes(origin)) return cb(null, true);
      cb(new Error("Not allowed by CORS"));
    },
    credentials: true,
  }));
  app.use(express.json({
    verify: (req, _res, buf) => {
      (req as any).rawBody = buf.toString("utf8");
    },
  }));

  const paymentCreateLimiter = rateLimit({ windowMs: 60_000, max: 5, standardHeaders: true, legacyHeaders: false, message: { error: "Muitas tentativas. Aguarde 1 minuto." } });
  const paymentVerifyLimiter = rateLimit({ windowMs: 60_000, max: 20, standardHeaders: true, legacyHeaders: false, message: { error: "Muitas tentativas. Aguarde 1 minuto." } });
  const cpfPublicLimiter = rateLimit({ windowMs: 5 * 60_000, max: 3, standardHeaders: true, legacyHeaders: false, message: { error: "Muitas tentativas. Aguarde alguns minutos." } });

  // Logging middleware for API
  app.use("/api", (req, res, next) => {
    const sanitized = req.url.replace(/\/([a-zA-Z0-9]{15,})/g, "/[id]");
    console.log(`[API Request] ${req.method} ${sanitized}`);
    next();
  });

  // API Routes
  app.get("/api/health", (req, res) => {
    res.json({ status: "ok" });
  });

  // Check CPF duplicate (public endpoint, rate-limited via paymentVerifyLimiter)
  app.get("/api/registrations/check-cpf", paymentVerifyLimiter, async (req, res) => {
    const cpf = String(req.query.cpf || "").replace(/\D/g, "");
    if (cpf.length !== 11) return res.json({ duplicate: false });
    try {
      const eventConfigSnap = await adminDb.collection("settings").doc("event_config").get();
      if (eventConfigSnap.data()?.allowMultipleCpf === true) return res.json({ duplicate: false });

      const allSnap = await adminDb.collection("registrations")
        .where("cpf", "==", cpf)
        .limit(10)
        .get();

      if (allSnap.empty) return res.json({ duplicate: false });

      const docs = allSnap.docs.map(d => ({ id: d.id, ...(d.data() as any) }));

      // Prioridade: inscrição ativa bloqueia
      const active = docs.find((d: any) => d.status === "pending" || d.status === "approved");
      if (active) {
        return res.json({
          duplicate: true,
          status: active.status,
          registrationNumber: active.registrationNumber ?? null,
        });
      }

      // Cancelada/estornada: libera com prefill para re-inscrição
      const cancelled = docs
        .filter((d: any) => d.status === "cancelled" || d.status === "refunded")
        .sort((a: any, b: any) => (b.createdAt || "").localeCompare(a.createdAt || ""))[0];

      if (cancelled) {
        return res.json({
          duplicate: false,
          prefill: {
            name: cancelled.name || "",
            email: cancelled.email || "",
            phone: cancelled.phone || "",
            birthDate: cancelled.birthDate || "",
            motorcycle: cancelled.motorcycle || "",
            cep: cancelled.cep || "",
            street: cancelled.street || "",
            number: cancelled.number || "",
            neighborhood: cancelled.neighborhood || "",
            city: cancelled.city || "",
            state: cancelled.state || "",
            emergencyName: cancelled.emergencyName || "",
            emergencyPhone: cancelled.emergencyPhone || "",
            shirtSize: cancelled.shirtSize || "",
            guardianName: cancelled.guardianName || "",
            guardianCpf: cancelled.guardianCpf || "",
          },
        });
      }

      return res.json({ duplicate: false });
    } catch (err) {
      console.error("Erro check-cpf:", err);
      return res.json({ duplicate: false });
    }
  });

  // Busca de inscrição por CPF para uso no scanner de check-in (público, rate-limited)
  app.get("/api/checkin/lookup-cpf", cpfPublicLimiter, async (req, res) => {
    const cpf = String(req.query.cpf || "").replace(/\D/g, "");
    if (cpf.length !== 11) return res.json({ found: false });
    try {
      const snap = await adminDb.collection("registrations")
        .where("cpf", "==", cpf)
        .limit(5)
        .get();

      if (snap.empty) return res.json({ found: false });

      const docs = snap.docs.map(d => ({ id: d.id, ...(d.data() as any) }));

      // Aprovada tem prioridade — abre check-in diretamente
      const approved = docs.find((d: any) => d.status === "approved");
      if (approved) {
        return res.json({
          found: true,
          status: "approved",
          docId: approved.id,
          name: approved.name || "",
          registrationNumber: approved.registrationNumber || null,
        });
      }

      // Pendente — pagamento não confirmado
      const pending = docs.find((d: any) => d.status === "pending");
      if (pending) {
        return res.json({ found: true, status: "pending", name: pending.name || "" });
      }

      // Cancelada/estornada
      return res.json({ found: true, status: "cancelled" });
    } catch (err) {
      console.error("Erro lookup-cpf:", err);
      return res.json({ found: false });
    }
  });

  // Reenviar email de confirmação por CPF (público, rate-limited)
  app.post("/api/registrations/resend-confirmation", cpfPublicLimiter, async (req, res) => {
    const cpf = String(req.body?.cpf || "").replace(/\D/g, "");
    if (cpf.length !== 11) return res.status(400).json({ error: "CPF inválido." });
    try {
      const snap = await adminDb.collection("registrations")
        .where("cpf", "==", cpf)
        .where("status", "==", "approved")
        .limit(1).get();
      if (snap.empty) return res.status(404).json({ error: "Nenhuma inscrição aprovada encontrada para este CPF." });
      const docId = snap.docs[0].id;
      const reg = snap.docs[0].data();
      res.json({ success: true });
      sendEmailLogged(reg, docId, "confirmation").catch(err => console.error("Erro ao enfileirar email:", err));
    } catch (err) {
      console.error("Erro resend-confirmation:", err);
      if (!res.headersSent) return res.status(500).json({ error: "Erro interno." });
    }
  });

  // PDF comprovante por CPF (público, rate-limited)
  app.get("/api/registrations/receipt-by-cpf", cpfPublicLimiter, async (req, res) => {
    const cpf = String(req.query.cpf || "").replace(/\D/g, "");
    if (cpf.length !== 11) return res.status(400).json({ error: "CPF inválido." });
    try {
      const snap = await adminDb.collection("registrations")
        .where("cpf", "==", cpf)
        .where("status", "==", "approved")
        .limit(1).get();
      if (snap.empty) return res.status(404).json({ error: "Nenhuma inscrição aprovada encontrada." });
      const docId = snap.docs[0].id;
      const reg = snap.docs[0].data();
      const appUrl = (process.env.APP_URL || `https://${req.headers.host}`).replace(/\/$/, "");
      const pdfBuffer = await generateConfirmationPdf(reg, docId, appUrl);
      const filename = `comprovante-trilhao-${reg.registrationNumber || docId.slice(0, 6)}.pdf`;
      res.setHeader("Content-Type", "application/pdf");
      res.setHeader("Content-Disposition", `inline; filename="${filename}"`);
      return res.send(pdfBuffer);
    } catch (err) {
      console.error("Erro receipt-by-cpf:", err);
      return res.status(500).json({ error: "Erro ao gerar comprovante." });
    }
  });

  // Create Payment PIX
  app.post("/api/payments/create", paymentCreateLimiter, async (req, res) => {
    const { transaction_amount, payer } = req.body;

    const currentToken = process.env.MERCADO_PAGO_ACCESS_TOKEN;
    if (!currentToken || currentToken.length < 10 || currentToken.includes("MY_MERCADO_PAGO")) {
      return res.status(401).json({
        error: "Configuração Ausente",
        message: "O Access Token do Mercado Pago não foi configurado corretamente."
      });
    }

    const amount = Number(transaction_amount);
    if (!amount || amount <= 0 || !payer?.email || !payer?.identification?.number) {
      return res.status(400).json({
        error: "Dados inválidos",
        message: "Revise os dados da inscrição antes de gerar o PIX.",
      });
    }

    // Ler configuração do evento (preços e regras)
    let eventConfigData: Record<string, any> = {};
    try {
      const eventConfigSnap = await adminDb.collection("settings").doc("event_config").get();
      if (eventConfigSnap.exists) eventConfigData = eventConfigSnap.data() ?? {};
    } catch (err) {
      console.error("Erro ao ler event_config:", err);
    }
    const dynamicEventPrice = eventConfigData.eventPrice && eventConfigData.eventPrice > 0
      ? Number(eventConfigData.eventPrice)
      : EVENT_PRICE;
    const dynamicVoucherPrice = eventConfigData.voucherPrice != null && eventConfigData.voucherPrice >= 0
      ? Number(eventConfigData.voucherPrice)
      : VOUCHER_PRICE;

    // C3: Validar que o valor está na faixa válida (inscrição + vouchers)
    const minAmount = dynamicEventPrice;
    const maxAmount = dynamicEventPrice + MAX_VOUCHERS * dynamicVoucherPrice;
    if (amount < minAmount - 0.01 || amount > maxAmount + 0.01) {
      return res.status(400).json({
        error: "Valor inválido",
        message: `O valor da inscrição deve ser entre R$ ${minAmount.toFixed(2)} e R$ ${maxAmount.toFixed(2)}.`,
      });
    }

    // Verificar CPF duplicado — bloqueia apenas inscrições ativas (pending/approved)
    try {
      const allowMultipleCpf = eventConfigData.allowMultipleCpf === true;
      if (!allowMultipleCpf) {
        const cpfDigits = String(payer.identification.number).replace(/\D/g, "");
        const existingSnap = await adminDb.collection("registrations")
          .where("cpf", "==", cpfDigits)
          .limit(10)
          .get();
        const active = existingSnap.docs.find(d => {
          const s = d.data().status;
          return s === "pending" || s === "approved";
        });
        if (active) {
          return res.status(409).json({
            error: "cpf_duplicate",
            status: active.data().status,
            registrationNumber: active.data().registrationNumber ?? null,
          });
        }
      }
    } catch (err) {
      console.error("Erro ao verificar CPF duplicado:", err);
    }

    try {
      const payment = await createPixPayment(currentToken, {
        transaction_amount: amount,
        description: "Inscrição 8º Trilhão da Solidariedade",
        external_reference: `trilhao-${Date.now()}`,
        notification_url: getMercadoPagoNotificationUrl(),
        payer: {
          email: payer.email,
          first_name: payer.first_name,
          last_name: payer.last_name || "Participante",
          identification: {
            type: "CPF",
            number: String(payer.identification.number).replace(/\D/g, ""),
          },
        },
      });

      return res.json({
        id: payment.external_reference,
        orderId: String(payment.id),
        status: payment.status,
        point_of_interaction: payment.point_of_interaction,
      });
    } catch (error: any) {
      console.error("Erro MP Payments API:", JSON.stringify(error?.cause ?? error, null, 2));
      const rawDetail: string = error?.message || "";

      if (error?.status === 401) {
        return res.status(401).json({
          error: "Credenciais recusadas",
          message: "O Mercado Pago recusou esta operação. Verifique as credenciais de integração."
        });
      }

      if (rawDetail.includes("processing_error") || error?.status === 402) {
        return res.status(500).json({
          error: "Pagamento temporariamente indisponível",
          message: "Não foi possível gerar o PIX no momento. Por favor, tente novamente em alguns minutos ou entre em contato com a organização."
        });
      }

      return res.status(500).json({
        error: "Erro no processamento",
        message: rawDetail || "Ocorreu um erro ao gerar o PIX."
      });
    }
  });

  // Webhook Mercado Pago
  app.post("/api/webhook/mercadopago", async (req, res) => {
    // C1: Verificar assinatura HMAC do Mercado Pago
    if (!verifyMpWebhookSignature(req)) {
      console.warn("Webhook MP: assinatura inválida rejeitada");
      return res.sendStatus(401);
    }

    const { action, data, type } = req.body;
    console.log("Webhook MP recebido:", action, type);

    try {
      if (type === "order") {
        const orderId = data?.id;
        const accessToken = process.env.MERCADO_PAGO_ACCESS_TOKEN;
        if (orderId && accessToken) {
          const order = await getOrder(accessToken, orderId);
          await adminDb.collection("payment_logs").add({
            paymentId: String(orderId),
            action,
            status: order.status,
            type,
            timestamp: FieldValue.serverTimestamp(),
          });
          if (order.status === "processed") {
            const approved = await approveRegistration(adminDb, orderId, order.external_reference);
            if (approved) {
              sendEmailLogged(approved.regData, approved.docId, "confirmation").catch(console.error);
              if (approved.regData.phone) sendWhatsAppLogged(approved.regData, approved.docId).catch(console.error);
              // delete sensitive PIX data after approval
              adminDb.collection("registrations").doc(approved.docId).update({
                pixCode: FieldValue.delete(),
                copyPaste: FieldValue.delete(),
              }).catch(console.error);
            }
          }
        }
      } else if (type === "payment" || action?.startsWith("payment.")) {
        const paymentId = data?.id;
        const mpClient = getMercadoPagoClient();
        if (paymentId && mpClient) {
          const payment = new Payment(mpClient);
          const paymentInfo = await payment.get({ id: paymentId });
          await adminDb.collection("payment_logs").add({
            paymentId: String(paymentId),
            action,
            status: paymentInfo.status,
            type,
            timestamp: FieldValue.serverTimestamp(),
          });
          if (paymentInfo.status === "approved") {
            const approved = await approveRegistration(adminDb, String(paymentId), (paymentInfo as any).external_reference);
            if (approved) {
              sendEmailLogged(approved.regData, approved.docId, "confirmation").catch(console.error);
              if (approved.regData.phone) sendWhatsAppLogged(approved.regData, approved.docId).catch(console.error);
              // delete sensitive PIX data after approval
              adminDb.collection("registrations").doc(approved.docId).update({
                pixCode: FieldValue.delete(),
                copyPaste: FieldValue.delete(),
              }).catch(console.error);
            }
          }
        }
      }
    } catch (error) {
      console.error("Erro ao processar webhook MP:", error);
    }

    res.sendStatus(200);
  });

  // Verify Payment Status (Admin/Audit) — C2: requer token Firebase Admin
  app.get("/api/payments/verify/:id", paymentVerifyLimiter, async (req, res) => {
    if (!(await verifyAdminToken(req))) {
      return res.status(401).json({ error: "Não autorizado" });
    }

    const { id } = req.params;
    const accessToken = process.env.MERCADO_PAGO_ACCESS_TOKEN;

    if (!accessToken || accessToken.length < 10) {
      return res.status(500).json({ error: "Mercado Pago não configurado" });
    }

    try {
      if (id.startsWith("ORD")) {
        const order = await getOrder(accessToken, id);
        const isApproved = order.status === "processed";
        if (isApproved) await syncApproved(adminDb, id, "manual_verify", order.external_reference);
        return res.json({
          id: order.id,
          status: isApproved ? "approved" : order.status,
          status_detail: order.status_detail,
        });
      } else if (id.startsWith("trilhao-")) {
        const resp = await fetch(`https://api.mercadopago.com/v1/payments/search?external_reference=${encodeURIComponent(id)}`, {
          headers: { "Authorization": `Bearer ${accessToken}` },
        });
        const searchResult = await resp.json() as any;
        const payment = searchResult?.results?.[0];
        if (!payment) return res.status(404).json({ error: "Pagamento não encontrado" });
        if (payment.status === "approved") await syncApproved(adminDb, id, "manual_verify");
        return res.json({ id: payment.id, status: payment.status, status_detail: payment.status_detail });
      } else {
        const mpClient = getMercadoPagoClient();
        if (!mpClient) return res.status(500).json({ error: "Mercado Pago não configurado" });
        const payment = new Payment(mpClient);
        const paymentInfo = await payment.get({ id });
        if (paymentInfo.status === "approved") await syncApproved(adminDb, id, "manual_verify", (paymentInfo as any).external_reference);
        return res.json(paymentInfo);
      }
    } catch (error: any) {
      console.error("Erro ao verificar pagamento:", error);
      res.status(500).json({ error: "Erro ao consultar Mercado Pago", message: error.message });
    }
  });

  // Regenerar link PIX para inscrição pendente com PIX expirado
  app.post("/api/payments/regenerate/:docId", paymentCreateLimiter, async (req, res) => {
    const { docId } = req.params;

    const currentToken = process.env.MERCADO_PAGO_ACCESS_TOKEN;
    if (!currentToken || currentToken.length < 10 || currentToken.includes("MY_MERCADO_PAGO")) {
      return res.status(401).json({ error: "Configuração ausente" });
    }

    try {
      const regRef = adminDb.collection("registrations").doc(docId);
      const regSnap = await regRef.get();

      if (!regSnap.exists) {
        return res.status(404).json({ error: "Inscrição não encontrada." });
      }

      const reg = regSnap.data()!;

      if (reg.status !== "pending") {
        return res.status(400).json({ error: "Apenas inscrições pendentes podem ter o PIX regenerado." });
      }

      const nameParts = String(reg.name || "").trim().split(/\s+/);
      const payment = await createPixPayment(currentToken, {
        transaction_amount: reg.amount,
        description: "Inscrição 8º Trilhão da Solidariedade",
        external_reference: `trilhao-${Date.now()}`,
        notification_url: getMercadoPagoNotificationUrl(),
        payer: {
          email: reg.email,
          first_name: nameParts[0] || reg.name,
          last_name: nameParts.slice(1).join(" ") || "Participante",
          identification: { type: "CPF", number: String(reg.cpf).replace(/\D/g, "") },
        },
      });

      await regRef.update({
        paymentId: payment.external_reference,
        orderId: String(payment.id),
        pixCode: payment.point_of_interaction?.transaction_data?.qr_code_base64 || "",
        copyPaste: payment.point_of_interaction?.transaction_data?.qr_code || "",
        createdAt: new Date().toISOString(),
        pixExpiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
        updatedAt: FieldValue.serverTimestamp(),
      });

      console.log(`[regenerate] novo PIX gerado para ${docId}: ${payment.external_reference}`);
      return res.json({ success: true });
    } catch (error: any) {
      console.error("[regenerate]", error);
      return res.status(500).json({ error: "Erro ao regenerar PIX.", message: error.message });
    }
  });

  app.post("/api/payments/cancel/:id", paymentVerifyLimiter, async (req, res) => {
    const operator = await verifyAdminToken(req);
    if (!operator) {
      return res.status(401).json({ error: "Não autorizado" });
    }

    const { id } = req.params;
    const { reason } = req.body as { reason?: string };

    try {
      const regRef = adminDb.collection("registrations").doc(id);
      const regSnap = await regRef.get();

      if (!regSnap.exists) {
        return res.status(404).json({ error: "Inscrição não encontrada" });
      }

      const reg = regSnap.data()!;

      if (reg.status === "cancelled" || reg.status === "refunded") {
        return res.status(400).json({ error: "Inscrição já cancelada" });
      }

      if (reg.status === "pending") {
        const now = new Date().toISOString();
        const vouchers = ((reg.vouchers as any[]) || []).map((v: any) =>
          v.used ? v : { ...v, cancelled: true, cancelledAt: now }
        );
        await regRef.update({
          status: "cancelled",
          cancelledAt: FieldValue.serverTimestamp(),
          updatedAt: FieldValue.serverTimestamp(),
          ...(reason && { cancelReason: reason }),
          cancelOperatorEmail: operator.email,
          cancelOperatorName: operator.name,
          ...(vouchers.length && { vouchers }),
        });

        // Restaurar estoque se foi reservado no momento da inscrição pendente
        if (reg.shirtSize && reg.inventoryReserved) {
          try {
            const inventoryRef = adminDb.collection("settings").doc("shirt_inventory");
            await adminDb.runTransaction(async (tx: any) => {
              const inv = await tx.get(inventoryRef);
              const current = inv.exists ? (inv.data()?.[reg.shirtSize] ?? 0) : 0;
              tx.set(inventoryRef, { [reg.shirtSize]: current + 1 }, { merge: true });
            });
          } catch (err) {
            console.error("[cancel] Falha ao restaurar estoque:", err);
          }
        }

        return res.json({ success: true, action: "cancelled" });
      }

      // approved → refund via Mercado Pago
      const accessToken = process.env.MERCADO_PAGO_ACCESS_TOKEN;
      if (!accessToken || accessToken.length < 10) {
        return res.status(500).json({ error: "Mercado Pago não configurado" });
      }

      // Resolve numeric payment ID from order or external_reference
      let mpPaymentId: string | null = null;

      if (reg.orderId?.startsWith("ORD")) {
        try {
          const order = await getOrder(accessToken, reg.orderId);
          const rawId = order?.transactions?.payments?.[0]?.id;
          // Only accept numeric IDs — Orders API may return internal non-numeric refs
          if (rawId && /^\d+$/.test(String(rawId))) {
            mpPaymentId = String(rawId);
          } else {
            console.log(`[cancel] order ${reg.orderId} transactions:`, JSON.stringify(order?.transactions));
          }
        } catch (err) {
          console.error(`[cancel] getOrder failed for ${reg.orderId}:`, err);
        }
      }

      if (!mpPaymentId && reg.paymentId?.startsWith("trilhao-")) {
        try {
          const searchResp = await fetch(
            `https://api.mercadopago.com/v1/payments/search?external_reference=${encodeURIComponent(reg.paymentId)}&limit=1`,
            { headers: { Authorization: `Bearer ${accessToken}` } },
          );
          const searchResult = await searchResp.json() as any;
          const payment = searchResult?.results?.[0];
          if (payment?.id) {
            mpPaymentId = String(payment.id);
          } else {
            console.log(`[cancel] search by external_reference "${reg.paymentId}":`, JSON.stringify(searchResult));
          }
        } catch (err) {
          console.error("[cancel] payment search failed:", err);
        }
      }

      if (!mpPaymentId && reg.paymentId && /^\d+$/.test(String(reg.paymentId))) {
        mpPaymentId = String(reg.paymentId);
      }

      if (!mpPaymentId) {
        console.error(`[cancel] could not resolve payment ID for registration ${id}. orderId=${reg.orderId} paymentId=${reg.paymentId}`);
        return res.status(400).json({ error: "Não foi possível localizar o pagamento no Mercado Pago para realizar o estorno." });
      }

      console.log(`[cancel] calling refund for mpPaymentId=${mpPaymentId}`);
      const refundResp = await fetch(`https://api.mercadopago.com/v1/payments/${mpPaymentId}/refunds`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${accessToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({}),
      });

      const refundData = await refundResp.json() as any;

      if (!refundResp.ok) {
        console.error(`[cancel] MP refund API error (${refundResp.status}):`, JSON.stringify(refundData));
        return res.status(502).json({
          error: "Erro ao processar estorno no Mercado Pago",
          details: refundData?.message || refundData?.error || JSON.stringify(refundData),
        });
      }

      const refundNow = new Date().toISOString();
      const refundedVouchers = ((reg.vouchers as any[]) || []).map((v: any) =>
        v.used ? v : { ...v, cancelled: true, cancelledAt: refundNow }
      );
      await regRef.update({
        status: "refunded",
        refundId: String(refundData.id),
        refundedAt: FieldValue.serverTimestamp(),
        updatedAt: FieldValue.serverTimestamp(),
        ...(reason && { refundReason: reason }),
        refundOperatorEmail: operator.email,
        refundOperatorName: operator.name,
        ...(refundedVouchers.length && { vouchers: refundedVouchers }),
      });

      if (reg.shirtSize) {
        const inventoryRef = adminDb.collection("settings").doc("shirt_inventory");
        await adminDb.runTransaction(async (tx) => {
          const inv = await tx.get(inventoryRef);
          const current = inv.exists ? (inv.data()?.[reg.shirtSize] ?? 0) : 0;
          tx.set(inventoryRef, { [reg.shirtSize]: current + 1 }, { merge: true });
        });
      }

      return res.json({ success: true, action: "refunded", refundId: refundData.id });
    } catch (error: any) {
      console.error("Erro ao cancelar inscrição:", error);
      res.status(500).json({ error: "Erro ao cancelar inscrição", message: error.message });
    }
  });

  // Download do comprovante em PDF
  app.get("/api/payments/receipt/:id", async (req, res) => {
    const { id } = req.params;
    try {
      const snap = await adminDb.collection("registrations").doc(id).get();
      if (!snap.exists) return res.status(404).json({ error: "Inscrição não encontrada." });
      const reg = snap.data()!;
      if (reg.status !== "approved") return res.status(400).json({ error: "Pagamento não confirmado." });
      const appUrl = (process.env.APP_URL || `https://${req.headers.host}`).replace(/\/$/, "");
      const pdfBuffer = await generateConfirmationPdf(reg, id, appUrl);
      const filename = `comprovante-trilhao-${reg.registrationNumber || id.slice(0, 6)}.pdf`;
      res.setHeader("Content-Type", "application/pdf");
      res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
      return res.send(pdfBuffer);
    } catch (error: any) {
      console.error("[receipt]", error);
      res.status(500).json({ error: "Erro ao gerar comprovante.", message: error.message });
    }
  });

  // E-mail de inscrição pendente — chamado pelo frontend após salvar no Firestore
  app.post("/api/email/pending/:id", async (req, res) => {
    const { id } = req.params;
    try {
      const snap = await adminDb.collection("registrations").doc(id).get();
      if (!snap.exists) return res.status(404).json({ error: "Inscrição não encontrada." });
      const reg = snap.data()!;

      // Reservar estoque de camiseta (idempotente via inventoryReserved)
      if (reg.shirtSize && !reg.inventoryReserved) {
        try {
          const inventoryRef = adminDb.collection("settings").doc("shirt_inventory");
          await adminDb.runTransaction(async (tx: any) => {
            const inv = await tx.get(inventoryRef);
            const current = inv.exists ? (inv.data()?.[reg.shirtSize] ?? 0) : 0;
            tx.set(inventoryRef, { [reg.shirtSize]: Math.max(0, current - 1) }, { merge: true });
          });
          await adminDb.collection("registrations").doc(id).update({ inventoryReserved: true });
        } catch (err) {
          console.error("[email/pending] Falha ao reservar estoque:", err);
          // Nao fatal: continua com o e-mail
        }
      }

      sendEmailLogged(reg, id, "pending").catch(console.error);
      return res.json({ success: true });
    } catch (err: any) {
      console.error("[email/pending]", err);
      return res.status(500).json({ error: err.message });
    }
  });

  // Reenviar e-mail de confirmação (admin)
  app.post("/api/email/confirmation/:id", async (req, res) => {
    if (!(await verifyAdminToken(req))) {
      return res.status(401).json({ error: "Não autorizado" });
    }
    const { id } = req.params;
    try {
      const snap = await adminDb.collection("registrations").doc(id).get();
      if (!snap.exists) return res.status(404).json({ error: "Inscrição não encontrada." });
      const data = snap.data()!;
      if (data.status !== "approved") {
        return res.status(400).json({ error: "Inscrição não está aprovada." });
      }
      // Responde imediatamente e envia em segundo plano para não travar o request
      res.json({ success: true });
      console.log(`[email/confirmation] iniciando envio para ${data.email}`);
      sendEmailLogged(data, id, "confirmation")
        .then(() => console.log(`[email/confirmation] concluído para ${data.email}`))
        .catch(err => console.error("[email/confirmation] erro:", err));
    } catch (err: any) {
      console.error("[email/confirmation]", err);
      return res.status(500).json({ error: err.message });
    }
  });

  // QR Code endpoint — retorna PNG gerado on-the-fly para check-in
  app.get("/api/qrcode/:id", async (req, res) => {
    const { id } = req.params;
    const appUrl = (process.env.APP_URL || `https://${req.headers.host}`).replace(/\/$/, "");
    const checkinUrl = `${appUrl}/checkin/${id}`;
    try {
      const buffer = await QRCode.toBuffer(checkinUrl, { width: 300, margin: 2, color: { dark: "#111827", light: "#ffffff" } });
      res.setHeader("Content-Type", "image/png");
      res.setHeader("Cache-Control", "public, max-age=86400");
      res.send(buffer);
    } catch {
      res.status(500).json({ error: "Erro ao gerar QR code" });
    }
  });

  // Check-in — marca presença no evento (requer token de admin)
  app.post("/api/checkin/:id", async (req, res) => {
    const { id } = req.params;
    if (!(await verifyAdminToken(req))) {
      return res.status(401).json({ error: "Não autorizado" });
    }
    try {
      const regRef = adminDb.collection("registrations").doc(id);
      const snap = await regRef.get();
      if (!snap.exists) return res.status(404).json({ error: "Inscrição não encontrada." });
      const reg = snap.data()!;
      if (reg.status !== "approved") return res.status(400).json({ error: "Inscrição não está confirmada. Verifique o status do pagamento." });
      if (reg.checkedIn) return res.status(409).json({ error: "Check-in já realizado.", checkedInAt: reg.checkedInAt });
      await regRef.update({
        checkedIn: true,
        checkedInAt: FieldValue.serverTimestamp(),
        checkedInDevice: req.headers["user-agent"] || "",
      });
      return res.json({ success: true });
    } catch (err: any) {
      console.error("[checkin]", err);
      return res.status(500).json({ error: "Erro ao realizar check-in.", message: err.message });
    }
  });

  // Salvar assinatura do termo de responsabilidade
  app.post("/api/checkin/:id/sign", async (req, res) => {
    const { id } = req.params;
    if (!(await verifyAdminToken(req))) {
      return res.status(401).json({ error: "Não autorizado" });
    }
    const { signature, signerName } = req.body || {};
    if (!signature || typeof signature !== "string" || !signature.startsWith("data:image/")) {
      return res.status(400).json({ error: "Assinatura inválida." });
    }
    try {
      const regRef = adminDb.collection("registrations").doc(id);
      const snap = await regRef.get();
      if (!snap.exists) return res.status(404).json({ error: "Inscrição não encontrada." });
      const reg = snap.data()!;
      if (reg.status !== "approved") return res.status(400).json({ error: "Inscrição não confirmada. O pagamento precisa ser confirmado antes de assinar o termo." });
      await regRef.update({
        termsSigned: true,
        termsSignedAt: FieldValue.serverTimestamp(),
        termsSignature: signature,
        termsSignerName: signerName || reg.name || "",
        termsSignedDevice: req.headers["user-agent"] || "",
      });
      const updatedReg = {
        ...reg,
        id,
        termsSigned: true,
        termsSignature: signature,
        termsSignerName: signerName || reg.name || "",
      };
      res.json({ success: true });
      sendEmailLogged(updatedReg, id, "term").catch((err: unknown) => console.error("[sign auto-email]", err));
    } catch (err: any) {
      console.error("[sign]", err);
      return res.status(500).json({ error: "Erro ao salvar assinatura.", message: err.message });
    }
  });

  app.post("/api/checkin/:id/send-term", async (req, res) => {
    const { id } = req.params;
    if (!(await verifyAdminToken(req))) {
      return res.status(401).json({ error: "Não autorizado" });
    }
    try {
      const snap = await adminDb.collection("registrations").doc(id).get();
      if (!snap.exists) return res.status(404).json({ error: "Inscrição não encontrada." });
      const reg = { id: snap.id, ...snap.data() } as any;
      if (!reg.termsSigned) return res.status(400).json({ error: "Termo ainda não foi assinado." });
      if (!reg.email) return res.status(400).json({ error: "E-mail do participante não encontrado." });
      res.json({ success: true });
      sendEmailLogged(reg, id, "term").catch((err: unknown) => console.error("[send-term]", err));
    } catch (err: any) {
      console.error("[send-term]", err);
      return res.status(500).json({ error: "Erro ao enviar termo.", message: err.message });
    }
  });

  app.get("/api/checkin/:id/term-pdf", async (req, res) => {
    const { id } = req.params;
    if (!(await verifyAdminToken(req))) {
      return res.status(401).json({ error: "Não autorizado" });
    }
    try {
      const snap = await adminDb.collection("registrations").doc(id).get();
      if (!snap.exists) return res.status(404).json({ error: "Inscrição não encontrada." });
      const reg = { id: snap.id, ...snap.data() } as any;
      if (!reg.termsSigned) return res.status(400).json({ error: "Termo ainda não foi assinado." });
      const pdfBuffer = await generateTermPdf(reg, id);
      res.setHeader("Content-Type", "application/pdf");
      res.setHeader("Content-Disposition", `attachment; filename="Termo-${reg.registrationNumber || id}.pdf"`);
      res.send(pdfBuffer);
    } catch (err: any) {
      console.error("[term-pdf]", err);
      return res.status(500).json({ error: "Erro ao gerar PDF do termo.", message: err.message });
    }
  });

  // Usar voucher de almoço (marcar como utilizado)
  app.post("/api/voucher/:docId/:code/use", async (req, res) => {
    const { docId, code } = req.params;
    if (!(await verifyAdminToken(req))) {
      return res.status(401).json({ error: "Não autorizado" });
    }
    try {
      const regRef = adminDb.collection("registrations").doc(docId);
      const snap = await regRef.get();
      if (!snap.exists) return res.status(404).json({ error: "Inscrição não encontrada." });
      const reg = snap.data()!;
      if (reg.status !== "approved") return res.status(400).json({ error: "Inscrição não está confirmada." });
      const vouchers: any[] = reg.vouchers || [];
      const idx = vouchers.findIndex(v => v.code === code);
      if (idx === -1) return res.status(404).json({ error: "Voucher não encontrado." });
      if (vouchers[idx].cancelled) {
        return res.status(410).json({ error: "Voucher cancelado — a inscrição foi estornada." });
      }
      if (vouchers[idx].used) {
        return res.status(409).json({ error: "Voucher já foi utilizado.", usedAt: vouchers[idx].usedAt });
      }
      vouchers[idx] = { ...vouchers[idx], used: true, usedAt: new Date().toISOString() };
      await regRef.update({ vouchers });
      return res.json({ success: true, voucher: vouchers[idx] });
    } catch (err: any) {
      console.error("[voucher/use]", err);
      return res.status(500).json({ error: "Erro ao usar voucher.", message: err.message });
    }
  });

  app.post("/api/admin/heal-number/:docId", paymentVerifyLimiter, async (req, res) => {
    const operator = await verifyAdminToken(req);
    if (!operator) return res.status(401).json({ error: "Não autorizado" });
    const { docId } = req.params;
    try {
      const number = await healRegistrationNumber(adminDb, docId);
      if (number === null) return res.status(404).json({ error: "Inscrição não encontrada" });
      return res.json({ success: true, registrationNumber: number });
    } catch (err: any) {
      console.error("[heal-number]", err);
      return res.status(500).json({ error: "Erro ao atribuir número", message: err.message });
    }
  });

  // Criar inscrição paga em dinheiro no local (sem PIX) — admin only
  app.post("/api/admin/registrations/cash", paymentVerifyLimiter, async (req, res) => {
    const operator = await verifyAdminToken(req);
    if (!operator) return res.status(401).json({ error: "Não autorizado" });

    const {
      name, cpf, phone, email, birthDate,
      guardianName, guardianCpf,
      emergencyName, emergencyPhone,
      city, state, motorcycle, shirtSize,
      voucherNames, amount,
    } = req.body as Record<string, any>;

    const cpfDigits = String(cpf || "").replace(/\D/g, "");
    const phoneDigits = String(phone || "").replace(/\D/g, "");
    const emergencyPhoneDigits = String(emergencyPhone || "").replace(/\D/g, "");

    if (!name?.trim() || cpfDigits.length !== 11 || !phoneDigits || !birthDate || !emergencyName?.trim() || !emergencyPhoneDigits) {
      return res.status(400).json({ error: "Preencha todos os campos obrigatórios (nome, CPF, telefone, nascimento e contato de emergência)." });
    }

    const shirtSizeInput: string = typeof shirtSize === "string" ? shirtSize : "";

    // Camiseta só é obrigatória se houver algum tamanho disponível em estoque
    let inventoryData: Record<string, number> = {};
    try {
      const inventorySnap = await adminDb.collection("settings").doc("shirt_inventory").get();
      inventoryData = inventorySnap.exists ? (inventorySnap.data() as Record<string, number>) ?? {} : {};
    } catch (err) {
      console.error("Erro ao ler estoque de camisetas (dinheiro):", err);
    }
    const allSizesUnavailable = SHIRT_SIZES.every(s => (inventoryData[s] ?? 0) <= 0);
    if (!allSizesUnavailable) {
      if (!shirtSizeInput) {
        return res.status(400).json({ error: "Selecione o tamanho da camiseta." });
      }
      if ((inventoryData[shirtSizeInput] ?? 0) <= 0) {
        return res.status(400).json({ error: "O tamanho selecionado não está mais disponível. Escolha outro." });
      }
    }

    const birth = new Date(birthDate);
    const today = new Date();
    let age = today.getFullYear() - birth.getFullYear();
    const m = today.getMonth() - birth.getMonth();
    if (m < 0 || (m === 0 && today.getDate() < birth.getDate())) age--;
    const isMinor = age < 18;
    const guardianCpfDigits = String(guardianCpf || "").replace(/\D/g, "");
    if (isMinor && (!guardianName?.trim() || guardianCpfDigits.length !== 11)) {
      return res.status(400).json({ error: "Menor de idade requer nome e CPF do responsável." });
    }

    const vNames: string[] = Array.isArray(voucherNames) ? voucherNames.filter((n: any) => typeof n === "string" && n.trim()) : [];
    if (vNames.length > MAX_VOUCHERS) {
      return res.status(400).json({ error: `Máximo de ${MAX_VOUCHERS} vouchers.` });
    }

    const totalAmount = Number(amount);
    if (!totalAmount || totalAmount <= 0) {
      return res.status(400).json({ error: "Informe o valor recebido." });
    }

    // Verificar CPF duplicado — bloqueia apenas inscrições ativas (pending/approved)
    try {
      const eventConfigSnap = await adminDb.collection("settings").doc("event_config").get();
      const allowMultipleCpf = eventConfigSnap.data()?.allowMultipleCpf === true;
      if (!allowMultipleCpf) {
        const existingSnap = await adminDb.collection("registrations").where("cpf", "==", cpfDigits).limit(10).get();
        const active = existingSnap.docs.find(d => {
          const s = d.data().status;
          return s === "pending" || s === "approved";
        });
        if (active) {
          return res.status(409).json({
            error: "cpf_duplicate",
            status: active.data().status,
            registrationNumber: active.data().registrationNumber ?? null,
          });
        }
      }
    } catch (err) {
      console.error("Erro ao verificar CPF duplicado (dinheiro):", err);
    }

    try {
      const regsRef = adminDb.collection("registrations");
      const newRegRef = regsRef.doc();
      const counterRef = adminDb.collection("settings").doc("registration_counter");

      let registrationNumber = "";
      await adminDb.runTransaction(async (tx) => {
        const counterSnap = await tx.get(counterRef);
        const last = counterSnap.exists ? (counterSnap.data()?.lastNumber ?? 0) : 0;
        const next = last + 1;
        registrationNumber = String(next).padStart(4, "0");
        tx.set(counterRef, { lastNumber: next });

        tx.set(newRegRef, {
          name: name.trim(),
          cpf: cpfDigits,
          phone: phoneDigits,
          email: email?.trim() || "",
          birthDate,
          guardianName: isMinor ? guardianName.trim() : "",
          guardianCpf: isMinor ? guardianCpfDigits : "",
          emergencyName: emergencyName.trim(),
          emergencyPhone: emergencyPhoneDigits,
          city: city?.trim() || "",
          state: state?.trim() || "",
          motorcycle: motorcycle?.trim() || "",
          shirtSize: shirtSizeInput,
          amount: totalAmount,
          status: "approved",
          paymentMethod: "cash",
          cashOperatorEmail: operator.email,
          cashOperatorName: operator.name,
          registrationNumber,
          vouchers: vNames.map((vname, i) => ({
            code: `${newRegRef.id.slice(0, 6).toUpperCase()}-V${String(i + 1).padStart(2, "0")}`,
            name: vname.trim(),
            used: false,
          })),
          createdAt: new Date().toISOString(),
          confirmedAt: FieldValue.serverTimestamp(),
        });
      });

      if (shirtSizeInput) {
        const inventoryRef = adminDb.collection("settings").doc("shirt_inventory");
        await adminDb.runTransaction(async (tx) => {
          const inv = await tx.get(inventoryRef);
          const current = inv.exists ? (inv.data()?.[shirtSizeInput] ?? 0) : 0;
          tx.set(inventoryRef, { [shirtSizeInput]: Math.max(0, current - 1) }, { merge: true });
        });
      }

      const regForNotify = { name: name.trim(), email: email?.trim() || "", phone: phoneDigits, shirtSize: shirtSizeInput, registrationNumber };
      if (regForNotify.email) sendEmailLogged(regForNotify, newRegRef.id, "confirmation").catch(console.error);
      sendWhatsAppLogged(regForNotify, newRegRef.id).catch(console.error);

      console.log(`[registrations/cash] ${newRegRef.id} criada por ${operator.email} — #${registrationNumber} — R$ ${totalAmount}`);
      return res.json({ success: true, docId: newRegRef.id, registrationNumber });
    } catch (err: any) {
      console.error("[registrations/cash]", err);
      return res.status(500).json({ error: "Erro ao criar inscrição em dinheiro.", message: err.message });
    }
  });

  // ── WhatsApp Meta endpoints ────────────────────────────────────────────────

  // Status da integração Meta (admin)
  app.get("/api/whatsapp/status", async (req, res) => {
    if (!(await verifyAdminToken(req))) {
      return res.status(401).json({ error: "Não autorizado" });
    }
    return res.json(getMetaWhatsAppConfigStatus());
  });

  // Webhook Meta — verificação (GET)
  app.get("/api/whatsapp/webhook", (req, res) => {
    const mode = req.query["hub.mode"];
    const token = req.query["hub.verify_token"];
    const challenge = req.query["hub.challenge"];
    const verifyToken = process.env.WHATSAPP_WEBHOOK_VERIFY_TOKEN;

    if (!verifyToken) {
      console.warn("[WA Meta] WHATSAPP_WEBHOOK_VERIFY_TOKEN não configurado.");
      return res.sendStatus(403);
    }
    if (mode === "subscribe" && token === verifyToken) {
      console.log("[WA Meta] Webhook verificado com sucesso.");
      return res.status(200).send(String(challenge));
    }
    return res.sendStatus(403);
  });

  // Webhook Meta — eventos (POST)
  app.post("/api/whatsapp/webhook", (req, res) => {
    // Validação de assinatura com META_APP_SECRET
    const appSecret = process.env.META_APP_SECRET;
    if (appSecret) {
      const signature = req.headers["x-hub-signature-256"] as string | undefined;
      if (!signature) {
        console.warn("[WA Meta] Webhook sem assinatura x-hub-signature-256. Rejeitado.");
        return res.sendStatus(401);
      }
      const rawBody = (req as any).rawBody ?? JSON.stringify(req.body);
      const expected = `sha256=${createHmac("sha256", appSecret).update(rawBody).digest("hex")}`;
      try {
        if (!timingSafeEqual(Buffer.from(signature), Buffer.from(expected))) {
          console.warn("[WA Meta] Assinatura do webhook inválida.");
          return res.sendStatus(401);
        }
      } catch {
        return res.sendStatus(401);
      }
    } else if (process.env.NODE_ENV === "production") {
      console.warn("[WA Meta] META_APP_SECRET não configurado. Validação de assinatura desativada.");
    }

    // Processar evento
    const body = req.body;
    try {
      const entry = body?.entry?.[0];
      const changes = entry?.changes?.[0];
      const value = changes?.value;

      // Status updates (entrega, leitura, falha)
      if (value?.statuses?.length) {
        for (const s of value.statuses) {
          console.log(`[WA Meta] Status: id=${s.id} status=${s.status} to=${s.recipient_id}`);
          // Atualizar metaMessageId correspondente na fila se necessário
          if (adminDb && (s.status === "delivered" || s.status === "read" || s.status === "failed")) {
            adminDb
              .collection("message_queue")
              .where("metaMessageId", "==", s.id)
              .limit(1)
              .get()
              .then((snap: any) => {
                if (!snap.empty) {
                  const update: Record<string, any> = { [`metaStatus_${s.status}`]: new Date().toISOString() };
                  if (s.status === "failed") update.error = `Meta delivery failed: ${JSON.stringify(s.errors ?? {})}`;
                  snap.docs[0].ref.update(update).catch(console.error);
                }
              })
              .catch(console.error);
          }
        }
      }

      // Mensagens recebidas (não processamos respostas automaticamente por ora)
      if (value?.messages?.length) {
        for (const m of value.messages) {
          console.log(`[WA Meta] Mensagem recebida de ${m.from}: tipo=${m.type}`);
        }
      }
    } catch (err) {
      console.error("[WA Meta] Erro ao processar evento do webhook:", err);
    }

    return res.sendStatus(200);
  });

  app.post("/api/messages/:id/retry", async (req, res) => {
    if (!(await verifyAdminToken(req))) {
      return res.status(401).json({ error: "Não autorizado" });
    }
    await retryMessage(req.params.id);
    return res.json({ success: true });
  });

  app.post("/api/admin/campanha/whatsapp", async (req, res) => {
    if (!(await verifyAdminToken(req))) {
      return res.status(401).json({ error: "Não autorizado" });
    }
    const { contacts, templateName, templateParam2 } = req.body as {
      contacts: Array<{ nome: string; telefone: string }>;
      templateName: string;
      templateParam2: string;
    };
    if (!Array.isArray(contacts) || !templateName) {
      return res.status(400).json({ error: "Parâmetros inválidos" });
    }
    const normalized = contacts
      .filter(c => c.nome && c.telefone)
      .map(c => {
        const digits = c.telefone.replace(/\D/g, "");
        const tel = digits.startsWith("55") && digits.length >= 12 ? digits : `55${digits}`;
        const firstName = c.nome.trim().split(" ")[0];
        return {
          to: tel,
          name: c.nome.trim(),
          templateName,
          templateParams: [firstName, templateParam2],
        };
      })
      .filter(c => c.to.length >= 12);

    const count = await enqueueCampaignBatch(normalized);
    console.log(`[campanha] ${count} mensagens enfileiradas por ${req.headers.authorization ? "admin" : "?"}`);
    return res.json({ success: true, enqueued: count });
  });

  // Fallback para rotas de API não encontradas - garante resposta JSON
  app.all("/api/*", (req, res) => {
    console.warn(`404 na API: ${req.method} ${req.originalUrl}`);
    res.status(404).json({ 
      error: "Rota de API não encontrada",
      path: req.originalUrl,
      method: req.method
    });
  });

  // Vite middleware for development
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), "dist");
    app.use(express.static(distPath));
    app.get("*", (req, res) => {
      res.sendFile(path.join(distPath, "index.html"));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Servidor rodando em http://localhost:${PORT}`);
    initEmailWorker(adminDb).catch((e) => console.error("[email] Falha ao iniciar worker:", e));
    startReminderWorker();
  });
}

startServer();

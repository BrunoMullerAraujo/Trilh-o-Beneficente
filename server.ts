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
import { approveRegistration, syncApproved } from "./api/_lib/registrations";
import { generateConfirmationPdf } from "./api/_lib/pdf";
import { initWhatsApp, initEmailWorker, getWhatsAppStatus, disconnectWhatsApp, reconnectFresh, enqueueMessage, enqueueWhatsAppMessage, buildConfirmationMessage, retryMessage } from "./api/_lib/whatsapp";
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

const EMAIL_SUBJECTS: Record<string, string> = {
  confirmation: "Confirmação de inscrição",
  pending: "Inscrição pendente",
  term: "Termo de responsabilidade",
};

async function sendEmailLogged(reg: any, docId: string, type: "confirmation" | "pending" | "term") {
  await enqueueMessage({
    channel: "email",
    to: reg.email,
    name: reg.name || "—",
    subject: EMAIL_SUBJECTS[type],
    emailType: type,
    registrationId: docId,
  });
}

async function sendWhatsAppLogged(reg: any, docId?: string) {
  if (!reg.phone) return;
  await enqueueMessage({
    channel: "whatsapp",
    to: reg.phone,
    name: reg.name || "—",
    subject: "WhatsApp",
    message: buildConfirmationMessage(reg),
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

async function verifyAdminToken(req: express.Request): Promise<boolean> {
  const authHeader = req.headers.authorization;
  if (!authHeader?.startsWith("Bearer ")) return false;
  const idToken = authHeader.slice(7);
  try {
    const decoded = await adminAuth.verifyIdToken(idToken);
    if (decoded.email === ADMIN_EMAIL) return true;
    const adminDoc = await adminDb.collection("admins").doc(decoded.uid).get();
    return adminDoc.exists;
  } catch {
    return false;
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
  app.use(express.json());

  const paymentCreateLimiter = rateLimit({ windowMs: 60_000, max: 5, standardHeaders: true, legacyHeaders: false, message: { error: "Muitas tentativas. Aguarde 1 minuto." } });
  const paymentVerifyLimiter = rateLimit({ windowMs: 60_000, max: 20, standardHeaders: true, legacyHeaders: false, message: { error: "Muitas tentativas. Aguarde 1 minuto." } });

  // Logging middleware for API
  app.use("/api", (req, res, next) => {
    console.log(`[API Request] ${req.method} ${req.url}`);
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
      const snap = await adminDb.collection("registrations").where("cpf", "==", cpf).limit(1).get();
      if (snap.empty) return res.json({ duplicate: false });
      const d = snap.docs[0];
      const data = d.data();
      return res.json({
        duplicate: true,
        existingId: d.id,
        existingData: {
          status: data.status,
          registrationNumber: data.registrationNumber ?? null,
          name: data.name,
          amount: data.amount,
        },
      });
    } catch (err) {
      console.error("Erro check-cpf:", err);
      return res.json({ duplicate: false });
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

    // C3: Validar que o valor está na faixa válida (inscrição + vouchers)
    const minAmount = EVENT_PRICE;
    const maxAmount = EVENT_PRICE + MAX_VOUCHERS * VOUCHER_PRICE;
    if (amount < minAmount - 0.01 || amount > maxAmount + 0.01) {
      return res.status(400).json({
        error: "Valor inválido",
        message: `O valor da inscrição deve ser entre R$ ${minAmount.toFixed(2)} e R$ ${maxAmount.toFixed(2)}.`,
      });
    }

    // Verificar CPF duplicado (Admin SDK ignora regras de segurança)
    try {
      const eventConfigSnap = await adminDb.collection("settings").doc("event_config").get();
      const allowMultipleCpf = eventConfigSnap.data()?.allowMultipleCpf === true;
      if (!allowMultipleCpf) {
        const cpfDigits = String(payer.identification.number).replace(/\D/g, "");
        const existingSnap = await adminDb.collection("registrations")
          .where("cpf", "==", cpfDigits)
          .limit(1)
          .get();
        if (!existingSnap.empty) {
          const d = existingSnap.docs[0];
          const data = d.data();
          return res.status(409).json({
            error: "cpf_duplicate",
            existingId: d.id,
            existingData: {
              status: data.status,
              registrationNumber: data.registrationNumber ?? null,
              name: data.name,
              amount: data.amount,
            },
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

  app.post("/api/payments/cancel/:id", paymentVerifyLimiter, async (req, res) => {
    if (!(await verifyAdminToken(req))) {
      return res.status(401).json({ error: "Não autorizado" });
    }

    const { id } = req.params;
    const { reason, operatorCpf } = req.body as { reason?: string; operatorCpf?: string };

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
        await regRef.update({
          status: "cancelled",
          cancelledAt: FieldValue.serverTimestamp(),
          updatedAt: FieldValue.serverTimestamp(),
          ...(reason && { cancelReason: reason }),
          ...(operatorCpf && { cancelOperatorCpf: operatorCpf }),
        });
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

      await regRef.update({
        status: "refunded",
        refundId: String(refundData.id),
        refundedAt: FieldValue.serverTimestamp(),
        updatedAt: FieldValue.serverTimestamp(),
        ...(reason && { refundReason: reason }),
        ...(operatorCpf && { refundOperatorCpf: operatorCpf }),
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
      sendEmailLogged(snap.data()!, id, "pending").catch(console.error);
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

  // Check-in — marca presença no evento (sem autenticação, docId é o token)
  app.post("/api/checkin/:id", async (req, res) => {
    const { id } = req.params;
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

  // Usar voucher de almoço (marcar como utilizado)
  app.post("/api/voucher/:docId/:code/use", async (req, res) => {
    const { docId, code } = req.params;
    try {
      const regRef = adminDb.collection("registrations").doc(docId);
      const snap = await regRef.get();
      if (!snap.exists) return res.status(404).json({ error: "Inscrição não encontrada." });
      const reg = snap.data()!;
      if (reg.status !== "approved") return res.status(400).json({ error: "Inscrição não está confirmada." });
      const vouchers: any[] = reg.vouchers || [];
      const idx = vouchers.findIndex(v => v.code === code);
      if (idx === -1) return res.status(404).json({ error: "Voucher não encontrado." });
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

  // WhatsApp endpoints
  app.get("/api/whatsapp/status", async (req, res) => {
    try {
      const token = req.headers.authorization?.replace("Bearer ", "");
      if (!token) return res.status(401).json({ error: "Não autorizado." });
      await adminAuth.verifyIdToken(token);
      return res.json(getWhatsAppStatus());
    } catch {
      return res.status(401).json({ error: "Token inválido." });
    }
  });

  app.post("/api/whatsapp/disconnect", async (req, res) => {
    try {
      const token = req.headers.authorization?.replace("Bearer ", "");
      if (!token) return res.status(401).json({ error: "Não autorizado." });
      await adminAuth.verifyIdToken(token);
      await disconnectWhatsApp();
      return res.json({ success: true });
    } catch {
      return res.status(401).json({ error: "Token inválido." });
    }
  });

  app.post("/api/whatsapp/reconnect", async (req, res) => {
    try {
      const token = req.headers.authorization?.replace("Bearer ", "");
      if (!token) return res.status(401).json({ error: "Não autorizado." });
      await adminAuth.verifyIdToken(token);
      await reconnectFresh();
      return res.json({ success: true });
    } catch {
      return res.status(401).json({ error: "Token inválido." });
    }
  });

  app.post("/api/messages/:id/retry", async (req, res) => {
    try {
      const token = req.headers.authorization?.replace("Bearer ", "");
      if (!token) return res.status(401).json({ error: "Não autorizado." });
      await adminAuth.verifyIdToken(token);
      await retryMessage(req.params.id);
      return res.json({ success: true });
    } catch {
      return res.status(401).json({ error: "Token inválido." });
    }
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
    initWhatsApp(adminDb).catch((e) => console.error("[WA] Falha ao iniciar:", e));
    initEmailWorker(adminDb).catch((e) => console.error("[email] Falha ao iniciar worker:", e));
  });
}

startServer();

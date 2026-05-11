import express from "express";
import cors from "cors";
import crypto from "crypto";
import path from "path";
import "dotenv/config";
import { fileURLToPath } from "url";
import { createServer as createViteServer } from "vite";
import { MercadoPagoConfig, Payment } from "mercadopago";
import admin from "firebase-admin";
import { getFirestore } from "firebase-admin/firestore";
import firebaseConfig from "./firebase-applet-config.json";
import { DEFAULT_EVENT_CONFIG, EventConfig, REGISTRATION_STATUS, isAllowedRegistrationAmount } from "./src/types";

// Initialize Firebase Admin
const adminApp = admin.apps[0] ?? admin.initializeApp({
  projectId: firebaseConfig.projectId,
});
const adminDb = getFirestore(adminApp, firebaseConfig.firestoreDatabaseId);

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

type PaymentCreateRequest = {
  transaction_amount?: unknown;
  description?: unknown;
  payer?: {
    email?: unknown;
    first_name?: unknown;
    last_name?: unknown;
    identification?: {
      type?: unknown;
      number?: unknown;
    };
  };
};

type ValidatedPaymentCreateRequest = {
  transactionAmount: number;
  description: string;
  payer: {
    email: string;
    firstName: string;
    lastName: string;
    cpf: string;
  };
};

type RegistrationCreateRequest = {
  name?: unknown;
  email?: unknown;
  phone?: unknown;
  cpf?: unknown;
  amount?: unknown;
  termsAccepted?: unknown;
};

type ValidatedRegistrationCreateRequest = {
  name: string;
  email: string;
  phone: string;
  cpf: string;
  amount: number;
  firstName: string;
  lastName: string;
};

class ValidationError extends Error {
  constructor(public readonly details: string[]) {
    super("Dados de pagamento invalidos.");
  }
}

function onlyDigits(value: unknown) {
  return String(value ?? "").replace(/\D/g, "");
}

function isValidEmail(value: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

function splitFullName(name: string) {
  const parts = name.split(/\s+/).filter(Boolean);
  return {
    firstName: parts[0] ?? "",
    lastName: parts.slice(1).join(" "),
  };
}

function isValidCpf(cpf: string) {
  if (!/^\d{11}$/.test(cpf) || /^(\d)\1{10}$/.test(cpf)) return false;

  const digits = cpf.split("").map(Number);
  const calculateDigit = (factor: number) => {
    const total = digits
      .slice(0, factor - 1)
      .reduce((sum, digit, index) => sum + digit * (factor - index), 0);
    const remainder = (total * 10) % 11;
    return remainder === 10 ? 0 : remainder;
  };

  return calculateDigit(10) === digits[9] && calculateDigit(11) === digits[10];
}

function validatePaymentCreateRequest(body: PaymentCreateRequest): ValidatedPaymentCreateRequest {
  const details: string[] = [];
  const transactionAmount = Number(body.transaction_amount);
  const description = typeof body.description === "string" ? body.description.trim() : "";
  const payer = body.payer ?? {};
  const email = typeof payer.email === "string" ? payer.email.trim().toLowerCase() : "";
  const firstName = typeof payer.first_name === "string" ? payer.first_name.trim() : "";
  const lastName = typeof payer.last_name === "string" ? payer.last_name.trim() : "";
  const cpf = onlyDigits(payer.identification?.number);
  const documentType = typeof payer.identification?.type === "string"
    ? payer.identification.type.trim().toUpperCase()
    : "CPF";

  if (!Number.isFinite(transactionAmount) || !isAllowedRegistrationAmount(transactionAmount)) {
    details.push("Valor da inscricao deve ser uma das cotas permitidas: R$ 30, R$ 50 ou R$ 100.");
  }

  if (!description || description.length > 120) {
    details.push("Descricao do pagamento e obrigatoria e deve ter ate 120 caracteres.");
  }

  if (!email || !isValidEmail(email)) {
    details.push("E-mail do pagador e obrigatorio e deve ser valido.");
  }

  if (!firstName) {
    details.push("Nome do pagador e obrigatorio.");
  }

  if (!lastName) {
    details.push("Sobrenome do pagador e obrigatorio.");
  }

  if (documentType !== "CPF") {
    details.push("Documento do pagador deve ser CPF.");
  }

  if (!isValidCpf(cpf)) {
    details.push("CPF do pagador e obrigatorio e deve ser valido.");
  }

  if (details.length > 0) {
    throw new ValidationError(details);
  }

  return {
    transactionAmount,
    description,
    payer: {
      email,
      firstName,
      lastName,
      cpf,
    },
  };
}

function normalizeEventConfig(data: Partial<EventConfig> | undefined): EventConfig {
  const allowedAmounts = Array.isArray(data?.allowedAmounts)
    ? data.allowedAmounts.map(Number).filter(amount => Number.isFinite(amount) && amount > 0)
    : DEFAULT_EVENT_CONFIG.allowedAmounts;

  return {
    ...DEFAULT_EVENT_CONFIG,
    ...data,
    targetAmount: Number(data?.targetAmount) || DEFAULT_EVENT_CONFIG.targetAmount,
    allowedAmounts: allowedAmounts.length > 0 ? allowedAmounts : DEFAULT_EVENT_CONFIG.allowedAmounts,
    active: data?.active !== false,
  };
}

async function getMainEventConfig() {
  const snap = await adminDb.collection("events").doc("main").get();
  return normalizeEventConfig(snap.exists ? snap.data() as Partial<EventConfig> : undefined);
}

function validateRegistrationCreateRequest(body: RegistrationCreateRequest, eventConfig: EventConfig): ValidatedRegistrationCreateRequest {
  const details: string[] = [];
  const name = typeof body.name === "string" ? body.name.trim().replace(/\s+/g, " ") : "";
  const email = typeof body.email === "string" ? body.email.trim().toLowerCase() : "";
  const phone = onlyDigits(body.phone);
  const cpf = onlyDigits(body.cpf);
  const amount = Number(body.amount);
  const { firstName, lastName } = splitFullName(name);

  if (!name || name.length > 120 || !firstName || !lastName) {
    details.push("Nome completo e obrigatorio e deve ter nome e sobrenome.");
  }

  if (!email || !isValidEmail(email)) {
    details.push("E-mail e obrigatorio e deve ser valido.");
  }

  if (!phone || !/^\d{10,11}$/.test(phone)) {
    details.push("WhatsApp e obrigatorio e deve ter DDD e 10 ou 11 digitos.");
  }

  if (!isValidCpf(cpf)) {
    details.push("CPF e obrigatorio e deve ser valido.");
  }

  if (!eventConfig.active) {
    details.push("Inscricoes indisponiveis para este evento.");
  }

  if (!Number.isFinite(amount) || !isAllowedRegistrationAmount(amount, eventConfig.allowedAmounts)) {
    details.push(`Valor da inscricao deve ser uma das cotas permitidas: ${eventConfig.allowedAmounts.map(value => `R$ ${value}`).join(", ")}.`);
  }

  if (body.termsAccepted !== true) {
    details.push("Aceite dos termos e obrigatorio.");
  }

  if (details.length > 0) {
    throw new ValidationError(details);
  }

  return {
    name,
    email,
    phone,
    cpf,
    amount,
    firstName,
    lastName,
  };
}

function getMercadoPagoNotificationUrl() {
  return process.env.APP_URL && !process.env.APP_URL.includes("MY_APP_URL")
    ? `${process.env.APP_URL}/api/webhook/mercadopago`
    : undefined;
}

function getHeaderValue(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value;
}

function parseMercadoPagoSignature(signature: string) {
  return signature.split(",").reduce<Record<string, string>>((acc, part) => {
    const [key, value] = part.split("=", 2);
    if (key && value) acc[key.trim()] = value.trim();
    return acc;
  }, {});
}

function constantTimeEquals(left: string, right: string) {
  const leftBuffer = Buffer.from(left, "hex");
  const rightBuffer = Buffer.from(right, "hex");
  return leftBuffer.length === rightBuffer.length && crypto.timingSafeEqual(leftBuffer, rightBuffer);
}

function validateMercadoPagoWebhookSignature(req: express.Request, paymentId: string) {
  const secret = process.env.MERCADO_PAGO_WEBHOOK_SECRET;

  if (!secret || secret.includes("MY_MERCADO_PAGO")) {
    console.warn("MERCADO_PAGO_WEBHOOK_SECRET ausente; webhook sera validado pela consulta ao pagamento.");
    return true;
  }

  const xSignature = getHeaderValue(req.headers["x-signature"]);
  const xRequestId = getHeaderValue(req.headers["x-request-id"]);
  const dataId = String(req.query["data.id"] ?? paymentId);

  if (!xSignature || !xRequestId || !dataId) {
    return false;
  }

  const signatureParts = parseMercadoPagoSignature(xSignature);
  const timestamp = signatureParts.ts;
  const receivedHash = signatureParts.v1;

  if (!timestamp || !receivedHash) {
    return false;
  }

  const manifest = `id:${dataId};request-id:${xRequestId};ts:${timestamp};`;
  const expectedHash = crypto.createHmac("sha256", secret).update(manifest).digest("hex");
  return constantTimeEquals(expectedHash, receivedHash);
}

function getPaymentIdFromWebhook(req: express.Request) {
  const body = req.body ?? {};
  const queryPaymentId = req.query["data.id"] ?? req.query.id;
  const bodyPaymentId = body?.data?.id;

  if (queryPaymentId) return String(Array.isArray(queryPaymentId) ? queryPaymentId[0] : queryPaymentId);
  if (body.type === "payment" || body.action === "payment.created" || body.action === "payment.updated") {
    return bodyPaymentId ? String(bodyPaymentId) : null;
  }

  return null;
}

function shouldCancelRegistration(paymentStatus: unknown) {
  return ["cancelled", "rejected", "refunded", "charged_back", "expired"].includes(String(paymentStatus));
}

async function addPaymentLog(data: Record<string, unknown>) {
  await adminDb.collection("payment_logs").add({
    ...data,
    timestamp: admin.firestore.FieldValue.serverTimestamp(),
  });
}

async function startServer() {
  const app = express();
  const PORT = Number(process.env.PORT) || 3000;

  app.use(cors());
  app.use(express.json());

  // Mercado Pago Setup - Check at startup
  const mpToken = process.env.MERCADO_PAGO_ACCESS_TOKEN;
  let mpClient: MercadoPagoConfig | null = null;
  
  if (mpToken && mpToken.length > 10 && !mpToken.includes("MY_MERCADO_PAGO")) {
    mpClient = new MercadoPagoConfig({ accessToken: mpToken });
    console.log("✅ Mercado Pago configurado com sucesso.");
  } else {
    console.warn("⚠️ ALERTA: MERCADO_PAGO_ACCESS_TOKEN não detectado ou inválido em Settings > Secrets.");
  }

  // API Routes
  app.get("/api/health", (req, res) => {
    res.json({ status: "ok" });
  });

  app.get("/api/config/status", (req, res) => {
    const appUrl = process.env.APP_URL;
    const webhookSecret = process.env.MERCADO_PAGO_WEBHOOK_SECRET;

    res.json({
      mercadoPagoConfigured: Boolean(mpClient),
      webhookSecretConfigured: Boolean(webhookSecret && !webhookSecret.includes("MY_MERCADO_PAGO")),
      appUrlConfigured: Boolean(appUrl && !appUrl.includes("MY_APP_URL")),
    });
  });

  // Create registration and payment PIX
  app.post("/api/registrations/create", async (req, res) => {
    let registrationRef: admin.firestore.DocumentReference | null = null;

    try {
      const eventConfig = await getMainEventConfig();
      const validated = validateRegistrationCreateRequest(req.body, eventConfig);

      if (!mpClient) {
        throw new Error("MERCADO_PAGO_ACCESS_TOKEN não está configurado ou é inválido. Vá em Settings > Secrets e adicione a chave.");
      }

      registrationRef = adminDb.collection("registrations").doc();

      await registrationRef.set({
        name: validated.name,
        email: validated.email,
        phone: validated.phone,
        cpf: validated.cpf,
        amount: validated.amount,
        termsAccepted: true,
        status: REGISTRATION_STATUS.PENDING,
        paymentId: null,
        pixCode: "",
        copyPaste: "",
        createdAt: new Date().toISOString(),
        createdAtServer: admin.firestore.FieldValue.serverTimestamp(),
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      });

      const payment = new Payment(mpClient);
      const result = await payment.create({
        body: {
          transaction_amount: validated.amount,
          description: eventConfig.title,
          payment_method_id: "pix",
          payer: {
            email: validated.email,
            first_name: validated.firstName,
            last_name: validated.lastName,
            identification: {
              type: "CPF",
              number: validated.cpf,
            },
          },
          installments: 1,
          notification_url: getMercadoPagoNotificationUrl(),
          external_reference: registrationRef.id,
        },
      });

      if (!result.id) {
        throw new Error("Mercado Pago nao retornou o ID do pagamento.");
      }

      const pixCode = result.point_of_interaction?.transaction_data?.qr_code_base64 || "";
      const copyPaste = result.point_of_interaction?.transaction_data?.qr_code || "";
      const paymentId = String(result.id);

      await registrationRef.update({
        paymentId,
        pixCode,
        copyPaste,
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      });

      res.status(201).json({
        registrationId: registrationRef.id,
        paymentId,
        pixCode,
        copyPaste,
        status: REGISTRATION_STATUS.PENDING,
      });
    } catch (error: any) {
      if (error instanceof ValidationError) {
        return res.status(400).json({
          error: "Dados invalidos",
          message: "Revise os dados da inscricao antes de gerar o PIX.",
          details: error.details,
        });
      }

      if (registrationRef) {
        await registrationRef.update({
          status: REGISTRATION_STATUS.CANCELLED,
          paymentCreationFailed: true,
          paymentError: error?.message || "Erro ao gerar PIX.",
          updatedAt: admin.firestore.FieldValue.serverTimestamp(),
        });
      }

      console.error("Erro ao criar inscricao:", error?.message || error);

      if (error?.status === 401 || error?.message?.toLowerCase().includes("unauthorized") || error?.message?.includes("configurado")) {
        return res.status(401).json({
          error: "Não autorizado",
          message: error.message.includes("configurado") ? error.message : "Access Token do Mercado Pago inválido ou expirado. Verifique em Settings > Secrets.",
        });
      }

      res.status(500).json({
        error: "Erro no processamento",
        message: error?.message || "Ocorreu um erro ao criar a inscricao.",
      });
    }
  });

  // Create Payment PIX
  app.post("/api/payments/create", async (req, res) => {
    try {
      const validated = validatePaymentCreateRequest(req.body);

      if (!mpClient) {
        throw new Error("MERCADO_PAGO_ACCESS_TOKEN não está configurado ou é inválido. Vá em Settings > Secrets e adicione a chave.");
      }

      const payment = new Payment(mpClient);
      
      // Validação da URL de notificação para evitar erro 400 em ambiente de dev
      const notificationUrl = getMercadoPagoNotificationUrl();

      const result = await payment.create({
        body: {
          transaction_amount: validated.transactionAmount,
          description: validated.description,
          payment_method_id: "pix",
          payer: {
            email: validated.payer.email,
            first_name: validated.payer.firstName,
            last_name: validated.payer.lastName,
            identification: {
              type: "CPF",
              number: validated.payer.cpf,
            },
          },
          installments: 1,
          notification_url: notificationUrl,
        },
      });

      res.json(result);
    } catch (error: any) {
      if (error instanceof ValidationError) {
        return res.status(400).json({
          error: "Dados invalidos",
          message: "Revise os dados da inscricao antes de gerar o PIX.",
          details: error.details,
        });
      }

      console.error("Erro detalhado MP:", error?.message || error);
      
      // Se o erro for de autenticação (Token inválido ou ausente)
      if (error?.status === 401 || error?.message?.toLowerCase().includes("unauthorized") || error?.message?.includes("configurado")) {
        return res.status(401).json({ 
          error: "Não autorizado",
          message: error.message.includes("configurado") ? error.message : "Access Token do Mercado Pago inválido ou expirado. Verifique em Settings > Secrets." 
        });
      }

      res.status(500).json({ 
        error: "Erro no processamento",
        message: error?.message || "Ocorreu um erro ao gerar o PIX. Verifique se o Access Token foi inserido corretamente em Settings > Secrets."
      });
    }
  });

  // Webhook Mercado Pago
  app.post("/api/webhook/mercadopago", async (req, res) => {
    const { action, data, type } = req.body;
    console.log("Webhook MP recebido:", action, data, type);

    const paymentId = getPaymentIdFromWebhook(req);

    if (!paymentId) {
      await addPaymentLog({
        action,
        type,
        status: "invalid_payload",
        reason: "missing_payment_id",
        rawNotification: JSON.stringify(req.body),
      });
      return res.status(400).json({ error: "paymentId ausente na notificacao" });
    }

    if (!validateMercadoPagoWebhookSignature(req, paymentId)) {
      await addPaymentLog({
        paymentId,
        action,
        type,
        status: "invalid_signature",
        requestId: getHeaderValue(req.headers["x-request-id"]) ?? null,
      });
      return res.status(401).json({ error: "Assinatura invalida" });
    }

    if (!mpClient) {
      await addPaymentLog({
        paymentId,
        action,
        type,
        status: "mp_not_configured",
      });
      return res.status(500).json({ error: "Mercado Pago nao configurado" });
    }

    try {
      const payment = new Payment(mpClient);
      const paymentInfo = await payment.get({ id: paymentId });
      const regsRef = adminDb.collection("registrations");
      const externalReference = typeof paymentInfo.external_reference === "string" ? paymentInfo.external_reference : "";
      const registrationSnap = externalReference
        ? await regsRef.doc(externalReference).get()
        : null;
      const fallbackQuery = registrationSnap?.exists
        ? null
        : await regsRef.where("paymentId", "==", String(paymentId)).limit(1).get();
      const registrationDoc = registrationSnap?.exists
        ? registrationSnap
        : fallbackQuery && !fallbackQuery.empty
        ? fallbackQuery.docs[0]
        : null;

      await addPaymentLog({
        paymentId: String(paymentId),
        action,
        status: paymentInfo.status,
        type,
        externalReference: externalReference || null,
        registrationId: registrationDoc?.id ?? null,
        amount: paymentInfo.transaction_amount ?? null,
        raw: JSON.stringify(paymentInfo),
      });

      if (!registrationDoc) {
        console.warn(`Pagamento ${paymentId} sem inscricao vinculada.`);
        return res.sendStatus(200);
      }

      const regDoc = registrationDoc.data();
      const paidAmount = Number(paymentInfo.transaction_amount);
      const expectedAmount = Number(regDoc.amount);
      const valueMatches = Number.isFinite(paidAmount) && paidAmount === expectedAmount;
      const referenceMatches = !externalReference || externalReference === registrationDoc.id;
      const paymentIdMatches = String(regDoc.paymentId) === String(paymentId);

      if (!valueMatches || !referenceMatches || !paymentIdMatches) {
        await addPaymentLog({
          paymentId: String(paymentId),
          action,
          type,
          status: "registration_mismatch",
          registrationId: registrationDoc.id,
          expectedAmount,
          paidAmount,
          externalReference: externalReference || null,
          referenceMatches,
          paymentIdMatches,
        });
        console.warn(`Pagamento ${paymentId} nao confere com a inscricao ${registrationDoc.id}.`);
        return res.sendStatus(200);
      }

      if (paymentInfo.status === REGISTRATION_STATUS.APPROVED && regDoc.status !== REGISTRATION_STATUS.APPROVED) {
        await regsRef.doc(registrationDoc.id).update({
          status: REGISTRATION_STATUS.APPROVED,
          confirmedAt: admin.firestore.FieldValue.serverTimestamp(),
          updatedAt: admin.firestore.FieldValue.serverTimestamp(),
          lastPaymentStatus: paymentInfo.status,
          syncSource: "mercadopago_webhook",
        });
        console.log(`Inscricao ${registrationDoc.id} marcada como paga.`);
      } else if (shouldCancelRegistration(paymentInfo.status) && regDoc.status !== REGISTRATION_STATUS.APPROVED) {
        await regsRef.doc(registrationDoc.id).update({
          status: REGISTRATION_STATUS.CANCELLED,
          updatedAt: admin.firestore.FieldValue.serverTimestamp(),
          lastPaymentStatus: paymentInfo.status,
          syncSource: "mercadopago_webhook",
        });
      } else {
        await regsRef.doc(registrationDoc.id).update({
          updatedAt: admin.firestore.FieldValue.serverTimestamp(),
          lastPaymentStatus: paymentInfo.status,
          syncSource: "mercadopago_webhook",
        });
      }
    } catch (error: any) {
      await addPaymentLog({
        paymentId,
        action,
        type,
        status: "processing_error",
        message: error?.message || "Erro desconhecido",
      });
      console.error("Erro ao processar webhook MP:", error);
    }

    res.sendStatus(200);
  });

  // Verify Payment Status (Admin/Audit)
  app.get("/api/payments/verify/:id", async (req, res) => {
    const { id } = req.params;
    if (!mpClient) return res.status(500).json({ error: "Mercado Pago não configurado" });

    try {
      const payment = new Payment(mpClient);
      const paymentInfo = await payment.get({ id });
      
      // Se estiver aprovado no MP mas pendente no nosso banco, podemos sincronizar
      if (paymentInfo.status === REGISTRATION_STATUS.APPROVED) {
        const regsRef = adminDb.collection("registrations");
        const q = await regsRef.where("paymentId", "==", String(id)).limit(1).get();

        if (!q.empty) {
          const registrationDoc = q.docs[0];
          const regDoc = registrationDoc.data();
          const paidAmount = Number(paymentInfo.transaction_amount);
          const expectedAmount = Number(regDoc.amount);

          if (paidAmount !== expectedAmount) {
            await addPaymentLog({
              paymentId: String(id),
              status: "manual_verify_amount_mismatch",
              registrationId: registrationDoc.id,
              expectedAmount,
              paidAmount,
            });
            return res.status(409).json({
              error: "Valor divergente",
              message: "Pagamento aprovado no Mercado Pago, mas o valor nao confere com a inscricao.",
              paymentInfo,
            });
          }

          if (regDoc.status !== REGISTRATION_STATUS.APPROVED) {
            await regsRef.doc(registrationDoc.id).update({
              status: REGISTRATION_STATUS.APPROVED,
              confirmedAt: admin.firestore.FieldValue.serverTimestamp(),
              updatedAt: admin.firestore.FieldValue.serverTimestamp(),
              lastPaymentStatus: paymentInfo.status,
              syncSource: "manual_verify",
            });
          }
        }
      }

      res.json(paymentInfo);
    } catch (error: any) {
      console.error("Erro ao verificar pagamento:", error);
      res.status(500).json({ error: "Erro ao consultar Mercado Pago", message: error.message });
    }
  });

  // Fallback para rotas de API não encontradas - garante resposta JSON
  app.use("/api/*", (req, res) => {
    console.warn(`404 na API: ${req.method} ${req.originalUrl}`);
    res.status(404).json({ error: "Rota de API não encontrada" });
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
  });
}

startServer();

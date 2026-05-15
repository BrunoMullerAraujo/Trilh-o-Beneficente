import express from "express";
import cors from "cors";
import path from "path";
import "dotenv/config";
import { fileURLToPath } from "url";
import { createServer as createViteServer } from "vite";
import { MercadoPagoConfig, Payment } from "mercadopago";
import { randomUUID } from "crypto";
import admin from "firebase-admin";
import { FieldValue, getFirestore } from "firebase-admin/firestore";
import firebaseConfig from "./firebase-applet-config.json";

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

function getMercadoPagoClient() {
  const accessToken = process.env.MERCADO_PAGO_ACCESS_TOKEN;

  if (!accessToken || accessToken.length < 10 || accessToken.includes("MY_MERCADO_PAGO")) {
    return null;
  }

  return new MercadoPagoConfig({ accessToken });
}

const MP_API_BASE = "https://api.mercadopago.com";

async function createOrder(accessToken: string, body: object): Promise<any> {
  const resp = await fetch(`${MP_API_BASE}/v1/orders`, {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${accessToken}`,
      "Content-Type": "application/json",
      "X-Idempotency-Key": randomUUID(),
    },
    body: JSON.stringify(body),
  });
  const json = await resp.json();
  if (!resp.ok) {
    const err = new Error(json?.message || `Orders API error ${resp.status}`) as any;
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
    const err = new Error(json?.message || `Orders API error ${resp.status}`) as any;
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
  const PORT = Number(process.env.PORT) || 3000;

  app.use(cors());
  app.use(express.json());

  // Logging middleware for API
  app.use("/api", (req, res, next) => {
    console.log(`[API Request] ${req.method} ${req.url}`);
    next();
  });

  // API Routes
  app.get("/api/health", (req, res) => {
    res.json({ status: "ok" });
  });

  // Create Payment PIX (Orders API)
  app.post("/api/payments/create", async (req, res) => {
    const { transaction_amount, description, payer } = req.body;

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

    try {
      const order = await createOrder(currentToken, {
        type: "online",
        total_amount: amount.toFixed(2),
        external_reference: `trilhao-${Date.now()}`,
        processing_mode: "automatic",
        transactions: {
          payments: [{
            amount: amount.toFixed(2),
            payment_method: { id: "pix", type: "bank_transfer" },
          }],
        },
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

      const pixPayment = order.transactions?.payments?.[0];

      return res.json({
        id: order.id,
        status: order.status,
        point_of_interaction: {
          transaction_data: {
            qr_code_base64: pixPayment?.payment_method?.qr_code_base64 || "",
            qr_code: pixPayment?.payment_method?.qr_code || "",
            ticket_url: pixPayment?.payment_method?.ticket_url || "",
          },
        },
      });
    } catch (error: any) {
      console.error("Erro MP Orders API:", JSON.stringify(error?.cause ?? error, null, 2));
      const mpMessage = error?.cause?.message || error?.message;

      if (error?.status === 401) {
        return res.status(401).json({
          error: "Credenciais recusadas",
          message: `O Mercado Pago recusou esta operação. Detalhe: ${mpMessage || "sem detalhe retornado"}.`
        });
      }

      return res.status(500).json({
        error: "Erro no processamento",
        message: mpMessage || "Ocorreu um erro ao gerar o PIX."
      });
    }
  });

  // Webhook Mercado Pago
  app.post("/api/webhook/mercadopago", async (req, res) => {
    const { action, data, type } = req.body;
    console.log("Webhook MP recebido:", action, data, type);

    const approveRegistration = async (paymentId: string) => {
      const regsRef = adminDb.collection("registrations");
      const q = await regsRef.where("paymentId", "==", String(paymentId)).get();
      if (!q.empty && q.docs[0].data().status !== "approved") {
        await regsRef.doc(q.docs[0].id).update({
          status: "approved",
          confirmedAt: FieldValue.serverTimestamp(),
          updatedAt: FieldValue.serverTimestamp(),
        });
        console.log(`Inscrição ${q.docs[0].id} marcada como paga via paymentId=${paymentId}`);
      }
    };

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
            raw: JSON.stringify(order),
          });
          if (order.status === "processed") {
            await approveRegistration(orderId);
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
            raw: JSON.stringify(paymentInfo),
          });
          if (paymentInfo.status === "approved") {
            await approveRegistration(paymentId);
          }
        }
      }
    } catch (error) {
      console.error("Erro ao processar webhook MP:", error);
    }

    res.sendStatus(200);
  });

  // Verify Payment Status (Admin/Audit)
  app.get("/api/payments/verify/:id", async (req, res) => {
    const { id } = req.params;
    const accessToken = process.env.MERCADO_PAGO_ACCESS_TOKEN;

    if (!accessToken || accessToken.length < 10) {
      return res.status(500).json({ error: "Mercado Pago não configurado" });
    }

    const syncApproved = async (paymentId: string) => {
      const regsRef = adminDb.collection("registrations");
      const q = await regsRef.where("paymentId", "==", String(paymentId)).get();
      if (!q.empty && q.docs[0].data().status !== "approved") {
        await regsRef.doc(q.docs[0].id).update({
          status: "approved",
          confirmedAt: FieldValue.serverTimestamp(),
          updatedAt: FieldValue.serverTimestamp(),
          syncSource: "manual_verify",
        });
      }
    };

    try {
      if (id.startsWith("ORD")) {
        const order = await getOrder(accessToken, id);
        const isApproved = order.status === "processed";
        if (isApproved) await syncApproved(id);
        return res.json({
          id: order.id,
          status: isApproved ? "approved" : order.status,
          status_detail: order.status_detail,
        });
      } else {
        const mpClient = getMercadoPagoClient();
        if (!mpClient) return res.status(500).json({ error: "Mercado Pago não configurado" });
        const payment = new Payment(mpClient);
        const paymentInfo = await payment.get({ id });
        if (paymentInfo.status === "approved") await syncApproved(id);
        return res.json(paymentInfo);
      }
    } catch (error: any) {
      console.error("Erro ao verificar pagamento:", error);
      res.status(500).json({ error: "Erro ao consultar Mercado Pago", message: error.message });
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
  });
}

startServer();

import express from "express";
import cors from "cors";
import path from "path";
import "dotenv/config";
import { fileURLToPath } from "url";
import { createServer as createViteServer } from "vite";
import { MercadoPagoConfig, Payment } from "mercadopago";
import admin from "firebase-admin";
import { FieldValue, getFirestore } from "firebase-admin/firestore";
import firebaseConfig from "./firebase-applet-config.json";

// Initialize Firebase Admin
if (!admin.apps.length) {
  admin.initializeApp({
    projectId: firebaseConfig.projectId,
  });
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

async function createPixOrder({
  accessToken,
  amount,
  payerEmail,
}: {
  accessToken: string;
  amount: number;
  payerEmail: string;
}) {
  const formattedAmount = amount.toFixed(2);
  const response = await fetch("https://api.mercadopago.com/v1/orders", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
      "X-Idempotency-Key": `pix-${Date.now()}-${Math.random().toString(16).slice(2)}`,
    },
    body: JSON.stringify({
      type: "online",
      external_reference: `trilho-${Date.now()}`,
      total_amount: formattedAmount,
      payer: {
        email: payerEmail || "test@testuser.com",
        first_name: "APRO",
      },
      transactions: {
        payments: [
          {
            amount: formattedAmount,
            payment_method: {
              id: "pix",
              type: "bank_transfer",
            },
          },
        ],
      },
    }),
  });

  const orderData = await response.json();

  if (!response.ok) {
    throw {
      status: response.status,
      message: orderData?.message || orderData?.error || "Erro ao criar order Pix no Mercado Pago.",
      cause: orderData?.cause,
      raw: orderData,
    };
  }

  const payment = orderData?.transactions?.payments?.[0] || {};
  const paymentMethod = payment?.payment_method || {};

  return {
    id: payment.id || orderData.id,
    orderId: orderData.id,
    status: payment.status || orderData.status,
    point_of_interaction: {
      transaction_data: {
        qr_code_base64: paymentMethod.qr_code_base64 || "",
        qr_code: paymentMethod.qr_code || "",
        ticket_url: paymentMethod.ticket_url || "",
      },
    },
    raw: orderData,
  };
}

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function startServer() {
  const app = express();
  const PORT = 3000;

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

  // Create Payment PIX
  app.post("/api/payments/create", async (req, res) => {
    const { transaction_amount, description, payer } = req.body;

    try {
      const currentToken = process.env.MERCADO_PAGO_ACCESS_TOKEN;
      
      if (!currentToken || currentToken.length < 10 || currentToken.includes("MY_MERCADO_PAGO")) {
        return res.status(401).json({ 
          error: "Configuração Ausente", 
          message: "O Access Token do Mercado Pago não foi configurado corretamente em Settings > Secrets. Certifique-se de que a chave MERCADO_PAGO_ACCESS_TOKEN foi adicionada." 
        });
      }

      const result = await createPixOrder({
        accessToken: currentToken,
        amount: Number(transaction_amount),
        payerEmail: payer.email,
      });
      return res.json(result);

      const client = new MercadoPagoConfig({ accessToken: currentToken });
      const payment = new Payment(client);
      
      // Validação da URL de notificação para evitar erro 400 em ambiente de dev
      const notificationUrl = getMercadoPagoNotificationUrl();

      const legacyResult = await payment.create({
        body: {
          transaction_amount: Number(transaction_amount),
          description,
          payment_method_id: "pix",
          payer: {
            email: payer.email,
            first_name: payer.first_name,
            last_name: payer.last_name,
            identification: {
              type: "CPF",
              number: payer.identification.number,
            },
          },
          installments: 1,
          notification_url: notificationUrl,
        },
      });

      res.json(legacyResult);
    } catch (error: any) {
      console.error("Erro detalhado MP:", JSON.stringify(error, null, 2));
      const mpMessage = error?.cause?.[0]?.description || error?.message;
      if (error?.status === 401 || error?.message?.toLowerCase().includes("unauthorized")) {
        return res.status(401).json({
          error: "Credenciais recusadas",
          message: `O Mercado Pago recusou esta operacao. Detalhe: ${mpMessage || "sem detalhe retornado"}. Confira se o Access Token pertence ao vendedor de teste e se a inscricao usa um comprador de teste diferente.`
        });
      }
      
      // Se o erro for de autenticação (Token inválido ou ausente)
      if (error?.status === 401 || error?.message?.toLowerCase().includes("unauthorized") || error?.message?.includes("configurado")) {
        return res.status(401).json({ 
          error: "Credenciais Inválidas",
          message: "O Access Token do Mercado Pago parece ser inválido ou expirou. Verifique se você copiou o 'Access Token' (não a Public Key) no painel de desenvolvedor do Mercado Pago e adicionou como MERCADO_PAGO_ACCESS_TOKEN em Settings > Secrets." 
        });
      }

      res.status(500).json({ 
        error: "Erro no processamento",
        message: error?.message || "Ocorreu um erro ao gerar o PIX. Verifique a chave MERCADO_PAGO_ACCESS_TOKEN em Settings > Secrets."
      });
    }
  });

  // Webhook Mercado Pago
  app.post("/api/webhook/mercadopago", async (req, res) => {
    const { action, data, type } = req.body;
    console.log("Webhook MP recebido:", action, data, type);

    // Identificar se é uma notificação de pagamento
    const paymentId = type === "payment" ? data.id : (action === "payment.created" || action === "payment.updated" ? data.id : null);

    const mpClient = getMercadoPagoClient();

    if (paymentId && mpClient) {
      try {
        const payment = new Payment(mpClient);
        const paymentInfo = await payment.get({ id: paymentId });

        // Registrar Log de Auditoria
        await adminDb.collection("payment_logs").add({
          paymentId: String(paymentId),
          action,
          status: paymentInfo.status,
          type,
          timestamp: FieldValue.serverTimestamp(),
          raw: JSON.stringify(paymentInfo)
        });

        if (paymentInfo.status === "approved") {
          console.log(`Pagamento ${paymentId} aprovado! Atualizando Firestore...`);
          
          const regsRef = adminDb.collection("registrations");
          const q = await regsRef.where("paymentId", "==", String(paymentId)).get();

          if (!q.empty) {
            const docId = q.docs[0].id;
            const regDoc = q.docs[0].data();
            
            // Só atualiza se ainda não estiver aprovado para evitar duplicidade de logs/ações
            if (regDoc.status !== "approved") {
              await regsRef.doc(docId).update({
                status: "approved",
                confirmedAt: FieldValue.serverTimestamp(),
                updatedAt: FieldValue.serverTimestamp()
              });
              console.log(`Inscrição ${docId} marcada como paga.`);
            }
          }
        }
      } catch (error) {
        console.error("Erro ao processar webhook MP:", error);
      }
    }

    res.sendStatus(200);
  });

  // Verify Payment Status (Admin/Audit)
  app.get("/api/payments/verify/:id", async (req, res) => {
    const { id } = req.params;
    const mpClient = getMercadoPagoClient();

    if (!mpClient) return res.status(500).json({ error: "Mercado Pago não configurado" });

    try {
      const payment = new Payment(mpClient);
      const paymentInfo = await payment.get({ id });
      
      // Se estiver aprovado no MP mas pendente no nosso banco, podemos sincronizar
      if (paymentInfo.status === "approved") {
        const regsRef = adminDb.collection("registrations");
        const q = await regsRef.where("paymentId", "==", String(id)).get();

        if (!q.empty && q.docs[0].data().status !== "approved") {
          await regsRef.doc(q.docs[0].id).update({
            status: "approved",
            confirmedAt: FieldValue.serverTimestamp(),
            updatedAt: FieldValue.serverTimestamp(),
            syncSource: "manual_verify"
          });
        }
      }

      res.json(paymentInfo);
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

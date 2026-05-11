import express from "express";
import cors from "cors";
import path from "path";
import { fileURLToPath } from "url";
import { createServer as createViteServer } from "vite";
import { MercadoPagoConfig, Payment } from "mercadopago";
import admin from "firebase-admin";

// Initialize Firebase Admin
if (!admin.apps.length) {
  admin.initializeApp();
}
const adminDb = admin.firestore();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function startServer() {
  const app = express();
  const PORT = 3000;

  app.use(cors());
  app.use(express.json());

  // Mercado Pago Setup
  const mpClient = process.env.MERCADO_PAGO_ACCESS_TOKEN 
    ? new MercadoPagoConfig({ accessToken: process.env.MERCADO_PAGO_ACCESS_TOKEN })
    : null;

  // API Routes
  app.get("/api/health", (req, res) => {
    res.json({ status: "ok" });
  });

  // Create Payment PIX
  app.post("/api/payments/create", async (req, res) => {
    if (!mpClient) {
      return res.status(500).json({ error: "Mercado Pago não configurado" });
    }

    const { transaction_amount, description, payer } = req.body;

    try {
      const payment = new Payment(mpClient);
      const result = await payment.create({
        body: {
          transaction_amount,
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
          notification_url: `${process.env.APP_URL}/api/webhook/mercadopago`,
        },
      });

      res.json(result);
    } catch (error) {
      console.error("Erro ao criar pagamento MP:", error);
      res.status(500).json({ error: "Erro ao processar pagamento" });
    }
  });

  // Webhook Mercado Pago
  app.post("/api/webhook/mercadopago", async (req, res) => {
    const { action, data, type } = req.body;
    console.log("Webhook MP recebido:", action, data, type);

    // Identificar se é uma notificação de pagamento
    const paymentId = type === "payment" ? data.id : (action === "payment.created" || action === "payment.updated" ? data.id : null);

    if (paymentId && mpClient) {
      try {
        const payment = new Payment(mpClient);
        const paymentInfo = await payment.get({ id: paymentId });

        if (paymentInfo.status === "approved") {
          console.log(`Pagamento ${paymentId} aprovado! Atualizando Firestore...`);
          
          // Buscar a inscrição pelo paymentId
          const regsRef = adminDb.collection("registrations");
          const q = await regsRef.where("paymentId", "==", String(paymentId)).get();

          if (!q.empty) {
            const docId = q.docs[0].id;
            await regsRef.doc(docId).update({
              status: "approved",
              updatedAt: admin.firestore.FieldValue.serverTimestamp()
            });
            console.log(`Inscrição ${docId} marcada como paga.`);
          } else {
            console.warn(`Nenhuma inscrição encontrada para o pagamento ${paymentId}`);
          }
        }
      } catch (error) {
        console.error("Erro ao processar webhook MP:", error);
      }
    }

    res.sendStatus(200);
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

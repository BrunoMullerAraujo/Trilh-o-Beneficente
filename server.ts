import express from "express";
import cors from "cors";
import path from "path";
import "dotenv/config";
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

  // Create Payment PIX
  app.post("/api/payments/create", async (req, res) => {
    const { transaction_amount, description, payer } = req.body;

    try {
      if (!mpClient) {
        throw new Error("MERCADO_PAGO_ACCESS_TOKEN não está configurado ou é inválido. Vá em Settings > Secrets e adicione a chave.");
      }

      const payment = new Payment(mpClient);
      
      // Validação da URL de notificação para evitar erro 400 em ambiente de dev
      const notificationUrl = process.env.APP_URL && !process.env.APP_URL.includes("MY_APP_URL") 
        ? `${process.env.APP_URL}/api/webhook/mercadopago` 
        : undefined;

      const result = await payment.create({
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

      res.json(result);
    } catch (error: any) {
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

    // Identificar se é uma notificação de pagamento
    const paymentId = type === "payment" ? data.id : (action === "payment.created" || action === "payment.updated" ? data.id : null);

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
          timestamp: admin.firestore.FieldValue.serverTimestamp(),
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
                confirmedAt: admin.firestore.FieldValue.serverTimestamp(),
                updatedAt: admin.firestore.FieldValue.serverTimestamp()
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
            confirmedAt: admin.firestore.FieldValue.serverTimestamp(),
            updatedAt: admin.firestore.FieldValue.serverTimestamp(),
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

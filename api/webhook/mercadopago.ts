import { createHmac, timingSafeEqual } from "crypto";
import { FieldValue } from "firebase-admin/firestore";
import { Payment } from "mercadopago";
import { getAdminDb } from "../_lib/firebase-admin";
import { handleOptions, readBody, sendJson } from "../_lib/http";
import { getMercadoPagoClient, getMercadoPagoAccessToken, getOrder } from "../_lib/mercadopago";
import { approveRegistration } from "../_lib/registrations";

function verifyMpWebhookSignature(req: any): boolean {
  const secret = process.env.WEBHOOK_SECRET;
  if (!secret) return true;

  const xSignature: string = req.headers["x-signature"] ?? "";
  const xRequestId: string = req.headers["x-request-id"] ?? "";
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
  const manifest = `id:${dataId};request-id:${xRequestId};ts:${ts}`;
  const expected = createHmac("sha256", secret).update(manifest).digest("hex");
  try {
    return timingSafeEqual(Buffer.from(v1, "hex"), Buffer.from(expected, "hex"));
  } catch {
    return false;
  }
}


export default async function handler(req: any, res: any) {
  if (handleOptions(req, res)) return;

  if (req.method !== "POST") {
    return sendJson(res, 405, { error: "Método não permitido" });
  }

  if (!verifyMpWebhookSignature(req)) {
    console.warn("Webhook MP: assinatura inválida rejeitada");
    return sendJson(res, 401, { error: "Assinatura inválida" });
  }

  const { action, data, type } = readBody(req);
  console.log("Webhook MP recebido:", action, type);

  const adminDb = getAdminDb();

  try {
    if (type === "order") {
      // Orders API notification — data.id is the Order ID
      const orderId = data?.id;
      const accessToken = getMercadoPagoAccessToken();

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
          await approveRegistration(adminDb, orderId, order.external_reference);
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
          await approveRegistration(adminDb, paymentId, (paymentInfo as any).external_reference);
        }
      }
    }
  } catch (error) {
    console.error("Erro ao processar webhook MP:", error);
  }

  return sendJson(res, 200, { ok: true });
}

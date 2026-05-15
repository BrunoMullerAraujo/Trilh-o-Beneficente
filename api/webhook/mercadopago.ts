import { FieldValue } from "firebase-admin/firestore";
import { Payment } from "mercadopago";
import { getAdminDb } from "../_lib/firebase-admin";
import { handleOptions, readBody, sendJson } from "../_lib/http";
import { getMercadoPagoClient, getMercadoPagoAccessToken, getOrder } from "../_lib/mercadopago";

async function approveRegistration(adminDb: any, paymentId: string, externalRef?: string) {
  const regsRef = adminDb.collection("registrations");
  let q = await regsRef.where("paymentId", "==", String(paymentId)).get();
  if (q.empty && externalRef) {
    q = await regsRef.where("paymentId", "==", externalRef).get();
  }
  if (!q.empty && q.docs[0].data().status !== "approved") {
    const regData = q.docs[0].data();
    await regsRef.doc(q.docs[0].id).update({
      status: "approved",
      confirmedAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp(),
    });
    if (regData.shirtSize) {
      const inventoryRef = adminDb.collection("settings").doc("shirt_inventory");
      await adminDb.runTransaction(async (tx: any) => {
        const inv = await tx.get(inventoryRef);
        const current = inv.exists ? (inv.data()?.[regData.shirtSize] ?? 0) : 0;
        tx.set(inventoryRef, { [regData.shirtSize]: Math.max(0, current - 1) }, { merge: true });
      });
    }
    console.log(`Inscrição ${q.docs[0].id} marcada como paga via paymentId=${paymentId} externalRef=${externalRef}`);
  }
}

export default async function handler(req: any, res: any) {
  if (handleOptions(req, res)) return;

  if (req.method !== "POST") {
    return sendJson(res, 405, { error: "Método não permitido" });
  }

  const { action, data, type } = readBody(req);
  console.log("Webhook MP recebido:", action, data, type);

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
          raw: JSON.stringify(order),
        });

        if (order.status === "processed") {
          await approveRegistration(adminDb, orderId, order.external_reference);
        }
      }
    } else if (type === "payment" || action?.startsWith("payment.")) {
      // Legacy Payments API notification — handles existing registrations
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
          await approveRegistration(adminDb, paymentId, (paymentInfo as any).external_reference);
        }
      }
    }
  } catch (error) {
    console.error("Erro ao processar webhook MP:", error);
  }

  return sendJson(res, 200, { ok: true });
}

import { FieldValue } from "firebase-admin/firestore";
import { Payment } from "mercadopago";
import { getAdminDb } from "../../_lib/firebase-admin";
import { handleOptions, sendJson } from "../../_lib/http";
import { getMercadoPagoClient, getMercadoPagoAccessToken, getOrder } from "../../_lib/mercadopago";

async function syncApproved(paymentId: string, source: string, externalRef?: string) {
  const adminDb = getAdminDb();
  const regsRef = adminDb.collection("registrations");
  let q = await regsRef.where("paymentId", "==", String(paymentId)).get();
  if (q.empty && externalRef) {
    q = await regsRef.where("paymentId", "==", externalRef).get();
  }
  if (!q.empty && q.docs[0].data().status !== "approved") {
    await regsRef.doc(q.docs[0].id).update({
      status: "approved",
      confirmedAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp(),
      syncSource: source,
    });
  }
}

export default async function handler(req: any, res: any) {
  if (handleOptions(req, res)) return;

  if (req.method !== "GET") {
    return sendJson(res, 405, { error: "Método não permitido" });
  }

  const id = req.query?.id;
  const paymentId = Array.isArray(id) ? id[0] : id;

  if (!paymentId) {
    return sendJson(res, 400, { error: "ID do pagamento ausente" });
  }

  const accessToken = getMercadoPagoAccessToken();
  if (!accessToken) {
    return sendJson(res, 500, { error: "Mercado Pago não configurado" });
  }

  try {
    if (paymentId.startsWith("ORD")) {
      const order = await getOrder(accessToken, paymentId);
      const isApproved = order.status === "processed";
      if (isApproved) await syncApproved(paymentId, "manual_verify", order.external_reference);
      return sendJson(res, 200, {
        id: order.id,
        status: isApproved ? "approved" : order.status,
        status_detail: order.status_detail,
      });
    } else if (paymentId.startsWith("trilhao-")) {
      // external_reference ID — search payments by external_reference
      const resp = await fetch(`https://api.mercadopago.com/v1/payments/search?external_reference=${encodeURIComponent(paymentId)}`, {
        headers: { "Authorization": `Bearer ${accessToken}` },
      });
      const searchResult = await resp.json() as any;
      const payment = searchResult?.results?.[0];
      if (!payment) return sendJson(res, 404, { error: "Pagamento não encontrado" });
      if (payment.status === "approved") await syncApproved(paymentId, "manual_verify");
      return sendJson(res, 200, { id: payment.id, status: payment.status, status_detail: payment.status_detail });
    } else {
      const mpClient = getMercadoPagoClient();
      if (!mpClient) return sendJson(res, 500, { error: "Mercado Pago não configurado" });
      const payment = new Payment(mpClient);
      const paymentInfo = await payment.get({ id: paymentId });
      if (paymentInfo.status === "approved") {
        await syncApproved(paymentId, "manual_verify", (paymentInfo as any).external_reference);
      }
      return sendJson(res, 200, paymentInfo);
    }
  } catch (error: any) {
    console.error("Erro ao verificar pagamento:", error);
    return sendJson(res, 500, {
      error: "Erro ao consultar Mercado Pago",
      message: error.message,
    });
  }
}

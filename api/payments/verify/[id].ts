import { Payment } from "mercadopago";
import { getAdminDb, getAdminAuth } from "../../_lib/firebase-admin";
import { handleOptions, sendJson } from "../../_lib/http";
import { getMercadoPagoClient, getMercadoPagoAccessToken, getOrder } from "../../_lib/mercadopago";
import { syncApproved } from "../../_lib/registrations";

async function verifyAdminToken(req: any): Promise<boolean> {
  const authHeader: string = req.headers?.authorization ?? "";
  if (!authHeader.startsWith("Bearer ")) return false;
  const idToken = authHeader.slice(7);
  try {
    const adminAuth = getAdminAuth();
    const adminDb = getAdminDb();
    const decoded = await adminAuth.verifyIdToken(idToken);
    const adminEmail = process.env.ADMIN_EMAIL || "bwk.bruno@gmail.com";
    if (decoded.email === adminEmail) return true;
    const adminDoc = await adminDb.collection("admins").doc(decoded.uid).get();
    return adminDoc.exists;
  } catch {
    return false;
  }
}


export default async function handler(req: any, res: any) {
  if (handleOptions(req, res)) return;

  if (req.method !== "GET") {
    return sendJson(res, 405, { error: "Método não permitido" });
  }

  // C2: Requer token Firebase de admin
  if (!(await verifyAdminToken(req))) {
    return sendJson(res, 401, { error: "Não autorizado" });
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

  const adminDb = getAdminDb();

  try {
    if (paymentId.startsWith("ORD")) {
      const order = await getOrder(accessToken, paymentId);
      const isApproved = order.status === "processed";
      if (isApproved) await syncApproved(adminDb, paymentId, "manual_verify", order.external_reference);
      return sendJson(res, 200, {
        id: order.id,
        status: isApproved ? "approved" : order.status,
        status_detail: order.status_detail,
      });
    } else if (paymentId.startsWith("trilhao-")) {
      const resp = await fetch(`https://api.mercadopago.com/v1/payments/search?external_reference=${encodeURIComponent(paymentId)}`, {
        headers: { "Authorization": `Bearer ${accessToken}` },
      });
      const searchResult = await resp.json() as any;
      const payment = searchResult?.results?.[0];
      if (!payment) return sendJson(res, 404, { error: "Pagamento não encontrado" });
      if (payment.status === "approved") await syncApproved(adminDb, paymentId, "manual_verify");
      return sendJson(res, 200, { id: payment.id, status: payment.status, status_detail: payment.status_detail });
    } else {
      const mpClient = getMercadoPagoClient();
      if (!mpClient) return sendJson(res, 500, { error: "Mercado Pago não configurado" });
      const payment = new Payment(mpClient);
      const paymentInfo = await payment.get({ id: paymentId });
      if (paymentInfo.status === "approved") {
        await syncApproved(adminDb, paymentId, "manual_verify", (paymentInfo as any).external_reference);
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

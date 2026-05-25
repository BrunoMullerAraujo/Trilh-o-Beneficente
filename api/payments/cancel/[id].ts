import { FieldValue } from "firebase-admin/firestore";
import { getAdminDb, getAdminAuth } from "../../_lib/firebase-admin";
import { handleOptions, sendJson } from "../../_lib/http";
import { getMercadoPagoAccessToken, findMpPaymentId } from "../../_lib/mercadopago";

const MP_API_BASE = "https://api.mercadopago.com";

async function verifyAdminToken(req: any): Promise<{ email: string; name: string } | null> {
  const authHeader: string = req.headers?.authorization ?? "";
  if (!authHeader.startsWith("Bearer ")) return null;
  const idToken = authHeader.slice(7);
  try {
    const adminAuth = getAdminAuth();
    const adminDb = getAdminDb();
    const decoded = await adminAuth.verifyIdToken(idToken);
    const adminEmail = process.env.ADMIN_EMAIL || "bwk.bruno@gmail.com";
    const isAdmin = decoded.email === adminEmail || (await adminDb.collection("admins").doc(decoded.uid).get()).exists;
    if (!isAdmin) return null;
    return { email: decoded.email || "", name: decoded.name || decoded.email || "" };
  } catch {
    return null;
  }
}

export default async function handler(req: any, res: any) {
  if (handleOptions(req, res)) return;

  if (req.method !== "POST") {
    return sendJson(res, 405, { error: "Método não permitido" });
  }

  const operator = await verifyAdminToken(req);
  if (!operator) {
    return sendJson(res, 401, { error: "Não autorizado" });
  }

  const id = req.query?.id;
  const docId = Array.isArray(id) ? id[0] : id;

  if (!docId) {
    return sendJson(res, 400, { error: "ID da inscrição ausente" });
  }

  const { reason } = (req.body ?? {}) as { reason?: string };
  const adminDb = getAdminDb();

  try {
    const regRef = adminDb.collection("registrations").doc(docId);
    const regSnap = await regRef.get();

    if (!regSnap.exists) {
      return sendJson(res, 404, { error: "Inscrição não encontrada" });
    }

    const reg = regSnap.data()!;

    if (reg.status === "cancelled" || reg.status === "refunded") {
      return sendJson(res, 400, { error: "Inscrição já cancelada" });
    }

    if (reg.status === "pending") {
      const now = new Date().toISOString();
      const vouchers = ((reg.vouchers as any[]) || []).map((v: any) =>
        v.used ? v : { ...v, cancelled: true, cancelledAt: now }
      );
      await regRef.update({
        status: "cancelled",
        cancelledAt: FieldValue.serverTimestamp(),
        updatedAt: FieldValue.serverTimestamp(),
        ...(reason && { cancelReason: reason }),
        cancelOperatorEmail: operator.email,
        cancelOperatorName: operator.name,
        ...(vouchers.length && { vouchers }),
      });
      return sendJson(res, 200, { success: true, action: "cancelled" });
    }

    // approved → refund via Mercado Pago
    const accessToken = getMercadoPagoAccessToken();
    if (!accessToken) {
      return sendJson(res, 500, { error: "Mercado Pago não configurado" });
    }

    const mpPaymentId = await findMpPaymentId(accessToken, reg);
    if (!mpPaymentId) {
      console.error(`[cancel] could not resolve payment ID. orderId=${reg.orderId} paymentId=${reg.paymentId}`);
      return sendJson(res, 400, {
        error: "Não foi possível localizar o pagamento no Mercado Pago para realizar o estorno.",
      });
    }

    console.log(`[cancel] calling refund for mpPaymentId=${mpPaymentId}`);
    const refundResp = await fetch(`${MP_API_BASE}/v1/payments/${mpPaymentId}/refunds`, {
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
      return sendJson(res, 502, {
        error: "Erro ao processar estorno no Mercado Pago",
        details: refundData?.message || refundData?.error || JSON.stringify(refundData),
      });
    }

    const refundNow = new Date().toISOString();
    const refundedVouchers = ((reg.vouchers as any[]) || []).map((v: any) =>
      v.used ? v : { ...v, cancelled: true, cancelledAt: refundNow }
    );
    await regRef.update({
      status: "refunded",
      refundId: String(refundData.id),
      refundedAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp(),
      ...(reason && { refundReason: reason }),
      refundOperatorEmail: operator.email,
      refundOperatorName: operator.name,
      ...(refundedVouchers.length && { vouchers: refundedVouchers }),
    });

    if (reg.shirtSize) {
      const inventoryRef = adminDb.collection("settings").doc("shirt_inventory");
      await adminDb.runTransaction(async (tx) => {
        const inv = await tx.get(inventoryRef);
        const current = inv.exists ? (inv.data()?.[reg.shirtSize] ?? 0) : 0;
        tx.set(inventoryRef, { [reg.shirtSize]: current + 1 }, { merge: true });
      });
    }

    return sendJson(res, 200, { success: true, action: "refunded", refundId: refundData.id });
  } catch (error: any) {
    console.error("Erro ao cancelar inscrição:", error);
    return sendJson(res, 500, { error: "Erro ao cancelar inscrição", message: error.message });
  }
}

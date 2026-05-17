import { FieldValue } from "firebase-admin/firestore";
import { getAdminDb, getAdminAuth } from "../../_lib/firebase-admin";
import { handleOptions, sendJson } from "../../_lib/http";
import { getMercadoPagoAccessToken, findMpPaymentId } from "../../_lib/mercadopago";

const MP_API_BASE = "https://api.mercadopago.com";

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

  if (req.method !== "POST") {
    return sendJson(res, 405, { error: "Método não permitido" });
  }

  if (!(await verifyAdminToken(req))) {
    return sendJson(res, 401, { error: "Não autorizado" });
  }

  const id = req.query?.id;
  const docId = Array.isArray(id) ? id[0] : id;

  if (!docId) {
    return sendJson(res, 400, { error: "ID da inscrição ausente" });
  }

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
      await regRef.update({
        status: "cancelled",
        cancelledAt: FieldValue.serverTimestamp(),
        updatedAt: FieldValue.serverTimestamp(),
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
      return sendJson(res, 400, {
        error: "Não foi possível localizar o pagamento no Mercado Pago para realizar o estorno.",
      });
    }

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
      return sendJson(res, 502, {
        error: "Erro ao processar estorno no Mercado Pago",
        details: refundData?.message || refundData,
      });
    }

    await regRef.update({
      status: "refunded",
      refundId: String(refundData.id),
      refundedAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp(),
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

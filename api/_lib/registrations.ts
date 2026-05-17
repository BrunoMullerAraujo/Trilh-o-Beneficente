import { FieldValue, Firestore } from "firebase-admin/firestore";

/**
 * Marks a registration as approved and decrements shirt inventory.
 * Shared between the webhook handler and server.ts to keep behaviour in sync.
 */
export async function approveRegistration(
  adminDb: Firestore,
  paymentId: string,
  externalRef?: string,
): Promise<{ docId: string; regData: Record<string, any> } | null> {
  const regsRef = adminDb.collection("registrations");
  let q = await regsRef.where("paymentId", "==", String(paymentId)).get();
  if (q.empty && externalRef) {
    q = await regsRef.where("paymentId", "==", externalRef).get();
  }
  if (q.empty || q.docs[0].data().status === "approved") return null;

  const docId = q.docs[0].id;
  const regData = q.docs[0].data();
  await regsRef.doc(docId).update({
    status: "approved",
    confirmedAt: FieldValue.serverTimestamp(),
    updatedAt: FieldValue.serverTimestamp(),
  });

  if (regData.shirtSize) {
    const inventoryRef = adminDb.collection("settings").doc("shirt_inventory");
    await adminDb.runTransaction(async (tx) => {
      const inv = await tx.get(inventoryRef);
      const current = inv.exists ? (inv.data()?.[regData.shirtSize] ?? 0) : 0;
      tx.set(inventoryRef, { [regData.shirtSize]: Math.max(0, current - 1) }, { merge: true });
    });
  }

  console.log(`Inscrição ${docId} aprovada — paymentId=${paymentId} externalRef=${externalRef}`);
  return { docId, regData };
}

/**
 * Syncs a registration to approved without touching shirt inventory (manual admin verify).
 */
export async function syncApproved(
  adminDb: Firestore,
  paymentId: string,
  source: string,
  externalRef?: string,
): Promise<void> {
  const regsRef = adminDb.collection("registrations");
  let q = await regsRef.where("paymentId", "==", String(paymentId)).get();
  if (q.empty && externalRef) {
    q = await regsRef.where("paymentId", "==", externalRef).get();
  }
  if (q.empty || q.docs[0].data().status === "approved") return;

  await regsRef.doc(q.docs[0].id).update({
    status: "approved",
    confirmedAt: FieldValue.serverTimestamp(),
    updatedAt: FieldValue.serverTimestamp(),
    syncSource: source,
  });
}

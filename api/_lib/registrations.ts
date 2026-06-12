import { FieldValue, Firestore } from "firebase-admin/firestore";

async function assignNumberIfMissing(
  adminDb: Firestore,
  existing?: string,
): Promise<string | undefined> {
  if (existing) return undefined;
  const counterRef = adminDb.collection("settings").doc("registration_counter");
  let newNumber = "";
  try {
    await adminDb.runTransaction(async (tx) => {
      const snap = await tx.get(counterRef);
      const last = snap.exists ? (snap.data()?.lastNumber ?? 0) : 0;
      const next = last + 1;
      newNumber = String(next).padStart(4, "0");
      tx.set(counterRef, { lastNumber: next });
    });
    return newNumber || undefined;
  } catch (err) {
    console.error("[assignNumberIfMissing] Falha ao atribuir número de inscrição:", err);
    return undefined;
  }
}

/**
 * Assigns the next registrationNumber to a document that is missing one.
 * Safe to call on any registration regardless of status.
 * Returns the assigned number, or the existing number if already present, or null on error.
 */
export async function healRegistrationNumber(
  adminDb: Firestore,
  docId: string,
): Promise<string | null> {
  const ref = adminDb.collection("registrations").doc(docId);
  const snap = await ref.get();
  if (!snap.exists) return null;
  const data = snap.data()!;
  if (data.registrationNumber) return data.registrationNumber as string;

  const number = await assignNumberIfMissing(adminDb, undefined);
  if (!number) return null;

  await ref.update({ registrationNumber: number, updatedAt: FieldValue.serverTimestamp() });
  console.log(`[healRegistrationNumber] ${docId} → #${number}`);
  return number;
}

/**
 * Marks a registration as approved and decrements shirt inventory.
 * If registrationNumber is missing, assigns the next available one.
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

  const registrationNumber = await assignNumberIfMissing(adminDb, regData.registrationNumber);

  await regsRef.doc(docId).update({
    status: "approved",
    confirmedAt: FieldValue.serverTimestamp(),
    updatedAt: FieldValue.serverTimestamp(),
    ...(registrationNumber ? { registrationNumber } : {}),
  });

  if (regData.shirtSize && !regData.inventoryReserved) {
    const inventoryRef = adminDb.collection("settings").doc("shirt_inventory");
    await adminDb.runTransaction(async (tx) => {
      const inv = await tx.get(inventoryRef);
      const current = inv.exists ? (inv.data()?.[regData.shirtSize] ?? 0) : 0;
      tx.set(inventoryRef, { [regData.shirtSize]: Math.max(0, current - 1) }, { merge: true });
    });
  }

  console.log(`Inscrição ${docId} aprovada — paymentId=${paymentId} externalRef=${externalRef}`);
  return { docId, regData: { ...regData, registrationNumber: registrationNumber ?? regData.registrationNumber } };
}

/**
 * Syncs a registration to approved without touching shirt inventory (manual admin verify).
 * Also heals a missing registrationNumber on already-approved docs.
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
  if (q.empty) return;

  const regData = q.docs[0].data();
  // Skip only if already approved AND has a number — otherwise heal
  if (regData.status === "approved" && regData.registrationNumber) return;

  const registrationNumber = await assignNumberIfMissing(adminDb, regData.registrationNumber);

  const updates: Record<string, any> = {
    updatedAt: FieldValue.serverTimestamp(),
    ...(registrationNumber ? { registrationNumber } : {}),
  };

  if (regData.status !== "approved") {
    updates.status = "approved";
    updates.confirmedAt = FieldValue.serverTimestamp();
    updates.syncSource = source;
  }

  await regsRef.doc(q.docs[0].id).update(updates);
}

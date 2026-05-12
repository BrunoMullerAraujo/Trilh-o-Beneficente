import admin from "firebase-admin";
import { getFirestore } from "firebase-admin/firestore";
import firebaseConfig from "../../firebase-applet-config.json";

function getServiceAccountCredential() {
  const serviceAccountKey = process.env.FIREBASE_SERVICE_ACCOUNT_KEY;

  if (serviceAccountKey) {
    const serviceAccount = JSON.parse(serviceAccountKey);
    return admin.credential.cert(serviceAccount);
  }

  const clientEmail = process.env.FIREBASE_CLIENT_EMAIL;
  const privateKey = process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, "\n");

  if (clientEmail && privateKey) {
    return admin.credential.cert({
      projectId: firebaseConfig.projectId,
      clientEmail,
      privateKey,
    });
  }

  return undefined;
}

export function getAdminDb() {
  if (!admin.apps.length) {
    const credential = getServiceAccountCredential();
    admin.initializeApp({
      projectId: firebaseConfig.projectId,
      ...(credential ? { credential } : {}),
    });
  }

  return getFirestore(admin.app(), firebaseConfig.firestoreDatabaseId);
}

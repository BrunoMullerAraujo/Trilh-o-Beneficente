import admin from "firebase-admin";
import { getFirestore } from "firebase-admin/firestore";
import { getAuth } from "firebase-admin/auth";
import firebaseConfig from "../../firebase-applet-config.json";

function getServiceAccountCredential() {
  const serviceAccountKey = process.env.FIREBASE_SERVICE_ACCOUNT_KEY;

  if (serviceAccountKey) {
    // Strip UTF-8 BOM if present (can occur on Windows environments)
    const serviceAccount = JSON.parse(serviceAccountKey.replace(/^﻿/, ""));
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

function ensureAdminApp() {
  if (!admin.apps.length) {
    const credential = getServiceAccountCredential();
    admin.initializeApp({
      projectId: firebaseConfig.projectId,
      ...(credential ? { credential } : {}),
    });
  }
  return admin.app();
}

export function getAdminDb() {
  return getFirestore(ensureAdminApp(), firebaseConfig.firestoreDatabaseId);
}

export function getAdminAuth() {
  return getAuth(ensureAdminApp());
}

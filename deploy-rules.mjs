// Deploy Firestore security rules via Firebase Rules REST API
// Usage: node deploy-rules.mjs
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Load env
const envPath = path.join(__dirname, ".env");
const env = {};
if (fs.existsSync(envPath)) {
  for (const line of fs.readFileSync(envPath, "utf8").split("\n")) {
    const m = line.match(/^([^#=]+)=(.*)$/);
    if (m) env[m[1].trim()] = m[2].trim().replace(/^["']|["']$/g, "");
  }
}

const serviceAccountRaw = (process.env.FIREBASE_SERVICE_ACCOUNT_KEY || env.FIREBASE_SERVICE_ACCOUNT_KEY || "").replace(/^﻿/, "");
if (!serviceAccountRaw) {
  console.error("FIREBASE_SERVICE_ACCOUNT_KEY not set");
  process.exit(1);
}

const sa = JSON.parse(serviceAccountRaw);
const projectId = sa.project_id;

// Create a signed JWT to authenticate with Google
import crypto from "crypto";

function base64url(buf) {
  return buf.toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=/g, "");
}

async function getAccessToken() {
  const header = base64url(Buffer.from(JSON.stringify({ alg: "RS256", typ: "JWT" })));
  const now = Math.floor(Date.now() / 1000);
  const payload = base64url(Buffer.from(JSON.stringify({
    iss: sa.client_email,
    scope: "https://www.googleapis.com/auth/firebase https://www.googleapis.com/auth/cloud-platform",
    aud: "https://oauth2.googleapis.com/token",
    iat: now,
    exp: now + 3600,
  })));
  const sign = crypto.createSign("RSA-SHA256");
  sign.update(`${header}.${payload}`);
  const sig = base64url(sign.sign(sa.private_key));
  const jwt = `${header}.${payload}.${sig}`;

  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: `grant_type=urn%3Aietf%3Aparams%3Aoauth%3Agrant-type%3Ajwt-bearer&assertion=${jwt}`,
  });
  const data = await res.json();
  if (!data.access_token) throw new Error(`OAuth failed: ${JSON.stringify(data)}`);
  return data.access_token;
}

const rulesSource = fs.readFileSync(path.join(__dirname, "firestore.rules"), "utf8");
const token = await getAccessToken();

// Create ruleset
const rulesetRes = await fetch(
  `https://firebaserules.googleapis.com/v1/projects/${projectId}/rulesets`,
  {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify({ source: { files: [{ name: "firestore.rules", content: rulesSource }] } }),
  }
);
const ruleset = await rulesetRes.json();
if (!rulesetRes.ok) { console.error("Ruleset error:", JSON.stringify(ruleset, null, 2)); process.exit(1); }
console.log("Ruleset criado:", ruleset.name);

// Update release
const releaseRes = await fetch(
  `https://firebaserules.googleapis.com/v1/projects/${projectId}/releases/cloud.firestore`,
  {
    method: "PATCH",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify({ release: { name: `projects/${projectId}/releases/cloud.firestore`, rulesetName: ruleset.name } }),
  }
);
const release = await releaseRes.json();
if (!releaseRes.ok) { console.error("Release error:", JSON.stringify(release, null, 2)); process.exit(1); }
console.log("Regras publicadas com sucesso!", release.name);

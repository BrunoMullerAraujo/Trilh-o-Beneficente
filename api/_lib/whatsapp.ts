import makeWASocket, {
  DisconnectReason,
  useMultiFileAuthState,
  fetchLatestBaileysVersion,
  makeCacheableSignalKeyStore,
  Browsers,
} from "@whiskeysockets/baileys";
import { Boom } from "@hapi/boom";
import fs from "fs";
import path from "path";
import QRCode from "qrcode";
import pino from "pino";

// Use /tmp so it's always writable on Railway and any host
const SESSION_DIR = "/tmp/.wa-session";

type Status = "disconnected" | "connecting" | "connected";

let sock: ReturnType<typeof makeWASocket> | null = null;
let status: Status = "disconnected";
let qrDataUrl: string | null = null;
let connectedPhone: string | null = null;
let restartTimeout: ReturnType<typeof setTimeout> | null = null;
let adminDbRef: any = null;
let reconnectAttempts = 0;
let lastError: string | null = null;
const MAX_RECONNECT_ATTEMPTS = 3;

const logger = pino({ level: "silent" });

// Hardcoded fallback version so fetchLatestBaileysVersion failure doesn't block startup
const FALLBACK_VERSION: [number, number, number] = [2, 3000, 1023231902];

// --- Firestore session persistence ---

async function saveSessionToFirestore() {
  if (!adminDbRef || !fs.existsSync(SESSION_DIR)) return;
  try {
    const files: Record<string, string> = {};
    for (const f of fs.readdirSync(SESSION_DIR)) {
      files[f] = fs.readFileSync(path.join(SESSION_DIR, f)).toString("base64");
    }
    await adminDbRef.collection("settings").doc("whatsapp_session").set({ files, savedAt: new Date().toISOString() });
  } catch (e) {
    console.error("[WA] Erro ao salvar sessão no Firestore:", e);
  }
}

async function loadSessionFromFirestore() {
  if (!adminDbRef) return;
  try {
    const doc = await adminDbRef.collection("settings").doc("whatsapp_session").get();
    if (!doc.exists || !doc.data()?.files) return;
    fs.mkdirSync(SESSION_DIR, { recursive: true });
    for (const [filename, content] of Object.entries(doc.data().files as Record<string, string>)) {
      fs.writeFileSync(path.join(SESSION_DIR, filename), Buffer.from(content, "base64"));
    }
    console.log("[WA] Sessão restaurada do Firestore.");
  } catch (e) {
    console.error("[WA] Erro ao carregar sessão do Firestore:", e);
  }
}

export async function deleteSession() {
  if (adminDbRef) {
    await adminDbRef.collection("settings").doc("whatsapp_session").delete().catch(() => {});
  }
  if (fs.existsSync(SESSION_DIR)) {
    fs.rmSync(SESSION_DIR, { recursive: true, force: true });
  }
}

// --- Connection ---

export async function initWhatsApp(db: any) {
  adminDbRef = db;
  console.log("[WA] Iniciando serviço WhatsApp...");
  await loadSessionFromFirestore();
  connect();
}

function connect() {
  if (restartTimeout) { clearTimeout(restartTimeout); restartTimeout = null; }
  status = "connecting";
  qrDataUrl = null;
  console.log(`[WA] Conectando... (tentativa ${reconnectAttempts + 1})`);

  connectAsync().catch((err) => {
    console.error("[WA] Erro na conexão:", err?.message ?? err);
    status = "disconnected";
    reconnectAttempts++;
    if (reconnectAttempts <= MAX_RECONNECT_ATTEMPTS) {
      // Backoff exponencial: 30s, 60s, 120s
      const delay = Math.min(30000 * Math.pow(2, reconnectAttempts - 1), 120000);
      console.log(`[WA] Tentando reconectar em ${delay / 1000}s...`);
      restartTimeout = setTimeout(connect, delay);
    } else {
      console.warn("[WA] Máximo de tentativas atingido. Aguardando scan manual do QR.");
      reconnectAttempts = 0;
    }
  });
}

async function connectAsync() {
  fs.mkdirSync(SESSION_DIR, { recursive: true });
  const { state, saveCreds } = await useMultiFileAuthState(SESSION_DIR);

  // Busca versão com timeout de 15s; usa fallback se falhar
  let version = FALLBACK_VERSION;
  try {
    const result = await Promise.race([
      fetchLatestBaileysVersion(),
      new Promise<never>((_, reject) => setTimeout(() => reject(new Error("timeout")), 15000)),
    ]) as { version: [number, number, number] };
    version = result.version;
    console.log(`[WA] Versão WhatsApp: ${version.join(".")}`);
  } catch {
    console.warn(`[WA] Não foi possível buscar versão atual, usando fallback ${version.join(".")}`);
  }

  sock = makeWASocket({
    version,
    auth: {
      creds: state.creds,
      keys: makeCacheableSignalKeyStore(state.keys, logger),
    },
    logger,
    printQRInTerminal: false,
    browser: Browsers.ubuntu("Chrome"),
    generateHighQualityLinkPreview: false,
    syncFullHistory: false,
    markOnlineOnConnect: false,
    fireInitQueries: false,
  });

  sock.ev.on("creds.update", async () => {
    await saveCreds();
    await saveSessionToFirestore();
  });

  sock.ev.on("connection.update", async (update) => {
    const { connection, lastDisconnect, qr } = update;

    if (qr) {
      console.log("[WA] QR code gerado.");
      qrDataUrl = await QRCode.toDataURL(qr, { width: 300, margin: 2 });
      status = "connecting";
      connectedPhone = null;
    }

    if (connection === "open") {
      status = "connected";
      qrDataUrl = null;
      reconnectAttempts = 0;
      connectedPhone = sock?.user?.id?.split(":")[0] ?? null;
      console.log(`[WA] Conectado como ${connectedPhone}`);
      processQueue();
    }

    if (connection === "close") {
      const code = (lastDisconnect?.error as Boom)?.output?.statusCode;
      const loggedOut = code === DisconnectReason.loggedOut;
      lastError = code ? `Código ${code}` : null;
      console.log(`[WA] Conexão encerrada. Código: ${code}. LoggedOut: ${loggedOut}`);
      status = "disconnected";
      connectedPhone = null;
      sock = null;

      if (loggedOut) {
        await deleteSession();
        reconnectAttempts = 0;
        // Aguarda 60s após logout para não parecer spam
        console.log("[WA] Logout detectado. Aguardando 60s antes de gerar novo QR...");
        restartTimeout = setTimeout(connect, 60000);
      } else {
        // Backoff progressivo para reconexão normal
        const delay = Math.min(10000 * Math.pow(2, reconnectAttempts), 120000);
        reconnectAttempts = Math.min(reconnectAttempts + 1, 5);
        console.log(`[WA] Reconectando em ${delay / 1000}s...`);
        restartTimeout = setTimeout(connect, delay);
      }
    }
  });
}

export async function disconnectWhatsApp() {
  if (restartTimeout) { clearTimeout(restartTimeout); restartTimeout = null; }
  if (sock) {
    try { await sock.logout(); } catch {}
    sock = null;
  }
  await deleteSession();
  status = "disconnected";
  qrDataUrl = null;
  connectedPhone = null;
  console.log("[WA] Desconectado.");
}

// --- Status ---

export function getWhatsAppStatus() {
  return { status, qr: qrDataUrl, phone: connectedPhone, lastError };
}

export async function reconnectFresh() {
  if (restartTimeout) { clearTimeout(restartTimeout); restartTimeout = null; }
  if (sock) { try { await sock.logout(); } catch {} sock = null; }
  await deleteSession();
  status = "disconnected";
  qrDataUrl = null;
  connectedPhone = null;
  lastError = null;
  reconnectAttempts = 0;
  console.log("[WA] Reconexão limpa iniciada.");
  connect();
}

// --- Send (direct, used internally by queue processor) ---

async function sendWhatsAppMessageDirect(phone: string, message: string): Promise<boolean> {
  if (status !== "connected" || !sock) return false;
  try {
    const digits = phone.replace(/\D/g, "");
    const jid = (digits.startsWith("55") ? digits : `55${digits}`) + "@s.whatsapp.net";
    await sock.sendMessage(jid, { text: message });
    console.log(`[WA] Mensagem enviada para ${jid}`);
    return true;
  } catch (e) {
    console.error("[WA] Erro ao enviar mensagem:", e);
    return false;
  }
}

// --- Message Queue ---

const MAX_ATTEMPTS = 3;
let queueProcessing = false;

// Gaussian delay: clusters naturally around 3s (±1.5s), never below 1.5s
function humanDelay(): Promise<void> {
  const u1 = Math.random() || 1e-10;
  const u2 = Math.random();
  const z = Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2);
  const ms = Math.max(1500, Math.round(3000 + z * 1200));
  return new Promise((res) => setTimeout(res, ms));
}

export async function enqueueWhatsAppMessage(opts: {
  phone: string;
  message: string;
  name: string;
  registrationId?: string;
}) {
  if (!adminDbRef) return;
  await adminDbRef.collection("whatsapp_queue").add({
    ...opts,
    status: "pending",
    attempts: 0,
    createdAt: new Date().toISOString(),
    lastAttemptAt: null,
    error: null,
  });
  console.log(`[WA] Mensagem enfileirada para ${opts.name}`);
  if (status === "connected") processQueue();
}

async function processQueue() {
  if (queueProcessing || !adminDbRef) return;
  queueProcessing = true;
  console.log("[WA] Processando fila...");
  try {
    while (status === "connected") {
      const snap = await adminDbRef
        .collection("whatsapp_queue")
        .where("status", "in", ["pending", "retry"])
        .orderBy("createdAt", "asc")
        .limit(1)
        .get();

      if (snap.empty) break;

      const docRef = snap.docs[0].ref;
      const item = snap.docs[0].data() as any;

      await docRef.update({ status: "sending", lastAttemptAt: new Date().toISOString() });

      const ok = await sendWhatsAppMessageDirect(item.phone, item.message);

      if (ok) {
        await docRef.update({ status: "sent", error: null });
        // Log success
        await adminDbRef.collection("message_logs").add({
          channel: "whatsapp",
          to: item.phone,
          subject: null,
          name: item.name,
          status: "sent",
          timestamp: new Date(),
        });
        console.log(`[WA] Fila: enviado para ${item.name}`);
      } else {
        const attempts = (item.attempts || 0) + 1;
        const failed = attempts >= MAX_ATTEMPTS;
        await docRef.update({
          status: failed ? "failed" : "retry",
          attempts,
          error: "Falha no envio",
        });
        if (failed) {
          await adminDbRef.collection("message_logs").add({
            channel: "whatsapp",
            to: item.phone,
            subject: null,
            name: item.name,
            status: "error",
            error: `Falhou após ${MAX_ATTEMPTS} tentativas`,
            timestamp: new Date(),
          });
          console.warn(`[WA] Fila: falha permanente para ${item.name}`);
        } else {
          console.warn(`[WA] Fila: tentativa ${attempts}/${MAX_ATTEMPTS} para ${item.name}`);
        }
      }

      // Human delay before next message
      if (status === "connected") await humanDelay();
    }
  } finally {
    queueProcessing = false;
    console.log("[WA] Fila: processamento concluído.");
  }
}

// --- Message templates ---

export function buildConfirmationMessage(reg: Record<string, any>): string {
  const vouchers = (reg.vouchers as any[])?.length ?? 0;
  const lines = [
    `Olá, *${reg.name?.split(" ")[0]}*! 🏍️`,
    ``,
    `Sua inscrição no *Trilhão Beneficente* foi confirmada!`,
    ``,
    `📋 Nº *${reg.registrationNumber ?? "—"}*`,
    `👕 Camiseta: *${reg.shirtSize ?? "—"}*`,
  ];
  if (vouchers > 0) {
    lines.push(`🎫 Vouchers de almoço: *${vouchers}*`);
  }
  lines.push(``, `Seu comprovante foi enviado por e-mail.`, `Nos vemos em Presidente Olegário! 🤝`);
  return lines.join("\n");
}

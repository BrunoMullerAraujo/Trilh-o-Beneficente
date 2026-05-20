import makeWASocket, {
  DisconnectReason,
  useMultiFileAuthState,
  fetchLatestBaileysVersion,
  makeCacheableSignalKeyStore,
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

const logger = pino({ level: "silent" });

// Hardcoded fallback version so fetchLatestBaileysVersion failure doesn't block startup
const FALLBACK_VERSION: [number, number, number] = [2, 3000, 1023231901];

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
  console.log("[WA] Conectando...");

  connectAsync().catch((err) => {
    console.error("[WA] Erro na conexão:", err?.message ?? err);
    status = "disconnected";
    // Tenta reconectar após 10s em caso de erro inesperado
    restartTimeout = setTimeout(connect, 10000);
  });
}

async function connectAsync() {
  fs.mkdirSync(SESSION_DIR, { recursive: true });
  const { state, saveCreds } = await useMultiFileAuthState(SESSION_DIR);

  // Busca versão com timeout de 8s; usa fallback se falhar
  let version = FALLBACK_VERSION;
  try {
    const result = await Promise.race([
      fetchLatestBaileysVersion(),
      new Promise<never>((_, reject) => setTimeout(() => reject(new Error("timeout")), 8000)),
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
    browser: ["Trilhão Beneficente", "Chrome", "1.0.0"],
    generateHighQualityLinkPreview: false,
    syncFullHistory: false,
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
      connectedPhone = sock?.user?.id?.split(":")[0] ?? null;
      console.log(`[WA] Conectado como ${connectedPhone}`);
    }

    if (connection === "close") {
      const code = (lastDisconnect?.error as Boom)?.output?.statusCode;
      const loggedOut = code === DisconnectReason.loggedOut;
      console.log(`[WA] Conexão encerrada. Código: ${code}. LoggedOut: ${loggedOut}`);
      status = "disconnected";
      connectedPhone = null;
      sock = null;

      if (loggedOut) {
        await deleteSession();
        // Gera novo QR após logout
        restartTimeout = setTimeout(connect, 3000);
      } else {
        restartTimeout = setTimeout(connect, 5000);
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
  return { status, qr: qrDataUrl, phone: connectedPhone };
}

// --- Send ---

export async function sendWhatsAppMessage(phone: string, message: string): Promise<boolean> {
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

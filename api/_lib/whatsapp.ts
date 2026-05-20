import makeWASocket, {
  DisconnectReason,
  useMultiFileAuthState,
  fetchLatestBaileysVersion,
  makeCacheableSignalKeyStore,
} from "@whiskeysockets/baileys";
import { Boom } from "@hapi/boom";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import QRCode from "qrcode";
import pino from "pino";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SESSION_DIR = path.join(__dirname, "../../.wa-session");

type Status = "disconnected" | "connecting" | "connected";

let sock: ReturnType<typeof makeWASocket> | null = null;
let status: Status = "disconnected";
let qrDataUrl: string | null = null;
let connectedPhone: string | null = null;
let restartTimeout: ReturnType<typeof setTimeout> | null = null;
let adminDbRef: any = null;

const logger = pino({ level: "silent" });

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
  await loadSessionFromFirestore();
  connect();
}

function connect() {
  if (restartTimeout) { clearTimeout(restartTimeout); restartTimeout = null; }
  status = "connecting";
  qrDataUrl = null;

  connectAsync().catch((err) => {
    console.error("[WA] Erro na conexão:", err);
    status = "disconnected";
  });
}

async function connectAsync() {
  fs.mkdirSync(SESSION_DIR, { recursive: true });
  const { state, saveCreds } = await useMultiFileAuthState(SESSION_DIR);
  const { version } = await fetchLatestBaileysVersion();

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
      } else {
        // Reconecta após 5s
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
    // Brazil: ensure country code 55
    const jid = (digits.startsWith("55") ? digits : `55${digits}`) + "@s.whatsapp.net";
    await sock.sendMessage(jid, { text: message });
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

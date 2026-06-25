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
import { sendConfirmationEmail, sendPendingEmail, sendSignedTermEmail, sendReminder1Email, sendReminder2Email, sendReminder3Email, sendReminder4Email, sendAutoCancelledEmail } from "./email";

// ─────────────────────────────────────────────────────────────────────────────
// Constants
// ─────────────────────────────────────────────────────────────────────────────

const SESSION_DIR = "/tmp/.wa-session";
const FALLBACK_VERSION: [number, number, number] = [2, 3000, 1023231902];
const MAX_ATTEMPTS = 3;
const MAX_RECONNECTS_PER_HOUR = 3;
const WARMUP_LIMITS = [20, 36, 65, 117, 210, 378, 1500];
const WA_BUSINESS_HOUR_START = 7;   // 07h Brasília
const WA_BUSINESS_HOUR_END = 23;    // 23h Brasília
const EMAIL_RETRY_DELAYS = [0, 2 * 60 * 1000, 10 * 60 * 1000]; // 0, 2min, 10min
const BANNED_RECONNECT_COOLDOWN = 7 * 24 * 60 * 60 * 1000; // 7 days

const logger = pino({ level: "silent" });

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

type WAStatus = "disconnected" | "connecting" | "connected" | "banned" | "paused";
type RiskLevel = "normal" | "warning" | "critical" | "banned";

export interface WhatsAppStatus {
  status: WAStatus;
  qr: string | null;
  phone: string | null;
  lastError: string | null;
  reconnectAt: number | null;
  reconnectReason: string | null;
  riskLevel: RiskLevel;
  reconnectAttempts: number;
  connectedSince: number | null;
  warmup: {
    active: boolean;
    day: number;
    dailyLimit: number;
    sentToday: number;
    nextDayLimit: number;
  } | null;
}

interface WarmupData {
  startedAt: string;
  day: number;
  sentToday: number;
  lastResetDate: string;
}

interface QueuedMessage {
  channel: "email" | "whatsapp";
  status: "pending" | "sending" | "sent" | "retry" | "failed";
  to: string;
  name: string;
  subject: string;
  message: string | null;
  emailType: "confirmation" | "pending" | "term" | "reminder1" | "reminder2" | "reminder3" | "reminder4" | "cancelled_auto" | null;
  registrationId: string | null;
  attempts: number;
  createdAt: string;
  lastAttemptAt: string | null;
  sentAt: string | null;
  error: string | null;
}

// ─────────────────────────────────────────────────────────────────────────────
// State
// ─────────────────────────────────────────────────────────────────────────────

let sock: ReturnType<typeof makeWASocket> | null = null;
let status: WAStatus = "disconnected";
let qrDataUrl: string | null = null;
let connectedPhone: string | null = null;
let restartTimeout: ReturnType<typeof setTimeout> | null = null;
let adminDbRef: any = null;
let reconnectAttempts = 0;
let lastError: string | null = null;
let reconnectAt: number | null = null;
let reconnectReason: string | null = null;
let riskLevel: RiskLevel = "normal";
let connectedSince: number | null = null;
let warmupData: WarmupData | null = null;
let warmupActive = false; // false = no warmup (session pre-existing)

// Reconnect-per-hour counter
let reconnectsThisHour = 0;
let reconnectsHourStart = Date.now();

// Risk health counters (reset hourly)
let disconnectsThisHour = 0;
let failedMessagesThisHour = 0;
let lastHealthHourStart = Date.now();

// Queue processing flags
let waQueueProcessing = false;
let emailQueueProcessing = false;
let emailWorkerInterval: ReturnType<typeof setInterval> | null = null;
let businessHoursCheckTimeout: ReturnType<typeof setTimeout> | null = null;

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

function resetHealthCountersIfNeeded() {
  if (Date.now() - lastHealthHourStart > 3600000) {
    disconnectsThisHour = 0;
    failedMessagesThisHour = 0;
    lastHealthHourStart = Date.now();
  }
}

function updateRiskLevel(code?: number) {
  resetHealthCountersIfNeeded();
  if (status === "banned" || code === 403) {
    riskLevel = "banned";
  } else if (disconnectsThisHour >= 5 || code === 463) {
    riskLevel = "critical";
  } else if (disconnectsThisHour >= 3 || failedMessagesThisHour >= 5) {
    riskLevel = "warning";
  } else {
    riskLevel = "normal";
  }
}

function checkReconnectLimit(): boolean {
  if (Date.now() - reconnectsHourStart > 3600000) {
    reconnectsThisHour = 0;
    reconnectsHourStart = Date.now();
  }
  if (reconnectsThisHour >= MAX_RECONNECTS_PER_HOUR) {
    lastError = "Limite de reconexões atingido. Ação manual necessária.";
    reconnectAt = null;
    reconnectReason = null;
    status = "disconnected";
    console.warn("[WA] Limite de reconexões por hora atingido. Parando reconexão automática.");
    return false;
  }
  return true;
}

/** Gaussian random — Box-Muller */
function gaussianMs(mean: number, stddev: number, min: number): number {
  const u1 = Math.random() || 1e-10;
  const u2 = Math.random();
  const z = Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2);
  return Math.max(min, Math.round(mean + z * stddev));
}

function humanDelay(): Promise<void> {
  const ms = gaussianMs(5000, 1500, 3000);
  return new Promise((r) => setTimeout(r, ms));
}

/** Returns current hour in Brasília (UTC-3) */
function brasiliaHour(): number {
  const now = new Date();
  const utcHour = now.getUTCHours();
  return ((utcHour - 3) + 24) % 24;
}

function isBusinessHours(): boolean {
  const h = brasiliaHour();
  return h >= WA_BUSINESS_HOUR_START && h < WA_BUSINESS_HOUR_END;
}

/** ms until next business hour window opens */
function msUntilBusinessHours(): number {
  const nowMs = Date.now();
  const now = new Date(nowMs);
  // Next 07h Brasília = 10h UTC
  const openUTC = ((WA_BUSINESS_HOUR_START + 3) % 24);
  const next = new Date(nowMs);
  next.setUTCHours(openUTC, 0, 0, 0);
  if (next <= now) next.setUTCDate(next.getUTCDate() + 1);
  return next.getTime() - nowMs;
}

function todayBrasilia(): string {
  const now = new Date();
  now.setUTCHours(now.getUTCHours() - 3);
  return now.toISOString().slice(0, 10);
}

// ─────────────────────────────────────────────────────────────────────────────
// Firestore session persistence
// ─────────────────────────────────────────────────────────────────────────────

async function saveSessionToFirestore() {
  if (!adminDbRef || !fs.existsSync(SESSION_DIR)) return;
  try {
    const files: Record<string, string> = {};
    for (const f of fs.readdirSync(SESSION_DIR)) {
      const fullPath = path.join(SESSION_DIR, f);
      if (fs.statSync(fullPath).isFile()) {
        files[f] = fs.readFileSync(fullPath).toString("base64");
      }
    }
    const payload: Record<string, any> = { files, savedAt: new Date().toISOString() };
    if (warmupActive && warmupData) payload.warmup = warmupData;
    await adminDbRef.collection("settings").doc("whatsapp_session").set(payload);
  } catch (e) {
    console.error("[WA] Erro ao salvar sessão no Firestore:", e);
  }
}

async function loadSessionFromFirestore() {
  if (!adminDbRef) return;
  try {
    const doc = await adminDbRef.collection("settings").doc("whatsapp_session").get();
    if (!doc.exists || !doc.data()?.files) return;
    const data = doc.data();
    fs.mkdirSync(SESSION_DIR, { recursive: true });
    for (const [filename, content] of Object.entries(data.files as Record<string, string>)) {
      fs.writeFileSync(path.join(SESSION_DIR, filename), Buffer.from(content, "base64"));
    }
    // Load warmup if present; if no warmup record, session is pre-existing → skip warmup
    if (data.warmup) {
      warmupData = data.warmup as WarmupData;
      warmupActive = true;
    } else {
      warmupData = null;
      warmupActive = false; // pre-existing session: no warmup limits
    }
    console.log("[WA] Sessão restaurada do Firestore.");
  } catch (e) {
    console.error("[WA] Erro ao carregar sessão do Firestore:", e);
  }
}

async function saveWarmupToFirestore() {
  if (!adminDbRef || !warmupData) return;
  try {
    await adminDbRef
      .collection("settings")
      .doc("whatsapp_session")
      .set({ warmup: warmupData }, { merge: true });
  } catch (e) {
    console.error("[WA] Erro ao salvar warm-up no Firestore:", e);
  }
}

export async function deleteSession() {
  if (adminDbRef) {
    await adminDbRef.collection("settings").doc("whatsapp_session").delete().catch(() => {});
  }
  if (fs.existsSync(SESSION_DIR)) {
    fs.rmSync(SESSION_DIR, { recursive: true, force: true });
  }
  warmupData = null;
  warmupActive = false;
}

// ─────────────────────────────────────────────────────────────────────────────
// Ban state persistence
// ─────────────────────────────────────────────────────────────────────────────

async function saveBanStateToFirestore(bannedAt: number, reconnectAtTs: number) {
  if (!adminDbRef) return;
  try {
    await adminDbRef.collection("settings").doc("whatsapp_ban").set({
      bannedAt,
      reconnectAt: reconnectAtTs,
      reason: "Número banido pelo WhatsApp (403). Aguardando 7 dias.",
      code: 403,
    });
    console.log("[WA] Estado de banimento salvo no Firestore.");
  } catch (e) {
    console.error("[WA] Erro ao salvar ban no Firestore:", e);
  }
}

async function loadBanStateFromFirestore(): Promise<boolean> {
  if (!adminDbRef) return false;
  try {
    const doc = await adminDbRef.collection("settings").doc("whatsapp_ban").get();
    if (!doc.exists) return false;
    const data = doc.data();
    if (!data?.reconnectAt) return false;
    if (Date.now() < data.reconnectAt) {
      status = "banned";
      riskLevel = "banned";
      reconnectAt = data.reconnectAt;
      reconnectReason = `Número banido. Disponível a partir de ${new Date(data.reconnectAt).toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo" })}.`;
      lastError = "Número banido pelo WhatsApp (403). Aguardando fim do período de restrição.";
      console.warn(`[WA] Ban ativo encontrado no Firestore. Disponível em ${new Date(data.reconnectAt).toISOString()}`);
      return true;
    }
    // Ban expired — clear it
    await adminDbRef.collection("settings").doc("whatsapp_ban").delete().catch(() => {});
    console.log("[WA] Período de banimento expirado. Prosseguindo com conexão.");
    return false;
  } catch (e) {
    console.error("[WA] Erro ao carregar ban do Firestore:", e);
    return false;
  }
}

async function clearBanFromFirestore() {
  if (!adminDbRef) return;
  await adminDbRef.collection("settings").doc("whatsapp_ban").delete().catch(() => {});
}

// ─────────────────────────────────────────────────────────────────────────────
// Warmup helpers
// ─────────────────────────────────────────────────────────────────────────────

function initNewWarmup() {
  const today = todayBrasilia();
  warmupData = { startedAt: new Date().toISOString(), day: 1, sentToday: 0, lastResetDate: today };
  warmupActive = true;
}

function refreshWarmupDay() {
  if (!warmupData) return;
  const today = todayBrasilia();
  if (warmupData.lastResetDate !== today) {
    // Check 72h inactivity (reset to day 1)
    const startMs = new Date(warmupData.startedAt).getTime();
    const elapsed = Date.now() - startMs;
    const daysSinceStart = elapsed / (24 * 60 * 60 * 1000);
    if (daysSinceStart - warmupData.day > 3) {
      console.warn("[WA] Warm-up: inatividade > 72h, reiniciando do dia 1.");
      initNewWarmup();
    } else {
      warmupData.day = Math.min(warmupData.day + 1, WARMUP_LIMITS.length);
      warmupData.sentToday = 0;
      warmupData.lastResetDate = today;
    }
  }
}

function warmupDailyLimit(): number {
  if (!warmupActive || !warmupData) return Infinity;
  refreshWarmupDay();
  const idx = Math.min(warmupData.day - 1, WARMUP_LIMITS.length - 1);
  return WARMUP_LIMITS[idx];
}

function warmupCanSend(): boolean {
  if (!warmupActive || !warmupData) return true;
  refreshWarmupDay();
  const limit = warmupDailyLimit();
  return warmupData.sentToday < limit;
}

async function warmupRecordSent() {
  if (!warmupActive || !warmupData) return;
  warmupData.sentToday++;
  await saveWarmupToFirestore();
}

// ─────────────────────────────────────────────────────────────────────────────
// Connection logic
// ─────────────────────────────────────────────────────────────────────────────

export async function initWhatsApp(db: any): Promise<void> {
  adminDbRef = db;
  console.log("[WA] Iniciando serviço WhatsApp...");
  const isBanned = await loadBanStateFromFirestore();
  if (isBanned) {
    console.warn("[WA] Ban ativo. Não conectando até expirar o período de restrição.");
    return;
  }
  await loadSessionFromFirestore();
  connect();
}

function scheduleReconnect(delayMs: number, reason: string) {
  if (!checkReconnectLimit()) return;
  reconnectAt = Date.now() + delayMs;
  reconnectReason = reason;
  reconnectsThisHour++;
  console.log(`[WA] Agendando reconexão em ${Math.round(delayMs / 1000)}s — ${reason}`);
  restartTimeout = setTimeout(connect, delayMs);
}

function connect() {
  if (restartTimeout) { clearTimeout(restartTimeout); restartTimeout = null; }
  if (status === "banned") {
    console.warn("[WA] Banido. Não reconectando automaticamente.");
    return;
  }
  status = "connecting";
  qrDataUrl = null;
  reconnectAt = null;
  reconnectReason = null;
  console.log(`[WA] Conectando... (tentativa ${reconnectAttempts + 1})`);

  connectAsync().catch((err) => {
    console.error("[WA] Erro na conexão:", err?.message ?? err);
    status = "disconnected";
    sock = null;
    disconnectsThisHour++;
    updateRiskLevel();
    scheduleReconnect(
      Math.min(30000 * Math.pow(2, reconnectAttempts), 120000),
      `Erro de conexão (${reconnectAttempts + 1}/${MAX_RECONNECTS_PER_HOUR})`
    );
    reconnectAttempts++;
  });
}

async function connectAsync() {
  fs.mkdirSync(SESSION_DIR, { recursive: true });
  const { state, saveCreds } = await useMultiFileAuthState(SESSION_DIR);

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
    browser: Browsers.macOS("Safari"),
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
      reconnectAt = null;
      reconnectReason = null;
      connectedSince = Date.now();
      connectedPhone = sock?.user?.id?.split(":")[0] ?? null;
      console.log(`[WA] Conectado como ${connectedPhone}`);

      // New session (no warmup data loaded): initialize warmup
      if (!warmupData && !warmupActive) {
        // Only init warmup if creds were just registered (no prior warmup doc)
        // We can infer "new session" if SESSION_DIR was fresh (no Firestore doc had warmup)
        // Conservative: if warmupActive is still false here, leave it as-is (pre-existing)
      }

      processWhatsAppQueue().catch(console.error);
    }

    if (connection === "close") {
      const code = (lastDisconnect?.error as Boom)?.output?.statusCode;
      console.log(`[WA] Conexão encerrada. Código: ${code}`);
      status = "disconnected";
      connectedPhone = null;
      connectedSince = null;
      sock = null;
      disconnectsThisHour++;
      updateRiskLevel(code);

      lastError = code ? `Código ${code}` : "Desconexão inesperada";

      // ── 403 Forbidden — BANNED ──────────────────────────────────────────
      if (code === 403) {
        const bannedAt = Date.now();
        const reconnectAtTs = bannedAt + BANNED_RECONNECT_COOLDOWN;
        status = "banned";
        riskLevel = "banned";
        reconnectAt = reconnectAtTs;
        connectedSince = null;
        const dateStr = new Date(reconnectAtTs).toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo" });
        reconnectReason = `Número banido. Disponível a partir de ${dateStr}.`;
        lastError = "Número banido pelo WhatsApp (403). Ação manual necessária.";
        console.error("[WA] BANIDO (403). Não reconectando automaticamente.");
        saveBanStateToFirestore(bannedAt, reconnectAtTs).catch(console.error);
        // Do NOT reconnect
        return;
      }

      // ── 401 Logged out ──────────────────────────────────────────────────
      if (code === DisconnectReason.loggedOut) {
        await deleteSession();
        reconnectAttempts = 0;
        lastError = "Sessão encerrada (logout). Escaneie o QR novamente.";
        console.log("[WA] Logout. Sessão apagada. Aguardando QR manual.");
        // Do NOT reconnect automatically
        return;
      }

      // ── 500 Bad session ─────────────────────────────────────────────────
      if (code === 500) {
        await deleteSession();
        reconnectAttempts = 0;
        lastError = "Sessão corrompida (500). Escaneie o QR novamente.";
        console.log("[WA] Sessão corrompida (500). Sessão apagada. Aguardando QR manual.");
        return;
      }

      // ── 440 Replaced (outro dispositivo) ───────────────────────────────
      if (code === 440) {
        reconnectAttempts = 0;
        lastError = "Sessão substituída por outro dispositivo (440).";
        console.log("[WA] Sessão substituída (440). Aguardando ação manual.");
        return;
      }

      // ── 463 Timelock ────────────────────────────────────────────────────
      if (code === 463) {
        const delay = 30 * 60 * 1000; // 30 min
        status = "paused";
        riskLevel = "critical";
        reconnectReason = "Timelock detectado";
        lastError = "Timelock (463). Retomando em 30 minutos.";
        console.warn("[WA] Timelock (463). Pausando 30 minutos.");
        reconnectAt = Date.now() + delay;
        reconnectAttempts = 0;
        restartTimeout = setTimeout(connect, delay);
        return;
      }

      // ── 408 / 428 / 515 and everything else — backoff ───────────────────
      const attempt = reconnectAttempts + 1;
      if (!checkReconnectLimit()) return;

      let delay: number;
      let reason: string;
      if (attempt <= 1) {
        delay = 30000;
        reason = `Queda de rede (${attempt}/3)`;
      } else if (attempt <= 2) {
        delay = 90000;
        reason = `Queda de rede (${attempt}/3)`;
      } else {
        delay = 5 * 60 * 1000;
        reason = `Queda de rede (${attempt}/3)`;
      }

      if (reconnectsThisHour >= MAX_RECONNECTS_PER_HOUR) {
        lastError = "Limite de reconexões atingido. Ação manual necessária.";
        reconnectAt = null;
        reconnectReason = null;
        console.warn("[WA] Limite de reconexões atingido. Parando.");
        return;
      }

      reconnectAttempts = Math.min(reconnectAttempts + 1, 5);
      scheduleReconnect(delay, reason);
    }
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// Public connection controls
// ─────────────────────────────────────────────────────────────────────────────

export async function disconnectWhatsApp(): Promise<void> {
  if (restartTimeout) { clearTimeout(restartTimeout); restartTimeout = null; }
  if (businessHoursCheckTimeout) { clearTimeout(businessHoursCheckTimeout); businessHoursCheckTimeout = null; }
  if (sock) { try { await sock.logout(); } catch {} sock = null; }
  await deleteSession();
  status = "disconnected";
  qrDataUrl = null;
  connectedPhone = null;
  reconnectAt = null;
  reconnectReason = null;
  console.log("[WA] Desconectado.");
}

export async function reconnectFresh(): Promise<void> {
  if (restartTimeout) { clearTimeout(restartTimeout); restartTimeout = null; }
  if (sock) { try { await sock.logout(); } catch {} sock = null; }
  await deleteSession();
  await clearBanFromFirestore();
  status = "disconnected";
  qrDataUrl = null;
  connectedPhone = null;
  connectedSince = null;
  lastError = null;
  reconnectAttempts = 0;
  reconnectAt = null;
  reconnectReason = null;
  reconnectsThisHour = 0;
  reconnectsHourStart = Date.now();
  riskLevel = "normal";
  console.log("[WA] Reconexão limpa iniciada.");
  connect();
}

// ─────────────────────────────────────────────────────────────────────────────
// Status
// ─────────────────────────────────────────────────────────────────────────────

export function getWhatsAppStatus(): WhatsAppStatus {
  let warmupInfo: WhatsAppStatus["warmup"] = null;
  if (warmupActive && warmupData) {
    refreshWarmupDay();
    const limit = warmupDailyLimit();
    const nextDay = Math.min(warmupData.day, WARMUP_LIMITS.length - 1);
    const nextDayLimit = WARMUP_LIMITS[nextDay] ?? 1500;
    warmupInfo = {
      active: true,
      day: warmupData.day,
      dailyLimit: limit === Infinity ? 9999 : limit,
      sentToday: warmupData.sentToday,
      nextDayLimit,
    };
  }
  return {
    status,
    qr: qrDataUrl,
    phone: connectedPhone,
    lastError,
    reconnectAt,
    reconnectReason,
    riskLevel,
    reconnectAttempts,
    connectedSince,
    warmup: warmupInfo,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Send message (direct, internal)
// ─────────────────────────────────────────────────────────────────────────────

async function sendWhatsAppMessageDirect(phone: string, message: string): Promise<boolean> {
  if (status !== "connected" || !sock) return false;
  try {
    const digits = phone.replace(/\D/g, "");
    const jid = (digits.startsWith("55") ? digits : `55${digits}`) + "@s.whatsapp.net";

    // Typing simulation (~40 WPM / ~30ms per char)
    await sock.sendPresenceUpdate("composing", jid);
    const typingMs = Math.max(1500, Math.min(message.length * 30, 8000));
    const jitter = (Math.random() - 0.5) * 1000;
    await new Promise((r) => setTimeout(r, typingMs + jitter));

    await sock.sendMessage(jid, { text: message });
    await sock.sendPresenceUpdate("paused", jid);
    console.log(`[WA] Mensagem enviada para ${jid}`);
    return true;
  } catch (e) {
    console.error("[WA] Erro ao enviar mensagem:", e);
    return false;
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// WhatsApp queue processor
// ─────────────────────────────────────────────────────────────────────────────

async function processWhatsAppQueue() {
  if (waQueueProcessing || !adminDbRef) return;
  waQueueProcessing = true;
  console.log("[WA] Processando fila WhatsApp...");
  try {
    // Wrapped in outer try/catch to prevent unhandled rejections from crashing the process
    while (status === "connected") {
      // Business hours check
      if (!isBusinessHours()) {
        const waitMs = msUntilBusinessHours();
        console.log(`[WA] Fora do horário de envio. Retomando às 07h.`);
        // Schedule a retry when business hours open
        if (businessHoursCheckTimeout) clearTimeout(businessHoursCheckTimeout);
        businessHoursCheckTimeout = setTimeout(() => {
          businessHoursCheckTimeout = null;
          if (status === "connected") processWhatsAppQueue();
        }, waitMs);
        break;
      }

      // Warm-up limit check
      if (!warmupCanSend()) {
        console.log(`[WA] Limite diário de warm-up atingido (${warmupData?.sentToday}/${warmupDailyLimit()}). Pausando fila.`);
        break;
      }

      const snap = await adminDbRef
        .collection("message_queue")
        .where("channel", "==", "whatsapp")
        .where("status", "in", ["pending", "retry"])
        .orderBy("createdAt", "asc")
        .limit(1)
        .get();

      if (snap.empty) break;

      const docRef = snap.docs[0].ref;
      const item = snap.docs[0].data() as QueuedMessage;

      await docRef.update({ status: "sending", lastAttemptAt: new Date().toISOString() });

      const ok = await sendWhatsAppMessageDirect(item.to, item.message ?? "");

      if (ok) {
        await docRef.update({ status: "sent", sentAt: new Date().toISOString(), error: null });
        await warmupRecordSent();
        console.log(`[WA] Fila: enviado para ${item.name}`);
        resetHealthCountersIfNeeded();
      } else {
        failedMessagesThisHour++;
        updateRiskLevel();
        const attempts = (item.attempts || 0) + 1;
        const failed = attempts >= MAX_ATTEMPTS;
        await docRef.update({
          status: failed ? "failed" : "retry",
          attempts,
          error: "Falha no envio",
          lastAttemptAt: new Date().toISOString(),
        });
        if (failed) {
          console.warn(`[WA] Fila: falha permanente para ${item.name}`);
        } else {
          console.warn(`[WA] Fila: tentativa ${attempts}/${MAX_ATTEMPTS} para ${item.name}`);
        }
      }

      if (status === "connected") await humanDelay();
    }
  } catch (err) {
    console.error("[WA] Erro ao processar fila WhatsApp:", err);
  } finally {
    waQueueProcessing = false;
    console.log("[WA] Fila WhatsApp: processamento concluído.");
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Email queue worker
// ─────────────────────────────────────────────────────────────────────────────

export async function initEmailWorker(db: any): Promise<void> {
  if (!adminDbRef) adminDbRef = db;
  if (emailWorkerInterval) return; // already running
  console.log("[email] Worker de e-mail iniciado.");
  processEmailQueue().catch(console.error);
  emailWorkerInterval = setInterval(() => {
    processEmailQueue().catch(console.error);
  }, 30000);
}

async function processEmailQueue() {
  if (emailQueueProcessing || !adminDbRef) return;
  emailQueueProcessing = true;
  try {
    while (true) {
      const snap = await adminDbRef
        .collection("message_queue")
        .where("channel", "==", "email")
        .where("status", "in", ["pending", "retry"])
        .orderBy("createdAt", "asc")
        .limit(5)
        .get();

      if (snap.empty) break;

      for (const docSnap of snap.docs) {
        const docRef = docSnap.ref;
        const item = docSnap.data() as QueuedMessage;

        // Apply retry delay for subsequent attempts
        const attempts = item.attempts || 0;
        if (attempts > 0 && item.lastAttemptAt) {
          const lastAttemptMs = new Date(item.lastAttemptAt).getTime();
          const requiredDelay = EMAIL_RETRY_DELAYS[Math.min(attempts, EMAIL_RETRY_DELAYS.length - 1)];
          if (Date.now() - lastAttemptMs < requiredDelay) continue;
        }

        await docRef.update({ status: "sending", lastAttemptAt: new Date().toISOString() });

        try {
          if (!item.registrationId) throw new Error("registrationId ausente");
          const regDoc = await adminDbRef.collection("registrations").doc(item.registrationId).get();
          if (!regDoc.exists) throw new Error(`Registro ${item.registrationId} não encontrado`);
          const reg = regDoc.data();

          if (item.emailType === "confirmation") {
            await sendConfirmationEmail(reg, item.registrationId);
          } else if (item.emailType === "pending") {
            await sendPendingEmail(reg, item.registrationId);
          } else if (item.emailType === "term") {
            await sendSignedTermEmail(reg, item.registrationId);
          } else if (item.emailType === "reminder1") {
            await sendReminder1Email(reg, item.registrationId);
          } else if (item.emailType === "reminder2") {
            await sendReminder2Email(reg, item.registrationId);
          } else if (item.emailType === "reminder3") {
            await sendReminder3Email(reg, item.registrationId);
          } else if (item.emailType === "reminder4") {
            await sendReminder4Email(reg, item.registrationId);
          } else if (item.emailType === "cancelled_auto") {
            await sendAutoCancelledEmail(reg, item.registrationId);
          } else {
            throw new Error(`emailType desconhecido: ${item.emailType}`);
          }

          await docRef.update({ status: "sent", sentAt: new Date().toISOString(), error: null });
          console.log(`[email] Worker: enviado ${item.emailType} para ${item.name} (${item.to})`);
        } catch (err: any) {
          const newAttempts = attempts + 1;
          const failed = newAttempts >= MAX_ATTEMPTS;
          await docRef.update({
            status: failed ? "failed" : "retry",
            attempts: newAttempts,
            error: err?.message ?? "Erro desconhecido",
            lastAttemptAt: new Date().toISOString(),
          });
          if (failed) {
            console.error(`[email] Worker: falha permanente para ${item.name} — ${err?.message}`);
          } else {
            console.warn(`[email] Worker: tentativa ${newAttempts}/${MAX_ATTEMPTS} para ${item.name}`);
          }
        }
      }

      // If we processed fewer than 5, queue is likely empty
      if (snap.docs.length < 5) break;
    }
  } catch (err) {
    console.error("[email] Erro ao processar fila:", err);
  } finally {
    emailQueueProcessing = false;
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Unified enqueue
// ─────────────────────────────────────────────────────────────────────────────

export async function enqueueMessage(opts: {
  channel: "email" | "whatsapp";
  to: string;
  name: string;
  subject: string;
  message?: string;
  emailType?: "confirmation" | "pending" | "term" | "reminder1" | "reminder2" | "reminder3" | "reminder4" | "cancelled_auto";
  registrationId?: string;
}): Promise<void> {
  if (!adminDbRef) return;
  await adminDbRef.collection("message_queue").add({
    channel: opts.channel,
    status: "pending",
    to: opts.channel === "whatsapp" ? opts.to.replace(/\D/g, "") : opts.to,
    name: opts.name,
    subject: opts.subject,
    message: opts.message ?? null,
    emailType: opts.emailType ?? null,
    registrationId: opts.registrationId ?? null,
    attempts: 0,
    createdAt: new Date().toISOString(),
    lastAttemptAt: null,
    sentAt: null,
    error: null,
  } satisfies QueuedMessage);
  console.log(`[queue] Mensagem enfileirada: ${opts.channel} → ${opts.name}`);
  if (opts.channel === "whatsapp" && status === "connected") processWhatsAppQueue().catch(console.error);
  if (opts.channel === "email") processEmailQueue().catch(console.error);
}

// ─────────────────────────────────────────────────────────────────────────────
// retryMessage
// ─────────────────────────────────────────────────────────────────────────────

export async function retryMessage(messageId: string): Promise<void> {
  if (!adminDbRef) return;
  await adminDbRef.collection("message_queue").doc(messageId).update({
    status: "pending",
    attempts: 0,
    error: null,
    lastAttemptAt: null,
  });
  if (status === "connected") processWhatsAppQueue().catch(console.error);
  processEmailQueue().catch(console.error);
}

// ─────────────────────────────────────────────────────────────────────────────
// Backward-compat alias
// ─────────────────────────────────────────────────────────────────────────────

export async function enqueueWhatsAppMessage(opts: {
  phone: string;
  message: string;
  name: string;
  registrationId?: string;
}): Promise<void> {
  await enqueueMessage({
    channel: "whatsapp",
    to: opts.phone,
    name: opts.name,
    subject: "WhatsApp",
    message: opts.message,
    registrationId: opts.registrationId,
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// Message template
// ─────────────────────────────────────────────────────────────────────────────

export function buildConfirmationMessage(reg: Record<string, any>): string {
  const greetings = ["Olá", "Oi", "Tudo certo"];
  const closings = [
    "Nos vemos em Presidente Olegário! 🤝",
    "Te esperamos lá! 🏍️",
    "Até lá! 🤝",
  ];
  const greeting = greetings[Math.floor(Math.random() * greetings.length)];
  const closing = closings[Math.floor(Math.random() * closings.length)];
  const firstName = reg.name?.split(" ")[0] ?? "piloto";
  const vouchers = (reg.vouchers as any[])?.length ?? 0;

  const lines = [
    `${greeting}, *${firstName}*! 🏍️`,
    ``,
    `Sua inscrição no *Trilhão Beneficente* foi confirmada!`,
    ``,
    `📋 Nº *${reg.registrationNumber ?? "—"}*`,
    `👕 Camiseta: *${reg.shirtSize ?? "—"}*`,
  ];
  if (vouchers > 0) lines.push(`🎫 Vouchers de almoço: *${vouchers}*`);
  lines.push(``, `Seu comprovante foi enviado por e-mail.`, closing);
  return lines.join("\n");
}

// WhatsApp Cloud API (Meta) — serviço centralizado de envio
// Docs: https://developers.facebook.com/docs/whatsapp/cloud-api/reference/messages

const GRAPH_BASE = "https://graph.facebook.com";

function envFlag(name: string, defaultValue: boolean): boolean {
  const raw = process.env[name];
  if (raw == null || raw === "") return defaultValue;
  return raw.toLowerCase() === "true";
}

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

export interface MetaSendResult {
  success: boolean;
  messageId?: string;
  error?: string;
  errorCode?: number;
  simulated?: boolean;
  skippedReason?: "disabled" | "dry_run";
}

interface MetaTextPayload {
  messaging_product: "whatsapp";
  to: string;
  type: "text";
  text: { body: string };
}

interface MetaTemplateComponent {
  type: "body";
  parameters: Array<{ type: "text"; text: string }>;
}

interface MetaTemplatePayload {
  messaging_product: "whatsapp";
  to: string;
  type: "template";
  template: {
    name: string;
    language: { code: string };
    components?: MetaTemplateComponent[];
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Template map — define os templates cadastrados na Meta
// Os parâmetros devem corresponder às variáveis {{1}}, {{2}}, ... no template
// aprovado no WhatsApp Business Manager.
// ─────────────────────────────────────────────────────────────────────────────

export const whatsappTemplates = {
  /** Confirmação de inscrição e pagamento aprovado */
  confirmacao_inscricao: {
    name: "confirmacao_trilhao",
    language: "pt_BR",
    /** params: [nome, shirtSize, evento, numeroInscricao] */
    params: ["nome", "shirtSize", "evento", "numeroInscricao"] as const,
  },
} as const;

export type TemplateName = keyof typeof whatsappTemplates;

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

/** Normaliza telefone para formato E.164 sem '+': 5511999998888 */
export function normalizeBrPhone(phone: string): string {
  const digits = phone.replace(/\D/g, "");
  // Já tem DDI 55
  if (digits.startsWith("55") && digits.length >= 12) return digits;
  // Adiciona DDI BR
  if (digits.length === 11 || digits.length === 10) return `55${digits}`;
  return digits;
}

function isValidPhone(phone: string): boolean {
  return phone.length >= 12 && /^\d+$/.test(phone);
}

function getEnv() {
  const version = process.env.META_GRAPH_VERSION || "v20.0";
  const token = process.env.WHATSAPP_ACCESS_TOKEN;
  const phoneNumberId = process.env.WHATSAPP_PHONE_NUMBER_ID;
  const enabled = envFlag("WHATSAPP_ENABLED", false);
  const dryRun = envFlag("WHATSAPP_DRY_RUN", true);
  return { version, token, phoneNumberId, enabled, dryRun };
}

function isConfigured(): boolean {
  const { token, phoneNumberId } = getEnv();
  return !!(token && phoneNumberId);
}

async function postToMeta(
  version: string,
  phoneNumberId: string,
  token: string,
  payload: MetaTextPayload | MetaTemplatePayload,
): Promise<MetaSendResult> {
  const url = `${GRAPH_BASE}/${version}/${phoneNumberId}/messages`;
  let resp: Response;
  try {
    resp = await fetch(url, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(payload),
    });
  } catch (err: any) {
    return { success: false, error: `Falha de rede: ${err?.message ?? err}` };
  }

  let body: any;
  try {
    body = await resp.json();
  } catch {
    body = {};
  }

  if (!resp.ok) {
    const metaErr = body?.error;
    const msg = metaErr?.message ?? `HTTP ${resp.status}`;
    const code = metaErr?.code;
    console.error(`[WA Meta] Erro ao enviar: ${msg} (code=${code})`);
    return { success: false, error: msg, errorCode: code };
  }

  const messageId = body?.messages?.[0]?.id;
  return { success: true, messageId };
}

// ─────────────────────────────────────────────────────────────────────────────
// Public API
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Verifica se a integração está configurada (variáveis presentes).
 * Não valida credenciais contra a API da Meta.
 */
export function getMetaWhatsAppConfigStatus(): {
  configured: boolean;
  phoneNumberId: boolean;
  businessAccountId: boolean;
  webhookVerifyToken: boolean;
  accessToken: boolean;
  appSecret: boolean;
  enabled: boolean;
  dryRun: boolean;
  productionUnsafe: boolean;
} {
  const { enabled, dryRun } = getEnv();
  const appSecret = !!process.env.META_APP_SECRET;
  return {
    configured: isConfigured(),
    phoneNumberId: !!process.env.WHATSAPP_PHONE_NUMBER_ID,
    businessAccountId: !!process.env.WHATSAPP_BUSINESS_ACCOUNT_ID,
    webhookVerifyToken: !!process.env.WHATSAPP_WEBHOOK_VERIFY_TOKEN,
    accessToken: !!process.env.WHATSAPP_ACCESS_TOKEN,
    appSecret,
    enabled,
    dryRun,
    productionUnsafe: process.env.NODE_ENV === "production" && enabled && !dryRun && !appSecret,
  };
}

/**
 * Envia mensagem de texto livre (funciona apenas em janela de 24h após o usuário
 * iniciar a conversa — use templates para mensagens proativas).
 */
export async function sendWhatsAppTextMessage(opts: {
  to: string;
  body: string;
}): Promise<MetaSendResult> {
  const { version, token, phoneNumberId, enabled, dryRun } = getEnv();

  if (!enabled) {
    console.warn("[WA Meta] WHATSAPP_ENABLED=false. Mensagem não enviada.");
    return { success: true, messageId: "disabled", simulated: true, skippedReason: "disabled" };
  }

  if (!isConfigured()) {
    console.warn("[WA Meta] Integração não configurada. Mensagem não enviada.");
    return { success: false, error: "Integração Meta não configurada" };
  }

  const to = normalizeBrPhone(opts.to);

  if (!isValidPhone(to)) {
    return { success: false, error: `Telefone inválido: ${opts.to}` };
  }

  if (dryRun) {
    console.log(`[WA Meta] DRY_RUN ativo: texto não enviado para ${to}`);
    return { success: true, messageId: "dry-run", simulated: true, skippedReason: "dry_run" };
  }

  const payload: MetaTextPayload = {
    messaging_product: "whatsapp",
    to,
    type: "text",
    text: { body: opts.body },
  };

  console.log(`[WA Meta] Enviando texto para ${to}`);
  return postToMeta(version, phoneNumberId!, token!, payload);
}

/**
 * Envia mensagem via template oficial da Meta.
 * O template deve estar cadastrado e aprovado no WhatsApp Business Manager.
 */
export async function sendWhatsAppTemplate(opts: {
  to: string;
  templateName: string;
  languageCode?: string;
  parameters?: string[];
}): Promise<MetaSendResult> {
  const { version, token, phoneNumberId, enabled, dryRun } = getEnv();

  if (!enabled) {
    console.warn("[WA Meta] WHATSAPP_ENABLED=false. Template não enviado.");
    return { success: true, messageId: "disabled", simulated: true, skippedReason: "disabled" };
  }

  if (!isConfigured()) {
    console.warn("[WA Meta] Integração não configurada. Mensagem não enviada.");
    return { success: false, error: "Integração Meta não configurada" };
  }

  const to = normalizeBrPhone(opts.to);

  if (!isValidPhone(to)) {
    return { success: false, error: `Telefone inválido: ${opts.to}` };
  }

  if (dryRun) {
    console.log(`[WA Meta] DRY_RUN ativo: template "${opts.templateName}" não enviado para ${to}`);
    return { success: true, messageId: "dry-run", simulated: true, skippedReason: "dry_run" };
  }

  const components: MetaTemplateComponent[] = opts.parameters?.length
    ? [
        {
          type: "body",
          parameters: opts.parameters.map((text) => ({ type: "text", text })),
        },
      ]
    : [];

  const payload: MetaTemplatePayload = {
    messaging_product: "whatsapp",
    to,
    type: "template",
    template: {
      name: opts.templateName,
      language: { code: opts.languageCode ?? "pt_BR" },
      ...(components.length && { components }),
    },
  };

  console.log(`[WA Meta] Enviando template "${opts.templateName}" para ${to}`);
  return postToMeta(version, phoneNumberId!, token!, payload);
}

/**
 * Monta e envia a mensagem de confirmação de inscrição via template Meta.
 * Template "confirmacao_trilhao" com 4 variáveis:
 *   {{1}} = primeiro nome
 *   {{2}} = tamanho da camiseta
 *   {{3}} = nome do evento
 *   {{4}} = número da inscrição
 */
export async function sendConfirmationWhatsApp(
  reg: Record<string, any>,
): Promise<MetaSendResult> {
  if (!reg.phone) return { success: false, error: "Telefone ausente na inscrição" };

  const firstName = String(reg.name ?? "piloto").split(" ")[0];
  const shirtSize = String(reg.shirtSize ?? "—");
  const evento = "Trilhão Beneficente - Presidente Olegário MG";
  const regNumber = String(reg.registrationNumber ?? "—");

  return sendWhatsAppTemplate({
    to: reg.phone,
    templateName: whatsappTemplates.confirmacao_inscricao.name,
    languageCode: whatsappTemplates.confirmacao_inscricao.language,
    parameters: [firstName, shirtSize, evento, regNumber],
  });
}

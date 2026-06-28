// Fila unificada de mensagens — e-mail e WhatsApp (Meta Cloud API)
// Baileys removido: substituído pela WhatsApp Cloud API oficial da Meta.

import {
  sendConfirmationEmail,
  sendPendingEmail,
  sendSignedTermEmail,
  sendReminder1Email,
  sendReminder2Email,
  sendReminder3Email,
  sendReminder4Email,
  sendAutoCancelledEmail,
} from "./email";
import { sendConfirmationWhatsApp } from "./whatsappMeta";

// ─────────────────────────────────────────────────────────────────────────────
// Constants
// ─────────────────────────────────────────────────────────────────────────────

const MAX_ATTEMPTS = 3;
const EMAIL_RETRY_DELAYS = [0, 2 * 60 * 1000, 10 * 60 * 1000]; // 0, 2min, 10min

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

interface QueuedMessage {
  channel: "email" | "whatsapp";
  status: "pending" | "sending" | "sent" | "retry" | "failed" | "dry_run" | "disabled";
  to: string;
  name: string;
  subject: string;
  message: string | null;
  emailType:
    | "confirmation"
    | "pending"
    | "term"
    | "reminder1"
    | "reminder2"
    | "reminder3"
    | "reminder4"
    | "cancelled_auto"
    | null;
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

let adminDbRef: any = null;
let emailQueueProcessing = false;
let waQueueProcessing = false;
let emailWorkerInterval: ReturnType<typeof setInterval> | null = null;

// ─────────────────────────────────────────────────────────────────────────────
// E-mail worker
// ─────────────────────────────────────────────────────────────────────────────

export async function initEmailWorker(db: any): Promise<void> {
  if (!adminDbRef) adminDbRef = db;
  if (emailWorkerInterval) return;
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

        const attempts = item.attempts || 0;
        if (attempts > 0 && item.lastAttemptAt) {
          const lastAttemptMs = new Date(item.lastAttemptAt).getTime();
          const requiredDelay =
            EMAIL_RETRY_DELAYS[Math.min(attempts, EMAIL_RETRY_DELAYS.length - 1)];
          if (Date.now() - lastAttemptMs < requiredDelay) continue;
        }

        await docRef.update({ status: "sending", lastAttemptAt: new Date().toISOString() });

        try {
          if (!item.registrationId) throw new Error("registrationId ausente");
          const regDoc = await adminDbRef
            .collection("registrations")
            .doc(item.registrationId)
            .get();
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

          await docRef.update({
            status: "sent",
            sentAt: new Date().toISOString(),
            error: null,
          });
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
            console.error(
              `[email] Worker: falha permanente para ${item.name} — ${err?.message}`,
            );
          } else {
            console.warn(
              `[email] Worker: tentativa ${newAttempts}/${MAX_ATTEMPTS} para ${item.name}`,
            );
          }
        }
      }

      if (snap.docs.length < 5) break;
    }
  } catch (err) {
    console.error("[email] Erro ao processar fila:", err);
  } finally {
    emailQueueProcessing = false;
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// WhatsApp (Meta) queue processor
// ─────────────────────────────────────────────────────────────────────────────

async function processWhatsAppQueue() {
  if (waQueueProcessing || !adminDbRef) return;
  waQueueProcessing = true;
  console.log("[WA Meta] Processando fila WhatsApp...");
  try {
    while (true) {
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

      try {
        if (!item.registrationId) throw new Error("registrationId ausente");
        const regDoc = await adminDbRef
          .collection("registrations")
          .doc(item.registrationId)
          .get();
        if (!regDoc.exists) throw new Error(`Registro ${item.registrationId} não encontrado`);
        const reg = regDoc.data();

        const result = await sendConfirmationWhatsApp(reg);

        if (result.success) {
          if (result.simulated) {
            const simulatedStatus = result.skippedReason === "disabled" ? "disabled" : "dry_run";
            await docRef.update({
              status: simulatedStatus,
              simulatedAt: new Date().toISOString(),
              sentAt: null,
              error: null,
              ...(result.messageId && { metaMessageId: result.messageId }),
            });
            console.log(`[WA Meta] Fila: simulado (${simulatedStatus}) para ${item.name}`);
          } else {
            await docRef.update({
              status: "sent",
              sentAt: new Date().toISOString(),
              error: null,
              ...(result.messageId && { metaMessageId: result.messageId }),
            });
            console.log(`[WA Meta] Fila: enviado para ${item.name}`);
          }
        } else {
          throw new Error(result.error ?? "Falha no envio Meta");
        }
      } catch (err: any) {
        const attempts = (item.attempts || 0) + 1;
        const failed = attempts >= MAX_ATTEMPTS;
        await docRef.update({
          status: failed ? "failed" : "retry",
          attempts,
          error: err?.message ?? "Erro desconhecido",
          lastAttemptAt: new Date().toISOString(),
        });
        if (failed) {
          console.warn(`[WA Meta] Fila: falha permanente para ${item.name}`);
        } else {
          console.warn(
            `[WA Meta] Fila: tentativa ${attempts}/${MAX_ATTEMPTS} para ${item.name}`,
          );
        }
      }
    }
  } catch (err) {
    console.error("[WA Meta] Erro ao processar fila WhatsApp:", err);
  } finally {
    waQueueProcessing = false;
    console.log("[WA Meta] Fila WhatsApp: processamento concluído.");
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
  emailType?:
    | "confirmation"
    | "pending"
    | "term"
    | "reminder1"
    | "reminder2"
    | "reminder3"
    | "reminder4"
    | "cancelled_auto";
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

  if (opts.channel === "whatsapp") processWhatsAppQueue().catch(console.error);
  if (opts.channel === "email") processEmailQueue().catch(console.error);
}

// ─────────────────────────────────────────────────────────────────────────────
// Retry
// ─────────────────────────────────────────────────────────────────────────────

export async function retryMessage(messageId: string): Promise<void> {
  if (!adminDbRef) return;
  await adminDbRef.collection("message_queue").doc(messageId).update({
    status: "pending",
    attempts: 0,
    error: null,
    lastAttemptAt: null,
  });
  processWhatsAppQueue().catch(console.error);
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
// buildConfirmationMessage — mantido para compatibilidade.
// O texto abaixo representa o conteúdo sugerido para o template Meta
// "confirmacao_inscricao". O envio real usa sendWhatsAppTemplate() via Meta API.
// ─────────────────────────────────────────────────────────────────────────────

export function buildConfirmationMessage(reg: Record<string, any>): string {
  const firstName = reg.name?.split(" ")[0] ?? "piloto";
  const vouchers = (reg.vouchers as any[])?.length ?? 0;
  const lines = [
    `Olá, *${firstName}*! 🏍️`,
    ``,
    `Sua inscrição no *Trilhão Beneficente* foi confirmada!`,
    ``,
    `📋 Nº *${reg.registrationNumber ?? "—"}*`,
    `👕 Camiseta: *${reg.shirtSize ?? "—"}*`,
  ];
  if (vouchers > 0) lines.push(`🎫 Vouchers de almoço: *${vouchers}*`);
  lines.push(``, `Seu comprovante foi enviado por e-mail.`, `Nos vemos em Presidente Olegário! 🤝`);
  return lines.join("\n");
}

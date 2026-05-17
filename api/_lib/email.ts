import nodemailer from "nodemailer";
import { Resend } from "resend";
import QRCode from "qrcode";
import { generateConfirmationPdf } from "./pdf";

function fmtCPF(cpf: string | undefined): string {
  const d = (cpf || "").replace(/\D/g, "");
  if (d.length !== 11) return cpf || "—";
  return `${d.slice(0,3)}.${d.slice(3,6)}.${d.slice(6,9)}-${d.slice(9)}`;
}
function shirtLabel(s: string): string {
  const m: Record<string, string> = { P: "P", M: "M", G: "G", GG: "GG", XGG: "XGG", EX: "EX" };
  return m[s] || s || "—";
}
function row(label: string, value: string): string {
  return `<tr><td style="padding:10px 32px;border-bottom:1px solid #F3F4F6;">
    <span style="display:block;font-size:10px;color:#9CA3AF;font-weight:700;text-transform:uppercase;letter-spacing:.5px;margin-bottom:3px;">${label}</span>
    <span style="font-size:14px;color:#111827;font-weight:600;">${value}</span>
  </td></tr>`;
}
function tip(text: string): string {
  return `<tr><td style="padding:3px 0;">
    <table cellpadding="0" cellspacing="0"><tr>
      <td style="padding-right:8px;vertical-align:top;color:#FBBF24;font-weight:900;font-size:13px;">→</td>
      <td style="font-size:12px;color:#4B5563;line-height:1.6;">${text}</td>
    </tr></table>
  </td></tr>`;
}

function getAppUrl(): string {
  return (process.env.APP_URL || "https://trilhao-web-production.up.railway.app").replace(/\/$/, "");
}

function getGmailTransporter() {
  const user = process.env.GMAIL_USER;
  const pass = process.env.GMAIL_APP_PASSWORD;
  if (!user || !pass) return null;
  return nodemailer.createTransport({
    host: "smtp.gmail.com",
    port: 587,
    secure: false,
    family: 4,
    auth: { user, pass },
  } as any);
}

function getFromEmail(): string {
  const gmailUser = process.env.GMAIL_USER;
  if (gmailUser) return `"Trilhão Beneficente" <${gmailUser}>`;
  return process.env.EMAIL_FROM || "Trilhão Beneficente <onboarding@resend.dev>";
}

async function sendMail(opts: {
  to: string;
  subject: string;
  html: string;
  attachments?: { filename: string; content: Buffer }[];
}): Promise<void> {
  const gmail = getGmailTransporter();
  if (gmail) {
    await gmail.sendMail({
      from: getFromEmail(),
      to: opts.to,
      subject: opts.subject,
      html: opts.html,
      attachments: opts.attachments?.map(a => ({
        filename: a.filename,
        content: a.content,
        contentType: "application/pdf",
      })),
    });
    return;
  }
  // Fallback: Resend
  const apiKey = process.env.RESEND_API_KEY;
  if (apiKey) {
    const resend = new Resend(apiKey);
    await resend.emails.send({
      from: getFromEmail(),
      to: opts.to,
      subject: opts.subject,
      html: opts.html,
      attachments: opts.attachments?.map(a => ({
        filename: a.filename,
        content: a.content.toString("base64"),
      })),
    });
    return;
  }
  throw new Error("Nenhum provedor de e-mail configurado (GMAIL_USER ou RESEND_API_KEY).");
}

function isEmailConfigured(): boolean {
  return !!(process.env.GMAIL_USER && process.env.GMAIL_APP_PASSWORD) || !!process.env.RESEND_API_KEY;
}

// ─────────────────────────────────────────────────────────────────────────────
// E-MAIL 1 — Inscrição recebida (status: pendente)
// ─────────────────────────────────────────────────────────────────────────────
export async function sendPendingEmail(reg: any, docId: string): Promise<void> {
  if (!isEmailConfigured() || !reg?.email) return;

  const appUrl = getAppUrl();
  const paymentUrl = `${appUrl}/payment/${docId}`;

  const html = `<!DOCTYPE html>
<html lang="pt-BR">
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1.0"></head>
<body style="margin:0;padding:0;background:#F4F4F5;font-family:Arial,Helvetica,sans-serif;">
<table width="100%" cellpadding="0" cellspacing="0" style="padding:32px 16px;">
<tr><td align="center">
<table width="600" cellpadding="0" cellspacing="0" style="max-width:600px;width:100%;">

  <tr><td style="background:#111827;border-radius:16px 16px 0 0;padding:36px 32px 28px;text-align:center;">
    <p style="margin:0 0 6px;font-size:10px;font-weight:900;letter-spacing:3px;text-transform:uppercase;color:#FBBF24;opacity:.7;">8ª Edição · 2026</p>
    <h1 style="margin:0 0 6px;font-size:26px;font-weight:900;color:#FBBF24;">Trilhão da Solidariedade</h1>
    <p style="margin:0;font-size:12px;color:rgba(255,255,255,.45);">Presidente Olegário — MG · 100% revertido à ASSOAPAC</p>
  </td></tr>

  <tr><td style="background:#111827;padding:0 32px 28px;text-align:center;">
    <div style="background:#92400E22;border:1px solid #F59E0B;border-radius:50px;display:inline-block;padding:6px 20px;margin-bottom:8px;">
      <span style="font-size:12px;font-weight:700;color:#F59E0B;">⏳ Aguardando Confirmação do Pagamento</span>
    </div>
    <p style="margin:8px 0 0;font-size:11px;color:rgba(255,255,255,.4);">Inscrição Nº <strong style="color:#FBBF24;">#${reg.registrationNumber || "—"}</strong></p>
  </td></tr>

  <tr><td style="background:#fff;padding:0;">
    <table width="100%" cellpadding="0" cellspacing="0">
      <tr><td style="padding:24px 32px 12px;">
        <p style="margin:0;font-size:15px;font-weight:700;color:#111827;">Olá, <strong>${reg.name?.split(" ")[0] || "piloto"}</strong>! 👋</p>
        <p style="margin:10px 0 0;font-size:13px;color:#6B7280;line-height:1.6;">Recebemos sua inscrição para o <strong style="color:#111827;">8º Trilhão da Solidariedade</strong>. Falta apenas a confirmação do seu pagamento PIX para garantir sua vaga.</p>
      </td></tr>

      <tr><td style="padding:0 32px 20px;">
        <div style="background:#FFFBEB;border:1px solid #FCD34D;border-radius:14px;padding:20px;">
          <p style="margin:0 0 8px;font-size:11px;font-weight:900;color:#92400E;text-transform:uppercase;letter-spacing:1px;">⚡ Ação necessária</p>
          <p style="margin:0 0 14px;font-size:13px;color:#78350F;line-height:1.5;">Seu PIX foi gerado. Acesse a página de pagamento para copiar o código ou escanear o QR Code e concluir sua inscrição.</p>
          <a href="${paymentUrl}" style="display:inline-block;background:#111827;color:#FBBF24;font-weight:900;font-size:13px;text-decoration:none;padding:12px 24px;border-radius:10px;">Acessar Página de Pagamento →</a>
        </div>
      </td></tr>

      <tr><td style="padding:0 32px 8px;border-top:1px solid #F3F4F6;">
        <p style="margin:16px 0 8px;font-size:10px;font-weight:900;letter-spacing:1.5px;text-transform:uppercase;color:#9CA3AF;">Resumo da Inscrição</p>
      </td></tr>
      ${row("Piloto", reg.name || "—")}
      ${row("CPF", fmtCPF(reg.cpf))}
      ${row("Motocicleta", reg.motorcycle || "—")}
      ${row("Camiseta", shirtLabel(reg.shirtSize))}
      ${row("Contato de Emergência", `${reg.emergencyName || "—"} · ${reg.emergencyPhone || "—"}`)}
      ${row("Valor da Inscrição", `R$ ${Number(reg.amount || 0).toLocaleString("pt-BR", { minimumFractionDigits: 2 })}`)}

      <tr><td style="padding:20px 32px;background:#F9FAFB;border-radius:0 0 16px 16px;">
        <p style="margin:0 0 10px;font-size:10px;font-weight:900;letter-spacing:1.5px;text-transform:uppercase;color:#9CA3AF;">Após o pagamento confirmado você receberá:</p>
        <table cellpadding="0" cellspacing="0">
          ${tip("Um novo e-mail com seu comprovante oficial em PDF para apresentar no evento")}
          ${tip("QR Code exclusivo para agilizar seu credenciamento na recepção")}
          ${tip("Instruções completas para o dia do evento")}
        </table>
      </td></tr>
    </table>
  </td></tr>

  <tr><td style="padding:20px 16px;text-align:center;">
    <p style="margin:0;font-size:11px;color:#9CA3AF;">Dúvidas? Entre em contato com a organização pelo WhatsApp.</p>
    <p style="margin:12px 0 0;font-size:10px;color:#D1D5DB;">ASSOAPAC · Associação de Apoio ao Paciente com Câncer de Presidente Olegário</p>
  </td></tr>

</table>
</td></tr>
</table>
</body></html>`;

  try {
    await sendMail({
      to: reg.email,
      subject: `📋 Inscrição #${reg.registrationNumber} recebida — aguardando pagamento · 8º Trilhão`,
      html,
    });
    console.log(`[email] Pending email sent to ${reg.email}`);
  } catch (err) {
    console.error("[email] Failed to send pending email:", err);
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// E-MAIL 2 — Comprovante oficial (status: aprovado) com PDF em anexo
// ─────────────────────────────────────────────────────────────────────────────
export async function sendConfirmationEmail(reg: any, docId: string): Promise<void> {
  if (!isEmailConfigured() || !reg?.email) {
    console.log("[email] Provedor de e-mail não configurado ou e-mail ausente, ignorando.");
    return;
  }

  const appUrl = getAppUrl();
  const checkinUrl = `${appUrl}/checkin/${docId}`;

  // Gera QR code como base64 para o e-mail
  let qrDataUrl = "";
  try {
    console.log("[email] gerando QR code...");
    qrDataUrl = await QRCode.toDataURL(checkinUrl, { width: 200, margin: 2, color: { dark: "#111827", light: "#ffffff" } });
    console.log("[email] QR code gerado");
  } catch (err) {
    console.error("[email] Erro ao gerar QR code:", err);
  }

  // Gera PDF do comprovante
  let pdfBuffer: Buffer | null = null;
  try {
    console.log("[email] gerando PDF...");
    pdfBuffer = await generateConfirmationPdf({ ...reg, status: "approved" }, docId, appUrl);
    console.log("[email] PDF gerado, tamanho:", pdfBuffer?.length);
  } catch (err) {
    console.error("[email] Erro ao gerar PDF:", err);
  }

  const isMinor = reg.guardianName?.trim();

  const html = `<!DOCTYPE html>
<html lang="pt-BR">
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1.0"></head>
<body style="margin:0;padding:0;background:#F4F4F5;font-family:Arial,Helvetica,sans-serif;">
<table width="100%" cellpadding="0" cellspacing="0" style="padding:32px 16px;">
<tr><td align="center">
<table width="600" cellpadding="0" cellspacing="0" style="max-width:600px;width:100%;">

  <tr><td style="background:#111827;border-radius:16px 16px 0 0;padding:36px 32px 28px;text-align:center;">
    <p style="margin:0 0 6px;font-size:10px;font-weight:900;letter-spacing:3px;text-transform:uppercase;color:#FBBF24;opacity:.7;">8ª Edição · 2026</p>
    <h1 style="margin:0 0 6px;font-size:26px;font-weight:900;color:#FBBF24;">Trilhão da Solidariedade</h1>
    <p style="margin:0;font-size:12px;color:rgba(255,255,255,.45);">Presidente Olegário — MG · 100% revertido à ASSOAPAC</p>
  </td></tr>

  <tr><td style="background:#111827;padding:0 32px 28px;text-align:center;">
    <div style="background:#16A34A22;border:1px solid #16A34A;border-radius:50px;display:inline-block;padding:6px 24px;margin-bottom:10px;">
      <span style="font-size:13px;font-weight:700;color:#16A34A;">✅ Vaga Garantida!</span>
    </div><br>
    <div style="background:#FBBF24;border-radius:50px;display:inline-block;padding:6px 24px;">
      <span style="font-size:11px;font-weight:900;color:#111827;letter-spacing:1px;">INSCRIÇÃO #${reg.registrationNumber || "—"}</span>
    </div>
  </td></tr>

  <tr><td style="background:#fff;padding:0;">
    <table width="100%" cellpadding="0" cellspacing="0">

      <tr><td style="padding:28px 32px 8px;">
        <p style="margin:0 0 8px;font-size:15px;font-weight:700;color:#111827;">Parabéns, <strong>${reg.name?.split(" ")[0] || "piloto"}</strong>! 🏍️</p>
        <p style="margin:0;font-size:13px;color:#6B7280;line-height:1.6;">Seu pagamento foi confirmado e sua vaga no <strong style="color:#111827;">8º Trilhão da Solidariedade</strong> está garantida. O comprovante oficial está anexo neste e-mail em PDF.</p>
      </td></tr>

      <tr><td style="padding:16px 32px;">
        <div style="background:#ECFDF5;border:1px solid #A7F3D0;border-radius:14px;padding:16px 20px;">
          <p style="margin:0;font-size:12px;font-weight:900;color:#065F46;text-transform:uppercase;letter-spacing:1px;">📎 Comprovante em anexo</p>
          <p style="margin:6px 0 0;font-size:12px;color:#064E3B;line-height:1.5;">Abra o arquivo <strong>comprovante-trilhao.pdf</strong> para visualizar, salvar ou imprimir seu comprovante oficial de inscrição.</p>
        </div>
      </td></tr>

      <tr><td style="padding:8px 32px 20px;text-align:center;border-bottom:1px solid #F3F4F6;">
        <p style="margin:0 0 6px;font-size:11px;font-weight:900;letter-spacing:1.5px;text-transform:uppercase;color:#9CA3AF;">QR Code para Check-in no Evento</p>
        <p style="margin:0 0 16px;font-size:12px;color:#6B7280;">Apresente na recepção para credenciamento rápido</p>
        ${qrDataUrl ? `<img src="${qrDataUrl}" width="160" height="160" alt="QR Code" style="border-radius:10px;border:3px solid #FBBF24;" />` : ""}
      </td></tr>

      <tr><td style="padding:16px 32px 8px;border-top:1px solid #F3F4F6;">
        <p style="margin:0 0 12px;font-size:10px;font-weight:900;letter-spacing:1.5px;text-transform:uppercase;color:#9CA3AF;">Resumo da Inscrição</p>
      </td></tr>
      ${row("Piloto", reg.name || "—")}
      ${row("CPF", fmtCPF(reg.cpf))}
      ${row("Motocicleta", reg.motorcycle || "—")}
      ${row("Camiseta", shirtLabel(reg.shirtSize))}
      ${row("Contato de Emergência", `${reg.emergencyName || "—"} · ${reg.emergencyPhone || "—"}`)}
      ${isMinor ? row("Responsável Legal", reg.guardianName || "—") : ""}
      ${row("Valor Pago", `R$ ${Number(reg.amount || 0).toLocaleString("pt-BR", { minimumFractionDigits: 2 })}`)}

      <tr><td style="padding:20px 32px;background:#F9FAFB;border-radius:0 0 16px 16px;">
        <p style="margin:0 0 12px;font-size:10px;font-weight:900;letter-spacing:1.5px;text-transform:uppercase;color:#9CA3AF;">Orientações para o dia do evento</p>
        <table cellpadding="0" cellspacing="0">
          ${tip("Apresente o comprovante em PDF (impresso ou no celular) na recepção para realizar o check-in.")}
          ${tip("Escaneie o QR Code acima para acessar a página de credenciamento e assinar o Termo de Responsabilidade.")}
          ${tip("Leve documento oficial com foto (RG ou CNH) para conferência dos dados.")}
          ${tip("Certifique-se de que sua motocicleta está em condições regulares e de que você possui todos os EPIs obrigatórios.")}
        </table>
      </td></tr>

    </table>
  </td></tr>

  <tr><td style="padding:20px 16px;text-align:center;">
    <p style="margin:0;font-size:11px;color:#9CA3AF;">Dúvidas? Entre em contato com a organização pelo WhatsApp.</p>
    <p style="margin:12px 0 0;font-size:10px;color:#D1D5DB;">ASSOAPAC · Associação de Apoio ao Paciente com Câncer de Presidente Olegário</p>
  </td></tr>

</table>
</td></tr>
</table>
</body></html>`;

  const attachments: { filename: string; content: Buffer }[] = [];
  if (pdfBuffer) {
    attachments.push({
      filename: `comprovante-trilhao-${reg.registrationNumber || docId.slice(0,6)}.pdf`,
      content: pdfBuffer,
    });
  }

  try {
    await sendMail({
      to: reg.email,
      subject: `✅ Vaga confirmada! Comprovante #${reg.registrationNumber} — 8º Trilhão da Solidariedade`,
      html,
      attachments,
    });
    console.log(`[email] Confirmation + PDF sent to ${reg.email} (pdf=${!!pdfBuffer})`);
  } catch (err) {
    console.error("[email] Failed to send confirmation email:", err);
  }
}

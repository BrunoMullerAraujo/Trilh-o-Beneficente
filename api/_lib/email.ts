import QRCode from "qrcode";
import { generateConfirmationPdf, generateTermPdf } from "./pdf";

function fmtCPF(cpf: string | undefined): string {
  const d = (cpf || "").replace(/\D/g, "");
  if (d.length !== 11) return cpf || "—";
  return `${d.slice(0,3)}.${d.slice(3,6)}.${d.slice(6,9)}-${d.slice(9)}`;
}
function shirtLabel(s: string): string {
  if (!s) return "Não disponível (esgotado)";
  const m: Record<string, string> = { P: "P", M: "M", G: "G", GG: "GG", XGG: "XGG", EX: "EX" };
  return m[s] || s;
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

function getSenderEmail(): string {
  return process.env.EMAIL_FROM || "noreply@trilhaobeneficente.com.br";
}

async function sendViaBrevo(opts: {
  to: string;
  subject: string;
  html: string;
  attachments?: { filename: string; content: Buffer }[];
}): Promise<void> {
  const apiKey = process.env.BREVO_API_KEY?.trim();
  if (!apiKey) throw new Error("BREVO_API_KEY não configurado.");

  const senderEmail = getSenderEmail();
  const senderName = "Trilhão Beneficente";

  const body: any = {
    sender: { name: senderName, email: senderEmail },
    to: [{ email: opts.to }],
    subject: opts.subject,
    htmlContent: opts.html,
  };

  if (opts.attachments?.length) {
    body.attachment = opts.attachments.map(a => ({
      name: a.filename,
      content: a.content.toString("base64"),
    }));
  }

  const resp = await fetch("https://api.brevo.com/v3/smtp/email", {
    method: "POST",
    headers: {
      "api-key": apiKey,
      "Content-Type": "application/json",
      "Accept": "application/json",
    },
    body: JSON.stringify(body),
  });

  if (!resp.ok) {
    const errBody = await resp.text();
    throw new Error(`Brevo API error ${resp.status}: ${errBody}`);
  }
}

async function sendViaResend(opts: {
  to: string;
  subject: string;
  html: string;
  attachments?: { filename: string; content: Buffer }[];
}): Promise<void> {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) throw new Error("RESEND_API_KEY não configurado.");

  const fromEmail = process.env.EMAIL_FROM || "onboarding@resend.dev";

  const body: any = {
    from: `Trilhão Beneficente <${fromEmail}>`,
    to: [opts.to],
    subject: opts.subject,
    html: opts.html,
  };

  if (opts.attachments?.length) {
    body.attachments = opts.attachments.map(a => ({
      filename: a.filename,
      content: a.content.toString("base64"),
    }));
  }

  const resp = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });

  if (!resp.ok) {
    const errBody = await resp.text();
    throw new Error(`Resend API error ${resp.status}: ${errBody}`);
  }
}

async function sendMail(opts: {
  to: string;
  subject: string;
  html: string;
  attachments?: { filename: string; content: Buffer }[];
}): Promise<void> {
  if (process.env.BREVO_API_KEY) {
    await sendViaBrevo(opts);
    return;
  }
  if (process.env.RESEND_API_KEY) {
    await sendViaResend(opts);
    return;
  }
  throw new Error("Nenhum provedor de e-mail configurado (BREVO_API_KEY ou RESEND_API_KEY).");
}

function isEmailConfigured(): boolean {
  return !!(process.env.BREVO_API_KEY || process.env.RESEND_API_KEY);
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

      ${(reg.vouchers?.length > 0) ? `
      <tr><td style="padding:16px 32px 20px;border-top:1px solid #F3F4F6;">
        <p style="margin:0 0 10px;font-size:10px;font-weight:900;letter-spacing:1.5px;text-transform:uppercase;color:#9CA3AF;">🎫 Vouchers de Almoço Adquiridos (${reg.vouchers.length})</p>
        <table cellpadding="0" cellspacing="0" width="100%" style="border:1px solid #E5E7EB;border-radius:10px;overflow:hidden;">
          ${(reg.vouchers as any[]).map((v: any, i: number) => `
          <tr style="border-bottom:1px solid #F3F4F6;">
            <td style="padding:8px 14px;background:#F9FAFB;width:36px;text-align:center;">
              <span style="font-size:11px;font-weight:900;color:#9CA3AF;">${i + 1}</span>
            </td>
            <td style="padding:8px 14px;">
              <span style="display:block;font-size:13px;font-weight:700;color:#111827;">${v.name}</span>
              <span style="font-size:11px;color:#9CA3AF;">1 refeição no evento</span>
            </td>
          </tr>`).join("")}
        </table>
        <p style="margin:10px 0 0;font-size:11px;color:#6B7280;line-height:1.5;">Os QR Codes de validação de cada voucher serão enviados no e-mail de confirmação do pagamento.</p>
      </td></tr>` : ""}

      <tr><td style="padding:20px 32px;background:#F9FAFB;border-radius:0 0 16px 16px;">
        <p style="margin:0 0 10px;font-size:10px;font-weight:900;letter-spacing:1.5px;text-transform:uppercase;color:#9CA3AF;">Após o pagamento confirmado você receberá:</p>
        <table cellpadding="0" cellspacing="0">
          ${tip("Um novo e-mail com seu comprovante oficial em PDF para apresentar no evento")}
          ${tip("QR Code exclusivo para agilizar seu credenciamento na recepção")}
          ${(reg.vouchers?.length > 0) ? tip(`QR Codes dos ${reg.vouchers.length} voucher(s) de almoço para validação no evento`) : ""}
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

  let qrDataUrl = "";
  try {
    qrDataUrl = await QRCode.toDataURL(checkinUrl, { width: 200, margin: 2, color: { dark: "#111827", light: "#ffffff" } });
  } catch (err) {
    console.error("[email] Erro ao gerar QR code:", err);
  }

  let pdfBuffer: Buffer | null = null;
  try {
    pdfBuffer = await generateConfirmationPdf({ ...reg, status: "approved" }, docId, appUrl);
  } catch (err) {
    console.error("[email] Erro ao gerar PDF:", err);
  }

  const voucherQrs: { v: any; qrDataUrl: string }[] = [];
  for (const v of (reg.vouchers || []) as any[]) {
    const url = `${appUrl}/validar-voucher/${docId}/${v.code}`;
    const qrDataUrl = await QRCode.toDataURL(url, { width: 200, margin: 2, color: { dark: "#111827", light: "#ffffff" } }).catch(() => "");
    voucherQrs.push({ v, qrDataUrl });
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

      ${voucherQrs.length > 0 ? `
      <tr><td style="padding:20px 32px 8px;border-top:1px solid #F3F4F6;">
        <p style="margin:0 0 4px;font-size:10px;font-weight:900;letter-spacing:1.5px;text-transform:uppercase;color:#9CA3AF;">🎫 Vouchers de Almoço — Acompanhantes</p>
        <p style="margin:0 0 16px;font-size:12px;color:#6B7280;line-height:1.5;">Apresente o QR Code de cada voucher na entrada do almoço no dia do evento para validação. O código será escaneado pela organização.</p>
      </td></tr>
      ${voucherQrs.map(({ v, qrDataUrl }, i) => `
      <tr><td style="padding:0 32px 12px;">
        <table cellpadding="0" cellspacing="0" width="100%" style="border:1px solid #E5E7EB;border-radius:14px;overflow:hidden;">
          <tr>
            <td style="background:#111827;padding:8px 16px;" colspan="2">
              <table cellpadding="0" cellspacing="0" width="100%"><tr>
                <td><span style="font-size:9px;font-weight:900;color:#FBBF24;letter-spacing:1.5px;text-transform:uppercase;">Voucher ${i + 1} de ${voucherQrs.length} · Almoço</span></td>
                <td style="text-align:right;"><span style="font-size:9px;color:rgba(255,255,255,.4);font-family:monospace;">${v.code}</span></td>
              </tr></table>
            </td>
          </tr>
          <tr>
            <td style="padding:14px 16px;vertical-align:middle;">
              <p style="margin:0 0 2px;font-size:10px;font-weight:900;color:#9CA3AF;text-transform:uppercase;letter-spacing:.5px;">Acompanhante</p>
              <p style="margin:0 0 8px;font-size:16px;font-weight:900;color:#111827;">${v.name}</p>
              <p style="margin:0;font-size:11px;color:#059669;font-weight:700;">✓ 1 refeição completa no evento</p>
              <p style="margin:6px 0 0;font-size:10px;color:#9CA3AF;line-height:1.5;">Apresente este QR na entrada do almoço</p>
            </td>
            <td style="padding:14px 16px;text-align:center;vertical-align:middle;border-left:1px solid #F3F4F6;">
              ${qrDataUrl ? `<img src="${qrDataUrl}" width="110" height="110" alt="QR Voucher ${v.code}" style="border-radius:8px;border:3px solid #FBBF24;display:block;margin:0 auto;" />` : ""}
              <p style="margin:6px 0 0;font-size:9px;font-weight:900;color:#9CA3AF;text-transform:uppercase;letter-spacing:1px;">Escanear para validar</p>
            </td>
          </tr>
        </table>
      </td></tr>`).join("")}
      ` : ""}

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

// ─────────────────────────────────────────────────────────────────────────────
// E-MAIL 3 — Termo assinado (enviado após assinatura no check-in)
// ─────────────────────────────────────────────────────────────────────────────
export async function sendSignedTermEmail(reg: any, docId: string): Promise<void> {
  if (!isEmailConfigured() || !reg?.email) return;

  const fmtCPF = (cpf: string | undefined) => {
    const d = (cpf || "").replace(/\D/g, "");
    if (d.length !== 11) return cpf || "—";
    return `${d.slice(0,3)}.${d.slice(3,6)}.${d.slice(6,9)}-${d.slice(9)}`;
  };
  const fmtDateTime = (val: any) => {
    if (!val) return "—";
    const d = val?.toDate ? val.toDate() : new Date(val);
    return isNaN(d.getTime()) ? "—" : d.toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo" });
  };
  const isMinor = !!(reg?.guardianName?.trim());
  const addr = [reg?.street, reg?.number, reg?.neighborhood, reg?.city && reg?.state ? `${reg.city}/${reg.state}` : (reg?.city || ""), reg?.cep ? `CEP ${reg.cep}` : ""].filter(Boolean).join(", ");

  const dataRow = (label: string, value: string) =>
    `<tr><td style="font-weight:700;color:#374151;padding:6px 12px;background:#F9FAFB;border-bottom:1px solid #E5E7EB;width:40%;font-size:11px;">${label}</td><td style="color:#111827;padding:6px 12px;border-bottom:1px solid #E5E7EB;font-size:11px;">${value || "—"}</td></tr>`;

  const signatureImg = reg.termsSignature
    ? `<img src="${reg.termsSignature}" style="height:56px;max-width:220px;object-fit:contain;display:block;" alt="Assinatura" />`
    : `<div style="height:56px;border-bottom:2px solid #9CA3AF;"></div>`;

  const signedAt = fmtDateTime(reg.termsSignedAt);

  const html = `<!DOCTYPE html>
<html lang="pt-BR">
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1.0"></head>
<body style="margin:0;padding:0;background:#F4F4F5;font-family:Arial,Helvetica,sans-serif;">
<table width="100%" cellpadding="0" cellspacing="0" style="padding:32px 16px;">
<tr><td align="center">
<table width="640" cellpadding="0" cellspacing="0" style="max-width:640px;width:100%;background:#fff;border-radius:16px;overflow:hidden;border:1px solid #E5E7EB;">

  <tr><td style="background:#111827;padding:28px 32px 20px;text-align:center;">
    <p style="margin:0 0 4px;font-size:10px;font-weight:900;letter-spacing:3px;text-transform:uppercase;color:#FBBF24;opacity:.7;">8ª Edição · 2026</p>
    <h1 style="margin:0 0 4px;font-size:22px;font-weight:900;color:#FBBF24;">Trilhão da Solidariedade</h1>
    <p style="margin:0;font-size:11px;color:rgba(255,255,255,.4);">Presidente Olegário — MG · 100% revertido à ASSOAPAC</p>
  </td></tr>

  <tr><td style="background:#111827;padding:0 32px 20px;text-align:center;">
    <div style="background:#16A34A22;border:1px solid #16A34A;border-radius:50px;display:inline-block;padding:5px 20px;">
      <span style="font-size:12px;font-weight:700;color:#16A34A;">✅ Termo de Responsabilidade Assinado</span>
    </div>
    <p style="margin:6px 0 0;font-size:11px;color:rgba(255,255,255,.4);">Inscrição <strong style="color:#FBBF24;">#${reg.registrationNumber || "—"}</strong> · ${signedAt}</p>
  </td></tr>

  <tr><td style="padding:24px 32px 12px;">
    <p style="margin:0 0 4px;font-size:14px;font-weight:700;color:#111827;">Olá, <strong>${reg.name?.split(" ")[0] || "piloto"}</strong>!</p>
    <p style="margin:0;font-size:12px;color:#6B7280;line-height:1.6;">Segue abaixo o Termo de Responsabilidade, Ciência de Riscos e Autorização de Uso de Imagem assinado digitalmente no credenciamento do <strong style="color:#111827;">8º Trilhão da Solidariedade</strong>.</p>
  </td></tr>

  <tr><td style="padding:0 32px 24px;">
    <div style="border:1px solid #E5E7EB;border-radius:12px;overflow:hidden;">

      <div style="background:#111827;padding:10px 16px;">
        <p style="margin:0;font-size:10px;font-weight:900;color:#FBBF24;text-transform:uppercase;letter-spacing:2px;">Termo de Responsabilidade, Ciência de Riscos e Autorização de Uso de Imagem</p>
        <p style="margin:2px 0 0;font-size:11px;font-weight:700;color:rgba(255,255,255,.7);">8º TRILHÃO DA SOLIDARIEDADE · 2026</p>
      </div>

      <div style="padding:16px;">
        <p style="margin:0 0 8px;font-size:10px;font-weight:900;color:#374151;text-transform:uppercase;letter-spacing:1px;">1. Identificação do participante</p>
        <table width="100%" cellpadding="0" cellspacing="0" style="border:1px solid #E5E7EB;border-radius:6px;overflow:hidden;margin-bottom:12px;">
          <tbody>
            ${dataRow("Nome completo", reg.name)}
            ${dataRow("Data de nascimento", reg.birthDate || "—")}
            ${dataRow("CPF", fmtCPF(reg.cpf))}
            ${dataRow("E-mail", reg.email)}
            ${dataRow("WhatsApp/telefone", reg.phone)}
            ${dataRow("Contato de emergência", reg.emergencyName)}
            ${dataRow("Telefone do contato", reg.emergencyPhone)}
            ${dataRow("Endereço", addr || "—")}
            ${dataRow("Motocicleta", reg.motorcycle)}
            ${dataRow("Tamanho da camiseta", reg.shirtSize)}
            ${dataRow("Número de inscrição", reg.registrationNumber ? `#${reg.registrationNumber}` : "—")}
          </tbody>
        </table>

        ${isMinor ? `
        <p style="margin:0 0 8px;font-size:10px;font-weight:900;color:#374151;text-transform:uppercase;letter-spacing:1px;">2. Responsável legal</p>
        <table width="100%" cellpadding="0" cellspacing="0" style="border:1px solid #E5E7EB;border-radius:6px;overflow:hidden;margin-bottom:12px;">
          <tbody>
            ${dataRow("Nome do responsável", reg.guardianName)}
            ${dataRow("CPF do responsável", fmtCPF(reg.guardianCpf))}
          </tbody>
        </table>` : ""}

        <p style="font-size:11px;color:#374151;line-height:1.7;margin:0 0 10px;">
          Declaro que li, compreendi e concordo integralmente com todas as cláusulas do Termo de Responsabilidade, Ciência de Riscos e Autorização de Uso de Imagem do <strong>8º Trilhão da Solidariedade</strong>, incluindo: ciência dos riscos da atividade, condições físicas e técnicas de participação, uso de equipamentos de segurança, responsabilidade pela motocicleta, autorização de atendimento de emergência ao contato informado, autorização de uso de imagem e tratamento dos dados pessoais conforme descrito.
        </p>

        <table width="100%" cellpadding="0" cellspacing="0" style="border:1px solid #E5E7EB;border-radius:6px;overflow:hidden;margin-bottom:12px;">
          <tbody>
            ${dataRow("Assinado em", signedAt)}
            ${dataRow("Status da inscrição", "Aprovada")}
            ${dataRow("ID do documento", docId)}
          </tbody>
        </table>

        <table width="100%" cellpadding="0" cellspacing="0">
          <tr>
            <td style="width:${isMinor ? "48%" : "60%"};padding-right:16px;">
              ${signatureImg}
              <p style="margin:4px 0 0;font-size:10px;text-align:center;color:#6B7280;">Assinatura do participante</p>
              <p style="margin:2px 0 0;font-size:10px;text-align:center;font-weight:700;color:#111827;">${reg.name || "—"}</p>
            </td>
            ${isMinor ? `<td style="width:48%;">
              <div style="height:56px;border-bottom:2px solid #9CA3AF;"></div>
              <p style="margin:4px 0 0;font-size:10px;text-align:center;color:#6B7280;">Assinatura do responsável legal</p>
              <p style="margin:2px 0 0;font-size:10px;text-align:center;font-weight:700;color:#111827;">${reg.guardianName || "—"}</p>
            </td>` : ""}
          </tr>
        </table>
      </div>
    </div>
  </td></tr>

  <tr><td style="padding:16px 32px 24px;text-align:center;border-top:1px solid #F3F4F6;">
    <p style="margin:0;font-size:11px;color:#9CA3AF;">Documento gerado e armazenado com segurança pela aplicação.</p>
    <p style="margin:8px 0 0;font-size:10px;color:#D1D5DB;">ASSOAPAC · Associação de Apoio ao Paciente com Câncer de Presidente Olegário</p>
  </td></tr>

</table>
</td></tr>
</table>
</body></html>`;

  let pdfBuffer: Buffer | undefined;
  try {
    pdfBuffer = await generateTermPdf(reg, docId);
  } catch (err) {
    console.error("[email] Failed to generate term PDF:", err);
  }

  try {
    await sendMail({
      to: reg.email,
      subject: `✅ Termo assinado — Inscrição #${reg.registrationNumber} · 8º Trilhão da Solidariedade`,
      html,
      attachments: pdfBuffer
        ? [{ filename: `Termo_Inscricao_${reg.registrationNumber || docId}.pdf`, content: pdfBuffer }]
        : undefined,
    });
    console.log(`[email] Signed term sent to ${reg.email} (PDF: ${pdfBuffer ? "attached" : "not generated"})`);
  } catch (err) {
    console.error("[email] Failed to send signed term email:", err);
  }
}

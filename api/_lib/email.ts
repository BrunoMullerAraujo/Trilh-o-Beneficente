import { Resend } from "resend";
import QRCode from "qrcode";

function formatDate(iso: string | undefined): string {
  if (!iso) return "—";
  try {
    return new Date(iso).toLocaleString("pt-BR", {
      day: "2-digit", month: "2-digit", year: "numeric",
      hour: "2-digit", minute: "2-digit",
    });
  } catch { return iso; }
}

function formatBirthDate(iso: string | undefined): string {
  if (!iso) return "—";
  try {
    const [y, m, d] = iso.split("-");
    return `${d}/${m}/${y}`;
  } catch { return iso || "—"; }
}

function formatCPF(cpf: string | undefined): string {
  const d = (cpf || "").replace(/\D/g, "");
  if (d.length !== 11) return cpf || "—";
  return `${d.slice(0,3)}.${d.slice(3,6)}.${d.slice(6,9)}-${d.slice(9)}`;
}

function shirtLabel(size: string): string {
  const map: Record<string, string> = { P: "P — Pequeno", M: "M — Médio", G: "G — Grande", GG: "GG — Extra Grande", XGG: "XGG — Extra Extra Grande", EX: "EX — Especial" };
  return map[size] || size || "—";
}

function buildEmailHtml(reg: any, checkinUrl: string, qrDataUrl: string): string {
  const statusLabel = reg.status === "approved" ? "✅ Confirmada" : reg.status === "pending" ? "⏳ Aguardando Pagamento" : "Cancelada";
  const statusColor = reg.status === "approved" ? "#16a34a" : reg.status === "pending" ? "#d97706" : "#dc2626";
  const isMinor = reg.guardianName && reg.guardianName.trim().length > 0;

  return `<!DOCTYPE html>
<html lang="pt-BR">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Comprovante — 8º Trilhão da Solidariedade</title>
</head>
<body style="margin:0;padding:0;background:#f4f4f5;font-family:Arial,Helvetica,sans-serif;color:#111827;">

<table width="100%" cellpadding="0" cellspacing="0" style="background:#f4f4f5;padding:32px 16px;">
<tr><td align="center">
<table width="600" cellpadding="0" cellspacing="0" style="max-width:600px;width:100%;">

  <!-- HEADER -->
  <tr>
    <td style="background:#111827;border-radius:16px 16px 0 0;padding:36px 40px 28px;text-align:center;">
      <p style="margin:0 0 6px;font-size:11px;font-weight:900;letter-spacing:3px;text-transform:uppercase;color:#fbbf24;opacity:.7;">8ª Edição · 2026</p>
      <h1 style="margin:0 0 4px;font-size:28px;font-weight:900;color:#fbbf24;letter-spacing:-1px;">Trilhão da Solidariedade</h1>
      <p style="margin:0;font-size:13px;color:rgba(255,255,255,.5);">Presidente Olegário — MG · 100% revertido à ASSOAPAC</p>
    </td>
  </tr>

  <!-- BADGE INSCRIÇÃO -->
  <tr>
    <td style="background:#111827;padding:0 40px 32px;text-align:center;">
      <div style="display:inline-block;background:#fbbf24;border-radius:50px;padding:10px 28px;">
        <p style="margin:0;font-size:12px;font-weight:900;letter-spacing:2px;text-transform:uppercase;color:#111827;">Inscrição</p>
        <p style="margin:2px 0 0;font-size:38px;font-weight:900;color:#111827;letter-spacing:-2px;">#${reg.registrationNumber || "—"}</p>
      </div>
      <p style="margin:12px 0 0;display:inline-block;background:${statusColor}22;border:1px solid ${statusColor};border-radius:50px;padding:4px 16px;font-size:12px;font-weight:700;color:${statusColor};">${statusLabel}</p>
    </td>
  </tr>

  <!-- CORPO -->
  <tr>
    <td style="background:#ffffff;padding:0;">

      <!-- QR CODE -->
      <table width="100%" cellpadding="0" cellspacing="0">
        <tr>
          <td style="padding:32px 40px;text-align:center;border-bottom:1px solid #f3f4f6;">
            <p style="margin:0 0 6px;font-size:11px;font-weight:900;letter-spacing:2px;text-transform:uppercase;color:#9ca3af;">Check-in no Evento</p>
            <p style="margin:0 0 20px;font-size:13px;color:#6b7280;">Apresente este QR Code na recepção para realizar seu credenciamento</p>
            <img src="${qrDataUrl}" width="180" height="180" alt="QR Code de Check-in" style="border-radius:12px;border:4px solid #fbbf24;" />
            <p style="margin:16px 0 0;font-size:11px;color:#9ca3af;word-break:break-all;">${checkinUrl}</p>
          </td>
        </tr>
      </table>

      <!-- DADOS DO PILOTO -->
      <table width="100%" cellpadding="0" cellspacing="0">
        <tr>
          <td style="padding:24px 40px 8px;">
            <p style="margin:0;font-size:10px;font-weight:900;letter-spacing:2px;text-transform:uppercase;color:#9ca3af;">Dados do Piloto</p>
          </td>
        </tr>
        ${row("Nome Completo", reg.name || "—")}
        ${row("CPF", formatCPF(reg.cpf))}
        ${row("Data de Nascimento", formatBirthDate(reg.birthDate))}
        ${row("E-mail", reg.email || "—")}
        ${row("WhatsApp", reg.phone || "—")}
        ${row("Cidade / Estado", reg.city && reg.state ? `${reg.city} / ${reg.state}` : "—")}
      </table>

      <!-- EVENTO -->
      <table width="100%" cellpadding="0" cellspacing="0" style="margin-top:12px;">
        <tr>
          <td style="padding:16px 40px 8px;border-top:1px solid #f3f4f6;">
            <p style="margin:0;font-size:10px;font-weight:900;letter-spacing:2px;text-transform:uppercase;color:#9ca3af;">Evento</p>
          </td>
        </tr>
        ${row("Motocicleta", reg.motorcycle || "—")}
        ${row("Camiseta", shirtLabel(reg.shirtSize))}
        ${row("Valor Pago", `R$ ${Number(reg.amount || 0).toLocaleString("pt-BR", { minimumFractionDigits: 2 })}`)}
        ${row("Confirmação do Pagamento", formatDate(reg.confirmedAt?.toDate ? reg.confirmedAt.toDate().toISOString() : reg.confirmedAt))}
        ${row("Nº de Inscrição", reg.registrationNumber || "—")}
      </table>

      <!-- EMERGÊNCIA -->
      <table width="100%" cellpadding="0" cellspacing="0" style="margin-top:12px;">
        <tr>
          <td style="padding:16px 40px 8px;border-top:1px solid #f3f4f6;">
            <p style="margin:0;font-size:10px;font-weight:900;letter-spacing:2px;text-transform:uppercase;color:#9ca3af;">Contato de Emergência</p>
          </td>
        </tr>
        ${row("Nome", reg.emergencyName || "—")}
        ${row("Telefone", reg.emergencyPhone || "—")}
      </table>

      ${isMinor ? `
      <!-- RESPONSÁVEL -->
      <table width="100%" cellpadding="0" cellspacing="0" style="margin-top:12px;">
        <tr>
          <td style="padding:16px 40px 8px;border-top:1px solid #f3f4f6;">
            <p style="margin:0;font-size:10px;font-weight:900;letter-spacing:2px;text-transform:uppercase;color:#d97706;">Responsável Legal</p>
          </td>
        </tr>
        ${row("Nome", reg.guardianName || "—")}
        ${row("CPF", formatCPF(reg.guardianCpf))}
      </table>
      ` : ""}

      <!-- AVISOS -->
      <table width="100%" cellpadding="0" cellspacing="0">
        <tr>
          <td style="padding:24px 40px;border-top:1px solid #f3f4f6;background:#fafafa;border-radius:0 0 16px 16px;">
            <p style="margin:0 0 12px;font-size:11px;font-weight:900;letter-spacing:2px;text-transform:uppercase;color:#9ca3af;">Orientações para o Evento</p>
            <table cellpadding="0" cellspacing="0">
              ${tip("Apresente o QR Code acima na recepção para realizar o check-in e assinar o Termo de Responsabilidade.")}
              ${tip("Leve documento oficial com foto (RG ou CNH) para conferência dos dados da inscrição.")}
              ${tip("A organização poderá solicitar a conferência da motocicleta e dos equipamentos de segurança.")}
              ${tip("A entrega da camiseta ocorrerá conforme disponibilidade e regras definidas pela organização.")}
            </table>
          </td>
        </tr>
      </table>

    </td>
  </tr>

  <!-- FOOTER -->
  <tr>
    <td style="padding:24px 16px;text-align:center;">
      <p style="margin:0 0 4px;font-size:12px;color:#9ca3af;">Este comprovante confirma sua inscrição no evento.</p>
      <p style="margin:0;font-size:12px;color:#9ca3af;">Dúvidas? Fale com a organização pelo WhatsApp.</p>
      <p style="margin:16px 0 0;font-size:10px;color:#d1d5db;">ASSOAPAC — Associação de Apoio ao Paciente com Câncer de Presidente Olegário<br>100% da arrecadação é revertida para esta causa.</p>
    </td>
  </tr>

</table>
</td></tr>
</table>

</body>
</html>`;
}

function row(label: string, value: string): string {
  return `<tr>
    <td style="padding:6px 40px;">
      <table width="100%" cellpadding="0" cellspacing="0">
        <tr>
          <td style="padding:10px 0;border-bottom:1px solid #f9fafb;">
            <span style="font-size:11px;color:#9ca3af;font-weight:600;text-transform:uppercase;letter-spacing:.5px;">${label}</span><br>
            <span style="font-size:14px;color:#111827;font-weight:600;">${value}</span>
          </td>
        </tr>
      </table>
    </td>
  </tr>`;
}

function tip(text: string): string {
  return `<tr>
    <td style="padding:4px 0;">
      <table cellpadding="0" cellspacing="0">
        <tr>
          <td style="padding-right:8px;vertical-align:top;color:#fbbf24;font-weight:900;font-size:13px;">→</td>
          <td style="font-size:12px;color:#4b5563;line-height:1.5;">${text}</td>
        </tr>
      </table>
    </td>
  </tr>`;
}

export async function sendConfirmationEmail(reg: any, docId: string): Promise<void> {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) {
    console.log("[email] RESEND_API_KEY não configurado, e-mail ignorado.");
    return;
  }
  if (!reg?.email) {
    console.log("[email] Sem e-mail no cadastro, ignorando envio.");
    return;
  }

  const appUrl = (process.env.APP_URL || "https://trilhao-web-production.up.railway.app").replace(/\/$/, "");
  const checkinUrl = `${appUrl}/checkin/${docId}`;

  let qrDataUrl = "";
  try {
    qrDataUrl = await QRCode.toDataURL(checkinUrl, { width: 220, margin: 2, color: { dark: "#111827", light: "#ffffff" } });
  } catch (err) {
    console.error("[email] Erro ao gerar QR code:", err);
  }

  const html = buildEmailHtml(reg, checkinUrl, qrDataUrl);
  const fromEmail = process.env.EMAIL_FROM || "Trilhão Beneficente <noreply@trilhaobeneficente.com.br>";

  try {
    const resend = new Resend(apiKey);
    const result = await resend.emails.send({
      from: fromEmail,
      to: reg.email,
      subject: `✅ Inscrição #${reg.registrationNumber} confirmada — 8º Trilhão da Solidariedade`,
      html,
    });
    console.log(`[email] Comprovante enviado para ${reg.email}:`, result);
  } catch (err) {
    console.error("[email] Falha ao enviar e-mail:", err);
  }
}

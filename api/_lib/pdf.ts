import PDFDocument from "pdfkit";
import QRCode from "qrcode";

function fmtDate(iso: string | undefined): string {
  if (!iso) return "—";
  try { return new Date(iso).toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" }); } catch { return iso; }
}
function fmtBirth(iso: string | undefined): string {
  if (!iso) return "—";
  const [y, m, d] = iso.split("-");
  return `${d}/${m}/${y}`;
}
function fmtCPF(cpf: string | undefined): string {
  const d = (cpf || "").replace(/\D/g, "");
  if (d.length !== 11) return cpf || "—";
  return `${d.slice(0,3)}.${d.slice(3,6)}.${d.slice(6,9)}-${d.slice(9)}`;
}
function fmtMoney(v: number | undefined): string {
  return `R$ ${Number(v || 0).toLocaleString("pt-BR", { minimumFractionDigits: 2 })}`;
}
function shirtLabel(s: string): string {
  const m: Record<string, string> = { P: "P — Pequeno", M: "M — Médio", G: "G — Grande", GG: "GG — Extra Grande", XGG: "XGG — Extra Extra Grande", EX: "EX — Especial" };
  return m[s] || s || "—";
}

const BLACK = "#111827";
const YELLOW = "#FBBF24";
const GRAY_BG = "#F9FAFB";
const GRAY_BORDER = "#E5E7EB";
const GRAY_LABEL = "#6B7280";
const GREEN = "#16A34A";
const RED_WARN = "#991B1B";
const W = 595.28; // A4 width
const MARGIN = 40;
const CONTENT_W = W - MARGIN * 2;

export async function generateConfirmationPdf(reg: any, docId: string, appUrl: string): Promise<Buffer> {
  const checkinUrl = `${appUrl}/checkin/${docId}`;
  const qrBuffer = await QRCode.toBuffer(checkinUrl, { width: 160, margin: 1, color: { dark: BLACK, light: "#FFFFFF" } });

  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ size: "A4", margin: 0, info: { Title: `Comprovante #${reg.registrationNumber} — 8º Trilhão da Solidariedade`, Author: "Trilhão da Solidariedade" } });
    const chunks: Buffer[] = [];
    doc.on("data", (c: Buffer) => chunks.push(c));
    doc.on("end", () => resolve(Buffer.concat(chunks)));
    doc.on("error", reject);

    let y = 0;

    // ── HEADER ──────────────────────────────────────────────────────────────
    doc.rect(0, 0, W, 120).fill(BLACK);

    doc.fontSize(8).fillColor(YELLOW).opacity(0.6)
      .text("8ª EDIÇÃO · 2026 · PRESIDENTE OLEGÁRIO — MG", MARGIN, 22, { characterSpacing: 1.5 });

    doc.opacity(1).fontSize(22).font("Helvetica-Bold").fillColor(YELLOW)
      .text("Trilhão da Solidariedade", MARGIN, 36);

    doc.fontSize(9).font("Helvetica").fillColor("#FFFFFF").opacity(0.5)
      .text("100% revertido à ASSOAPAC — Associação de Apoio ao Paciente com Câncer", MARGIN, 62);

    // Status badge
    doc.opacity(1).roundedRect(MARGIN, 78, 110, 22, 11).fill(GREEN);
    doc.fontSize(8).font("Helvetica-Bold").fillColor("#FFFFFF")
      .text("✓  INSCRIÇÃO CONFIRMADA", MARGIN + 6, 84, { width: 110, align: "center" });

    // Registration number (right side of header)
    doc.fontSize(9).font("Helvetica").fillColor(YELLOW).opacity(0.6)
      .text("INSCRIÇÃO Nº", W - MARGIN - 80, 30, { width: 80, align: "center" });
    doc.opacity(1).fontSize(28).font("Helvetica-Bold").fillColor(YELLOW)
      .text(`#${reg.registrationNumber || "—"}`, W - MARGIN - 80, 44, { width: 80, align: "center" });

    y = 135;

    // ── AVISO PRINCIPAL ─────────────────────────────────────────────────────
    doc.rect(MARGIN, y, CONTENT_W, 36).fill("#FEF3C7");
    doc.roundedRect(MARGIN, y, 4, 36, 2).fill("#F59E0B");
    doc.fontSize(9).font("Helvetica-Bold").fillColor("#92400E")
      .text("⚠  Apresente este comprovante (impresso ou digital) na recepção do evento para realizar seu credenciamento.", MARGIN + 14, y + 7, { width: CONTENT_W - 20, lineGap: 2 });
    y += 48;

    // ── QR CODE + DADOS RÁPIDOS ──────────────────────────────────────────────
    const qrSize = 120;
    doc.image(qrBuffer, W - MARGIN - qrSize, y, { width: qrSize, height: qrSize });
    doc.rect(W - MARGIN - qrSize - 1, y - 1, qrSize + 2, qrSize + 2).stroke(YELLOW);

    doc.fontSize(7).font("Helvetica").fillColor(GRAY_LABEL)
      .text("QR CODE PARA CHECK-IN", W - MARGIN - qrSize, y + qrSize + 4, { width: qrSize, align: "center" });

    const leftW = CONTENT_W - qrSize - 16;

    doc.fontSize(11).font("Helvetica-Bold").fillColor(BLACK).text(reg.name || "—", MARGIN, y, { width: leftW });
    y += 18;
    doc.fontSize(9).font("Helvetica").fillColor(GRAY_LABEL).text("Piloto", MARGIN, y); y += 14;
    doc.fontSize(9).font("Helvetica-Bold").fillColor(BLACK)
      .text(reg.motorcycle || "—", MARGIN, y, { width: leftW }); y += 14;
    doc.fontSize(9).font("Helvetica").fillColor(GRAY_LABEL).text("Motocicleta", MARGIN, y); y += 20;
    doc.fontSize(9).font("Helvetica-Bold").fillColor(BLACK)
      .text(shirtLabel(reg.shirtSize), MARGIN, y); y += 14;
    doc.fontSize(9).font("Helvetica").fillColor(GRAY_LABEL).text("Camiseta", MARGIN, y);
    y = Math.max(y + 20, 135 + 48 + qrSize + 20);

    // ── SEÇÃO: DADOS DO PILOTO ───────────────────────────────────────────────
    y = section(doc, y, "DADOS DO PILOTO");
    y = row2(doc, y, "Nome Completo", reg.name, "CPF", fmtCPF(reg.cpf));
    y = row2(doc, y, "Data de Nascimento", fmtBirth(reg.birthDate), "WhatsApp", reg.phone || "—");
    y = row2(doc, y, "E-mail", reg.email || "—", "Cidade / Estado", reg.city && reg.state ? `${reg.city} / ${reg.state}` : "—");

    // ── SEÇÃO: DADOS DO EVENTO ───────────────────────────────────────────────
    y = section(doc, y, "DADOS DO EVENTO");
    y = row2(doc, y, "Valor Pago", fmtMoney(reg.amount), "Confirmação do Pagamento", fmtDate(reg.confirmedAt?.toDate ? reg.confirmedAt.toDate().toISOString() : reg.confirmedAt));
    y = row2(doc, y, "Motocicleta", reg.motorcycle || "—", "Camiseta", shirtLabel(reg.shirtSize));
    y = row2(doc, y, "ID Externo do Pagamento", reg.paymentId || "—", "Nº de Inscrição", reg.registrationNumber || "—");

    // ── SEÇÃO: EMERGÊNCIA ────────────────────────────────────────────────────
    y = section(doc, y, "CONTATO DE EMERGÊNCIA");
    y = row2(doc, y, "Nome do Contato", reg.emergencyName || "—", "Telefone", reg.emergencyPhone || "—");

    // ── SEÇÃO: RESPONSÁVEL (se menor) ───────────────────────────────────────
    if (reg.guardianName?.trim()) {
      y = section(doc, y, "RESPONSÁVEL LEGAL");
      y = row2(doc, y, "Nome do Responsável", reg.guardianName, "CPF do Responsável", fmtCPF(reg.guardianCpf));
    }

    // ── ORIENTAÇÕES ──────────────────────────────────────────────────────────
    y = section(doc, y, "ORIENTAÇÕES PARA O DIA DO EVENTO");
    const tips = [
      "Apresente este comprovante na recepção para realizar o check-in e assinar o Termo de Responsabilidade.",
      "Leve documento oficial com foto (RG ou CNH) para conferência dos dados.",
      "A organização poderá verificar a motocicleta e os equipamentos de proteção.",
      "A entrega da camiseta seguirá as regras definidas pela organização.",
    ];
    for (const tip of tips) {
      doc.fontSize(8.5).font("Helvetica").fillColor(BLACK)
        .text(`→  ${tip}`, MARGIN + 8, y, { width: CONTENT_W - 16, lineGap: 2 });
      y += doc.heightOfString(`→  ${tip}`, { width: CONTENT_W - 16 }) + 6;
    }
    y += 4;

    // ── VALIDAÇÃO ────────────────────────────────────────────────────────────
    doc.rect(MARGIN, y, CONTENT_W, 1).fill(GRAY_BORDER); y += 10;
    doc.fontSize(7.5).font("Helvetica").fillColor(GRAY_LABEL)
      .text(`Nº de Inscrição: ${reg.registrationNumber || "—"}   ·   CPF: ${fmtCPF(reg.cpf)}   ·   ID de Pagamento: ${reg.paymentId || "—"}   ·   Gerado em: ${new Date().toLocaleString("pt-BR")}`, MARGIN, y, { width: CONTENT_W, align: "center" });
    y += 14;

    // ── FOOTER ───────────────────────────────────────────────────────────────
    doc.rect(0, y, W, 50).fill(BLACK);
    doc.fontSize(8).font("Helvetica-Bold").fillColor(YELLOW)
      .text("8º TRILHÃO DA SOLIDARIEDADE — 2026", 0, y + 10, { width: W, align: "center" });
    doc.fontSize(7.5).font("Helvetica").fillColor("#FFFFFF").opacity(0.5)
      .text("ASSOAPAC · Associação de Apoio ao Paciente com Câncer de Presidente Olegário · 100% da arrecadação revertida para esta causa.", 0, y + 24, { width: W, align: "center" });

    doc.end();
  });
}

// ── Helpers de layout ────────────────────────────────────────────────────────

function section(doc: InstanceType<typeof PDFDocument>, y: number, title: string): number {
  y += 8;
  doc.rect(MARGIN, y, CONTENT_W, 22).fill(BLACK);
  doc.fontSize(8).font("Helvetica-Bold").fillColor(YELLOW)
    .text(title, MARGIN + 10, y + 7, { characterSpacing: 0.5 });
  return y + 30;
}

function row2(doc: InstanceType<typeof PDFDocument>, y: number, l1: string, v1: string, l2: string, v2: string): number {
  const half = (CONTENT_W - 10) / 2;
  // Left cell
  doc.rect(MARGIN, y, half, 38).fill(GRAY_BG).stroke(GRAY_BORDER);
  doc.fontSize(7).font("Helvetica").fillColor(GRAY_LABEL)
    .text(l1.toUpperCase(), MARGIN + 8, y + 6, { width: half - 16 });
  doc.fontSize(9).font("Helvetica-Bold").fillColor(BLACK)
    .text(v1 || "—", MARGIN + 8, y + 17, { width: half - 16, lineBreak: false });
  // Right cell
  const rx = MARGIN + half + 10;
  doc.rect(rx, y, half, 38).fill(GRAY_BG).stroke(GRAY_BORDER);
  doc.fontSize(7).font("Helvetica").fillColor(GRAY_LABEL)
    .text(l2.toUpperCase(), rx + 8, y + 6, { width: half - 16 });
  doc.fontSize(9).font("Helvetica-Bold").fillColor(BLACK)
    .text(v2 || "—", rx + 8, y + 17, { width: half - 16, lineBreak: false });
  return y + 46;
}

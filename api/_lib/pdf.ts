import PDFDocument from "pdfkit";
import QRCode from "qrcode";

// ── Formatters (espelham os usados no frontend) ──────────────────────────────

function fmtBirth(iso: string | undefined): string {
  if (!iso) return "—";
  const [y, m, d] = iso.split("-");
  return `${d}/${m}/${y}`;
}
function fmtDate(field: any): string {
  if (!field) return "—";
  try {
    const date = field?.toDate ? field.toDate() : new Date(field);
    return date.toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" });
  } catch { return "—"; }
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
  if (!s) return "Não disponível (esgotado no momento da inscrição)";
  const m: Record<string, string> = { P: "P — Pequeno", M: "M — Médio", G: "G — Grande", GG: "GG — Extra Grande", XGG: "XGG — Extra Extra Grande", EX: "EX — Especial" };
  return m[s] || s;
}

// ── Paleta (idêntica ao layout web) ─────────────────────────────────────────

const BLACK    = "#221F1F";
const YELLOW   = "#F8D208";
const GRAY_BG  = "#F9FAFB";
const GRAY_BD  = "#E5E7EB";
const GRAY_LBL = "#9CA3AF";
const GREEN    = "#16A34A";
const AMBER_BG = "#FFFBEB";
const AMBER_BD = "#F59E0B";
const AMBER_TX = "#92400E";

const W       = 595.28; // A4
const MARGIN  = 32;
const CW      = W - MARGIN * 2; // content width

// ── Geração do PDF ───────────────────────────────────────────────────────────

export async function generateConfirmationPdf(reg: any, docId: string, appUrl: string): Promise<Buffer> {
  const checkinUrl = `${appUrl}/checkin/${docId}`;
  const qrBuffer = await QRCode.toBuffer(checkinUrl, {
    width: 180, margin: 1, color: { dark: BLACK, light: "#FFFFFF" },
  });

  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({
      size: "A4", margin: 0,
      info: { Title: `Comprovante #${reg.registrationNumber} — 8º Trilhão da Solidariedade`, Author: "Trilhão da Solidariedade" },
    });
    const chunks: Buffer[] = [];
    doc.on("data", (c: Buffer) => chunks.push(c));
    doc.on("end",  () => resolve(Buffer.concat(chunks)));
    doc.on("error", reject);

    let y = 0;

    // ── HEADER ───────────────────────────────────────────────────────────────
    doc.rect(0, 0, W, 108).fill(BLACK);

    // Edição (topo esquerdo)
    doc.fontSize(7).font("Helvetica-Bold").fillColor(YELLOW).opacity(0.6)
      .text("8ª EDIÇÃO · 2026 · PRESIDENTE OLEGÁRIO — MG", MARGIN, 16, { characterSpacing: 1.2 });

    // Título
    doc.opacity(1).fontSize(20).font("Helvetica-Bold").fillColor(YELLOW)
      .text("Trilhão da Solidariedade", MARGIN, 28);

    // Subtítulo
    doc.fontSize(8).font("Helvetica").fillColor("#FFFFFF").opacity(0.4)
      .text("100% revertido à ASSOAPAC", MARGIN, 50);

    // Badge verde — INSCRIÇÃO CONFIRMADA
    doc.opacity(1).roundedRect(MARGIN, 64, 130, 20, 10).fill(GREEN);
    doc.fontSize(7.5).font("Helvetica-Bold").fillColor("#FFFFFF")
      .text("✓  INSCRIÇÃO CONFIRMADA", MARGIN + 4, 70, { width: 130, align: "center" });

    // Número de inscrição (direito)
    doc.fontSize(8).font("Helvetica-Bold").fillColor(YELLOW).opacity(0.55)
      .text("INSCRIÇÃO Nº", W - MARGIN - 100, 20, { width: 100, align: "right" });
    doc.opacity(1).fontSize(28).font("Helvetica-Bold").fillColor(YELLOW)
      .text(`#${reg.registrationNumber || "—"}`, W - MARGIN - 100, 36, { width: 100, align: "right" });

    y = 118;

    // ── BANNER ÂMBAR ─────────────────────────────────────────────────────────
    doc.rect(MARGIN, y, 3, 36).fill(AMBER_BD);
    doc.rect(MARGIN, y, CW, 36).fill(AMBER_BG);
    doc.fontSize(8).font("Helvetica").fillColor(AMBER_TX)
      .text("⚠  Apresente este comprovante (impresso ou digital) na recepção do evento para realizar seu credenciamento.", MARGIN + 10, y + 8, { width: CW - 16, lineGap: 1.5 });
    y += 46;

    // ── QR CODE + RESUMO RÁPIDO ───────────────────────────────────────────────
    const qrSize = 108;
    const qrX = W - MARGIN - qrSize;
    const summaryStart = y;

    doc.image(qrBuffer, qrX, y + 2, { width: qrSize, height: qrSize });
    doc.rect(qrX - 2, y, qrSize + 4, qrSize + 4).stroke(YELLOW);
    doc.fontSize(6.5).font("Helvetica-Bold").fillColor(GRAY_LBL)
      .text("QR · CHECK-IN", qrX, y + qrSize + 8, { width: qrSize, align: "center" });

    const leftW = CW - qrSize - 16;

    doc.fontSize(12).font("Helvetica-Bold").fillColor(BLACK)
      .text(reg.name || "—", MARGIN, y, { width: leftW }); y += 16;
    doc.fontSize(7.5).font("Helvetica").fillColor(GRAY_LBL).text("Piloto", MARGIN, y); y += 14;
    doc.fontSize(9).font("Helvetica-Bold").fillColor(BLACK)
      .text(reg.motorcycle || "—", MARGIN, y, { width: leftW }); y += 13;
    doc.fontSize(7.5).font("Helvetica").fillColor(GRAY_LBL).text("Motocicleta", MARGIN, y); y += 14;
    doc.fontSize(9).font("Helvetica-Bold").fillColor(BLACK)
      .text(shirtLabel(reg.shirtSize), MARGIN, y, { width: leftW }); y += 13;
    doc.fontSize(7.5).font("Helvetica").fillColor(GRAY_LBL).text("Camiseta", MARGIN, y);

    y = Math.max(y + 18, summaryStart + qrSize + 22);

    // ── SEÇÃO: DADOS DO PILOTO ────────────────────────────────────────────────
    y = sectionHeader(doc, y, "DADOS DO PILOTO");
    y = row2(doc, y, "Nome Completo",      reg.name || "—",     "CPF",             fmtCPF(reg.cpf));
    y = row2(doc, y, "Data de Nascimento", fmtBirth(reg.birthDate), "WhatsApp",    reg.phone || "—");
    y = row2(doc, y, "E-mail",             reg.email || "—",    "Cidade / Estado", reg.city && reg.state ? `${reg.city} / ${reg.state}` : (reg.city || "—"));

    // ── SEÇÃO: DADOS DO EVENTO ────────────────────────────────────────────────
    y = sectionHeader(doc, y, "DADOS DO EVENTO");
    y = row2(doc, y, "Valor Pago",   fmtMoney(reg.amount),  "Confirmação do Pagamento", fmtDate(reg.confirmedAt));
    y = row2(doc, y, "Motocicleta",  reg.motorcycle || "—", "ID do Pagamento",           reg.paymentId || "—");

    // ── SEÇÃO: CONTATO DE EMERGÊNCIA ──────────────────────────────────────────
    y = sectionHeader(doc, y, "CONTATO DE EMERGÊNCIA");
    y = row2(doc, y, "Nome do Contato", reg.emergencyName || "—", "Telefone", reg.emergencyPhone || "—");

    // ── SEÇÃO: RESPONSÁVEL LEGAL (se menor) ───────────────────────────────────
    if (reg.guardianName?.trim()) {
      y = sectionHeader(doc, y, "RESPONSÁVEL LEGAL", "#F59E0B", "#FFFFFF");
      y = row2(doc, y, "Nome do Responsável", reg.guardianName, "CPF do Responsável", fmtCPF(reg.guardianCpf));
    }

    // ── SEÇÃO: ORIENTAÇÕES ────────────────────────────────────────────────────
    y = sectionHeader(doc, y, "ORIENTAÇÕES PARA O DIA DO EVENTO");
    const tips = [
      "Apresente este comprovante (impresso ou digital) na recepção para realizar o check-in e assinar o Termo de Responsabilidade.",
      "Leve documento oficial com foto (RG ou CNH) para conferência dos dados.",
      "A organização poderá verificar a motocicleta e os equipamentos de proteção individual.",
      "A entrega da camiseta seguirá as regras definidas pela organização no dia do evento.",
    ];
    for (const tip of tips) {
      const tipText = `  ${tip}`;
      const h = doc.heightOfString(tipText, { width: CW - 26 });
      doc.fontSize(8).font("Helvetica").fillColor(YELLOW).text("→", MARGIN + 8, y);
      doc.fillColor("#374151").text(tipText, MARGIN + 18, y, { width: CW - 26, lineGap: 1.5 });
      y += h + 8;
    }
    y += 6;

    // ── RODAPÉ DE VALIDAÇÃO ───────────────────────────────────────────────────
    doc.rect(MARGIN, y, CW, 1).fill(GRAY_BD); y += 10;
    doc.fontSize(7).font("Helvetica").fillColor(GRAY_LBL)
      .text(
        `Nº ${reg.registrationNumber || "—"} · CPF: ${fmtCPF(reg.cpf)} · ID: ${reg.paymentId || "—"} · Gerado em: ${new Date().toLocaleString("pt-BR")}`,
        MARGIN, y, { width: CW, align: "center" }
      );
    y += 16;

    // ── FOOTER PRETO ──────────────────────────────────────────────────────────
    doc.rect(0, y, W, 52).fill(BLACK);
    doc.fontSize(8.5).font("Helvetica-Bold").fillColor(YELLOW)
      .text("8º TRILHÃO DA SOLIDARIEDADE — 2026", 0, y + 10, { width: W, align: "center" });
    doc.fontSize(7.5).font("Helvetica").fillColor("#FFFFFF").opacity(0.4)
      .text("ASSOAPAC · Associação de Apoio ao Paciente com Câncer de Presidente Olegário · 100% da arrecadação revertida para esta causa.", 0, y + 26, { width: W, align: "center" });

    doc.end();
  });
}

// ── Helpers de layout ────────────────────────────────────────────────────────

function sectionHeader(
  doc: InstanceType<typeof PDFDocument>,
  y: number,
  title: string,
  bgColor = BLACK,
  textColor = YELLOW,
): number {
  y += 6;
  doc.rect(MARGIN, y, CW, 22).fill(bgColor);
  doc.fontSize(8).font("Helvetica-Bold").fillColor(textColor)
    .text(title, MARGIN + 10, y + 7, { characterSpacing: 0.4 });
  return y + 30;
}

function row2(
  doc: InstanceType<typeof PDFDocument>,
  y: number,
  l1: string, v1: string,
  l2: string, v2: string,
): number {
  const half = (CW - 8) / 2;

  // Célula esquerda
  doc.rect(MARGIN, y, half, 36).fill(GRAY_BG).stroke(GRAY_BD);
  doc.fontSize(7).font("Helvetica").fillColor(GRAY_LBL)
    .text(l1.toUpperCase(), MARGIN + 8, y + 6, { width: half - 16 });
  doc.fontSize(9).font("Helvetica-Bold").fillColor(BLACK)
    .text(v1 || "—", MARGIN + 8, y + 17, { width: half - 16, lineBreak: false });

  // Célula direita
  const rx = MARGIN + half + 8;
  doc.rect(rx, y, half, 36).fill(GRAY_BG).stroke(GRAY_BD);
  doc.fontSize(7).font("Helvetica").fillColor(GRAY_LBL)
    .text(l2.toUpperCase(), rx + 8, y + 6, { width: half - 16 });
  doc.fontSize(9).font("Helvetica-Bold").fillColor(BLACK)
    .text(v2 || "—", rx + 8, y + 17, { width: half - 16, lineBreak: false });

  return y + 44;
}

import PDFDocument from "pdfkit";
import QRCode from "qrcode";

const TZ = "America/Sao_Paulo";

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
    return date.toLocaleString("pt-BR", { timeZone: TZ, day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" });
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

  const voucherQrBuffers: Buffer[] = [];
  for (const v of (reg.vouchers || []) as any[]) {
    const url = `${appUrl}/validar-voucher/${docId}/${v.code}`;
    voucherQrBuffers.push(await QRCode.toBuffer(url, { width: 250, margin: 1, color: { dark: BLACK, light: "#FFFFFF" } }));
  }

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
        `Nº ${reg.registrationNumber || "—"} · CPF: ${fmtCPF(reg.cpf)} · ID: ${reg.paymentId || "—"} · Gerado em: ${new Date().toLocaleString("pt-BR", { timeZone: TZ })}`,
        MARGIN, y, { width: CW, align: "center" }
      );
    y += 16;

    // ── FOOTER PRETO ──────────────────────────────────────────────────────────
    doc.rect(0, y, W, 52).fill(BLACK);
    doc.fontSize(8.5).font("Helvetica-Bold").fillColor(YELLOW)
      .text("8º TRILHÃO DA SOLIDARIEDADE — 2026", 0, y + 10, { width: W, align: "center" });
    doc.fontSize(7.5).font("Helvetica").fillColor("#FFFFFF").opacity(0.4)
      .text("ASSOAPAC · Associação de Apoio ao Paciente com Câncer de Presidente Olegário · 100% da arrecadação revertida para esta causa.", 0, y + 26, { width: W, align: "center" });

    // ── PÁGINAS DE VOUCHER ─────────────────────────────────────────────────────
    const PAGE_H = 841.89;
    for (let i = 0; i < (reg.vouchers?.length ?? 0); i++) {
      const v = reg.vouchers[i];
      const vQr = voucherQrBuffers[i];
      doc.addPage({ size: "A4", margin: 0 });

      // Header
      doc.rect(0, 0, W, 88).fill(BLACK);
      doc.fontSize(7).font("Helvetica-Bold").fillColor(YELLOW).opacity(0.6)
        .text("VOUCHER DE ALMOÇO — 8ª EDIÇÃO · 2026 · PRESIDENTE OLEGÁRIO — MG", MARGIN, 13, { characterSpacing: 0.8 });
      doc.opacity(1).fontSize(20).font("Helvetica-Bold").fillColor(YELLOW)
        .text("Trilhão da Solidariedade", MARGIN, 26);
      doc.fontSize(8).font("Helvetica").fillColor("#FFFFFF").opacity(0.4)
        .text("100% revertido à ASSOAPAC", MARGIN, 50);
      doc.opacity(1).fontSize(9).font("Helvetica-Bold").fillColor(YELLOW)
        .text(`${String(i + 1).padStart(2, "0")} / ${reg.vouchers.length}`, W - MARGIN - 50, 34, { width: 50, align: "right" });
      doc.opacity(1);

      let vy = 108;

      // Valid badge
      doc.roundedRect(MARGIN, vy, 110, 22, 11).fill(GREEN);
      doc.fontSize(8).font("Helvetica-Bold").fillColor("#FFFFFF")
        .text("✓  ALMOÇO GARANTIDO", MARGIN + 4, vy + 7, { width: 110, align: "center" });
      vy += 36;

      // QR code (right side)
      const qrSize = 160;
      const qrX = W - MARGIN - qrSize;
      if (vQr) {
        doc.image(vQr, qrX, vy, { width: qrSize, height: qrSize });
        doc.rect(qrX - 2, vy - 2, qrSize + 4, qrSize + 4).stroke(YELLOW);
        doc.fontSize(6.5).font("Helvetica-Bold").fillColor(GRAY_LBL)
          .text("ESCANEIE PARA VALIDAR", qrX, vy + qrSize + 8, { width: qrSize, align: "center" });
      }

      // Companion name
      doc.fontSize(7.5).font("Helvetica-Bold").fillColor(GRAY_LBL).text("ACOMPANHANTE", MARGIN, vy);
      vy += 12;
      doc.fontSize(22).font("Helvetica-Bold").fillColor(BLACK).text(v.name || "—", MARGIN, vy, { width: qrX - MARGIN - 16 });
      vy += 32;

      // Holder
      doc.fontSize(7.5).font("Helvetica-Bold").fillColor(GRAY_LBL).text("TITULAR DO INGRESSO", MARGIN, vy);
      vy += 10;
      doc.fontSize(11).font("Helvetica-Bold").fillColor(BLACK).text(reg.name || "—", MARGIN, vy, { width: qrX - MARGIN - 16 });
      vy += 18;

      // Code
      doc.fontSize(7.5).font("Helvetica-Bold").fillColor(GRAY_LBL).text("CÓDIGO DO VOUCHER", MARGIN, vy);
      vy += 10;
      doc.fontSize(11).font("Helvetica-Bold").fillColor(BLACK).text(v.code, MARGIN, vy);
      vy += 20;

      // Divider
      doc.rect(MARGIN, vy, CW, 1).fill(GRAY_BD);
      vy += 16;

      // Description
      const descW = qrX - MARGIN - 16;
      doc.fontSize(9).font("Helvetica").fillColor("#374151")
        .text(
          "Este voucher garante 1 (uma) refeição completa no evento para o acompanhante identificado acima. Apresente este documento (impresso ou digital) na entrada do almoço no dia do evento para validação.",
          MARGIN, vy, { width: descW, lineGap: 2 }
        );
      vy = Math.max(vy + 60, 108 + 36 + qrSize + 24);

      // Validation footer
      doc.rect(MARGIN, vy, CW, 1).fill(GRAY_BD); vy += 10;
      doc.fontSize(7).font("Helvetica").fillColor(GRAY_LBL)
        .text(`${v.code} · Titular: ${reg.name || "—"} · Inscrição Nº ${reg.registrationNumber || "—"} · Gerado em: ${new Date().toLocaleString("pt-BR", { timeZone: TZ })}`,
          MARGIN, vy, { width: CW, align: "center" });

      // Footer
      doc.rect(0, PAGE_H - 42, W, 42).fill(BLACK);
      doc.opacity(1).fontSize(8.5).font("Helvetica-Bold").fillColor(YELLOW)
        .text("8º TRILHÃO DA SOLIDARIEDADE — 2026", 0, PAGE_H - 32, { width: W, align: "center" });
      doc.fontSize(7.5).font("Helvetica").fillColor("#FFFFFF").opacity(0.4)
        .text("ASSOAPAC · Associação de Apoio ao Paciente com Câncer de Presidente Olegário", 0, PAGE_H - 18, { width: W, align: "center" });
      doc.opacity(1);
    }

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

// ── Geração do PDF do Termo ───────────────────────────────────────────────────

export async function generateTermPdf(reg: any, docId: string): Promise<Buffer> {
  const fmtDT = (val: any): string => {
    if (!val) return "—";
    const d = val?.toDate ? val.toDate() : new Date(val);
    return isNaN(d.getTime()) ? "—" : d.toLocaleString("pt-BR", { timeZone: TZ, day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" });
  };

  const cpf = (val: string | undefined): string => {
    const d = (val || "").replace(/\D/g, "");
    if (d.length !== 11) return val || "—";
    return `${d.slice(0,3)}.${d.slice(3,6)}.${d.slice(6,9)}-${d.slice(9)}`;
  };

  const isMinor = !!(reg?.guardianName?.trim());
  const addr = [reg?.street, reg?.number, reg?.neighborhood, reg?.city && reg?.state ? `${reg.city}/${reg.state}` : (reg?.city || ""), reg?.cep ? `CEP ${reg.cep}` : ""].filter(Boolean).join(", ");
  const signedAt = fmtDT(reg?.termsSignedAt);
  const motorcycle = reg?.motorcycle || "—";

  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({
      size: "A4", margin: 0, autoFirstPage: true,
      info: { Title: `Termo — ${reg.name || "—"} — 8º Trilhão da Solidariedade`, Author: "8º Trilhão da Solidariedade" },
    });
    const chunks: Buffer[] = [];
    doc.on("data", (c: Buffer) => chunks.push(c));
    doc.on("end", () => resolve(Buffer.concat(chunks)));
    doc.on("error", reject);

    const TM = 36;          // horizontal margin
    const TCW = W - TM * 2; // content width
    const PAGE_H = 841.89;
    const BOTTOM = PAGE_H - 36;
    let y = 0;

    const newPage = () => { doc.addPage({ size: "A4", margin: 0 }); y = TM; };
    const ensure = (needed: number) => { if (y + needed > BOTTOM) newPage(); };

    // ── CABEÇALHO ──
    doc.rect(0, 0, W, 68).fill(BLACK);
    doc.fontSize(6.5).font("Helvetica-Bold").fillColor(YELLOW).opacity(0.6)
      .text("TERMO DE RESPONSABILIDADE, CIÊNCIA DE RISCOS E AUTORIZAÇÃO DE USO DE IMAGEM", TM, 11, { width: TCW, align: "center", characterSpacing: 0.5 });
    doc.opacity(1).fontSize(14).font("Helvetica-Bold").fillColor(YELLOW)
      .text("8º Trilhão da Solidariedade", TM, 24, { width: TCW, align: "center" });
    doc.fontSize(7.5).font("Helvetica").fillColor("#FFFFFF").opacity(0.45)
      .text("Presidente Olegário — MG · 2026 · 100% revertido à ASSOAPAC", TM, 44, { width: TCW, align: "center" });
    doc.opacity(1);
    y = 78;

    // ── Helpers ──
    const secTitle = (n: number, title: string) => {
      ensure(26);
      y += 4;
      doc.rect(TM, y, TCW, 18).fill(GRAY_BD);
      doc.rect(TM, y, 3, 18).fill(BLACK);
      doc.fontSize(7.5).font("Helvetica-Bold").fillColor(BLACK)
        .text(`${n}. ${title.toUpperCase()}`, TM + 10, y + 5, { characterSpacing: 0.3, width: TCW - 14 });
      y += 24;
    };

    const infoRow = (label: string, value: string) => {
      const ROW_H = 25;
      ensure(ROW_H);
      const lw = TCW * 0.36;
      doc.rect(TM, y, lw, ROW_H).fill(GRAY_BG);
      doc.rect(TM, y, TCW, ROW_H).stroke(GRAY_BD);
      doc.rect(TM, y, lw, ROW_H).stroke(GRAY_BD);
      doc.fontSize(6.5).font("Helvetica").fillColor(GRAY_LBL)
        .text(label, TM + 6, y + 4, { width: lw - 12, lineBreak: false });
      doc.fontSize(8.5).font("Helvetica-Bold").fillColor(BLACK)
        .text(value || "—", TM + lw + 6, y + 8, { width: TCW - lw - 12, lineBreak: false });
      y += ROW_H;
    };

    const para = (text: string) => {
      const opts = { width: TCW, align: "justify" as const, lineGap: 1.5 };
      const h = doc.heightOfString(text, opts);
      ensure(h + 6);
      doc.fontSize(8.5).font("Helvetica").fillColor("#374151").text(text, TM, y, opts);
      y += h + 6;
    };

    // ── 1. IDENTIFICAÇÃO ──
    secTitle(1, "Identificação do participante");
    infoRow("Nome completo", reg?.name || "—");
    infoRow("Data de nascimento", reg?.birthDate || "—");
    infoRow("CPF", cpf(reg?.cpf));
    infoRow("E-mail", reg?.email || "—");
    infoRow("WhatsApp / telefone", reg?.phone || "—");
    infoRow("Contato de emergência", reg?.emergencyName || "—");
    infoRow("Telefone do contato", reg?.emergencyPhone || "—");
    infoRow("Endereço", addr || "—");
    infoRow("Motocicleta", motorcycle);
    infoRow("Tamanho da camiseta", reg?.shirtSize || "—");
    infoRow("Número de inscrição", reg?.registrationNumber ? `#${reg.registrationNumber}` : "—");
    y += 4;

    // ── 2. RESPONSÁVEL LEGAL ──
    let n = 2;
    if (isMinor) {
      secTitle(n++, "Responsável legal");
      infoRow("Nome completo do responsável", reg?.guardianName || "—");
      infoRow("CPF do responsável", cpf(reg?.guardianCpf));
      y += 4;
    }

    // ── CLÁUSULAS ──
    secTitle(n++, "Declaração de participação voluntária");
    para(`Eu, ${reg?.name || "—"}, inscrito(a) no CPF nº ${cpf(reg?.cpf)}, declaro que estou me inscrevendo e participando do evento 8º TRILHÃO DA SOLIDARIEDADE por livre e espontânea vontade, sem qualquer coação, imposição ou obrigação, assumindo os riscos ordinários, previsíveis e inerentes à modalidade.`);

    secTitle(n++, "Ciência dos riscos da atividade");
    para(`Declaro estar ciente de que atividades de trilha, motociclismo off road, passeio, deslocamento em grupo e participação em evento em área rural ou urbana podem envolver riscos, incluindo, mas não se limitando a: quedas, tombos, escorregões, colisões, abalroamentos e perda de controle da motocicleta; terrenos irregulares, trechos com pedras, lama, poeira, areia, buracos, aclives, declives, erosões, valas, raízes, galhos e obstáculos naturais ou artificiais; variações climáticas, chuva, baixa visibilidade, calor, frio e demais condições ambientais; problemas mecânicos, pane elétrica, falha de freios, pneus, suspensão, direção ou demais componentes da motocicleta; contato com animais, insetos, vegetação, cercas, porteiras, propriedades rurais e vias de circulação; lesões leves, moderadas ou graves, danos materiais, perda de bens pessoais, necessidade de atendimento médico, remoção ou resgate.`);

    secTitle(n++, "Condições físicas, técnicas e de saúde");
    para(`Declaro que possuo condições físicas, mentais e técnicas compatíveis com a participação no evento, bem como conhecimento básico necessário para condução da motocicleta na modalidade proposta. Declaro, ainda, que não possuo restrição médica conhecida que me impeça de participar, responsabilizando-me por avaliar minhas próprias condições antes e durante o evento.`);

    secTitle(n++, "Equipamentos de segurança e conduta");
    para(`Comprometo-me a utilizar capacete e demais equipamentos de proteção adequados à modalidade, manter minha motocicleta em condições seguras de uso, respeitar as orientações da organização, conduzir com prudência, respeitar os demais participantes, preservar áreas privadas, públicas e ambientais, e não praticar manobras ou condutas que coloquem em risco a mim, outros participantes, espectadores, terceiros ou a própria organização.`);

    secTitle(n++, "Responsabilidade pela motocicleta e por bens pessoais");
    para(`Declaro ser responsável pela motocicleta informada no cadastro, descrita como ${motorcycle}, bem como por seus documentos, condições de funcionamento, transporte, guarda, equipamentos, acessórios e bens pessoais. Estou ciente de que a organização não se responsabiliza por danos, perdas, furtos, extravios, defeitos, panes ou despesas relacionadas à motocicleta, equipamentos ou pertences pessoais, salvo hipóteses de responsabilidade legal que não possam ser afastadas.`);

    secTitle(n++, "Atendimento de emergência");
    para(`Em caso de acidente, mal-estar ou situação de emergência, autorizo a organização a acionar o contato de emergência informado, ${reg?.emergencyName || "—"}, pelo telefone ${reg?.emergencyPhone || "—"}, bem como a solicitar atendimento de primeiros socorros, transporte, resgate ou encaminhamento médico, quando necessário. Estou ciente de que eventuais despesas médicas, hospitalares, medicamentosas, de transporte, guincho, reparo ou resgate não assumidas expressamente pela organização serão de minha responsabilidade.`);

    secTitle(n++, "Autorização de uso de imagem, voz e nome");
    para(`Autorizo, de forma gratuita, a captação, edição, reprodução, publicação e divulgação de minha imagem, voz, nome e registros audiovisuais realizados durante o evento, para fins institucionais, promocionais, informativos, históricos e de divulgação do 8º TRILHÃO DA SOLIDARIEDADE, da ASSOAPAC, do MXPO Trilheiros, apoiadores, patrocinadores e imprensa. A autorização abrange meios físicos e digitais, incluindo redes sociais, sites, aplicativos, materiais impressos, vídeos, fotografias, transmissões, reportagens e peças de comunicação relacionadas ao evento, sem que isso gere qualquer remuneração, indenização ou ônus à organização.`);

    secTitle(n++, "Tratamento de dados pessoais");
    para(`Declaro estar ciente de que os dados pessoais informados na inscrição serão tratados pela organização e pela aplicação com a finalidade de realizar inscrição, controle de participantes, emissão de comprovante, confirmação de pagamento, comunicação sobre o evento, segurança operacional, prestação de contas, atendimento a obrigações legais e gestão administrativa do evento.`);

    // ── REGISTRO DIGITAL ──
    secTitle(n++, "Registro de aceite digital pela aplicação");
    infoRow("Aceite dos termos", "Sim — registrado ao assinar este documento");
    infoRow("Data e hora do cadastro", fmtDT(reg?.createdAt));
    infoRow("Status da inscrição", reg?.status === "approved" ? "Aprovada" : (reg?.status || "—"));
    infoRow("Valor pago", `R$ ${Number(reg?.amount || 0).toLocaleString("pt-BR", { minimumFractionDigits: 2 })}`);
    infoRow("ID externo do pagamento", reg?.paymentId || "—");
    infoRow("Data e hora da confirmação do pagamento", fmtDT(reg?.confirmedAt));
    y += 4;

    // ── DECLARAÇÃO FINAL ──
    secTitle(n++, "Declaração final");
    para(`Após ler este termo, declaro que compreendi seu conteúdo, estou ciente dos riscos, responsabilidades, condições de participação e autorizações aqui previstas, concordando integralmente com suas disposições. Declaro também que as informações fornecidas no cadastro são verdadeiras, completas e atualizadas, assumindo responsabilidade por eventuais erros, omissões ou informações incorretas.`);

    // ── ASSINATURA ──
    ensure(110);
    y += 8;
    doc.fontSize(8).font("Helvetica").fillColor("#4B5563")
      .text(`Local e data: ${reg?.city && reg?.state ? `${reg.city}/${reg.state}` : "Presidente Olegário/MG"}, ${signedAt}`, TM, y, { width: TCW });
    y += 18;

    const sigW = isMinor ? TCW * 0.44 : Math.min(200, TCW * 0.5);
    const guarX = TM + TCW * 0.52;

    if (reg.termsSignature) {
      try {
        const b64 = reg.termsSignature.includes(",") ? reg.termsSignature.split(",")[1] : reg.termsSignature;
        const imgBuf = Buffer.from(b64, "base64");
        doc.image(imgBuf, TM, y, { width: sigW, height: 50, fit: [sigW, 50] });
      } catch { /* signature image error — leave blank */ }
    }
    doc.rect(TM, y + 52, sigW, 1).fill(GRAY_BD);
    doc.fontSize(7.5).font("Helvetica").fillColor(GRAY_LBL)
      .text("Assinatura do participante", TM, y + 56, { width: sigW, align: "center" });
    doc.fontSize(8.5).font("Helvetica-Bold").fillColor(BLACK)
      .text(reg?.name || "—", TM, y + 68, { width: sigW, align: "center" });

    if (isMinor) {
      doc.rect(guarX, y + 52, sigW, 1).fill(GRAY_BD);
      doc.fontSize(7.5).font("Helvetica").fillColor(GRAY_LBL)
        .text("Assinatura do responsável legal", guarX, y + 56, { width: sigW, align: "center" });
      doc.fontSize(8.5).font("Helvetica-Bold").fillColor(BLACK)
        .text(reg?.guardianName || "—", guarX, y + 68, { width: sigW, align: "center" });
    }
    y += 84;

    // ── RODAPÉ ──
    ensure(50);
    doc.rect(TM, y, TCW, 1).fill(GRAY_BD); y += 8;
    doc.fontSize(6.5).font("Helvetica").fillColor(GRAY_LBL)
      .text(
        `Assinado digitalmente em: ${signedAt} · ID do documento: ${docId} · Gerado em: ${new Date().toLocaleString("pt-BR", { timeZone: TZ })}`,
        TM, y, { width: TCW, align: "center" },
      );
    y += 14;
    doc.rect(0, y, W, 42).fill(BLACK);
    doc.fontSize(8).font("Helvetica-Bold").fillColor(YELLOW)
      .text("8º TRILHÃO DA SOLIDARIEDADE — 2026", 0, y + 10, { width: W, align: "center" });
    doc.fontSize(7).font("Helvetica").fillColor("#FFFFFF").opacity(0.4)
      .text("ASSOAPAC · Associação de Apoio ao Paciente com Câncer de Presidente Olegário · 100% da arrecadação revertida para esta causa.", 0, y + 24, { width: W, align: "center" });

    doc.end();
  });
}

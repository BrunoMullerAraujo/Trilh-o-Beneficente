import { getAdminDb } from "../../_lib/firebase-admin";
import { generateConfirmationPdf } from "../../_lib/pdf";
import { handleOptions } from "../../_lib/http";

export default async function handler(req: any, res: any) {
  if (handleOptions(req, res)) return;
  if (req.method !== "GET") return res.status(405).json({ error: "Method not allowed" });

  const { id } = req.query as { id: string };
  const adminDb = getAdminDb();

  try {
    const snap = await adminDb.collection("registrations").doc(id).get();
    if (!snap.exists) return res.status(404).json({ error: "Inscrição não encontrada." });
    const reg = snap.data()!;
    if (reg.status !== "approved") return res.status(400).json({ error: "Pagamento não confirmado." });

    const appUrl = (process.env.APP_URL || "https://trilhao-web-production.up.railway.app").replace(/\/$/, "");
    const pdfBuffer = await generateConfirmationPdf(reg, id, appUrl);

    const filename = `comprovante-trilhao-${reg.registrationNumber || id.slice(0, 6)}.pdf`;
    res.setHeader("Content-Type", "application/pdf");
    res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
    return res.send(pdfBuffer);
  } catch (error: any) {
    console.error("[receipt]", error);
    return res.status(500).json({ error: "Erro ao gerar comprovante.", message: error.message });
  }
}

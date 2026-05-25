import { getMercadoPagoAccessToken, createPixPayment } from "../_lib/mercadopago";
import { getAdminDb } from "../_lib/firebase-admin";
import { handleOptions, readBody, sendJson } from "../_lib/http";

const DEFAULT_EVENT_PRICE = Number(process.env.EVENT_PRICE) || 1;
const DEFAULT_VOUCHER_PRICE = 0.10;
const MAX_VOUCHERS = 10;

export default async function handler(req: any, res: any) {
  if (handleOptions(req, res)) return;

  if (req.method !== "POST") {
    return sendJson(res, 405, { error: "Método não permitido" });
  }

  const accessToken = getMercadoPagoAccessToken();

  if (!accessToken) {
    return sendJson(res, 401, {
      error: "Configuração ausente",
      message: "O Access Token do Mercado Pago não foi configurado corretamente.",
    });
  }

  try {
    const { transaction_amount, description, payer } = readBody(req);
    const amount = Number(transaction_amount);

    if (!amount || amount <= 0 || !payer?.email || !payer?.identification?.number) {
      return sendJson(res, 400, {
        error: "Dados inválidos",
        message: "Revise os dados da inscrição antes de gerar o PIX.",
      });
    }

    // Ler preços do Firestore (com fallback para env/defaults)
    let eventPrice = DEFAULT_EVENT_PRICE;
    let voucherPrice = DEFAULT_VOUCHER_PRICE;
    try {
      const adminDb = getAdminDb();
      const snap = await adminDb.collection("settings").doc("event_config").get();
      if (snap.exists) {
        const d = snap.data() ?? {};
        if (d.eventPrice && d.eventPrice > 0) eventPrice = Number(d.eventPrice);
        if (d.voucherPrice != null && d.voucherPrice >= 0) voucherPrice = Number(d.voucherPrice);
      }
    } catch {
      // Firestore unavailable — use defaults; payment will still proceed
    }

    // C3: Validar que o valor está na faixa válida (inscrição + vouchers)
    const minAmount = eventPrice;
    const maxAmount = eventPrice + MAX_VOUCHERS * voucherPrice;
    if (amount < minAmount - 0.01 || amount > maxAmount + 0.01) {
      return sendJson(res, 400, {
        error: "Valor inválido",
        message: `O valor da inscrição deve ser entre R$ ${minAmount.toFixed(2)} e R$ ${maxAmount.toFixed(2)}.`,
      });
    }

    const externalRef = `trilhao-${Date.now()}`;
    const desc = description || "Inscrição 8º Trilhão da Solidariedade";

    const payment = await createPixPayment(accessToken, {
      transaction_amount: amount,
      description: desc,
      external_reference: externalRef,
      payer: {
        email: payer.email,
        first_name: payer.first_name,
        last_name: payer.last_name || "Participante",
        identification: {
          type: "CPF",
          number: String(payer.identification.number).replace(/\D/g, ""),
        },
      },
    });

    // Use external_reference as id so the webhook can match by paymentInfo.external_reference
    return sendJson(res, 200, {
      id: payment.external_reference,
      orderId: String(payment.id),
      status: payment.status,
      point_of_interaction: payment.point_of_interaction,
    });
  } catch (error: any) {
    console.error("Erro MP Payments API:", JSON.stringify(error?.cause ?? error, null, 2));
    const rawDetail: string = error?.message || "";

    if (error?.status === 401) {
      return sendJson(res, 401, {
        error: "Credenciais recusadas",
        message: "O Mercado Pago recusou esta operação. Verifique as credenciais de integração.",
      });
    }

    if (rawDetail.includes("processing_error") || error?.status === 402) {
      return sendJson(res, 500, {
        error: "Pagamento temporariamente indisponível",
        message: "Não foi possível gerar o PIX no momento. Por favor, tente novamente em alguns minutos ou entre em contato com a organização.",
      });
    }

    return sendJson(res, 500, {
      error: "Erro no processamento",
      message: rawDetail || "Ocorreu um erro ao gerar o PIX.",
    });
  }
}

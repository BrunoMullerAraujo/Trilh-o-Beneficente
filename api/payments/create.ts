import { getMercadoPagoAccessToken, createPixPayment } from "../_lib/mercadopago";
import { handleOptions, readBody, sendJson } from "../_lib/http";

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

    // C3: Validar que o valor corresponde ao preço do evento
    const eventPrice = Number(process.env.EVENT_PRICE) || 1;
    if (Math.abs(amount - eventPrice) > 0.01) {
      return sendJson(res, 400, {
        error: "Valor inválido",
        message: `O valor da inscrição deve ser R$ ${eventPrice.toFixed(2)}.`,
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

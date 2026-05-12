import { getMercadoPagoAccessToken, createOrder } from "../_lib/mercadopago";
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

    const desc = description || "Inscrição Evento Beneficente";

    const order = await createOrder(accessToken, {
      type: "online",
      total_amount: amount.toFixed(2),
      external_reference: `trilhao-${Date.now()}`,
      processing_mode: "automatic",
      transactions: {
        payments: [{
          amount: amount.toFixed(2),
          payment_method: {
            id: "pix",
            type: "bank_transfer",
          },
        }],
      },
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

    const pixPayment = order.transactions?.payments?.[0];

    // Normalize response to maintain frontend field compatibility
    return sendJson(res, 200, {
      id: order.id,
      status: order.status,
      point_of_interaction: {
        transaction_data: {
          qr_code_base64: pixPayment?.payment_method?.qr_code_base64 || "",
          qr_code: pixPayment?.payment_method?.qr_code || "",
          ticket_url: pixPayment?.payment_method?.ticket_url || "",
        },
      },
    });
  } catch (error: any) {
    console.error("Erro MP Orders API:", JSON.stringify(error?.cause ?? error, null, 2));
    const mpMessage = error?.cause?.message || error?.message;

    if (error?.status === 401) {
      return sendJson(res, 401, {
        error: "Credenciais recusadas",
        message: `O Mercado Pago recusou esta operação. Detalhe: ${mpMessage || "sem detalhe retornado"}.`,
      });
    }

    return sendJson(res, 500, {
      error: "Erro no processamento",
      message: mpMessage || "Ocorreu um erro ao gerar o PIX.",
    });
  }
}

import { MercadoPagoConfig } from "mercadopago";
import { randomUUID } from "crypto";

const MP_API_BASE = "https://api.mercadopago.com";

export function getMercadoPagoAccessToken() {
  const accessToken = process.env.MERCADO_PAGO_ACCESS_TOKEN;

  if (!accessToken || accessToken.length < 10 || accessToken.includes("MY_MERCADO_PAGO")) {
    return null;
  }

  return accessToken;
}

export function getMercadoPagoClient() {
  const accessToken = getMercadoPagoAccessToken();
  return accessToken ? new MercadoPagoConfig({ accessToken }) : null;
}

export function getMercadoPagoNotificationUrl(req: any) {
  const explicitAppUrl = process.env.APP_URL;
  const vercelUrl = process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : "";
  const requestHost = req?.headers?.host ? `https://${req.headers.host}` : "";
  const appUrl = explicitAppUrl && !explicitAppUrl.includes("MY_APP_URL")
    ? explicitAppUrl
    : vercelUrl || requestHost;

  if (!appUrl) return undefined;

  try {
    const url = new URL(appUrl);
    const isLocalhost = ["localhost", "127.0.0.1", "::1"].includes(url.hostname);

    if (url.protocol !== "https:" || isLocalhost) {
      return undefined;
    }

    return new URL("/api/webhook/mercadopago", url).toString();
  } catch {
    return undefined;
  }
}

export async function createOrder(accessToken: string, body: object): Promise<any> {
  const resp = await fetch(`${MP_API_BASE}/v1/orders`, {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${accessToken}`,
      "Content-Type": "application/json",
      "X-Idempotency-Key": randomUUID(),
    },
    body: JSON.stringify(body),
  });

  const json = await resp.json();
  if (!resp.ok) {
    const err = new Error(json?.message || `Orders API error ${resp.status}`) as any;
    err.status = resp.status;
    err.cause = json;
    throw err;
  }
  return json;
}

export async function getOrder(accessToken: string, orderId: string): Promise<any> {
  const resp = await fetch(`${MP_API_BASE}/v1/orders/${orderId}`, {
    headers: { "Authorization": `Bearer ${accessToken}` },
  });

  const json = await resp.json();
  if (!resp.ok) {
    const err = new Error(json?.message || `Orders API error ${resp.status}`) as any;
    err.status = resp.status;
    throw err;
  }
  return json;
}

export async function findMpPaymentId(
  accessToken: string,
  reg: { orderId?: string; paymentId?: string },
): Promise<string | null> {
  if (reg.orderId?.startsWith("ORD")) {
    try {
      const order = await getOrder(accessToken, reg.orderId);
      const paymentId = order?.transactions?.payments?.[0]?.id;
      if (paymentId) return String(paymentId);
    } catch {}
  }

  if (reg.paymentId?.startsWith("trilhao-")) {
    const resp = await fetch(
      `${MP_API_BASE}/v1/payments/search?external_reference=${encodeURIComponent(reg.paymentId)}`,
      { headers: { Authorization: `Bearer ${accessToken}` } },
    );
    const result = await resp.json() as any;
    const payment = result?.results?.[0];
    if (payment?.id) return String(payment.id);
  }

  if (reg.paymentId && /^\d+$/.test(String(reg.paymentId))) {
    return String(reg.paymentId);
  }

  return null;
}

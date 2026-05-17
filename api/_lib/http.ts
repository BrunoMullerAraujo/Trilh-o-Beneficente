export function readBody(req: any) {
  if (!req.body) return {};
  if (typeof req.body === "string") {
    try {
      return JSON.parse(req.body);
    } catch {
      return {};
    }
  }
  return req.body;
}

export function sendJson(res: any, status: number, body: unknown) {
  res.status(status);
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  return res.json(body);
}

function getAllowedOrigin(req: any): string {
  const origin: string = req.headers?.origin ?? "";
  const allowed = (process.env.ALLOWED_ORIGINS ?? "")
    .split(",")
    .map((o: string) => o.trim())
    .filter(Boolean);
  if (process.env.APP_URL) allowed.push(process.env.APP_URL.replace(/\/$/, ""));
  if (!origin || allowed.length === 0 || allowed.includes(origin)) return origin || "*";
  return allowed[0];
}

export function handleOptions(req: any, res: any) {
  const origin = getAllowedOrigin(req);
  res.setHeader("Access-Control-Allow-Origin", origin);
  res.setHeader("Access-Control-Allow-Methods", "GET,POST,OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type,Authorization");
  res.setHeader("Vary", "Origin");

  if (req.method === "OPTIONS") {
    res.status(204).end();
    return true;
  }

  return false;
}

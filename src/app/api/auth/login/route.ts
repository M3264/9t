import { createSession, verifyPassword } from "@/lib/server/auth";
import { readData } from "@/lib/server/db";
import {
  authRateLimit,
  loginSchema,
  rateLimitResponse,
} from "@/lib/server/security";

export async function POST(req: Request) {
  const rl = authRateLimit(req, "login");
  if (!rl.ok) return rateLimitResponse(rl.retryAfterSec);

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return Response.json({ error: "Invalid JSON." }, { status: 400 });
  }
  const parsed = loginSchema.safeParse(body);
  if (!parsed.success)
    return Response.json(
      { error: "Invalid username or password." },
      { status: 401 },
    );
  const { username, password } = parsed.data;
  const d = await readData();
  let valid = false;
  if (d.user && username === d.user.username) {
    try {
      valid = verifyPassword(password, d.user.salt, d.user.passwordHash);
    } catch {
      valid = false;
    }
  }
  if (!valid)
    return Response.json(
      { error: "Invalid username or password." },
      { status: 401 },
    );
  await createSession();
  return Response.json({ ok: true });
}

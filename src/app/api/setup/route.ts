import { createSession, makePassword } from "@/lib/server/auth";
import { mutate } from "@/lib/server/db";
import {
  authRateLimit,
  rateLimitResponse,
  setupSchema,
} from "@/lib/server/security";

export async function POST(req: Request) {
  const rl = authRateLimit(req, "setup");
  if (!rl.ok) return rateLimitResponse(rl.retryAfterSec);

  const setupToken = process.env.NINE_T_SETUP_TOKEN;
  // Fail closed: setup requires a configured key.
  if (!setupToken) {
    return Response.json(
      { error: "Server setup is not configured (missing setup token)." },
      { status: 503 },
    );
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return Response.json({ error: "Invalid JSON." }, { status: 400 });
  }
  const parsed = setupSchema.safeParse(body);
  if (!parsed.success) {
    return Response.json(
      { error: parsed.error.issues[0]?.message || "Invalid setup data." },
      { status: 400 },
    );
  }
  if (parsed.data.setupToken !== setupToken)
    return Response.json(
      { error: "The setup key is incorrect." },
      { status: 403 },
    );

  const { username, password, modules, exposure } = parsed.data;
  let exists = false;
  await mutate((d) => {
    if (d.config.initialized) {
      exists = true;
      return;
    }
    d.user = { username: username.trim(), ...makePassword(password) };
    d.config.initialized = true;
    if (modules) d.config.modules = { ...d.config.modules, ...modules };
    d.config.exposure = exposure || "public";
  });
  if (exists)
    return Response.json(
      { error: "9t is already configured." },
      { status: 409 },
    );
  await createSession();
  return Response.json({ ok: true });
}

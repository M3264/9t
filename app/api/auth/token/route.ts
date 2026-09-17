import { createHash, randomBytes, randomUUID } from "crypto";
import { verifyPassword } from "@/lib/server/auth";
import { mutate, readData } from "@/lib/server/store";
import {
  authRateLimit,
  loginSchema,
  rateLimitResponse,
} from "@/lib/server/security";
import { z } from "zod";

const tokenSchema = loginSchema.extend({
  name: z.string().min(1).max(80).optional(),
});

export async function POST(req: Request) {
  const rl = authRateLimit(req, "token");
  if (!rl.ok) return rateLimitResponse(rl.retryAfterSec);

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return Response.json({ error: "Invalid JSON." }, { status: 400 });
  }
  const parsed = tokenSchema.safeParse(body);
  if (!parsed.success)
    return Response.json(
      { error: "Invalid username or password." },
      { status: 401 },
    );
  const { username, password, name = "CLI" } = parsed.data;
  const data = await readData();
  let valid = false;
  if (data.user && username === data.user.username) {
    try {
      valid = verifyPassword(password, data.user.salt, data.user.passwordHash);
    } catch {
      valid = false;
    }
  }
  if (!valid)
    return Response.json(
      { error: "Invalid username or password." },
      { status: 401 },
    );
  const token = `9t_${randomBytes(32).toString("base64url")}`,
    id = randomUUID();
  await mutate((d) => {
    d.apiTokens ??= {};
    d.apiTokens[id] = {
      name: String(name).slice(0, 80),
      hash: createHash("sha256").update(token).digest("hex"),
      createdAt: new Date().toISOString(),
    };
  });
  return Response.json({ token });
}

export async function DELETE(req: Request) {
  const bearer = req.headers
    .get("authorization")
    ?.match(/^Bearer\s+(.+)$/i)?.[1];
  if (!bearer) return Response.json({ error: "unauthorized" }, { status: 401 });
  const hash = createHash("sha256").update(bearer).digest("hex");
  await mutate((d) => {
    for (const [id, t] of Object.entries(d.apiTokens || {}))
      if (t.hash === hash) delete d.apiTokens![id];
  });
  return Response.json({ ok: true });
}

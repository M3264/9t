import { createHash } from "crypto";
import { cookies } from "next/headers";
import { verifyPassword } from "@/lib/server/auth";
import { readData } from "@/lib/server/db";
import { authRateLimit, rateLimitResponse } from "@/lib/server/security";
import { z } from "zod";

const unlockSchema = z.object({
  password: z.string().min(1).max(128),
});

export async function POST(
  req: Request,
  { params }: { params: Promise<{ token: string }> },
) {
  const rl = authRateLimit(req, "unlock");
  if (!rl.ok) return rateLimitResponse(rl.retryAfterSec);

  const { token } = await params;
  let raw: unknown;
  try {
    raw = await req.json();
  } catch {
    return Response.json({ error: "invalid_password" }, { status: 401 });
  }
  const parsed = unlockSchema.safeParse(raw);
  if (!parsed.success)
    return Response.json({ error: "invalid_password" }, { status: 401 });
  const { password } = parsed.data;
  const share = Object.values((await readData()).shares).find(
    (item) => item.token === token,
  );
  let valid = false;
  if (share?.passwordHash && share.passwordSalt) {
    try {
      valid = verifyPassword(password, share.passwordSalt, share.passwordHash);
    } catch {
      valid = false;
    }
  }
  if (!valid)
    return Response.json({ error: "invalid_password" }, { status: 401 });
  if (!share) return Response.json({ error: "invalid_password" }, { status: 401 });
  if (share.expiresAt && Date.parse(share.expiresAt) <= Date.now())
    return Response.json({ error: "expired" }, { status: 410 });
  const key = createHash("sha256")
      .update(`${share.token}:${share.passwordHash}`)
      .digest("hex"),
    jar = await cookies();
  jar.set(`9t_share_${share.id}`, key, {
    httpOnly: true,
    secure: process.env.NINE_T_HTTPS === "true",
    sameSite: "lax",
    path: "/",
    expires: share.expiresAt
      ? new Date(share.expiresAt)
      : new Date(Date.now() + 30 * 864e5),
  });
  return Response.json({ ok: true });
}

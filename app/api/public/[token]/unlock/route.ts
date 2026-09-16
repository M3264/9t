import { createHash } from "crypto";
import { cookies } from "next/headers";
import { verifyPassword } from "@/lib/server/auth";
import { readData } from "@/lib/server/store";

export async function POST(
  req: Request,
  { params }: { params: Promise<{ token: string }> },
) {
  const { token } = await params,
    { password } = await req.json(),
    share = Object.values((await readData()).shares).find(
      (item) => item.token === token,
    );
  if (
    !share?.passwordHash ||
    !share.passwordSalt ||
    typeof password !== "string" ||
    !verifyPassword(password, share.passwordSalt, share.passwordHash)
  )
    return Response.json({ error: "invalid_password" }, { status: 401 });
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

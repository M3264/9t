import { randomBytes, randomUUID } from "crypto";
import { authenticated, unauthorized } from "@/lib/server/auth";
import { makePassword } from "@/lib/server/auth";
import { mutate, readData } from "@/lib/server/store";
export const dynamic = "force-dynamic";
export async function GET(req: Request) {
  if (!(await authenticated(req))) return unauthorized();
  const d = await readData(),
    now = Date.now();
  return Response.json({
    shares: Object.values(d.shares)
      .filter((s) => !s.expiresAt || new Date(s.expiresAt).getTime() > now)
      .map((s) => ({
        id: s.id,
        token: s.token,
        objectId: s.objectId,
        createdAt: s.createdAt,
        expiresAt: s.expiresAt,
        accessCount: s.accessCount,
        passwordProtected: !!s.passwordHash,
        object: d.objects.find((o) => o.id === s.objectId),
      }))
      .filter((s) => s.object),
  });
}
export async function POST(req: Request) {
  if (!(await authenticated(req))) return unauthorized();
  const { objectId, lifetime = "1d", password } = await req.json(),
    d = await readData();
  if (!d.objects.some((o) => o.id === objectId && !o.deletedAt))
    return Response.json({ error: "Object not found." }, { status: 404 });
  const ttl: { [key: string]: number } = {
    "1h": 36e5,
    "1d": 864e5,
    "7d": 6048e5,
    "30d": 2592e6,
  };
  if (
    password !== undefined &&
    (typeof password !== "string" || password.length < 6)
  )
    return Response.json(
      { error: "Share passwords must be at least 6 characters." },
      { status: 400 },
    );
  const secret = password ? makePassword(password) : undefined;
  const share = {
    id: randomUUID(),
    token: randomBytes(18).toString("base64url"),
    objectId,
    createdAt: new Date().toISOString(),
    expiresAt:
      lifetime === "forever"
        ? undefined
        : new Date(Date.now() + (ttl[lifetime] || ttl["1d"])).toISOString(),
    accessCount: 0,
    passwordHash: secret?.passwordHash,
    passwordSalt: secret?.salt,
  };
  await mutate((data) => {
    data.shares[share.id] = share;
  });
  return Response.json({ share, path: `/s/${share.token}` });
}

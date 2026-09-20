import { randomBytes, randomUUID } from "crypto";
import { authenticated, unauthorized } from "@/lib/server/auth";
import { makePassword } from "@/lib/server/auth";
import { mutate, readData } from "@/lib/server/db";
import {
  csrfCheck,
  csrfResponse,
  shareCreateSchema,
} from "@/lib/server/security";
import { expiryFromLifetime } from "@/lib/shared/lifetimes";

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
  if (!csrfCheck(req)) return csrfResponse();

  let raw: unknown;
  try {
    raw = await req.json();
  } catch {
    return Response.json({ error: "Invalid JSON." }, { status: 400 });
  }
  const parsed = shareCreateSchema.safeParse(raw);
  if (!parsed.success)
    return Response.json(
      { error: parsed.error.issues[0]?.message || "Invalid share request." },
      { status: 400 },
    );
  const { objectId, lifetime = "1d", password } = parsed.data;
  const d = await readData();
  if (!d.objects.some((o) => o.id === objectId && !o.deletedAt))
    return Response.json({ error: "Object not found." }, { status: 404 });

  const secret = password ? makePassword(password) : undefined;
  const share = {
    id: randomUUID(),
    token: randomBytes(18).toString("base64url"),
    objectId,
    createdAt: new Date().toISOString(),
    expiresAt: expiryFromLifetime(lifetime),
    accessCount: 0,
    passwordHash: secret?.passwordHash,
    passwordSalt: secret?.salt,
  };
  await mutate((data) => {
    data.shares[share.id] = share;
  });
  return Response.json({ share, path: `/s/${share.token}` });
}

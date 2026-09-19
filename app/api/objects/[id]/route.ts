import { authenticated, unauthorized } from "@/lib/server/auth";
import { mutate, purgeObject, readData } from "@/lib/server/db";
import {
  csrfCheck,
  csrfResponse,
  objectPatchSchema,
} from "@/lib/server/security";

export async function GET(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  if (!(await authenticated(req))) return unauthorized();
  const { id } = await params;
  const object = (await readData()).objects.find((item) => item.id === id);
  return object
    ? Response.json({ object })
    : Response.json({ error: "not_found" }, { status: 404 });
}

export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  if (!(await authenticated(req))) return unauthorized();
  if (!csrfCheck(req)) return csrfResponse();
  const { id } = await params;
  let raw: unknown;
  try {
    raw = await req.json();
  } catch {
    return Response.json({ error: "Invalid JSON." }, { status: 400 });
  }
  const parsed = objectPatchSchema.safeParse(raw);
  if (!parsed.success)
    return Response.json({ error: "Invalid update." }, { status: 400 });
  const body = parsed.data;

  // Validate URL strictly — reject instead of silently swallowing.
  if (body.url !== undefined) {
    try {
      const u = new URL(body.url);
      if (!["http:", "https:"].includes(u.protocol))
        return Response.json({ error: "Enter a valid URL." }, { status: 400 });
      body.url = u.toString();
    } catch {
      return Response.json({ error: "Enter a valid URL." }, { status: 400 });
    }
  }
  if (body.expiresAt !== undefined && body.expiresAt !== null) {
    if (Number.isNaN(Date.parse(body.expiresAt)))
      return Response.json({ error: "Invalid expiry." }, { status: 400 });
    body.expiresAt = new Date(body.expiresAt).toISOString();
  }

  let found = false;
  await mutate((d) => {
    const o = d.objects.find((x) => x.id === id);
    if (!o) return;
    found = true;
    if (typeof body.pinned === "boolean") o.pinned = body.pinned;
    if (body.restore) o.deletedAt = undefined;
    if (typeof body.name === "string" && body.name.trim())
      o.name = body.name.trim().slice(0, 200);
    if (o.type === "snippet" && typeof body.content === "string")
      o.content = body.content.slice(0, 500_000);
    if (o.type === "snippet" && typeof body.language === "string")
      o.language = body.language.slice(0, 32);
    if (o.type === "link" && typeof body.url === "string") o.url = body.url;
    if (body.expiresAt === null) o.expiresAt = undefined;
    else if (typeof body.expiresAt === "string") o.expiresAt = body.expiresAt;
    if (
      body.board &&
      Number.isFinite(body.board.x) &&
      Number.isFinite(body.board.y)
    )
      o.board = {
        x: Math.max(0, Math.min(92, body.board.x)),
        y: Math.max(0, Math.min(82, body.board.y)),
      };
    o.updatedAt = new Date().toISOString();
  });
  return found
    ? Response.json({ ok: true })
    : Response.json({ error: "not_found" }, { status: 404 });
}

export async function DELETE(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  if (!(await authenticated(req))) return unauthorized();
  if (!csrfCheck(req)) return csrfResponse();
  const { id } = await params;
  if (new URL(req.url).searchParams.get("permanent") === "true") {
    await purgeObject(id);
    return Response.json({ ok: true });
  }
  await mutate((d) => {
    const o = d.objects.find((x) => x.id === id);
    if (o) o.deletedAt = new Date().toISOString();
  });
  return Response.json({ ok: true });
}

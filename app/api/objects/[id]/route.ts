import { authenticated, unauthorized } from "../../../../lib/auth";
import { mutate, purgeObject, readData } from "../../../../lib/store";

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
  const { id } = await params,
    body = await req.json();
  let found = false;
  await mutate((d) => {
    const o = d.objects.find((x) => x.id === id);
    if (!o) return;
    found = true;
    if (typeof body.pinned === "boolean") o.pinned = body.pinned;
    if (body.restore) o.deletedAt = undefined;
    if (typeof body.name === "string" && body.name.trim())
      o.name = body.name.trim();
    if (o.type === "snippet" && typeof body.content === "string")
      o.content = body.content;
    if (o.type === "snippet" && typeof body.language === "string")
      o.language = body.language;
    if (o.type === "link" && typeof body.url === "string") {
      try {
        o.url = new URL(body.url).toString();
      } catch {}
    }
    if (body.expiresAt === null) o.expiresAt = undefined;
    else if (
      typeof body.expiresAt === "string" &&
      !Number.isNaN(Date.parse(body.expiresAt))
    )
      o.expiresAt = new Date(body.expiresAt).toISOString();
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

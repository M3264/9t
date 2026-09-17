import { randomBytes, randomUUID } from "crypto";
import { authenticated, unauthorized } from "@/lib/server/auth";
import { mutate, readData } from "@/lib/server/store";
import { csrfCheck, csrfResponse } from "@/lib/server/security";
export const dynamic = "force-dynamic";
const headers = { "Cache-Control": "no-store" };
export async function GET(req: Request) {
  if (!(await authenticated(req))) return unauthorized();
  const d = await readData();
  return Response.json(
    {
      devices: Object.entries(d.devices || {}).map(
        ([id, { key: _key, ...device }]) => ({ id, ...device }),
      ),
    },
    { headers },
  );
}
export async function POST(req: Request) {
  if (!(await authenticated(req))) return unauthorized();
  if (!csrfCheck(req)) return csrfResponse();
  const body = await req.json().catch(() => null);
  if (
    typeof body?.name !== "string" ||
    !body.name.trim() ||
    body.name.length > 80
  )
    return Response.json(
      { error: "Enter a device name (up to 80 characters)." },
      { status: 400 },
    );
  const id = randomUUID(),
    key = randomBytes(32).toString("base64");
  const createdAt = new Date().toISOString();
  const instanceId = await mutate((d) => {
    if (Object.keys(d.devices || {}).length >= 30) return null;
    d.instanceId ??= randomUUID();
    d.devices ??= {};
    d.devices[id] = {
      name: body.name.trim(),
      key,
      createdAt,
    };
    return d.instanceId;
  });
  if (!instanceId)
    return Response.json(
      { error: "Remove an old device first (limit 30)." },
      { status: 409 },
    );
  // The browser supplies its actual origin when assembling the pairing code.
  return Response.json({ v: 1, id, key, instanceId, createdAt }, { headers });
}
export async function DELETE(req: Request) {
  if (!(await authenticated(req))) return unauthorized();
  if (!csrfCheck(req)) return csrfResponse();
  const body = await req.json().catch(() => null);
  if (typeof body?.id !== "string")
    return Response.json({ error: "Device ID required." }, { status: 400 });
  await mutate((d) => {
    if (d.devices) delete d.devices[body.id];
    for (const [key, session] of Object.entries(d.sessions))
      if (session.deviceId === body.id) delete d.sessions[key];
  });
  return Response.json({ ok: true }, { headers });
}

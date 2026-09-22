import { createHash, randomBytes, randomUUID } from "crypto";
import { authenticated, unauthorized } from "@/lib/server/auth";
import { mutate, readData } from "@/lib/server/db";
import { csrfCheck, csrfResponse } from "@/lib/server/security";

export const dynamic = "force-dynamic";
const headers = { "Cache-Control": "no-store" };

const REQUEST_TTL_MS = 5 * 60 * 1000;
const MAX_PENDING = 10;

function hashToken(token: string) {
  return createHash("sha256").update(token, "utf8").digest("hex");
}

function sweep(requests: Record<string, { expiresAt: string }>) {
  const now = Date.now();
  for (const [id, r] of Object.entries(requests))
    if (Date.parse(r.expiresAt) <= now) delete requests[id];
}

function publicView(r: {
  status: string;
  device?: { id: string; key: string; instanceId: string; createdAt: string };
}) {
  if (r.status === "approved" && r.device)
    return {
      status: "approved",
      device: { v: 1, ...r.device },
    };
  return { status: r.status };
}

// Phone polls its own request. Unauthenticated by design; the claim token
// authorizes it, and the pairing secret is only released after owner approval.
export async function GET(req: Request) {
  const url = new URL(req.url);
  const id = url.searchParams.get("id"),
    token = url.searchParams.get("token");
  if (id && token) {
    const result = await mutate((d) => {
      d.pairRequests ??= {};
      sweep(d.pairRequests);
      const r = d.pairRequests[id];
      if (!r || r.clientTokenHash !== hashToken(token)) return null;
      const view = publicView(r);
      if (r.status !== "pending") delete d.pairRequests[id];
      return view;
    });
    if (!result)
      return Response.json(
        { error: "Request not found, declined, or expired." },
        { status: 404, headers },
      );
    return Response.json(result, { headers });
  }
  if (!(await authenticated(req))) return unauthorized();
  const d = await readData();
  sweep(d.pairRequests ?? {});
  return Response.json(
    {
      requests: Object.entries(d.pairRequests || {})
        .filter(([, r]) => r.status === "pending")
        .map(([reqId, r]) => ({
          id: reqId,
          name: r.name,
          sessionNumber: r.sessionNumber,
          createdAt: r.createdAt,
          expiresAt: r.expiresAt,
        })),
    },
    { headers },
  );
}

export async function POST(req: Request) {
  const body = await req.json().catch(() => null);

  // Owner approves or denies from the web UI.
  if (typeof body?.action === "string") {
    if (!(await authenticated(req))) return unauthorized();
    if (!csrfCheck(req)) return csrfResponse();
    if (
      (body.action !== "approve" && body.action !== "deny") ||
      typeof body?.id !== "string"
    )
      return Response.json({ error: "Invalid action." }, { status: 400 });
    const done = await mutate((d) => {
      d.pairRequests ??= {};
      sweep(d.pairRequests);
      const r = d.pairRequests[body.id];
      if (!r || r.status !== "pending") return false;
      if (body.action === "deny") {
        r.status = "denied";
        return true;
      }
      if (Object.keys(d.devices || {}).length >= 30) return "full";
      const id = randomUUID(),
        key = randomBytes(32).toString("base64"),
        createdAt = new Date().toISOString();
      d.instanceId ??= randomUUID();
      d.devices ??= {};
      d.devices[id] = { name: r.name, key, createdAt };
      r.status = "approved";
      r.device = { id, key, instanceId: d.instanceId, createdAt };
      return true;
    });
    if (done === "full")
      return Response.json(
        { error: "Remove an old device first (limit 30)." },
        { status: 409 },
      );
    if (!done)
      return Response.json(
        { error: "Request not found or already handled." },
        { status: 404 },
      );
    return Response.json({ ok: true }, { headers });
  }

  // Phone creates a pairing request. No auth: approval happens on the web,
  // and the 5-digit session number lets the owner match the physical phone.
  if (
    typeof body?.name !== "string" ||
    !body.name.trim() ||
    body.name.length > 80 ||
    typeof body?.sessionNumber !== "string" ||
    !/^\d{5}$/.test(body.sessionNumber) ||
    typeof body?.clientToken !== "string" ||
    body.clientToken.length < 20 ||
    body.clientToken.length > 200
  )
    return Response.json(
      { error: "Name, 5-digit session number, and claim token required." },
      { status: 400 },
    );
  const created = await mutate((d) => {
    if (!d.config.initialized) return null;
    d.pairRequests ??= {};
    sweep(d.pairRequests);
    if (
      Object.values(d.pairRequests).filter((r) => r.status === "pending")
        .length >= MAX_PENDING
    )
      return "busy";
    const id = randomUUID(),
      now = new Date();
    d.pairRequests[id] = {
      name: body.name.trim(),
      sessionNumber: body.sessionNumber,
      clientTokenHash: hashToken(body.clientToken),
      createdAt: now.toISOString(),
      expiresAt: new Date(now.getTime() + REQUEST_TTL_MS).toISOString(),
      status: "pending",
    };
    return { id, expiresAt: d.pairRequests[id].expiresAt };
  });
  if (!created)
    return Response.json(
      { error: "Finish workspace setup before pairing a phone." },
      { status: 409 },
    );
  if (created === "busy")
    return Response.json(
      { error: "Too many pending requests. Approve or wait for expiry." },
      { status: 429 },
    );
  return Response.json(created, { headers });
}

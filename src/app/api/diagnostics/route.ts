import { resolve4, resolve6 } from "node:dns/promises";
import { authenticated, unauthorized } from "@/lib/server/auth";
import { readData } from "@/lib/server/db";
import { normalizeDomain, rateLimit, rateLimitResponse } from "@/lib/server/security";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Authenticated domain diagnostics: DNS + HTTPS probe of the public hostname.
// The probe only ever fetches https://<domain>/api/status (8s timeout) —
// it cannot be pointed at arbitrary URLs or ports.
export async function GET(req: Request) {
  if (!(await authenticated(req))) return unauthorized();
  const limit = rateLimit("diagnostics", 20, 60_000);
  if (!limit.ok) return rateLimitResponse(limit.retryAfterSec);

  const d = await readData();
  const url = new URL(req.url);
  const requested = url.searchParams.get("domain") ?? undefined;
  const normalized = normalizeDomain(
    requested !== undefined ? requested : (d.config.domain ?? null),
  );
  const domain = typeof normalized === "string" ? normalized : null;
  if (!domain)
    return Response.json({
      domain: null,
      message: "Set a public hostname in Settings to run diagnostics.",
    });

  const result: {
    domain: string;
    dns: { a: string[]; aaaa: string[]; error?: string };
    https: { ok: boolean; status?: number; initialized?: boolean; error?: string };
    runtime: { host: string; port: number; https: boolean };
  } = {
    domain,
    dns: { a: [], aaaa: [] },
    https: { ok: false },
    runtime: {
      host: process.env.NINE_T_HOST || "0.0.0.0",
      port: Number(process.env.PORT || 3265),
      https: process.env.NINE_T_HTTPS === "true",
    },
  };

  try {
    result.dns.a = await resolve4(domain);
  } catch (e) {
    result.dns.error = e instanceof Error ? e.message : "DNS lookup failed.";
  }
  try {
    result.dns.aaaa = await resolve6(domain);
  } catch {
    // AAAA absence is normal; only record if A also failed.
    if (!result.dns.a.length && !result.dns.error)
      result.dns.error = "No A or AAAA records.";
  }
  if (!result.dns.a.length && !result.dns.aaaa.length && !result.dns.error)
    result.dns.error = "No DNS records found.";

  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 8000);
    try {
      const res = await fetch(`https://${domain}/api/status`, {
        signal: controller.signal,
        redirect: "manual",
      });
      result.https.status = res.status;
      if (res.ok) {
        const body = (await res.json().catch(() => null)) as {
          initialized?: boolean;
        } | null;
        result.https.ok = true;
        result.https.initialized = body?.initialized;
      } else {
        result.https.error = `HTTPS returned ${res.status}. Check the reverse proxy.`;
      }
    } finally {
      clearTimeout(timeout);
    }
  } catch (e) {
    result.https.error =
      e instanceof Error && e.name === "AbortError"
        ? "Timed out reaching https://…/api/status."
        : "Could not reach https://…/api/status. Check DNS, proxy and firewall.";
  }
  return Response.json(result);
}

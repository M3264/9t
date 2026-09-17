import { z } from "zod";
import path from "path";
import { uploadDir } from "./store";

// ---- Limits ----
export const MAX_PASSWORD_LEN = 128;
export const MIN_PASSWORD_LEN = 8;
export const MIN_SHARE_PASSWORD_LEN = 8;
export const MAX_USERNAME_LEN = 64;
export const MAX_NAME_LEN = 200;
export const MAX_CONTENT_LEN = 500_000; // 500k chars for snippets
export const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// ---- Rate limiting (in-memory, per-process) ----
type Bucket = { count: number; resetAt: number };
const buckets = new Map<string, Bucket>();

export function rateLimit(key: string, limit: number, windowMs: number): {
  ok: boolean;
  retryAfterSec: number;
} {
  const now = Date.now();
  const entry = buckets.get(key);
  if (!entry || entry.resetAt <= now) {
    buckets.set(key, { count: 1, resetAt: now + windowMs });
    return { ok: true, retryAfterSec: 0 };
  }
  if (entry.count < limit) {
    entry.count++;
    return { ok: true, retryAfterSec: 0 };
  }
  return {
    ok: false,
    retryAfterSec: Math.max(1, Math.ceil((entry.resetAt - now) / 1000)),
  };
}

export function clientIp(req: Request): string {
  const fwd = req.headers.get("x-forwarded-for");
  if (fwd) return fwd.split(",")[0].trim();
  const real = req.headers.get("x-real-ip");
  if (real) return real.trim();
  return "unknown";
}

export function rateLimitResponse(retryAfterSec: number) {
  return Response.json(
    { error: "Too many requests. Try again soon." },
    {
      status: 429,
      headers: { "Retry-After": String(retryAfterSec) },
    },
  );
}

// Sensitive auth endpoints: 20 attempts / 10 min per IP, stricter for setup
export function authRateLimit(req: Request, scope: string) {
  const limit = scope === "setup" ? 10 : 20;
  const result = rateLimit(
    `${scope}:${clientIp(req)}`,
    limit,
    10 * 60 * 1000,
  );
  return result;
}

// ---- CSRF: Origin check for cookie-authed mutations ----
export function isBearerAuth(req: Request): boolean {
  return /^Bearer\s+.+/i.test(req.headers.get("authorization") || "");
}

export function csrfCheck(req: Request): boolean {
  // Bearer (CLI tokens) are exempt — not ambient credentials.
  if (isBearerAuth(req)) return true;
  const method = req.method.toUpperCase();
  if (method === "GET" || method === "HEAD" || method === "OPTIONS")
    return true;
  const origin = req.headers.get("origin");
  // No Origin header (same-origin form posts, curl, mobile) — allow;
  // SameSite=Lax is the primary defence there.
  if (!origin) return true;
  try {
    const originHost = new URL(origin).host;
    const host =
      req.headers.get("x-forwarded-host") || req.headers.get("host") || "";
    return originHost === host;
  } catch {
    return false;
  }
}

export function csrfResponse() {
  return Response.json({ error: "CSRF check failed." }, { status: 403 });
}

// ---- Safe file paths ----
export function safeObjectPath(storageKey: string): string | null {
  if (!UUID_RE.test(storageKey)) return null;
  // path.join + basename defence-in-depth (no traversal even if key ever user-controlled)
  const base = path.basename(storageKey);
  return path.join(uploadDir, base);
}

// ---- Zod schemas ----
export const usernameSchema = z
  .string()
  .min(2)
  .max(MAX_USERNAME_LEN)
  .regex(/^[a-zA-Z0-9._-]+$/, "Use letters, numbers, dot, underscore or dash.");

export const passwordSchema = z
  .string()
  .min(MIN_PASSWORD_LEN, "Use a password of at least 8 characters.")
  .max(
    MAX_PASSWORD_LEN,
    `Password must be at most ${MAX_PASSWORD_LEN} characters.`,
  );

export const setupSchema = z.object({
  username: usernameSchema,
  password: passwordSchema,
  setupToken: z.string().min(1),
  modules: z
    .object({
      snippets: z.boolean().optional(),
      files: z.boolean().optional(),
      links: z.boolean().optional(),
      board: z.boolean().optional(),
    })
    .optional(),
  exposure: z.enum(["lan", "public", "hybrid"]).optional(),
});

export const loginSchema = z.object({
  username: z.string().min(1).max(MAX_USERNAME_LEN),
  password: z.string().min(1).max(MAX_PASSWORD_LEN),
});

export const shareCreateSchema = z.object({
  objectId: z.string().uuid(),
  lifetime: z.enum(["1h", "1d", "7d", "30d", "forever"]).optional(),
  password: z
    .string()
    .min(
      MIN_SHARE_PASSWORD_LEN,
      `Share passwords must be at least ${MIN_SHARE_PASSWORD_LEN} characters.`,
    )
    .max(MAX_PASSWORD_LEN)
    .optional(),
});

export const objectPatchSchema = z
  .object({
    pinned: z.boolean().optional(),
    restore: z.boolean().optional(),
    name: z.string().min(1).max(MAX_NAME_LEN).optional(),
    content: z.string().max(MAX_CONTENT_LEN).optional(),
    language: z.string().max(32).optional(),
    url: z.string().max(2048).optional(),
    expiresAt: z.string().nullable().optional(),
    board: z
      .object({ x: z.number().finite(), y: z.number().finite() })
      .optional(),
  })
  .strict();

export const configPatchSchema = z
  .object({
    modules: z
      .object({
        snippets: z.boolean().optional(),
        files: z.boolean().optional(),
        links: z.boolean().optional(),
        board: z.boolean().optional(),
      })
      .optional(),
    theme: z.enum(["system", "light", "dark"]).optional(),
    maxSizeMb: z.number().int().positive().max(2048).optional(),
  })
  .strict();

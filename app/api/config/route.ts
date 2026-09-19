import { authenticated, unauthorized } from "@/lib/server/auth";
import { mutate, readData } from "@/lib/server/db";
import {
  configPatchSchema,
  configViolations,
  csrfCheck,
  csrfResponse,
  fullConfigSchema,
  normalizeDomain,
} from "@/lib/server/security";

function publicConfig(c: {
  modules: { snippets: boolean; files: boolean; links: boolean; board: boolean };
  theme: "system" | "light" | "dark";
  maxSizeMb: number;
  trashRetentionDays: number;
  exposure: "lan" | "public" | "hybrid";
  domain?: string | null;
}) {
  return {
    modules: c.modules,
    theme: c.theme,
    maxSizeMb: c.maxSizeMb,
    trashRetentionDays: c.trashRetentionDays,
    exposure: c.exposure,
    domain: c.domain ?? null,
  };
}

export async function GET(req: Request) {
  if (!(await authenticated(req))) return unauthorized();
  const d = await readData();
  const url = new URL(req.url);
  if (url.searchParams.get("format") === "export") {
    return Response.json(
      {
        version: 1,
        kind: "9t-config",
        exportedAt: new Date().toISOString(),
        config: publicConfig(d.config),
      },
      {
        headers: {
          "Content-Disposition": 'attachment; filename="9t-config.json"',
        },
      },
    );
  }
  return Response.json(publicConfig(d.config));
}

export async function PATCH(req: Request) {
  if (!(await authenticated(req))) return unauthorized();
  if (!csrfCheck(req)) return csrfResponse();
  let raw: unknown;
  try {
    raw = await req.json();
  } catch {
    return Response.json({ error: "Invalid JSON." }, { status: 400 });
  }
  if (
    raw &&
    typeof raw === "object" &&
    "domain" in (raw as Record<string, unknown>)
  ) {
    const normalized = normalizeDomain(
      (raw as Record<string, unknown>).domain,
    );
    if (normalized !== undefined)
      (raw as Record<string, unknown>).domain = normalized;
  }
  const parsed = configPatchSchema.safeParse(raw);
  if (!parsed.success)
    return Response.json(
      {
        error: "invalid_config",
        violations: configViolations(parsed.error.issues),
      },
      { status: 400 },
    );
  const body = parsed.data;
  if (body.modules) {
    const current = (await readData()).config.modules;
    const next = { ...current, ...body.modules };
    if (!next.snippets && !next.files && !next.links)
      return Response.json(
        {
          error: "invalid_config",
          violations: [
            {
              field: "modules",
              code: "custom",
              message: "Enable at least one of snippets, files or links.",
            },
          ],
        },
        { status: 400 },
      );
  }
  await mutate((d) => {
    if (body.modules)
      d.config.modules = { ...d.config.modules, ...body.modules };
    if (body.theme) d.config.theme = body.theme;
    if (typeof body.maxSizeMb === "number")
      d.config.maxSizeMb = body.maxSizeMb;
    if (typeof body.trashRetentionDays === "number")
      d.config.trashRetentionDays = body.trashRetentionDays;
    if (body.exposure) d.config.exposure = body.exposure;
    if (body.domain !== undefined) d.config.domain = body.domain;
  });
  return Response.json({ ok: true });
}

export async function PUT(req: Request) {
  if (!(await authenticated(req))) return unauthorized();
  if (!csrfCheck(req)) return csrfResponse();
  let raw: unknown;
  try {
    raw = await req.json();
  } catch {
    return Response.json({ error: "Invalid JSON." }, { status: 400 });
  }
  // Accept both raw config and exported envelope {kind,version,config}.
  const rawDoc =
    raw && typeof raw === "object" && "config" in (raw as Record<string, unknown>)
      ? (raw as Record<string, unknown>).config
      : raw;
  const doc =
    rawDoc && typeof rawDoc === "object"
      ? { ...(rawDoc as Record<string, unknown>) }
      : rawDoc;
  if (doc && typeof doc === "object" && "domain" in doc) {
    const normalized = normalizeDomain(
      (doc as Record<string, unknown>).domain,
    );
    if (normalized !== undefined)
      (doc as Record<string, unknown>).domain = normalized;
  }
  // Old exports predate the domain field — default instead of rejecting.
  if (doc && typeof doc === "object" && !("domain" in doc)) {
    (doc as Record<string, unknown>).domain = null;
  }
  const parsed = fullConfigSchema.safeParse(doc);
  if (!parsed.success)
    return Response.json(
      {
        error: "invalid_config",
        violations: configViolations(parsed.error.issues),
      },
      { status: 400 },
    );
  const body = parsed.data;
  if (!body.modules.snippets && !body.modules.files && !body.modules.links)
    return Response.json(
      {
        error: "invalid_config",
        violations: [
          {
            field: "modules",
            code: "custom",
            message: "Enable at least one of snippets, files or links.",
          },
        ],
      },
      { status: 400 },
    );
  await mutate((d) => {
    d.config.modules = body.modules;
    d.config.theme = body.theme;
    d.config.maxSizeMb = body.maxSizeMb;
    d.config.trashRetentionDays = body.trashRetentionDays;
    d.config.exposure = body.exposure;
    d.config.domain = body.domain;
  });
  return Response.json({ ok: true });
}

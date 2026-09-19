import { authenticated, unauthorized } from "@/lib/server/auth";
import { mutate, readData } from "@/lib/server/store";
import {
  configPatchSchema,
  configViolations,
  csrfCheck,
  csrfResponse,
  fullConfigSchema,
} from "@/lib/server/security";

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
        config: {
          modules: d.config.modules,
          theme: d.config.theme,
          maxSizeMb: d.config.maxSizeMb,
          trashRetentionDays: d.config.trashRetentionDays,
          exposure: d.config.exposure,
        },
      },
      {
        headers: {
          "Content-Disposition": 'attachment; filename="9t-config.json"',
        },
      },
    );
  }
  return Response.json(d.config);
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
  const doc =
    raw && typeof raw === "object" && "config" in (raw as Record<string, unknown>)
      ? (raw as Record<string, unknown>).config
      : raw;
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
  });
  return Response.json({ ok: true });
}

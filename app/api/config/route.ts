import { authenticated, unauthorized } from "@/lib/server/auth";
import { mutate, readData } from "@/lib/server/store";
import {
  configPatchSchema,
  csrfCheck,
  csrfResponse,
} from "@/lib/server/security";

export async function GET(req: Request) {
  if (!(await authenticated(req))) return unauthorized();
  return Response.json((await readData()).config);
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
    return Response.json({ error: "Invalid config." }, { status: 400 });
  const body = parsed.data;
  await mutate((d) => {
    if (body.modules)
      d.config.modules = { ...d.config.modules, ...body.modules };
    if (body.theme) d.config.theme = body.theme;
    if (typeof body.maxSizeMb === "number")
      d.config.maxSizeMb = body.maxSizeMb;
  });
  return Response.json({ ok: true });
}

import { createHash, randomBytes, randomUUID } from "crypto";
import { verifyPassword } from "../../../../lib/auth";
import { mutate, readData } from "../../../../lib/store";

export async function POST(req: Request) {
  const { username, password, name = "CLI" } = await req.json();
  const data = await readData();
  if (
    !data.user ||
    username !== data.user.username ||
    !verifyPassword(password, data.user.salt, data.user.passwordHash)
  )
    return Response.json(
      { error: "Invalid username or password." },
      { status: 401 },
    );
  const token = `9t_${randomBytes(32).toString("base64url")}`,
    id = randomUUID();
  await mutate((d) => {
    d.apiTokens ??= {};
    d.apiTokens[id] = {
      name: String(name).slice(0, 80),
      hash: createHash("sha256").update(token).digest("hex"),
      createdAt: new Date().toISOString(),
    };
  });
  return Response.json({ token });
}

export async function DELETE(req: Request) {
  const bearer = req.headers
    .get("authorization")
    ?.match(/^Bearer\s+(.+)$/i)?.[1];
  if (!bearer) return Response.json({ error: "unauthorized" }, { status: 401 });
  const hash = createHash("sha256").update(bearer).digest("hex");
  await mutate((d) => {
    for (const [id, t] of Object.entries(d.apiTokens || {}))
      if (t.hash === hash) delete d.apiTokens![id];
  });
  return Response.json({ ok: true });
}

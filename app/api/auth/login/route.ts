import { createSession, verifyPassword } from "../../../../lib/auth";
import { readData } from "../../../../lib/store";
export async function POST(req: Request) {
  const { username, password } = await req.json();
  const d = await readData();
  if (
    !d.user ||
    username !== d.user.username ||
    !verifyPassword(password, d.user.salt, d.user.passwordHash)
  )
    return Response.json(
      { error: "Invalid username or password." },
      { status: 401 },
    );
  await createSession();
  return Response.json({ ok: true });
}

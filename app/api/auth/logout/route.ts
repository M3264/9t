import { destroySession } from "@/lib/server/auth";
export async function POST() {
  await destroySession();
  return Response.json({ ok: true });
}

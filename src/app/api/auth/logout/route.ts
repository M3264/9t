import { destroySession } from "@/lib/server/auth";
import { csrfCheck, csrfResponse } from "@/lib/server/security";

export async function POST(req: Request) {
  if (!csrfCheck(req)) return csrfResponse();
  await destroySession();
  return Response.json({ ok: true });
}

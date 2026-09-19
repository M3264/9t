import { authenticated, unauthorized } from "@/lib/server/auth";
import { mutate } from "@/lib/server/db";
import { csrfCheck, csrfResponse } from "@/lib/server/security";

export async function DELETE(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  if (!(await authenticated(req))) return unauthorized();
  if (!csrfCheck(req)) return csrfResponse();
  const { id } = await params;
  await mutate((d) => {
    delete d.shares[id];
  });
  return Response.json({ ok: true });
}

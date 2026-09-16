import { authenticated, unauthorized } from "../../../../lib/auth";
import { mutate } from "../../../../lib/store";
export async function DELETE(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  if (!(await authenticated(req))) return unauthorized();
  const { id } = await params;
  await mutate((d) => {
    delete d.shares[id];
  });
  return Response.json({ ok: true });
}

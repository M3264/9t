import { readFile } from "fs/promises";
import { mutate, readData, uploadDir } from "@/lib/server/store";
import { cookies } from "next/headers";
import { createHash } from "crypto";
export async function GET(
  _: Request,
  { params }: { params: Promise<{ token: string }> },
) {
  const { token } = await params,
    d = await readData(),
    share = Object.values(d.shares).find((s) => s.token === token),
    o = share && d.objects.find((x) => x.id === share.objectId);
  if (
    !share ||
    !o?.storageKey ||
    o.deletedAt ||
    (share.expiresAt && new Date(share.expiresAt) <= new Date())
  )
    return new Response("This handoff is unavailable.", { status: 404 });
  if (share.passwordHash) {
    const key = createHash("sha256")
      .update(`${share.token}:${share.passwordHash}`)
      .digest("hex");
    if ((await cookies()).get(`9t_share_${share.id}`)?.value !== key)
      return new Response("Unlock this handoff first.", { status: 401 });
  }
  const data = await readFile(`${uploadDir}/${o.storageKey}`);
  await mutate((x) => {
    const current = x.shares[share.id];
    if (current) current.accessCount++;
  });
  return new Response(new Uint8Array(data), {
    headers: {
      "Content-Type": o.mimeType || "application/octet-stream",
      "Content-Disposition": `attachment; filename*=UTF-8''${encodeURIComponent(o.name)}`,
    },
  });
}

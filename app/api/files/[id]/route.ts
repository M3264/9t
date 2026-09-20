import { authenticated, unauthorized } from "@/lib/server/auth";
import { readData } from "@/lib/server/db";
import { getBlobStore, validStorageKey } from "@/lib/server/storage";

export async function GET(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  if (!(await authenticated(req))) return unauthorized();
  const { id } = await params;
  const o = (await readData()).objects.find(
    (x) => x.id === id && !x.deletedAt && x.type === "file",
  );
  if (!o?.storageKey || !validStorageKey(o.storageKey))
    return new Response("Not found", { status: 404 });
  let data: Buffer;
  try {
    ({ body: data } = await getBlobStore().get(o.storageKey));
  } catch {
    return new Response("Not found", { status: 404 });
  }
  return new Response(new Uint8Array(data), {
    headers: {
      "Content-Type": o.mimeType || "application/octet-stream",
      "Content-Disposition": `attachment; filename*=UTF-8''${encodeURIComponent(o.name)}`,
      "Content-Length": String(data.length),
    },
  });
}

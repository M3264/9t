import { authenticated, unauthorized } from "@/lib/server/auth";
import { readData } from "@/lib/server/db";
import { getBlobStore, validStorageKey } from "@/lib/server/storage";
import { canPreviewImage, MAX_IMAGE_PREVIEW_BYTES } from "@/lib/shared/image-preview";

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
  const preview = new URL(req.url).searchParams.get("preview") === "1";
  if (preview && !canPreviewImage(o))
    return new Response("Preview unavailable", { status: 404 });
  let data: Buffer;
  try {
    const blob = await getBlobStore().get(
      o.storageKey,
      preview ? { offset: 0, length: MAX_IMAGE_PREVIEW_BYTES + 1 } : undefined,
    );
    if (
      preview &&
      (blob.total > MAX_IMAGE_PREVIEW_BYTES ||
        blob.body.length > MAX_IMAGE_PREVIEW_BYTES)
    )
      return new Response("Preview unavailable", { status: 404 });
    data = blob.body;
  } catch {
    return new Response("Not found", { status: 404 });
  }
  return new Response(new Uint8Array(data), {
    headers: {
      "Content-Type": o.mimeType || "application/octet-stream",
      "Content-Disposition": `${preview ? "inline" : "attachment"}; filename*=UTF-8''${encodeURIComponent(o.name)}`,
      "Content-Length": String(data.length),
    },
  });
}

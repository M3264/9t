import { readFile } from "fs/promises";
import { authenticated, unauthorized } from "@/lib/server/auth";
import { readData } from "@/lib/server/db";
import { safeObjectPath } from "@/lib/server/security";

export async function GET(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  if (!(await authenticated(req))) return unauthorized();
  const { id } = await params;
  const o = (await readData()).objects.find(
    (x) => x.id === id && !x.deletedAt && x.type === "file",
  );
  if (!o?.storageKey) return new Response("Not found", { status: 404 });
  const full = safeObjectPath(o.storageKey);
  if (!full) return new Response("Not found", { status: 404 });
  let data: Buffer;
  try {
    data = await readFile(full);
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

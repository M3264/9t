import { randomUUID } from "crypto";
import { createWriteStream } from "fs";
import { pipeline } from "stream/promises";
import { authenticated, unauthorized } from "@/lib/server/auth";
import { addObject, readData } from "@/lib/server/store";
import { safeObjectPath } from "@/lib/server/security";
import { csrfCheck, csrfResponse } from "@/lib/server/security";
import { expiryFromLifetime } from "@/lib/shared/lifetimes";
import { MAX_CONTENT_LEN, MAX_NAME_LEN } from "@/lib/server/security";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  if (!(await authenticated(req))) return unauthorized();
  // Expiry sweep runs via scheduled worker (scripts/maintenance.mjs),
  // not on read path — avoids read amplification + races.
  const d = await readData(),
    url = new URL(req.url),
    trash = url.searchParams.get("trash") === "true";
  return Response.json({
    objects: d.objects.filter((o) => (trash ? !!o.deletedAt : !o.deletedAt)),
    config: d.config,
  });
}

export async function POST(req: Request) {
  if (!(await authenticated(req))) return unauthorized();
  if (!csrfCheck(req)) return csrfResponse();

  let form: FormData;
  try {
    form = await req.formData();
  } catch {
    return Response.json({ error: "Invalid form data." }, { status: 400 });
  }
  const type = String(form.get("type") || "");
  const name = String(form.get("name") || "").trim();
  const lifetime = String(form.get("lifetime") || "forever");

  if (!name || name.length > MAX_NAME_LEN || !["snippet", "file", "link"].includes(type))
    return Response.json(
      { error: "A valid type and name are required." },
      { status: 400 },
    );

  const expiresAt = expiryFromLifetime(lifetime);

  if (type === "file") {
    const file = form.get("file");
    if (!(file instanceof File))
      return Response.json({ error: "Choose a file." }, { status: 400 });
    const d = await readData();
    if (file.size > d.config.maxSizeMb * 1024 * 1024)
      return Response.json(
        { error: `File exceeds ${d.config.maxSizeMb} MB.` },
        { status: 413 },
      );
    if (file.size <= 0)
      return Response.json({ error: "Empty file." }, { status: 400 });

    const storageKey = randomUUID();
    const dest = safeObjectPath(storageKey);
    if (!dest)
      return Response.json({ error: "Storage error." }, { status: 500 });

    // Stream to disk — never buffer the whole file in memory.
    try {
      const webStream = file.stream();
      const nodeStream = webStream as unknown as NodeJS.ReadableStream;
      await pipeline(
        nodeStream as never,
        createWriteStream(dest, { mode: 0o600 }) as never,
      );
    } catch {
      return Response.json({ error: "Upload failed." }, { status: 500 });
    }
    return Response.json(
      await addObject({
        type: "file",
        name,
        mimeType: file.type || "application/octet-stream",
        sizeBytes: file.size,
        storageKey,
        expiresAt,
      }),
    );
  }
  if (type === "link") {
    let link = String(form.get("url") || "");
    if (link.length > 2048)
      return Response.json({ error: "URL too long." }, { status: 400 });
    try {
      const parsed = new URL(link);
      if (!["http:", "https:"].includes(parsed.protocol))
        throw new Error("bad protocol");
      link = parsed.toString();
    } catch {
      return Response.json({ error: "Enter a valid URL." }, { status: 400 });
    }
    return Response.json(
      await addObject({ type: "link", name, url: link, expiresAt }),
    );
  }
  const content = String(form.get("content") || "");
  if (content.length > MAX_CONTENT_LEN)
    return Response.json({ error: "Snippet too large." }, { status: 413 });
  return Response.json(
    await addObject({
      type: "snippet",
      name,
      content,
      language: String(form.get("language") || "text").slice(0, 32),
      expiresAt,
    }),
  );
}

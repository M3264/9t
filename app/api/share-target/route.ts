import { randomUUID } from "crypto";
import { createWriteStream } from "fs";
import { pipeline } from "stream/promises";
import { authenticated } from "@/lib/server/auth";
import { addObject, readData } from "@/lib/server/store";
import { safeObjectPath } from "@/lib/server/security";

export async function POST(req: Request) {
  if (!(await authenticated(req)))
    return Response.redirect(new URL("/", req.url), 303);
  let form: FormData;
  try {
    form = await req.formData();
  } catch {
    return Response.redirect(new URL("/?share=error", req.url), 303);
  }
  const file = form.get("file"),
    title = String(form.get("name") || "").trim().slice(0, 200),
    url = String(form.get("url") || "").trim().slice(0, 2048),
    text = String(form.get("text") || "").trim().slice(0, 500_000);
  if (file instanceof File && file.size) {
    const data = await readData();
    if (file.size > data.config.maxSizeMb * 1024 * 1024)
      return Response.redirect(new URL("/?share=too-large", req.url), 303);
    const storageKey = randomUUID();
    const dest = safeObjectPath(storageKey);
    if (!dest)
      return Response.redirect(new URL("/?share=error", req.url), 303);
    try {
      await pipeline(
        file.stream() as unknown as never,
        createWriteStream(dest, { mode: 0o600 }) as never,
      );
    } catch {
      return Response.redirect(new URL("/?share=error", req.url), 303);
    }
    await addObject({
      type: "file",
      name: title || file.name.slice(0, 200),
      mimeType: file.type || "application/octet-stream",
      sizeBytes: file.size,
      storageKey,
    });
  } else if (url) {
    try {
      const normalized = new URL(url);
      if (!["http:", "https:"].includes(normalized.protocol))
        throw new Error("bad protocol");
      const str = normalized.toString();
      await addObject({
        type: "link",
        name: title || normalized.hostname,
        url: str,
      });
    } catch {
      await addObject({
        type: "snippet",
        name: title || "Shared text",
        content: [text, url].filter(Boolean).join("\n").slice(0, 500_000),
        language: "text",
      });
    }
  } else if (text)
    await addObject({
      type: "snippet",
      name: title || text.split("\n")[0].slice(0, 52),
      content: text,
      language: "text",
    });
  return Response.redirect(new URL("/?share=added", req.url), 303);
}

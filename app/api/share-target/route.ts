import { randomUUID } from "crypto";
import { writeFile } from "fs/promises";
import { authenticated } from "@/lib/server/auth";
import { addObject, readData, uploadDir } from "@/lib/server/store";

export async function POST(req: Request) {
  if (!(await authenticated(req)))
    return Response.redirect(new URL("/", req.url), 303);
  const form = await req.formData(),
    file = form.get("file"),
    title = String(form.get("name") || "").trim(),
    url = String(form.get("url") || "").trim(),
    text = String(form.get("text") || "").trim();
  if (file instanceof File && file.size) {
    const data = await readData();
    if (file.size > data.config.maxSizeMb * 1024 * 1024)
      return Response.redirect(new URL("/?share=too-large", req.url), 303);
    const storageKey = randomUUID();
    await writeFile(
      `${uploadDir}/${storageKey}`,
      Buffer.from(await file.arrayBuffer()),
    );
    await addObject({
      type: "file",
      name: title || file.name,
      mimeType: file.type || "application/octet-stream",
      sizeBytes: file.size,
      storageKey,
    });
  } else if (url) {
    try {
      const normalized = new URL(url).toString();
      await addObject({
        type: "link",
        name: title || new URL(normalized).hostname,
        url: normalized,
      });
    } catch {
      await addObject({
        type: "snippet",
        name: title || "Shared text",
        content: [text, url].filter(Boolean).join("\n"),
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

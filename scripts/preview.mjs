#!/usr/bin/env node
// A local, authenticated workspace with sample content for trying the UI.
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { randomBytes, randomUUID, scryptSync } from "node:crypto";
import { spawn } from "node:child_process";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = dirname(dirname(fileURLToPath(import.meta.url)));
export const previewCredentials = { username: "demo", password: "9t-local-preview" };

export async function seedPreview(directory) {
  const database = join(directory, "9t.json");
  try {
    // Leave an existing preview, including a corrupt one, untouched.
    await readFile(database);
    return false;
  } catch (error) {
    if (error.code !== "ENOENT") throw error;
  }
  await mkdir(join(directory, "objects"), { recursive: true, mode: 0o700 });
  const salt = randomBytes(16).toString("hex");
  const now = Date.now();
  const ago = (hours) => new Date(now - hours * 3600000).toISOString();
  const base = (id, type, name, hours, pinned = false) => ({ id, type, name, pinned,
    createdAt: ago(hours + 1), updatedAt: ago(hours) });
  const file = async (id, name, content, mimeType, hours, pinned = false) => {
    const storageKey = randomUUID();
    await writeFile(join(directory, "objects", storageKey), content, { mode: 0o600 });
    return { ...base(id, "file", name, hours, pinned), storageKey, mimeType, sizeBytes: Buffer.byteLength(content) };
  };
  const objects = [
    { ...base("ctch", "snippet", "A thought to come back to", 0.08), language: "text", content: "Good tools make room for the work.\nLess hunting for things. More making things." },
    { ...base("shll", "snippet", "My everyday commands", 0.4, true), language: "bash", content: "# A few little time-savers\ngit status --short\nnpm run dev\n\n# Send a file to my workspace\n9t push ./notes.md" },
    await file("ntes", "weekend-notes.md", "# Weekend notes\n\n- Sketch the next small thing\n- Take a few photos\n- Read something away from a screen\n", "text/markdown", 1),
    { ...base("docs", "link", "9t on GitHub", 2, true), url: "https://github.com/M3264/9t" },
    await file("mark", "9t-brand.svg", await readFile(join(root, "public/9t-mark.svg")), "image/svg+xml", 3, true),
    { ...base("cssv", "snippet", "A softer color palette", 5), language: "css", content: ":root {\n  --paper: #fdfcfe;\n  --lavender: #7957bf;\n  --ink: #282533;\n}\n\n/* A little breathing room. */\nmain { max-width: 1200px; }" },
    { ...base("read", "link", "A good place to learn CSS", 22), url: "https://developer.mozilla.org/en-US/docs/Web/CSS" },
    await file("plan", "small-things.json", '{\n  "next": "Make something useful",\n  "pace": "One small thing at a time"\n}\n', "application/json", 26),
    { ...base("idea", "snippet", "Ideas for later", 48), language: "text", content: "A place for the things between devices.\n\nSave a link on the phone.\nPick it up on the laptop.\nKeep the useful bits within reach." },
  ];
  const data = {
    instanceId: randomUUID(), devices: {}, pairRequests: {},
    config: { initialized: true, modules: { snippets: true, files: true, links: true, board: true },
      exposure: "lan", domain: null, theme: "light", maxSizeMb: 500, trashRetentionDays: 7 },
    user: { username: previewCredentials.username, salt, passwordHash: scryptSync(previewCredentials.password, salt, 64).toString("hex") },
    sessions: {}, apiTokens: {}, objects, shares: {},
  };
  await writeFile(database, JSON.stringify(data, null, 2), { flag: "wx", mode: 0o600 });
  return true;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const directory = join(root, ".9t", "ui-preview");
  const port = process.env.NINE_T_PREVIEW_PORT || "3266";
  if (!/^\d+$/.test(port) || Number(port) < 1024 || Number(port) > 65535) throw new Error("Invalid preview port.");
  await seedPreview(directory);
  console.log(`\n9t local UI preview: http://localhost:${port}\nUsername: ${previewCredentials.username}\nPassword: ${previewCredentials.password}\nSample data: ${directory}\n`);
  const child = spawn(process.execPath, [join(root, "scripts/serve.mjs"), "--dev"], {
    cwd: root, stdio: "inherit", env: { ...process.env, NODE_ENV: "development", PORT: port,
      NINE_T_HOST: "127.0.0.1", NINE_T_DATA_DIR: directory, NINE_T_BUILD_DIR: ".next-preview",
      NINE_T_DATABASE_URL: "", NINE_T_STORAGE_DRIVER: "local", NINE_T_HTTPS: "false", NINE_T_SETUP_TOKEN: "" },
  });
  for (const signal of ["SIGINT", "SIGTERM"]) process.on(signal, () => child.kill(signal));
  child.on("error", (error) => { console.error(error.message); process.exitCode = 1; });
  child.on("exit", (code) => { process.exitCode = code ?? 0; });
}

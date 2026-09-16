#!/usr/bin/env node
import { mkdtemp, readFile, cp, rename } from "node:fs/promises";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { join, resolve } from "node:path";
import { tmpdir } from "node:os";

const archive = process.argv[2],
  verifyOnly = process.argv.includes("--verify");
if (!archive)
  throw new Error("Usage: node scripts/restore.mjs <backup.tar.gz> [--verify]");
const run = promisify(execFile),
  temp = await mkdtemp(join(tmpdir(), "9t-restore-"));
await run("tar", ["-xzf", resolve(archive), "-C", temp]);
const data = JSON.parse(await readFile(join(temp, "9t.json"), "utf8"));
if (!Array.isArray(data.objects) || typeof data.shares !== "object")
  throw new Error("Backup does not contain valid 9t data.");
if (verifyOnly)
  console.log(`Valid 9t backup: ${data.objects.length} object(s)`);
else {
  const root = resolve(
      process.env.NINE_T_DATA_DIR || join(process.cwd(), "data"),
    ),
    previous = `${root}.before-restore-${Date.now()}`;
  await rename(root, previous);
  await cp(temp, root, { recursive: true });
  console.log(
    `Restored ${data.objects.length} object(s). Previous data: ${previous}`,
  );
}

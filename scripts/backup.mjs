#!/usr/bin/env node
import { mkdir, readdir, stat, unlink } from "node:fs/promises";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { join, resolve } from "node:path";

const run = promisify(execFile),
  root = resolve(process.env.NINE_T_DATA_DIR || join(process.cwd(), "data")),
  target = resolve(
    process.env.NINE_T_BACKUP_DIR || join(process.cwd(), "backups"),
  );
await mkdir(target, { recursive: true, mode: 0o700 });
const stamp = new Date().toISOString().replace(/[:.]/g, "-");
const archive = join(target, `9t-${stamp}.tar.gz`);
await run("tar", ["-czf", archive, "-C", root, "."]);
const files = (await readdir(target)).filter((name) =>
  /^9t-.*\.tar\.gz$/.test(name),
);
const details = await Promise.all(
  files.map(async (name) => ({
    name,
    time: (await stat(join(target, name))).mtimeMs,
  })),
);
details.sort((a, b) => b.time - a.time);
for (const old of details.slice(Number(process.env.NINE_T_BACKUP_KEEP || 14)))
  await unlink(join(target, old.name));
console.log(archive);

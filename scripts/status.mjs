#!/usr/bin/env node
// 9t status — service, listener and app health in one place. Read-only.
import { existsSync, readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { execFileSync } from "node:child_process";
import { serviceName } from "./setup.mjs";

function sh(exe, args) {
  try {
    return execFileSync(exe, args, { encoding: "utf8" }).trim();
  } catch {
    return null;
  }
}

function envFile(root) {
  const file = join(root, ".env.production");
  if (!existsSync(file)) return {};
  const out = {};
  for (const line of readFileSync(file, "utf8").split("\n")) {
    const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
    if (m) out[m[1]] = m[2].replace(/^"(.*)"$/, "$1");
  }
  return out;
}

export async function status(root) {
  const unit = serviceName(root);
  const units = [unit, "9t.service"].filter(
    (u, i, all) => all.indexOf(u) === i,
  );
  let serviceLine = "service: not installed";
  for (const name of units) {
    const state = sh("systemctl", ["is-active", name]);
    if (state && state !== "unknown") {
      serviceLine = `service: ${name} is ${state}`;
      break;
    }
  }
  console.log(serviceLine);
  const env = { ...envFile(root), ...process.env };
  const port = env.PORT || "3265";
  const dist = env.NINE_T_BUILD_DIR || ".next";
  console.log(
    existsSync(resolve(root, dist, "BUILD_ID"))
      ? `build: ${dist} ready`
      : `build: ${dist} missing (run ./9t update or npm run build)`,
  );
  let healthy = false;
  try {
    const r = await fetch(`http://127.0.0.1:${port}/api/status`, {
      signal: AbortSignal.timeout(5000),
    });
    const body = await r.json().catch(() => ({}));
    console.log(
      `listener: 127.0.0.1:${port} responds (initialized: ${body.initialized === true})`,
    );
    healthy = r.ok;
  } catch {
    console.log(`listener: nothing on 127.0.0.1:${port}`);
  }
  return healthy ? 0 : 1;
}

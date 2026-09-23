#!/usr/bin/env node
// Publish the landing + docs site (site/, Astro build) to the nginx web root.
// Safe to re-run. Never touches the app, data/, or .env.production.
import { cp, mkdir, stat } from "node:fs/promises";
import { existsSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const args = process.argv.slice(2);
if (args.includes("--help") || args.includes("-h")) {
  console.log(`9t publish-site — build site/ and sync it to the nginx web root

  sudo node scripts/publish-site.mjs [--target DIR] [--no-reload] [--no-build]

Defaults: target /var/www/9t-tech, then \`nginx -t\` and a reload.
Writes need root (web root + reload); run with sudo or as root.`);
  process.exit(0);
}
const flag = (name, fallback) => {
  const i = args.indexOf(`--${name}`);
  return i >= 0 ? args[i + 1] : fallback;
};
const target = resolve(flag("target", "/var/www/9t-tech"));
const siteDir = join(root, "site");
const npm = process.platform === "win32" ? "npm.cmd" : "npm";
const runHere = (a, cwd) => {
  const r = spawnSync(npm, a, { cwd, stdio: "inherit" });
  if (r.status !== 0) throw new Error(`npm ${a.join(" ")} failed (${r.status}).`);
};
if (!args.includes("--no-build")) {
  if (!existsSync(join(siteDir, "node_modules"))) {
    console.log("Installing site dependencies…");
    runHere(["ci"], siteDir);
  }
  console.log("Building site…");
  runHere(["run", "build"], siteDir);
  // A sudo build leaves root-owned cache/output behind, which poisons later
  // unprivileged builds (stale chunks, dropped metadata). Hand it back.
  if (process.env.SUDO_USER) {
    const r = spawnSync("chown", ["-R", `${process.env.SUDO_USER}:${process.env.SUDO_USER || ""}`, join(siteDir, ".next"), join(siteDir, "out")], { stdio: "inherit" });
    if (r.status !== 0) throw new Error("chown of site build output failed.");
  }
}
const source = ["out", "dist"].map((d) => join(siteDir, d)).find((d) => existsSync(d));
if (!source) throw new Error("No site build found. Run `npm --prefix site run build` first.");
try {
  const entries = await stat(source).then((s) => (s.isDirectory() ? true : false));
  if (!entries) throw new Error("not a directory");
} catch {
  console.error(`9t: site/ not found at ${source}. Nothing was changed.`);
  process.exitCode = 1;
  process.exit(process.exitCode);
}
const run = (exe, a) => {
  const withPriv =
    process.getuid?.() === 0 ? [exe, a] : ["sudo", [exe, ...a]];
  const r = spawnSync(withPriv[0], withPriv[1], { stdio: "inherit" });
  if (r.status !== 0) throw new Error(`${withPriv.join(" ")} failed (${r.status}).`);
};
await mkdir(target, { recursive: true });
await cp(source, target, { recursive: true });
console.log(`Published ${source} → ${target}`);
if (!args.includes("--no-reload")) {
  run("nginx", ["-t"]);
  try {
    run("systemctl", ["reload", "nginx"]);
  } catch {
    run("service", ["nginx", "reload"]);
  }
  console.log("nginx reloaded.");
}
try {
  const index = join(target, "index.html");
  await stat(index);
  console.log("Verified index.html in place.");
} catch {
  throw new Error(`Publish incomplete: ${join(target, "index.html")} missing.`);
}

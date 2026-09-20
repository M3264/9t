#!/usr/bin/env node
// 9t update — backup, pull, rebuild and restart an installed checkout.
// Safe to re-run. Never touches data/ or .env.production.
import { existsSync } from "node:fs";
import { join } from "node:path";
import { execFileSync, spawnSync } from "node:child_process";
import { preflight, serviceName } from "./setup.mjs";

const help = `9t update — refresh an installed checkout

  ./9t update                      Backup, pull, rebuild, migrate, restart

Steps: pre-flight checks, git pull --ff-only (refused when dirty or
diverged), data backup, dependency install, production build into a staging
directory, database migration (only with NINE_T_DATABASE_URL), then restart
of the managed systemd service or instructions for foreground installs.
`;

function run(exe, args, opts = {}) {
  const r = spawnSync(exe, args, { stdio: "inherit", ...opts });
  if (r.status !== 0)
    throw new Error(`${exe} ${args.join(" ")} failed (${r.status}).`);
}

function sh(exe, args, opts = {}) {
  try {
    return execFileSync(exe, args, { encoding: "utf8", ...opts }).trim();
  } catch {
    return null;
  }
}

export async function update(root, args = []) {
  if (args.includes("--help") || args.includes("-h")) {
    console.log(help);
    return 0;
  }
  if (args.length) throw new Error("Use ./9t update with no arguments.");
  const npm = process.platform === "win32" ? "npm.cmd" : "npm";
  console.log("Pre-flight checks…");
  for (const c of await preflight(root, {})) {
    console.log(`${!c.ok ? "FAIL" : c.warn ? "warn" : "ok"}  ${c.message}`);
    if (!c.ok) throw new Error("Pre-flight failed; nothing was changed.");
  }
  const isGit = existsSync(join(root, ".git"));
  if (isGit) {
    const dirty = sh("git", ["-C", root, "status", "--porcelain"]) || "";
    if (dirty.trim())
      throw new Error(
        "Working tree has local changes. Commit or stash them first; nothing was changed.",
      );
    console.log("Pulling latest…");
    run("git", ["-C", root, "pull", "--ff-only"]);
  } else {
    console.log("No git checkout; skipping pull.");
  }
  console.log("Backing up data…");
  run(process.execPath, [join(root, "scripts/backup.mjs")], {
    cwd: root,
    env: { ...process.env },
  });
  console.log("Installing dependencies…");
  run(
    npm,
    [existsSync(join(root, "package-lock.json")) ? "ci" : "install", "--include=dev"],
    { cwd: root, env: { ...process.env, NODE_ENV: "production" } },
  );
  console.log("Building…");
  run(
    process.execPath,
    [join(root, "node_modules/next/dist/bin/next"), "build", "--webpack"],
    {
      cwd: root,
      env: {
        ...process.env,
        NODE_ENV: "production",
        NINE_T_BUILD_DIR: ".next-update",
        NODE_OPTIONS: "--max-old-space-size=384",
      },
    },
  );
  if (process.env.NINE_T_DATABASE_URL) {
    console.log("Migrating database…");
    run(process.execPath, [join(root, "scripts/migrate.mjs")], {
      cwd: root,
      env: { ...process.env },
    });
  }
  // The wizard names units 9t-<checkout-hash>; older installs may use 9t.service.
  // Only touch a unit whose working directory is this checkout.
  let unit = null;
  for (const name of [serviceName(root), "9t.service"]) {
    const wd =
      sh("systemctl", ["show", name, "-p", "WorkingDirectory"]) ||
      sh("sudo", ["-n", "systemctl", "show", name, "-p", "WorkingDirectory"]);
    const dir = wd ? wd.replace(/^WorkingDirectory=/, "").trim() : "";
    const isActive =
      sh("systemctl", ["is-active", name]) === "active" ||
      sh("sudo", ["-n", "systemctl", "is-active", name]) === "active";
    if (isActive && (name !== "9t.service" || dir === root)) {
      unit = name;
      break;
    }
  }
  if (unit) {
    console.log(`Restarting ${unit} on the new build…`);
    const privileged = (a) =>
      process.getuid?.() === 0
        ? run(a[0], a.slice(1))
        : run("sudo", a);
    const dropinDir = `/etc/systemd/system/${unit}.d`;
    const dropin = `${dropinDir}/9t-build.conf`;
    const previous = sh("cat", [dropin]) || sh("sudo", ["-n", "cat", dropin]);
    if (previous && !previous.includes(".next-update")) {
      await (
        await import("node:fs/promises")
      ).writeFile("/tmp/9t-dropin-before-update.conf", previous);
      console.log("Previous build drop-in saved to /tmp/9t-dropin-before-update.conf");
    }
    const { writeFileSync, mkdirSync } = await import("node:fs");
    const { execFileSync: exec } = await import("node:child_process");
    const conf = "[Service]\nEnvironment=NINE_T_BUILD_DIR=.next-update\n";
    try {
      mkdirSync(dropinDir, { recursive: true });
      writeFileSync(dropin, conf);
    } catch {
      exec("sudo", ["mkdir", "-p", dropinDir], { stdio: "inherit" });
      exec("sudo", ["tee", dropin], {
        input: conf,
        stdio: ["pipe", "ignore", "inherit"],
      });
    }
    privileged(["systemctl", "daemon-reload"]);
    privileged(["systemctl", "restart", unit]);
    console.log("Updated and restarted.");
  } else {
    console.log(
      "Built into .next-update. Restart with NINE_T_BUILD_DIR=.next-update ./9t start",
    );
  }
  return 0;
}

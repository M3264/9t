#!/usr/bin/env node
import { existsSync, readFileSync, statSync, readdirSync } from "node:fs";
import { resolve, dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { parseEnv } from "node:util";
import { spawn } from "node:child_process";

export function serverEnvironment(root, inherited = process.env) {
  const file = join(root, ".env.production");
  const configured = existsSync(file)
    ? parseEnv(readFileSync(file, "utf8"))
    : {};
  return { ...configured, ...inherited, NODE_ENV: "production" };
}

// True when source files are newer than the build marker — i.e. the running
// code would not include the latest checkout (forgotten build after git pull).
// Never throws; a failed check simply stays silent.
export function buildIsStale(root, dist = ".next") {
  try {
    const marker = statSync(resolve(root, dist, "BUILD_ID")).mtimeMs;
    const watch = ["src", "scripts", "public", "package.json", "next.config.mjs"];
    const newest = (dir) => {
      let top = 0;
      for (const entry of readdirSync(dir, { withFileTypes: true })) {
        if (entry.name === "node_modules") continue;
        const full = join(dir, entry.name);
        if (entry.isDirectory()) top = Math.max(top, newest(full));
        else if (/\.(ts|tsx|js|mjs|cjs|css|json)$/.test(entry.name))
          top = Math.max(top, statSync(full).mtimeMs);
      }
      return top;
    };
    return watch.some((w) => {
      const full = resolve(root, w);
      if (!existsSync(full)) return false;
      const m = statSync(full).isDirectory() ? newest(full) : statSync(full).mtimeMs;
      return m > marker;
    });
  } catch {
    return false;
  }
}

export async function runServer(root, args = []) {
  if (args.length)
    throw new Error(
      "Use PORT and NINE_T_HOST in .env.production to configure the listener.",
    );
  const env = serverEnvironment(root);
  const port = env.PORT || "3265",
    host = env.NINE_T_HOST || "0.0.0.0";
  if (!/^\d+$/.test(port) || Number(port) < 1024 || Number(port) > 65535)
    throw new Error("PORT must be between 1024 and 65535.");
  const dist = env.NINE_T_BUILD_DIR || ".next";
  if (!existsSync(resolve(root, dist, "BUILD_ID")))
    throw new Error(
      "No production build found. Run npm run build first, or complete ./9t setup.",
    );
  if (buildIsStale(root, dist))
    console.error(
      "9t: sources are newer than the production build. Run ./9t update or npm run build, then restart.",
    );
  const child = spawn(
    process.execPath,
    [join(root, "scripts/serve.mjs")],
    { cwd: root, env: { ...env, PORT: port, NINE_T_HOST: host }, stdio: "inherit" },
  );
  const stop = () => child.kill("SIGTERM");
  process.once("SIGINT", stop);
  process.once("SIGTERM", stop);
  try {
    return await new Promise((accept, reject) => {
      child.once("error", reject);
      child.once("exit", (code) => accept(code ?? 0));
    });
  } finally {
    process.off("SIGINT", stop);
    process.off("SIGTERM", stop);
  }
}
if (
  process.argv[1] &&
  resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  try {
    process.exitCode = await runServer(
      dirname(dirname(fileURLToPath(import.meta.url))),
      process.argv.slice(2),
    );
  } catch (error) {
    console.error(`9t: ${error.message}`);
    process.exitCode = 1;
  }
}

#!/usr/bin/env node
import { existsSync, readFileSync } from "node:fs";
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
  const child = spawn(
    process.execPath,
    [
      join(root, "node_modules/next/dist/bin/next"),
      "start",
      "-H",
      host,
      "-p",
      port,
    ],
    { cwd: root, env, stdio: "inherit" },
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

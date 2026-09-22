// Explicit integration check: installs dependencies in a temporary checkout,
// builds it, runs its server on an ephemeral loopback port, then cleans it up.
// Run separately from unit tests: node tests/setup-install.mjs
import assert from "node:assert/strict";
import {
  mkdtemp,
  mkdir,
  copyFile,
  chmod,
  stat,
  writeFile,
  readFile,
  rm,
} from "node:fs/promises";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { tmpdir } from "node:os";
import { execFileSync, spawn } from "node:child_process";
import { createServer } from "node:net";

const source = dirname(dirname(fileURLToPath(import.meta.url)));
const root = await mkdtemp(join(tmpdir(), "9t-install-smoke-"));
let server;
function run(file, args, options = {}) {
  return new Promise((done, fail) => {
    const child = spawn(file, args, {
      cwd: root,
      stdio: "inherit",
      ...options,
    });
    child.once("error", fail);
    child.once("exit", (code) =>
      code === 0 ? done() : fail(new Error(`${file} exited ${code}`)),
    );
  });
}
const env = { ...process.env };
for (const key of [
  "PORT",
  "NINE_T_HOST",
  "NINE_T_DATA_DIR",
  "NINE_T_BUILD_DIR",
  "NINE_T_ADMIN_PASSWORD",
])
  delete env[key];
try {
  const paths = execFileSync(
    "git",
    ["ls-files", "--cached", "--others", "--exclude-standard", "-z"],
    { cwd: source, encoding: "utf8" },
  )
    .split("\0")
    .filter(Boolean);
  for (const file of new Set(paths)) {
    const dest = join(root, file);
    await mkdir(dirname(dest), { recursive: true });
    await copyFile(join(source, file), dest);
    await chmod(dest, (await stat(join(source, file))).mode & 0o777);
  }
  const port = await new Promise((done, fail) => {
    const socket = createServer();
    socket.once("error", fail);
    socket.listen(0, "127.0.0.1", () => {
      const port = socket.address().port;
      socket.close(() => done(port));
    });
  });
  const preferences = {
    exposure: "local",
    port,
    username: "installer-test",
    modules: ["snippets", "files"],
    theme: "dark",
    maxSizeMb: 23,
    trashRetentionDays: 2,
    startup: "later",
    installCli: false,
  };
  await writeFile(join(root, "preferences.json"), JSON.stringify(preferences));
  await run(
    process.execPath,
    ["scripts/cli/9t.mjs", "setup", "--answers", "preferences.json", "--yes"],
    { env: { ...env, NINE_T_ADMIN_PASSWORD: "setup-smoke-only-password" } },
  );
  assert.ok(
    !(await readFile(join(root, ".env.production"), "utf8")).includes(
      "setup-smoke-only-password",
    ),
  );
  server = spawn(process.execPath, ["scripts/cli/9t.mjs", "start"], {
    cwd: root,
    env,
    stdio: "inherit",
  });
  let healthy = false;
  for (let i = 0; i < 60; i++) {
    if (server.exitCode !== null)
      throw new Error("Installed server exited before becoming ready");
    try {
      const r = await fetch(`http://127.0.0.1:${port}/api/status`, {
        signal: AbortSignal.timeout(1000),
      });
      if (r.ok && (await r.json()).initialized) {
        healthy = true;
        break;
      }
    } catch {}
    await new Promise((done) => setTimeout(done, 500));
  }
  assert.ok(healthy, "installed server became ready");
  const login = await fetch(`http://127.0.0.1:${port}/api/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      username: "installer-test",
      password: "setup-smoke-only-password",
    }),
  });
  assert.equal(login.status, 200, "wizard-created password works in web API");
  const objects = await fetch(`http://127.0.0.1:${port}/api/objects`, {
    headers: { Cookie: login.headers.get("set-cookie").split(";")[0] },
  });
  assert.equal(objects.status, 200);
  const data = await objects.json();
  assert.deepEqual(data.objects, []);
  assert.equal(data.config.theme, "dark");
  assert.equal(data.config.maxSizeMb, 23);
  assert.equal(data.config.trashRetentionDays, 2);
  assert.equal(data.config.modules.links, false);
  console.log(
    "PASS: clean checkout → dependency installation → production build → initialized administrator → configured listener → successful sign-in and saved preferences.",
  );
} finally {
  if (server && server.exitCode === null) {
    server.kill("SIGTERM");
    await new Promise((done) => {
      server.once("exit", done);
      setTimeout(done, 5000).unref();
    });
  }
  await rm(root, { recursive: true, force: true });
}

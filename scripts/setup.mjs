#!/usr/bin/env node
import { existsSync, constants } from "node:fs";
import {
  mkdir,
  readFile,
  writeFile,
  open,
  unlink,
  access,
  symlink,
  statfs,
} from "node:fs/promises";
import { dirname, resolve, join, relative, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { randomBytes, scryptSync, createHash } from "node:crypto";
import { networkInterfaces, userInfo, homedir, totalmem } from "node:os";
import { createInterface } from "node:readline/promises";
import { Writable } from "node:stream";
import { spawn } from "node:child_process";
import { createServer } from "node:net";
import { runServer } from "./run-server.mjs";

export const projectRoot = dirname(dirname(fileURLToPath(import.meta.url)));
const help = `9t setup — install and configure a fresh checkout

  ./setup.sh                       Install Node if needed, then open the wizard
  ./9t setup                       Open the wizard with Node already installed
  npm run setup                    Same wizard
  ./9t setup --dry-run             Preview choices; no installation writes
  ./9t setup --answers FILE --yes  Unattended setup (JSON preferences)
  ./9t setup --check               Pre-flight only: disk, RAM, data dir, port

Unattended passwords come from NINE_T_ADMIN_PASSWORD, never command arguments.
Preferences: exposure (local|lan|public), publicUrl, port, dataDir, username,
modules (array: snippets,files,links,board), theme (system|light|dark),
maxSizeMb (1–2048), trashRetentionDays (0–365), startup (foreground|service|later),
installCli (boolean). Public mode requires an existing HTTPS reverse proxy.

Existing .env.production or data/9t.json files are never overwritten.
Use ./9t start to start a completed installation. Change preferences in Settings.
`;

export function validatePreferences(input, root = projectRoot) {
  if (!input || typeof input !== "object" || Array.isArray(input))
    throw new Error("Preferences must be a JSON object.");
  const allowed = [
    "exposure",
    "publicUrl",
    "port",
    "dataDir",
    "username",
    "modules",
    "theme",
    "maxSizeMb",
    "trashRetentionDays",
    "startup",
    "installCli",
  ];
  for (const key of Object.keys(input))
    if (!allowed.includes(key))
      throw new Error(
        `Unknown preference: ${key}. Run ./9t setup --help for supported options.`,
      );
  const p = {
    exposure: "lan",
    publicUrl: "",
    port: 3265,
    dataDir: join(root, "data"),
    username: "owner",
    modules: ["snippets", "files", "links"],
    theme: "system",
    maxSizeMb: 500,
    trashRetentionDays: 7,
    startup: "foreground",
    installCli: false,
    ...input,
  };
  for (const [key, options] of Object.entries({
    exposure: ["local", "lan", "public"],
    theme: ["system", "light", "dark"],
    startup: ["foreground", "service", "later"],
  })) {
    if (!options.includes(p[key]))
      throw new Error(`Invalid ${key}: choose ${options.join(", ")}.`);
  }
  for (const [key, min, max] of [
    ["port", 1024, 65535],
    ["maxSizeMb", 1, 2048],
    ["trashRetentionDays", 0, 365],
  ]) {
    if (!Number.isInteger(p[key]) || p[key] < min || p[key] > max)
      throw new Error(`${key} must be an integer between ${min} and ${max}.`);
  }
  if (
    typeof p.username !== "string" ||
    !/^[a-zA-Z0-9._-]{2,64}$/.test(p.username)
  )
    throw new Error(
      "Username needs 2–64 letters, digits, dots, underscores or dashes.",
    );
  if (
    !Array.isArray(p.modules) ||
    !p.modules.length ||
    p.modules.some(
      (m) => !["snippets", "files", "links", "board"].includes(m),
    ) ||
    !p.modules.some((m) => m !== "board")
  )
    throw new Error("Enable at least one of snippets, files or links.");
  if (
    typeof p.dataDir !== "string" ||
    !p.dataDir.trim() ||
    /[\r\n\0"\\]/.test(p.dataDir)
  )
    throw new Error(
      "Choose a storage path without quotes, backslashes or line breaks.",
    );
  if (/[\r\n\0"\\]/.test(root))
    throw new Error(
      "The checkout path cannot contain quotes, backslashes or line breaks.",
    );
  p.dataDir = resolve(root, p.dataDir);
  if (
    p.startup === "service" &&
    [root, p.dataDir].some((path) =>
      ["/tmp", "/var/tmp"].some(
        (base) => path === base || path.startsWith(base + "/"),
      ),
    )
  ) {
    throw new Error(
      "For a systemd service, keep the checkout and data outside /tmp and /var/tmp. Use foreground or later for a temporary checkout.",
    );
  }
  if (p.dataDir === dirname(p.dataDir) || p.dataDir === root)
    throw new Error(
      "Choose a dedicated data folder, not the filesystem or checkout root.",
    );
  const fromRoot = relative(root, p.dataDir);
  if (
    !fromRoot.startsWith(`..${sep}`) &&
    fromRoot !== ".." &&
    p.dataDir !== join(root, "data")
  )
    throw new Error(
      "Inside the checkout, use its ignored data folder. Custom storage must be outside the checkout.",
    );
  if (typeof p.installCli !== "boolean")
    throw new Error("installCli must be true or false.");
  if (p.exposure === "public") {
    let url;
    try {
      url = new URL(p.publicUrl);
    } catch {
      throw new Error("Public mode needs a full HTTPS URL.");
    }
    if (
      url.protocol !== "https:" ||
      url.username ||
      url.password ||
      url.search ||
      url.hash ||
      url.pathname !== "/"
    )
      throw new Error(
        "Use an HTTPS origin without credentials, a path, query or fragment.",
      );
    p.publicUrl = url.origin;
  } else p.publicUrl = "";
  p.host = p.exposure === "lan" ? "0.0.0.0" : "127.0.0.1";
  return p;
}

export function validatePassword(password) {
  if (
    typeof password !== "string" ||
    password.length < 8 ||
    password.length > 128
  )
    throw new Error("Use a password of 8–128 characters.");
  return password;
}

export async function assertFresh(root, dataDir) {
  for (const path of [
    join(root, ".env.production"),
    join(root, ".9t-install.json"),
    join(root, "data/9t.json"),
    join(dataDir, "9t.json"),
  ]) {
    try {
      await access(path);
    } catch (error) {
      if (error.code === "ENOENT") continue;
      throw error;
    }
    throw new Error(
      `An installation already exists at ${path}. Nothing was changed. Use ./9t start or the web Settings; use a separate checkout for another instance.`,
    );
  }
}

export function makeEnvironment(p) {
  return `# Generated by 9t setup. Keep this file private.\nNODE_ENV=production\nPORT=${p.port}\nNINE_T_HOST=${p.host}\nNINE_T_DATA_DIR="${p.dataDir}"\nNINE_T_HTTPS=${p.exposure === "public"}\nNINE_T_SETUP_TOKEN=${randomBytes(32).toString("hex")}\n`;
}

export async function writeInstallation(root, p, password) {
  await assertFresh(root, p.dataDir);
  validatePassword(password);
  const salt = randomBytes(16).toString("hex");
  const data = {
    config: {
      initialized: true,
      modules: Object.fromEntries(
        ["snippets", "files", "links", "board"].map((m) => [
          m,
          p.modules.includes(m),
        ]),
      ),
      exposure: p.exposure === "public" ? "public" : "lan",
      domain: p.exposure === "public" ? new URL(p.publicUrl).host : null,
      theme: p.theme,
      maxSizeMb: p.maxSizeMb,
      trashRetentionDays: p.trashRetentionDays,
    },
    user: {
      username: p.username,
      salt,
      passwordHash: scryptSync(password, salt, 64).toString("hex"),
    },
    sessions: {},
    apiTokens: {},
    objects: [],
    shares: {},
  };
  await mkdir(join(p.dataDir, "objects"), { recursive: true, mode: 0o700 });
  const envPath = join(root, ".env.production");
  await writeFile(envPath, makeEnvironment(p), { flag: "wx", mode: 0o600 });
  try {
    await writeFile(join(p.dataDir, "9t.json"), JSON.stringify(data, null, 2), {
      flag: "wx",
      mode: 0o600,
    });
  } catch (error) {
    await unlink(envPath);
    throw error;
  }
  // Recovery is possible via ./9t start even if writing the summary fails.
  await writeFile(
    join(root, ".9t-install.json"),
    JSON.stringify({ ...p, installedAt: new Date().toISOString() }, null, 2),
    { flag: "wx", mode: 0o600 },
  );
}

export function serviceName(root) {
  return `9t-${createHash("sha256").update(root).digest("hex").slice(0, 8)}.service`;
}
function unitQuote(value) {
  return (
    '"' +
    value
      .replaceAll("%", "%%")
      .replaceAll("\\", "\\\\")
      .replaceAll('"', '\\"') +
    '"'
  );
}
export function serviceUnit(
  root,
  executable = process.execPath,
  username = userInfo().username,
) {
  if (!/^[a-zA-Z0-9_.-]+\$?$/.test(username))
    throw new Error("Unsupported service account name.");
  return `[Unit]\nDescription=9t personal workspace\nAfter=network.target\n\n[Service]\nType=simple\nUser=${username}\nWorkingDirectory=${unitQuote(root)}\nEnvironment=NODE_ENV=production\nExecStart=${unitQuote(executable)} ${unitQuote(join(root, "scripts/run-server.mjs"))}\nRestart=on-failure\nRestartSec=3\nNoNewPrivileges=true\nPrivateTmp=true\nUMask=0077\n\n[Install]\nWantedBy=multi-user.target\n`;
}

async function command(executable, args, options = {}) {
  await new Promise((accept, reject) => {
    const child = spawn(executable, args, { stdio: "inherit", ...options });
    child.once("error", reject);
    child.once("exit", (code, signal) =>
      code === 0
        ? accept()
        : reject(
            new Error(
              `${executable} failed (${signal || code}). Resolve the error above, then retry.`,
            ),
          ),
    );
  });
}

async function availablePort(p) {
  await new Promise((accept, reject) => {
    const server = createServer();
    server.once("error", (error) =>
      reject(new Error(`Port ${p.port} is unavailable: ${error.message}`)),
    );
    server.listen({ port: p.port, host: p.host, exclusive: true }, () =>
      server.close(accept),
    );
  });
}

// Pre-flight checks for setup/update. Never throws; returns one entry per
// check so callers can print them and decide. Pure checks only — no writes.
export async function preflight(root = projectRoot, opts = {}) {
  const checks = [];
  const push = (ok, message, warn = false) => checks.push({ ok, message, warn });
  const nodeMajor = Number(process.versions.node.split(".")[0]);
  push(nodeMajor >= 22, `Node.js ${process.versions.node} (>= 22 required)`);
  try {
    const disk = await statfs(root);
    const freeMb = Math.floor((disk.bavail * disk.bsize) / 1048576);
    if (freeMb < 512)
      push(false, `${freeMb} MB free on this volume (>= 512 MB needed)`);
    else push(true, `${freeMb} MB free on this volume`, freeMb < 1024);
  } catch {
    push(false, "Could not read free disk space");
  }
  const ramMb = Math.floor(totalmem() / 1048576);
  if (ramMb < 512) push(false, `${ramMb} MB RAM (at least 512 MB needed to build)`);
  else push(true, `${ramMb} MB RAM`, ramMb < 1024);
  const dataDir = resolve(root, opts.dataDir || "data");
  try {
    await access(dataDir, constants.W_OK);
    push(true, `Data folder writable: ${dataDir}`);
  } catch {
    try {
      await access(dirname(dataDir), constants.W_OK);
      push(true, `Data folder can be created under ${dirname(dataDir)}`);
    } catch {
      push(false, `Cannot write ${dataDir}`);
    }
  }
  if (opts.port) {
    try {
      await availablePort({ port: opts.port, host: opts.host || "0.0.0.0" });
      push(true, `Port ${opts.port} is free`);
    } catch (error) {
      push(false, error.message);
    }
  }
  return checks;
}

function prompts() {
  let muted = false;
  const output = new Writable({
    write(chunk, encoding, done) {
      if (!muted) process.stdout.write(chunk, encoding);
      done();
    },
  });
  output.isTTY = process.stdout.isTTY;
  const rl = createInterface({
    input: process.stdin,
    output,
    terminal: true,
    historySize: 0,
  });
  rl.on("SIGINT", () => {
    rl.close();
    process.exitCode = 130;
  });
  async function ask(label, fallback = "") {
    const v = (
      await rl.question(`${label}${fallback !== "" ? ` [${fallback}]` : ""}: `)
    ).trim();
    return v || fallback;
  }
  async function choose(label, values, fallback) {
    while (true) {
      const v = await ask(`${label} (${values.join("/")})`, fallback);
      if (values.includes(v)) return v;
      console.log(`Choose ${values.join(", ")}.`);
    }
  }
  async function number(label, min, max, fallback) {
    while (true) {
      const s = await ask(label, String(fallback)),
        n = Number(s);
      if (/^\d+$/.test(s) && Number.isInteger(n) && n >= min && n <= max)
        return n;
      console.log(`Enter a whole number between ${min} and ${max}.`);
    }
  }
  async function secret(label) {
    process.stdout.write(`${label}: `);
    muted = true;
    try {
      return await rl.question("");
    } finally {
      muted = false;
      process.stdout.write("\n");
    }
  }
  return { ask, choose, number, secret, close: () => rl.close() };
}

export async function setup(args = [], root = projectRoot) {
  if (args.includes("--help") || args.includes("-h")) {
    console.log(help);
    return;
  }
  const known = new Set(["--dry-run", "--answers", "--yes", "--check"]);
  for (let i = 0; i < args.length; i++) {
    if (!known.has(args[i]))
      throw new Error(`Unknown setup option: ${args[i]}`);
    if (args[i] === "--answers" && !args[++i])
      throw new Error("--answers needs a JSON file.");
  }
  if (args.includes("--check")) {
    const checks = await preflight(root, { port: 3265 });
    let failed = false;
    for (const c of checks) {
      if (!c.ok) failed = true;
      console.log(`${!c.ok ? "FAIL" : c.warn ? "warn" : "ok"}  ${c.message}`);
    }
    if (failed) throw new Error("Pre-flight checks failed.");
    return;
  }
  if (Number(process.versions.node.split(".")[0]) < 22)
    throw new Error("Use Node.js 22 or newer, or run ./setup.sh.");
  for (const key of [
    "PORT",
    "NINE_T_HOST",
    "NINE_T_DATA_DIR",
    "NINE_T_BUILD_DIR",
  ])
    if (process.env[key])
      throw new Error(
        `Unset ${key} before setup; choose installation settings in the wizard or answers file.`,
      );
  await assertFresh(root, join(root, "data"));
  let p, password, ui;
  try {
    if (args.includes("--answers")) {
      if (!args.includes("--yes"))
        throw new Error(
          "Unattended installation requires --answers FILE --yes.",
        );
      const raw = JSON.parse(
        await readFile(resolve(args[args.indexOf("--answers") + 1]), "utf8"),
      );
      if ("password" in raw)
        throw new Error(
          "Put the password in NINE_T_ADMIN_PASSWORD, not the answers file.",
        );
      p = validatePreferences(raw, root);
      password = args.includes("--dry-run")
        ? ""
        : validatePassword(process.env.NINE_T_ADMIN_PASSWORD);
      delete process.env.NINE_T_ADMIN_PASSWORD;
    } else {
      if (!process.stdin.isTTY)
        throw new Error(
          "Run setup in a terminal, or use --answers FILE --yes.",
        );
      ui = prompts();
      console.log(
        "\n9t — your workspace, your server.\n\nLet’s get you from clone to a working workspace.",
      );
      const exposure = await ui.choose(
        "Access: local = this computer, lan = Wi-Fi/network, public = existing HTTPS proxy",
        ["local", "lan", "public"],
        "lan",
      );
      let publicUrl = "";
      if (exposure === "public") {
        console.log(
          "Public mode binds locally. Your HTTPS reverse proxy must run on this host and forward to the port below. Setup will generate an example Caddyfile. DNS, certificates and router settings are not changed.",
        );
        while (true) {
          publicUrl = await ui.ask("Public HTTPS URL");
          try {
            validatePreferences({ exposure, publicUrl }, root);
            break;
          } catch (e) {
            console.log(e.message);
          }
        }
      }
      const port = await ui.number("Listen on port", 1024, 65535, 3265);
      let modules = [];
      do {
        modules = [];
        for (const [name, label] of [
          ["snippets", "Text and code snippets"],
          ["files", "File transfers"],
          ["links", "Saved links"],
          ["board", "Board"],
        ])
          if (
            (await ui.choose(
              label,
              ["y", "n"],
              name === "board" ? "n" : "y",
            )) === "y"
          )
            modules.push(name);
        if (!modules.some((m) => m !== "board"))
          console.log("Enable at least one of snippets, files or links.");
      } while (!modules.some((m) => m !== "board"));
      const theme = await ui.choose(
        "Appearance",
        ["system", "light", "dark"],
        "system",
      );
      const maxSizeMb = await ui.number(
        "Maximum upload size in MB",
        1,
        2048,
        500,
      );
      const trashRetentionDays = await ui.number(
        "Keep trashed items for how many days?",
        0,
        365,
        7,
      );
      let dataDir;
      while (true) {
        dataDir = await ui.ask("Data folder", join(root, "data"));
        try {
          validatePreferences({ dataDir }, root);
          await assertFresh(root, resolve(root, dataDir));
          break;
        } catch (e) {
          console.log(e.message);
        }
      }
      let username;
      while (true) {
        username = await ui.ask("Administrator username", "owner");
        try {
          validatePreferences({ username }, root);
          break;
        } catch (e) {
          console.log(e.message);
        }
      }
      if (!args.includes("--dry-run"))
        while (true) {
          password = await ui.secret("Administrator password (hidden)");
          try {
            validatePassword(password);
          } catch (e) {
            console.log(e.message);
            continue;
          }
          if (password === (await ui.secret("Confirm password (hidden)")))
            break;
          console.log("Passwords did not match.");
        }
      const choices =
        process.platform === "linux"
          ? ["foreground", "service", "later"]
          : ["foreground", "later"];
      console.log(
        "foreground = run in this terminal; service = start at boot using systemd and sudo; later = configure only.",
      );
      const startup = await ui.choose(
        "After installation",
        choices,
        "foreground",
      );
      const installCli =
        (await ui.choose(
          "Add a 9t command in ~/.local/bin",
          ["y", "n"],
          "y",
        )) === "y";
      p = validatePreferences(
        {
          exposure,
          publicUrl,
          port,
          modules,
          theme,
          maxSizeMb,
          trashRetentionDays,
          dataDir,
          username,
          startup,
          installCli,
        },
        root,
      );
    }
    await assertFresh(root, p.dataDir);
    console.log(
      `\nInstallation summary\n  Access: ${p.exposure}${p.publicUrl ? " · " + p.publicUrl : ""}\n  Listener: ${p.host}:${p.port}\n  Modules: ${p.modules.join(", ")}\n  Theme: ${p.theme}\n  Upload limit: ${p.maxSizeMb} MB\n  Trash: ${p.trashRetentionDays} days\n  Data: ${p.dataDir}\n  Administrator: ${p.username}\n  Startup: ${p.startup}\n`,
    );
    if (args.includes("--dry-run")) {
      console.log("Preview complete. No installation files were written.");
      return;
    }
    if (
      ui &&
      (await ui.choose("Install with these settings?", ["y", "n"], "y")) !== "y"
    ) {
      console.log("Cancelled. No installation files were written.");
      return;
    }
  } finally {
    ui?.close();
  }
  await availablePort(p);
  const pre = await preflight(root, { port: p.port, host: p.host, dataDir: p.dataDir });
  const blocked = pre.filter((c) => !c.ok);
  if (blocked.length)
    throw new Error(
      `Pre-flight failed:\n${blocked.map((c) => `  - ${c.message}`).join("\n")}`,
    );
  for (const c of pre.filter((c) => c.ok && c.warn)) console.log(`warn  ${c.message}`);
  if (p.startup === "service") {
    if (process.platform !== "linux" || !existsSync("/run/systemd/system"))
      throw new Error(
        "Automatic service installation needs Linux with systemd. Choose foreground or later.",
      );
    if (existsSync(`/etc/systemd/system/${serviceName(root)}`))
      throw new Error(
        "A service for this checkout already exists. It will not be replaced.",
      );
    if (process.getuid() !== 0) await command("sudo", ["-v"]);
  }
  const lockPath = join(root, ".9t-setup.lock");
  const lock = await open(lockPath, "wx", 0o600).catch((error) => {
    if (error.code === "EEXIST")
      throw new Error(
        "Another setup is running, or .9t-setup.lock remains after an interrupted installation. Check before removing it.",
      );
    throw error;
  });
  try {
    await assertFresh(root, p.dataDir);
    // Keep dependencies/build tools available even if the invoking shell sets NODE_ENV=production.
    const env = {
      ...process.env,
      NODE_ENV: "production",
      NINE_T_BUILD_DIR: ".next",
    };
    delete env.NINE_T_ADMIN_PASSWORD;
    console.log("Installing dependencies…");
    await command(
      process.platform === "win32" ? "npm.cmd" : "npm",
      [
        existsSync(join(root, "package-lock.json")) ? "ci" : "install",
        "--include=dev",
      ],
      { cwd: root, env },
    );
    console.log("Building 9t…");
    await command(
      process.execPath,
      [join(root, "node_modules/next/dist/bin/next"), "build"],
      { cwd: root, env },
    );
    await writeInstallation(root, p, password);
    password = undefined;
    console.log("Administrator and preferences saved.");
    if (p.exposure === "public") {
      await mkdir(join(root, ".9t"), { recursive: true, mode: 0o700 });
      const domain = new URL(p.publicUrl).host;
      await writeFile(
        join(root, ".9t/Caddyfile"),
        `${domain} {\n  reverse_proxy 127.0.0.1:${p.port}\n}\n`,
        { flag: "wx", mode: 0o600 },
      );
      console.log(
        "Proxy example: .9t/Caddyfile. Configure DNS and your HTTPS proxy before signing in.",
      );
    }
    if (p.installCli) {
      const bin = join(homedir(), ".local/bin");
      await mkdir(bin, { recursive: true });
      try {
        await symlink(join(root, "9t"), join(bin, "9t"));
        console.log(
          `CLI installed at ${bin}/9t. If needed, add ${bin} to your shell PATH.`,
        );
      } catch (e) {
        if (e.code !== "EEXIST") throw e;
        console.log(
          "An existing ~/.local/bin/9t was left in place. Use ./9t in this checkout.",
        );
      }
    }
    if (p.startup === "service") {
      await mkdir(join(root, ".9t"), { recursive: true, mode: 0o700 });
      const name = serviceName(root),
        file = join(root, ".9t", name);
      await writeFile(file, serviceUnit(root), { flag: "wx", mode: 0o600 });
      const privileged = async (exe, args) =>
        process.getuid() === 0
          ? command(exe, args)
          : command("sudo", [exe, ...args]);
      await privileged("install", [
        "-m",
        "644",
        file,
        `/etc/systemd/system/${name}`,
      ]);
      await privileged("systemctl", ["daemon-reload"]);
      await privileged("systemctl", ["enable", "--now", name]);
      await privileged("systemctl", ["is-active", name]);
      let healthy = false;
      for (let attempt = 0; attempt < 30; attempt++) {
        try {
          const response = await fetch(
            `http://127.0.0.1:${p.port}/api/status`,
            { signal: AbortSignal.timeout(1000) },
          );
          if (response.ok && (await response.json()).initialized === true) {
            healthy = true;
            break;
          }
        } catch {}
        await new Promise((done) => setTimeout(done, 500));
      }
      if (!healthy)
        throw new Error(
          `Service did not become ready. Inspect sudo journalctl -u ${name}; your configuration is saved.`,
        );
      console.log(
        `Service enabled: ${name}\nView logs: sudo journalctl -u ${name} -f`,
      );
    }
    console.log(`\nReady. Sign in as ${p.username}.`);
    if (p.publicUrl) console.log(p.publicUrl);
    else {
      console.log(`http://localhost:${p.port}`);
      if (p.exposure === "lan")
        for (const list of Object.values(networkInterfaces()))
          for (const address of list || [])
            if (address.family === "IPv4" && !address.internal)
              console.log(`LAN: http://${address.address}:${p.port}`);
    }
    console.log(
      "Pair the Android app from Settings → Android devices & pairing.",
    );
    if (p.startup === "later")
      console.log("Start anytime with ./9t start (or npm start).");
  } catch (error) {
    if (existsSync(join(root, ".env.production")))
      console.error(
        "Configuration was saved. Do not reset your data: use ./9t start to resume, or inspect .9t/ for the generated service/proxy files.",
      );
    throw error;
  } finally {
    await lock.close();
    await unlink(lockPath);
  }
  if (p.startup === "foreground") process.exitCode = await runServer(root);
}

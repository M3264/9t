#!/usr/bin/env node
import { existsSync, readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { basename, join } from "node:path";
import { homedir } from "node:os";
import { createInterface } from "node:readline/promises";
import { fileURLToPath } from "node:url";
import { createHash } from "node:crypto";
import { execFileSync, spawnSync } from "node:child_process";

// Setup must work in a fresh clone, before dependencies or CLI login exist.
if (process.argv[2] === "setup") {
  try {
    await (await import("../setup.mjs")).setup(process.argv.slice(3));
  } catch (error) {
    console.error(`9t: ${error.message}`);
    process.exitCode = 1;
  }
  process.exit(process.exitCode || 0);
}
if (process.argv[2] === "start") {
  try {
    process.exitCode = await (
      await import("../run-server.mjs")
    ).runServer(
      fileURLToPath(new URL("../../", import.meta.url)),
      process.argv.slice(3),
    );
  } catch (error) {
    console.error(`9t: ${error.message}`);
    process.exitCode = 1;
  }
  process.exit(process.exitCode || 0);
}
if (process.argv[2] === "update") {
  try {
    process.exitCode = await (
      await import("../update.mjs")
    ).update(
      fileURLToPath(new URL("../../", import.meta.url)),
      process.argv.slice(3),
    );
  } catch (error) {
    console.error(`9t: ${error.message}`);
    process.exitCode = 1;
  }
  process.exit(process.exitCode || 0);
}
if (process.argv[2] === "status") {
  try {
    process.exitCode = await (
      await import("../status.mjs")
    ).status(fileURLToPath(new URL("../../", import.meta.url)));
  } catch (error) {
    console.error(`9t: ${error.message}`);
    process.exitCode = 1;
  }
  process.exit(process.exitCode || 0);
}

const configDir = join(homedir(), ".config", "9t"),
  configFile = join(configDir, "config.json");
const saved = existsSync(configFile)
  ? JSON.parse(readFileSync(configFile, "utf8"))
  : {};
const args = process.argv.slice(2),
  command = args.shift();
const flag = (name, fallback) => {
  const i = args.indexOf(`--${name}`);
  return i >= 0 ? args[i + 1] : fallback;
};
const api = async (path, init = {}) => {
  const response = await fetch(`${saved.url}${path}`, {
    ...init,
    headers: {
      ...(saved.token ? { Authorization: `Bearer ${saved.token}` } : {}),
      ...init.headers,
    },
  });
  if (!response.ok) {
    let message = `HTTP ${response.status}`;
    try {
      message = (await response.json()).error || message;
    } catch {}
    throw new Error(message);
  }
  return response;
};
const json = async (path, init = {}) => (await api(path, init)).json();
// Install-level settings live in .env.production and apply at boot,
// so unlike workspace settings they need a restart. Edits the file in
// place (comments and unknown keys preserved) and offers a restart.
const configureServer = async (rl, ask) => {
  const root = fileURLToPath(new URL("../../", import.meta.url));
  const envPath = join(root, ".env.production");
  if (!existsSync(envPath))
    throw new Error("No installation here. Run `./9t setup` first.");
  const unquote = (v) =>
    v.length >= 2 && v.startsWith('"') && v.endsWith('"')
      ? v.slice(1, -1).replace(/\\"/g, '"').replace(/\\\\/g, "\\")
      : v;
  const lines = readFileSync(envPath, "utf8").split("\n");
  const get = (k) => {
    const line = lines.find((l) => l.startsWith(k + "="));
    return line === undefined ? "" : unquote(line.slice(k.length + 1));
  };
  const cur = {
    PORT: get("PORT") || "3265",
    NINE_T_HOST: get("NINE_T_HOST") || "0.0.0.0",
    NINE_T_DATA_DIR: get("NINE_T_DATA_DIR") || join(root, "data"),
    NINE_T_HTTPS: get("NINE_T_HTTPS") || "false",
  };
  const next = { ...cur };
  const port = await ask(`  port (1024-65535) [${cur.PORT}] `);
  if (port) {
    const n = Number(port);
    if (!Number.isInteger(n) || n < 1024 || n > 65535)
      throw new Error("Enter a port between 1024 and 65535.");
    next.PORT = String(n);
  }
  const host = await ask(`  listen address [${cur.NINE_T_HOST}] `);
  if (host) next.NINE_T_HOST = host;
  const dir = await ask(`  data directory [${cur.NINE_T_DATA_DIR}] `);
  if (dir) {
    if (!dir.startsWith("/")) throw new Error("Use an absolute path.");
    next.NINE_T_DATA_DIR = dir;
  }
  const https = (await ask(`  behind HTTPS proxy? (y/N) [${cur.NINE_T_HTTPS}] `)).toLowerCase();
  if (https) {
    if (!["y", "n", "yes", "no"].includes(https)) throw new Error("Answer y or n.");
    next.NINE_T_HTTPS = https.startsWith("y") ? "true" : "false";
  }
  const changed = Object.keys(next).filter((k) => next[k] !== cur[k]);
  if (!changed.length) {
    console.log("Nothing to change.");
    return;
  }
  if (
    next.NINE_T_DATA_DIR !== cur.NINE_T_DATA_DIR &&
    existsSync(join(cur.NINE_T_DATA_DIR, "9t.json"))
  )
    console.log(
      "warn  data stays where it is — move it yourself or this starts an empty workspace:\n" +
        `  mv ${join(cur.NINE_T_DATA_DIR, "9t.json")} ${next.NINE_T_DATA_DIR}/`,
    );
  const quote = (v) => (/[\s"#]/.test(v) ? `"${v.replace(/\\/g, "\\\\").replace(/"/g, '\\"')}"` : v);
  const seen = new Set();
  const out = lines.map((l) => {
    const k = Object.keys(next).find((key) => l.startsWith(key + "="));
    if (!k) return l;
    seen.add(k);
    return `${k}=${quote(next[k])}`;
  });
  for (const k of Object.keys(next)) if (!seen.has(k)) out.push(`${k}=${quote(next[k])}`);
  writeFileSync(envPath, out.join("\n"), { mode: 0o600 });
  console.log("Saved: " + changed.join(", ") + ". Restart to apply.");
  // Offer a restart when this checkout runs as a managed service.
  const sh = (exe, a) => {
    try {
      return execFileSync(exe, a, { encoding: "utf8" }).trim();
    } catch {
      return null;
    }
  };
  const hash = createHash("sha256").update(root).digest("hex").slice(0, 8);
  let unit = null;
  for (const name of [`9t-${hash}.service`, "9t.service"]) {
    const wd = sh("systemctl", ["show", name, "-p", "WorkingDirectory"]);
    const dirOf = wd ? wd.replace(/^WorkingDirectory=/, "").trim() : "";
    if (sh("systemctl", ["is-active", name]) !== "active") continue;
    if (name === "9t.service" && dirOf !== root) continue;
    unit = name;
    break;
  }
  if (!unit) {
    console.log("No managed service running here. Restart with ./9t start.");
    return;
  }
  const go = (await ask(`  restart ${unit} now? [Y/n] `)).toLowerCase();
  if (go && !go.startsWith("y")) {
    console.log(`Run later: sudo systemctl restart ${unit}`);
    return;
  }
  const r = spawnSync(
    ...(process.getuid?.() === 0
      ? ["systemctl", ["restart", unit]]
      : ["sudo", ["systemctl", "restart", unit]]),
    { stdio: "inherit" },
  );
  if (r.status !== 0) throw new Error(`Restart failed (${r.status}).`);
  console.log("Restarted.");
};
const find = async (value, trash = false) => {  const { objects } = await json(`/api/objects${trash ? "?trash=true" : ""}`);
  const hits = objects.filter(
    (o) =>
      o.id.startsWith(value) || o.name.toLowerCase() === value.toLowerCase(),
  );
  if (hits.length !== 1)
    throw new Error(
      hits.length
        ? "More than one item matches; use a longer ID."
        : "Item not found.",
    );
  return hits[0];
};
const help = () =>
  console.log(`9t — put it here, get it anywhere

  9t setup                         Install and configure this checkout
  9t setup --help                  Installation options
  9t start                         Run the configured server
  9t status                        Service, listener and app health
  9t update                        Backup, pull, rebuild and restart
  9t login --url https://9t.example.com --username you
  9t push <text|url|file> [--name name]
  9t list [--trash]
  9t get <id|name> [--output file]
  9t share <id|name> [--lifetime 1d]
  9t trash <id|name>
  9t restore <id|name>
  9t config export [--output file]
  9t config import <file|->
  9t configure [--section modules|exposure|domain|limits|interface|server]
  9t doctor [--domain host]
  9t logout`);

try {
  if (
    !command ||
    command === "help" ||
    command === "--help" ||
    command === "-h"
  ) {
    help();
  } else if (command === "login") {
    const url = String(flag("url", saved.url || "")).replace(/\/$/, ""),
      username = flag("username", "");
    if (!url || !username) throw new Error("Use --url and --username.");
    const rl = createInterface({
        input: process.stdin,
        output: process.stdout,
      }),
      password =
        process.env.NINE_T_PASSWORD || (await rl.question("Password: "));
    rl.close();
    const response = await fetch(`${url}/api/auth/token`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        username,
        password,
        name: `CLI on ${process.env.HOSTNAME || "device"}`,
      }),
    });
    if (!response.ok)
      throw new Error((await response.json()).error || "Login failed.");
    const { token } = await response.json();
    mkdirSync(configDir, { recursive: true, mode: 0o700 });
    writeFileSync(configFile, JSON.stringify({ url, token }, null, 2), {
      mode: 0o600,
    });
    console.log(`Connected to ${url}`);
  } else if (command === "logout") {
    if (saved.token) await api("/api/auth/token", { method: "DELETE" });
    writeFileSync(configFile, "{}\n", { mode: 0o600 });
    console.log("Logged out.");
  } else {
    // `configure` manages its own login needs per section (server works offline).
    if (command !== "configure" && (!saved.url || !saved.token))
      throw new Error("Run `9t login` first.");
    if (command === "list") {
      const trash = args.includes("--trash"),
        { objects } = await json(`/api/objects${trash ? "?trash=true" : ""}`);
      for (const o of objects)
        console.log(`${o.id.slice(0, 8)}  ${o.type.padEnd(7)}  ${o.name}`);
    } else if (command === "push") {
      let value = args.find((a) => !a.startsWith("--"));
      if (!value) throw new Error("Provide text, a URL, or a file path.");
      if (value === "-") value = readFileSync(0, "utf8");
      const form = new FormData(),
        name = flag("name", "");
      form.set("lifetime", flag("lifetime", "forever"));
      if (existsSync(value)) {
        const bytes = readFileSync(value);
        form.set("type", "file");
        form.set("name", name || basename(value));
        form.set("file", new Blob([bytes]), basename(value));
      } else {
        let url;
        try {
          url = new URL(value);
        } catch {}
        if (url && ["http:", "https:"].includes(url.protocol)) {
          form.set("type", "link");
          form.set("name", name || url.hostname);
          form.set("url", url.toString());
        } else {
          form.set("type", "snippet");
          form.set("name", name || value.split("\n")[0].slice(0, 52));
          form.set("content", value);
          form.set("language", flag("language", "text"));
        }
      }
      const object = await (
        await api("/api/objects", { method: "POST", body: form })
      ).json();
      console.log(`${object.id.slice(0, 8)}  ${object.name}`);
    } else if (command === "get") {
      const value = args[0];
      if (!value) throw new Error("Provide an item ID or exact name.");
      const o = await find(value);
      if (o.type === "file") {
        const data = Buffer.from(
            await (await api(`/api/files/${o.id}`)).arrayBuffer(),
          ),
          output = flag("output", o.name);
        writeFileSync(output, data);
        console.log(output);
      } else console.log(o.type === "link" ? o.url : o.content);
    } else if (command === "share") {
      const o = await find(args[0] || "");
      const { path } = await json("/api/shares", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          objectId: o.id,
          lifetime: flag("lifetime", "1d"),
          password: flag("password", undefined),
        }),
      });
      console.log(`${saved.url}${path}`);
    } else if (command === "trash") {
      const o = await find(args[0] || "");
      await api(`/api/objects/${o.id}`, { method: "DELETE" });
      console.log(`Trashed ${o.name}`);
    } else if (command === "restore") {
      const o = await find(args[0] || "", true);
      await api(`/api/objects/${o.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ restore: true }),
      });
      console.log(`Restored ${o.name}`);
    } else if (command === "config") {
      const sub = args[0];
      if (sub === "export") {
        const doc = await json("/api/config?format=export");
        const text = JSON.stringify(doc, null, 2);
        const output = flag("output", "");
        if (output) {
          writeFileSync(output, text + "\n", { mode: 0o600 });
          console.log(output);
        } else console.log(text);
      } else if (sub === "import") {
        const src = args[1];
        if (!src) throw new Error("Usage: 9t config import <file|->");
        const text = src === "-" ? readFileSync(0, "utf8") : readFileSync(src, "utf8");
        let parsed;
        try {
          parsed = JSON.parse(text);
        } catch {
          throw new Error("Invalid JSON.");
        }
        const doc = parsed?.config ?? parsed;
        await api("/api/config", {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(doc?.kind === "9t-config" ? parsed : doc),
        });
        console.log("Config imported.");
      } else throw new Error("Usage: 9t config export|import");
    } else if (command === "configure") {
      const section = flag("section", "");
      const known = ["modules", "exposure", "domain", "limits", "interface", "server"];
      if (section && !known.includes(section))
        throw new Error(`Usage: 9t configure [--section ${known.join("|")}]`);
      if (!process.stdin.isTTY)
        throw new Error("configure needs a terminal; use `9t config import` instead.");
      const { createInterface } = await import("node:readline");
      const rl = createInterface({ input: process.stdin, output: process.stdout });
      const ask = (q) => new Promise((ok) => rl.question(q, (a) => ok(a.trim())));
      const picked = new Set();
      if (section) {
        picked.add(section);
      } else {
        console.log("What to configure? (numbers, comma-separated -- needs login: *)");
        console.log("  1  modules   workspace content types *");
        console.log("  2  exposure  lan / public / hybrid *");
        console.log("  3  domain    public hostname *");
        console.log("  4  limits    upload size, trash retention *");
        console.log("  5  interface theme *");
        console.log("  6  server    port, address, data dir, HTTPS flag");
        const choice = (await ask("  pick [all] ")).toLowerCase();
        if (!choice || choice === "all") known.forEach((s) => picked.add(s));
        else {
          const nums = { 1: "modules", 2: "exposure", 3: "domain", 4: "limits", 5: "interface", 6: "server" };
          for (const part of choice.split(",")) {
            const s = nums[part.trim()];
            if (!s) throw new Error("Pick numbers like 1,4 -- or `all`.");
            picked.add(s);
          }
        }
        if (!picked.size) console.log("Nothing to change.");
      }
      const want = (s) => picked.has(s);
        if (want("server")) {
          await configureServer(rl, ask);
          picked.delete("server");
        }
        if (picked.size && (!saved.url || !saved.token))
          throw new Error(
            "These need login: " +
              [...picked].join(", ") +
              ". Run `9t login` first (server settings work without it).",
          );
        const { config: current } = picked.size ? await json("/api/status") : {};
      if (picked.size && !current) throw new Error("Server did not return its config.");
      const patch = {};
      try {
        if (want("modules")) {
          patch.modules = {};
          for (const m of ["snippets", "files", "links", "board"]) {
            const cur = current.modules?.[m] ? "Y/n" : "y/N";
            const a = (await ask(`  ${m} [${cur}] `)).toLowerCase();
            patch.modules[m] = a ? a.startsWith("y") : !!current.modules?.[m];
          }
        }
        if (want("exposure")) {
          const a = (
            await ask(`  exposure (lan/public/hybrid) [${current.exposure}] `)
          ).toLowerCase();
          if (a) {
            if (!["lan", "public", "hybrid"].includes(a)) throw new Error("Pick lan, public, or hybrid.");
            patch.exposure = a;
          }
        }
        if (want("domain")) {
          const a = await ask(`  domain (empty to clear) [${current.domain || "none"}] `);
          if (a || current.domain) patch.domain = a || null;
        }
        if (want("limits")) {
          const mb = await ask(`  max upload MB (1-2048) [${current.maxSizeMb}] `);
          if (mb) {
            const n = Number(mb);
            if (!Number.isInteger(n) || n < 1 || n > 2048) throw new Error("Enter 1-2048.");
            patch.maxSizeMb = n;
          }
          const trash = await ask(`  trash retention days (0-365) [${current.trashRetentionDays}] `);
          if (trash) {
            const n = Number(trash);
            if (!Number.isInteger(n) || n < 0 || n > 365) throw new Error("Enter 0-365.");
            patch.trashRetentionDays = n;
          }
        }
        if (want("interface")) {
          const a = (
            await ask(`  theme (system/light/dark) [${current.theme}] `)
          ).toLowerCase();
          if (a) {
            if (!["system", "light", "dark"].includes(a)) throw new Error("Pick system, light, or dark.");
            patch.theme = a;
          }
        }
      } finally {
        rl.close();
      }
      if (picked.size && !Object.keys(patch).length) {
        console.log("Nothing to change.");
      } else if (picked.size) {
        await api("/api/config", {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(patch),
        });
        console.log("Saved: " + Object.keys(patch).join(", ") + ".");
        }
    } else if (command === "doctor") {
      const status = await json("/api/status");
      const runtime = status.runtime || {};
      console.log(`Exposure: ${status.config.exposure}${status.config.domain ? ` (${status.config.domain})` : ""}`);
      console.log(`Listener: ${runtime.host || "?"}:${runtime.port || "?"}${runtime.https ? " (Secure cookies on)" : " (Secure cookies off)"}`);
      const override = flag("domain", "");
      const q = override || status.config.domain || "";
      if (!q) {
        console.log("Diagnostics: no public hostname set — use --domain or save one in Settings.");
      } else {
        const diag = await json(`/api/diagnostics?domain=${encodeURIComponent(q)}`);
        if (!diag.domain) console.log(`Diagnostics: ${diag.message}`);
        else {
          console.log(`DNS: ${diag.dns.error || `A ${diag.dns.a.join(", ") || "—"}${diag.dns.aaaa.length ? ` AAAA ${diag.dns.aaaa.join(", ")}` : ""}`}`);
          console.log(`HTTPS: ${diag.https.ok ? `reachable (${diag.https.status})` : diag.https.error}`);
        }
      }
    } else help();
  }
} catch (error) {
  console.error(`9t: ${error.message}`);
  process.exitCode = 1;
}

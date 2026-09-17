#!/usr/bin/env node
import { existsSync, readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { basename, join } from "node:path";
import { homedir } from "node:os";
import { createInterface } from "node:readline/promises";
import { fileURLToPath } from "node:url";

// Setup must work in a fresh clone, before dependencies or CLI login exist.
if (process.argv[2] === "setup") {
  try {
    await (await import("../scripts/setup.mjs")).setup(process.argv.slice(3));
  } catch (error) {
    console.error(`9t: ${error.message}`);
    process.exitCode = 1;
  }
  process.exit(process.exitCode || 0);
}
if (process.argv[2] === "start") {
  try {
    process.exitCode = await (
      await import("../scripts/run-server.mjs")
    ).runServer(
      fileURLToPath(new URL("../", import.meta.url)),
      process.argv.slice(3),
    );
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
const find = async (value, trash = false) => {
  const { objects } = await json(`/api/objects${trash ? "?trash=true" : ""}`);
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
  9t login --url https://9t.example.com --username you
  9t push <text|url|file> [--name name]
  9t list [--trash]
  9t get <id|name> [--output file]
  9t share <id|name> [--lifetime 1d]
  9t trash <id|name>
  9t restore <id|name>
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
    if (!saved.url || !saved.token) throw new Error("Run `9t login` first.");
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
    } else help();
  }
} catch (error) {
  console.error(`9t: ${error.message}`);
  process.exitCode = 1;
}

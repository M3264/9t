import { test } from "node:test";
import assert from "node:assert/strict";
import {
  mkdtemp,
  mkdir,
  readFile,
  writeFile,
  readdir,
  rm,
  stat,
  symlink,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { scryptSync } from "node:crypto";
import { execFileSync } from "node:child_process";
import { parseEnv } from "node:util";
import {
  validatePreferences,
  validatePassword,
  writeInstallation,
  assertFresh,
  serviceUnit,
  serviceName,
  servicePort,
  setup,
  preflight,
} from "../scripts/setup.mjs";
import { serverEnvironment, buildIsStale } from "../scripts/run-server.mjs";

test("network choices map to real listeners and public mode requires HTTPS", () => {
  assert.equal(validatePreferences({ exposure: "lan" }).host, "0.0.0.0");
  assert.equal(validatePreferences({ exposure: "local" }).host, "127.0.0.1");
  const pub = validatePreferences({
    exposure: "public",
    publicUrl: "https://9t.example.com/",
  });
  assert.equal(pub.host, "127.0.0.1");
  assert.equal(pub.publicUrl, "https://9t.example.com");
  for (const publicUrl of [
    "http://example.com",
    "https://user:pass@example.com",
    "https://example.com/path",
    "https://example.com/?x=1",
  ])
    assert.throws(() => validatePreferences({ exposure: "public", publicUrl }));
  for (const input of [
    { port: 80 },
    { port: 3265.5 },
    { modules: ["board"] },
    { modules: [] },
    { modules: ["unknown"] },
    { username: "../admin" },
    { maxSizeMb: 9999 },
    { dataDir: "/tmp/repo/.git" },
    { dataDir: "/tmp/repo" },
    { dataDir: "/tmp/data\nEVIL=1" },
    { password: "secret" },
    { startup: "nohup" },
  ])
    assert.throws(() => validatePreferences(input, "/tmp/repo"));
  assert.throws(() => validatePassword("short"));
  assert.throws(() => validatePassword("x".repeat(129)));
});

test("fresh setup stores compatible password hashes, actual preferences and private environment", async () => {
  const root = await mkdtemp(join(tmpdir(), "9t-install-"));
  try {
    const prefs = validatePreferences(
      {
        modules: ["files", "board"],
        theme: "dark",
        maxSizeMb: 42,
        trashRetentionDays: 3,
        port: 54321,
        username: "tester",
        startup: "later",
      },
      root,
    );
    await writeInstallation(root, prefs, "test-only-password");
    const db = JSON.parse(await readFile(join(root, "data/9t.json"), "utf8"));
    assert.equal(db.config.initialized, true);
    assert.deepEqual(db.config.modules, {
      files: true,
      board: true,
      snippets: false,
      links: false,
    });
    assert.equal(db.config.theme, "dark");
    assert.equal(db.config.maxSizeMb, 42);
    assert.equal(db.config.trashRetentionDays, 3);
    assert.equal(
      db.user.passwordHash,
      scryptSync("test-only-password", db.user.salt, 64).toString("hex"),
    );
    const env = serverEnvironment(root, {});
    assert.equal(env.PORT, "54321");
    assert.equal(env.NINE_T_HOST, "0.0.0.0");
    assert.equal(env.NINE_T_DATA_DIR, join(root, "data"));
    assert.equal(env.NINE_T_HTTPS, "false");
    assert.equal(
      serverEnvironment(root, {
        PORT: "4000",
        NINE_T_BUILD_DIR: ".next-mobile-release",
      }).PORT,
      "4000",
    );
    for (const file of [
      ".env.production",
      ".9t-install.json",
      "data/9t.json",
    ]) {
      const content = await readFile(join(root, file), "utf8");
      assert.ok(!content.includes("test-only-password"));
      if (process.platform !== "win32")
        assert.equal((await stat(join(root, file))).mode & 0o777, 0o600);
    }
    const before = await readFile(join(root, "data/9t.json"));
    await assert.rejects(
      writeInstallation(root, prefs, "different-password"),
      /already exists/,
    );
    assert.deepEqual(await readFile(join(root, "data/9t.json")), before);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("existing or corrupt external data and environment are never replaced", async () => {
  const root = await mkdtemp(join(tmpdir(), "9t-existing-")),
    external = await mkdtemp(join(tmpdir(), "9t-external-"));
  try {
    await writeFile(
      join(external, "9t.json"),
      "not valid JSON, but belongs to the user",
    );
    await assert.rejects(assertFresh(root, external), /already exists/);
    await assert.rejects(
      writeInstallation(
        root,
        validatePreferences({ dataDir: external }, root),
        "valid-password",
      ),
      /already exists/,
    );
    assert.deepEqual(await readdir(root), []);
    await writeFile(join(root, ".env.production"), "PRIVATE_EXISTING=value");
    await assert.rejects(
      assertFresh(root, join(root, "data")),
      /already exists/,
    );
    assert.equal(
      await readFile(join(root, ".env.production"), "utf8"),
      "PRIVATE_EXISTING=value",
    );
  } finally {
    await rm(root, { recursive: true, force: true });
    await rm(external, { recursive: true, force: true });
  }
});

test("dry-run needs no password and creates no installation artifacts", async () => {
  const root = await mkdtemp(join(tmpdir(), "9t-preview-"));
  try {
    const file = join(root, "answers.json");
    await writeFile(file, JSON.stringify({ startup: "later", port: 43321 }));
    const before = await readdir(root);
    await setup(["--answers", file, "--yes", "--dry-run"], root);
    assert.deepEqual(await readdir(root), before);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("systemd unit is verifiable: unquoted WorkingDirectory, unique service names", () => {
  const unit = serviceUnit("/srv/my-9t%folder", "/opt/node/bin/node", "ubuntu");
  assert.match(unit, /WorkingDirectory=\/srv\/my-9t%%folder/);
  assert.match(
    unit,
    /ExecStart="\/opt\/node\/bin\/node" "\/srv\/my-9t%%folder\/scripts\/run-server.mjs"/,
  );
  assert.match(unit, /User=ubuntu/);
  assert.match(unit, /UMask=0077/);
  assert.match(unit, /Generated by 9t setup/);
  assert.notEqual(serviceName("/srv/one"), serviceName("/srv/two"));
  assert.throws(() =>
    serviceUnit("/srv/9t", "/usr/bin/node", "bad\nExecStart=anything"),
  );
  assert.throws(() => serviceUnit("/srv/my 9t", "/usr/bin/node", "ubuntu"), /whitespace/);
});

test("setup --service needs an existing installation; dry-run prints the unit", async () => {
  const empty = await mkdtemp(join(tmpdir(), "9t-nosvc-"));
  try {
    await assert.rejects(setup(["--service"], empty), /No installation here/);
    await assert.rejects(
      setup(["--service", "--answers", "x"], empty),
      /cannot be combined/,
    );
  } finally {
    await rm(empty, { recursive: true, force: true });
  }
  const root = await mkdtemp(join(tmpdir(), "9t-svc-"));
  try {
    await writeFile(join(root, ".env.production"), "PORT=4321\n");
    assert.equal(servicePort(root), 4321);
    const noEnv = await mkdtemp(join(tmpdir(), "9t-noenv-"));
    try {
      assert.equal(servicePort(noEnv), 3265);
    } finally {
      await rm(noEnv, { recursive: true, force: true });
    }
    const before = await readdir(root);
    await setup(["--service", "--dry-run"], root);
    assert.deepEqual(await readdir(root), before);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("installed command symlink resolves the original checkout", async () => {
  if (process.platform === "win32") return;
  const root = await mkdtemp(join(tmpdir(), "9t-link-"));
  try {
    const link = join(root, "9t");
    await symlink(new URL("../9t", import.meta.url).pathname, link);
    const output = execFileSync(link, ["setup", "--help"], {
      encoding: "utf8",
      cwd: root,
    });
    assert.match(output, /install and configure a fresh checkout/);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("preflight reports disk, RAM, data dir and occupied ports", async () => {
  const root = await mkdtemp(join(tmpdir(), "9t-pre-"));
  try {
    const checks = await preflight(root, {});
    assert.ok(checks.length >= 3);
    for (const c of checks) {
      assert.equal(typeof c.ok, "boolean");
      assert.equal(typeof c.message, "string");
    }
    assert.ok(checks.every((c) => c.ok), "fresh tmpdir passes without a port probe");
    const { createServer } = await import("node:net");
    const busy = createServer();
    await new Promise((accept) => busy.listen(0, "127.0.0.1", accept));
    const port = busy.address().port;
    try {
      const withPort = await preflight(root, { port, host: "127.0.0.1" });
      assert.ok(withPort.some((c) => !c.ok && c.message.includes(String(port))));
    } finally {
      busy.close();
    }
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("stale-build detection compares sources against the build marker", async () => {
  const root = await mkdtemp(join(tmpdir(), "9t-stale-"));
  try {
    const { utimes } = await import("node:fs/promises");
    await mkdir(join(root, "src"), { recursive: true });
    await mkdir(join(root, ".next"), { recursive: true });
    await writeFile(join(root, ".next", "BUILD_ID"), "old");
    await writeFile(join(root, "src", "a.ts"), "new");
    const old = new Date(Date.now() - 60000);
    await utimes(join(root, ".next", "BUILD_ID"), old, old);
    assert.equal(buildIsStale(root), true, "newer source is stale");
    await utimes(join(root, "src", "a.ts"), old, old);
    assert.equal(buildIsStale(root), false, "older source is fresh");
    assert.equal(buildIsStale(root, ".missing"), false, "missing build never throws");
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

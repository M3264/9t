// Integration test: requires an ISOLATED initialized-by-this-test server.
// Never run against production. Example: node tests/mobile-api.mjs http://127.0.0.1:3274
import assert from "node:assert/strict";
import {
  createCipheriv,
  createDecipheriv,
  randomBytes,
  randomUUID,
} from "node:crypto";
const base = process.argv[2] || "http://127.0.0.1:3274";
assert.match(
  base,
  /^http:\/\/127\.0\.0\.1:3274$/,
  "Only the isolated test server is supported",
);
let cookie = "";
async function api(path, opts = {}) {
  const r = await fetch(base + path, {
    ...opts,
    headers: { Cookie: cookie, ...opts.headers },
  });
  return r;
}
const init = await api("/api/setup", {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({
    username: "mobiletest",
    password: "test-password-9t",
    setupToken: "9t-isolated-mobile-tests",
  }),
});
assert.equal(init.status, 200, "Use a fresh isolated data directory");
cookie = init.headers.get("set-cookie").split(";")[0];
let r = await fetch(base + "/api/devices");
assert.equal(r.status, 401);
r = await api("/api/devices", {
  method: "POST",
  headers: {
    "Content-Type": "application/json",
    Origin: "https://evil.example",
  },
  body: JSON.stringify({ name: "bad" }),
});
assert.equal(r.status, 403);
r = await api("/api/devices", {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ name: "Test phone" }),
});
assert.equal(r.status, 200);
const pair = await r.json();
const aad = `9t:v1:${pair.instanceId}:${pair.id}`;
function encrypt(body, key = pair.key) {
  const iv = randomBytes(12),
    c = createCipheriv("aes-256-gcm", Buffer.from(key, "base64"), iv);
  c.setAAD(Buffer.from(aad + ":request"));
  return {
    id: pair.id,
    iv: iv.toString("base64"),
    data: Buffer.concat([
      c.update(JSON.stringify(body)),
      c.final(),
      c.getAuthTag(),
    ]).toString("base64"),
  };
}
function decrypt(envelope, id) {
  const bytes = Buffer.from(envelope.data, "base64"),
    c = createDecipheriv(
      "aes-256-gcm",
      Buffer.from(pair.key, "base64"),
      Buffer.from(envelope.iv, "base64"),
    );
  c.setAAD(Buffer.from(aad + ":response:" + id));
  c.setAuthTag(bytes.subarray(-16));
  return JSON.parse(
    Buffer.concat([c.update(bytes.subarray(0, -16)), c.final()]).toString(),
  );
}
async function raw(env) {
  return api("/api/mobile", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(env),
  });
}
async function rpc(value) {
  const id = randomUUID(),
    r = await raw(encrypt({ ...value, requestId: id, timestamp: Date.now() }));
  assert.equal(r.status, 200, await r.clone().text());
  return decrypt(await r.json(), id);
}
const id = randomUUID(),
  valid = encrypt({ action: "sync", timestamp: Date.now(), requestId: id });
r = await raw(valid);
assert.equal(r.status, 200);
assert.deepEqual(decrypt(await r.json(), id).objects, []);
r = await raw(valid);
assert.equal(r.status, 409, "replay rejected");
r = await raw(
  encrypt({ action: "sync", timestamp: 0, requestId: randomUUID() }),
);
assert.equal(r.status, 401, "stale request rejected");
r = await raw(
  encrypt(
    { action: "sync", timestamp: Date.now(), requestId: randomUUID() },
    randomBytes(32).toString("base64"),
  ),
);
assert.equal(r.status, 401, "wrong peer rejected");
const transferId = randomUUID();
await rpc({
  action: "sendText",
  content: "Hello 📱\nclipboard as text",
  transferId,
});
await rpc({
  action: "sendText",
  content: "Hello 📱\nclipboard as text",
  transferId,
});
let sync = await rpc({ action: "sync" });
assert.equal(sync.objects.length, 1, "idempotent retry");
const snippet = sync.objects[0];
assert.equal(
  (await rpc({ action: "text", objectId: snippet.id })).content,
  "Hello 📱\nclipboard as text",
);
const bytes = randomBytes(700000),
  form = new FormData();
form.set("type", "file");
form.set("name", "roundtrip.bin");
form.set("file", new Blob([bytes]), "roundtrip.bin");
r = await api("/api/objects", { method: "POST", body: form });
assert.equal(r.status, 200);
const file = await r.json();
let downloaded = Buffer.alloc(0),
  done = false;
while (!done) {
  const chunk = await rpc({
    action: "file",
    objectId: file.id,
    revision: file.updatedAt,
    offset: downloaded.length,
  });
  assert.equal(chunk.offset, downloaded.length);
  downloaded = Buffer.concat([downloaded, Buffer.from(chunk.data, "base64")]);
  done = chunk.done;
}
assert.deepEqual(
  downloaded,
  bytes,
  "exact file contents across encrypted chunks",
);
assert.equal(
  (
    await rpc({
      action: "file",
      objectId: file.id,
      revision: "wrong",
      offset: 0,
    })
  ).code,
  409,
);
assert.equal(
  (
    await rpc({
      action: "file",
      objectId: file.id,
      revision: file.updatedAt,
      offset: -1,
    })
  ).code,
  400,
);
r = await api("/api/objects/" + file.id, { method: "DELETE" });
assert.equal(r.status, 200);
assert.equal(
  (
    await rpc({
      action: "file",
      objectId: file.id,
      revision: file.updatedAt,
      offset: 0,
    })
  ).code,
  404,
  "trashed file not transferred",
);
r = await api("/api/config", {
  method: "PATCH",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ modules: { snippets: false } }),
});
assert.equal(r.status, 200);
assert.equal(
  (await rpc({ action: "sync" })).objects.length,
  0,
  "disabled modules excluded",
);
assert.equal((await rpc({ action: "text", objectId: snippet.id })).code, 404);
const web = await rpc({ action: "webSession" });
r = await fetch(base + "/api/objects", {
  headers: { Cookie: "9t_session=" + web.token },
});
assert.equal(r.status, 200);
r = await api("/api/devices");
const list = await r.json();
assert.equal(list.devices.length, 1);
assert.equal(list.devices[0].key, undefined);
r = await api("/api/devices", {
  method: "DELETE",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ id: pair.id }),
});
assert.equal(r.status, 200);
r = await raw(
  encrypt({ action: "sync", requestId: randomUUID(), timestamp: Date.now() }),
);
assert.equal(r.status, 401, "revoked phone blocked");
r = await fetch(base + "/api/objects", {
  headers: { Cookie: "9t_session=" + web.token },
});
assert.equal(r.status, 401, "device web session revoked");
console.log(
  "PASS: auth, CSRF, pairing, encrypted text/files, Java-compatible envelopes, replay/tamper/staleness, idempotency, chunk resume, module/trash filtering, web sessions, device revocation.",
);

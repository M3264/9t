#!/usr/bin/env node
import { readFile, writeFile, rename, unlink } from "node:fs/promises";
import { join, resolve } from "node:path";
import { randomUUID } from "node:crypto";

const root = resolve(
    process.env.NINE_T_DATA_DIR || join(process.cwd(), "data"),
  ),
  db = join(root, "9t.json"),
  objects = join(root, "objects"),
  now = Date.now();
const data = JSON.parse(await readFile(db, "utf8")),
  retention = (data.config?.trashRetentionDays ?? 7) * 864e5;
const removed = [];
data.objects = data.objects.filter((object) => {
  const expired = object.expiresAt && Date.parse(object.expiresAt) <= now,
    oldTrash =
      object.deletedAt && Date.parse(object.deletedAt) + retention <= now;
  if (expired || oldTrash) {
    removed.push(object);
    return false;
  }
  return true;
});
const ids = new Set(removed.map((object) => object.id));
for (const [id, share] of Object.entries(data.shares || {}))
  if (
    ids.has(share.objectId) ||
    (share.expiresAt && Date.parse(share.expiresAt) <= now)
  )
    delete data.shares[id];
for (const [id, session] of Object.entries(data.sessions || {}))
  if (Date.parse(session.expiresAt) <= now) delete data.sessions[id];
for (const object of removed)
  // S3 mode keeps no local blobs; deletes already went to the bucket.
  if (object.storageKey && process.env.NINE_T_STORAGE_DRIVER !== "s3")
    await unlink(join(objects, object.storageKey)).catch(() => {});
const tmp = `${db}.${randomUUID()}.tmp`;
await writeFile(tmp, JSON.stringify(data, null, 2), { mode: 0o600 });
await rename(tmp, db);
console.log(`9t cleanup: removed ${removed.length} object(s)`);

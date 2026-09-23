import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, readFile, writeFile, rm, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { scryptSync } from "node:crypto";
import { seedPreview, previewCredentials } from "../scripts/preview.mjs";

test("UI preview creates usable local fixtures and preserves existing data", async () => {
  const directory = await mkdtemp(join(tmpdir(), "9t-preview-"));
  try {
    assert.equal(await seedPreview(directory), true);
    const database = join(directory, "9t.json");
    const data = JSON.parse(await readFile(database, "utf8"));
    assert.equal(data.user.passwordHash, scryptSync(previewCredentials.password, data.user.salt, 64).toString("hex"));
    assert.equal((await stat(database)).mode & 0o777, 0o600);
    for (const object of data.objects.filter((object) => object.type === "file")) {
      const contents = await readFile(join(directory, "objects", object.storageKey));
      assert.equal(contents.length, object.sizeBytes);
    }
    await writeFile(database, "existing data, even if invalid");
    assert.equal(await seedPreview(directory), false);
    assert.equal(await readFile(database, "utf8"), "existing data, even if invalid");
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

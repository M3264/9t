import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import ts from 'typescript';

test('a rejected mutation does not block queued or future writes', async () => {
  const dir = await mkdtemp(join(tmpdir(), '9t-queue-'));
  const previous = process.env.NINE_T_DATA_DIR;
  process.env.NINE_T_DATA_DIR = join(dir, 'data');
  try {
    const source = await readFile(new URL('../lib/server/store.ts', import.meta.url), 'utf8');
    const compiled = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 } }).outputText;
    const modulePath = join(dir, 'store.mjs');
    await writeFile(modulePath, compiled);
    const { mutate, readData } = await import(modulePath);
    const failed = mutate(() => { throw new Error('simulated write failure'); });
    const queued = mutate(d => { d.config.maxSizeMb = 42; return 'saved'; });
    await assert.rejects(failed, /simulated write failure/);
    assert.equal(await queued, 'saved');
    await mutate(d => { d.config.theme = 'dark'; });
    const data = await readData();
    assert.equal(data.config.maxSizeMb, 42);
    assert.equal(data.config.theme, 'dark');
  } finally {
    if (previous === undefined) delete process.env.NINE_T_DATA_DIR;
    else process.env.NINE_T_DATA_DIR = previous;
    await rm(dir, { recursive: true, force: true });
  }
});

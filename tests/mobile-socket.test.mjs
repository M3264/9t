import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { mkdtemp, writeFile, rename, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { randomBytes, randomUUID } from 'node:crypto';
import { WebSocket } from 'ws';
import { attachMobileSocket, sealSocket, openSocket } from '../scripts/mobile-socket.mjs';

async function fixture(t) {
  const dir = await mkdtemp(join(tmpdir(), '9t-socket-'));
  const file = join(dir, '9t.json');
  const id = randomUUID(), instance = randomUUID(), key = randomBytes(32).toString('base64');
  const data = { instanceId: instance, devices: { [id]: { key } }, objects: [], config: { modules: { snippets: true } } };
  const save = async () => { await writeFile(file + '.tmp', JSON.stringify(data)); await rename(file + '.tmp', file); };
  await save();
  const server = createServer();
  const stop = attachMobileSocket(server, file, { heartbeatMs: 100, authTimeoutMs: 500 });
  await new Promise(r => server.listen(0, '127.0.0.1', r));
  t.after(async () => { await stop(); await new Promise(r => server.close(r)); await rm(dir, { recursive: true, force: true }); });
  return { id, instance, key, data, save, url: `ws://127.0.0.1:${server.address().port}/api/mobile/socket` };
}
async function connect(f) {
  const ws = new WebSocket(f.url);
  const messages = [], waiting = [];
  ws.on('message', raw => {
    const value = JSON.parse(raw.toString());
    if (waiting.length) waiting.shift()(value); else messages.push(value);
  });
  const next = () => messages.length ? Promise.resolve(messages.shift()) : new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(Error('Message timeout')), 2500);
    waiting.push(value => { clearTimeout(timer); resolve(value); });
  });
  const closed = new Promise(r => ws.once('close', code => r(code)));
  ws.on('error', () => {});
  const hello = await next();
  const aad = `9t:socket:v1:${f.instance}:${f.id}:${hello.challenge}`;
  const clientNonce = randomUUID();
  const envelope = { id: f.id, ...sealSocket(f.key, aad + ':subscribe', { action: 'subscribe', challenge: hello.challenge, clientNonce }) };
  return { ws, next, closed, envelope, aad, clientNonce, event: raw => openSocket(f.key, aad + ':event:' + clientNonce, raw) };
}

test('persistent socket pushes atomic store changes, skips session-only writes, and revokes connected peers', async t => {
  const f = await fixture(t), c = await connect(f);
  c.ws.send(JSON.stringify(c.envelope));
  let event = c.event(await c.next());
  assert.equal(event.type, 'ready');
  assert.equal(event.sequence, 1);
  const initial = event.revision;
  f.data.sessions = { test: { expiresAt: 'tomorrow' } };
  await f.save();
  event = c.event(await c.next());
  assert.equal(event.type, 'heartbeat');
  assert.equal(event.revision, initial);
  f.data.objects.push({ id: randomUUID(), content: 'private content', updatedAt: new Date().toISOString() });
  await f.save();
  do { const frame = await c.next(); assert.ok(!JSON.stringify(frame).includes('private content')); event = c.event(frame); } while (event.type === 'heartbeat');
  assert.equal(event.type, 'changed');
  assert.notEqual(event.revision, initial);
  delete f.data.devices[f.id];
  await f.save();
  assert.equal(await c.closed, 4003);
});

test('wrong keys, cross-connection auth replays and oversized frames are rejected', async t => {
  const f = await fixture(t), first = await connect(f);
  const replay = await connect(f);
  replay.ws.send(JSON.stringify(first.envelope));
  assert.equal(await replay.closed, 4003);
  first.ws.send(JSON.stringify({ ...first.envelope, data: 'AAAA' }));
  assert.equal(await first.closed, 4003);
  const huge = await connect(f);
  huge.ws.send('x'.repeat(5000));
  assert.equal(await huge.closed, 1009);
});

test('reconnecting reports the current revision and frames bind to the client nonce', async t => {
  const f = await fixture(t), first = await connect(f);
  first.ws.send(JSON.stringify(first.envelope));
  const raw = await first.next(), before = first.event(raw);
  assert.throws(() => openSocket(f.key, first.aad + ':event:' + randomUUID(), raw));
  first.ws.close(); await first.closed;
  f.data.objects.push({ id: randomUUID(), content: 'arrived while disconnected' }); await f.save();
  const second = await connect(f);
  second.ws.send(JSON.stringify(second.envelope));
  const after = second.event(await second.next());
  assert.equal(after.type, 'ready'); assert.notEqual(after.revision, before.revision);
  assert.throws(() => second.event(raw));
  second.ws.close(); await second.closed;
});

test('unauthenticated sockets expire without receiving workspace data', async t => {
  const f = await fixture(t), c = await connect(f);
  assert.equal(await c.closed, 1006);
});

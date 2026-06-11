// test/photos.api.test.mjs
import { test, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import handler from '../api/photos.js';

const fixture = JSON.parse(readFileSync(new URL('./fixtures/dimu-search.json', import.meta.url)));
const realFetch = globalThis.fetch;
afterEach(() => { globalThis.fetch = realFetch; });

function mockRes() {
  return {
    statusCode: 200, headers: {}, body: null,
    setHeader(k, v) { this.headers[k] = v; },
    status(c) { this.statusCode = c; return this; },
    json(b) { this.body = b; return this; },
  };
}

test('photos: 400 when dq missing', async () => {
  const res = mockRes();
  await handler({ query: {} }, res);
  assert.equal(res.statusCode, 400);
});

test('photos: returns trimmed gallery on success', async () => {
  globalThis.fetch = async () => ({ ok: true, json: async () => fixture });
  const res = mockRes();
  await handler({ query: { dq: 'Drammen Bragernes' } }, res);
  assert.equal(res.statusCode, 200);
  assert.ok(Array.isArray(res.body));
  assert.match(res.headers['Cache-Control'] || '', /s-maxage/);
});

test('photos: 502 on upstream failure', async () => {
  globalThis.fetch = async () => ({ ok: false, status: 500 });
  const res = mockRes();
  await handler({ query: { dq: 'x' } }, res);
  assert.equal(res.statusCode, 502);
});

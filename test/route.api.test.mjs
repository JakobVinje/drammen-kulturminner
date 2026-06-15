// test/route.api.test.mjs
import { test, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import handler from '../api/route.js';

const fx = JSON.parse(readFileSync(new URL('./fixtures/ors-route.json', import.meta.url)));
const realFetch = globalThis.fetch;
const realKey = process.env.ORS_API_KEY;
afterEach(() => { globalThis.fetch = realFetch; if (realKey === undefined) delete process.env.ORS_API_KEY; else process.env.ORS_API_KEY = realKey; });

function mockRes() {
  return {
    statusCode: 200, headers: {}, body: null,
    setHeader(k, v) { this.headers[k] = v; },
    status(c) { this.statusCode = c; return this; },
    json(b) { this.body = b; return this; },
  };
}

test('route: 400 on missing/invalid coords', async () => {
  process.env.ORS_API_KEY = 'k';
  const res = mockRes();
  await handler({ query: {} }, res);
  assert.equal(res.statusCode, 400);
});

test('route: 400 when fewer than 2 coords', async () => {
  process.env.ORS_API_KEY = 'k';
  const res = mockRes();
  await handler({ query: { coords: '59.74,10.20' } }, res);
  assert.equal(res.statusCode, 400);
});

test('route: 502 when key missing', async () => {
  delete process.env.ORS_API_KEY;
  const res = mockRes();
  await handler({ query: { coords: '59.74,10.20;59.75,10.21' } }, res);
  assert.equal(res.statusCode, 502);
});

test('route: 200 returns {line,distance,duration} + cache header', async () => {
  process.env.ORS_API_KEY = 'k';
  let sentBody = null;
  globalThis.fetch = async (_url, opts) => { sentBody = JSON.parse(opts.body); return { ok: true, json: async () => fx }; };
  const res = mockRes();
  await handler({ query: { coords: '59.7458,10.2049;59.7466,10.2061' } }, res);
  assert.equal(res.statusCode, 200);
  assert.deepEqual(res.body.line[0], [59.7458, 10.2049]);
  assert.equal(res.body.distance, 1234.5);
  assert.match(res.headers['Cache-Control'] || '', /s-maxage/);
  // verify the proxy swapped to [lon,lat] for ORS
  assert.deepEqual(sentBody.coordinates[0], [10.2049, 59.7458]);
});

test('route: 502 on upstream failure', async () => {
  process.env.ORS_API_KEY = 'k';
  globalThis.fetch = async () => ({ ok: false, status: 500 });
  const res = mockRes();
  await handler({ query: { coords: '59.74,10.20;59.75,10.21' } }, res);
  assert.equal(res.statusCode, 502);
});

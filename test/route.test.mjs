// test/route.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { parseCoords, orsBody, parseRoute, ORS_ENDPOINT } from '../lib/route.js';

const fx = JSON.parse(readFileSync(new URL('./fixtures/ors-route.json', import.meta.url)));

test('parseCoords: parses "lat,lon;lat,lon" to [[lat,lon]]', () => {
  assert.deepEqual(parseCoords('59.74,10.20;59.75,10.21'), [[59.74, 10.20], [59.75, 10.21]]);
});

test('parseCoords: rejects non-numeric and out-of-range', () => {
  assert.throws(() => parseCoords('abc,10'));
  assert.throws(() => parseCoords('200,10'));
  assert.throws(() => parseCoords('59,500'));
});

test('parseCoords: empty -> empty array', () => {
  assert.deepEqual(parseCoords(''), []);
});

test('orsBody: swaps to [lon,lat]', () => {
  assert.deepEqual(orsBody([[59.74, 10.20], [59.75, 10.21]]), { coordinates: [[10.20, 59.74], [10.21, 59.75]] });
});

test('parseRoute: geojson -> {line:[[lat,lon]], distance, duration}', () => {
  const r = parseRoute(fx);
  assert.deepEqual(r.line[0], [59.7458, 10.2049]);
  assert.equal(r.line.length, 3);
  assert.equal(r.distance, 1234.5);
  assert.equal(r.duration, 890.1);
});

test('parseRoute: missing/empty geojson is safe', () => {
  const r = parseRoute({});
  assert.deepEqual(r.line, []);
  assert.equal(r.distance, null);
  assert.equal(r.duration, null);
});

test('ORS_ENDPOINT is the foot-walking geojson endpoint', () => {
  assert.match(ORS_ENDPOINT, /directions\/foot-walking\/geojson$/);
});

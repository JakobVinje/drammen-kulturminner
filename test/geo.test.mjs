// test/geo.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { haversine, confidenceBand, formatDistance } from '../lib/geo.js';

test('haversine: zero distance for identical points', () => {
  assert.equal(haversine(59.74, 10.20, 59.74, 10.20), 0);
});

test('haversine: ~111m for 0.001 deg latitude', () => {
  const d = haversine(59.74, 10.20, 59.741, 10.20);
  assert.ok(d > 108 && d < 114, `expected ~111m, got ${d}`);
});

test('confidenceBand: distance thresholds 25/75/150', () => {
  assert.equal(confidenceBand(0), 'h');
  assert.equal(confidenceBand(25), 'h');
  assert.equal(confidenceBand(25.01), 'm');
  assert.equal(confidenceBand(75), 'm');
  assert.equal(confidenceBand(75.01), 'l');
  assert.equal(confidenceBand(150), 'l');
  assert.equal(confidenceBand(150.01), null);
});

test('formatDistance: metres rounded to nearest 10 under 1 km', () => {
  assert.equal(formatDistance(0), '0 m');
  assert.equal(formatDistance(124), '120 m');
  assert.equal(formatDistance(950), '950 m');
});
test('formatDistance: km with Norwegian comma 1000–9999, whole km from 10000', () => {
  assert.equal(formatDistance(1000), '1,0 km');
  assert.equal(formatDistance(1234), '1,2 km');
  assert.equal(formatDistance(9900), '9,9 km');
  assert.equal(formatDistance(12300), '12 km');
});
test('formatDistance: invalid input -> empty string', () => {
  assert.equal(formatDistance(-5), '');
  assert.equal(formatDistance(NaN), '');
});

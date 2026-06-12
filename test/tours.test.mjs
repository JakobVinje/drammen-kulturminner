// test/tours.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { nearestNeighbourOrder, buildAutoTours, resolveStops } from '../lib/tours.js';

test('nearestNeighbourOrder: greedy nearest-next, deterministic', () => {
  const items = [{ id: 'a', ll: [59.740, 10.200] }, { id: 'c', ll: [59.760, 10.200] }, { id: 'b', ll: [59.745, 10.200] }];
  assert.deepEqual(nearestNeighbourOrder(items, 0).map((i) => i.id), ['a', 'b', 'c']);
});

test('nearestNeighbourOrder: 0 and 1 item safe', () => {
  assert.deepEqual(nearestNeighbourOrder([]), []);
  assert.equal(nearestNeighbourOrder([{ ll: [1, 2] }]).length, 1);
});

test('buildAutoTours: groups by mi, honours minStops, excludes empty/uten miljø/no-ll', () => {
  const DATA = [
    { mi: 'A', ll: [59.740, 10.2] }, { mi: 'A', ll: [59.741, 10.2] }, { mi: 'A', ll: [59.742, 10.2] }, { mi: 'A', ll: [59.743, 10.2] },
    { mi: 'B', ll: [59.75, 10.2] }, { mi: 'B', ll: [59.751, 10.2] },         // only 2 -> excluded
    { mi: '', ll: [59.76, 10.2] }, { mi: '(uten miljø)', ll: [59.76, 10.2] }, // excluded
    { mi: 'A' },                                                             // no ll -> not counted
  ];
  const tours = buildAutoTours(DATA, { minStops: 4, maxStops: 20 });
  assert.equal(tours.length, 1);
  assert.equal(tours[0].id, 'mi:A');
  assert.equal(tours[0].title, 'A');
  assert.equal(tours[0].stops.length, 4);
  assert.deepEqual(tours[0].stops.slice().sort((a, b) => a - b), [0, 1, 2, 3]);
});

test('buildAutoTours: caps at maxStops', () => {
  const DATA = Array.from({ length: 30 }, (_, i) => ({ mi: 'A', ll: [59.74 + i * 0.001, 10.2] }));
  const tours = buildAutoTours(DATA, { minStops: 4, maxStops: 20 });
  assert.equal(tours[0].stops.length, 20);
});

test('resolveStops: maps indices to records, skips missing/no-ll', () => {
  const DATA = [{ ll: [59.74, 10.2], be: 'X' }, { be: 'no-ll' }];
  const recs = resolveStops({ id: 't', stops: [0, 1, 99] }, DATA);
  assert.equal(recs.length, 1);
  assert.equal(recs[0].be, 'X');
});

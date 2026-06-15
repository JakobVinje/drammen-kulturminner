// test/tours.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { nearestNeighbourOrder, buildAutoTours, resolveStops, summarize } from '../lib/tours.js';

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

test('summarize: function + style + year + verdi', () => {
  assert.equal(summarize({f:'bolig',kat:'Bolig',sn:'Sveitserstil',ar:'1890',v:'H'}),
    'Bolig i sveitserstil, oppført 1890. Høy verneverdi.');
});
test('summarize: skips Ubestemt/Uoppgitt style; uses y when ar empty', () => {
  assert.equal(summarize({f:'kirkegård',sn:'Ubestemt',v:'S'}), 'Kirkegård. Svært høy verneverdi.');
  assert.equal(summarize({f:'bro',sn:'Funksjonalisme',y:1936,v:'H'}), 'Bro i funksjonalisme, oppført 1936. Høy verneverdi.');
});
test('summarize: appends Fredet; unknown verdi omitted; empty record -> ""', () => {
  assert.equal(summarize({f:'bolig',sn:'Sveitserstil',v:'S',fr:1}), 'Bolig i sveitserstil. Svært høy verneverdi. Fredet.');
  assert.equal(summarize({f:'bolig',v:'X'}), 'Bolig.');
  assert.equal(summarize({}), '');
  assert.equal(summarize(null), '');
});

test('resolveStops: aligned {recs,notes}, bare + {i,note}, skips missing/no-ll', () => {
  const DATA = [{ ll:[59.74,10.2], be:'X' }, { be:'no-ll' }, { ll:[59.75,10.2], be:'Y' }];
  const r = resolveStops({ id:'t', stops:[0, {i:2,note:'hei'}, 1, 99] }, DATA);
  assert.deepEqual(r.recs.map(x=>x.be), ['X','Y']);
  assert.deepEqual(r.notes, [null,'hei']);
});

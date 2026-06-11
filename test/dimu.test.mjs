// test/dimu.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { buildQuery, searchUrl, countUrl, imageUrl, countHits, trimPhotos } from '../lib/dimu.js';

const fixture = JSON.parse(readFileSync(new URL('./fixtures/dimu-search.json', import.meta.url)));

test('buildQuery: prefixes Drammen and uses address', () => {
  assert.equal(buildQuery({ ad: 'Engene 16', be: 'Bygård' }), 'Drammen Engene 16');
});

test('buildQuery: falls back to betegnelse when no address', () => {
  assert.equal(buildQuery({ ad: '', be: 'Bragernes kai' }), 'Drammen Bragernes kai');
});

test('buildQuery: returns empty string when no address and no betegnelse (empty object)', () => {
  assert.equal(buildQuery({}), '');
});

test('buildQuery: returns empty string when both ad and be are empty strings', () => {
  assert.equal(buildQuery({ ad: '', be: '' }), '');
});

test('searchUrl: includes key, paging, image filter', () => {
  const u = searchUrl('Drammen Engene 16', 1, 'demo', 24);
  assert.match(u, /api\.key=demo/);
  assert.match(u, /start=24/);
  assert.match(u, /rows=24/);
});

test('countUrl: rows=0', () => {
  assert.match(countUrl('Drammen', 'demo'), /rows=0/);
});

test('imageUrl: builds dms01 delivery URL with dimension', () => {
  assert.equal(imageUrl('abc', '400x400'), 'https://dms01.dimu.org/image/abc?dimension=400x400');
});

test('countHits: reads hit count from fixture', () => {
  assert.equal(typeof countHits(fixture), 'number');
  assert.equal(countHits(fixture), 214); // pinned to the captured fixture's numFound
});

test('trimPhotos: maps fixture docs to minimal gallery items', () => {
  const photos = trimPhotos(fixture);
  assert.ok(Array.isArray(photos) && photos.length >= 1);
  for (const p of photos) {
    assert.ok(p.thumb.startsWith('https://dms01.dimu.org/image/'));
    assert.ok(p.full.startsWith('https://dms01.dimu.org/image/'));
    assert.equal(typeof p.title, 'string');
    assert.equal(typeof p.owner, 'string');
    assert.equal(typeof p.license, 'string');
  }
});

test('trimPhotos: license array is normalized to string', () => {
  const photos = trimPhotos(fixture);
  // First doc has ["CC pdm"] — should become "CC pdm"
  assert.equal(photos[0].license, 'CC pdm');
});

test('trimPhotos: missing license defaults to empty string', () => {
  // Synthetic doc with no license field — verifies the absent-field default
  const syntheticResponse = {
    response: {
      numFound: 1,
      docs: [
        {
          'artifact.defaultMediaIdentifier': 'testMediaId',
          'artifact.ingress.title': 'Test photo',
          'identifier.owner': 'TST',
          // artifact.ingress.license intentionally absent
          'artifact.uniqueId': '999',
        },
      ],
    },
  };
  const photos = trimPhotos(syntheticResponse);
  assert.equal(photos.length, 1);
  assert.equal(photos[0].license, '');
});

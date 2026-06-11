// test/heritage.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { bboxUrl, parseLokaliteter, pickNearest, trimLocality } from '../lib/heritage.js';

const gml = readFileSync(new URL('./fixtures/wfs-lokalitet.xml', import.meta.url), 'utf8');

test('bboxUrl: WFS GetFeature for app:Lokalitet with a bbox', () => {
  const u = bboxUrl(59.744, 10.205, 150);
  assert.match(u, /request=GetFeature/i);
  assert.match(u, /typeNames=app%3ALokalitet/i);
  assert.match(u, /bbox=/i);
});

test('parseLokaliteter: extracts features with id/name/coords from real GML', () => {
  const feats = parseLokaliteter(gml);
  assert.ok(feats.length >= 1);
  const f = feats[0];
  assert.ok(f.id && typeof f.id === 'string');
  assert.ok(typeof f.navn === 'string');
  assert.ok(Array.isArray(f.coords) && f.coords.length >= 1);
  assert.ok(Array.isArray(f.coords[0]) && f.coords[0].length === 2);
});

test('pickNearest: returns nearest feature with numeric distance', () => {
  const feats = parseLokaliteter(gml);
  const got = pickNearest(feats, 59.744, 10.205);
  assert.ok(got && got.feature && typeof got.dist === 'number');
});

test('pickNearest: null on empty', () => {
  assert.equal(pickNearest([], 59.744, 10.205), null);
});

test('trimLocality: produces baked-field object', () => {
  const f = parseLokaliteter(gml)[0];
  const loc = trimLocality(f);
  assert.ok('id' in loc && 'name' in loc && 'vernetype' in loc && 'link' in loc);
  assert.match(loc.link, /^https:\/\/kulturminnesok\.no\/ra\/lokalitet\//);
});

test('pickNearest: returns dist===0 for a point clearly inside the first feature polygon', () => {
  const feats = parseLokaliteter(gml);
  // First feature is Strømsgodset kirkested; its polygon coords (lat,lon pairs) are:
  // [59.742564,10.186705], [59.742562,10.186612], [59.742508,10.186617], [59.742510,10.186712],
  // [59.742480,10.186715], [59.742488,10.186991], [59.742483,10.186991], [59.742485,10.187064],
  // [59.742501,10.187062], [59.742501,10.187071], [59.742546,10.187066], [59.742592,10.187060],
  // [59.742591,10.187031], [59.742606,10.187030], [59.742605,10.186977], [59.742602,10.186978],
  // [59.742594,10.186702], [59.742564,10.186705]
  // The average of all vertices is inside this convex-ish polygon.
  const interiorLat = 59.742538;
  const interiorLon = 10.186884;
  // Build a single-feature array so the target is always picked
  const got = pickNearest([feats[0]], interiorLat, interiorLon);
  assert.ok(got !== null, 'should return a match');
  assert.strictEqual(got.dist, 0, 'dist should be 0 for a point inside the polygon');
});

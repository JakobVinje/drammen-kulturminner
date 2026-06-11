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

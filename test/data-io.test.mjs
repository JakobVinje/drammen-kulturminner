// test/data-io.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseData, replaceData } from '../lib/data-io.js';

const SAMPLE =
  '<script>\nconst DATA=[{"ll":[59.74,10.19],"be":"A"},{"be":"B"}];\nconst x=1;\n</script>';

test('parseData: extracts the array', () => {
  const d = parseData(SAMPLE);
  assert.equal(d.length, 2);
  assert.deepEqual(d[0].ll, [59.74, 10.19]);
});

test('parseData: throws when absent', () => {
  assert.throws(() => parseData('<script>const Y=1;</script>'));
});

test('replaceData: round-trips and preserves surrounding code', () => {
  const data = parseData(SAMPLE);
  data[0].hp = true;
  const out = replaceData(SAMPLE, data);
  assert.match(out, /const x=1;/);
  const reparsed = parseData(out);
  assert.equal(reparsed[0].hp, true);
  assert.equal(reparsed.length, 2);
});

test('replaceData: handles $ in values safely', () => {
  const data = [{ be: 'a$1b' }];
  const html = 'const DATA=[];';
  const out = replaceData(html, data);
  assert.equal(parseData(out)[0].be, 'a$1b');
});

// lib/data-io.js
import { readFile, writeFile } from 'node:fs/promises';

// Matches the single-line `const DATA=[...]` statement. Greedy `.*` (no `s` flag)
// stays on one line and captures to the last `]` before `;`.
const DATA_RE = /const DATA=(\[.*\]);/;

export function parseData(html) {
  const m = html.match(DATA_RE);
  if (!m) throw new Error('Could not locate `const DATA=[...]` in HTML');
  return JSON.parse(m[1]);
}

export function replaceData(html, data) {
  if (!DATA_RE.test(html)) throw new Error('Could not locate `const DATA=[...]` in HTML');
  const json = JSON.stringify(data);
  // Function replacer avoids `$&`/`$1` interpretation inside the JSON payload.
  return html.replace(DATA_RE, () => `const DATA=${json};`);
}

export async function readHtml(path) {
  return readFile(path, 'utf8');
}

export async function writeHtml(path, html) {
  return writeFile(path, html, 'utf8');
}

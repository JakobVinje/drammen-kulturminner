// scripts/enrich.mjs
// Offline enrichment: bakes hp/dq/km/kc/kn/kv into index.html's DATA.
// Usage: DIMU_API_KEY=... node scripts/enrich.mjs [--limit N]
import { readHtml, writeHtml, parseData, replaceData } from '../lib/data-io.js';
import { buildQuery, countUrl, countHits } from '../lib/dimu.js';
import { bboxUrl, parseLokaliteter, pickNearest, trimLocality } from '../lib/heritage.js';
import { confidenceBand } from '../lib/geo.js';
import { readFile, writeFile } from 'node:fs/promises';

const HTML_PATH = new URL('../index.html', import.meta.url);
const CACHE_PATH = new URL('./enrich-cache.json', import.meta.url);
const REPORT_PATH = new URL('./enrich-report.json', import.meta.url);
const API_KEY = process.env.DIMU_API_KEY || 'demo';
const CONCURRENCY = 10;
const RETRIES = 3;

const limitArg = process.argv.indexOf('--limit');
const LIMIT = limitArg !== -1 ? Number(process.argv[limitArg + 1]) : Infinity;
if (limitArg !== -1 && !Number.isFinite(LIMIT)) {
  throw new Error(`--limit requires a positive integer, got: ${process.argv[limitArg + 1]}`);
}

// Stable id for cache keying: prefer gnr/bnr, else address+betegnelse.
// NOTE: this is PARCEL-level (eiendom), not building-level — multiple records can
// share one gnr/bnr. Such siblings inherit the first record's result (same parcel →
// same coordinate → same heritage match; the photo query reuses the first address).
function recId(r) {
  return r.g && r.bn ? `MAT|${r.g}|${r.bn}` : `ADR|${r.ad}|${r.be}`;
}

async function fetchJson(url, tries = RETRIES) {
  for (let i = 0; i < tries; i++) {
    try {
      const res = await fetch(url);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return await res.json();
    } catch (e) {
      if (i === tries - 1) throw e;
      await new Promise((r) => setTimeout(r, 400 * (i + 1)));
    }
  }
}

async function fetchText(url, tries = RETRIES) {
  for (let i = 0; i < tries; i++) {
    try {
      const res = await fetch(url);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return await res.text();
    } catch (e) {
      if (i === tries - 1) throw e;
      await new Promise((r) => setTimeout(r, 400 * (i + 1)));
    }
  }
}

async function loadCache() {
  try { return JSON.parse(await readFile(CACHE_PATH, 'utf8')); }
  catch { return {}; }
}

async function enrichOne(r, cache, report) {
  const id = recId(r);
  if (cache[id]) return cache[id];

  const result = {};
  // DigitaltMuseum: count-only -> hp + dq
  // Skip entirely when buildQuery returns '' (no address/betegnelse) to avoid match-all queries.
  const dq = buildQuery(r);
  if (!dq) {
    report.push({ id, dimuSkipped: true });
  } else {
    try {
      const json = await fetchJson(countUrl(dq, API_KEY));
      const hits = countHits(json);
      result.hp = hits > 0;
      if (hits > 0) result.dq = dq;
      report.push({ id, dq, dimuHits: hits });
    } catch (e) {
      report.push({ id, dq, dimuError: String(e) });
    }
  }

  // Kulturminnesøk: WFS BBOX -> parse GML -> nearest -> km/kc/kn/kv (only if coordinates exist)
  if (Array.isArray(r.ll)) {
    const [lat, lon] = r.ll;
    try {
      const gml = await fetchText(bboxUrl(lat, lon, 150));
      const feats = parseLokaliteter(gml);
      const near = pickNearest(feats, lat, lon);
      if (near) {
        const kc = confidenceBand(near.dist);
        if (kc) {
          const loc = trimLocality(near.feature);
          result.km = loc.id;
          result.kc = kc;
          result.kn = loc.name;
          result.kv = loc.vernetype;
          report.push({ id, kmDist: Math.round(near.dist), kc, kmId: loc.id });
        }
      }
    } catch (e) {
      report.push({ id, kmError: String(e) });
    }
  }

  cache[id] = result;
  return result;
}

// Bounded-concurrency map.
async function pool(items, n, fn) {
  const out = new Array(items.length);
  let idx = 0;
  async function worker() {
    while (idx < items.length) {
      const i = idx++;
      out[i] = await fn(items[i], i);
    }
  }
  await Promise.all(Array.from({ length: Math.min(n, items.length) }, worker));
  return out;
}

async function main() {
  const html = await readHtml(HTML_PATH);
  const data = parseData(html);
  const targets = data.slice(0, LIMIT === Infinity ? data.length : LIMIT);

  const cache = await loadCache();
  const report = [];
  let done = 0;

  await pool(targets, CONCURRENCY, async (r) => {
    const res = await enrichOne(r, cache, report);
    Object.assign(r, res); // write hp/dq/km/kc/kn/kv onto the record in place
    if (++done % 50 === 0) {
      process.stdout.write(`  ${done}/${targets.length}\n`);
      await writeFile(CACHE_PATH, JSON.stringify(cache, null, 2));
    }
  });

  await writeFile(CACHE_PATH, JSON.stringify(cache, null, 2));
  await writeFile(REPORT_PATH, JSON.stringify(report, null, 2));

  if (LIMIT === Infinity) {
    await writeHtml(HTML_PATH, replaceData(html, data));
    console.log(`Wrote enrichment for ${data.length} records into index.html`);
  } else {
    console.log(`Dry run (--limit ${LIMIT}); index.html NOT modified. See enrich-report.json`);
  }
}

main().catch((e) => { console.error(e); process.exit(1); });

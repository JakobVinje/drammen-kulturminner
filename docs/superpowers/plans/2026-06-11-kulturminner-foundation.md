# Kulturminner Photos/Heritage — Foundation Plan (Plan 1 of 2)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the data + backend foundation — project scaffolding, a unit-tested shared logic library, the offline enrichment script that bakes `hp`/`dq`/`km`/`kc` into `DATA`, and two Vercel serverless proxy endpoints — so the map UI (Plan 2) has working baked data and live photo/heritage endpoints to consume.

**Architecture:** Approach C (hybrid). Offline enrichment (`scripts/enrich.mjs`) bakes lightweight match metadata into `DATA` for instant filtering; live Vercel functions (`api/photos.js`, `api/heritage.js`) fetch the actual gallery + details on demand, holding the DigitaltMuseum key server-side. Pure, deterministic logic is extracted into `lib/` and tested with Node's built-in test runner (zero runtime dependencies, consistent with the project's no-build-system ethos).

**Tech Stack:** Static HTML (existing), Node.js ESM (`scripts/`, `lib/`, `api/`), `node --test`, Vercel serverless functions. No bundler. External APIs: DigitaltMuseum Solr API (`api.dimu.org`, key `DIMU_API_KEY`); Kulturminnesøk ArcGIS REST FeatureServer (open, queried spatially).

**Spec:** `docs/superpowers/specs/2026-06-11-kulturminner-photos-heritage-design.md`

**Scope note:** This is Plan 1 of 2. Plan 2 (the browser UI: detail side-panel, "has photo" filter + marker ring, `obj=` deep-linking, mobile bottom-sheet) is written separately, after this plan executes, against the real baked-data shape this plan produces.

---

## File Structure

| Path | Responsibility |
|------|----------------|
| `index.html` | The map (renamed from `kulturminner-kart.html`). Untouched by this plan except the rename; UI work is Plan 2. |
| `package.json` | ESM marker (`"type":"module"`), `test` + `enrich` scripts. No runtime deps. |
| `vercel.json` | Minimal config; ensures `api/` functions + static `index.html` route correctly. |
| `lib/geo.js` | Pure geo math: `haversine`, `confidenceBand`. |
| `lib/dimu.js` | DigitaltMuseum query/URL builders + response trimming. |
| `lib/heritage.js` | Kulturminnesøk WFS BBOX URL builder + GML parser + nearest-pick + baked-field trimming. |
| `lib/data-io.js` | Parse/replace the `const DATA=[...]` block in `index.html`; read/write file. |
| `scripts/enrich.mjs` | Offline orchestration: read `index.html` → per-record DiMu count + heritage WFS spatial match → write `hp`/`dq`/`km`/`kc`/`kn`/`kv` back; cache + report. |
| `api/photos.js` | Serverless GET proxy → DiMu gallery for a baked `dq`. (The ONLY serverless function — heritage is baked, not live.) |
| `test/*.test.mjs` | Unit tests (one per `lib` module + the photos API handler). |
| `test/fixtures/*` | Real captured API responses used as test fixtures (`dimu-search.json`, `wfs-lokalitet.xml`). |
| `.env.example` | Documents `DIMU_API_KEY`. |
| `README.md` | Setup + deploy + enrichment run instructions. |

---

## Task 1: Project scaffolding

**Files:**
- Create: `package.json`
- Create: `vercel.json`
- Rename: `kulturminner-kart.html` → `index.html`
- Modify: `CLAUDE.md` (reflect new filename + structure)

- [ ] **Step 1: Rename the deliverable with git**

```bash
git mv "kulturminner-kart.html" index.html
```

- [ ] **Step 2: Create `package.json`**

```json
{
  "name": "drammen-kulturminner",
  "version": "1.0.0",
  "private": true,
  "type": "module",
  "description": "Kart over registrerte kulturminner i Drammen, med foto (DigitaltMuseum) og kulturminnedata (Kulturminnesøk).",
  "scripts": {
    "test": "node --test",
    "enrich": "node scripts/enrich.mjs"
  }
}
```

- [ ] **Step 3: Create `vercel.json`**

```json
{
  "$schema": "https://openapi.vercel.sh/vercel.json",
  "cleanUrls": true,
  "functions": {
    "api/*.js": { "memory": 128, "maxDuration": 10 }
  }
}
```

- [ ] **Step 4: Update `CLAUDE.md` filename references**

In `CLAUDE.md`, change the two references from `kulturminner-kart.html` to `index.html` (the "Files" section bullet and the "Architecture of" heading). Add a one-line note under "What this is":

```markdown
The project now also includes a Vercel backend (`api/`), an offline enrichment
script (`scripts/enrich.mjs`), and unit-tested shared logic (`lib/`, `test/`).
Run tests with `npm test`; run enrichment with `npm run enrich`.
```

- [ ] **Step 5: Verify the rename + scaffolding**

Run: `node --test` (expects: "tests 0" / no test files yet, exit 0) and `git status`
Expected: `index.html` shown as renamed; `package.json`, `vercel.json` new.

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "chore: scaffold Vercel project (rename to index.html, package.json, vercel.json)"
```

---

## Task 2: `lib/geo.js` — distance + confidence (pure, full TDD)

**Files:**
- Create: `lib/geo.js`
- Test: `test/geo.test.mjs`

- [ ] **Step 1: Write the failing test**

```js
// test/geo.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { haversine, confidenceBand } from '../lib/geo.js';

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
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test test/geo.test.mjs`
Expected: FAIL — `Cannot find module '../lib/geo.js'`.

- [ ] **Step 3: Write the implementation**

```js
// lib/geo.js

// Great-circle distance in meters between two lat/lon points.
export function haversine(lat1, lon1, lat2, lon2) {
  const R = 6371000; // earth radius in meters
  const toRad = (d) => (d * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(a));
}

// Distance-banded confidence for a Kulturminnesøk spatial match.
// <=25m high, <=75m medium, <=150m low, beyond => null (treated as no match).
export function confidenceBand(meters) {
  if (meters <= 25) return 'h';
  if (meters <= 75) return 'm';
  if (meters <= 150) return 'l';
  return null;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test test/geo.test.mjs`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add lib/geo.js test/geo.test.mjs
git commit -m "feat(lib): add geo haversine + confidence banding with tests"
```

---

## Task 3: Capture live API fixtures (spike — pins endpoints & response shapes)

This task removes guesswork from Tasks 4–5 and 7–8: we hit the real APIs once, save the raw JSON as committed fixtures, and **read the actual field names** before writing trim logic. No production code depends on assumed field paths.

**Files:**
- Create: `test/fixtures/dimu-search.json`
- Create: `test/fixtures/arcgis-query.json`
- Create: `docs/superpowers/notes/api-contracts.md`

- [ ] **Step 1: Capture a real DigitaltMuseum search response**

Run (PowerShell; `demo` key is fine for capture):

```powershell
$u = 'https://api.dimu.org/api/solr/select?q=Drammen+Bragernes&fq=artifact.type:Photograph&rows=3&wt=json&api.key=demo'
Invoke-WebRequest -Uri $u | Select-Object -ExpandProperty Content | Out-File -Encoding utf8 test/fixtures/dimu-search.json
```

If the request fails or returns zero docs, adjust the `q`/`fq` in the URL until you get ≥1 photo doc, and record the working query in the notes file (Step 3).

- [ ] **Step 2: Capture a real Kulturminnesøk ArcGIS response**

Find the Kulturminnesøk "enkeltminner/lokaliteter" FeatureServer/MapServer layer URL from the Geonorge Kartkatalog entry (`kartkatalog.geonorge.no`, dataset "Kulturminner – lokaliteter") or the Riksantikvaren ArcGIS item. Then run a point-radius query near central Drammen (lat 59.744, lon 10.205):

```powershell
$layer = '<PASTE CONFIRMED FeatureServer/MapServer layer URL>'
$geom  = '{"x":10.205,"y":59.744,"spatialReference":{"wkid":4326}}'
$u = "$layer/query?geometry=$([uri]::EscapeDataString($geom))&geometryType=esriGeometryPoint&inSR=4326&distance=300&units=esriSRUnit_Meter&spatialRel=esriSpatialRelIntersects&outFields=*&returnGeometry=true&outSR=4326&f=json"
Invoke-WebRequest -Uri $u | Select-Object -ExpandProperty Content | Out-File -Encoding utf8 test/fixtures/arcgis-query.json
```

Confirm the response has a `features` array with `attributes` and `geometry`. If empty, widen `distance` or move the point until ≥1 feature returns.

- [ ] **Step 3: Record the confirmed contracts**

Create `docs/superpowers/notes/api-contracts.md` documenting, **from the captured fixtures**:
- DiMu: confirmed search endpoint + the `q`/`fq` that returns photos; the JSON path to hit count; the doc field names for media identifier, title, owner, license, unique id; the image-delivery URL pattern.
- ArcGIS: the confirmed layer URL; the attribute field names for locality id, name, dating, protection/vern, description; the geometry shape (point vs rings).

- [ ] **Step 4: Commit**

```bash
git add test/fixtures/dimu-search.json test/fixtures/arcgis-query.json docs/superpowers/notes/api-contracts.md
git commit -m "test: capture live DiMu + ArcGIS fixtures and document API contracts"
```

---

## Task 4: `lib/dimu.js` — query/URL builders + trim (TDD against fixture)

**Files:**
- Create: `lib/dimu.js`
- Test: `test/dimu.test.mjs`

> Before writing, open `test/fixtures/dimu-search.json` and `docs/superpowers/notes/api-contracts.md`. The field names below are the expected DiMu Solr names; **reconcile every `d['artifact.*']` access and the `numFound` path against the captured fixture** and adjust both the implementation and the assertions to the real shape.

- [ ] **Step 1: Write the failing test**

```js
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

test('searchUrl: includes key, paging, image filter', () => {
  const u = searchUrl('Drammen Engene 16', 1, 'demo', 24);
  assert.match(u, /api\.key=demo/);
  assert.match(u, /start=24/);
  assert.match(u, /rows=24/);
});

test('countUrl: rows=0', () => {
  assert.match(countUrl('Drammen', 'demo'), /rows=0/);
});

test('imageUrl: builds delivery URL with dimension', () => {
  assert.equal(imageUrl('abc', '400x400'), 'https://api.dimu.org/image/abc?dimension=400x400');
});

test('countHits: reads hit count from fixture', () => {
  assert.equal(typeof countHits(fixture), 'number');
  assert.ok(countHits(fixture) >= 1);
});

test('trimPhotos: maps fixture docs to minimal gallery items', () => {
  const photos = trimPhotos(fixture);
  assert.ok(Array.isArray(photos) && photos.length >= 1);
  for (const p of photos) {
    assert.ok(p.thumb.startsWith('https://api.dimu.org/image/'));
    assert.ok(p.full.startsWith('https://api.dimu.org/image/'));
    assert.equal(typeof p.title, 'string');
  }
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test test/dimu.test.mjs`
Expected: FAIL — module not found.

- [ ] **Step 3: Write the implementation**

```js
// lib/dimu.js
const SEARCH_ENDPOINT = 'https://api.dimu.org/api/solr/select';
const IMAGE_ENDPOINT = 'https://api.dimu.org/image';

// Free-text query for a record (fuzzy, address-based). Always scoped to Drammen.
export function buildQuery(record) {
  const place = (record.ad && record.ad.trim()) || (record.be && record.be.trim()) || '';
  return `Drammen ${place}`.replace(/\s+/g, ' ').trim();
}

// Paginated photo search URL. page is 0-based; rows per page default 24.
export function searchUrl(q, page, apiKey, rows = 24) {
  const params = new URLSearchParams({
    q,
    fq: 'artifact.type:Photograph',
    start: String(page * rows),
    rows: String(rows),
    wt: 'json',
    'api.key': apiKey,
  });
  return `${SEARCH_ENDPOINT}?${params.toString()}`;
}

// Count-only query (rows=0) for offline enrichment.
export function countUrl(q, apiKey) {
  return searchUrl(q, 0, apiKey, 0);
}

// Delivery URL for a media identifier at a given pixel dimension.
export function imageUrl(mediaId, dimension = '800x800') {
  return `${IMAGE_ENDPOINT}/${encodeURIComponent(mediaId)}?dimension=${dimension}`;
}

// Hit count from a Solr response.
export function countHits(json) {
  return json?.response?.numFound ?? 0;
}

// Reduce a Solr search response to the minimal gallery payload.
// NOTE: field names reconciled against test/fixtures/dimu-search.json.
export function trimPhotos(json) {
  const docs = json?.response?.docs ?? [];
  return docs
    .map((d) => {
      const mediaId = d['artifact.defaultMediaIdentifier'];
      if (!mediaId) return null;
      return {
        thumb: imageUrl(mediaId, '400x400'),
        full: imageUrl(mediaId, 'max'),
        title: d['artifact.ingress.title'] ?? '',
        owner: d['artifact.ownerName'] ?? '',
        license: d['artifact.licenses'] ?? '',
        dimuUrl: d['artifact.uniqueId'] ? `https://digitaltmuseum.org/${d['artifact.uniqueId']}` : '',
      };
    })
    .filter(Boolean);
}
```

- [ ] **Step 4: Run test to verify it passes** (adjust field paths to the fixture until green)

Run: `node --test test/dimu.test.mjs`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add lib/dimu.js test/dimu.test.mjs
git commit -m "feat(lib): add DigitaltMuseum query builders + response trimming with tests"
```

---

## Task 5: `lib/heritage.js` — WFS BBOX query + GML parse + nearest + trim (TDD against fixture)

**REVISED (Option C):** Kulturminnesøk has no public JSON API. The only open source is the
Geonorge WFS, which returns **GML/XML** (`application/json` is rejected). Heritage detail is
**baked offline** (it's static registry data), so there is NO live heritage endpoint — this
module is used only by the enrichment script. It builds a WFS BBOX query, parses the GML for the
few fields we bake, and picks the nearest locality. Tested against the real raw-GML fixture
`test/fixtures/wfs-lokalitet.xml` (committed).

Confirmed contract (from the fixture): WFS base `https://wfs.geonorge.no/skwms1/wfs.kulturminner`,
type `app:Lokalitet`. Per-feature elements: `app:lokalId` (id, e.g. `327939` or `41474-1`),
`app:navn` (name), `app:vernetype` (e.g. `FPG`/`AUT`), `app:linkKulturminnesøk` (ready-made link),
geometry as `gml:posList` (space-separated `lat lon lat lon …`, EPSG:4326). Baked keys: `km`=id,
`kc`=confidence, `kn`=name, `kv`=vernetype. The kulturminnesok.no link is derivable in the UI from
`km` (`https://kulturminnesok.no/ra/lokalitet/<id-before-any-dash>`), so it is NOT baked.

**Files:**
- Create: `lib/heritage.js`
- Test: `test/heritage.test.mjs`

- [ ] **Step 1: Write the failing test**

```js
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
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test test/heritage.test.mjs`
Expected: FAIL — module not found.

- [ ] **Step 3: Write the implementation**

```js
// lib/heritage.js
import { haversine } from './geo.js';

export const WFS_BASE = 'https://wfs.geonorge.no/skwms1/wfs.kulturminner';
const M_PER_DEG_LAT = 111320; // meters per degree latitude (good enough for small bboxes)

// WFS GetFeature URL for app:Lokalitet within a square ~half meters around (lat, lon).
// EPSG:4326 here uses lat,lon axis order, so bbox = minLat,minLon,maxLat,maxLon.
export function bboxUrl(lat, lon, half = 150) {
  const dLat = half / M_PER_DEG_LAT;
  const dLon = half / (M_PER_DEG_LAT * Math.cos((lat * Math.PI) / 180));
  const bbox = [lat - dLat, lon - dLon, lat + dLat, lon + dLon, 'urn:ogc:def:crs:EPSG::4326'].join(',');
  const params = new URLSearchParams({
    service: 'WFS',
    version: '2.0.0',
    request: 'GetFeature',
    typeNames: 'app:Lokalitet',
    count: '50',
    srsName: 'urn:ogc:def:crs:EPSG::4326',
    bbox,
  });
  return `${WFS_BASE}?${params.toString()}`;
}

const decode = (s) =>
  (s ?? '')
    .replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"').replace(/&#39;/g, "'")
    .trim();

// First inner text of <app:TAG>…</app:TAG> within a block (TAG may contain non-ASCII like ø).
function tag(block, name) {
  const m = block.match(new RegExp(`<app:${name}>([\\s\\S]*?)</app:${name}>`));
  return m ? decode(m[1]) : '';
}

// Parse a WFS GML response into plain feature objects.
export function parseLokaliteter(gml) {
  // Each feature starts at an opening <app:Lokalitet …> tag.
  const blocks = String(gml).split(/<app:Lokalitet[\s>]/).slice(1);
  return blocks.map((b) => {
    const posList = (b.match(/<gml:posList>([\s\S]*?)<\/gml:posList>/) || [])[1] || '';
    const nums = posList.trim().split(/\s+/).map(Number).filter((n) => !Number.isNaN(n));
    const coords = [];
    for (let i = 0; i + 1 < nums.length; i += 2) coords.push([nums[i], nums[i + 1]]); // [lat, lon]
    return {
      id: tag(b, 'lokalId'),
      navn: tag(b, 'navn'),
      informasjon: tag(b, 'informasjon'),
      vernetype: tag(b, 'vernetype'),
      lokalitetskategori: tag(b, 'lokalitetskategori'),
      kommune: tag(b, 'kommune'),
      coords,
    };
  });
}

function centroid(coords) {
  if (!coords?.length) return null;
  let sLat = 0, sLon = 0;
  for (const [la, lo] of coords) { sLat += la; sLon += lo; }
  return [sLat / coords.length, sLon / coords.length];
}

// Nearest feature to (lat, lon) → {feature, dist} in meters, or null.
export function pickNearest(features, lat, lon) {
  let best = null;
  for (const f of features ?? []) {
    const c = centroid(f.coords);
    if (!c) continue;
    const dist = haversine(lat, lon, c[0], c[1]);
    if (!best || dist < best.dist) best = { feature: f, dist };
  }
  return best;
}

// kulturminnesok.no link from a lokalId: 41474-1 -> /41474, 327939 -> /327939.
export function localityLink(id) {
  const num = String(id).split('-')[0];
  return `https://kulturminnesok.no/ra/lokalitet/${num}`;
}

// Reduce a parsed feature to the baked-field payload.
export function trimLocality(feature) {
  const id = feature?.id || '';
  return {
    id,
    name: feature?.navn || '',
    vernetype: feature?.vernetype || '',
    link: localityLink(id),
  };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test test/heritage.test.mjs`
Expected: PASS (5 tests).

- [ ] **Step 5: Commit**

```bash
git add lib/heritage.js test/heritage.test.mjs
git commit -m "feat(lib): add Kulturminnesøk WFS BBOX query + GML parser + nearest-match with tests"
```

---

## Task 6: `lib/data-io.js` — parse/replace the `DATA` block (TDD)

**Files:**
- Create: `lib/data-io.js`
- Test: `test/data-io.test.mjs`

> `DATA` is valid JSON on a single line ending in `];` (verified: `const DATA=[{"ll":[...],"v":"H",...}];`). Parsing is a regex capture + `JSON.parse`; replacement uses a function replacer so `$` in JSON is not interpreted.

- [ ] **Step 1: Write the failing test**

```js
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
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test test/data-io.test.mjs`
Expected: FAIL — module not found.

- [ ] **Step 3: Write the implementation**

```js
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
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test test/data-io.test.mjs`
Expected: PASS (4 tests).

- [ ] **Step 5: Commit**

```bash
git add lib/data-io.js test/data-io.test.mjs
git commit -m "feat(lib): add DATA block parse/replace round-trip with tests"
```

---

## Task 7: `scripts/enrich.mjs` — offline enrichment orchestration

**Files:**
- Create: `scripts/enrich.mjs`
- Verify against: `index.html` (dry-run subset)

This is network orchestration; the testable logic already lives in `lib/`. Verification is a real dry-run on a small subset, not a unit test.

- [ ] **Step 1: Write the script**

```js
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

// Stable id for cache keying: prefer gnr/bnr, else address+betegnelse.
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
  const dq = buildQuery(r);
  try {
    const json = await fetchJson(countUrl(dq, API_KEY));
    const hits = countHits(json);
    result.hp = hits > 0;
    if (hits > 0) result.dq = dq;
    report.push({ id, dq, dimuHits: hits });
  } catch (e) {
    report.push({ id, dq, dimuError: String(e) });
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
```

- [ ] **Step 2: Dry-run on a subset (no file write)**

Run: `node scripts/enrich.mjs --limit 5`
Expected: prints "Dry run (--limit 5); index.html NOT modified"; `scripts/enrich-report.json` exists and contains `dimuHits` and (for records with `ll`) `kmDist`/`kc` entries. Inspect it for sanity.

- [ ] **Step 3: Confirm `.gitignore` excludes working files**

Verify `git status` does NOT list `scripts/enrich-cache.json` or `scripts/enrich-report.json` (already in `.gitignore`).
Expected: only `scripts/enrich.mjs` is untracked/new.

- [ ] **Step 4: Commit the script (not the cache/report)**

```bash
git add scripts/enrich.mjs
git commit -m "feat(scripts): add offline enrichment (hp/dq/km/kc/kn/kv) with cache + report"
```

- [ ] **Step 5: Full enrichment run (writes index.html)**

Run: `node scripts/enrich.mjs` (set `DIMU_API_KEY` if you have a real one; `demo` works for a first pass)
Expected: "Wrote enrichment for N records into index.html". Then `git diff --stat index.html` shows the single DATA line changed.

- [ ] **Step 6: Commit the enriched data**

```bash
git add index.html
git commit -m "data: bake hp/dq/km/kc/kn/kv into DATA via enrichment run"
```

---

## Task 8: `api/photos.js` — DiMu gallery proxy (TDD with stubbed fetch)

**Files:**
- Create: `api/photos.js`
- Test: `test/photos.api.test.mjs`

> Vercel Node functions export a default `(req, res)` handler. Tests invoke it with fake `req`/`res` and a stubbed `globalThis.fetch`.

- [ ] **Step 1: Write the failing test**

```js
// test/photos.api.test.mjs
import { test, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import handler from '../api/photos.js';

const fixture = JSON.parse(readFileSync(new URL('./fixtures/dimu-search.json', import.meta.url)));
const realFetch = globalThis.fetch;
afterEach(() => { globalThis.fetch = realFetch; });

function mockRes() {
  return {
    statusCode: 200, headers: {}, body: null,
    setHeader(k, v) { this.headers[k] = v; },
    status(c) { this.statusCode = c; return this; },
    json(b) { this.body = b; return this; },
  };
}

test('photos: 400 when dq missing', async () => {
  const res = mockRes();
  await handler({ query: {} }, res);
  assert.equal(res.statusCode, 400);
});

test('photos: returns trimmed gallery on success', async () => {
  globalThis.fetch = async () => ({ ok: true, json: async () => fixture });
  const res = mockRes();
  await handler({ query: { dq: 'Drammen Bragernes' } }, res);
  assert.equal(res.statusCode, 200);
  assert.ok(Array.isArray(res.body));
  assert.match(res.headers['Cache-Control'] || '', /s-maxage/);
});

test('photos: 502 on upstream failure', async () => {
  globalThis.fetch = async () => ({ ok: false, status: 500 });
  const res = mockRes();
  await handler({ query: { dq: 'x' } }, res);
  assert.equal(res.statusCode, 502);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test test/photos.api.test.mjs`
Expected: FAIL — module not found.

- [ ] **Step 3: Write the implementation**

```js
// api/photos.js
import { searchUrl, trimPhotos } from '../lib/dimu.js';

export default async function handler(req, res) {
  const dq = (req.query?.dq || '').toString();
  const page = Math.max(0, parseInt(req.query?.page, 10) || 0);
  if (!dq || dq.length > 200) {
    return res.status(400).json({ error: 'missing or invalid dq' });
  }
  const key = process.env.DIMU_API_KEY || 'demo';
  try {
    const r = await fetch(searchUrl(dq, page, key, 24));
    if (!r.ok) return res.status(502).json({ error: `upstream ${r.status}` });
    const json = await r.json();
    res.setHeader('Cache-Control', 's-maxage=86400, stale-while-revalidate');
    return res.status(200).json(trimPhotos(json));
  } catch (e) {
    return res.status(502).json({ error: 'upstream fetch failed' });
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test test/photos.api.test.mjs`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add api/photos.js test/photos.api.test.mjs
git commit -m "feat(api): add DiMu photos proxy with validation, caching, error mapping + tests"
```

---

## Task 9: ~~`api/heritage.js` — Kulturminnesøk detail proxy~~ — REMOVED (Option C)

**This task is intentionally dropped.** Investigation during Task 3 established that Kulturminnesøk
has no public JSON API (WFS is GML-only; the ArcGIS REST service is decommissioned). Because heritage
registry data is *static*, the chosen design (Option C) bakes the heritage match (`km`/`kc`/`kn`/`kv`)
into `DATA` during enrichment (Task 7) and links out to kulturminnesok.no for the full record. There
is therefore **no live heritage endpoint** — `api/photos.js` (Task 8) is the only serverless function.

Nothing to implement. Proceed to Task 10.

---

## Task 10: Docs + full test sweep + deploy verification

**Files:**
- Create: `.env.example`
- Create: `README.md`

- [ ] **Step 1: Create `.env.example`**

```bash
# DigitaltMuseum API key. "demo" works for testing; request your own for production.
# Set in Vercel: Project → Settings → Environment Variables.
DIMU_API_KEY=demo
```

- [ ] **Step 2: Create `README.md`**

```markdown
# Drammen kulturminner

Interactive Leaflet map of registered cultural-heritage objects in Drammen, with
photos (DigitaltMuseum, live) and heritage matches (Kulturminnesøk, baked).

## Run locally
Open `index.html` in a browser. The map, filters, and baked data (incl. the
heritage match + link-out) work offline; only the live photo gallery needs the
`api/` function (i.e. on Vercel or `vercel dev`).

## Tests
`npm test`  (Node's built-in runner; no dependencies)

## Re-run enrichment
Bakes `hp`/`dq`/`km`/`kc`/`kn`/`kv` into `index.html`'s `DATA`:
`DIMU_API_KEY=<key> npm run enrich`     (use `--limit N` for a dry run)

## Deploy (Vercel)
1. Import the GitHub repo at vercel.com, or run `vercel` from this folder.
2. Set `DIMU_API_KEY` in Project → Settings → Environment Variables.
3. `index.html` is served statically; `api/photos.js` becomes a serverless function.
```

- [ ] **Step 3: Full test sweep**

Run: `npm test`
Expected: all suites PASS (geo, dimu, heritage, data-io, photos.api).

- [ ] **Step 4: Local serverless smoke test (optional but recommended)**

Run: `npx vercel dev` then in another shell:
`curl "http://localhost:3000/api/photos?dq=Drammen+Bragernes"` → JSON array
(Heritage needs no endpoint — it's baked; verify a baked `km`/`kn`/`kv` exists in `index.html` after enrichment.)

- [ ] **Step 5: Commit + push**

```bash
git add .env.example README.md CLAUDE.md
git commit -m "docs: add README, .env.example; document backend + enrichment"
git push
```

---

## Self-Review (updated after the Option C revision)

**Spec coverage:**
- Vercel + thin proxy → Tasks 1, 8, 10 (photos is the only function). ✓
- `hp`/`dq`/`km`/`kc`/`kn`/`kv` data model → Tasks 4, 5, 7 (all baked); consumed in Plan 2. ✓
- Offline enrichment (DiMu count + heritage WFS spatial, concurrency, retry, cache, report, idempotent) → Task 7. ✓
- DiMu key server-side, `demo` fallback → Tasks 7, 8, 10. ✓
- Spatial confidence bands 25/75/150 → Task 2. ✓
- Heritage source decision (no public JSON API) → resolved as Option C: bake match + link out; Task 9 removed. ✓
- Graceful local degradation → documented (README Task 10); UI behavior is Plan 2. ✓
- **Deferred to Plan 2 (UI):** detail side-panel, "has photo" filter + marker ring, `obj=` deep-link, mobile bottom-sheet. Intentional split.

**Placeholder scan:** No unresolved fill-ins. All API specifics are now pinned to real captured fixtures (`test/fixtures/dimu-search.json`, `test/fixtures/wfs-lokalitet.xml`); the synthetic ArcGIS JSON fixture was removed.

**Type consistency:** `parseData`/`replaceData`; `buildQuery`/`searchUrl`/`countUrl`/`countHits`/`trimPhotos`; heritage `bboxUrl`/`parseLokaliteter` (→ `{id,navn,vernetype,coords,…}`)/`pickNearest` (→ `{feature,dist}`)/`trimLocality` (→ `{id,name,vernetype,link}`)/`localityLink`; `confidenceBand` → `'h'|'m'|'l'|null`. Enrichment maps `trimLocality` output to baked keys `km`(id)/`kn`(name)/`kv`(vernetype) plus `kc` from `confidenceBand`. Names/shapes are consistent across `lib/`, the enrichment script, and `api/photos.js`.

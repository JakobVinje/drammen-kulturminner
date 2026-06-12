# Walking Tours — Foundation Plan (Plan 1 of 2)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the data + backend layer for walking tours — pure, unit-tested tour logic (`lib/tours.js`), route helpers (`lib/route.js`), a Vercel routing proxy (`api/route.js`) to OpenRouteService, a real ORS fixture, seeded curated `TOURS`, and docs — so the tour UI (Plan 2) has working tour definitions and a `/api/route` endpoint to consume.

**Architecture:** Approach mirrors the prior foundation: pure logic in `lib/` tested with Node's built-in runner (zero runtime deps), a thin serverless proxy holding the API key, edge-cached. Tours are unified as `{id, title, intro, stops:[<DATA index>…]}`; curated tours are baked into `index.html`, auto tours are generated client-side from `kulturmiljø`. The route line is fetched live from ORS through the proxy and edge-cached (a tour's coordinates never change).

**Tech Stack:** Node.js ESM, `node --test`, Vercel serverless functions, OpenRouteService Directions API (`foot-walking`). No bundler, no runtime dependencies.

**Spec:** `docs/superpowers/specs/2026-06-12-walking-tours-design.md`
**Prior foundation (reference for patterns):** `docs/superpowers/plans/2026-06-11-kulturminner-foundation.md`

**Scope note:** Plan 1 of 2. The tour UI (selector, focus mode, list + Prev/Next player, numbered pins, route rendering + fallback, deep-link, mobile) is Plan 2, written after this executes.

---

## File Structure

| Path | Responsibility |
|------|----------------|
| `lib/route.js` | Pure: `parseCoords`, `orsBody` (lat,lon→lon,lat swap), `parseRoute` (ORS geojson → `{line,distance,duration}`), `ORS_ENDPOINT`. |
| `lib/tours.js` | Pure: `nearestNeighbourOrder`, `buildAutoTours`, `resolveStops`. Depends on `lib/geo.js` (`haversine`). |
| `api/route.js` | Serverless GET proxy → ORS `foot-walking`; `ORS_API_KEY` server-side; validation; edge-cache. |
| `test/route.test.mjs`, `test/tours.test.mjs`, `test/route.api.test.mjs` | Unit tests. |
| `test/fixtures/ors-route.json` | ORS geojson fixture (documented schema; reconciled live at verify). |
| `index.html` | Adds a `TOURS` const (seeded curated tours). NOT the `DATA` line (line 64). |
| `.env.example`, `README.md` | Document `ORS_API_KEY`. |

**`index.html` rule (Task 5 only):** line 64 (`const DATA=[...]`, ~496 KB) is NEVER read or edited. Read only the ranges you edit (the const block ~65–80) via offset/limit; use targeted `Edit`.

**Per-task baseline:** `npm test` (currently 27 passing) must stay green; new tests add to it.

---

## Task 1: `lib/route.js` — coord parsing, ORS body, route parsing (TDD)

**Files:**
- Create: `lib/route.js`, `test/route.test.mjs`, `test/fixtures/ors-route.json`

- [ ] **Step 1: Create the ORS fixture** (documented `foot-walking/geojson` schema; a real call is reconciled during verification)

```json
{"type":"FeatureCollection","features":[{"type":"Feature","properties":{"summary":{"distance":1234.5,"duration":890.1}},"geometry":{"type":"LineString","coordinates":[[10.2049,59.7458],[10.2055,59.7461],[10.2061,59.7466]]}}],"metadata":{"query":{"profile":"foot-walking"}}}
```

- [ ] **Step 2: Write the failing test**

```js
// test/route.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { parseCoords, orsBody, parseRoute, ORS_ENDPOINT } from '../lib/route.js';

const fx = JSON.parse(readFileSync(new URL('./fixtures/ors-route.json', import.meta.url)));

test('parseCoords: parses "lat,lon;lat,lon" to [[lat,lon]]', () => {
  assert.deepEqual(parseCoords('59.74,10.20;59.75,10.21'), [[59.74, 10.20], [59.75, 10.21]]);
});

test('parseCoords: rejects non-numeric and out-of-range', () => {
  assert.throws(() => parseCoords('abc,10'));
  assert.throws(() => parseCoords('200,10'));
  assert.throws(() => parseCoords('59,500'));
});

test('parseCoords: empty -> empty array', () => {
  assert.deepEqual(parseCoords(''), []);
});

test('orsBody: swaps to [lon,lat]', () => {
  assert.deepEqual(orsBody([[59.74, 10.20], [59.75, 10.21]]), { coordinates: [[10.20, 59.74], [10.21, 59.75]] });
});

test('parseRoute: geojson -> {line:[[lat,lon]], distance, duration}', () => {
  const r = parseRoute(fx);
  assert.deepEqual(r.line[0], [59.7458, 10.2049]);
  assert.equal(r.line.length, 3);
  assert.equal(r.distance, 1234.5);
  assert.equal(r.duration, 890.1);
});

test('parseRoute: missing/empty geojson is safe', () => {
  const r = parseRoute({});
  assert.deepEqual(r.line, []);
  assert.equal(r.distance, null);
  assert.equal(r.duration, null);
});

test('ORS_ENDPOINT is the foot-walking geojson endpoint', () => {
  assert.match(ORS_ENDPOINT, /directions\/foot-walking\/geojson$/);
});
```

- [ ] **Step 3: Run test to verify it fails**

Run: `node --test test/route.test.mjs`
Expected: FAIL — `Cannot find module '../lib/route.js'`.

- [ ] **Step 4: Write the implementation**

```js
// lib/route.js
export const ORS_ENDPOINT = 'https://api.openrouteservice.org/v2/directions/foot-walking/geojson';

// Parse "lat,lon;lat,lon;..." into [[lat,lon],...]. Throws on any invalid pair.
export function parseCoords(param) {
  const pairs = String(param ?? '').split(';').map((s) => s.trim()).filter(Boolean);
  return pairs.map((p) => {
    const [la, lo] = p.split(',').map(Number);
    if (!Number.isFinite(la) || !Number.isFinite(lo) || la < -90 || la > 90 || lo < -180 || lo > 180) {
      throw new Error('invalid coord: ' + p);
    }
    return [la, lo];
  });
}

// ORS expects [lon,lat]; our coords are [lat,lon].
export function orsBody(coords) {
  return { coordinates: coords.map(([la, lo]) => [lo, la]) };
}

// ORS foot-walking geojson -> {line:[[lat,lon],...], distance(m), duration(s)}.
export function parseRoute(geojson) {
  const f = geojson?.features?.[0];
  const coords = f?.geometry?.coordinates ?? [];
  const sum = f?.properties?.summary ?? {};
  return {
    line: coords.map(([lo, la]) => [la, lo]),
    distance: sum.distance ?? null,
    duration: sum.duration ?? null,
  };
}
```

- [ ] **Step 5: Run test to verify it passes**

Run: `node --test test/route.test.mjs`
Expected: PASS (7 tests).

- [ ] **Step 6: Commit**

```bash
git add lib/route.js test/route.test.mjs test/fixtures/ors-route.json
git commit -m "feat(lib): add ORS route helpers (parseCoords/orsBody/parseRoute) with tests"
```

---

## Task 2: `lib/tours.js` — nearest-neighbour order, auto tours, resolve (TDD)

**Files:**
- Create: `lib/tours.js`, `test/tours.test.mjs`

- [ ] **Step 1: Write the failing test**

```js
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
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test test/tours.test.mjs`
Expected: FAIL — module not found.

- [ ] **Step 3: Write the implementation**

```js
// lib/tours.js
import { haversine } from './geo.js';

// Greedy nearest-neighbour ordering of items (each has .ll=[lat,lon]) from startIndex.
export function nearestNeighbourOrder(items, startIndex = 0) {
  const remaining = items.slice();
  if (remaining.length <= 1) return remaining;
  const order = [remaining.splice(startIndex, 1)[0]];
  while (remaining.length) {
    const [lat, lon] = order[order.length - 1].ll;
    let bi = 0, bd = Infinity;
    for (let i = 0; i < remaining.length; i++) {
      const d = haversine(lat, lon, remaining[i].ll[0], remaining[i].ll[1]);
      if (d < bd) { bd = d; bi = i; }
    }
    order.push(remaining.splice(bi, 1)[0]);
  }
  return order;
}

// Per-kulturmiljø auto tours: {id,title,intro,stops:[DATA index,...]}.
export function buildAutoTours(DATA, { minStops = 4, maxStops = 20 } = {}) {
  const groups = new Map(); // mi -> [{idx, ll}]
  DATA.forEach((r, idx) => {
    const mi = r.mi;
    if (!mi || mi === '(uten miljø)' || !Array.isArray(r.ll)) return;
    if (!groups.has(mi)) groups.set(mi, []);
    groups.get(mi).push({ idx, ll: r.ll });
  });
  const tours = [];
  for (const [mi, items] of groups) {
    if (items.length < minStops) continue;
    // Deterministic start: sort by lat then lon, then nearest-neighbour from index 0.
    items.sort((a, b) => a.ll[0] - b.ll[0] || a.ll[1] - b.ll[1]);
    const ordered = nearestNeighbourOrder(items, 0).slice(0, maxStops);
    tours.push({ id: 'mi:' + mi, title: mi, intro: 'Kulturmiljø «' + mi + '» — ' + ordered.length + ' stopp.', stops: ordered.map((o) => o.idx) });
  }
  tours.sort((a, b) => a.title.localeCompare(b.title, 'no'));
  return tours;
}

// Resolve a tour's stop indices to records, skipping missing/no-ll (warns).
export function resolveStops(tour, DATA) {
  const out = [];
  for (const idx of tour.stops || []) {
    const r = DATA[idx];
    if (!r || !Array.isArray(r.ll)) { console.warn('tour stop skipped:', tour.id, idx); continue; }
    out.push(r);
  }
  return out;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test test/tours.test.mjs`
Expected: PASS (5 tests).

- [ ] **Step 5: Commit**

```bash
git add lib/tours.js test/tours.test.mjs
git commit -m "feat(lib): add tour logic (nearest-neighbour order, auto tours, resolve) with tests"
```

---

## Task 3: `api/route.js` — ORS proxy (TDD with stubbed fetch)

**Files:**
- Create: `api/route.js`, `test/route.api.test.mjs`

- [ ] **Step 1: Write the failing test**

```js
// test/route.api.test.mjs
import { test, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import handler from '../api/route.js';

const fx = JSON.parse(readFileSync(new URL('./fixtures/ors-route.json', import.meta.url)));
const realFetch = globalThis.fetch;
const realKey = process.env.ORS_API_KEY;
afterEach(() => { globalThis.fetch = realFetch; if (realKey === undefined) delete process.env.ORS_API_KEY; else process.env.ORS_API_KEY = realKey; });

function mockRes() {
  return {
    statusCode: 200, headers: {}, body: null,
    setHeader(k, v) { this.headers[k] = v; },
    status(c) { this.statusCode = c; return this; },
    json(b) { this.body = b; return this; },
  };
}

test('route: 400 on missing/invalid coords', async () => {
  process.env.ORS_API_KEY = 'k';
  const res = mockRes();
  await handler({ query: {} }, res);
  assert.equal(res.statusCode, 400);
});

test('route: 400 when fewer than 2 coords', async () => {
  process.env.ORS_API_KEY = 'k';
  const res = mockRes();
  await handler({ query: { coords: '59.74,10.20' } }, res);
  assert.equal(res.statusCode, 400);
});

test('route: 502 when key missing', async () => {
  delete process.env.ORS_API_KEY;
  const res = mockRes();
  await handler({ query: { coords: '59.74,10.20;59.75,10.21' } }, res);
  assert.equal(res.statusCode, 502);
});

test('route: 200 returns {line,distance,duration} + cache header', async () => {
  process.env.ORS_API_KEY = 'k';
  let sentBody = null;
  globalThis.fetch = async (_url, opts) => { sentBody = JSON.parse(opts.body); return { ok: true, json: async () => fx }; };
  const res = mockRes();
  await handler({ query: { coords: '59.7458,10.2049;59.7466,10.2061' } }, res);
  assert.equal(res.statusCode, 200);
  assert.deepEqual(res.body.line[0], [59.7458, 10.2049]);
  assert.equal(res.body.distance, 1234.5);
  assert.match(res.headers['Cache-Control'] || '', /s-maxage/);
  // verify the proxy swapped to [lon,lat] for ORS
  assert.deepEqual(sentBody.coordinates[0], [10.2049, 59.7458]);
});

test('route: 502 on upstream failure', async () => {
  process.env.ORS_API_KEY = 'k';
  globalThis.fetch = async () => ({ ok: false, status: 500 });
  const res = mockRes();
  await handler({ query: { coords: '59.74,10.20;59.75,10.21' } }, res);
  assert.equal(res.statusCode, 502);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test test/route.api.test.mjs`
Expected: FAIL — module not found.

- [ ] **Step 3: Write the implementation**

```js
// api/route.js
import { ORS_ENDPOINT, parseCoords, orsBody, parseRoute } from '../lib/route.js';

const MAX_WAYPOINTS = 25;

export default async function handler(req, res) {
  let coords;
  try { coords = parseCoords(req.query?.coords); }
  catch { return res.status(400).json({ error: 'invalid coords' }); }
  if (coords.length < 2) return res.status(400).json({ error: 'need at least 2 coords' });
  if (coords.length > MAX_WAYPOINTS) coords = coords.slice(0, MAX_WAYPOINTS);

  const key = process.env.ORS_API_KEY;
  if (!key) return res.status(502).json({ error: 'routing not configured' });

  try {
    const r = await fetch(ORS_ENDPOINT, {
      method: 'POST',
      headers: { Authorization: key, 'Content-Type': 'application/json' },
      body: JSON.stringify(orsBody(coords)),
    });
    if (!r.ok) return res.status(502).json({ error: `upstream ${r.status}` });
    const json = await r.json();
    res.setHeader('Cache-Control', 's-maxage=604800, stale-while-revalidate=86400');
    return res.status(200).json(parseRoute(json));
  } catch {
    return res.status(502).json({ error: 'upstream fetch failed' });
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test test/route.api.test.mjs`
Expected: PASS (5 tests).

- [ ] **Step 5: Commit**

```bash
git add api/route.js test/route.api.test.mjs
git commit -m "feat(api): add ORS walking-route proxy with validation, caching, error mapping + tests"
```

---

## Task 4: Seed curated `TOURS` in `index.html`

Curated tours are concrete and reproducible: each is the located records nearest an anchor point, nearest-neighbour ordered, with editorial intro text. This guarantees real, working stops with no subjective guessing. (More tours are added later by editing the array.)

**Files:**
- Modify: `index.html` (add a `const TOURS=[...]` after the kulturmiljø-colour block, ~line 73). NEVER touch line 64.

- [ ] **Step 1: Compute reproducible curated stop indices**

Run this helper (prints DATA indices for two anchor-based tours):

```bash
node -e '
const { parseData } = await import("./lib/data-io.js");
const { nearestNeighbourOrder } = await import("./lib/tours.js");
const { haversine } = await import("./lib/geo.js");
const fs = await import("node:fs");
const DATA = parseData(fs.readFileSync("index.html","utf8"));
function nearest(anchor, radius, n){
  const items = DATA.map((r,idx)=>({idx,ll:r.ll,be:r.be})).filter(o=>Array.isArray(o.ll));
  const near = items.filter(o=>haversine(anchor[0],anchor[1],o.ll[0],o.ll[1])<=radius);
  near.sort((a,b)=>haversine(anchor[0],anchor[1],a.ll[0],a.ll[1])-haversine(anchor[0],anchor[1],b.ll[0],b.ll[1]));
  return nearestNeighbourOrder(near.slice(0,n),0);
}
const bragernes = nearest([59.7440,10.2050], 500, 8);
const stromso   = nearest([59.7385,10.1990], 500, 8);
console.log("Bragernes:", JSON.stringify(bragernes.map(o=>o.idx)));
console.log("  titles:", bragernes.map(o=>o.be));
console.log("Strømsø:", JSON.stringify(stromso.map(o=>o.idx)));
console.log("  titles:", stromso.map(o=>o.be));
'
```

Note the two index arrays it prints (e.g. `[12, 45, …]`). If either anchor yields fewer than 4 stops, widen the radius to 800 and re-run.

- [ ] **Step 2: Add the `TOURS` const to `index.html`**

Read lines ~70–74 to anchor the edit. After the kulturmiljø colour line:
```js
const MIcol={}; MIorder.forEach((k,i)=>MIcol[k]= k==="(uten miljø)"?"#dddddd":PAL[i%PAL.length]);
```
Insert (replacing `<BRAGERNES_INDICES>`/`<STROMSO_INDICES>` with the arrays printed in Step 1):
```js
// ---- curated walking tours (hand-seeded; stop = DATA index) ----
const TOURS=[
 {id:"bragernes",title:"Bragernes sentrum",intro:"En rusletur i Bragernes' eldre bykjerne, fra elvefronten opp mot torget. Verneverdig trehus- og murbebyggelse.",stops:<BRAGERNES_INDICES>},
 {id:"stromso",title:"Strømsø rundt",intro:"Strømsø-siden av Drammen: kirkested, gateløp og bygårder fra 1800-tallet.",stops:<STROMSO_INDICES>}
];
```

- [ ] **Step 3: Verify the curated tours resolve to real stops**

```bash
node -e '
const { parseData } = await import("./lib/data-io.js");
const fs = await import("node:fs");
const h = fs.readFileSync("index.html","utf8");
const DATA = parseData(h);
const m = h.match(/const TOURS=(\[[\s\S]*?\]);/);
if(!m){ console.error("TOURS not found"); process.exit(1); }
const TOURS = JSON.parse(m[1].replace(/(\w+):/g, "\"$1\":")); // keys are simple idents
for(const t of TOURS){
  const ok = t.stops.every(i=>DATA[i] && Array.isArray(DATA[i].ll));
  console.log(t.id, "stops:", t.stops.length, ok ? "all valid+located" : "HAS INVALID");
}
'
```
Expected: each tour reports ≥4 stops, "all valid+located".

> If the regex/JSON parse is awkward (single-quoted strings/idents), it is acceptable to instead manually confirm each index in the printed arrays exists in `DATA` and has `ll` — the Step 1 helper already selected only located records, so they are valid by construction.

- [ ] **Step 4: Syntax check + tests + commit**

Run the inline-script syntax check:
```bash
node -e "const fs=require('fs');const h=fs.readFileSync('index.html','utf8');const m=h.match(/<script>([\s\S]*?)<\/script><\/body>/);if(!m){process.exit(1)}fs.writeFileSync('.tmp-app.js',m[1]);" && node --check .tmp-app.js && echo SYNTAX_OK && rm -f .tmp-app.js
```
Then `npm test` — expect 44 passing (prior 27 + route 7 + tours 5 + route.api 5); Task 4 adds no tests. Confirm all green.
```bash
git add index.html
git commit -m "feat: seed two curated walking tours (Bragernes, Strømsø) into index.html"
```

---

## Task 5: Docs + full sweep + push

**Files:**
- Modify: `.env.example`, `README.md`

- [ ] **Step 1: Add `ORS_API_KEY` to `.env.example`**

Append:
```bash
# OpenRouteService API key for walking-route generation (free: openrouteservice.org).
# Without it, /api/route returns 502 and the UI falls back to straight dashed lines.
ORS_API_KEY=
```

- [ ] **Step 2: Document tours in `README.md`**

Under the existing content, add:
```markdown
## Walking tours
Curated tours are the `TOURS` array in `index.html`; per-kulturmiljø tours are
generated automatically at load. Route lines come from `/api/route` (OpenRouteService
`foot-walking`); set `ORS_API_KEY` in Vercel env. Without a key, tours still render
with straight dashed fallback lines.
```

- [ ] **Step 3: Full test sweep**

Run: `npm test`
Expected: all suites pass — prior 27 + route(7) + tours(5) + route.api(5) = **44 tests**, 0 fail.

- [ ] **Step 4: Real ORS smoke check (only if you have a key; else note skipped)**

```bash
ORS_API_KEY=<key> node -e '
import("./api/route.js").then(async ({default:h})=>{
  const res={statusCode:200,headers:{},setHeader(k,v){this.headers[k]=v},status(c){this.statusCode=c;return this},json(b){this.body=b;return this}};
  await h({query:{coords:"59.7458,10.2049;59.7466,10.2061"}},res);
  console.log(res.statusCode, JSON.stringify(res.body).slice(0,160));
});'
```
Expected (with a valid key): `200 {"line":[[59.74...],...],"distance":...}`. This reconciles the fixture against the live ORS schema. No key → expect `502 routing not configured` (already covered by unit tests).

- [ ] **Step 5: Commit + push**

```bash
git add .env.example README.md
git commit -m "docs: document walking tours + ORS_API_KEY"
git push
```

---

## Self-Review (completed during planning)

**Spec coverage:**
- `lib/tours.js` (nearest-neighbour, auto tours min4/max20/exclude-empty, resolveStops) → Task 2. ✓
- `lib/route.js` (parseCoords, orsBody swap, parseRoute) → Task 1. ✓
- `api/route.js` (GET coords, ORS foot-walking POST, key server-side, waypoint cap 25, 400/502, edge cache) → Task 3. ✓
- Real ORS fixture → Task 1 (schema-based) + reconciled live in Task 5 Step 4. ✓
- Seed 2–3 curated `TOURS` → Task 4 (two reproducible anchor-based tours; more added later). ✓
- `.env.example` + README for `ORS_API_KEY` → Task 5. ✓
- **Deferred to Plan 2 (UI):** tour selector, focus mode, list + Prev/Next player, numbered pins, route rendering + straight-line fallback, `tour=`/`stop=` deep-link, mobile. Intentional split.

**Placeholder scan:** The only fill-ins are the two curated index arrays in Task 4, which Step 1 computes deterministically from real data before they're written — concrete, not a TODO. The ORS fixture is the documented schema, reconciled live in Task 5.

**Type consistency:** Tour shape `{id,title,intro,stops:[index]}` is identical for curated (Task 4) and auto (`buildAutoTours`, Task 2); `resolveStops` consumes `stops` indices. `parseRoute` returns `{line,distance,duration}` — consumed identically by `api/route.js` (Task 3) and asserted in its test. `parseCoords`→`[[lat,lon]]`, `orsBody`→`{coordinates:[[lon,lat]]}` swap is asserted in both the lib test and the proxy test (`sentBody.coordinates[0]`).

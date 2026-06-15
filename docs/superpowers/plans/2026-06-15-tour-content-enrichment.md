# Tour Content Enrichment — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development. Steps use checkbox (`- [ ]`) syntax.

**Goal:** Add a per-stop "Om stedet" description to the map's detail panel — a templated fact-summary for every object, and hand-written notes for curated-tour stops.

**Architecture:** Pure `summarize(r)` + an extended `resolveStops` (returning aligned `{recs, notes}`) go in `lib/tours.js` (tested with `node --test`) and are **mirrored inline** in `index.html` (the file can't import modules on `file://`). `openDetail` resolves the best description (curated note → templated summary) and renders an "Om stedet" section. Shows in tour mode and normal detail alike.

**Tech Stack:** Vanilla JS/CSS + Node ESM `node --test`. Dependency-free, no build step.

**Spec:** `docs/superpowers/specs/2026-06-15-tour-content-enrichment-design.md`

---

## Working-with-the-file rules (EVERY task touching index.html)

- `index.html` **line 103** is `const DATA=[...]` (~496 KB) — NEVER read or edit it. Read only the ranges you edit (CSS ~8–72, app script ~104–365) via offset/limit; anchor edits on code content (line numbers shift between tasks), use targeted `Edit`.
- **Syntax check** (must print `SYNTAX_OK`):
```bash
node -e "const fs=require('fs');const h=fs.readFileSync('index.html','utf8');const m=h.match(/<script>([\s\S]*?)<\/script><\/body>/);if(!m){process.exit(1)}fs.writeFileSync('.tmp-app.js',m[1]);" && node --check .tmp-app.js && echo SYNTAX_OK && rm -f .tmp-app.js
```
- `npm test` baseline is **44 passing**; Task 1 adds tests (→ ~50).

---

## File Structure

| Unit | Change |
|------|--------|
| `lib/tours.js` | Add pure `summarize(r)`; change `resolveStops(tour,DATA)` to return `{recs, notes}` (handles bare-index + `{i,note}` entries, skips bad indices keeping alignment). |
| `test/tours.test.mjs` | Add `summarize` cases; update the `resolveStops` test to the new `{recs,notes}` shape. |
| `index.html` | Inline-mirror `summarize`; replace inline `resolveStops`; add `tourNotes` state + build it in `enterTour`; description resolver + "Om stedet" section in `openDetail`; `.omtekst` CSS; rewrite the curated `TOURS` with `{i,note}` stops + new intros (+ retitle the Marienlyst tour). |

---

## Task 1: `lib/tours.js` — `summarize` + `resolveStops` → `{recs, notes}`

**Files:** Modify `lib/tours.js`; modify `test/tours.test.mjs`.

- [ ] **Step 1: Update the failing tests.** In `test/tours.test.mjs`, add an import of `summarize` (extend the existing import line `import { nearestNeighbourOrder, buildAutoTours, resolveStops } from '../lib/tours.js';` → add `, summarize`). Add these tests, and REPLACE the existing `resolveStops` test:

```js
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
```

(Delete the old `resolveStops: maps indices to records, skips missing/no-ll` test — the new one supersedes it.)

- [ ] **Step 2: Run tests, verify the new ones fail**

Run: `node --test test/tours.test.mjs`
Expected: FAIL — `summarize` is not exported / old `resolveStops` returns an array (the new assertions throw).

- [ ] **Step 3: Implement.** In `lib/tours.js`: add `summarize` (e.g. near the top after the `haversine` import) and REPLACE the existing `resolveStops` function:

```js
const STYLE_SKIP = new Set(['', 'Uoppgitt', 'Ubestemt']);
const VERDILAB = { S:'Svært høy verneverdi', H:'Høy verneverdi', M:'Middels verneverdi', L:'Lav verneverdi' };

// Readable Norwegian fact-sentence from a record's own fields. '' if nothing meaningful.
export function summarize(r){
  if(!r) return '';
  const base = ((r.f||r.kat||'')+'').trim();
  let s = base ? base.charAt(0).toUpperCase()+base.slice(1) : '';
  const stil = ((r.sn||'')+'').trim();
  if(s && stil && !STYLE_SKIP.has(stil)) s += ' i '+stil.toLowerCase();
  const yr = ((r.ar||'')+'').trim() || (r.y!=null ? String(r.y) : '');
  if(s && yr) s += ', oppført '+yr;
  if(s) s += '.';
  const vlab = VERDILAB[r.v];
  if(vlab) s += (s?' ':'')+vlab+'.';
  if(r.fr) s += (s?' ':'')+'Fredet.';
  return s.trim();
}

// Resolve a tour's stops (bare index OR {i,note}) to aligned {recs, notes}; skip missing/no-ll.
export function resolveStops(tour, DATA){
  const recs=[], notes=[];
  for(const s of (tour.stops||[])){
    const idx = (s && typeof s==='object') ? s.i : s;
    const note = (s && typeof s==='object') ? (s.note||null) : null;
    const r = DATA[idx];
    if(r && Array.isArray(r.ll)){ recs.push(r); notes.push(note); }
  }
  return { recs, notes };
}
```

- [ ] **Step 4: Run tests, verify pass**

Run: `node --test` (full suite)
Expected: all pass (prior 44 minus the 1 replaced resolveStops test + the new summarize/resolveStops tests ≈ **50**, 0 fail).

- [ ] **Step 5: Commit**

```bash
git add lib/tours.js test/tours.test.mjs
git commit -m "feat(lib): add summarize() + resolveStops {recs,notes} with tests"
```

---

## Task 2: `index.html` — wire the "Om stedet" description

**File:** `index.html` (CSS ~8–72; inline tour logic, `enterTour`, `openDetail` in the app script).

- [ ] **Step 1: Add CSS** — before `</style>` (line ~72):
```css
 .omtekst{font-size:13px;color:#333;line-height:1.45;margin:2px 0}
```

- [ ] **Step 2: Inline-mirror `summarize`.** Find the inline `resolveStops` (added in the tours UI work):
```js
function resolveStops(t){const out=[];for(const i of (t.stops||[])){const r=DATA[i];if(r&&Array.isArray(r.ll))out.push(r);}return out;}
```
Replace it with the new resolver (aligned `{recs,notes}`, bare + `{i,note}`) **plus** an inline `summarize` (mirrors `lib/tours.js`; uses the in-scope `VERDI` map, whose `.l` labels equal `VERDILAB`):
```js
function resolveStops(t){const recs=[],notes=[];for(const s of (t.stops||[])){const idx=(s&&typeof s==='object')?s.i:s;const note=(s&&typeof s==='object')?(s.note||null):null;const r=DATA[idx];if(r&&Array.isArray(r.ll)){recs.push(r);notes.push(note);}}return{recs,notes};}
const STYLE_SKIP=new Set(['','Uoppgitt','Ubestemt']);
function summarize(r){if(!r)return '';const base=((r.f||r.kat||'')+'').trim();let s=base?base.charAt(0).toUpperCase()+base.slice(1):'';const stil=((r.sn||'')+'').trim();if(s&&stil&&!STYLE_SKIP.has(stil))s+=' i '+stil.toLowerCase();const yr=((r.ar||'')+'').trim()||(r.y!=null?String(r.y):'');if(s&&yr)s+=', oppført '+yr;if(s)s+='.';const vlab=(VERDI[r.v]||{}).l;if(vlab)s+=(s?' ':'')+vlab+'.';if(r.fr)s+=(s?' ':'')+'Fredet.';return s.trim();}
```

- [ ] **Step 3: Add `tourNotes` state + build it in `enterTour`.** Find:
```js
let activeTour=null, tourStops=[], tourIdx=0;
```
Replace with:
```js
let activeTour=null, tourStops=[], tourIdx=0, tourNotes=[];
```
Then in `enterTour`, find:
```js
  activeTour=t; tourStops=resolveStops(t); tourIdx=0;
```
Replace with:
```js
  activeTour=t; const _rs=resolveStops(t); tourStops=_rs.recs; tourNotes=_rs.notes; tourIdx=0;
```

- [ ] **Step 4: Add the "Om stedet" section in `openDetail`.** Find the current `openDetail` body (it builds `inTour`/`stepper`, then `$('detbody').innerHTML=stepper+'<h2>'…`). Insert a `desc` computation and an "Om stedet" block after the `.detsub` line. Replace:
```js
  const inTour=activeTour&&tourStops[tourIdx]===r;
  const stepper=inTour?'<div class="tourstep"><button id="tprev">‹ Forrige</button><span>'+(tourIdx+1)+' / '+tourStops.length+'</span><button id="tnext">Neste ›</button></div>':'';
  $('detbody').innerHTML=stepper+'<h2>'+esc(r.be||r.f||r.ad||(r.g+'/'+r.bn))+'</h2>'
    +'<p class="detsub">'+esc(r.ad||'')+'</p>'
    +'<div class="detsec"><h3>Foto</h3><div id="detphotos">—</div></div>'
```
with:
```js
  const inTour=activeTour&&tourStops[tourIdx]===r;
  const stepper=inTour?'<div class="tourstep"><button id="tprev">‹ Forrige</button><span>'+(tourIdx+1)+' / '+tourStops.length+'</span><button id="tnext">Neste ›</button></div>':'';
  const note=inTour?tourNotes[tourIdx]:null; const desc=note||summarize(r);
  $('detbody').innerHTML=stepper+'<h2>'+esc(r.be||r.f||r.ad||(r.g+'/'+r.bn))+'</h2>'
    +'<p class="detsub">'+esc(r.ad||'')+'</p>'
    +(desc?'<div class="detsec"><h3>Om stedet</h3><div class="omtekst">'+esc(desc)+'</div></div>':'')
    +'<div class="detsec"><h3>Foto</h3><div id="detphotos">—</div></div>'
```

- [ ] **Step 5: Verify + commit.** Syntax check → `SYNTAX_OK`. `npm test` → ~50 pass. Grep-confirm: `function summarize`, `tourNotes`, `Om stedet`, `_rs.recs`. Browser: click any normal marker → "Om stedet" shows a fact sentence; a sparse object (no fields) → no "Om stedet" box; stepping a tour still works.
```bash
git add index.html
git commit -m "feat(ui): render 'Om stedet' description (note or fact-summary) in detail panel"
```

---

## Task 3: Curated notes + intros (content)

**File:** `index.html` — replace the `TOURS` array (currently 3 lines, `const TOURS=[…]` with bare-index `stops`).

- [ ] **Step 1: Replace the `TOURS` array.** Find the current `const TOURS=[ … ];` block (two tour objects with `stops:[256,…]` / `stops:[897,…]`) and replace the whole block with:

```js
const TOURS=[
 {id:"bragernes",title:"Bragernes torg",intro:"En rusletur rundt Bragernes torg – byens gamle handelssentrum, der trehusgårder fra 1860-tallet og nyere forretningsbygg står side om side.",stops:[
  {i:256,note:"Forretningsgård i sveitserstil fra 1868, blant trebygningene som preger den verneverdige bebyggelsen rundt Bragernes torg."},
  {i:253,note:"Forretningsgård fra 1860 i sveitserstil – en av de eldre handelsgårdene ved torget."},
  {i:254,note:"Del av Bøhmgården-anlegget fra 1860, i sveitserstil."},
  {i:255,note:"Verkstedbygning i Bøhmgården-gården, oppført rundt 1860."},
  {i:257,note:"Forretningsgård i etterkrigsmodernisme fra 1970 – et nyere innslag i torgrekken."},
  {i:258,note:"Forretningsgård fra 1959 ved torget."},
  {i:259,note:"Forretningsgård fra 1868 ved Bragernes torg 12."},
  {i:249,note:"Forretningsgård i etterkrigsmodernisme fra 1964 ved Bragernes torg 5."}
 ]},
 {id:"stromso",title:"Marienlyst og Drammens Museum",intro:"En vandring i Marienlyst-anlegget på Strømsø – en lystgård med tun, hageanlegg og lysthus, og hjemstedet til Drammens Museum.",stops:[
  {i:897,note:"Lystgården Marienlyst, hovedbygning i biedermeierpreg – kjernen i museumsanlegget."},
  {i:898,note:"Lystgårdens eldre bygningsdel, med opprinnelse tilbake til 1770-tallet."},
  {i:899,note:"Låve på Marienlyst-tunet, del av det historiske gårdsmiljøet."},
  {i:900,note:"Uthus i biedermeierstil på Marienlyst-tunet."},
  {i:901,note:"Drammens Museums bygning fra 1930 i nyklassisistisk stil, reist på Marienlyst-eiendommen."},
  {i:902,note:"Lysthus fra 1812 i louis-seize-stil i museumshagen."},
  {i:903,note:"Lysthus i biedermeierstil i hageanlegget."},
  {i:904,note:"Uthusbygning på Marienlyst-tunet."}
 ]}
];
```

(Note: indices are unchanged from the seeded tours; only `stops` entries become `{i,note}`, the `stromso` title changes to "Marienlyst og Drammens Museum", and both intros are rewritten.)

- [ ] **Step 2: Verify the edit is well-formed.** Run the **syntax check** (`SYNTAX_OK`) and `npm test` (~50). The stop indices are unchanged from the originally-seeded tours (validated then), so the only new risk is a JS syntax slip in the `TOURS` literal — which `node --check` catches. Also grep-confirm the new content landed: `grep -c '"i":256\|i:256' index.html` (Bragernes first stop present) and `grep -c 'Marienlyst og Drammens Museum' index.html` (retitled tour present).

- [ ] **Step 3: Browser check.** Open a curated tour (now "Bragernes torg" / "Marienlyst og Drammens Museum") → the intro reads as proper framing; stepping each stop shows its hand-written **note** in "Om stedet" (not the generic summary). An auto (kulturmiljø) tour shows the templated summary instead. Normal markers outside tours show the summary.

- [ ] **Step 4: Commit + push.**
```bash
git add index.html
git commit -m "content: hand-written notes + intros for curated tours (retitle Marienlyst)"
git push
```

---

## Self-Review (completed during planning)

**Spec coverage:**
- `summarize(r)` (fact-sentence, skip empties, stil-skip, fredet, '' fallback) → Task 1. ✓
- `resolveStops` → `{recs,notes}` (bare + `{i,note}`, aligned, skip bad) → Task 1. ✓
- Inline mirror of both + `tourNotes` in `enterTour` → Task 2. ✓
- Description resolver (`note||summarize`) + "Om stedet" section, shown in tour AND normal detail, only when non-empty → Task 2. ✓
- Curated notes + rewritten intros → Task 3 (concrete, field-grounded, no invented history). ✓
- No PDF / external links / Kulturminnesøk-text → honored (nothing added). ✓

**Placeholder scan:** No TODOs; the curated notes are literal text; the Task 3 Step 2 verification leans on the syntax check + the fact indices were validated at seed time (noted), not a vague "verify somehow."

**Type consistency:** `resolveStops` returns `{recs,notes}` in both lib and inline; `enterTour` destructures `_rs.recs`/`_rs.notes` into `tourStops`/`tourNotes`; `openDetail` reads `tourNotes[tourIdx]`; `summarize` signature identical in lib and inline (both produce the same strings — lib `VERDILAB` values equal `VERDI[*].l`). New curated `stops` entries are `{i,note}`; `resolveStops` handles bare ints (auto tours) and objects (curated) uniformly.

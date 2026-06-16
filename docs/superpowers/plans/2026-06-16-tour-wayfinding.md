# Tour Wayfinding Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development. Steps use checkbox (`- [ ]`) syntax.

**Goal:** Make the walking tours usable outdoors — a live "du er her" GPS dot (+ accuracy), a follow toggle, and a live "X m igjen til [stopp]" readout while on a tour.

**Architecture:** All in `index.html` (plain DOM + Leaflet) plus one tiny tested `formatDistance` in `lib/geo.js` (inline-mirrored). A `📍` Leaflet control drives `navigator.geolocation.watchPosition`; a follow state machine (OFF/LOCATING/FOLLOWING/PAUSED) recenters on each fix and pauses when the map moves away. Reuses the existing inline `tourHav` (haversine) and tour state.

**Tech Stack:** Vanilla JS/CSS, Leaflet 1.9.4, Geolocation API. Dependency-free, no build step.

**Spec:** `docs/superpowers/specs/2026-06-16-tour-wayfinding-design.md`

---

## Working-with-the-file rules (EVERY index.html task)

- `index.html` **line 118** is `const DATA=[...]` (~496 KB) — NEVER read/edit it. Read only the ranges you edit (CSS ~8–73; app script ~120–375) via offset/limit; anchor on code content (line numbers shift); use targeted `Edit`.
- **Syntax check** (must print `SYNTAX_OK`):
```bash
node -e "const fs=require('fs');const h=fs.readFileSync('index.html','utf8');const m=h.match(/<script>([\s\S]*?)<\/script><\/body>/);if(!m){process.exit(1)}fs.writeFileSync('.tmp-app.js',m[1]);" && node --check .tmp-app.js && echo SYNTAX_OK && rm -f .tmp-app.js
```
- `npm test` baseline **47**; Task 1 adds `formatDistance` tests. Geolocation is browser-only → **manual** verification (HTTPS/localhost; `file://` is blocked → control disabled).

## File Structure

| Unit | Change |
|------|--------|
| `lib/geo.js` | Add pure `formatDistance(m)` + tests in `test/geo.test.mjs`. |
| `index.html` | Inline-mirror `formatDistance`; a location `L.layerGroup` (dot + accuracy circle); a `📍` `L.Control` with OFF/LOCATING/FOLLOWING/PAUSED; `watchPosition` lifecycle + follow/pause; graceful failure; CSS. |
| `index.html` (readout) | A `#tourdist` span in the step-through header + live updates on fix and on step. |

---

## Task 1: `lib/geo.js` — `formatDistance` (TDD)

**Files:** Modify `lib/geo.js`, `test/geo.test.mjs`.

- [ ] **Step 1: Write the failing test** — add to `test/geo.test.mjs` (extend the existing import from `'../lib/geo.js'` to include `formatDistance`):

```js
test('formatDistance: metres rounded to nearest 10 under 1 km', () => {
  assert.equal(formatDistance(0), '0 m');
  assert.equal(formatDistance(124), '120 m');
  assert.equal(formatDistance(950), '950 m');
});
test('formatDistance: km with Norwegian comma 1000–9999, whole km from 10000', () => {
  assert.equal(formatDistance(1000), '1,0 km');
  assert.equal(formatDistance(1234), '1,2 km');
  assert.equal(formatDistance(9900), '9,9 km');
  assert.equal(formatDistance(12300), '12 km');
});
test('formatDistance: invalid input -> empty string', () => {
  assert.equal(formatDistance(-5), '');
  assert.equal(formatDistance(NaN), '');
});
```

- [ ] **Step 2: Run, verify it fails**

Run: `node --test test/geo.test.mjs`
Expected: FAIL — `formatDistance` not exported.

- [ ] **Step 3: Implement** in `lib/geo.js` (append):

```js
// Human distance: <1km rounded to 10 m ("120 m"); 1–9.99km one decimal NO-comma ("1,2 km"); >=10km whole ("12 km").
export function formatDistance(m){
  if(!Number.isFinite(m) || m < 0) return '';
  if(m < 1000) return (Math.round(m/10)*10) + ' m';
  const km = m/1000;
  return m < 10000 ? km.toFixed(1).replace('.', ',') + ' km' : Math.round(km) + ' km';
}
```

- [ ] **Step 4: Run, verify pass**

Run: `node --test` (full)
Expected: all pass (47 + 3 new = **50**, 0 fail).

- [ ] **Step 5: Commit**

```bash
git add lib/geo.js test/geo.test.mjs
git commit -m "feat(lib): add formatDistance() with tests"
```

---

## Task 2: `index.html` — location dot + `📍` control + follow state machine

**File:** `index.html`. Insert the CSS before `</style>`; insert the location module **immediately before** the `function openDetail(r){` line (so `map`, `$`, `tourHav`, and the tour state are all defined above it).

- [ ] **Step 1: Add CSS** — before `</style>`:
```css
 .locbtn{width:34px;height:34px;font-size:18px;line-height:34px;text-align:center;border:none;border-radius:6px;background:#fff;box-shadow:0 1px 4px rgba(0,0,0,.3);cursor:pointer;padding:0}
 .locbtn:disabled{opacity:.5;cursor:not-allowed}
 .locbtn.loc-following{background:#1f77b4}
 .locbtn.loc-paused{background:#cfe3f3}
 .locbtn.loc-locating{opacity:.6}
```

- [ ] **Step 2: Insert the location module.** Find the line `function openDetail(r){` and insert this block **immediately before** it:

```js
// ---- location / wayfinding ----
function formatDistance(m){if(!Number.isFinite(m)||m<0)return '';if(m<1000)return (Math.round(m/10)*10)+' m';const km=m/1000;return m<10000?km.toFixed(1).replace('.',',')+' km':Math.round(km)+' km';}
const locLayer=L.layerGroup().addTo(map);
const LOC_OK=('geolocation' in navigator)&&window.isSecureContext;
let locWatch=null, followState='off', locDot=null, locAcc=null, lastPos=null, selfRecenter=false, locBtn=null;
function updateLocBtn(){ if(!locBtn)return;
  locBtn.classList.toggle('loc-following',followState==='following');
  locBtn.classList.toggle('loc-paused',followState==='paused');
  locBtn.classList.toggle('loc-locating',followState==='locating');
  locBtn.title=!LOC_OK?'Posisjon krever https – åpne den publiserte siden'
    :followState==='off'?'Vis min posisjon'
    :followState==='paused'?'Sentrer på min posisjon':'Skru av posisjon'; }
function updateTourDist(){ const el=$('tourdist'); if(!el)return;
  el.textContent=(locWatch!=null&&lastPos&&activeTour&&tourStops[tourIdx])
    ? ' · ≈'+formatDistance(tourHav(lastPos,tourStops[tourIdx].ll)) : ''; }
function stopLocate(){ if(locWatch!=null){navigator.geolocation.clearWatch(locWatch);locWatch=null;}
  followState='off'; locLayer.clearLayers(); locDot=null; locAcc=null; updateLocBtn(); updateTourDist(); }
function onFix(p){ lastPos=[p.coords.latitude,p.coords.longitude]; const acc=p.coords.accuracy||0;
  if(!locDot){ locAcc=L.circle(lastPos,{radius:acc,color:'#1f77b4',weight:1,fillColor:'#1f77b4',fillOpacity:.12}).addTo(locLayer);
    locDot=L.circleMarker(lastPos,{radius:7,color:'#fff',weight:2,fillColor:'#1f77b4',fillOpacity:1}).addTo(locLayer); }
  else { locDot.setLatLng(lastPos); locAcc.setLatLng(lastPos); locAcc.setRadius(acc); }
  if(followState==='locating'||followState==='following'){ selfRecenter=true; map.setView(lastPos,Math.max(map.getZoom(),16)); followState='following'; updateLocBtn(); }
  updateTourDist(); }
function onErr(e){ if(e&&e.code===1){ stopLocate(); const s=$('status'); if(s)s.textContent='Posisjon avslått.'; } }
function startLocate(){ followState='locating'; updateLocBtn();
  locWatch=navigator.geolocation.watchPosition(onFix,onErr,{enableHighAccuracy:true,maximumAge:5000,timeout:15000}); }
function toggleLocate(){ if(!LOC_OK)return;
  if(followState==='off') startLocate();
  else if(followState==='paused'){ if(lastPos){selfRecenter=true;map.setView(lastPos,Math.max(map.getZoom(),16));} followState='following'; updateLocBtn(); }
  else stopLocate(); }
map.on('movestart',()=>{ if(selfRecenter){selfRecenter=false;return;} if(followState==='following'){followState='paused';updateLocBtn();} });
const LocateControl=L.Control.extend({options:{position:'bottomright'},onAdd:function(){
  const b=L.DomUtil.create('button','locbtn'); b.type='button'; b.textContent='📍';
  if(!LOC_OK)b.disabled=true;
  L.DomEvent.disableClickPropagation(b); L.DomEvent.on(b,'click',ev=>{L.DomEvent.stop(ev);toggleLocate();});
  locBtn=b; updateLocBtn(); return b; }});
map.addControl(new LocateControl());
```

- [ ] **Step 3: Verify + commit.** Run the syntax check (`SYNTAX_OK`) and `npm test` (still 50 — no node tests touched). Grep-confirm: `watchPosition`, `LocateControl`, `followState`, `function formatDistance` (inline), `selfRecenter`. Browser (served, e.g. `npx vercel dev` or localhost over https): a `📍` button appears bottom-right; tap → after permission, a blue dot + accuracy circle appear and the map follows; pan away → button turns light (PAUSED) and the dot keeps moving; tap → recenters/resumes; tap while following → off (dot removed). Open as `file://` → button is disabled with the https tooltip. Deny permission → resets, "Posisjon avslått." in the status line.

```bash
git add index.html
git commit -m "feat(ui): live location dot + follow control (watchPosition, graceful degradation)"
```

---

## Task 3: `index.html` — live "X m igjen til [stopp]" in the tour stepper

**File:** `index.html` (`openDetail`, lines ~289–301).

- [ ] **Step 1: Add the `#tourdist` span to the stepper.** In `openDetail`, find:
```js
  const stepper=inTour?'<div class="tourstep"><button id="tprev">‹ Forrige</button><span>'+(tourIdx+1)+' / '+tourStops.length+'</span><button id="tnext">Neste ›</button></div>':'';
```
Replace with (adds `<span id="tourdist">` after the counter):
```js
  const stepper=inTour?'<div class="tourstep"><button id="tprev">‹ Forrige</button><span>'+(tourIdx+1)+' / '+tourStops.length+'<span id="tourdist"></span></span><button id="tnext">Neste ›</button></div>':'';
```

- [ ] **Step 2: Refresh the readout when a stop opens.** Find (end of `openDetail`):
```js
  loadPhotos(r); updateHash();
}
```
Replace with:
```js
  loadPhotos(r); updateTourDist(); updateHash();
}
```

(`updateTourDist` is defined in Task 2; `onFix` already calls it on every GPS fix, so the readout updates live while walking, and this call refreshes it immediately when stepping to a new stop.)

- [ ] **Step 3: Verify + commit.** Syntax check (`SYNTAX_OK`) + `npm test` (50). Grep-confirm `id="tourdist"` and `updateTourDist();` inside `openDetail`. Browser (served, location granted): enter a tour, enable `📍` → the step header shows e.g. `3 / 8 · ≈120 m`; the distance updates as you (spoofed) move and changes when you step to another stop; with location off, the header shows just `3 / 8` (no distance). Outside a tour, no readout.

```bash
git add index.html
git commit -m "feat(ui): live distance-to-current-stop in the tour stepper"
git push
```

---

## Self-Review (completed during planning)

**Spec coverage:**
- `formatDistance` (m/km Norwegian, thresholds) + tests → Task 1. ✓
- Location dot + accuracy circle (`locLayer`) → Task 2. ✓
- `📍` control + OFF/LOCATING/FOLLOWING/PAUSED + `watchPosition`/`clearWatch` → Task 2. ✓
- Follow recenters (selfRecenter flag); pauses on move-away (user pan OR tour step `flyTo`, via the global `movestart` handler) → Task 2. ✓
- Graceful: insecure/unsupported → disabled control + tooltip (`LOC_OK`); denied (code 1) → reset + note; unavailable/timeout (2/3) → silent, no dot (onErr ignores non-1 codes; watch stays) → Task 2. ✓
- Live "X m igjen" in the stepper, on fix + on step, tour-only → Tasks 2 (`updateTourDist`, called in `onFix`) + 3 (span + `openDetail` call). ✓
- Map-global location (survives tour enter/exit); readout only in tour → `updateTourDist` guards on `activeTour`. ✓
- YAGNI (no auto-advance/bearing/start-at-nearest) → honored. ✓

**Placeholder scan:** No TODOs. `updateTourDist` is defined in Task 2 and harmlessly no-ops (its `$('tourdist')` guard) until Task 3 adds the span — called out explicitly, not a gap.

**Type/consistency:** inline `formatDistance` mirrors `lib/geo.js` (same thresholds/strings; lib is the tested reference). `followState` values `'off'|'locating'|'following'|'paused'` used consistently across `updateLocBtn`/`onFix`/`toggleLocate`/`movestart`. `selfRecenter` set before every programmatic `setView` and cleared in the `movestart` handler. `updateTourDist` reads `locWatch`/`lastPos`/`activeTour`/`tourStops`/`tourIdx` — all defined above the insertion point or at runtime. The `movestart` pause also covers `stepTo`/`enterTour` `flyTo`/`fitBounds` (they aren't flagged `selfRecenter`), matching the spec's "step pauses follow" rule.

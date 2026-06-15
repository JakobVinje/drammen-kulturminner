# Walking Tours — UI Plan (Plan 2 of 2)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development. Steps use checkbox (`- [ ]`) syntax.

**Goal:** Add the tour UI to `index.html`: a "Vandretur" selector (curated + auto per-kulturmiljø), focus mode (numbered pins + route line), and a player (browsable stop list + step-through) that reuses the detail panel — consuming the `TOURS`/`/api/route` foundation from Plan 1.

**Architecture:** Plain DOM + Leaflet, no build step. The browser can't `import` `lib/tours.js` (would break `file://` use), so the small pure tour functions are **mirrored inline** in `index.html` — same pattern the file already uses for `esc`/`localityLink`. `lib/tours.js` remains the tested reference; keep the inline copies algorithmically identical. The route line is fetched from `/api/route` with a straight-dashed fallback (works offline, like photos).

**Tech Stack:** Existing — Leaflet 1.9.4 (+markercluster, Chart.js). Vanilla JS/CSS.

**Spec:** `docs/superpowers/specs/2026-06-12-walking-tours-design.md`
**Plan 1 (done):** `docs/superpowers/plans/2026-06-12-walking-tours-foundation.md`

**Player refinement (vs brainstorm):** "both list + step-through" is kept, but the step-through controls live in the **detail-panel header** rather than a floating bottom bar — this reuses `#detail` and avoids the mobile bottom-sheet overlap. The browsable list lives in the control panel.

---

## Working-with-the-file rules (EVERY task)

- `index.html` **line 103** is `const DATA=[...]` (~496 KB) — NEVER read or edit it. Read only the ranges you edit (CSS ~8–61, controls HTML ~64–98, app script ~104–343) via offset/limit; use targeted `Edit`.
- **Per-task syntax check** (must print `SYNTAX_OK`):
```bash
node -e "const fs=require('fs');const h=fs.readFileSync('index.html','utf8');const m=h.match(/<script>([\s\S]*?)<\/script><\/body>/);if(!m){process.exit(1)}fs.writeFileSync('.tmp-app.js',m[1]);" && node --check .tmp-app.js && echo SYNTAX_OK && rm -f .tmp-app.js
```
- `npm test` must stay at **44 passing** (UI tasks add no node tests). UI behaviour is verified in a browser (each task lists what to look for).

Current anchors (post Plan-1): `TOURS` 114–117, `dimConf` 118, map/layers 125–135, state 139, markers loop 145–149, `IDX` 150, `openDetail` 186–196, `closeDetail` 197, `visible` 227, `render` 261–271, controls 282–299, `updateHash` 310–316, `restoreHash` 317–333, init 340–343.

---

## Task 1: Inline tour logic + registry + "Vandretur" selector

**File:** `index.html`

- [ ] **Step 1: Inline the tour logic** — after the `TOURS` array (line 117, the `];`), insert:

```js
// ---- tour logic (mirrors lib/tours.js; inlined so it works on file:// too) ----
function tourHav(a,b){const R=6371000,t=d=>d*Math.PI/180;const dLa=t(b[0]-a[0]),dLo=t(b[1]-a[1]);
  const x=Math.sin(dLa/2)**2+Math.cos(t(a[0]))*Math.cos(t(b[0]))*Math.sin(dLo/2)**2;return 2*R*Math.asin(Math.sqrt(x));}
function nnOrder(items){if(items.length<=1)return items.slice();const rem=items.slice();const out=[rem.shift()];
  while(rem.length){const last=out[out.length-1].ll;let bi=0,bd=Infinity;
    for(let i=0;i<rem.length;i++){const d=tourHav(last,rem[i].ll);if(d<bd){bd=d;bi=i;}}out.push(rem.splice(bi,1)[0]);}return out;}
function buildAutoTours(){const groups=new Map();
  DATA.forEach((r,idx)=>{const mi=r.mi;if(!mi||mi==="(uten miljø)"||!Array.isArray(r.ll))return;
    if(!groups.has(mi))groups.set(mi,[]);groups.get(mi).push({idx,ll:r.ll});});
  const out=[];for(const[mi,items]of groups){if(items.length<4)continue;
    items.sort((a,b)=>a.ll[0]-b.ll[0]||a.ll[1]-b.ll[1]);
    const ord=nnOrder(items).slice(0,20);
    out.push({id:"mi:"+mi,title:mi,intro:"Kulturmiljø «"+mi+"» — "+ord.length+" stopp.",stops:ord.map(o=>o.idx)});}
  out.sort((a,b)=>a.title.localeCompare(b.title,'no'));return out;}
function resolveStops(t){const out=[];for(const i of (t.stops||[])){const r=DATA[i];if(r&&Array.isArray(r.ll))out.push(r);}return out;}
const AUTO_TOURS=buildAutoTours();
function findTour(id){return TOURS.concat(AUTO_TOURS).find(t=>t.id===id)||null;}
```

- [ ] **Step 2: Add the selector HTML** — after the `<select id="dim">…</select>` block (line 75, the `</select>`), insert:

```html
 <label class="fld">Vandretur</label>
 <select id="tour"><option value="">— ingen tur —</option></select>
 <div id="tourbox" class="hidden"></div>
```

- [ ] **Step 3: Populate the selector** — add a function near the other control setup (just before the init line `restoreHash();` at line 340), and call it at init. Insert before line 340:

```js
function populateTourSelect(){const sel=$('tour');
  const og1=document.createElement('optgroup');og1.label='Utvalgte turer';
  TOURS.forEach(t=>{const o=document.createElement('option');o.value=t.id;o.textContent=t.title;og1.appendChild(o);});
  const og2=document.createElement('optgroup');og2.label='Kulturmiljø-turer';
  AUTO_TOURS.forEach(t=>{const o=document.createElement('option');o.value=t.id;o.textContent=t.title;og2.appendChild(o);});
  if(TOURS.length)sel.appendChild(og1); if(AUTO_TOURS.length)sel.appendChild(og2);}
```

Then change the init line 342 from:
```js
initChart(); buildLegend(); render();
```
to:
```js
initChart(); buildLegend(); populateTourSelect(); render();
```

- [ ] **Step 4: Verify + commit.** Syntax check (`SYNTAX_OK`), `npm test` (44). Grep-confirm `buildAutoTours`, `id="tour"`, `populateTourSelect`. Browser: the "Vandretur" dropdown lists "— ingen tur —", an *Utvalgte turer* group (Bragernes, Strømsø), and a long *Kulturmiljø-turer* group (~61). (Selecting does nothing yet.)

```bash
git add index.html
git commit -m "feat(ui): inline tour logic + Vandretur selector (curated + auto)"
```

---

## Task 2: Focus mode + player (pins, list, step-through)

**File:** `index.html`

- [ ] **Step 1: Add CSS** — inside `<style>`, just before `</style>` (line 62):

```css
 .tourpin span{display:flex;align-items:center;justify-content:center;width:26px;height:26px;background:#1f77b4;color:#fff;border:2px solid #fff;border-radius:50%;font-size:12px;font-weight:700;box-shadow:0 1px 4px rgba(0,0,0,.4)}
 .tourintro{font-size:13px;color:#444;margin:8px 0;line-height:1.4}
 .tourmeta{font-size:12px;color:#1f77b4;font-weight:600;margin-bottom:6px;min-height:14px}
 .tourlist{margin:6px 0;padding-left:22px;font-size:13px;max-height:240px;overflow:auto}
 .tourlist li{cursor:pointer;padding:3px 4px;border-radius:4px}
 .tourlist li.active{background:#1f77b4;color:#fff}
 .tourstep{display:flex;align-items:center;justify-content:space-between;gap:8px;margin:0 0 10px;font-size:13px}
 .tourstep button{font-size:13px;padding:6px 12px;border:1px solid #ccc;background:#fff;border-radius:6px;cursor:pointer}
 .tourstep button:disabled{opacity:.4;cursor:default}
```

- [ ] **Step 2: Add tour state + layers** — after the `IDX`/`objId` lines (line 151), insert:

```js
// ---- tour state ----
let activeTour=null, tourStops=[], tourIdx=0;
const tourLayer=L.layerGroup(), routeLayer=L.layerGroup();
function enterTour(t){
  activeTour=t; tourStops=resolveStops(t); tourIdx=0;
  if(map.hasLayer(cluster))map.removeLayer(cluster); if(map.hasLayer(plain))map.removeLayer(plain);
  tourLayer.clearLayers(); routeLayer.clearLayers(); map.addLayer(routeLayer); map.addLayer(tourLayer);
  tourStops.forEach((r,i)=>{const icon=L.divIcon({className:'tourpin',html:'<span>'+(i+1)+'</span>',iconSize:[26,26],iconAnchor:[13,13]});
    L.marker(r.ll,{icon}).on('click',()=>stepTo(i)).addTo(tourLayer);});
  $('tour').value=t.id; renderTourBox(); drawRoute();
  if(tourStops.length) map.fitBounds(L.latLngBounds(tourStops.map(s=>s.ll)).pad(0.2));
  updateHash();
}
function exitTour(){
  activeTour=null; tourStops=[]; tourLayer.clearLayers(); routeLayer.clearLayers();
  if(map.hasLayer(tourLayer))map.removeLayer(tourLayer); if(map.hasLayer(routeLayer))map.removeLayer(routeLayer);
  $('tour').value=''; const box=$('tourbox'); box.classList.add('hidden'); box.innerHTML='';
  closeDetail(); render();
}
function renderTourBox(){
  const box=$('tourbox'); box.classList.remove('hidden');
  box.innerHTML='<div class="tourintro">'+esc(activeTour.intro)+'</div><div id="tourmeta" class="tourmeta"></div>'
    +'<ol id="tourlist" class="tourlist"></ol><button class="btn" id="tourexit">Avslutt tur</button>';
  const ol=$('tourlist');
  tourStops.forEach((r,i)=>{const li=document.createElement('li');li.textContent=(r.be||r.f||r.ad||(r.g+'/'+r.bn));li.onclick=()=>stepTo(i);ol.appendChild(li);});
  $('tourexit').onclick=exitTour; highlightStop();
}
function highlightStop(){const ol=$('tourlist'); if(ol)[...ol.children].forEach((li,i)=>li.classList.toggle('active',i===tourIdx));}
function stepTo(i){ if(i<0||i>=tourStops.length)return; tourIdx=i; const r=tourStops[i];
  map.flyTo(r.ll, Math.max(map.getZoom(),16)); openDetail(r); highlightStop(); updateHash(); }
function drawRoute(){ routeLayer.clearLayers(); } // real impl in Task 3
```

> `drawRoute` is a stub here so Task 2 is self-contained; Task 3 replaces it.

- [ ] **Step 3: Make `render()` tour-aware** — change line 261 from:
```js
function render(){
  const C=dimConf(dim); cluster.clearLayers(); plain.clearLayers(); const vis=[],visRecs=[];
```
to:
```js
function render(){
  if(activeTour) return; // tour focus mode owns the map; exitTour() re-renders
  const C=dimConf(dim); cluster.clearLayers(); plain.clearLayers(); const vis=[],visRecs=[];
```

- [ ] **Step 4: Add the step-through to `openDetail`** — replace the body of `openDetail` (lines 186–196) with:

```js
function openDetail(r){
  currentDetail=r;
  const inTour=activeTour&&tourStops[tourIdx]===r;
  const stepper=inTour?'<div class="tourstep"><button id="tprev">‹ Forrige</button><span>'+(tourIdx+1)+' / '+tourStops.length+'</span><button id="tnext">Neste ›</button></div>':'';
  $('detbody').innerHTML=stepper+'<h2>'+esc(r.be||r.f||r.ad||(r.g+'/'+r.bn))+'</h2>'
    +'<p class="detsub">'+esc(r.ad||'')+'</p>'
    +'<div class="detsec"><h3>Foto</h3><div id="detphotos">—</div></div>'
    +heritageSection(r)
    +'<div class="detsec"><h3>Detaljer</h3>'+detailFields(r)+'</div>';
  $('detail').classList.remove('hidden');
  if(inTour){ $('tprev').onclick=()=>stepTo(tourIdx-1); $('tnext').onclick=()=>stepTo(tourIdx+1);
    $('tprev').disabled=tourIdx===0; $('tnext').disabled=tourIdx===tourStops.length-1; }
  loadPhotos(r); updateHash();
}
```

- [ ] **Step 5: Wire the selector** — after the `$('onlyphoto')` listener (line 291), add:
```js
$('tour').addEventListener('change',e=>{const t=findTour(e.target.value); if(t)enterTour(t); else exitTour();});
```

- [ ] **Step 6: Verify + commit.** `SYNTAX_OK`; `npm test` (44). Browser: pick a curated tour → normal markers vanish, numbered pins 1…N appear, map fits them, the panel shows intro + a clickable stop list + "Avslutt tur". Click a pin or list row → map flies there, detail panel opens with a "‹ Forrige · 3/8 · Neste ›" stepper at the top; Prev/Next walk the stops; Prev disabled on first, Next on last; the active list row highlights. "Avslutt tur" (or selecting "— ingen tur —") restores the normal map.

```bash
git add index.html
git commit -m "feat(ui): tour focus mode + list/step-through player"
```

---

## Task 3: Route line (ORS + straight-dashed fallback + distance/time)

**File:** `index.html`

- [ ] **Step 1: Replace the `drawRoute` stub** (added in Task 2) with the real implementation. Find:
```js
function drawRoute(){ routeLayer.clearLayers(); } // real impl in Task 3
```
Replace with:
```js
function estimateMeta(lls){let m=0;for(let i=1;i<lls.length;i++)m+=tourHav(lls[i-1],lls[i]);return {distance:m,duration:m/1.4};}
function setTourMeta(meta,approx){const el=$('tourmeta'); if(!el)return;
  const km=meta.distance/1000, min=Math.round(meta.duration/60);
  el.textContent='~'+km.toFixed(km<10?1:0)+' km · ~'+min+' min'+(approx?' (omtrentlig rute)':'');}
function drawRoute(){
  routeLayer.clearLayers();
  if(tourStops.length<2){ setTourMeta({distance:0,duration:0},false); return; }
  const lls=tourStops.map(s=>s.ll);
  routeLayer.addLayer(L.polyline(lls,{color:'#1f77b4',weight:3,dashArray:'6 6',opacity:.6})); // fallback first
  setTourMeta(estimateMeta(lls),true);
  const myTour=activeTour, coords=lls.map(p=>p[0]+','+p[1]).join(';');
  fetch('/api/route?coords='+encodeURIComponent(coords))
    .then(r=>{ if(!r.ok) throw new Error('http '+r.status); return r.json(); })
    .then(d=>{ if(activeTour!==myTour) return;            // tour switched mid-fetch; ignore stale
      if(!d.line||!d.line.length) return;                 // keep fallback
      routeLayer.clearLayers(); routeLayer.addLayer(L.polyline(d.line,{color:'#1f77b4',weight:4,opacity:.75}));
      setTourMeta({distance:d.distance,duration:d.duration},false); })
    .catch(()=>{}); // keep the straight-dashed fallback + estimated meta
}
```

- [ ] **Step 2: Verify + commit.** `SYNTAX_OK`; `npm test` (44). Browser **with backend** (`npx vercel dev` + a valid `ORS_API_KEY`): entering a tour draws a real walking path following streets and the meta shows "~X km · ~Y min" (no "omtrentlig"). **Without backend** (open `index.html` as a file, or no key): a straight dashed line connects the stops and the meta reads "… (omtrentlig rute)". Switching tours quickly never leaves a stale line.

```bash
git add index.html
git commit -m "feat(ui): live ORS route line with straight-dashed fallback + distance/time"
```

---

## Task 4: Deep-link `tour=` / `stop=`

**File:** `index.html`

- [ ] **Step 1: Serialize in `updateHash`** — find (line 314):
```js
  if(currentDetail!=null && objId(currentDetail)!=null) p.set('obj',objId(currentDetail));
```
Replace with:
```js
  if(activeTour){ p.set('tour',activeTour.id); p.set('stop',tourIdx); }
  else if(currentDetail!=null && objId(currentDetail)!=null) p.set('obj',objId(currentDetail));
```

- [ ] **Step 2: Restore in `restoreHash`** — find (lines 329–330):
```js
    if(p.get('obj')!=null){const oi=+p.get('obj'); const rr=DATA[oi];
      if(rr){ setTimeout(()=>{ openDetail(rr); if(rr.ll) map.setView(rr.ll, Math.max(map.getZoom(),16)); },0); }}
```
Replace with (tour takes precedence over a bare `obj`):
```js
    if(p.get('tour')){ const t=findTour(p.get('tour')); const si=+(p.get('stop')||0);
      if(t){ setTimeout(()=>{ enterTour(t); if(tourStops.length) stepTo(Math.min(Math.max(si,0),tourStops.length-1)); },0); } }
    else if(p.get('obj')!=null){ const oi=+p.get('obj'); const rr=DATA[oi];
      if(rr){ setTimeout(()=>{ openDetail(rr); if(rr.ll) map.setView(rr.ll, Math.max(map.getZoom(),16)); },0); } }
```

- [ ] **Step 3: Verify + commit.** `SYNTAX_OK`; `npm test` (44). Browser: enter a tour, step to stop 3 → URL hash shows `tour=<id>&stop=2`. Reload (or open the copied link in a new tab) → the tour re-enters and the panel opens at that stop, map centred. A bad `tour=` id no-ops (normal map). "Avslutt tur" → `tour`/`stop` leave the hash. `#obj=` still works when no `tour=` is present.

```bash
git add index.html
git commit -m "feat(ui): deep-link tours via tour=/stop= hash params"
```

---

## Task 5: Mobile polish + final verification

**File:** `index.html`

- [ ] **Step 1: Mobile CSS** — inside the existing `@media(max-width:780px){…}` block (it ends at line 40, before the closing `}`), add these rules (insert just before the block's closing `}` on line 40):

```css
   .tourlist{max-height:150px}
   .tourstep button{padding:9px 14px}
```

- [ ] **Step 2: Verify + commit.** `SYNTAX_OK`; `npm test` (44). Browser at ≤780px (DevTools device toolbar):
  - Open the collapsible control panel ("☰ Filtre"), pick a tour → pins + list appear; the detail bottom-sheet opens for a stop with the **‹ Forrige · n/N · Neste ›** stepper in its header (reachable, not hidden) — stepping works on touch.
  - "Avslutt tur" restores the normal map. Tour list scrolls within the panel.

```bash
git add index.html
git commit -m "feat(ui): mobile polish for tour list + step controls"
```

- [ ] **Step 3: Full manual sweep (desktop + mobile), then report.** Confirm end-to-end: select curated + auto tours, route line (ORS with backend / fallback without), step-through both via list and Prev/Next, deep-link round-trip, exit restores filters/markers, and the pre-existing features (filter, photos, heritage, normal `obj` deep-link, chart, export) still work. Note anything that needs a human eye.

---

## Self-Review (completed during planning)

**Spec coverage:**
- "Vandretur" selector, curated + auto groups → Task 1. ✓
- Focus mode (numbered pins, hide normal markers, fit) → Task 2. ✓
- Player: browsable list (Task 2) + step-through in detail-panel header (Task 2). "Both", reusing `#detail`. ✓ (Refinement: step controls in the panel header, not a floating bar — noted above.)
- Route line via `/api/route` + straight-dashed fallback + "~km · ~min" → Task 3. ✓
- Deep-link `tour=`/`stop=`, precedence over `obj` → Task 4. ✓
- Mobile (bottom-sheet stepper reachable, collapsible controls) → Tasks 2+5. ✓
- Filter coexistence: `render()` early-returns while a tour is active; `exitTour()` re-renders → Task 2. ✓ (Simpler than snapshot/restore: filter state is untouched during a tour, so a plain re-render restores it.)
- Graceful local-file degradation: inline tour logic (no module import) + fetch fallback → Tasks 1, 3. ✓

**Placeholder scan:** The only intentional temporary is the `drawRoute` stub in Task 2, explicitly replaced in Task 3 Step 1 — called out so the syntax check stays green between tasks.

**Consistency:** Inline `tourHav`/`nnOrder`/`buildAutoTours`/`resolveStops` mirror `lib/tours.js` (tested). `enterTour`/`exitTour`/`stepTo`/`renderTourBox`/`highlightStop`/`drawRoute`/`findTour`/`AUTO_TOURS`/`activeTour`/`tourStops`/`tourIdx` are introduced once and used consistently. New hash keys `tour`/`stop` don't collide with `dim/y0/y1/u/c/p/q/h/obj`; `tour` is mutually exclusive with `obj` in both serialize and restore. `stepTo` and the in-detail stepper both call `openDetail`, which detects tour context via `tourStops[tourIdx]===r`.

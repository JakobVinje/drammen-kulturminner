# Kulturminner Photos/Heritage — UI Plan (Plan 2 of 2)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add the user-facing features to `index.html`: a detail side-panel (baked heritage + live photos), a "has photo" filter + marker ring, `obj=` deep-linking, and a mobile bottom-sheet pass — consuming the baked `hp/dq/km/kc/kn/kv` keys produced by Plan 1.

**Architecture:** Plain DOM + Leaflet, no framework, no build step (matches the existing file). All work edits the single inline `<script>` and `<style>` in `index.html`. The `const DATA=[...]` line (line 64) is NEVER edited. Photos load lazily from the `/api/photos` serverless function when a detail panel opens; everything else (filter, ring, heritage section, deep-link) works from baked data with no network — so the page still works opened as a local file (photos degrade gracefully).

**Tech Stack:** Existing — Leaflet 1.9.4, markercluster, Chart.js (all CDN). New code is vanilla JS/CSS.

**Spec:** `docs/superpowers/specs/2026-06-11-kulturminner-photos-heritage-design.md`
**Plan 1 (done):** `docs/superpowers/plans/2026-06-11-kulturminner-foundation.md`

---

## Baked data shape (from Plan 1 — what the UI consumes)

Each record `r` may have: `r.hp` (bool, has photo), `r.dq` (DiMu query string), `r.km` (Kulturminnesøk lokalId, e.g. `"327939"` or `"41474-1"`), `r.kc` (`"h"`/`"m"`/`"l"` confidence), `r.kn` (locality name), `r.kv` (vernetype code, e.g. `FPG`/`AUT`/`LIST`/`VED`). All are absent on records with no match (~85% have no photo, ~62% have no heritage match). The UI must handle absence gracefully.

`/api/photos?dq=<dq>` returns `[{thumb, full, title, owner, license, dimuUrl}, ...]` (or `{error}` with a non-200 status).

---

## Working-with-the-file rules (IMPORTANT for every task)

- **Never read the whole file** — line 64 (`const DATA=[...]`) is ~496 KB and exceeds limits. Read only the ranges you edit: CSS is lines ~8–29, control HTML ~32–58, the app script ~65–216.
- All edits use targeted `Edit` (exact-string) on those ranges. Do not touch line 64.
- **Per-task syntax check** (validates the inline app script compiles, without running it):

```bash
node -e "const fs=require('fs');const h=fs.readFileSync('index.html','utf8');const m=h.match(/<script>([\s\S]*?)<\/script><\/body>/);if(!m){console.error('no inline script');process.exit(1);}fs.writeFileSync('.tmp-app.js',m[1]);" && node --check .tmp-app.js && echo SYNTAX_OK && rm -f .tmp-app.js
```

Expected: `SYNTAX_OK`. (The `node:test` suite from Plan 1 must also still pass: `npm test` → 27 passing. UI behavior itself is verified visually in the browser — each task lists what to look for.)

---

## Task 1: "Has photo" filter + marker ring

**File:** `index.html` (control HTML ~50, state ~95, `visible` ~113–119, `render` ~148, controls ~173, hash ~188/202, footer ~58)

- [ ] **Step 1: Add the control checkbox.** After the `usecluster` checkbox line (currently line 50):

Find:
```html
 <label class="chk"><input type="checkbox" id="usecluster" checked/> Slå sammen nære punkter (clustering)</label>
```
Add immediately after it:
```html
 <label class="chk"><input type="checkbox" id="onlyphoto"/> Kun objekter med foto</label>
```

- [ ] **Step 2: Add state.** Find (line ~95):
```js
let dim="v",hidden=new Set(),q="",y0=YMIN,y1=YMAX,hideUnd=false;
```
Replace with:
```js
let dim="v",hidden=new Set(),q="",y0=YMIN,y1=YMAX,hideUnd=false,onlyPhoto=false;
```

- [ ] **Step 3: Filter in `visible(r)`.** Find (line ~116):
```js
  if(r.y){ if(r.y<y0||r.y>y1) return false; } else if(hideUnd) return false;
```
Add a line immediately after it:
```js
  if(onlyPhoto && !r.hp) return false;
```

- [ ] **Step 4: Ring in `render()`.** Find (line ~148):
```js
  for(const o of markers){ if(visible(o.rec)){ o.m.setStyle({fillColor:C.color(C.get(o.rec))}); vis.push(o.m); visRecs.push(o.rec); } }
```
Replace with:
```js
  for(const o of markers){ if(visible(o.rec)){ const hp=!!o.rec.hp;
      o.m.setStyle({fillColor:C.color(C.get(o.rec)), color:hp?'#0a7d28':'#222', weight:hp?2.5:.5});
      vis.push(o.m); visRecs.push(o.rec); } }
```

- [ ] **Step 5: Listener.** After the `usecluster` listener (line ~173):
```js
$('usecluster').addEventListener('change',e=>{useCluster=e.target.checked;render();});
```
Add:
```js
$('onlyphoto').addEventListener('change',e=>{onlyPhoto=e.target.checked;render();});
```

- [ ] **Step 6: Permalink.** In `updateHash()` find:
```js
  p.set('dim',dim); p.set('y0',y0); p.set('y1',y1); if(hideUnd)p.set('u','1'); if(!useCluster)p.set('c','0'); if(q)p.set('q',q);
```
Replace with (adds `p`):
```js
  p.set('dim',dim); p.set('y0',y0); p.set('y1',y1); if(hideUnd)p.set('u','1'); if(!useCluster)p.set('c','0'); if(onlyPhoto)p.set('p','1'); if(q)p.set('q',q);
```
In `restoreHash()` find:
```js
    if(p.get('c')==='0'){useCluster=false;$('usecluster').checked=false;}
```
Add immediately after:
```js
    if(p.get('p')){onlyPhoto=true;$('onlyphoto').checked=true;}
```

- [ ] **Step 7: Footer hint.** In the footer (line ~58), append to the existing text inside the `.footer` div:
```
 Grønn ring rundt et punkt = foto finnes i DigitaltMuseum.
```
(Add it as a trailing sentence in the existing `<div class="footer">…</div>` — keep all current text.)

- [ ] **Step 8: Verify.** Run the syntax check (expect `SYNTAX_OK`) and `npm test` (27 pass). In a browser: toggle "Kun objekter med foto" — only green-ringed points remain; the count in `#status` drops to roughly the has-photo subset. Copy-link, reload — the filter state restores.

- [ ] **Step 9: Commit.**
```bash
git add index.html
git commit -m "feat(ui): add 'has photo' filter + green marker ring"
```

---

## Task 2: Detail side-panel (baked fields + heritage) with open/close

**File:** `index.html` (CSS ~8–29, body after `#panel` ~59, marker loop ~101–103, after `popup()` ~112)

- [ ] **Step 1: Add CSS.** Inside `<style>`, immediately before the closing `</style>` (line ~29 has the existing media query; add these rules just before `</style>`):
```css
 #detail{position:absolute;top:0;bottom:0;right:0;width:380px;max-width:90vw;background:#fff;border-left:1px solid #ddd;box-shadow:-4px 0 16px rgba(0,0,0,.08);overflow-y:auto;padding:16px 18px;box-sizing:border-box;z-index:1200;transition:transform .2s ease}
 #detail.hidden{transform:translateX(110%);pointer-events:none}
 #detclose{position:absolute;top:10px;right:12px;border:none;background:#eee;border-radius:50%;width:30px;height:30px;font-size:16px;cursor:pointer;line-height:1}
 #detail h2{font-size:17px;margin:2px 40px 2px 0}
 #detail .detsub{font-size:12px;color:#666;margin:0 0 10px}
 #detail dl{display:grid;grid-template-columns:auto 1fr;gap:2px 10px;font-size:13px;margin:8px 0}
 #detail dt{color:#888}#detail dd{margin:0}
 .detsec{margin-top:14px;border-top:1px solid #eee;padding-top:10px}
 .detsec h3{font-size:12px;text-transform:uppercase;letter-spacing:.04em;color:#888;margin:0 0 6px}
 .kctag{display:inline-block;font-size:11px;padding:1px 7px;border-radius:9px;color:#fff}
 .kc-h{background:#0a7d28}.kc-m{background:#c8820a}.kc-l{background:#9aa0a6}
 .detlink{font-size:13px}
```

- [ ] **Step 2: Add the panel element.** Find the end of the control panel `#panel` (line ~59, the `</div>` that closes `<div id="panel">`, just before `<script src=...leaflet...>`). Add immediately after that `</div>`:
```html
<div id="detail" class="hidden">
  <button id="detclose" title="Lukk">×</button>
  <div id="detbody"></div>
</div>
```

- [ ] **Step 3: Add helpers + open/close, after `popup()` (after line ~112).** Insert this block immediately after the `popup` function's closing `}`:
```js
// ---- detail panel ----
const esc=s=>String(s==null?'':s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const VTYPE={FPG:"Fredet (forskrift/paragraf)",AUT:"Automatisk fredet",VED:"Vedtaksfredet",LIST:"Listeført",MAB:"Midlertidig fredet"};
const KCLAB={h:"sikkert treff",m:"trolig treff",l:"mulig treff"};
function localityLink(km){return 'https://kulturminnesok.no/ra/lokalitet/'+String(km).split('-')[0];}
let currentDetail=null;
function heritageSection(r){
  if(!r.km) return '<div class="detsec"><h3>Kulturminnesøk</h3><div style="font-size:13px;color:#777">Ingen registrert lokalitet i nærheten.</div></div>';
  const vt=r.kv?(VTYPE[r.kv]||r.kv):'';
  return '<div class="detsec"><h3>Kulturminnesøk</h3>'
    +'<div style="font-size:14px;margin-bottom:4px">'+esc(r.kn||'Lokalitet')+' '
    +'<span class="kctag kc-'+r.kc+'">'+(KCLAB[r.kc]||'')+'</span></div>'
    +(vt?'<div style="font-size:13px;color:#555">'+esc(vt)+'</div>':'')
    +'<div style="margin-top:6px"><a class="detlink" target="_blank" rel="noopener" href="'+localityLink(r.km)+'">Se full oppføring på Kulturminnesøk ↗</a></div></div>';
}
function detailFields(r){
  const row=(k,v)=>v?'<dt>'+k+'</dt><dd>'+esc(v)+'</dd>':'';
  const bn1=(r.bn||'').match(/\d+/);
  const see=bn1?'<a class="detlink" target="_blank" rel="noopener" href="https://seeiendom.kartverket.no/eiendom/3301/'+esc(r.g)+'/'+bn1[0]+'/0/0">Se eiendom i seeiendom ↗</a>':'';
  return '<dl>'+row('Adresse',r.ad)+row('Funksjon',r.f)+row('Kategori',r.kat)
    +row('Stil',(r.sn&&r.sn!=='Uoppgitt')?r.sn:'')+row('Byggeår',r.ar)+row('Kulturmiljø',r.mi)
    +row('Kulturminneverdi',(VERDI[r.v]||{}).l||r.v)+row('Vernestatus',r.vn)+row('Gnr/Bnr',r.g+'/'+r.bn)+'</dl>'
    +(see?'<div>'+see+'</div>':'');
}
function openDetail(r){
  currentDetail=r;
  $('detbody').innerHTML='<h2>'+esc(r.be||r.f||r.ad||(r.g+'/'+r.bn))+'</h2>'
    +'<p class="detsub">'+esc(r.ad||'')+'</p>'
    +'<div class="detsec"><h3>Foto</h3><div id="detphotos">—</div></div>'
    +heritageSection(r)
    +'<div class="detsec"><h3>Detaljer</h3>'+detailFields(r)+'</div>';
  $('detail').classList.remove('hidden');
  loadPhotos(r);   // defined in Task 3; until then, define a stub (see note)
  updateHash();
}
function closeDetail(){ currentDetail=null; $('detail').classList.add('hidden'); updateHash(); }
```

> **NOTE for this task only:** Task 3 defines `loadPhotos`. To keep this task self-contained and the syntax check green, add a TEMPORARY stub now and Task 3 will replace it:
> ```js
> function loadPhotos(r){ $('detphotos').textContent = r.hp ? 'Laster…' : 'Ingen registrerte foto.'; }
> ```
> Place the stub right after `closeDetail()`. Task 3 replaces the stub body.

- [ ] **Step 4: Wire the "Detaljer" button into the popup.** Find the `popup(r)` return (line ~108–111). Change the final `+row('Gnr/Bnr',r.g+'/'+r.bn)+'</table>'+see+'</div>';` so a Detaljer button is appended after `see`:

Find:
```js
   +row('Gnr/Bnr',r.g+'/'+r.bn)+'</table>'+see+'</div>';
```
Replace with:
```js
   +row('Gnr/Bnr',r.g+'/'+r.bn)+'</table>'+see
   +'<div style="margin-top:6px"><button class="btn" data-det="1">Detaljer →</button></div></div>';
```

- [ ] **Step 5: Attach the handler on popup open.** Find the marker loop (lines ~101–103):
```js
for(const r of DATA){ if(!r.ll) continue;
  const m=L.circleMarker(r.ll,{radius:5,color:'#222',weight:.5,fillColor:'#1f77b4',fillOpacity:.85});
  m.bindPopup(popup(r)); markers.push({rec:r,m}); }
```
Replace with:
```js
for(const r of DATA){ if(!r.ll) continue;
  const m=L.circleMarker(r.ll,{radius:5,color:'#222',weight:.5,fillColor:'#1f77b4',fillOpacity:.85});
  m.bindPopup(popup(r));
  m.on('popupopen',e=>{const b=e.popup.getElement().querySelector('[data-det]'); if(b) b.onclick=()=>openDetail(r);});
  markers.push({rec:r,m}); }
```

- [ ] **Step 6: Close-button + Escape wiring.** After the `closeDetail()` function (or near other control listeners ~173), add:
```js
$('detclose').onclick=closeDetail;
document.addEventListener('keydown',e=>{if(e.key==='Escape')closeDetail();});
```

- [ ] **Step 7: Verify.** Syntax check (`SYNTAX_OK`) + `npm test` (27 pass). Browser: click a marker → popup shows a "Detaljer →" button → clicking it slides in the right panel with the title, the heritage section (a colored confidence tag + Kulturminnesøk link for matched records, or "Ingen registrert lokalitet" otherwise), and the full detail list. The × button and Escape close it. Photos area shows the stub text.

- [ ] **Step 8: Commit.**
```bash
git add index.html
git commit -m "feat(ui): add detail side-panel with baked fields + Kulturminnesøk section"
```

---

## Task 3: Live photos in the detail panel

**File:** `index.html` (replace the `loadPhotos` stub from Task 2; add lightbox CSS + element)

- [ ] **Step 1: Lightbox CSS.** Inside `<style>` before `</style>`:
```css
 .detthumbs{display:grid;grid-template-columns:repeat(3,1fr);gap:6px;margin-top:4px}
 .detthumbs img{width:100%;height:74px;object-fit:cover;border-radius:5px;cursor:pointer;background:#eee}
 .detcred{font-size:11px;color:#999;margin-top:6px;line-height:1.4}
 #lightbox{position:fixed;inset:0;background:rgba(0,0,0,.85);display:flex;align-items:center;justify-content:center;z-index:2000;flex-direction:column;gap:10px}
 #lightbox.hidden{display:none}
 #lightbox img{max-width:92vw;max-height:80vh;object-fit:contain;border-radius:4px}
 #lightbox .lbcap{color:#eee;font-size:12px;max-width:90vw;text-align:center}
 #lightbox .lbclose{position:absolute;top:14px;right:18px;color:#fff;background:none;border:none;font-size:30px;cursor:pointer}
```

- [ ] **Step 2: Lightbox element.** Immediately after the `#detail` element added in Task 2 (after its closing `</div>`), add:
```html
<div id="lightbox" class="hidden"><button class="lbclose" title="Lukk">×</button><img alt=""/><div class="lbcap"></div></div>
```

- [ ] **Step 3: Replace the `loadPhotos` stub** (added in Task 2) with the real implementation:

Find:
```js
function loadPhotos(r){ $('detphotos').textContent = r.hp ? 'Laster…' : 'Ingen registrerte foto.'; }
```
Replace with:
```js
let photoToken=0;
function loadPhotos(r){
  const box=$('detphotos');
  if(!r.hp||!r.dq){ box.textContent='Ingen registrerte foto.'; return; }
  box.textContent='Laster foto…';
  const myToken=++photoToken;
  fetch('/api/photos?dq='+encodeURIComponent(r.dq))
    .then(res=>{ if(!res.ok) throw new Error('http '+res.status); return res.json(); })
    .then(list=>{
      if(myToken!==photoToken) return;           // a newer panel opened; ignore stale result
      if(!Array.isArray(list)||!list.length){ box.textContent='Ingen foto funnet.'; return; }
      const grid=document.createElement('div'); grid.className='detthumbs';
      list.forEach(p=>{ const im=document.createElement('img'); im.src=p.thumb; im.alt=p.title||''; im.loading='lazy';
        im.onclick=()=>openLightbox(p); grid.appendChild(im); });
      box.innerHTML=''; box.appendChild(grid);
      const cred=document.createElement('div'); cred.className='detcred';
      cred.textContent='Foto fra DigitaltMuseum. Klikk for større visning.';
      box.appendChild(cred);
    })
    .catch(()=>{ if(myToken!==photoToken) return;
      box.textContent='Kunne ikke laste foto (krever publisert versjon med backend).'; });
}
function openLightbox(p){
  const lb=$('lightbox'); lb.querySelector('img').src=p.full||p.thumb;
  const owner=[p.owner,p.license].filter(Boolean).join(' · ');
  lb.querySelector('.lbcap').innerHTML=esc([p.title,owner].filter(Boolean).join(' — '))
    +(p.dimuUrl?' · <a style="color:#9cf" target="_blank" rel="noopener" href="'+p.dimuUrl+'">DigitaltMuseum ↗</a>':'');
  lb.classList.remove('hidden');
}
```

- [ ] **Step 4: Lightbox close wiring.** Near the other listeners (after `$('detclose').onclick=closeDetail;`), add:
```js
$('lightbox').querySelector('.lbclose').onclick=()=>$('lightbox').classList.add('hidden');
$('lightbox').addEventListener('click',e=>{if(e.target.id==='lightbox')$('lightbox').classList.add('hidden');});
```
Also extend the existing Escape handler so it closes the lightbox first. Find:
```js
document.addEventListener('keydown',e=>{if(e.key==='Escape')closeDetail();});
```
Replace with:
```js
document.addEventListener('keydown',e=>{if(e.key==='Escape'){const lb=$('lightbox'); if(!lb.classList.contains('hidden'))lb.classList.add('hidden'); else closeDetail();}});
```

- [ ] **Step 5: Verify.** Syntax check + `npm test`. Browser served WITH the backend (`npx vercel dev`, then open the local URL): open a detail panel for a record that has the green ring → thumbnails load; clicking a thumb opens the lightbox with caption + DigitaltMuseum link; Escape closes lightbox then panel. Open a record with no photo → "Ingen registrerte foto." Open `index.html` directly as a file (no backend) → a has-photo record shows "Kunne ikke laste foto (krever publisert versjon…)" and the rest of the panel still works. (Note: the `demo` DiMu key may rate-limit; a few records may intermittently show the error — acceptable.)

- [ ] **Step 6: Commit.**
```bash
git add index.html
git commit -m "feat(ui): live photo gallery + lightbox in detail panel"
```

---

## Task 4: Deep-link to a building (`obj=<index>`)

**File:** `index.html` (after markers/IDX setup, `updateHash`, `restoreHash`, init)

- [ ] **Step 1: Build a stable record index.** Immediately after the markers loop (after the `for(const r of DATA){ ... markers.push... }` block, ~line 103), add:
```js
const IDX=new Map(); DATA.forEach((r,i)=>IDX.set(r,i));
const objId=r=>IDX.get(r);
```

- [ ] **Step 2: Serialize the open panel.** In `updateHash()`, find:
```js
  if(hidden.size)p.set('h',JSON.stringify([...hidden]));
```
Add immediately after:
```js
  if(currentDetail!=null && objId(currentDetail)!=null) p.set('obj',objId(currentDetail));
```

- [ ] **Step 3: Restore the open panel.** `openDetail`/`closeDetail` are function declarations (hoisted), so they're safe to call from `restoreHash`. In `restoreHash()`, find:
```js
    if(p.get('h')){try{JSON.parse(p.get('h')).forEach(k=>hidden.add(k));}catch(e){}}
```
Add immediately after (still inside the `try`):
```js
    if(p.get('obj')!=null){const oi=+p.get('obj'); const rr=DATA[oi];
      if(rr){ setTimeout(()=>{ openDetail(rr); if(rr.ll) map.setView(rr.ll, Math.max(map.getZoom(),16)); },0); }}
```

> The `setTimeout(...,0)` defers the open until after the synchronous init (`render()`, `fitBounds`) so the panel and map view aren't immediately overridden.

- [ ] **Step 4: Verify.** Syntax check + `npm test`. Browser: open a detail panel, copy the URL (note `obj=<n>` in the hash), reload the page in a new tab → the same building's panel opens automatically and the map centers on it. Close the panel → `obj` disappears from the URL. A made-up `#obj=999999` does nothing (no crash).

- [ ] **Step 5: Commit.**
```bash
git add index.html
git commit -m "feat(ui): deep-link to a building via obj= hash param"
```

---

## Task 5: Mobile layout pass

**File:** `index.html` (CSS media query ~29, control panel header ~33, a small toggle)

- [ ] **Step 1: Detail panel as a bottom sheet on mobile + touch sizing.** Find the existing media query (line ~29):
```css
 @media(max-width:780px){#map{right:0;bottom:52%}#panel{top:48%;width:auto;left:0;border-left:none;border-top:1px solid #ddd}}
```
Replace with:
```css
 @media(max-width:780px){
   #map{right:0;bottom:52%}
   #panel{top:48%;width:auto;left:0;border-left:none;border-top:1px solid #ddd}
   #panel.collapsed{top:auto;bottom:0;height:42px;overflow:hidden}
   #map.expanded{bottom:42px}
   #detail{top:auto;left:0;right:0;width:auto;max-width:none;height:80%;border-left:none;border-top:1px solid #ddd;box-shadow:0 -4px 16px rgba(0,0,0,.15)}
   #detail.hidden{transform:translateY(110%)}
   .detthumbs{grid-template-columns:repeat(4,1fr)}
   .btn{padding:8px 12px}
   .legrow{padding:7px 0}
   #paneltoggle{display:block}
 }
 #paneltoggle{display:none;position:absolute;top:8px;right:10px;z-index:1100;border:1px solid #ccc;background:#fff;border-radius:6px;font-size:12px;padding:4px 8px;cursor:pointer}
```

- [ ] **Step 2: Add the controls-collapse toggle button.** Find the `#panel` opening + first heading (lines ~32–33):
```html
<div id="panel">
 <h1>Kulturminner i Drammen</h1>
```
Replace with:
```html
<div id="panel">
 <button id="paneltoggle" title="Vis/skjul kontroller">☰ Filtre</button>
 <h1>Kulturminner i Drammen</h1>
```

- [ ] **Step 3: Toggle behavior.** Near the other listeners (~173), add:
```js
$('paneltoggle').onclick=()=>{ $('panel').classList.toggle('collapsed'); $('map').classList.toggle('expanded');
  setTimeout(()=>map.invalidateSize(),210); };
```
(`invalidateSize` lets Leaflet recompute tiles after the map area resizes.)

- [ ] **Step 4: Verify.** Syntax check + `npm test`. In the browser at a narrow width (DevTools device toolbar, ≤780px): the control panel sits at the bottom; the "☰ Filtre" button collapses/expands it and the map grows/shrinks accordingly (no grey tile gaps after toggling). Opening a detail panel slides a bottom sheet up covering ~80% height; closing slides it down. Thumbnails show 4 across; buttons/legend rows are comfortably tappable.

- [ ] **Step 5: Commit.**
```bash
git add index.html
git commit -m "feat(ui): mobile bottom-sheet detail panel + collapsible controls"
```

---

## Self-Review (completed during planning)

**Spec coverage:**
- Detail side-panel with photos + Kulturminnesøk → Tasks 2 (panel + heritage), 3 (photos). ✓
- "Has photo" filter + marker hint → Task 1. ✓
- Deep-link to a building → Task 4. ✓
- Mobile layout pass → Task 5. ✓
- Graceful local-file degradation (photos) → Task 3 catch branch shows a friendly message; everything else works offline. ✓
- Honest confidence handling → Task 2 colored `kctag` (sikkert/trolig/mulig). ✓

**Placeholder scan:** The only deliberate temporary is the `loadPhotos` stub in Task 2, explicitly replaced in Task 3 Step 3 — called out so the syntax check stays green between tasks.

**Consistency:** `openDetail`/`closeDetail`/`currentDetail`/`loadPhotos`/`openLightbox`/`objId`/`IDX`/`esc`/`localityLink` are introduced once and referenced consistently. New hash keys `p` (onlyPhoto) and `obj` (open panel) don't collide with existing keys (`dim`,`y0`,`y1`,`u`,`c`,`q`,`h`). The ring reuses `setStyle` inside the existing `render` loop (not a new layer). `localityLink` mirrors the Plan-1 `lib/heritage.js` derivation (strip `-` suffix).

**File-size caution:** All edits target the readable CSS/HTML/script ranges; line 64 (`DATA`) is never touched. Subagents must read only the ranges they edit.

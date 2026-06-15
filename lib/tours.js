// lib/tours.js
import { haversine } from './geo.js';

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

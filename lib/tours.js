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

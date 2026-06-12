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

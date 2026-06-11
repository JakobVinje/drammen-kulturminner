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

// First inner text of <app:TAG>…</app:TAG> within a block.
// Uses the 's' (dotAll) flag so '.' matches newlines for multiline tag content.
// NOTE: The plan's original ([\\s\\S]*?) produces [sS] in the compiled regex (a character
// class matching only 's' and 'S'), which fails against real GML. Fixed to use (.*?) with 's'
// dotAll flag — functionally equivalent and correct for all content including multiline.
function tag(block, name) {
  const m = block.match(new RegExp('<app:' + name + '>(.*?)<\\/app:' + name + '>', 's'));
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

// Ray-casting point-in-polygon test.
// coords is an array of [lat, lon] pairs (the ring). Treats lon as x, lat as y.
export function pointInPoly(coords, lat, lon) {
  if (!coords?.length) return false;
  let inside = false;
  const n = coords.length;
  for (let i = 0, j = n - 1; i < n; j = i++) {
    const [yi, xi] = coords[i]; // lat=y, lon=x
    const [yj, xj] = coords[j];
    const intersects =
      yi > lat !== yj > lat &&
      lon < ((xj - xi) * (lat - yi)) / (yj - yi) + xi;
    if (intersects) inside = !inside;
  }
  return inside;
}

// Minimum haversine distance from (lat, lon) to any vertex in coords.
function minVertexDist(coords, lat, lon) {
  let min = Infinity;
  for (const [vLat, vLon] of coords) {
    const d = haversine(lat, lon, vLat, vLon);
    if (d < min) min = d;
  }
  return min;
}

// Nearest feature to (lat, lon) → {feature, dist} in meters, or null.
// dist is 0 if the point is inside the feature's polygon, else minimum vertex distance.
export function pickNearest(features, lat, lon) {
  let best = null;
  for (const f of features ?? []) {
    if (!f.coords?.length) continue;
    const dist = pointInPoly(f.coords, lat, lon) ? 0 : minVertexDist(f.coords, lat, lon);
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

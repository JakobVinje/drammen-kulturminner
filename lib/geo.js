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

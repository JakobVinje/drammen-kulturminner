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

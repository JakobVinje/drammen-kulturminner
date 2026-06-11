// api/photos.js
import { searchUrl, trimPhotos } from '../lib/dimu.js';

export default async function handler(req, res) {
  const dq = (req.query?.dq || '').toString();
  const page = Math.max(0, parseInt(req.query?.page, 10) || 0);
  if (!dq.trim() || dq.length > 200) {
    return res.status(400).json({ error: 'missing or invalid dq' });
  }
  const key = process.env.DIMU_API_KEY || 'demo';
  try {
    const r = await fetch(searchUrl(dq, page, key, 24));
    if (!r.ok) return res.status(502).json({ error: `upstream ${r.status}` });
    const json = await r.json();
    res.setHeader('Cache-Control', 's-maxage=86400, stale-while-revalidate=86400');
    return res.status(200).json(trimPhotos(json));
  } catch (e) {
    return res.status(502).json({ error: 'upstream fetch failed' });
  }
}

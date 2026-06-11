// lib/dimu.js
// DigitaltMuseum Solr API — query/URL builders and response trimming.
// Field names reconciled against test/fixtures/dimu-search.json.

const SEARCH_ENDPOINT = 'https://api.dimu.org/api/solr/select';
const IMAGE_HOST = 'https://dms01.dimu.org/image';

// Free-text query for a record (address-based, always scoped to Drammen).
// Returns '' when neither address nor betegnelse is present (prevents match-all query).
export function buildQuery(record) {
  const place = (record.ad && record.ad.trim()) || (record.be && record.be.trim()) || '';
  if (!place) return '';
  return `Drammen ${place}`.replace(/\s+/g, ' ').trim();
}

// Paginated photo search URL. page is 0-based; rows defaults to 24.
// start = page * rows so the first call (page=0) starts at 0.
export function searchUrl(q, page, apiKey, rows = 24) {
  const params = new URLSearchParams({
    q,
    fq: 'artifact.type:Photograph',
    start: String(page * rows),
    rows: String(rows),
    wt: 'json',
    'api.key': apiKey,
  });
  return `${SEARCH_ENDPOINT}?${params.toString()}`;
}

// Count-only query (rows=0) — used by the offline enrichment script.
export function countUrl(q, apiKey) {
  return searchUrl(q, 0, apiKey, 0);
}

// Image delivery URL for a media identifier at a given pixel dimension.
// Valid dimensions include 'max', '800x800', '400x400'.
export function imageUrl(mediaId, dimension = '800x800') {
  return `${IMAGE_HOST}/${encodeURIComponent(mediaId)}?dimension=${dimension}`;
}

// Hit count from a Solr search response.
export function countHits(json) {
  return json?.response?.numFound ?? 0;
}

// Reduce a Solr search response to the minimal gallery payload.
// Field names (confirmed from fixture):
//   identifier.owner         — museum/owner abbreviation (e.g. "NF", "DMU")
//   artifact.ingress.license — array of license strings (may be absent)
//   artifact.ingress.title   — display title
//   artifact.uniqueId        — DiMu unique object id
//   artifact.defaultMediaIdentifier — media id for image delivery
export function trimPhotos(json) {
  const docs = json?.response?.docs ?? [];
  return docs
    .map((d) => {
      const mediaId = d['artifact.defaultMediaIdentifier'];
      if (!mediaId) return null;
      const rawLicense = d['artifact.ingress.license'];
      return {
        thumb: imageUrl(mediaId, '400x400'),
        full: imageUrl(mediaId, 'max'),
        title: d['artifact.ingress.title'] ?? '',
        owner: d['identifier.owner'] ?? '',
        license: Array.isArray(rawLicense)
          ? rawLicense.join(', ')
          : (rawLicense ?? ''),
        dimuUrl: d['artifact.uniqueId']
          ? `https://digitaltmuseum.org/${d['artifact.uniqueId']}`
          : '',
      };
    })
    .filter(Boolean);
}

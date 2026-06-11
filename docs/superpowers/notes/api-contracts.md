# API Contracts — Confirmed Against Live Fixtures

> Captured: 2026-06-11. All field names and URL patterns verified against
> `test/fixtures/dimu-search.json` and `test/fixtures/arcgis-query.json`.

---

## Part 1 — DigitaltMuseum (DiMu) Solr API

### Confirmed search endpoint

```
https://api.dimu.org/api/solr/select
```

### Working query that returns ≥1 photo doc

```
https://api.dimu.org/api/solr/select?q=Drammen+Bragernes&fq=artifact.type:Photograph&rows=3&wt=json&api.key=demo
```

- `q` — free-text query (prefix with "Drammen" for location scoping)
- `fq=artifact.type:Photograph` — filter to photographs only
- `wt=json` — response format
- `api.key=demo` — public demo key; use `DIMU_API_KEY` env var in production
- `rows` — number of results (0 for count-only queries)
- `start` — offset for pagination (0-based)

### JSON path to hit count

```
response.numFound         (integer; 214 in the captured fixture)
```

### Doc field names (confirmed in `test/fixtures/dimu-search.json`)

| Purpose | Field name | Example value |
|---------|-----------|---------------|
| Artifact unique ID | `artifact.uniqueId` | `"011013417696"` |
| Media/image identifier | `artifact.defaultMediaIdentifier` | `"012s7YYr84ea"` |
| Title | `artifact.ingress.title` | `"Stereoskopi. Interiør i Bragernes kirke"` |
| Owner/museum code | `identifier.owner` | `"NF"` |
| Owner name (if needed) | `artifact.ownerName` | _(absent in some docs — falls back to `identifier.owner`)_ |
| License | `artifact.ingress.license` | `["CC pdm"]` (array) |
| Photographer | `artifact.ingress.producer` | `"Ukjent"` |
| UUID | `artifact.uuid` | `"f3f9874d-2ed3-4b65-b148-36362e9fb1c8"` |
| Has pictures flag | `artifact.hasPictures` | `true` |
| Picture count | `artifact.pictureCount` | `1` |

> **Note on `artifact.ownerName`:** This field was absent from the captured docs.
> Use `identifier.owner` (the museum short code) as the owner field. `lib/dimu.js`
> should fall back gracefully when `artifact.ownerName` is absent.

### Image delivery URL pattern

Confirmed from `retrieving-media.md` in the DiMu API documentation and verified
by `curl -I` (returned HTTP 200, `Content-Type: image/webp`):

```
https://dms01.dimu.org/image/<mediaIdentifier>?dimension=<size>
```

- **Subdomain:** `dms01` through `dms09` (any works; `dms01` is reliable)
- **Sizes:** `max`, `1200x1200`, `800x800`, `600x600`, `400x400`, `250x250`
- **Format returned:** JPEG or WebP (server negotiates)
- **CORS:** `Access-Control-Allow-Origin: *` confirmed

**Verified curl:**
```
curl -I "https://dms01.dimu.org/image/012s7YYr84ea?dimension=400x400"
→ HTTP/1.1 200 OK
→ Content-Type: image/webp
→ Access-Control-Allow-Origin: *
```

> **Alternative base URL:** `api.dimu.org/image/<id>?dimension=<size>` also works
> and is used in the `lib/dimu.js` plan. Both are functionally equivalent; the
> `dms0[1-9].dimu.org` pattern is the canonical form per official documentation.

### `lib/dimu.js` field access

```js
const mediaId = d['artifact.defaultMediaIdentifier'];   // string
const title   = d['artifact.ingress.title']    ?? '';   // string
const owner   = d['identifier.owner']          ?? '';   // string (use this, not ownerName)
const license = d['artifact.ingress.license']  ?? [];   // string[]
const uniqueId = d['artifact.uniqueId']        ?? '';   // string → digitaltmuseum.org/<uniqueId>
```

---

## Part 2 — Kulturminnesøk / Askeladden Lokaliteter

### Service availability finding (important for later tasks)

**Riksantikvaren does not currently expose a public unauthenticated ArcGIS REST
FeatureServer for Kulturminnesøk.** Extensive investigation (2026-06-11):

- `https://kart.ra.no/arcgis/rest/services` — only `MABYGIS`, `Andretjenester`,
  `Utilities` folders are public. `Askeladden` folder exists but requires token.
- `Distribusjon/Kulturminner20180301/MapServer` — 404 (decommissioned).
- `Geonorge/Kulturminner/MapServer` — 404.
- `husmann.ra.no` — DNS does not resolve (decommissioned host).
- `askeladden_wms.ra.no` — DNS does not resolve (decommissioned host).
- Current public distribution: WMS at `kart.ra.no/wms/kulturminner2` (image tiles
  only, not feature-queryable) and WFS at `wfs.geonorge.no/skwms1/wfs.kulturminner`
  (GML output only, no JSON).

### Working spatial query service

The Geonorge WFS is the authoritative public spatial query service for Askeladden data:

```
https://wfs.geonorge.no/skwms1/wfs.kulturminner
```

- **Feature types available:** `app:Lokalitet`, `app:Enkeltminne`, `app:Sikringssone`
- **Output formats:** `text/xml; subtype=gml/3.2.1`, `application/gml+xml; version=3.2`
  (JSON not supported)
- **Spatial query example (BBOX near Drammen):**
  ```
  ?SERVICE=WFS&VERSION=2.0.0&REQUEST=GetFeature
  &typeNames=app:Lokalitet
  &count=5
  &BBOX=10.18,59.72,10.24,59.76,EPSG:4326
  ```

### Fixture format decision

Since the WFS returns GML (not ArcGIS JSON), `test/fixtures/arcgis-query.json`
was built by fetching WFS features and **converting to ArcGIS-compatible JSON**
with `features[].attributes` + `features[].geometry` structure. The fixture contains
5 real Lokalitet records from Drammen municipality (kommunenummer 3301).

`lib/heritage.js` and `api/heritage.js` must be written against this converted format
(WFS→JSON conversion happens in `lib/heritage.js`'s `queryUrl` / fetch logic).

**Recommended approach for `lib/heritage.js`:** Replace the ArcGIS REST `queryUrl`
with a WFS BBOX query, fetch the GML response, parse with `DOMParser` or a lightweight
XML parser, and return the same `{features}` shape as the fixture. Alternatively,
perform the conversion inline.

### Confirmed attribute field names (from `test/fixtures/arcgis-query.json`)

| Purpose | Field name | Example value |
|---------|-----------|---------------|
| Locality ID | `LOKALITETID` | `"276126-0"` |
| Internal object ID | `OBJECTID` | `"151932"` |
| GML-level local ID | `LOKAL_ID` | `"276126-0"` |
| Description/info | `INFORMASJON` | `"Telefonkiosk, inngår i verneavtale…"` |
| Municipality number | `KOMMUNE` | `"3301"` |
| Count of enkeltminner | `ANTALL_ENKELTMINNER` | `"1"` |
| Locality category | `LOKALITETSKATEGORI` | `"L-BVF"` (bygning/fredning) |
| Locality art (code) | `LOKALITETSART` | `"20117"` |
| Original function (code) | `OPPRINNELIG_FUNKSJON` | `"2000"` |
| Visible | `SYNLIG` | `"true"` |
| Source/registrar | `OPPHAV` | `"Buskerud fylkeskommune"` |
| Updated date | `OPPDATERINGSDATO` | `"2024-01-06T13:37:05"` |
| Capture date | `DATAFANGSTDATO` | `"2021-03-01T00:00:00"` |
| Protection type | `VERNETYPE` | `"STAT"` (see codes below) |
| Protection date | `VERNEDATO` | `"2007-06-19"` |
| Link to Askeladden | `LINK_ASKELADDEN` | `"https://askeladden.ra.no/askeladden/?kid=276126-0"` |
| Link to Kulturminnesøk | `LINK_KULTURMINNESOK` | `"https://kulturminnesok.no/ra/lokalitet/276126"` |

> **Note on dating/datering:** The WFS `app:Lokalitet` feature type does not have a
> flat `DATERING` (dating) field at locality level — dating is on individual
> `app:Enkeltminne` features. Use `DATAFANGSTDATO` as a proxy or query enkeltminner
> for per-monument dating.

### VERNETYPE codes observed in fixture

| Code | Meaning |
|------|---------|
| `STAT` | Statlig fredning (state protection) |
| `FPG` | Fredning pålegg (protection order) |
| `AUT` | Automatisk fredning (automatic protection — pre-1537 etc.) |
| `UAV` | Uavklart (unresolved/unknown) |
| `LIST` | Listingsbeskyttelse (listing protection) |

### Geometry shape

All 5 captured features use **polygon rings** (not point geometry):

```json
"geometry": {
  "rings": [
    [ [lon, lat], [lon, lat], ... ]   // closed ring, WGS84
  ]
}
```

The centroid of `rings[0]` can be computed as the mean of all `[lon, lat]` pairs.
`lib/heritage.js`'s `featureCoord()` already handles this via the `ring` branch.

### Kulturminnesøk detail URL pattern

Given a `LOKALITETID` (e.g. `"276126-0"`), the canonical kulturminnesøk URL is:

```
https://kulturminnesok.no/ra/lokalitet/<numeric part>
```

e.g. `LOKALITETID = "276126-0"` → `https://kulturminnesok.no/ra/lokalitet/276126`

Strip the `-N` suffix from the ID to get the numeric part for the URL.

### `lib/heritage.js` field access

```js
const a = feature.attributes;
const id         = a.LOKALITETID ?? a.OBJECTID;          // "276126-0"
const name       = a.LOKALITETSKATEGORI ?? '';            // category code (no free-text name at locality level)
const dating     = a.DATAFANGSTDATO ?? '';                // capture/registration date
const protection = a.VERNETYPE ?? '';                     // vern code
const description = a.INFORMASJON ?? '';                  // free-text description
const idNum      = (id ?? '').toString().split('-')[0];
const url        = idNum ? `https://kulturminnesok.no/ra/lokalitet/${idNum}` : '';
```

> **Note on `name`:** The `app:Lokalitet` feature type does not carry a plain
> `NAVN` (name) field at locality level in the WFS schema. Use `INFORMASJON` as the
> description and `LOKALITETSKATEGORI` as the category code. Free-text names live on
> individual enkeltminner. `trimLocality()` in `lib/heritage.js` should reflect this.

---

## Summary table for task implementors

| What | Confirmed value |
|------|----------------|
| DiMu search base URL | `https://api.dimu.org/api/solr/select` |
| DiMu hit count path | `response.numFound` |
| DiMu media ID field | `artifact.defaultMediaIdentifier` |
| DiMu image URL pattern | `https://dms01.dimu.org/image/<id>?dimension=<size>` |
| DiMu title field | `artifact.ingress.title` |
| DiMu owner field | `identifier.owner` (NOT `artifact.ownerName`) |
| DiMu license field | `artifact.ingress.license` (string array) |
| DiMu unique ID field | `artifact.uniqueId` |
| Heritage spatial query service | Geonorge WFS `wfs.geonorge.no/skwms1/wfs.kulturminner` |
| Heritage feature type | `app:Lokalitet` |
| Heritage locality ID field | `LOKALITETID` |
| Heritage description field | `INFORMASJON` |
| Heritage protection field | `VERNETYPE` |
| Heritage geometry | Polygon rings `geometry.rings[0]` |
| Heritage detail URL | `kulturminnesok.no/ra/lokalitet/<numeric-id>` |
| ArcGIS REST FeatureServer | **Does not exist publicly** (decommissioned) |

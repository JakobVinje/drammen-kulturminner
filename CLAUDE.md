# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

A self-contained, dependency-free data-visualization of registered cultural heritage objects
(*kulturminner*) in Drammen, Norway. There is **no build system, package manager, tests, or
backend** — each file is a single static HTML page you open directly in a browser. The UI and
all source comments are in Norwegian.

Source data: Jo. Sellæg / Drammen kommune cultural-heritage registrations (2004–2016), digitized
from `v2---kulturminneregistreringer-1.pdf`. Drammen's `kommunenummer` is **3301** (used in all
geocoding API calls).

The project now also includes a Vercel backend (`api/`), an offline enrichment
script (`scripts/enrich.mjs`), and unit-tested shared logic (`lib/`, `test/`).
Run tests with `npm test`; run enrichment with `npm run enrich`.

## Files

- **`index.html`** — the deliverable. A Leaflet map of every registered object.
  All records are embedded inline as `const DATA=[...]` (line 64; one very long line). Libraries
  load from CDN: Leaflet 1.9.4, leaflet.markercluster 1.5.3, Chart.js 4.4.1. To view: open the
  file in a browser (needs internet for CDN + map tiles).
- **`_geocode_runner.html`** — one-off tooling that produced the coordinates in `DATA`. Open in a
  browser, let it run, copy the JSON from the output textarea. See "Regenerating coordinates".
- **`v2---kulturminneregistreringer-1.pdf`** — the source registration document `DATA` is derived from.

## Data model

Each record `r` in `DATA` uses short keys. Knowing these is essential before editing rendering,
filtering, or export logic:

| key | meaning | notes |
|-----|---------|-------|
| `ll` | `[lat, lon]` | absent → object is excluded from the map (but still exported). 38 records lack a matrikkel hit. |
| `g` / `bn` | gnr / bnr | matrikkel id; links to seeiendom.kartverket.no |
| `be` | betegnelse | |
| `ad` | adresse | |
| `f` | funksjon | |
| `kat` | bygningskategori | keys must match `KAT` color map |
| `sn` | arkitektonisk stil | keys must match `STIL` color map |
| `mi` | kulturmiljø | colors assigned dynamically (`MIcol`) by frequency |
| `ar` | byggeår (display text) | |
| `y` | numeric year | drives the timeline + decade chart; may be absent |
| `v` | kulturminneverdi | one of `S`/`H`/`M`/`L` (see `VERDI`) |
| `vn` | vernestatus | keys must match `VERN` color map |
| `fr` | fredet (bool) | |

## Architecture of `index.html`

Plain DOM + Leaflet, no framework. Flow: parse `DATA` → build one `L.circleMarker` per record
with `ll` → `render()` recomputes the visible set on every interaction.

- **Coloring dimensions** — `dimConf(d)` (line 74) returns `{get, order, color, label}` for the five
  selectable dimensions (`v`, `kat`, `sn`, `vn`, `mi`). Color constants `VERDI`/`KAT`/`STIL`/`VERN`
  are fixed maps; `mi` colors are derived at load from `PAL`. Adding a category value that has no
  entry in its color map falls back to gray `#999` — add the key to the map to give it a real color.
- **`render()`** (line 146) is the single source of truth: applies `visible(r)` (line 113, combines
  legend filter + year range + text search), restyles markers by current dimension, swaps between the
  `cluster` and `plain` layer groups, updates the status line, and refreshes the chart.
- **State** lives in module-level vars (`dim`, `hidden`, `q`, `y0`, `y1`, `hideUnd`, `useCluster`) and
  is serialized to the URL hash via `updateHash()`/`restoreHash()` — every control change produces a
  shareable permalink.
- **Chart** — `updateChart()` (line 129) bins visible *dated* records into decades, stacked by the top-10
  categories of the current dimension (rest grouped as "Andre").
- **Export** — `#geojson` and `#csv` handlers (lines 209–210) re-derive long field names from the short
  keys; keep these in sync with the data model if keys change.
- **Basemaps** — OSM plus Kartverket WMTS (gråtone/topo) and Esri World Imagery flyfoto.

## Regenerating coordinates (`_geocode_runner.html`)

Coordinates are not stored in the source PDF — they are looked up from gnr/bnr (and some addresses)
via Kartverket/Geonorge public APIs:

- Matrikkel (gnr/bnr): `https://api.kartverket.no/eiendom/v1/geokoding?kommunenummer=3301&gardsnummer=…&bruksnummer=…`
- Address fallback: `https://ws.geonorge.no/adresser/v1/sok?kommunenummer=3301&...`

The page runs a `TASKS` array through 10 concurrent `worker`s, retrying transient failures, and writes
the result map `{ "MAT|<g>|<bn>": [lat, lon], ... }` to the output textarea as JSON. That JSON is what
gets merged into the `ll` fields of `DATA` in `index.html`. Coordinates are rounded to 6
decimals. Because the APIs are public and live, this must run in a browser (CORS), not headless.

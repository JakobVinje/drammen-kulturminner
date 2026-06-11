# Design: Photos, heritage details & Vercel backend for the Drammen kulturminner map

**Date:** 2026-06-11
**Status:** Approved (design); implementation not started
**Topic:** Enrich `kulturminner-kart.html` with DigitaltMuseum photos and Kulturminnesøk details, hosted on Vercel with a thin proxy.

## Goal

Add five features to the existing self-contained Leaflet map of Drammen cultural-heritage objects:

1. Host the map on **Vercel** with a **thin serverless proxy** (so external API keys stay server-side).
2. A **detail side-panel** showing photos (DigitaltMuseum) + heritage info (Kulturminnesøk).
3. A **"has photo" filter + marker hint**.
4. **Deep-link to a specific building**.
5. A **mobile layout pass**.

The deliverable must remain **openable as a local file** (degrading gracefully when `/api` is absent).

## Architecture — Approach C (hybrid)

The "has photo" filter requires the map to instantly know which of ~2,000 objects have a photo, which is impossible to do live per-toggle. That forces an **offline enrichment step**. The hybrid splits responsibilities:

- **Offline enrichment** bakes lightweight match metadata into `DATA` (powers filter + marker ring instantly, zero runtime API calls).
- **Live proxy** fetches the actual photo gallery + full heritage details on demand only when a detail panel opens (fresh, paginated, edge-cached).

### Repo structure

```
/  (Vercel project root)
├─ index.html              ← renamed from kulturminner-kart.html (still works opened locally)
├─ api/
│  ├─ photos.js            ← serverless proxy → DigitaltMuseum (holds DIMU_API_KEY)
│  └─ heritage.js          ← serverless proxy → Kulturminnesøk ArcGIS REST
├─ scripts/
│  └─ enrich.mjs           ← offline Node script: bakes match metadata into DATA
├─ _geocode_runner.html    ← unchanged existing one-off tooling
└─ vercel.json             ← minimal routing/config (may be omitted)
```

### Local-degradation stance

Opened as a local file (no `/api`): filter, markers, deep-link, and all baked data work fully. Only the live photo gallery and live heritage detail degrade to a "no photos / open on hosted site" empty state. The static deliverable stays usable offline.

## External APIs (verified 2026-06-11)

- **DigitaltMuseum** — `api.dimu.org`. Requires an API key (`demo` works for testing). Query via `q` + field filters; images served by identifier at chosen resolution. **Photo matching is text/address-based → inherently fuzzy.**
- **Kulturminnesøk** — built on Askeladden, exposed as an **ArcGIS REST FeatureServer** (JSON), plus WFS/WMS. Supports **spatial queries**, so we match by *nearest locality to the object's `ll` coordinate* — far more reliable than address text.

## Data model changes

The enrichment step adds four short keys per record `r` in `DATA` (terse-key convention):

| key | meaning | set by | used by |
|-----|---------|--------|---------|
| `hp` | `hasPhoto` (bool) — DigitaltMuseum has ≥1 matching image | offline enrich | "has photo" filter + marker ring |
| `dq` | the DigitaltMuseum query string that produced the match | offline enrich | live `api/photos.js` re-runs it for the gallery |
| `km` | Kulturminnesøk locality id (Askeladden `lokalitetsID`), or absent | offline enrich | deep-link + live `api/heritage.js` |
| `kc` | confidence for `km`: `"h"`/`"m"`/`"l"` (distance-banded) | offline enrich | panel "likely/possible match" caveat |

Decisions:
- **Bake `dq` (how to find photos), not photo URLs** — gallery stays fresh; `DATA` doesn't balloon.
- **`hp` is the only thing the filter needs** — cheap boolean.
- **`km`/`kc` from spatial match.** Confidence purely distance-banded: ≤25 m = `h`, ≤75 m = `m`, ≤150 m = `l`, beyond = no match.
- **Absent keys are normal** (like `ll` today). No `ll` → no `km` (can't spatial-match) but can still get `hp` via text search.
- **Size impact:** four small keys × ~2,000 records; `dq` is the only non-trivial one. Estimate +60–120 KB on the existing ~430 KB file — acceptable for a baked static asset.
- **Export logic** (`#geojson`/`#csv`) gains long-name columns for these, per existing pattern.

## Offline enrichment script (`scripts/enrich.mjs`)

Node script, run manually (like the geocoder). Safe, resumable, honest about fuzziness.

- **I/O:** reads the `DATA` array out of `index.html`, enriches, writes it back into the same `const DATA=[...]` line. Emits a sidecar `scripts/enrich-report.json` (per-object: query, hit count, matched locality, distance, confidence) so matches are auditable.
- **DigitaltMuseum lookup (`hp` + `dq`):** build `q` from address + "Drammen", scoped to image-bearing results. Count-only request → `count > 0` sets `hp=true` and stores the query in `dq`.
- **Kulturminnesøk lookup (`km` + `kc`):** for records with `ll`, query the ArcGIS REST FeatureServer for localities within 150 m, take nearest, band the distance into `h`/`m`/`l`. No `ll` → skip.
- **Robustness (mirrors the geocoder):** ~10-worker concurrency pool with retry/backoff; small inter-request delay (public APIs); resumable via `scripts/enrich-cache.json` keyed by object id; idempotent write-back that only fills/updates the four keys and never touches `ll`, `g`/`bn`, etc.
- **Key handling:** reads `DIMU_API_KEY` from `process.env`, falls back to `demo` for a dry run. Never written into `DATA` or committed.
- **No auto-trust of fuzzy matches:** bakes the boolean but the report exists for a human pass to tighten thresholds later. No silent over-claiming.

## Vercel serverless proxy

Two tiny same-origin, read-only GET endpoints, called only when a detail panel opens.

### `api/photos.js` — `GET /api/photos?dq=<query>&page=<n>`
- Reads `DIMU_API_KEY` from Vercel env, calls `api.dimu.org` with the baked `dq`, scoped to image results, paginated.
- Returns trimmed JSON: `[{ thumb, full, title, owner, license, dimuUrl }, ...]`.
- API key never reaches the browser.

### `api/heritage.js` — `GET /api/heritage?km=<lokalitetsId>`
- Queries the Kulturminnesøk ArcGIS REST FeatureServer for the locality's full attributes (name, dating, protection status, description, kulturminnesok.no link).
- Returns a trimmed JSON object. No key needed (open data), proxied for consistent same-origin calls.

### Cross-cutting (minimal, YAGNI)
- **Caching:** `Cache-Control: s-maxage=86400, stale-while-revalidate`; Vercel edge caches repeat opens. No DB, no KV.
- **Errors:** upstream failure/timeout → `502` + `{ error }`; panel shows "couldn't load," map stays usable.
- **Validation:** `dq`/`km` required and length-capped, else `400`.
- **No secrets in client, no write paths.**

## Side-panel UI, filter, deep-linking & mobile

### Detail side-panel
Keep the lightweight Leaflet popup for a quick glance; add a **"Detaljer →"** action that opens a **slide-in right-side panel**. Populated on open:
- **Header:** betegnelse, adresse, gnr/bnr (baked).
- **Photos:** lazy `fetch('/api/photos?dq=…')` on open; thumbnail grid, click to enlarge; each photo shows owner + license + link to DigitaltMuseum (attribution respected). Empty/error → "Ingen foto funnet" / "Kunne ikke laste foto."
- **Kulturminnesøk:** if `km` present, lazy `fetch('/api/heritage?km=…')` for dating/protection/description + kulturminnesok.no link. Confidence shown honestly: `kc=h` plain; `kc=m`/`l` labeled "mulig treff."
- All existing record fields move into the panel as a tidy definition list.

### "Has photo" filter + marker hint
- New **"Kun med foto"** checkbox folded into the existing `visible(r)` predicate (filters on `hp`).
- Objects with `hp` get a subtle **ring/outline** on their `circleMarker` (another style dimension in `render()`, not a new layer) so coverage is visible without filtering.

### Deep-linking
Add an **`obj=<id>`** key to the existing URL-hash state. On load, `restoreHash()` flies to that marker and opens its detail panel; opening a panel sets `obj` via `updateHash()`. One more hash field — no router.

### Mobile pass (no framework)
- Side-panel becomes a **bottom sheet** (full-width, swipe/tap-to-dismiss) under a width breakpoint.
- Controls panel collapses into a **toggle**.
- Touch-friendly hit targets; chart + legend reflow. Leaflet touch handling already on.

## Setup steps (captured so nothing surprises)

1. **Deploy once.** This folder isn't a Git repo. Either `git init` + push to GitHub (recommended — gives preview deploys), or deploy straight from the folder with the `vercel` CLI (`npm i -g vercel`, then `vercel`).
2. **Get a DigitaltMuseum API key.** `demo` works for building/testing; request a free own key before public deploy. Set it as `DIMU_API_KEY` in Vercel env vars.

## Out of scope (YAGNI)

No favorites, no user accounts, no offline photo caching, no print view. None requested.

## Known fuzziness / honesty notes

- DigitaltMuseum address-based matching yields false positives/negatives; many objects won't match. The enrichment report exists for human spot-checking and threshold tuning.
- Kulturminnesøk spatial matching is more reliable but still approximate; `kc` confidence is surfaced in the UI rather than hidden.
- Exact API field names/endpoints will be confirmed during implementation planning, not assumed here.

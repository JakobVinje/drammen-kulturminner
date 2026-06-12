# Design: Walking tours for the Drammen kulturminner map

**Date:** 2026-06-12
**Status:** Approved (design); implementation not started
**Topic:** Guided walking tours — ordered heritage stops drawn as a route on the map, with a browsable list + step-through player.

## Goal

Turn the existing map of ~2,003 heritage objects into something visitors *do*: walk curated and auto-generated routes through Drammen's cultural environments. A tour is an **ordered set of stops** drawn as a route line, with a player that flies the map stop-to-stop and opens each stop's detail.

Serves all audiences at once (public, personal, municipality, portfolio): engaging to use, civically useful, and a clear "walk the city's heritage" hook.

## Decisions (settled during brainstorming)

- **Tour source:** curated **+** auto fallback.
- **Route line:** live walking paths via a Vercel proxy (not baked), edge-cached.
- **Routing provider:** **OpenRouteService** (`foot-walking`) — OSM-based, free, no basemap coupling. Keep existing basemaps (OSM/Kartverket/Esri); Kartverket is the right fit for a Norwegian heritage map. (Mapbox considered and declined: TOS couples its routing to Mapbox basemaps; ORS solves it cleanly.)
- **Player:** **both** a browsable stop list **and** Prev/Next step-through. Reuses the existing detail panel for per-stop content.

## Architecture

Follows the established patterns: pure logic in `lib/` with `node --test`, a thin Vercel proxy holding the API key, UI in `index.html`, dependency-free, graceful local-file degradation.

### Two kinds of tours, unified at load
- **Curated** — a `TOURS` array baked into `index.html`: `{id, title, intro, stops:[…]}`. Seed **2–3 flagship tours** with real content; more are added by editing the array.
- **Auto** — generated client-side at load from `kulturmiljø` (`r.mi`): each miljø with ≥4 located objects becomes a tour, stops ordered by a nearest-neighbour walk, capped at ~20 stops. Zero authoring, zero storage. Empty/"uten miljø" excluded.

A registry built at load merges curated (first) + auto tours into the "Turer" selector.

### Stop references
Curated stops reference records by their **DATA index** — the same identity the existing `obj=` deep-link uses. DATA is static, so this is stable; the coupling is documented (re-running enrichment must not reorder DATA). A missing/out-of-range ref or a no-`ll` record is skipped with a console warning, never a crash.

### Units (new / changed)
| Unit | Responsibility |
|------|----------------|
| `lib/tours.js` | Pure, tested: `nearestNeighbourOrder(stops, start)`, `buildAutoTours(DATA, {minStops:4, maxStops:20})`, `resolveStops(tour, DATA)` (resolve refs → records, skip bad). |
| `lib/route.js` | Pure, tested: `parseCoords(param)` → `[[lat,lon]…]`; `orsBody(coords)` → `{coordinates:[[lon,lat]…]}` (axis swap); `parseRoute(geojson)` → `{line:[[lat,lon]…], distance, duration}`. |
| `api/route.js` | Serverless proxy → ORS `foot-walking`; key server-side; validation; edge-cache; 502 on upstream failure. The 2nd serverless function (alongside `api/photos.js`). |
| `index.html` | The `TOURS` array + tour UI (selector, focus mode, player); reuses `#detail`. |

## Routing proxy

**Endpoint:** `GET /api/route?coords=<lat,lon;lat,lon;…>` (natural order for `r.ll`).
- The proxy parses/validates coords (numeric; **caps waypoints at ~25** — under ORS limits, keeps tours walkable), swaps to ORS `[lon,lat]`, and POSTs to `https://api.openrouteservice.org/v2/directions/foot-walking/geojson` with `ORS_API_KEY` in the `Authorization` header (never reaches the client).
- Returns trimmed `{line:[[lat,lon]…], distance, duration}` for a Leaflet polyline + the "~1.2 km · ~15 min" header.
- **Caching:** a tour's coordinates never change → `Cache-Control: s-maxage=…, stale-while-revalidate`; the edge serves it after the first call (~one ORS request per tour ever), comfortably inside ORS's free quota (~2k/day).
- **Errors:** upstream failure/timeout/bad input → `4xx/502`.

**New secret:** `ORS_API_KEY` (free from openrouteservice.org) — documented in `.env.example` + README, set in Vercel env.

## Tour UX

**Discovery:** a "Turer" `<select>` in the control panel, grouped *Utvalgte turer* (curated) / *Kulturmiljø-turer* (auto), default "— ingen tur —".

**Entering a tour = focus mode:**
- Hide the normal filtered markers; show **numbered pins (1…N)** for the tour's stops.
- Draw the route line (ORS via proxy; **straight dashed fallback** labelled "omtrentlig rute" on any failure — so a tour always shows a connecting line, ORS is an enhancement).
- Fit the map to the tour; show the player; an **"Avslutt tur"** button exits and restores the prior map/filter state.

**Player — three surfaces, reusing existing UI:**
1. **Control panel** — tour section: title, intro, "~1.2 km · ~15 min", the **ordered stop list** ("① Tittel", click to jump), "Avslutt tur".
2. **Slim bottom bar over the map** (tour mode only): **‹ Forrige · 3/8 · Neste ›** + current stop title.
3. **Existing `#detail` panel** — opens automatically for the current stop (its photos/heritage/fields). No new detail UI.

Stepping (Prev/Next or list click): `map.flyTo(stop.ll, ~17)` → `openDetail(stop)` → highlight the active list row. A route-fetch **race** (switching tours mid-load) is dropped via a token guard (like `photoToken`).

**Deep-linking:** new hash keys `tour=<id>` and `stop=<n>` — a shareable "walk this tour at stop 3" URL that restores into focus mode at that stop; composes with existing hash state; `tour` takes precedence over a bare `obj`. Bad values no-op.

**Filter coexistence:** entering a tour snapshots and overrides the normal filtered view; exiting restores it exactly.

## Mobile

Reuses the Plan-2 mobile patterns. On mobile the **Prev/Next controls move into the detail bottom-sheet header** (one focused surface, no floating bar fighting the sheet); the "Turer" selector + stop list live in the collapsible control panel. Large touch targets; `flyTo` tuned against the sheet animation. Tour mode is the primary mobile use case (walking with a phone).

## Distance / time

ORS returns a summary (distance m, duration s) → shown as "~X km · ~Y min". For the straight-line fallback, estimate distance by summing haversine over the stops and assume ~5 km/h.

## Error handling (summary)

- Proxy: bad/missing coords → 400; upstream fail/timeout → 502.
- Client: any route failure → straight dashed fallback + "omtrentlig rute" note (works on local file with no backend, like photos).
- Auto tours: exclude empty miljø / <4 stops; cap 20 (note "viser de første 20" if truncated).
- Curated refs: skip missing/no-`ll`, console warn.
- Bad `tour=`/`stop=` hash values → no-op.

## Testing

- **Unit (`node --test`):** `lib/tours.js` (nearest-neighbour determinism; `buildAutoTours` min/max/empty-miljø rules; `resolveStops` skips bad refs) and `lib/route.js` (coord parse, lat/lon↔lon/lat swap, `parseRoute` against a **real captured ORS fixture**).
- **`api/route.js`:** handler test with stubbed `fetch` (success → `{line,distance,duration}`; bad/missing coords → 400; upstream fail → 502).
- **Verification:** real ORS smoke check (with a key) + mount-the-handler-over-HTTP check (as done for `/api/photos`); UI is manual browser click-test (honest that DOM needs human eyes) + syntax/structural checks.

## Implementation split (for planning)

Two plans, like before:
1. **Foundation** — `lib/tours.js`, `lib/route.js`, `api/route.js`, seed curated `TOURS`, ORS fixture + key docs, tests.
2. **UI** — tour selector, focus mode, the player (list + Prev/Next + reuse `#detail`), numbered pins, route rendering + fallback, deep-link, mobile.

## Out of scope (YAGNI)

No user-built/saved custom tours, no turn-by-turn voice/step directions, no offline tile caching, no per-tour photos beyond what stops already carry. Auto tours are per-`kulturmiljø` only (no clustering/geographic auto-grouping beyond that).

# Design: Tour wayfinding (live location + distance to stop)

**Date:** 2026-06-16
**Status:** Approved (design); implementation not started
**Topic:** Make the walking tours usable as a real outdoor field guide — a live "du er her" location dot, follow-mode, and a live distance-to-current-stop readout while on a tour.

## Goal

Sub-project 2 of the agreed tour-enhancement sequence (**content (done) → wayfinding (this) → themed tours (next)**). Let a visitor see where they are relative to the numbered tour pins and how far the next stop is, so the map works while actually walking Drammen.

## Decisions (from brainstorming)

- **Scope:** location dot (+ accuracy) + follow toggle + live "X m igjen til [stopp]" in tours. **Excluded (YAGNI):** auto-advance at arrival, bearing/compass arrow, start-at-nearest.
- The **location dot is map-global** (works anywhere); the **distance readout** only appears while in a tour.
- **`watchPosition`** (continuous), not one-shot — so the dot and distance update live as you walk.
- Geolocation needs a **secure context** (HTTPS / localhost). On `file://` or unsupported browsers the control is shown **disabled with a tooltip**, not broken.

## Architecture

All in `index.html` (plain DOM + Leaflet, no build step) plus one tiny tested helper in `lib/geo.js`. Reuses `haversine`.

### Location lifecycle
- A **`📍` Leaflet control**, bottom-right (visible even when the control panel is collapsed on mobile).
- Tap → `navigator.geolocation.watchPosition(...)` starts; tap again → stop + `clearWatch` + remove dot.
- On each fix: update the dot + accuracy circle; recenter iff `FOLLOWING`; update the tour distance readout if tracking + in a tour.

### Location layer
A dedicated `L.layerGroup` holding:
- **dot** — `L.circleMarker` (blue, white stroke).
- **accuracy circle** — `L.circle` radius = fix `accuracy` (m), faint fill.

### Follow state machine (Google-Maps style)
- `OFF` (default) → tap → `LOCATING` (awaiting first fix) → `FOLLOWING`.
- `FOLLOWING` → map recenters on each fix at a walking zoom (~16–17).
- **Follow pauses → `PAUSED`** whenever the map moves *away from the dot*: a user pan/zoom **or** a tour step's `flyTo`. The dot keeps updating; the map stays put.
- Tap while `PAUSED` → recenter + resume `FOLLOWING`. Tap while `FOLLOWING` → `OFF`.
- A `selfRecenter` flag marks our own programmatic recenters so they don't self-trigger the pause.

### Tour distance readout
- A `#tourdist` span in the existing step-through header (rendered by `openDetail` for a tour stop).
- Updated **live on each fix** and **on each step** with `≈ {formatDistance(haversine(myPos, tourStops[tourIdx].ll))}` — only when tracking + in a tour; empty/hidden otherwise.
- Distance is to the **current** stop (the one being walked to).

### Tiny tested helper
`formatDistance(m)` in `lib/geo.js`:
- `< 1000 m` → rounded to nearest 10 m, e.g. `"120 m"` (0 → `"0 m"`).
- `1000–9999 m` → kilometres, one decimal, **Norwegian comma**: `1250` → `"1,2 km"`.
- `>= 10000 m` → whole kilometres (no decimal): `12300` → `"12 km"`.
- Inline-mirrored in `index.html` (the file can't import modules on `file://`); the lib copy is the tested reference.

## UX states & graceful failure

**Button states:** `OFF` (outline) · `LOCATING` (subtle "…") · `FOLLOWING` (filled/blue) · `PAUSED` (distinct tint). Title/aria reflects the action.

**Failure handling:**
- **Insecure/unsupported** (`!navigator.geolocation` or `!isSecureContext`, incl. `file://`) → control **disabled**, tooltip "Posisjon krever https — åpne den publiserte siden." No broken clicks.
- **Permission denied** (error code 1) → reset to `OFF`, brief note "Posisjon avslått".
- **Unavailable / timeout** (codes 2/3) → keep the watch alive; the dot simply doesn't appear; no stuck "locating", no crash.
- **Poor accuracy** → conveyed by the accuracy-circle size; no special-casing.
- **Cleanup:** `clearWatch` on toggle-off. Tracking survives entering/exiting tours (it's map-global); the distance readout only shows while in a tour.

## Data flow

`watchPosition` fix → `onFix(pos)`:
1. update dot + accuracy circle (lat/lon/accuracy).
2. if `FOLLOWING`: `selfRecenter=true; map.setView(myPos, zoom)`.
3. if tracking && `activeTour` && `tourStops[tourIdx]`: set `#tourdist` text to `≈ formatDistance(haversine(myPos, stop.ll))`.

`stepTo(i)` and `enterTour` already call `flyTo`/`fitBounds` → these set `PAUSED` (move-away). After stepping, the readout is refreshed for the new current stop on the next fix (or immediately from the last known position if available).

## Implementation shape

Single plan, ~3 tasks:
1. `lib/geo.js` `formatDistance` + unit tests.
2. `index.html`: location layer + `📍` control + `watchPosition` lifecycle + follow state machine + graceful handling + CSS (inline-mirror `formatDistance`).
3. `index.html`: tour distance readout (`#tourdist` in the stepper, live updates on fix + step).

## Error handling (summary)

Insecure/unsupported → disabled control + tooltip. Denied → reset + note. Unavailable → silent retry, no dot. All geolocation calls guarded; no uncaught exceptions; `clearWatch` prevents leaked watchers.

## Testing

- **Unit (`node --test`):** `formatDistance` (0→"0 m", 124→"120 m", 950→"950 m", 1250→"1,2 km", 12300→"12 km").
- **Manual (browser; HTTPS or localhost — `file://` can't geolocate):** grant → dot + accuracy; spoof movement (DevTools sensors) → dot + "X m igjen" update; pan → `PAUSED`, tap → resume; step a tour → follow pauses, readout tracks the new stop; deny → friendly reset; `file://` → disabled control + tooltip; tour stepping/route/photos unaffected.

## Out of scope (future)

Themed tours (sub-project 3). Auto-advance, compass bearing, start-at-nearest (declined for this scope).

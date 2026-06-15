# Design: Tour content enrichment (per-stop descriptions)

**Date:** 2026-06-15
**Status:** Approved (design); implementation not started
**Topic:** Make walking-tour stops informative — a per-stop "Om stedet" description (templated facts for all stops, hand-written notes for curated tours) shown in the detail panel.

## Goal

Tours currently show *facts* per stop (year, style, vern-status) but no readable framing. Add a per-stop description so a stop reads as a place worth standing in front of, not just a dot. This is sub-project 1 of an agreed sequence: **content → wayfinding → themed tours** (the latter two are future cycles).

## Decisions (from brainstorming)

- **Road-following** is already solved — it just needed an `ORS_API_KEY` (now set). Not part of this work.
- **No PDF extraction.** The source PDF (`v2---kulturminneregistreringer-1.pdf`) is a registration *table*, not narrative — its per-object data is already in `DATA`. Re-extracting the few unbaked columns (opprinnelig funksjon/alder) is error-prone (scrambled table, fuzzy row→record matching) for marginal value. Deliberately out of scope.
- **Story depth = rich templated facts (all stops) + hand-written notes (curated tours only).** Auto tours stay factual.
- **Accuracy guardrail:** curated notes are grounded in known fields + general architectural context only. No invented specific history (people, dated events) without a source. The user can later enrich with real local history (e.g. lokalhistoriewiki.no).
- **YAGNI (declined branches):** no external "les mer" links, no surfacing of Kulturminnesøk `informasjon` text (relevance/quality caveats).

## Content model

A **per-stop description resolver**, best-available first:
1. **Curated note** — if the current stop belongs to a curated tour and has a note.
2. **Templated fact-summary** — always available; the reliable backbone for all ~2,003 stops.

Plus a **per-tour intro** (curated: hand-written; auto: the existing generated line).

### `summarize(r)` — the fact-summary
Pure function building a Norwegian sentence from the object's own fields, skipping empties:
- Base: `"{funksjon|kategori} i {stil}"` (use `funksjon` if present, else `kategori`; omit "i {stil}" when stil is empty/"Uoppgitt"/"Ubestemt").
- Year: append `", oppført {byggeår}"` when `ar`/`y` present.
- Verdi: append `". {verneverdi-label}"` (from the `VERDI` map).
- Fredet: append `" Fredet."` when `fr` truthy; else append vernestatus only if it adds info beyond verdi.
- Example: *"Bolig i sveitserstil, oppført 1890. Høy verneverdi."* / *"Bro, oppført 1936. Høy verneverdi."*
- Returns `''` if nothing meaningful (degrades to no "Om stedet" section).

Exact phrasing is finalized in the plan; the rule is: readable, no empty fragments, no fabricated facts.

## Display

A new **"Om stedet"** section in the detail panel, rendered just after the address (`.detsub`) and above "Foto", **only when the resolved description is non-empty**:
- Curated note → shown as prose.
- Else templated summary → shown as a sentence.
- The existing "Detaljer" definition-list stays unchanged below (the summary is a distillation, not a replacement).

This renders in **both tour mode and normal marker detail** — the enrichment benefits every object. The per-tour intro stays in the tour box; the two curated intros get rewritten as proper framing.

## Data model

Curated tour stops gain **optional notes**. Each entry in a curated tour's `stops` is **either**:
- a bare index `256` (no note), **or**
- `{i:256, note:"…"}` (with note).

Auto tours (generated) always use bare indices — untouched. `resolveStops(tour, DATA)` is extended to return `{recs, notes}` (aligned arrays; `notes[k]` is the note or `null`). `enterTour` keeps a parallel `tourNotes[]` so the resolver can look up the current stop's note by `tourIdx`.

## Implementation shape

Single plan (modest; no foundation/UI split).

| Unit | Change |
|------|--------|
| `lib/tours.js` | Add pure `summarize(r)` + unit tests (empty fields, fredet, missing year, stil=Uoppgitt). Extend `resolveStops` to return `{recs, notes}` (or add a sibling that does) + a test. |
| `index.html` | Inline-mirror `summarize`; extend the inline `resolveStops` + `enterTour` to build `tourNotes`; description resolver + "Om stedet" section in `openDetail`; add notes to the curated `TOURS`; rewrite the two curated intros. |

**Resolver (in `openDetail(r)`):**
```
note = (activeTour && tourStops[tourIdx] === r) ? tourNotes[tourIdx] : null;
desc = note || summarize(r);
// render "Om stedet" section iff desc
```

**Consistency note:** `lib/tours.js` is the tested reference; the inline copies (`summarize`, `resolveStops` shape) must stay algorithmically identical — same pattern already used for `buildAutoTours`/`nnOrder`.

## Error handling / edge cases

- Empty/sparse record → `summarize` returns `''` → no "Om stedet" section (no empty box).
- A curated `{i, note}` with an out-of-range/no-`ll` index → skipped by `resolveStops` (notes stay aligned to surviving recs).
- Non-tour detail (normal marker click, `obj=` deep-link) → `note` is null → templated summary shown. No crash.
- Mixed bare-index/object entries in one curated tour handled uniformly.

## Testing

- **Unit (`node --test`):** `summarize` cases (full, missing year, stil=Uoppgitt/empty, fredet, empty record→`''`); `resolveStops` returns aligned `{recs, notes}`, skips bad indices keeping alignment, handles bare + object entries.
- **Manual (browser):** open a curated tour stop with a note → note shown; an auto-tour stop / normal marker → templated summary shown; sparse object → no "Om stedet" box; existing features unaffected.

## Out of scope (future cycles)

Wayfinding (GPS "you are here", next-stop direction) and themed tours — the agreed sequence's next two sub-projects. PDF re-extraction, external links, Kulturminnesøk-text surfacing — declined above.

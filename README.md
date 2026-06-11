# Drammen kulturminner

Interactive Leaflet map of registered cultural-heritage objects in Drammen, with
photos (DigitaltMuseum, live) and heritage matches (Kulturminnesøk, baked).

## Run locally
Open `index.html` in a browser. The map, filters, and baked data (incl. the
heritage match + link-out) work offline; only the live photo gallery needs the
`api/` function (i.e. on Vercel or `vercel dev`).

## Tests
`npm test`  (Node's built-in runner; no dependencies)

## Re-run enrichment
Bakes `hp`/`dq`/`km`/`kc`/`kn`/`kv` into `index.html`'s `DATA`:
`DIMU_API_KEY=<key> npm run enrich`     (use `--limit N` for a dry run)

## Deploy (Vercel)
1. Import the GitHub repo at vercel.com, or run `vercel` from this folder.
2. Set `DIMU_API_KEY` in Project → Settings → Environment Variables.
3. `index.html` is served statically; `api/photos.js` becomes a serverless function.

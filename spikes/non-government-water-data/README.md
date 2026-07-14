# Spike: CRT reservoirs → draft site schema

**Status:** experimental — **not connected to the prototype UI**  
**Checked:** 2026-07-14  
**Why this source:** Canal & River Trust publishes reservoir assets on an ArcGIS FeatureServer; the open-data hub lists the **Open Government Licence**. Useful for **more named inland water areas**, not for bathing-water microbiology.

## What it does

1. Fetches CRT reservoirs as GeoJSON (WGS84).  
2. Maps each feature into a draft `DiscoverySite` object (see `map-to-schema.js`).  
3. Optionally finds reservoirs nearest to a lat/lng (haversine).  
4. Prints attribution + confidence floor so nothing looks like an EA bathing water.

## Run

```bash
node spikes/non-government-water-data/fetch-crt-reservoirs.js
node spikes/non-government-water-data/fetch-crt-reservoirs.js --lat 53.48 --lng -2.24 --limit 5
```

No API key. Network required.

## Sample excerpt

`sample-crt-reservoirs.excerpt.geojson` — three features only (for offline inspection). Prefer a live fetch for up-to-date geometry.

## Licence / attribution

- Confirm current CRT licence on the [dataset page](https://data-canalrivertrust.opendata.arcgis.com/datasets/CanalRiverTrust::canal-and-river-trust-reservoirs-view) before any production use (hub text referenced OGL on 2026-07-14; some older catalogues mentioned INSPIRE EUL).  
- Attribute: **Canal & River Trust**.  
- Swimming may be prohibited on many reservoirs — discovery ≠ permission.

## Explicit non-goals

- No UI wiring  
- No secrets  
- No scraping of swimming clubs or private venue test pages  

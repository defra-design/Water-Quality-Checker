# Non-government (and adjacent) water data sources — research findings

**Checked on:** 2026-07-14  
**Brief:** [`docs/non-government-water-data-research-brief.md`](non-government-water-data-research-brief.md)  
**Prototype context:** Defra Water Intelligence Service alpha (GOV.UK Prototype Kit). Today the app lists the **nearest ~20 designated EA bathing waters** (~464 in England) and enriches them with gov feeds.

**User goal driving this pass:** get **more recreational water areas** into the app — not only more quality APIs on the same bathing-water set.

---

## 1. Executive summary

### Strongest opportunities (especially for more places)

1. **EA Water recreation locations / zones (England)** — ~**3,347** aggregated recreation locations + catchment summaries, collated from **17 organisations** (2017–2024). OGC Features API + GeoJSON download on the Defra Data Services Platform. This is the single best path to **many more map pins** than designated bathing waters alone. It is an EA publication (so “gov-adjacent”), but many underlying reports come from non-gov bodies. **Caveat:** points are aggregated centroids of recreation *zones*, not always exact swim entry points, and the release is research/snapshot-oriented rather than near-real-time water quality.

2. **Canal & River Trust open asset layers** — **80 reservoirs**, **10 lakes/ponds/fisheries**, **57 slipways** via ArcGIS FeatureServer / GeoJSON. Hub pages present **Open Government Licence**. Excellent for naming managed inland waterbodies on CRT estate; **not** swim-safety testing. Pair with existing hydrology / WQ Archive / storm-overflow enrichment.

3. **Operator / venue submission pilot** — still the only scalable answer for commercial lakes, triathlon venues and country-park swim beaches with **current** micro tests and closures. No national public API covers this well.

4. **Earthwatch FreshWater Watch** — open citizen nutrient (nitrate/phosphate/turbidity) downloads, weekly refresh. Supporting **chemistry signal**, not a site directory and not bathing bacteria.

### Main limitations

- **Designated bathing waters remain the only dense, official micro-biology + risk-forecast network** in England. Expanding site inventory quickly outpaces **per-site confidence**.
- Charity / campaign products (SAS Safer Seas, Data HQ) often **republish water-company or gov sewage signals** the prototype largely has already, or add citizen bacteria / sickness reports with **unclear machine-readable licence** for Defra reuse.
- Wild-swim **directories** (historic OSS map) were withdrawn for overcrowding reasons; OSM `leisure=bathing_place` / `swimming_area` coverage in GB is **sparse (~127 features)** in a crude Overpass count.
- Private venues almost never offer reusable feeds; scraping individual operator sites is **not recommended**.

### Integration-ready vs partnership vs unsuitable

| Bucket | Sources |
|--------|---------|
| Ready (prototype, with clear labelling) | EA water recreation locations (site discovery); CRT reservoirs / slipways (asset places) |
| Proof of concept | FreshWater Watch nutrients; filtered OSM bathing tags; SAS citizen-science *if* licence clarified |
| Partnership | Private swim venues; SAS recreational map / sickness data; WildFish SmartRivers login DB; Rivers Trust Big River Watch bulk reuse beyond published explorer |
| Not recommended as core evidence | Undocumented website JSON; venue HTML scrape; “safe to swim” third-party traffic lights as Defra-presented verdicts; building Sentinel pipelines now |

### How this sits beside existing EA / Met Office / overflow data

- **Complement:** recreation + CRT layers expand *where* people recreate; existing APIs answer *conditions near those points*.
- **Overlap:** SAS live sewage map ≈ National Storm Overflow Hub / company feeds already in the prototype.
- **Conflict risk:** citizen bacteria / sickness / “not advised” UIs vs EA classification — UI must show both with provenance, never silently override EA.

---

## 2. Source inventory

Cap: 15. Fields marked **unknown** where not confirmed from primary docs on 2026-07-14.

### A. Site discovery (more water areas)

| Source | Category | Coverage | Water types | Evidence vs venue-ops | Data provided | Access | Docs / URL | checkedOn | stillActive | Auth | Update freq | History | Location IDs | Licence / ToS | Reliability | Provenance | Complements gov? | Effort | Recommended use | Defra fitness | Risks |
|--------|----------|----------|-------------|----------------------|---------------|--------|------------|-----------|-------------|------|--------------|---------|--------------|---------------|-------------|------------|------------------|--------|-----------------|---------------|-------|
| EA Water recreation locations, zones & catchments | Gov research collation (17 orgs) | England | Coastal, river, lake, mixed | Mostly **evidence of recreation** presence | Rec locations (~3347), zones, catchment summaries; swimming / paddling flags; # sources | OGC API Features, WFS/WMS, GeoJSON/GPKG zip | [DSP dataset](https://environment.data.gov.uk/dataset/40032292-6737-480f-a6c1-cd49f1e57695); [OGC](https://environment.data.gov.uk/spatialdata/water-recreation-locations-zones-catchment/ogc/features/v1); [data.gov.uk](https://ckan.publishing.service.gov.uk/dataset/water-recreation-locations-zones-and-catchment-summaries-england) | 2026-07-14 | Yes | None | Snapshot (research period ~2017–2024); not live Q | Yes (release) | `location_id`, geometry | DSP: “no public access constraints”; package licence field empty on data.gov.uk — **treat as EA reuse pending confirm of OGL text in download pack** | Medium–high for *presence*; low for *today’s quality* | Aggregated orgs + infrastructure | Expands beyond bathing waters | Low–medium | Core for **site discovery**; not core bacteria | Show as “reported recreation area” / research layer | Stale snapshot; centroid not entry point; may include non-swim recreation; endorsement if shown without caveats |
| Canal & River Trust Reservoirs | Charity asset open data | England & Wales (CRT estate) | Reservoir | Venue/asset geography | Names, waterway, geometry (~80) | ArcGIS REST, GeoJSON, CSV | [Hub](https://data-canalrivertrust.opendata.arcgis.com/datasets/CanalRiverTrust::canal-and-river-trust-reservoirs-view); FeatureServer `.../Canal_And_River_Trust_Reservoirs_View/FeatureServer/0` | 2026-07-14 | Yes | None | Attributes ~weekly (per ArcGIS item text) | unknown | CRT functional location codes | Hub lists **OGL**; some catalogue entries historically cited INSPIRE EUL — **confirm licence PDF before production** | High for *existence/name* | Operator asset register | Places without bathing designation | Low | Discovery / map pins + enrich with gov sensors | Show with CRT attribution; not as bathing water | Swimming may be prohibited; not quality tested |
| CRT Lakes, Ponds & Fisheries | Charity | CRT estate | Lake/pond | Asset | ~10 polygons | Same portal | [Lakes View](https://data-canalrivertrust.opendata.arcgis.com/datasets/CanalRiverTrust::canal-and-river-trust-lakes-ponds-fisheries-view) | 2026-07-14 | Yes | None | unknown | unknown | CRT codes | OGL on hub (confirm) | High existence | Operator | Same | Low | Discovery (small set) | Show / attribute | Few features; angling-focused |
| CRT Slipways | Charity | CRT estate | Canal/river access | Venue-ops geography | ~57 points | Same | [Slipways](https://data-canalrivertrust.opendata.arcgis.com/datasets/CanalRiverTrust::canal-and-river-trust-slipways-view) | 2026-07-14 | Yes | None | unknown | unknown | CRT codes | OGL on hub | High existence | Operator | Access points | Low | Supporting map context | Show | Not swim quality |
| OpenStreetMap bathing / swimming tags | Community map | UK sparse | Mixed | Mixed | `leisure=bathing_place`, `swimming_area` (~127 n/w/r in GB bbox sample) | Overpass / planet extracts | [Wiki bathing_place](https://wiki.openstreetmap.org/wiki/Tag:leisure%3Dbathing_place); [swimming_area](https://wiki.openstreetmap.org/wiki/Tag:leisure=swimming_area) | 2026-07-14 | Yes | None | Ongoing edits | Yes | OSM ids; rare `ref:EU:bwid` | **ODbL** (share-alike) | Low–medium | Volunteers | Partial overlap bathing waters | Medium (dedupe, ODbL compliance) | Supporting discovery only | Signpost / carefully attribute; legal review for ODbL in gov service | Incomplete; may mark unsafe spots; overcrowding ethics |
| Outdoor Swimming Society / wildswim.com map | Org directory | Was UK | Wild swim | Venue discovery | Crowdsourced spots | Removed from public web | [Guardian 2020](https://www.theguardian.com/travel/2020/jun/02/wild-swimming-site-removes-online-map-to-ease-overcrowding) | 2026-07-14 | **No** (map offline) | n/a | n/a | n/a | n/a | n/a | n/a | n/a | n/a | n/a | Not recommended | Exclude as feed | Deliberately withdrawn |
| Can I Swim Here? swim spots | Independent aggregator | E/W/S | Mixed | Mix | Recreation pins + traffic-light verdict on gov data | Web app; claims API for journalists — **docs URL not verified as open reuse of spot list** | [caniswimhere.uk](https://caniswimhere.uk/) | 2026-07-14 | Yes | unknown | Live for overflows; spots unknown | unknown | unknown | Built on OGL gov data + community; **spot list licence unclear** | Medium for overflows (gov); verdicts are derivative | Aggregator | Overlaps this prototype | High if scraping | Research / competitor scan | Prefer **upstream** EA recreation + gov APIs | Endorsement; duplicating Stack |

### B. Water / risk evidence (non-central-gov or citizen)

| Source | Category | Coverage | Types | Evidence | Data | Access | URL | checkedOn | Active | Auth | Freq | History | IDs | Licence | Reliability | Provenance | Complements? | Effort | Use | Defra fitness | Risks |
|--------|----------|----------|-------|----------|------|--------|-----|-----------|--------|------|------|---------|-----|---------|-------------|------------|--------------|--------|-----|---------------|-------|
| Surfers Against Sewage Data HQ / Safer Seas | Charity campaign | UK | Coast/river | Mix | Live sewage map, citizen bacteria, sickness reports, recreational use logs | Web maps; download on citizen map UI; sewage “APIs feeding map” = largely **public water-co feeds** | [Data HQ](https://datahq.sas.org.uk/); [Safer Seas](https://www.sas.org.uk/water-quality/sewage-pollution-alerts/safer-seas-rivers-service/); [Citizen results](https://datahq.sas.org.uk/citizen-science-data-hq/citizen-science-results/) | 2026-07-14 | Yes | App for alerts; map public | Near-real-time spills; citizen irregular | Partial | Site names / coords on map | **Unclear** for SAS-owned citizen/sickness layers; spills often third-party ToS | Medium (spills); medium–low (citizen micro, sickness) | Water cos, volunteers, users | Spills overlap NSOH | Medium–high | Signpost SAS app; PoC citizen **after** licence | Signpost / partner | Duplicate spills; over-alert; scrape grey; Defra vs campaign messaging |
| Earthwatch FreshWater Watch | Charity / citizen science | Global + UK groups | Freshwater | Evidence (nutrients) | Nitrate, phosphate, turbidity (+ observations) | Weekly global CSV/XLSX; ArcGIS hub map | [Explore data](https://fww-earthw.hub.arcgis.com/pages/explore-our-data); [UK programme](https://earthwatch.org.uk/program/freshwater-watch-in-the-uk/) | 2026-07-14 | Yes | None for download (stated open access) | Weekly file refresh; samples monthly-ish by groups | Yes | Site coords in file | Described **open access**; exact licence string **confirm in metadata report** | Medium for trends; not bathing standards | Field kits / volunteers | Complements WQ Archive chemistry | Medium (filter England, match sites) | Supporting chemistry signal | Show with citizen-science label | Not E. coli; kits ≠ accredited lab |
| Rivers Trust Big River Watch | Charity citizen | UK & Ireland | Rivers | Visual / perception | Pollution, wildlife, perceived health (biannual surveys + app) | Dashboard + “download the data” link on site | [Data Explorer](https://theriverstrust.org/big-river-watch-data-explorer) | 2026-07-14 | Yes | None for explore | Biannual campaigns + year-round app | Yes | Survey points | unknown — contact historically used for bulk | Low–medium | Volunteer observation | Supporting only | Medium | Alert / seasonal context | Signpost / partner for bulk | Perceptual not micro; licence |
| WildFish SmartRivers | Charity / citizen science | E/W/S | Rivers | Evidence (invertebrates → stress scores) | Biometric scorecards | Login database (email request); GBIF occurrence dataset | [SmartRivers](https://wildfish.org/project/smart-rivers/); [GBIF](https://doi.org/10.15468/dags62) | 2026-07-14 | Yes | Account for DB | Seasonal | Yes | Hubs/sites | “Open access” with login; GBIF terms for dump | Medium–high ecology | Volunteers + professional ID | Ecological health gap | High | Ecology supporting | Partner / signpost | Not recreational micro; access friction |
| CaSTCo / Get Data tool | Partnership programme | Catchments | Rivers | Mixed | Points to EA + some RT / Water Rangers paths | Web tool | [castco.org](https://castco.org/); [Get Data](https://www.getdata.catchmentbasedapproach.org/) | 2026-07-14 | Yes | unknown | Varies | Varies | Varies | Per source | Varies | Mixed | Pointer, not one API | — | Discovery of partners | Signpost | Not a single feed |
| Water company recreational / algae pages (e.g. Thames) | Commercial utility | Regional | Reservoirs | Venue-ops + notices | Storm data open; **no verified public reservoir algae/recreation API** (Thames storm API exists; recreation algae **not found**) | Company websites / storm APIs | [Thames storm data](https://www.thameswater.co.uk/about-us/performance/river-health/storm-discharge-and-flow-data) | 2026-07-14 | Storm: yes | API key unknown/varies | Storm near-real-time | EDM annual | Asset IDs | Company ToS | High for EDM | Operator sensors | Overlaps NSOH | — | Keep storm via existing hub | Exclude algae scrape | Fragmented HTML notices |
| National Trust / Wildlife Trusts site pages | Charities | Local | Lakes | Venue-ops | Closures, visitor notices | HTML only | Site-by-site | 2026-07-14 | Yes | n/a | Irregular | No | Names | ToS / no open data | Medium for notices | Operator | — | Very high | Partnership / submit | Partner | No scalable feed |

### C. Already in prototype (baseline — do not re-integrate)

EA Bathing Water API (~**464** England bathing waters listed on 2026-07-14; prototype uses nearest **20**), Flood Monitoring, Water Quality Archive, Met Office, OS Maps, Storm Overflow Hub, bathing-water pollution incidents.

---

## 3. Recommended integrations

### Ready for prototype integration (≤3)

1. **EA Water recreation locations** — nearest-N by postcode alongside bathing waters, labelled *Reported recreation area (research dataset)* not *Designated bathing water*. Filter where swimming presence / designated bathing flags help.  
2. **CRT Reservoirs (+ optional slipways)** — CRT-managed waterbodies as secondary pins with OGL attribution.  
3. *(Reserve)* CRT lakes/ponds if still useful after licence PDF check.

### Suitable for proof of concept (≤5)

1. FreshWater Watch England subset → supporting chemistry on nearest matched site.  
2. OSM bathing_place (ODbL legal check first).  
3. SAS citizen bacteria samples **after** written reuse permission / clear licence.  
4. Big River Watch seasonal layer as “community observations” with date.  
5. Operator-submission sandbox with 3–5 pilot venues (not a public scrape).

### Partnership required

- Commercial open-water centres, triathlon lakes, holiday-park lakes.  
- SAS recreational / sickness datasets for Defra hosting.  
- SmartRivers / local Rivers Trusts for ecology cards.  
- LAs / country parks with only HTML algae boards.

### Not recommended

- Scraping operator “today’s water quality” pages.  
- Rebuilding SAS sewage map (duplicate).  
- Presenting Can I Swim Here? (or similar) **verdicts** as Defra advice.  
- Relying on OSS wildswim map (offline by design).  
- Sentinel bloom pipeline for small lakes (appendix only).

---

## 4. Conflict and freshness policy

| Situation | Rule |
|-----------|------|
| Site is designated bathing water **and** recreation location | Prefer **one** card: bathing-water identity wins; recreation dataset may add activity context. |
| Non-designated recreation / CRT site | Show status as **limited evidence**; never invent Excellent/Good classification. Enrich with nearest storm overflow, rainfall, ambient WQ Archive — all marked nearest-station. |
| Citizen kit / FWW vs EA WQ Archive | Show both; EA lab = higher confidence; citizen = supporting, with method + age. |
| SAS / community “unsafe” vs EA “Excellent” | Surface both with sources; **do not** auto-downgrade official classification without EA incident/risk fields. |
| Operator “closed” vs EA good | Operator closure wins for **that venue’s** operational status; keep EA chemistry if designated. |

**Freshness (suggested thresholds)**

| Provenance | Treat as stale after |
|------------|----------------------|
| EA in-season sample / risk forecast | Per EA timestamps; out-of-season → label seasonal |
| Storm overflow live | Hours (existing cache ~10 min) |
| Recreation location layer | Months–years (dataset vintage) — always show **dataset vintage** |
| CRT asset | Months OK for name/geometry |
| FreshWater Watch | 90 days for “recent supporting chemistry” |
| Citizen bacteria | 14–30 days for “recent”; older = historic |
| Visual / Big River Watch | Campaign window only |

**Map to existing UI labels**

| Label | Use for |
|-------|---------|
| Live data | EA, Met Office, overflow, pollution incidents, WQ Archive samples (with age note) |
| Demonstration | Scenario mocks |
| Not connected | Indicator we have not wired |
| Placeholder | UX shell |
| **New extension:** “Supporting / citizen” or “Asset register” | FWW, CRT place without tests, recreation research layer |

---

## 5. Private venue data strategy

Do **not** scrape venues. Pilot a **submission path**:

1. Recruit 5–10 willing operators (inland lakes, watersports centres).  
2. Simple HTTPS form or API key POST → store updates.  
3. Operator can correct/withdraw.  
4. UI: “Venue-reported” confidence, never “EA classified”.

### Initial schema (refined)

```ts
type VenueWaterUpdate = {
  venueId: string
  venueName: string
  coordinates: { lat: number; lng: number }
  observedAt: string       // ISO8601 — when conditions/tests refer to
  submittedAt: string      // ISO8601 — when operator sent it
  status: 'open' | 'restricted' | 'closed' | 'unknown'
  waterTemperatureC?: number
  algaeStatus?: 'none_reported' | 'suspected' | 'confirmed' | 'unknown'
  testResults?: {
    eColiCfu100ml?: number
    enterococciCfu100ml?: number
    sampledAt: string
    laboratory?: string
    method?: string          // e.g. 'ISO_9308-1', 'venue_kit'
    accreditation?: 'ukas' | 'other' | 'none' | 'unknown'
  }
  notices?: string[]
  sourceName: string
  sourceUrl?: string
  licence?: string
  confidence: 'accredited_lab' | 'operator' | 'unknown'
  rightsOfCorrectionContact?: string
}
```

---

## 6. Data-confidence model

Ordered for UI (highest first for recreational *micro* risk):

1. Official regulatory sample / EA risk forecast (designated bathing waters)  
2. Accredited laboratory (venue-supplied with UKAS/etc.)  
3. Venue-operator result (non-accredited)  
4. Calibrated continuous sensor  
5. Citizen-science field kit (FWW nutrients; SAS bacteria kits)  
6. Visual observation / Big River Watch  
7. Unverified community report / sickness (signpost carefully — privacy)  
8. Modelled / inferred / research aggregation (recreation locations presence)

Required metadata on every observation: `source`, `sourceType`, `observedAt`, `publishedAt`, `method`, `laboratory?`, `verification`, `confidence`, `licence`, `freshnessThreshold`.

Avoid single **safe/unsafe** Defra verdict for non-designated sites.

---

## 7. Technical architecture (fit this codebase)

Keep GOV.UK Prototype Kit patterns:

```text
Postcode → sites[]
  ├─ bathing-water-client (existing, designated)
  ├─ recreation-locations-client (NEW — EA OGC, discovery)
  └─ crt-assets-client (NEW — reservoirs/slipways)

Then enrich each site (existing):
  met-office, storm-overflow, pollution-incident
  hydrology + water-quality (detail page)
```

- Shared normaliser: `{ id, name, coordinates, siteKind, confidenceFloor, dataSources[] }`  
- `siteKind`: `designated_bathing_water` | `recreation_research` | `crt_reservoir` | `venue_reported` | …  
- Deduplicate when recreation point ≈ bathing water (e.g. &lt; 250 m + name match).  
- Provenance banners already in `data-provenance.html` — extend strings, don’t invent a new stack.  
- Cache GeoJSON/OGC extracts on disk or memory (dataset changes slowly).  
- Optional later: `POST /api/venue-updates` for pilot (not public without auth).

**No Next.js rewrite.**

---

## 8. Legal and ethical assessment (recommended sources)

| Source | Notes |
|--------|--------|
| EA recreation dataset | EA/DSP publication; confirm OGL text inside download/metadata before merge to main. Aggregation from 17 orgs — attribute EA research dataset; don’t imply live monitoring. |
| CRT layers | Hub shows OGL; older CEH metadata mentioned INSPIRE EUL for some layers — **read current CRT licence PDF** before production. Attribute Canal & River Trust. Swimming permission separate from ownership. |
| OSM | ODbL share-alike may constrain gov redistributions — legal review. Ethical: don’t rebuild the wildswim overcrowding problem without landowner context. |
| FreshWater Watch | Marketed open access — capture exact licence from metadata report before publish. |
| SAS citizen / sickness | Partnership for reuse; sickness data may be sensitive. Prefer linking to Safer Seas app. |
| Venue scrape | Fail ToS and accuracy tests — excluded. |
| Safety framing | Expanding pins **increases** risk of users treating sparse data as Swimfo-equivalent — copy must say otherwise. |

---

## 9. Prototype recommendation (smallest valuable iteration)

**Goal:** more water areas **without** pretending they are all designated bathing waters.

### Iteration A — site inventory (highest leverage)

1. Add **EA Water recreation locations** as a second nearby list (or map layer), filtered to swimming-relevant flags where possible.  
2. Add **CRT reservoirs** as optional inland pins with CRT attribution.  
3. Keep designated bathing waters as the **primary confidence** journey.  
4. UI: clear `siteKind` badges + provenance.

### Iteration B — supporting signals

5. Optional FreshWater Watch match within X km for nutrient context on detail page.  
6. Operator pilot schema + 1–2 fake/demo venue submissions in research builds.

### Defer

- SAS merge, OSM (pending legal), SmartRivers, satellite, IoT.

### What this does **not** solve alone

Microbiological “is it OK today?” for non-designated lakes still needs **EA designation**, **venue lab programmes**, or **explicit low-confidence** framing.

---

## 10. Appendix — IoT / satellite

- **Public LoRaWAN / SensorThings recreational-water feeds for England:** no nationally consistent, production-ready discovery in this pass (`unknown` / not found as a coherent catalogue).  
- **Copernicus / Sentinel bloom products:** possible for large lakes/coasts; cloud, resolution and false confidence make them unsuitable for alpha site cards. Revisit only if a **derived EA/CEH product** already publishes recreational-ready layers.

---

## Relation to “more water areas” specifically

| Approach | Approx. scale | Quality story |
|----------|---------------|---------------|
| Status quo: nearest bathing waters | ~20 of ~464 | Strong (official) |
| + EA recreation locations | up to ~3347 England points | Presence researched; Q weak |
| + CRT reservoirs | +80 named assets | Ownership clear; swim may be banned |
| + OSM bathing tags | +~100 sparse | Crowd; ODbL |
| + Venue pilot | +tens | Good if operators submit tests |

**Recommended sequencing:** recreation locations + CRT first; venue pilot for quality on private water; citizen sources as supporting only.

---

## Optional spike

See [`spikes/non-government-water-data/`](../spikes/non-government-water-data/) — experimental fetch of **CRT reservoirs** (OGL-listed ArcGIS layer) into a draft site schema. **Not wired to the UI.**

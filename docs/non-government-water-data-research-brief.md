# Cursor task: Research non-government water-quality data sources

Paste this file (or the sections below) into Cursor as the task brief.

---

## Context

This repository is an **alpha discovery prototype** for a possible Defra **Water Intelligence Service**, built with the **GOV.UK Prototype Kit** (Node.js / Express / Nunjucks) — **not** Next.js.

The prototype already focuses on authoritative government and regulated feeds (EA bathing water, flood monitoring / hydrology, Water Quality Archive, Met Office rainfall, OS Maps, storm overflows, bathing-water pollution incidents). Data is labelled **Live / Demonstration / Not connected / Placeholder**.

The user need is already framed as:

> “Would I feel confident using the water here today?”

Avoid “safe / unsafe” verdicts unless evidence genuinely supports them. Prefer confidence, provenance and freshness.

**Non-goals for this task**

- Do not implement production integrations or wire new sources into the live UI.
- Do not build scrape farms for individual private venues.
- Do not treat undocumented website JSON as production-ready open data.
- Do not replace Swimfo or imply Defra endorsement of private venues.
- Do not commit API keys, credentials or secrets.
- Do not propose rewriting the app to Next.js.

**Fit with a government-facing service**

Assess each source for whether Defra / this prototype could reasonably:

- show it as first-party evidence
- signpost / deep-link to it with clear attribution
- host it only after partnership and licence agreement
- or leave it out (policy, liability, quality, or endorsement risk)

---

## Task

Investigate **non-central-government** data that could help for places poorly covered by designated bathing-water monitoring, especially:

- privately operated / commercial open-water venues
- watersports centres and managed inland swimming sites
- recreational reservoirs and country-park lakes
- community-run swim spots
- monitoring by charities, universities or citizen-science projects

Also note UK-wide sources that include English sites.

Primary deliverable: a research document at:

`docs/non-government-water-data-sources.md`

Optional: one technical spike only if at least one source is clearly reusable (see below).

---

## Scope for this pass (keep tight)

Investigate **at most 15 named sources**. Spend most depth on the **top 5**.

Prioritise in this order:

1. **Charities / campaigns** with published monitoring, maps or status data and clear reuse terms  
2. **Citizen-science platforms** with licence + method clarity (lab vs kit vs observation)  
3. **Private venue data via submission / partnership** (strategy + schema — not venue scraping)  
4. **Local authority / park monitoring** only where there is a reuseable feed or open data (not one-off HTML pages)  
5. **Water company recreational / algae notices** beyond storm overflows already in the app

**Appendix only** (brief notes, do not deep-dive unless a ready-made product exists):

- IoT / LoRaWAN public sensors
- building a Copernicus / Sentinel processing pipeline

**Out of scope for inventory depth**

- Tourism CMS fields alone (wetsuit rules, lifeguards, café hours) unless tied to water risk. Record venue-ops data separately from water-evidence data.
- Discontinued one-off academic dumps unless they prove an ongoing feed exists.

### Seed list (start here; add/remove with justification)

Check these first if still active and relevant to England:

- Surfers Against Sewage (Safer Seas / related feeds)
- The Rivers Trust / Catchment Data Explorer-related public products (non-EA layers only if distinct)
- Canal & River Trust waterway / water-quality related public data
- Outdoor Swimming Society or similar directories (status / advice pattern — usually not an API)
- Known UK citizen-science water projects (e.g. kit-based phosphate / bacterial programmes) with published terms
- One or two LA or country-park algae / lake-closure open datasets if easily found
- National Trust / Wildlife Trusts only if they publish site-level recreational-water evidence (not general nature pages)

Replace or drop any seed that is dead, non-English-only without England coverage, or advice-only.

---

## What to look for (access methods)

Documented APIs, open downloads (CSV / JSON / GeoJSON / XML), ArcGIS REST, OGC feeds, open-data portals, operator portals **with stated reuse**, academic open datasets that are **still updated**.

**Research notes only (never “ready for prototype”):** undocumented JSON endpoints, HTML dashboards, PDFs, social media. Record the pattern if useful for partnership conversations; do not recommend scraping for production use just because it is possible.

For every source, prefer primary docs and record the **exact URL** and **date checked** (`checkedOn: YYYY-MM-DD`).

---

## Separate two kinds of information

In the inventory and recommendations, split:

| Kind | Examples |
|------|----------|
| **Water / risk evidence** | microbiology, algae / cyanobacteria, pollution alerts, temperature from tests/sensors, closures due to water quality |
| **Venue operations** | open/closed for sessions, booking, lifeguards, accessibility, wetsuit policy |

Prototype value for Defra is primarily **water / risk evidence** plus **clear provenance**. Venue ops matter for a pilot operator portal, not as scraped directories.

---

## Required document structure

### 1. Executive summary

- Strongest opportunities
- Main limitations
- Integration-ready vs partnership vs unsuitable
- How non-gov sources should sit alongside existing EA / Met Office / storm-overflow data (complement, duplicate, or conflict)

### 2. Source inventory

Table (or one subsection per source) with **no invented fields** — use `unknown` when unsure:

| Field | Description |
|-------|-------------|
| Source name | Organisation, platform or dataset |
| Source category | Charity, citizen science, operator, LA, water company, university, commercial, etc. |
| Geographic coverage | England / UK / local / venue-only |
| Water types | River, lake, reservoir, coast, canal, etc. |
| Evidence vs venue-ops | Which kind of data it mainly provides |
| Data provided | Measurements, alerts, status, observations |
| Access method | API, CSV, ArcGIS, HTML, PDF, social, partnership |
| Documentation URL | Primary link |
| checkedOn | Date researched |
| stillActive | Yes / no / unknown |
| Authentication | None, key, account, commercial |
| Update frequency | Real-time, daily, weekly, irregular, unknown |
| Historical data | Yes / no / unknown |
| Location identifiers | Coordinates, site ID, name only, etc. |
| Licence / ToS | OGL, CC, custom, commercial, unclear |
| Reliability | High / medium / low (justify briefly) |
| Data provenance | Lab, sensor, operator, volunteer, user report |
| Complements gov data? | Yes / overlaps / conflicts / unknown |
| Integration effort | Low / medium / high |
| Recommended use | Core evidence, supporting signal, alert only, signpost only, discovery only |
| Defra fitness | Show / signpost / partner-only / exclude |
| Risks | Legal, quality, sustainability, endorsement, stale data |

Cap the table at **≤15 sources**.

### 3. Recommended integrations (hard caps)

- **Ready for prototype integration** — ≤3  
- **Suitable for proof of concept** — ≤5  
- **Partnership required** — as needed  
- **Not recommended** — as needed  

Only put a source in “ready” if access method, licence and sustainability are clear enough for a discovery prototype.

### 4. Conflict and freshness policy

Propose rules for when non-gov data disagrees with EA bathing-water / pollution / storm-overflow signals. Who surfaces first? How is disagreement shown?

Propose freshness thresholds by provenance type (regulatory sample vs venue lab vs kit vs visual report). Map labels onto the prototype’s existing **Live / Demonstration / Not connected / Placeholder** model; extend only if necessary.

### 5. Private venue data strategy

Do **not** propose scraping individual venues. Propose a scalable pilot:

- small set of willing operators
- submission API or simple form → normalised JSON
- operator right of correction

Include a refined initial schema (TypeScript-shaped is fine), for example:

```ts
type VenueWaterUpdate = {
  venueId: string
  observedAt: string
  submittedAt: string
  status: 'open' | 'restricted' | 'closed' | 'unknown'
  waterTemperatureC?: number
  algaeStatus?: 'none_reported' | 'suspected' | 'confirmed' | 'unknown'
  testResults?: {
    eColiCfu100ml?: number
    enterococciCfu100ml?: number
    sampledAt: string
    laboratory?: string
    method?: string
  }
  notices?: string[]
  sourceName: string
  sourceUrl?: string
  licence?: string
  confidence?: 'operator' | 'accredited_lab' | 'unknown'
}
```

Refine as needed.

### 6. Data-confidence model

Define levels such as:

- Official regulatory sample  
- Accredited laboratory result  
- Venue-operator result  
- Calibrated sensor  
- Citizen-science / field kit  
- Visual observation  
- Unverified community report  
- Modelled / inferred  

UI must not present these as equal. Recommend metadata: source, source type, observed time, published time, method, laboratory, verification, confidence, licence, freshness threshold.

### 7. Technical architecture (fit this codebase)

Recommend the **smallest** extension of the current pattern:

- `app/services/clients/*` adapters  
- enrichment in `app/services/water-service.js`  
- provenance helpers / banners  
- caching and timeouts like existing clients  

Describe normalisation → site matching → provenance → UI labelling. Optional later: scheduled ingestion, webhook intake for operator submissions, moderation for community reports.

Do **not** recommend a full platform rewrite.

### 8. Legal and ethical assessment

For recommended sources only (not every inventory row at essay length):

- terms of use / database rights / republishing  
- scraping permitted or not  
- personal data / location privacy  
- attribution  
- risk of implying safety guarantees or Defra endorsement  
- stale-result risk  
- operator right of correction  

### 9. Prototype recommendation

Smallest set that demonstrates value without an unmanageable maintenance burden. Preferred shape:

- keep existing government datasets as the spine  
- add ≤2 clearly reusable non-gov signals **or** signpost-only links with provenance  
- pilot a tiny operator-submission path for private venues  
- strong freshness / confidence labelling and conflict rules  

### 10. Appendix (optional)

Short notes on IoT and satellite **only** if existing derived products look usable for English recreational waters; otherwise “not for this prototype phase.”

---

## Optional technical spike

**Only after** the research doc ranks sources.

- Spike **at most one** non-government source that is clearly reusable under its licence/ToS.  
- Path: `spikes/non-government-water-data/`  
- Fetch a small public sample, attribute the source, map into a draft canonical observation shape, handle errors, no secrets, README stating **experimental / not connected to UI**.  
- Skip the spike if nothing clears the “ready” or clear PoC bar.

---

## Research rules

1. Prefer primary documentation; record exact URLs and `checkedOn`.  
2. Check licence / terms before recommending reuse.  
3. A public webpage is not open data by default.  
4. Undocumented endpoints = research note only.  
5. Distinguish operational feeds from historic or discontinued projects (`stillActive`).  
6. Prefer coordinates + timestamps.  
7. Flag advice-only or annual-only sources.  
8. Be honest about unknowns.  
9. England first; UK-wide OK when it includes English locations.  
10. Relate findings to what the prototype already shows for designated bathing waters.

---

## Definition of done

- `docs/non-government-water-data-sources.md` exists with sections 1–9  
- ≤15 sources inventoried; top opportunities ranked with caps respected  
- Licences / ToS checked (or explicitly `unclear`) for anything recommended  
- Private venue approach is submission/partnership-based, not scrape-based  
- Confidence + conflict + freshness policy defined against existing provenance labels  
- Architecture fits GOV.UK Prototype Kit / current Node clients  
- Defra fitness (show / signpost / partner / exclude) explicit  
- Spike only if justified; UI untouched  

---

## After research (human decision)

Use the document in design / policy discussion before any implementation ticket. Implementation should be a separate, scoped follow-up — not part of this task.

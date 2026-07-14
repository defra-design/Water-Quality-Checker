# Water Intelligence Service – Alpha Prototype

An alpha discovery prototype built with the [GOV.UK Prototype Kit](https://prototype-kit.service.gov.uk/) exploring what a future Defra Water Intelligence Service could look like.

This prototype brings together trusted environmental information into a single, accessible, mobile-first experience. It helps answer:

> **"Would I feel confident using the water here today?"**

## Running the prototype

```bash
npm install
npm run dev
```

Open [http://localhost:3000](http://localhost:3000)

## User journeys

| Journey | URL | Description |
|---------|-----|-------------|
| Start | `/` | Service introduction |
| Postcode search | `/search` | Find water near you |
| Local overview | `/overview?postcode=BH1%203AA` | Area summary with confidence status |
| Map and list | `/map?postcode=BH1%203AA` | Interactive map, list and table views |
| Location detail | `/location/river-thames-caversham` | Full location information |
| Ask a question | `/ask` | Conversational Q&A (predefined responses) |
| Understanding | `/understanding-water-quality` | Educational content |

### Example postcodes

Any valid UK postcode resolves to the nearest designated bathing waters from the Environment Agency. Try:

- `BH1 3AA` – Bournemouth (coastal)
- `TR7 1PP` – Newquay, Cornwall (coastal)
- `NE33 2LD` – South Shields (coastal)
- `YO11 1AA` – Scarborough (coastal)
- `RG4 8BY` – Reading (inland river bathing waters)

Legacy demonstration locations (illustrative scenario data) remain available by direct URL, for example `/location/river-thames-caversham`.

## API roadmap

This prototype prioritises **live data over supporting content**. Not every factor marked “Yes” below means point-in-time data at every location — some sources are seasonal classifications, gauged readings near (not at) a site, or values inferred from related indicators.

The UI labels each indicator as **Live data**, **Demonstration data**, **Not connected**, or **Placeholder** so research participants can see what is real versus illustrative.

### Confidence use cases

| Use case | Meaning | Examples |
|----------|---------|----------|
| **Today / now** | Useful for “would I go in today?” | Recent rainfall, river level/flow, storm overflow events, latest bacteria sample |
| **Seasonal / classification** | Official grade or status for a season | Bathing water annual classification, ecological status |
| **Inferred** | Derived from related data, not a direct measurement | Agricultural pressure from nitrate/phosphate; household pollution from sewer proxies |

### Factors, sources and availability

| Factor | API / data availability | Typical use case | Notes |
|--------|-------------------------|------------------|-------|
| Heavy rainfall | **Yes** — [Met Office Weather DataHub](https://datahub.metoffice.gov.uk/); [EA Hydrology API](https://environment.data.gov.uk/hydrology/) | Today / now | Met Office = model/spot totals; EA Hydrology = observed at monitoring stations |
| Sewage discharges | **Yes** — National Storm Overflow Hub / EDM data | Today / now | Coverage and timeliness vary by water company; event types differ (CSO vs treated effluent) |
| Agricultural runoff | **Partly** — nitrates, phosphates, pesticides in EA water quality data | Inferred / seasonal | Rarely a single live reading at an exact recreational spot |
| Industrial pollution | **Partly** — pollution incidents and permits exist; not always a simple API | Today / seasonal | Incidents API ≠ full industrial risk picture |
| Algal blooms | **Partly** — chemistry/ecology indicators; dedicated bloom alerts are uncommon | Today / seasonal | Often local alerts plus WQ indicators, not a national bloom API |
| Bacteria / viruses | **Yes** — bathing water monitoring ([EA Bathing Water API](https://environment.data.gov.uk/bwq/)) | Today / seasonal | Strong for **designated bathing waters**; rivers/lakes need different sampling programmes |
| Water temperature | **Yes** — EA Hydrology / water quality APIs | Today / now | Usually at monitoring stations, matched to nearest site |
| River flow | **Yes** — [EA Flood Monitoring](https://environment.data.gov.uk/flood-monitoring/) and Hydrology APIs | Today / now | Level and flow often paired at the same station |
| Ecological health | **Yes / partly** — EA ecology and fish open data | Seasonal | Often open downloads rather than a simple live API |
| Chemical contaminants | **Yes** — [EA Water Quality Archive](https://environment.data.gov.uk/water-quality/) | Seasonal / inferred | Historical samples; live chemistry at bathing waters is mostly bacteria today |
| Drinking water treatment | **Partly / no** — water company reports; no neat national public API | N/A | Unlikely to be a core recreational-water indicator |
| Household pollution | **No direct API** — inferred via sewer/blockage/pollution proxies | Inferred | Treat as supporting context, not a primary signal |

### Integration status in this prototype

| Factor | Status | Implementation |
|--------|--------|----------------|
| Heavy rainfall | **Live** (when Met Office key set) | `app/services/clients/met-office-client.js` |
| Bacteria / viruses | **Live** (designated bathing waters) | `app/services/clients/bathing-water-client.js` |
| Bathing water classification | **Live** (nationwide) | `app/services/mappers/bathing-water-mapper.js` |
| Map basemap | **Live** (when OS key set) | `app/services/clients/os-maps-client.js` |
| River level / flow | **Live** (location detail page only) | `app/services/clients/hydrology-client.js` |
| Sewage discharges | **Live** (8 of 9 water companies; not Southern Water) | `app/services/clients/storm-overflow-client.js` |
| Water temperature | Not connected | — |
| Chemistry (pH, ammonia, dissolved oxygen) | **Live** (location detail page only) | `app/services/clients/water-quality-client.js` |
| Chemistry (nitrate, phosphate, turbidity, conductivity, chlorophyll) | Not connected | — |
| Industrial pollution / pollution incidents | **Live** (designated bathing waters) | `app/services/clients/pollution-incident-client.js` |
| Algal blooms | **Partial** (harmful algae incidents from bathing-water API) | `app/services/clients/pollution-incident-client.js` |
| Ecological health | Not connected | — |
| Drinking water / household | Not in scope | — |

**Nationwide:** Valid UK postcodes are geocoded via [postcodes.io](https://postcodes.io/) and matched to the nearest designated bathing waters via the EA API. Rainfall is enriched from Met Office when configured. Legacy mock data in `app/data/water-locations.json` is only used for direct location URLs (demonstration scenarios).

### Suggested integration order

Aligned with the “would I feel confident today?” journey for bathing waters:

1. ~~**EA Hydrology + Flood Monitoring** — river level, flow at nearest stations~~ — done (location detail page); water temperature still not connected
2. ~~**Storm Overflow Hub / EDM** — recent sewage discharges on overview and location pages~~ — done; covers 8 of 9 water companies (see below)
3. **EA Water Quality** — chemistry table — pH, ammonia and dissolved oxygen done (location detail page); nitrate, phosphate, turbidity, conductivity and chlorophyll still not connected (ambiguous determinand codes need more care)
4. ~~**Pollution incidents** — bathing-water open/recent incidents~~ — done; national NIRS Category 1/2 quarterly dump left for a later phase
5. **Algae / ecology** — harmful algae incidents partially covered via #4; broader ecology signals still not connected

### Connected APIs

**Environment Agency Bathing Water API** (`https://environment.data.gov.uk/bwq/`) — any valid UK postcode:

- Nearest designated bathing waters (coastal and inland)
- Annual compliance classification (2025 season)
- Latest in-season sample (E. coli, intestinal enterococci)
- Short-term pollution risk forecast
- Sampling point coordinates

**Postcode geocoding** — [postcodes.io](https://postcodes.io/) (no API key required)

**EA Flood Monitoring API** (`https://environment.data.gov.uk/flood-monitoring/`) — river level and flow at the nearest monitoring station:

- Only fetched for the single location detail page (not the overview list), since that's the only place it's shown
- Walks outward through nearby stations if the nearest one has a decommissioned/dataless measure
- This is a "Beta service" per EA's own API metadata and can be slow (a few seconds); results are cached for 15 minutes and bounded by a request timeout so a slow response never blocks the page — river level/flow simply won't show if it times out

**Water UK National Storm Overflow Hub (NSOH)** — near-real-time storm overflow discharge status, on both the overview and location detail pages:

- There's no single national feed — each water company publishes its own Esri ArcGIS feature service. This queries all of them in parallel: Anglian, Northumbrian, United Utilities, Severn Trent, South West Water, Wessex, Yorkshire and Thames Water (8 of England's 9 water companies)
- **Southern Water** is not included — it moved off this ArcGIS pattern in 2026 and would need separate handling
- One combined bounding-box query covers every location shown on a page (rather than one query per location), then the nearest outfall to each location is matched in memory — keeps it to ~8 requests per page load rather than dozens
- Each outfall reports `Start` (currently discharging), `Stop`, or `Offline` (monitor not reporting); a discharge also counts as "recent" if it stopped within the last 48 hours
- Only outfalls within 5km of a location are matched; beyond that it's reported as no nearby monitored outfall rather than guessing

**EA Water Quality Archive** (`https://environment.data.gov.uk/water-quality/`) — pH, ammonia and dissolved oxygen on the location detail page's chemistry table:

- The EA replaced this API entirely in December 2025. The new one requires POST requests, a bounded date range (max 1 year per radius search), and only returns a determinand code rather than a friendly name — several chemistry fields (nitrate, phosphate, turbidity, conductivity, chlorophyll) have multiple ambiguous candidate codes, so only the three with an unambiguous, well-known code are connected for now
- This is **periodic lab sampling, not live sensor data** — a site might only be sampled every few weeks. The UI shows how long ago the sample was taken so this isn't mistaken for a real-time reading
- A plain radius search returns mostly sewage treatment works effluent monitoring (which would badly mislabel a river as polluted using discharge-point values) — results are filtered to ambient sample types only (river, pond/lake/reservoir, estuarine, sea water)
- Searches a recent 90-day window first, widening to the full permitted year and then the year before if nothing turns up nearby
- Only fetched for the single location detail page, same reasoning as river level/flow

**EA Bathing Water pollution incidents** — open and recently closed incidents at designated bathing waters, on overview and location pages:

- Same Bathing Water API platform we already use for classifications and samples (`/doc/bathing-water-quality/pollution-incident`)
- Includes sewage, oil/fuel, chemicals, abnormal rainfall, dredging, decaying marine life, and **harmful algae** — open algae incidents also drive the algae warning on location cards
- Shows open incidents plus closed ones from the last 90 days; open incidents raise the location status and surface as health warnings
- This is **not** the national NIRS Category 1/2 quarterly ZIP dataset (serious incidents nationwide with lag) — that remains a possible later enrichment for seasonal context

```
app/services/clients/postcode-client.js        # UK postcode → lat/lng + grid ref
app/services/clients/bathing-water-client.js   # EA Bathing Water API client with 15-min cache
app/services/clients/hydrology-client.js       # EA Flood Monitoring API client with 15-min cache
app/services/clients/storm-overflow-client.js  # National Storm Overflow Hub client (8 water company feeds) with 10-min cache
app/services/clients/water-quality-client.js   # EA Water Quality Archive client (pH, ammonia, dissolved oxygen) with 6-hour cache
app/services/clients/pollution-incident-client.js  # EA Bathing Water pollution incidents (open + recent) with 15-min cache
app/services/clients/http-utils.js             # Shared retry-with-backoff and concurrency limiting
app/services/mappers/bathing-water-mapper.js   # API → location model
```

### Configuring API keys

#### Met Office Weather DataHub

Rainfall totals (24h / 48h / 72h) use the **Site-Specific Global Spot** API when your key is subscribed to that product.

**Local:**
```bash
cp .env.example .env
# Add your key to .env, then restart npm run dev
```

If you only have **Land Observations** subscribed, the service will resolve the nearest UK weather station but rainfall totals will show as pending until you also subscribe to Global Spot (free tier available on Weather DataHub).

**Heroku:**
```bash
heroku config:set MET_OFFICE_GLOBAL_SPOT_API_KEY=your-global-spot-key -a your-app-name
heroku config:set MET_OFFICE_LAND_OBS_API_KEY=your-land-obs-key -a your-app-name
```

### Ordnance Survey Maps API

The map basemap uses the [OS Maps API](https://osdatahub.os.uk/) when `OS_MAPS_API_KEY` is set. Without it, OpenFreeMap tiles are used as a placeholder.

1. Create a project at [OS Data Hub](https://osdatahub.os.uk/) and add **OS Maps API**
2. Copy your **Project API Key**

**Local** — add to `.env`:

```
OS_MAPS_API_KEY=your-os-project-api-key
```

Optional style (Web Mercator): `OS_MAPS_LAYER=Outdoor_3857` (default), `Road_3857`, or `Light_3857`

**Heroku:**

```bash
heroku config:set OS_MAPS_API_KEY=your-os-project-api-key -a your-app-name
```

## Architecture

```
app/
├── assets/           # SCSS and JavaScript
├── components/       # (views/components/) Reusable Nunjucks macros
├── data/             # Mock JSON data
├── services/         # Data access layer (future API integration)
├── views/            # Page templates
├── routes.js         # Express routes
└── filters.js        # Nunjucks template filters
```

### Service layer

`app/services/water-service.js` orchestrates postcode routing, caching, and enrichment. Client modules live in `app/services/clients/`; API response mapping in `app/services/mappers/`. See [API roadmap](#api-roadmap) for planned integrations.

### Mock data

`app/data/water-locations.json` contains six locations:

- 3 rivers (Thames, Kennet, Loddon)
- 1 lake (Dinton Pastures)
- 1 reservoir (Queen Mother Reservoir)
- 1 designated bathing water (Thames at Wallingford)

### Map

The map uses the [Defra Interactive Map](https://github.com/DEFRA/interactive-map) (`@defra/interactive-map`) with the MapLibre provider. With an OS Maps API key, basemap tiles come from Ordnance Survey; otherwise OpenFreeMap is used. List and table views provide accessible alternatives.

Registered as a GOV.UK Prototype Kit plugin in `app/config.json`. Marker selection shows a summary panel with a link to the full location page.

## Design principles

- GOV.UK Design System and Prototype Kit conventions
- Mobile-first, WCAG 2.2 AA accessibility
- Progressive disclosure and plain English
- Map is never the only way to access information
- Status uses text labels, not colour alone

## Disclaimer

This is a discovery prototype for user research. It uses mock data and does not replace official services such as [Swimfo](https://environment.data.gov.uk/bwq/profiles/).

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
| Local overview | `/overview?postcode=RG1%201AA` | Area summary with confidence status |
| Map and list | `/map?postcode=RG1%201AA` | Map placeholder, list and table views |
| Location detail | `/location/river-thames-caversham` | Full location information |
| Ask a question | `/ask` | Conversational Q&A (predefined responses) |
| Understanding | `/understanding-water-quality` | Educational content |

### Example postcodes

- `YO11 1AA` – Scarborough (live EA bathing water data)
- `YO21 1AA` – Whitby (live)
- `YO15 2AA` – Bridlington (live)
- `RG1 1AA` – Reading (mock data, Berkshire demo area)

### Live API integration

**Environment Agency Bathing Water API** (`https://environment.data.gov.uk/bwq/`) is integrated for Yorkshire postcodes (YO, HU, LS, BD, HG, etc.). The service fetches:

- Annual compliance classification (2025 season)
- Latest in-season sample (E. coli, intestinal enterococci)
- Short-term pollution risk forecast
- Sampling point coordinates

```
app/services/clients/bathing-water-client.js   # API client with 15-min cache
app/services/mappers/bathing-water-mapper.js   # API → location model
app/data/yorkshire-bathing-waters.json         # 22 Yorkshire bathing waters
```

Pending: Flood Monitoring, Water Quality, Hydrology, EDM.

### Met Office Weather DataHub

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

`app/services/water-service.js` separates data from presentation. In production, functions in this module would call live APIs from:

- Environment Agency (hydrology, bathing water, pollution)
- Met Office (rainfall, weather)
- Water companies (EDM storm overflow data)
- Natural England, local authorities, citizen science platforms

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

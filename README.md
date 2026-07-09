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

- `RG1 1AA` – Reading
- `RG4 8BY` – Caversham
- `OX10 0EB` – Wallingford

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

The map is a placeholder structured for the [Defra Accessible Maps](https://digital.defra.gov.uk/architecture-and-software-development/defra-accessible-maps) approach. List and table views provide accessible alternatives.

## Design principles

- GOV.UK Design System and Prototype Kit conventions
- Mobile-first, WCAG 2.2 AA accessibility
- Progressive disclosure and plain English
- Map is never the only way to access information
- Status uses text labels, not colour alone

## Disclaimer

This is a discovery prototype for user research. It uses mock data and does not replace official services such as [Swimfo](https://environment.data.gov.uk/bwq/profiles/).

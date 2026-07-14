#!/usr/bin/env node
/**
 * Experimental fetch of Canal & River Trust reservoirs.
 * Not connected to the GOV.UK Prototype Kit UI.
 */

const { mapCrtReservoirCollection } = require('./map-to-schema')

const FEATURE_QUERY =
  'https://services.arcgis.com/DknzyjEEie5tEW0u/arcgis/rest/services/Canal_And_River_Trust_Reservoirs_View/FeatureServer/0/query' +
  '?where=1%3D1&outFields=*&outSR=4326&f=geojson'

function parseArgs (argv) {
  const out = { lat: null, lng: null, limit: null }
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '--lat') out.lat = Number(argv[++i])
    else if (argv[i] === '--lng') out.lng = Number(argv[++i])
    else if (argv[i] === '--limit') out.limit = Number(argv[++i])
  }
  return out
}

function haversineKm (a, b) {
  const toRad = (d) => (d * Math.PI) / 180
  const R = 6371
  const dLat = toRad(b.lat - a.lat)
  const dLng = toRad(b.lng - a.lng)
  const lat1 = toRad(a.lat)
  const lat2 = toRad(b.lat)
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2
  return 2 * R * Math.asin(Math.sqrt(h))
}

async function main () {
  const args = parseArgs(process.argv.slice(2))

  let response
  try {
    response = await fetch(FEATURE_QUERY, {
      headers: { Accept: 'application/geo+json, application/json' }
    })
  } catch (err) {
    console.error('Network error fetching CRT reservoirs:', err.message)
    process.exit(1)
  }

  if (!response.ok) {
    console.error(`CRT FeatureServer HTTP ${response.status}`)
    process.exit(1)
  }

  let geojson
  try {
    geojson = await response.json()
  } catch (err) {
    console.error('Failed to parse GeoJSON:', err.message)
    process.exit(1)
  }

  let sites = mapCrtReservoirCollection(geojson)
  console.error(`Fetched ${sites.length} CRT reservoirs (experimental spike).`)
  console.error('Attribution: Canal & River Trust. Not wired to the app UI.')

  if (args.lat != null && args.lng != null && Number.isFinite(args.lat) && Number.isFinite(args.lng)) {
    const origin = { lat: args.lat, lng: args.lng }
    sites = sites
      .map((site) => ({
        ...site,
        distanceKm: Math.round(haversineKm(origin, site.coordinates) * 10) / 10
      }))
      .sort((a, b) => a.distanceKm - b.distanceKm)
  }

  if (args.limit && Number.isFinite(args.limit)) {
    sites = sites.slice(0, args.limit)
  }

  console.log(JSON.stringify(sites, null, 2))
}

main()

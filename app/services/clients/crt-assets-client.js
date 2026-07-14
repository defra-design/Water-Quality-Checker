/**
 * Canal & River Trust open assets — reservoirs (and helper lookups)
 * https://data-canalrivertrust.opendata.arcgis.com/
 *
 * Asset register geography for named CRT-managed reservoirs. Hub lists Open
 * Government Licence — reconfirm CRT licence PDF before treating as production
 * policy sign-off. Not bathing-water quality data; swimming may be restricted.
 */

const { fetchJsonWithRetry, withTimeout } = require('./http-utils')
const { baseDiscoveryLocation } = require('../mappers/discovery-site-mapper')

const RESERVOIRS_QUERY =
  'https://services.arcgis.com/DknzyjEEie5tEW0u/arcgis/rest/services/Canal_And_River_Trust_Reservoirs_View/FeatureServer/0/query' +
  '?where=1%3D1&outFields=*&outSR=4326&f=geojson'

const CACHE_TTL_MS = 6 * 60 * 60 * 1000
const REQUEST_TIMEOUT_MS = 10000
const DEFAULT_RADIUS_KM = 30
const DEFAULT_LIMIT = 8

const SOURCE = {
  name: 'Canal & River Trust Reservoirs',
  url: 'https://data-canalrivertrust.opendata.arcgis.com/datasets/CanalRiverTrust::canal-and-river-trust-reservoirs-view'
}

let reservoirsCache = null
let reservoirsCacheTime = 0

function haversineKm (lat1, lng1, lat2, lng2) {
  const toRad = (deg) => deg * (Math.PI / 180)
  const dLat = toRad(lat2 - lat1)
  const dLng = toRad(lng2 - lng1)
  const a = Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2
  return 6371 * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))
}

function featureCoordinates (feature) {
  const geometry = feature?.geometry
  if (!geometry) return null
  if (geometry.type === 'Point') {
    const [lng, lat] = geometry.coordinates
    return { lat, lng }
  }
  if (geometry.type === 'Polygon' || geometry.type === 'MultiPolygon') {
    const ring = geometry.type === 'Polygon'
      ? geometry.coordinates[0]
      : geometry.coordinates[0][0]
    let sx = 0
    let sy = 0
    for (const [x, y] of ring) {
      sx += x
      sy += y
    }
    return { lng: sx / ring.length, lat: sy / ring.length }
  }
  return null
}

function mapReservoirFeature (feature) {
  const props = feature.properties || {}
  const coordinates = featureCoordinates(feature)
  if (!coordinates) return null

  const assetId = props.sap_func_loc || props.OBJECTID
  if (assetId == null) return null
  const name = props.sap_description || `CRT reservoir ${assetId}`

  return baseDiscoveryLocation({
    id: `crt-reservoir-${String(assetId).toLowerCase().replace(/\s+/g, '-')}`,
    operatorAssetId: props.sap_func_loc || null,
    name,
    location: props.waterway_name || 'Canal & River Trust reservoir',
    waterbodyType: 'reservoir',
    siteKind: 'crt_reservoir',
    coordinates,
    confidenceSummary: `${name} is listed on the Canal & River Trust asset register. This is not an Environment Agency designated bathing water and does not include official swimming water-quality tests. Swimming may be restricted or prohibited.`,
    latestIssues: [
      'Canal & River Trust asset location — confirm access and any swimming restrictions before visiting'
    ],
    dataSources: [SOURCE],
    lastUpdated: new Date().toISOString().slice(0, 10),
    futureApiSource: 'CRT open data + nearby sensors',
    dataSource: 'crt-reservoirs'
  })
}

async function loadAllReservoirs () {
  if (reservoirsCache && Date.now() - reservoirsCacheTime < CACHE_TTL_MS) {
    return reservoirsCache
  }

  const pending = fetchJsonWithRetry(RESERVOIRS_QUERY, {
    headers: { Accept: 'application/geo+json, application/json' },
    errorPrefix: 'CRT Reservoirs API',
    retries: 1
  }).then(geojson => {
    const locations = (geojson.features || []).map(mapReservoirFeature).filter(Boolean)
    reservoirsCache = locations
    reservoirsCacheTime = Date.now()
    return locations
  })

  return withTimeout(pending, REQUEST_TIMEOUT_MS, reservoirsCache || [])
}

/**
 * Nearest CRT reservoirs within radiusKm.
 */
async function getReservoirsNear (lat, lng, {
  radiusKm = DEFAULT_RADIUS_KM,
  limit = DEFAULT_LIMIT
} = {}) {
  try {
    const all = await loadAllReservoirs()
    return all
      .map(loc => ({
        ...loc,
        distanceKm: Math.round(haversineKm(lat, lng, loc.coordinates.lat, loc.coordinates.lng) * 10) / 10
      }))
      .filter(loc => loc.distanceKm <= radiusKm)
      .sort((a, b) => a.distanceKm - b.distanceKm)
      .slice(0, limit)
  } catch (err) {
    console.error('CRT reservoirs fetch failed:', err.message)
    return []
  }
}

async function getReservoirById (id) {
  const normalised = id.startsWith('crt-reservoir-') ? id : `crt-reservoir-${id}`
  try {
    const all = await loadAllReservoirs()
    return all.find(loc => loc.id === normalised) || null
  } catch (err) {
    console.error(`CRT reservoir ${id} fetch failed:`, err.message)
    return null
  }
}

module.exports = {
  getReservoirsNear,
  getReservoirById,
  loadAllReservoirs,
  mapReservoirFeature
}

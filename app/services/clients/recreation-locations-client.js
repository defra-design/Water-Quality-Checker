/**
 * Environment Agency Water recreation locations (England)
 * https://environment.data.gov.uk/dataset/40032292-6737-480f-a6c1-cd49f1e57695
 *
 * Research collation of recreation presence (~2017–2024) from 17 organisations.
 * Useful for discovering more places people use water — not designated bathing
 * water classifications or live bacteria samples.
 */

const { fetchJsonWithRetry, withTimeout } = require('./http-utils')
const { baseDiscoveryLocation, mapWaterbodyType, shortActivityList } = require('../mappers/discovery-site-mapper')

const OGC_ITEMS =
  'https://environment.data.gov.uk/spatialdata/water-recreation-locations-zones-catchment/ogc/features/v1/collections/Water_recreation_locations/items'
const CACHE_TTL_MS = 6 * 60 * 60 * 1000
const REQUEST_TIMEOUT_MS = 10000
const DEFAULT_RADIUS_KM = 20
const DEFAULT_LIMIT = 12
const PAGE_LIMIT = 100

const cache = new Map()

function getCached (key) {
  const entry = cache.get(key)
  if (!entry) return undefined
  if (Date.now() - entry.time > CACHE_TTL_MS) {
    cache.delete(key)
    return undefined
  }
  return entry.data
}

function setCache (key, data) {
  cache.set(key, { time: Date.now(), data })
}

function roundCoord (value) {
  return Math.round(value * 100) / 100
}

/**
 * Approximate bbox (degrees) for a radius in km around a point.
 */
function bboxAround (lat, lng, radiusKm) {
  const latDelta = radiusKm / 111
  const lngDelta = radiusKm / (111 * Math.max(Math.cos((lat * Math.PI) / 180), 0.2))
  return [
    lng - lngDelta,
    lat - latDelta,
    lng + lngDelta,
    lat + latDelta
  ]
}

function featureCoordinates (feature) {
  const geometry = feature?.geometry
  if (!geometry) return null
  if (geometry.type === 'Point') {
    const [lng, lat] = geometry.coordinates
    return { lat, lng }
  }
  return null
}

function isSwimRelevant (props) {
  if (!props) return false
  if (props.swimming__activity_presence_ === 1) return true
  if ((props.designated_bathing_waters____of || 0) > 0) return true
  if ((props.open_water_venues____of_reports || 0) > 0) return true
  if ((props.swimming_clubs____of_reports_of || 0) > 0) return true
  if ((props.swimming_events____of_reports || 0) > 0) return true
  const list = String(props.list_of_recreation_types || '').toLowerCase()
  if (list.includes('swim') || list.includes('bathing') || list.includes('open water')) return true
  // Keep lake / coastal “recreation site” pins — main inventory expansion
  if (list.includes('recreation site')) {
    const type = String(props.waterbody_type || '')
    if (/lake|coast|estuar|unclassified/i.test(type)) return true
  }
  return false
}

function buildName (props) {
  const waterType = props.waterbody_type && props.waterbody_type !== 'Unclassified'
    ? props.waterbody_type
    : 'Water'
  const activities = shortActivityList(props.list_of_recreation_types, 2)
  if (activities.length) {
    return `${waterType} recreation site (${activities.join(', ').toLowerCase()})`
  }
  return `${waterType} recreation site`
}

function mapFeatureToLocation (feature) {
  const props = feature.properties || {}
  const coordinates = featureCoordinates(feature)
  if (!coordinates || props.location_id == null) return null

  const activities = shortActivityList(props.list_of_recreation_types, 4)
  const waterbodyType = mapWaterbodyType(props.waterbody_type)
  const name = buildName(props)

  return baseDiscoveryLocation({
    id: `recreation-${props.location_id}`,
    locationId: String(props.location_id),
    name,
    location: props.waterbody_salinity || props.waterbody_type || 'England',
    waterbodyType,
    siteKind: 'recreation_research',
    coordinates,
    confidenceSummary: `Reported recreation area from an Environment Agency research dataset (aggregated reports ~2017–2024). Not a designated bathing water — official day-to-day monitoring may be limited or absent. Activities noted: ${activities.join(', ') || 'recreation'}.`,
    recreationTypes: activities,
    dataSources: [
      {
        name: 'EA Water recreation locations (England)',
        url: 'https://environment.data.gov.uk/dataset/40032292-6737-480f-a6c1-cd49f1e57695'
      }
    ],
    lastUpdated: '2024',
    futureApiSource: 'EA recreation research layer + nearby sensors',
    dataSource: 'ea-recreation-locations'
  })
}

async function queryItems (params) {
  const url = `${OGC_ITEMS}?${params.toString()}`
  return fetchJsonWithRetry(url, {
    headers: { Accept: 'application/geo+json, application/json' },
    errorPrefix: 'EA Recreation Locations API',
    retries: 1
  })
}

/**
 * Fetch swim-relevant recreation locations near a coordinate.
 */
async function getRecreationLocationsNear (lat, lng, {
  radiusKm = DEFAULT_RADIUS_KM,
  limit = DEFAULT_LIMIT
} = {}) {
  const rlat = roundCoord(lat)
  const rlng = roundCoord(lng)
  const cacheKey = `rec:${rlat}:${rlng}:${radiusKm}:${limit}`
  const cached = getCached(cacheKey)
  if (cached !== undefined) return cached

  const bbox = bboxAround(lat, lng, radiusKm)
  const params = new URLSearchParams({
    limit: String(PAGE_LIMIT),
    bbox: bbox.join(','),
    f: 'json'
  })

  const pending = queryItems(params).then(data => {
    const features = data.features || []
    const locations = features
      .filter(f => isSwimRelevant(f.properties))
      .map(mapFeatureToLocation)
      .filter(Boolean)

    setCache(cacheKey, locations)
    return locations
  })

  try {
    return await withTimeout(pending, REQUEST_TIMEOUT_MS, [])
  } catch (err) {
    console.error('EA recreation locations fetch failed:', err.message)
    return []
  }
}

/**
 * Fetch a single recreation location by dataset location_id.
 */
async function getRecreationLocationById (locationId) {
  const cacheKey = `rec:id:${locationId}`
  const cached = getCached(cacheKey)
  if (cached !== undefined) return cached

  const params = new URLSearchParams({
    limit: '1',
    filter: `location_id='${String(locationId).replace(/'/g, "''")}'`,
    f: 'json'
  })

  try {
    const data = await withTimeout(queryItems(params), REQUEST_TIMEOUT_MS, null)
    const feature = data?.features?.[0]
    const location = feature ? mapFeatureToLocation(feature) : null
    setCache(cacheKey, location)
    return location
  } catch (err) {
    console.error(`EA recreation location ${locationId} fetch failed:`, err.message)
    return null
  }
}

module.exports = {
  getRecreationLocationsNear,
  getRecreationLocationById,
  isSwimRelevant,
  mapFeatureToLocation
}

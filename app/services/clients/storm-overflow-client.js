/**
 * Storm overflow (sewage discharge) client — Water UK National Storm
 * Overflow Hub (NSOH), built by Stream on Esri ArcGIS.
 * https://www.streamwaterdata.co.uk/pages/the-national-storm-overflow-hub
 *
 * NSOH aggregates near-real-time Event Duration Monitor (EDM) feeds
 * published by each water company (updated roughly hourly). There's no
 * single combined API — each company publishes its own ArcGIS feature
 * service — so this queries them all and merges the results.
 *
 * No API key required. Southern Water migrated off this ArcGIS pattern in
 * May 2026 and isn't included; that region will show "not connected".
 */

const { fetchJsonWithRetry, runWithConcurrency, withTimeout } = require('./http-utils')

const REQUEST_CONCURRENCY = 4
const REQUEST_TIMEOUT_MS = 8000
const CACHE_TTL_MS = 10 * 60 * 1000
const BBOX_PADDING_DEG = 0.05
// Snap size used when enriching a single location (e.g. location detail page
// and its "nearby locations"). Rounding to a shared grid cell means several
// nearby single-location lookups on the same page reuse one cached query
// instead of each firing their own set of company requests.
const SINGLE_LOCATION_GRID_DEG = 0.15
const MAX_OUTFALL_DISTANCE_KM = 5
const RECENT_EVENT_WINDOW_MS = 48 * 60 * 60 * 1000

// Field names are mostly PascalCase; South West Water's feed uses camelCase.
const COMPANY_FEEDS = [
  { company: 'Anglian Water', url: 'https://services3.arcgis.com/VCOY1atHWVcDlvlJ/arcgis/rest/services/stream_service_outfall_locations_view/FeatureServer/0' },
  { company: 'Northumbrian Water', url: 'https://services-eu1.arcgis.com/MSNNjkZ51iVh8yBj/arcgis/rest/services/Northumbrian_Water_Storm_Overflow_Activity_2_view/FeatureServer/0' },
  { company: 'United Utilities', url: 'https://services5.arcgis.com/5eoLvR0f8HKb7HWP/arcgis/rest/services/United_Utilities_Storm_Overflow_Activity/FeatureServer/0' },
  { company: 'Severn Trent Water', url: 'https://services1.arcgis.com/NO7lTIlnxRMMG9Gw/arcgis/rest/services/Severn_Trent_Water_Storm_Overflow_Activity/FeatureServer/0' },
  { company: 'South West Water', url: 'https://services-eu1.arcgis.com/OMdMOtfhATJPcHe3/arcgis/rest/services/NEH_outlets_PROD/FeatureServer/0', lowercaseFields: true },
  { company: 'Wessex Water', url: 'https://services.arcgis.com/3SZ6e0uCvPROr4mS/arcgis/rest/services/Wessex_Water_Storm_Overflow_Activity/FeatureServer/0' },
  { company: 'Yorkshire Water', url: 'https://services-eu1.arcgis.com/1WqkK5cDKUbF0CkH/arcgis/rest/services/Yorkshire_Water_Storm_Overflow_Activity/FeatureServer/0' },
  { company: 'Thames Water', url: 'https://services2.arcgis.com/g6o32ZDQ33GpCIu3/arcgis/rest/services/Thames_Water_Storm_Overflow_Activity_(Production)_view/FeatureServer/0' }
  // Southern Water intentionally omitted: moved off this ArcGIS pattern in
  // May 2026. That coastline currently shows "not connected".
]

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
  return Math.round(value * 1000) / 1000
}

function normaliseAttributes (attrs, lowercaseFields) {
  if (lowercaseFields) {
    return {
      id: attrs.Id ?? attrs.id,
      status: attrs.status,
      statusStart: attrs.statusStart,
      latestEventStart: attrs.latestEventStart,
      latestEventEnd: attrs.latestEventEnd,
      lat: attrs.latitude,
      lng: attrs.longitude,
      waterCourse: attrs.receivingWaterCourse
    }
  }
  return {
    id: attrs.Id,
    status: attrs.Status,
    statusStart: attrs.StatusStart,
    latestEventStart: attrs.LatestEventStart,
    latestEventEnd: attrs.LatestEventEnd,
    lat: attrs.Latitude,
    lng: attrs.Longitude,
    waterCourse: attrs.ReceivingWaterCourse
  }
}

async function queryCompanyFeed (feed, bbox) {
  const geometry = encodeURIComponent(JSON.stringify({
    xmin: bbox.xmin,
    ymin: bbox.ymin,
    xmax: bbox.xmax,
    ymax: bbox.ymax,
    spatialReference: { wkid: 4326 }
  }))
  const url = `${feed.url}/query?where=1%3D1&outFields=*&geometry=${geometry}&geometryType=esriGeometryEnvelope&inSR=4326&spatialRel=esriSpatialRelIntersects&returnGeometry=false&f=json`

  const data = await fetchJsonWithRetry(url, { errorPrefix: 'Storm Overflow API', retries: 1 })
  if (data.error) {
    throw new Error(data.error.message || `Storm Overflow API error for ${feed.company}`)
  }

  return (data.features || [])
    .map(f => normaliseAttributes(f.attributes, feed.lowercaseFields))
    .filter(item => item.lat != null && item.lng != null)
    .map(item => ({ ...item, company: feed.company }))
}

function haversineKm (lat1, lng1, lat2, lng2) {
  const toRad = (deg) => deg * (Math.PI / 180)
  const dLat = toRad(lat2 - lat1)
  const dLng = toRad(lng2 - lng1)
  const a = Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2
  return 6371 * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))
}

function boundingBoxFor (locations) {
  if (locations.length === 1) {
    const { lat, lng } = locations[0].coordinates
    const snappedLat = Math.round(lat / SINGLE_LOCATION_GRID_DEG) * SINGLE_LOCATION_GRID_DEG
    const snappedLng = Math.round(lng / SINGLE_LOCATION_GRID_DEG) * SINGLE_LOCATION_GRID_DEG
    return {
      xmin: snappedLng - SINGLE_LOCATION_GRID_DEG,
      ymin: snappedLat - SINGLE_LOCATION_GRID_DEG,
      xmax: snappedLng + SINGLE_LOCATION_GRID_DEG,
      ymax: snappedLat + SINGLE_LOCATION_GRID_DEG
    }
  }

  const lats = locations.map(l => l.coordinates.lat)
  const lngs = locations.map(l => l.coordinates.lng)
  return {
    xmin: Math.min(...lngs) - BBOX_PADDING_DEG,
    ymin: Math.min(...lats) - BBOX_PADDING_DEG,
    xmax: Math.max(...lngs) + BBOX_PADDING_DEG,
    ymax: Math.max(...lats) + BBOX_PADDING_DEG
  }
}

/**
 * Fetch all known storm overflow outfalls within a bounding box, merged
 * across every connected water company. Cached for CACHE_TTL_MS, and
 * bounded by a timeout so a slow/unavailable company feed can't hold up
 * the page — its outfalls are simply missing until the next successful poll.
 */
async function getOutfallsInBoundingBox (bbox) {
  const cacheKey = `bbox:${bbox.xmin.toFixed(3)}:${bbox.ymin.toFixed(3)}:${bbox.xmax.toFixed(3)}:${bbox.ymax.toFixed(3)}`
  const cached = getCached(cacheKey)
  if (cached !== undefined) return cached

  // Cache is populated once the underlying fetch resolves, independent of the
  // timeout below — so a slow first request doesn't poison the cache with an
  // empty result for the full TTL; it just means this particular call misses out.
  const pending = runWithConcurrency(COMPANY_FEEDS, REQUEST_CONCURRENCY, async (feed) => {
    try {
      return await queryCompanyFeed(feed, bbox)
    } catch (err) {
      console.error(`Storm overflow fetch failed for ${feed.company}:`, err.message)
      return []
    }
  }).then(results => {
    const outfalls = results.flat()
    setCache(cacheKey, outfalls)
    return outfalls
  })

  return withTimeout(pending, REQUEST_TIMEOUT_MS, [])
}

function findNearestOutfall (location, outfalls) {
  let best = null
  let bestDistanceKm = Infinity

  for (const outfall of outfalls) {
    const distanceKm = haversineKm(location.coordinates.lat, location.coordinates.lng, outfall.lat, outfall.lng)
    if (distanceKm < bestDistanceKm) {
      bestDistanceKm = distanceKm
      best = outfall
    }
  }

  if (!best || bestDistanceKm > MAX_OUTFALL_DISTANCE_KM) return null
  return { ...best, distanceKm: Math.round(bestDistanceKm * 10) / 10 }
}

function formatDuration (ms) {
  if (ms == null || ms < 0) return null
  const totalMinutes = Math.round(ms / 60000)
  const hours = Math.floor(totalMinutes / 60)
  const minutes = totalMinutes % 60
  if (hours === 0) return `${minutes} minute${minutes === 1 ? '' : 's'}`
  if (minutes === 0) return `${hours} hour${hours === 1 ? '' : 's'}`
  return `${hours} hour${hours === 1 ? '' : 's'} ${minutes} minute${minutes === 1 ? '' : 's'}`
}

function buildSewageDischargeField (nearest) {
  if (!nearest) {
    return {
      occurred: false,
      when: null,
      description: 'No monitored storm overflow outfall found within 5km of this location.',
      duration: null,
      source: 'Water UK National Storm Overflow Hub',
      isLiveData: true
    }
  }

  const now = Date.now()
  const watercourse = nearest.waterCourse ? `into ${nearest.waterCourse}` : 'into a nearby watercourse'
  const location = `${nearest.company}, ${nearest.distanceKm}km away`

  if (nearest.status === 1) {
    return {
      occurred: true,
      when: nearest.statusStart ? new Date(nearest.statusStart).toISOString() : null,
      description: `Storm overflow currently discharging ${watercourse} (${location}).`,
      duration: nearest.statusStart ? `${formatDuration(now - nearest.statusStart)} so far (ongoing)` : 'Ongoing',
      source: 'Water UK National Storm Overflow Hub',
      isLiveData: true
    }
  }

  if (nearest.status === 0 && nearest.latestEventEnd && (now - nearest.latestEventEnd) < RECENT_EVENT_WINDOW_MS) {
    return {
      occurred: true,
      when: new Date(nearest.latestEventEnd).toISOString(),
      description: `Storm overflow last discharged ${watercourse} (${location}).`,
      duration: nearest.latestEventStart ? formatDuration(nearest.latestEventEnd - nearest.latestEventStart) : null,
      source: 'Water UK National Storm Overflow Hub',
      isLiveData: true
    }
  }

  if (nearest.status === -1) {
    return {
      occurred: false,
      when: null,
      description: `Nearest storm overflow monitor (${location}) is currently offline — its last known status can't be confirmed.`,
      duration: null,
      source: 'Water UK National Storm Overflow Hub',
      isLiveData: true
    }
  }

  return {
    occurred: false,
    when: null,
    description: `No active or recent storm overflow discharge at the nearest monitored outfall (${location}).`,
    duration: null,
    source: 'Water UK National Storm Overflow Hub',
    isLiveData: true
  }
}

/**
 * Enrich locations with the nearest storm overflow outfall's discharge
 * status, fetched once for the whole set (bounding box covering every
 * location) rather than per location.
 */
async function enrichLocationsWithStormOverflows (locations) {
  if (!locations.length) return locations

  let outfalls
  try {
    outfalls = await getOutfallsInBoundingBox(boundingBoxFor(locations))
  } catch (err) {
    console.error('Storm overflow enrichment failed:', err.message)
    return locations
  }

  return locations.map(location => {
    const nearest = findNearestOutfall(location, outfalls)
    return {
      ...location,
      recentSewageDischarge: buildSewageDischargeField(nearest),
      dataSources: [
        ...location.dataSources.filter(s => !s.name.includes('Storm Overflow Hub')),
        { name: 'Water UK National Storm Overflow Hub', url: 'https://www.streamwaterdata.co.uk/pages/the-national-storm-overflow-hub' }
      ]
    }
  })
}

module.exports = {
  enrichLocationsWithStormOverflows
}

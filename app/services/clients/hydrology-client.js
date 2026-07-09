/**
 * Environment Agency Flood Monitoring / Hydrology API client
 * https://environment.data.gov.uk/flood-monitoring/
 *
 * No API key required. Finds the nearest river level and flow monitoring
 * stations to a coordinate and returns their latest readings, matched to
 * the same shape as the mock riverLevel / flow fields.
 */

const { fetchJsonWithRetry, runWithConcurrency, withTimeout } = require('./http-utils')

const BASE_URL = 'https://environment.data.gov.uk/flood-monitoring'
const SEARCH_RADII_KM = [10, 20, 35, 50]
const REQUEST_CONCURRENCY = 4
// EA Flood Monitoring is a "Beta service" per its own API metadata and can be
// slow (observed 2-9s for a single station search). This only runs for the
// single location detail page (never the overview list), and results are
// cached for CACHE_TTL_MS, so a generous timeout here trades one slower
// first visit for not silently dropping real data too eagerly.
const PER_LOCATION_TIMEOUT_MS = 9000
const MAX_STATION_ATTEMPTS = 4

const cache = new Map()
const CACHE_TTL_MS = 15 * 60 * 1000

function roundCoord (value) {
  return Math.round(value * 1000) / 1000
}

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

async function fetchStationSearch (url) {
  // Worth one light retry: a single request per location, and the station
  // list is what everything else depends on.
  return fetchJsonWithRetry(url, { errorPrefix: 'Flood Monitoring API', retries: 1 })
}

async function fetchReading (url) {
  // No retries here: findReadingAmongStations already falls back to the
  // next-nearest station on failure, which is faster and more useful than
  // retrying a single measure that may simply have no live data.
  return fetchJsonWithRetry(url, { errorPrefix: 'Flood Monitoring API', retries: 0 })
}

function haversineKm (lat1, lng1, lat2, lng2) {
  const toRad = (deg) => deg * (Math.PI / 180)
  const dLat = toRad(lat2 - lat1)
  const dLng = toRad(lng2 - lng1)
  const a = Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2
  return 6371 * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))
}

async function findStationsNear (lat, lng) {
  for (const radiusKm of SEARCH_RADII_KM) {
    const url = `${BASE_URL}/id/stations?lat=${lat}&long=${lng}&dist=${radiusKm}&_view=full`
    const data = await fetchStationSearch(url)
    const items = data.items || []
    if (items.length) return items
  }
  return []
}

function pickMeasure (station, parameter) {
  const measures = (station.measures || []).filter(m =>
    m.parameter === parameter && m.unitName && m.unitName !== '---'
  )
  if (!measures.length) return null

  if (parameter === 'level') {
    const nonTidal = measures.filter(m => m.qualifier !== 'Tidal Level')
    const pool = nonTidal.length ? nonTidal : measures
    return pool.find(m => m.unitName === 'm') || pool[0]
  }

  return measures.find(m => m.unitName === 'm3/s') || measures[0]
}

/**
 * Some EA measures are decommissioned and return no readings even though
 * they're listed on the station. Walk outward through nearby stations
 * (already sorted by distance) until we find one with an actual reading.
 */
async function findReadingAmongStations (stations, parameter, maxAttempts = MAX_STATION_ATTEMPTS) {
  let attempts = 0
  for (const station of stations) {
    const measure = pickMeasure(station, parameter)
    if (!measure) continue
    attempts++
    const reading = await getLatestReading(measure['@id'])
    if (reading) return { station, measure, reading }
    if (attempts >= maxAttempts) break
  }
  return null
}

async function getLatestReading (measureId) {
  const cacheKey = `reading:${measureId}`
  const cached = getCached(cacheKey)
  if (cached !== undefined) return cached

  let result = null
  try {
    const data = await fetchReading(`${measureId}/readings?latest`)
    result = data.items?.[0] || null
  } catch (err) {
    console.error(`Hydrology reading fetch failed for ${measureId}:`, err.message)
  }

  setCache(cacheKey, result)
  return result
}

function levelStatus (value, station) {
  const scale = station.stageScale
  if (value == null || !scale) return null
  const { typicalRangeHigh, typicalRangeLow } = scale
  if (typicalRangeHigh != null && value > typicalRangeHigh) return 'above normal'
  if (typicalRangeLow != null && value < typicalRangeLow) return 'below normal'
  return 'normal'
}

function normalRangeLabel (station) {
  const scale = station.stageScale
  if (!scale || scale.typicalRangeLow == null || scale.typicalRangeHigh == null) return null
  return `${scale.typicalRangeLow} – ${scale.typicalRangeHigh} m`
}

/**
 * Fetch the nearest river level and flow readings for a coordinate.
 * Returns null if no stations are found, or if it's taking too long
 * (bounded by PER_LOCATION_TIMEOUT_MS so a slow/rate-limited upstream API
 * can never hold up the page).
 */
async function getRiverConditions (lat, lng) {
  const rlat = roundCoord(lat)
  const rlng = roundCoord(lng)
  const cacheKey = `conditions:${rlat}:${rlng}`
  const cached = getCached(cacheKey)
  if (cached !== undefined) return cached

  const pending = fetchRiverConditions(rlat, rlng, cacheKey).catch(err => {
    console.error(`Hydrology lookup failed for ${rlat},${rlng}:`, err.message)
    setCache(cacheKey, null)
    return null
  })
  return withTimeout(pending, PER_LOCATION_TIMEOUT_MS, null)
}

async function fetchRiverConditions (rlat, rlng, cacheKey) {
  let stations
  try {
    stations = await findStationsNear(rlat, rlng)
  } catch (err) {
    console.error(`Hydrology station search failed for ${rlat},${rlng}:`, err.message)
    setCache(cacheKey, null)
    return null
  }

  if (!stations.length) {
    setCache(cacheKey, null)
    return null
  }

  const withDistance = stations
    .filter(s => s.lat != null && s.long != null)
    .map(s => ({ ...s, distanceKm: haversineKm(rlat, rlng, s.lat, s.long) }))
    .sort((a, b) => a.distanceKm - b.distanceKm)

  const [levelFound, flowFound] = await Promise.all([
    findReadingAmongStations(withDistance, 'level'),
    findReadingAmongStations(withDistance, 'flow')
  ])

  const level = levelFound ? {
    value: levelFound.reading.value,
    unit: levelFound.measure.unitName,
    dateTime: levelFound.reading.dateTime,
    stationName: levelFound.station.label,
    riverName: levelFound.station.riverName || null,
    distanceKm: Math.round(levelFound.station.distanceKm * 10) / 10,
    normalRange: normalRangeLabel(levelFound.station),
    status: levelStatus(levelFound.reading.value, levelFound.station),
    trend: null,
    isLiveData: true
  } : null

  const flow = flowFound ? {
    value: flowFound.reading.value,
    unit: flowFound.measure.unitName,
    dateTime: flowFound.reading.dateTime,
    stationName: flowFound.station.label,
    riverName: flowFound.station.riverName || null,
    distanceKm: Math.round(flowFound.station.distanceKm * 10) / 10,
    status: null,
    trend: null,
    isLiveData: true
  } : null

  const result = (level || flow) ? { level, flow, source: 'Environment Agency Flood Monitoring' } : null
  setCache(cacheKey, result)
  return result
}

/**
 * Enrich multiple locations with nearest river level/flow, deduping API
 * calls by rounded coordinates.
 */
async function enrichLocationsWithRiverConditions (locations) {
  if (!locations.length) return locations

  const uniqueKeys = [...new Set(locations.map(location => {
    const { lat, lng } = location.coordinates
    return `${roundCoord(lat)}:${roundCoord(lng)}`
  }))]

  const entries = await runWithConcurrency(uniqueKeys, REQUEST_CONCURRENCY, async (key) => {
    const [lat, lng] = key.split(':').map(Number)
    try {
      return [key, await getRiverConditions(lat, lng)]
    } catch (err) {
      console.error(`Hydrology enrichment failed for ${key}:`, err.message)
      return [key, null]
    }
  })
  const conditionsByKey = new Map(entries)

  return locations.map((location) => {
    const key = `${roundCoord(location.coordinates.lat)}:${roundCoord(location.coordinates.lng)}`
    const conditions = conditionsByKey.get(key)
    if (!conditions) return location

    return {
      ...location,
      riverLevel: conditions.level || location.riverLevel,
      flow: conditions.flow || location.flow,
      dataSources: [
        ...location.dataSources.filter(s => !s.name.includes('Flood Monitoring')),
        ...(conditions.level || conditions.flow
          ? [{ name: conditions.source, url: 'https://environment.data.gov.uk/flood-monitoring/doc/reference' }]
          : [])
      ]
    }
  })
}

module.exports = {
  getRiverConditions,
  enrichLocationsWithRiverConditions
}

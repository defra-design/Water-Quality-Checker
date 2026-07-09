/**
 * Met Office Weather DataHub client
 * https://datahub.metoffice.gov.uk/
 *
 * Rainfall totals use the Site-Specific Global Spot API (hourly + daily).
 * Falls back to Land Observations (nearest station) when Global Spot is not subscribed.
 *
 * Set MET_OFFICE_GLOBAL_SPOT_API_KEY for rainfall (Site-Specific Global Spot).
 * Set MET_OFFICE_LAND_OBS_API_KEY for nearest-station fallback (Land Observations).
 * MET_OFFICE_API_KEY is used as a fallback when the specific keys are not set.
 */

const SITE_SPECIFIC_BASE = 'https://data.hub.api.metoffice.gov.uk/sitespecific/v0/point'
const LAND_OBS_BASE = 'https://data.hub.api.metoffice.gov.uk/observation-land/1'

const cache = new Map()
const CACHE_TTL_MS = 30 * 60 * 1000

function getGlobalSpotApiKey () {
  return process.env.MET_OFFICE_GLOBAL_SPOT_API_KEY ||
    process.env.MET_OFFICE_API_KEY ||
    ''
}

function getLandObsApiKey () {
  return process.env.MET_OFFICE_LAND_OBS_API_KEY ||
    process.env.MET_OFFICE_API_KEY ||
    ''
}

function getApiKey () {
  return getGlobalSpotApiKey() || getLandObsApiKey()
}

function isConfigured () {
  return Boolean(getGlobalSpotApiKey() || getLandObsApiKey())
}

function roundCoord (value) {
  return Math.round(value * 100) / 100
}

function getCached (key) {
  const entry = cache.get(key)
  if (!entry) return null
  if (Date.now() - entry.time > CACHE_TTL_MS) {
    cache.delete(key)
    return null
  }
  return entry.data
}

function setCache (key, data) {
  cache.set(key, { time: Date.now(), data })
}

function coordCacheKey (lat, lng) {
  return `rainfall:${roundCoord(lat)}:${roundCoord(lng)}`
}

async function fetchWithKey (url, apiKey = getGlobalSpotApiKey()) {
  if (!apiKey) {
    const error = new Error('Met Office API key not configured')
    error.status = 401
    throw error
  }
  const response = await fetch(url, { headers: { apikey: apiKey } })
  const body = await response.text()

  if (!response.ok) {
    const error = new Error(`Met Office API ${response.status}: ${body.slice(0, 200)}`)
    error.status = response.status
    throw error
  }

  try {
    return JSON.parse(body)
  } catch {
    return body
  }
}

function getNumericValue (field) {
  if (field == null) return 0
  if (typeof field === 'number') return field
  if (typeof field === 'object' && field.value != null) return Number(field.value) || 0
  return 0
}

function getTimeSeries (data) {
  return data?.features?.[0]?.properties?.timeSeries || []
}

function getLocationName (data) {
  return data?.features?.[0]?.properties?.location?.name?.value ||
    data?.features?.[0]?.properties?.locationName ||
    null
}

function sumPrecipitationInWindow (timeSeries, hoursBack) {
  const now = Date.now()
  let total = 0

  for (const entry of timeSeries) {
    if (!entry.time) continue
    const entryTime = new Date(entry.time).getTime()
    const hoursAgo = (now - entryTime) / (1000 * 60 * 60)
    if (hoursAgo < 0 || hoursAgo > hoursBack) continue
    total += getNumericValue(entry.totalPrecipAmount)
  }

  return Math.round(total * 10) / 10
}

function sumDailyPrecipitation (timeSeries, daysBack) {
  const now = Date.now()
  let total = 0

  for (const entry of timeSeries) {
    if (!entry.time) continue
    const entryTime = new Date(entry.time).getTime()
    const daysAgo = (now - entryTime) / (1000 * 60 * 60 * 24)
    if (daysAgo < 0 || daysAgo > daysBack) continue
    total += getNumericValue(entry.totalPrecipAmount)
  }

  return Math.round(total * 10) / 10
}

function getObservationPrecipMm (entry) {
  const direct = entry.precipitation_amount ?? entry.precip_amount ??
    entry.total_precipitation ?? entry.precipitation
  if (direct != null) return Number(direct) || 0
  if (entry.precipitation_rate != null) return Number(entry.precipitation_rate) || 0
  return 0
}

function sumObservationPrecipitation (observations, hoursBack) {
  const now = Date.now()
  let total = 0

  for (const entry of observations) {
    if (!entry.datetime) continue
    const hoursAgo = (now - new Date(entry.datetime).getTime()) / (1000 * 60 * 60)
    if (hoursAgo < 0 || hoursAgo > hoursBack) continue
    total += getObservationPrecipMm(entry)
  }

  return Math.round(total * 10) / 10
}

function buildRainfallSummary (last24h, locationName, sourceLabel) {
  let summary = `Rainfall totals from Met Office ${sourceLabel}.`
  if (locationName) {
    summary = `Rainfall near ${locationName} from Met Office ${sourceLabel}.`
  }
  if (last24h == null) {
    return summary
  }
  if (last24h > 10) {
    summary += ' Heavy rain in the last 24 hours may temporarily affect water quality.'
  } else if (last24h > 2) {
    summary += ' Some recent rainfall in the area.'
  } else {
    summary += ' Little recent rainfall recorded.'
  }
  return summary
}

async function fetchSiteSpecificEndpoint (endpoint, lat, lng) {
  const params = new URLSearchParams({
    latitude: String(lat),
    longitude: String(lng),
    excludeParameterMetadata: 'true',
    includeLocationName: 'true'
  })
  return fetchWithKey(`${SITE_SPECIFIC_BASE}/${endpoint}?${params.toString()}`, getGlobalSpotApiKey())
}

async function getSiteSpecificRainfall (lat, lng) {
  const [hourlyData, dailyData] = await Promise.all([
    fetchSiteSpecificEndpoint('hourly', lat, lng),
    fetchSiteSpecificEndpoint('daily', lat, lng)
  ])

  const hourlySeries = getTimeSeries(hourlyData)
  const dailySeries = getTimeSeries(dailyData)

  const last24h = sumPrecipitationInWindow(hourlySeries, 24)
  const last48h = sumPrecipitationInWindow(hourlySeries, 48)
  const hourly72 = sumPrecipitationInWindow(hourlySeries, 72)
  const daily72 = sumDailyPrecipitation(dailySeries, 3)
  const last72h = Math.max(hourly72, daily72, last48h)
  const locationName = getLocationName(hourlyData) || getLocationName(dailyData)

  return {
    last24h,
    last48h,
    last72h,
    unit: 'mm',
    summary: buildRainfallSummary(last24h, locationName, 'Global Spot data'),
    locationName,
    source: 'Met Office Site-Specific Global Spot',
    lastUpdated: new Date().toISOString(),
    isLiveData: true
  }
}

async function getNearestStation (lat, lng) {
  const rlat = roundCoord(lat)
  const rlng = roundCoord(lng)
  const cacheKey = `geohash:${rlat}:${rlng}`
  const cached = getCached(cacheKey)
  if (cached) return cached

  const stations = await fetchWithKey(
    `${LAND_OBS_BASE}/nearest?lat=${rlat}&lon=${rlng}`,
    getLandObsApiKey()
  )
  const station = Array.isArray(stations) ? stations[0] : null
  if (!station?.geohash) {
    throw new Error('No Met Office observation station found for coordinates')
  }

  setCache(cacheKey, station)
  return station
}

async function getLandObservationsRainfall (lat, lng) {
  const station = await getNearestStation(lat, lng)
  const observations = await fetchWithKey(`${LAND_OBS_BASE}/${station.geohash}`, getLandObsApiKey())
  const obs = Array.isArray(observations) ? observations : []

  const last24h = sumObservationPrecipitation(obs, 24)
  const last48h = sumObservationPrecipitation(obs, 48)
  const hasPrecipitation = obs.some(entry =>
    entry.precipitation_amount != null ||
    entry.precip_amount != null ||
    entry.precipitation_rate != null ||
    entry.precipitation != null
  )

  const locationName = station.area || station.geohash

  if (!hasPrecipitation) {
    return {
      last24h: null,
      last48h: null,
      last72h: null,
      unit: 'mm',
      summary: `Nearest Met Office station: ${locationName}. Your API plan includes Land Observations but not rainfall totals — subscribe to Site-Specific Global Spot on Weather DataHub for precipitation data.`,
      locationName,
      stationGeohash: station.geohash,
      source: 'Met Office Land Observations',
      lastUpdated: new Date().toISOString(),
      isLiveData: false,
      needsGlobalSpotSubscription: true
    }
  }

  return {
    last24h,
    last48h,
    last72h: last48h,
    unit: 'mm',
    summary: buildRainfallSummary(last24h, locationName, 'Land Observations'),
    locationName,
    stationGeohash: station.geohash,
    source: 'Met Office Land Observations',
    lastUpdated: new Date().toISOString(),
    isLiveData: true
  }
}

/**
 * Fetch rainfall totals for a coordinate (cached, deduped).
 * Returns null if API key is not configured.
 */
async function getRainfallForCoordinates (lat, lng) {
  if (!isConfigured()) {
    return null
  }

  const cacheKey = coordCacheKey(lat, lng)
  const cached = getCached(cacheKey)
  if (cached) return cached

  let result
  if (getGlobalSpotApiKey()) {
    try {
      result = await getSiteSpecificRainfall(lat, lng)
    } catch (err) {
      if ((err.status === 403 || err.status === 401) && getLandObsApiKey()) {
        result = await getLandObservationsRainfall(lat, lng)
      } else {
        throw err
      }
    }
  } else if (getLandObsApiKey()) {
    result = await getLandObservationsRainfall(lat, lng)
  } else {
    return null
  }

  setCache(cacheKey, result)
  return result
}

/**
 * Enrich multiple locations with rainfall, deduping API calls by coordinates.
 */
async function enrichLocationsWithRainfall (locations) {
  if (!isConfigured() || !locations.length) {
    return locations
  }

  const rainfallByKey = new Map()
  const pending = new Map()

  for (const location of locations) {
    const { lat, lng } = location.coordinates
    const key = coordCacheKey(lat, lng)
    if (!pending.has(key)) {
      pending.set(key, getRainfallForCoordinates(lat, lng))
    }
  }

  const entries = await Promise.all(
    [...pending.entries()].map(async ([key, promise]) => {
      try {
        const rainfall = await promise
        return [key, rainfall]
      } catch (err) {
        console.error(`Met Office rainfall fetch failed for ${key}:`, err.message)
        return [key, null]
      }
    })
  )

  entries.forEach(([key, rainfall]) => rainfallByKey.set(key, rainfall))

  return locations.map((location) => {
    const key = coordCacheKey(location.coordinates.lat, location.coordinates.lng)
    const rainfall = rainfallByKey.get(key)
    if (!rainfall) return location

    return {
      ...location,
      recentRainfall: rainfall,
      dataSources: [
        ...location.dataSources.filter(s => !s.name.includes('Met Office')),
        { name: rainfall.source, url: 'https://datahub.metoffice.gov.uk/' }
      ],
      futureApiSource: location.futureApiSource
        .replace('Met Office (pending)', 'Met Office Weather DataHub (live)')
        .replace('Met Office Weather DataHub', rainfall.source)
    }
  })
}

module.exports = {
  isConfigured,
  getRainfallForCoordinates,
  enrichLocationsWithRainfall,
  getApiKey
}

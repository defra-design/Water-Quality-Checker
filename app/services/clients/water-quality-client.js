/**
 * Environment Agency Water Quality Archive client
 * https://environment.data.gov.uk/water-quality/
 *
 * Replaces the legacy Water Quality Archive API (retired December 2025).
 * Unlike Hydrology or Storm Overflow, this is periodic lab sampling, not
 * continuous sensor data — a given site might only be sampled every few
 * weeks. Connected here: water temperature (top-level indicator) plus pH,
 * ammonia and dissolved oxygen (chemistry table). Wider chemistry fields
 * still have ambiguous determinand codes and need more careful verification.
 *
 * No API key required, but requests must be POST with a bounded date range
 * (max 1 year) unless targeting a single sampling point.
 */

const { fetchJsonWithRetry, runWithConcurrency, withTimeout } = require('./http-utils')

const BASE_URL = 'https://environment.data.gov.uk/water-quality/data/observation'
const REQUEST_CONCURRENCY = 4
const PER_LOCATION_TIMEOUT_MS = 15000
const CACHE_TTL_MS = 6 * 60 * 60 * 1000 // samples change slowly; cache generously
const PAGE_LIMIT = 250 // max allowed for JSON-LD
const SEARCH_RADII_KM = [20, 40]

// Sample material types relevant to ambient recreational water. Excludes
// groundwater, sewage/trade effluent, precipitation etc. — a plain radius
// search otherwise returns mostly sewage treatment works discharge
// monitoring, which would badly mislabel river/coastal readings.
const AMBIENT_MATERIAL_TYPES = new Set([
  '2AZZ', // River / running surface water
  '2GZZ', // Pond / lake / reservoir water
  '2HAZ', '2HBZ', '2HCZ', '2HZZ', // Estuarine water
  '2IAZ', '2IBZ', '2ICZ', '2IZZ' // Sea water
])

// Chemistry-table fields only — temperature is fetched with them but mapped
// onto location.waterTemperature rather than waterChemistry.
const CHEMISTRY_DETERMINANDS = {
  ph: { code: '0061', label: 'pH', unit: '' },
  ammonia: { code: '0111', label: 'Ammonia', unit: 'mg/L' },
  dissolvedOxygen: { code: '9924', label: 'Dissolved oxygen', unit: 'mg/L' }
}

const TEMPERATURE_DETERMINAND = { code: '0076', label: 'Water temperature', unit: '°C' }

const ALL_DETERMINANDS = {
  ...CHEMISTRY_DETERMINANDS,
  temperature: TEMPERATURE_DETERMINAND
}

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

function formatDate (date) {
  return date.toISOString().slice(0, 10)
}

function daysAgo (days) {
  return new Date(Date.now() - days * 24 * 60 * 60 * 1000)
}

async function queryObservations (determinandCode, lat, lng, radiusKm, dateFrom, dateTo) {
  const params = new URLSearchParams({
    limit: PAGE_LIMIT,
    determinand: determinandCode,
    latitude: lat,
    longitude: lng,
    radius: radiusKm,
    dateFrom: formatDate(dateFrom),
    dateTo: formatDate(dateTo)
  })

  const data = await fetchJsonWithRetry(`${BASE_URL}?${params.toString()}`, {
    method: 'POST',
    headers: {
      Accept: 'application/ld+json',
      'API-Version': '1',
      'Content-Type': 'application/json'
    },
    retries: 1,
    errorPrefix: 'Water Quality API'
  })

  return data.member || []
}

function parseNumericResult (value) {
  if (value == null) return null
  const cleaned = String(value).replace(/^[<>]/, '').trim()
  const num = Number(cleaned)
  return Number.isFinite(num) ? num : null
}

function pickLatestAmbientReading (observations) {
  const ambient = observations
    .filter(obs => AMBIENT_MATERIAL_TYPES.has(obs.hasSample?.sampleMaterialType?.notation))
    .map(obs => ({
      value: parseNumericResult(obs.hasSimpleResult),
      unit: obs.hasUnit,
      phenomenonTime: obs.phenomenonTime,
      stationName: obs.hasSamplingPoint?.prefLabel || null,
      sampleType: obs.hasSample?.sampleMaterialType?.prefLabel || null
    }))
    .filter(reading => reading.value != null && reading.phenomenonTime)
    .sort((a, b) => new Date(b.phenomenonTime) - new Date(a.phenomenonTime))

  return ambient[0] || null
}

/**
 * Find the most recent ambient-water reading for a determinand near a
 * coordinate. Tries a recent 90-day window first (cheap, and the common
 * case for well-monitored sites), then the full permitted 1-year window,
 * then the year before that — each escalating search radius as needed.
 * Bounded so a remote/rarely-sampled area gives up rather than searching
 * forever.
 */
async function findLatestReading (determinandCode, lat, lng) {
  const now = new Date()
  const attempts = [
    { from: daysAgo(90), to: now },
    { from: daysAgo(365), to: now },
    { from: daysAgo(730), to: daysAgo(365) }
  ]

  for (const { from, to } of attempts) {
    for (const radiusKm of SEARCH_RADII_KM) {
      let observations
      try {
        observations = await queryObservations(determinandCode, lat, lng, radiusKm, from, to)
      } catch (err) {
        console.error(`Water Quality API fetch failed for determinand ${determinandCode}:`, err.message)
        continue
      }
      const reading = pickLatestAmbientReading(observations)
      if (reading) return reading
    }
  }

  return null
}

function phStatus (value) {
  if (value == null) return 'unknown'
  if (value < 6.5 || value > 8.5) return 'caution'
  return 'good'
}

function ammoniaStatus (value) {
  if (value == null) return 'unknown'
  if (value > 2.5) return 'poor'
  if (value > 0.6) return 'elevated'
  return 'good'
}

function dissolvedOxygenStatus (value) {
  if (value == null) return 'unknown'
  if (value < 5) return 'poor'
  if (value < 8) return 'moderate'
  return 'good'
}

function temperatureStatus (value) {
  if (value == null) return 'unknown'
  // Rough recreational comfort bands for open-water swimming — not official
  // water-quality standards. Cold enough to be a risk, or unusually warm.
  if (value < 10 || value > 25) return 'caution'
  return 'normal'
}

const STATUS_FN = {
  ph: phStatus,
  ammonia: ammoniaStatus,
  dissolvedOxygen: dissolvedOxygenStatus,
  temperature: temperatureStatus
}

/**
 * Fetch pH, ammonia, dissolved oxygen and water temperature for a coordinate,
 * from the nearest recent ambient (river/lake/estuarine/coastal) sample of
 * each. Bounded by a timeout so a slow/sparse-data area can never hold up
 * the page.
 */
async function getWaterChemistry (lat, lng) {
  const rlat = roundCoord(lat)
  const rlng = roundCoord(lng)
  const cacheKey = `chem:${rlat}:${rlng}`
  const cached = getCached(cacheKey)
  if (cached !== undefined) return cached

  const pending = runWithConcurrency(Object.entries(ALL_DETERMINANDS), REQUEST_CONCURRENCY, async ([key, det]) => {
    const reading = await findLatestReading(det.code, rlat, rlng)
    if (!reading) return [key, null]
    return [key, {
      value: reading.value,
      unit: det.unit,
      status: STATUS_FN[key](reading.value),
      stationName: reading.stationName,
      sampledAt: reading.phenomenonTime,
      isLiveData: true
    }]
  }).then(entries => {
    const result = Object.fromEntries(entries)
    setCache(cacheKey, result)
    return result
  })

  return withTimeout(pending, PER_LOCATION_TIMEOUT_MS, {})
}

/**
 * Enrich locations with chemistry-table readings and water temperature.
 * Only intended for the location detail page — like river level/flow, this
 * is periodic lab data rather than something worth fetching for every
 * location in a bulk overview list.
 */
async function enrichLocationsWithWaterChemistry (locations) {
  if (!locations.length) return locations

  const results = await runWithConcurrency(locations, REQUEST_CONCURRENCY, async (location) => {
    try {
      return await getWaterChemistry(location.coordinates.lat, location.coordinates.lng)
    } catch (err) {
      console.error('Water Quality enrichment failed:', err.message)
      return {}
    }
  })

  return locations.map((location, index) => {
    const chemistry = results[index]
    if (!chemistry || !Object.keys(chemistry).length) return location

    const updatedChemistry = { ...location.waterChemistry }
    let anyLive = false
    for (const key of Object.keys(CHEMISTRY_DETERMINANDS)) {
      if (chemistry[key]) {
        updatedChemistry[key] = chemistry[key]
        anyLive = true
      }
    }

    let waterTemperature = location.waterTemperature
    if (chemistry.temperature) {
      waterTemperature = {
        value: chemistry.temperature.value,
        unit: chemistry.temperature.unit,
        trend: null,
        status: chemistry.temperature.status,
        stationName: chemistry.temperature.stationName,
        sampledAt: chemistry.temperature.sampledAt,
        isLiveData: true
      }
      anyLive = true
    }

    if (!anyLive) return location

    return {
      ...location,
      waterChemistry: updatedChemistry,
      waterTemperature,
      dataSources: [
        ...location.dataSources.filter(s => !s.name.includes('Water Quality Archive')),
        { name: 'EA Water Quality Archive', url: 'https://environment.data.gov.uk/water-quality/' }
      ]
    }
  })
}

module.exports = {
  getWaterChemistry,
  enrichLocationsWithWaterChemistry
}

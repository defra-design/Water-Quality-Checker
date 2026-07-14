/**
 * Water Intelligence Service – data access layer
 *
 * Nationwide: valid UK postcodes resolve to nearest designated bathing waters
 * via postcodes.io + Environment Agency Bathing Water API, plus nearby EA
 * recreation research locations and Canal & River Trust reservoirs.
 * Legacy mock locations remain available by ID for demonstration scenarios.
 */

const locations = require('../data/water-locations.json')
const questions = require('../data/questions.json')
const bathingWaterClient = require('./clients/bathing-water-client')
const postcodeClient = require('./clients/postcode-client')
const metOfficeClient = require('./clients/met-office-client')
const hydrologyClient = require('./clients/hydrology-client')
const stormOverflowClient = require('./clients/storm-overflow-client')
const waterQualityClient = require('./clients/water-quality-client')
const pollutionIncidentClient = require('./clients/pollution-incident-client')
const recreationLocationsClient = require('./clients/recreation-locations-client')
const crtAssetsClient = require('./clients/crt-assets-client')
const { mapBathingWaterToLocation } = require('./mappers/bathing-water-mapper')

const POSTCODE_REGEX = /^[A-Z]{1,2}[0-9][0-9A-Z]?\s?[0-9][A-Z]{2}$/i
const DEFAULT_NEARBY_COUNT = 20
const DISCOVERY_DEDUPE_KM = 0.25
const RECREATION_NEARBY_LIMIT = 12
const CRT_NEARBY_LIMIT = 8

const liveLocationCache = new Map()
const LIVE_CACHE_TTL_MS = 10 * 60 * 1000

const geocodeCache = new Map()

function normalisePostcode (postcode) {
  return postcode.trim().toUpperCase().replace(/\s+/g, ' ')
}

function isValidPostcode (postcode) {
  return POSTCODE_REGEX.test(normalisePostcode(postcode))
}

function getPostcodeOutcode (postcode) {
  const normalised = normalisePostcode(postcode)
  const match = normalised.match(/^([A-Z]{1,2}[0-9][0-9A-Z]?)/)
  return match ? match[1] : null
}

async function resolvePostcode (postcode) {
  const normalised = normalisePostcode(postcode)
  if (geocodeCache.has(normalised)) {
    return geocodeCache.get(normalised)
  }

  const geocoded = await postcodeClient.lookupPostcode(normalised)
  if (geocoded) {
    geocodeCache.set(normalised, geocoded)
  }
  return geocoded
}

async function getAreaForPostcode (postcode) {
  const normalised = normalisePostcode(postcode)
  const geocoded = await resolvePostcode(normalised)

  if (geocoded) {
    const areaLabel = [geocoded.area, geocoded.region].filter(Boolean).join(', ')
    return {
      outcode: geocoded.outcode || getPostcodeOutcode(normalised),
      area: areaLabel || geocoded.postcode,
      centre: { lat: geocoded.lat, lng: geocoded.lng },
      region: slugifyRegion(geocoded.region || geocoded.country),
      country: geocoded.country,
      isDefault: geocoded.isApproximate,
      isApproximate: geocoded.isApproximate,
      easting: geocoded.easting,
      northing: geocoded.northing
    }
  }

  return {
    outcode: getPostcodeOutcode(normalised),
    area: normalised,
    centre: { lat: 52.5, lng: -1.5 },
    region: 'unknown',
    isDefault: true,
    isApproximate: true
  }
}

function slugifyRegion (name) {
  if (!name) return 'england'
  return name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '')
}

function haversineKm (lat1, lng1, lat2, lng2) {
  const toRad = (deg) => deg * (Math.PI / 180)
  const dLat = toRad(lat2 - lat1)
  const dLng = toRad(lng2 - lng1)
  const a = Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2
  return 6371 * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))
}

function sortByDistance (items, centre) {
  return [...items].sort((a, b) => {
    const distA = haversineKm(centre.lat, centre.lng, a.coordinates.lat, a.coordinates.lng)
    const distB = haversineKm(centre.lat, centre.lng, b.coordinates.lat, b.coordinates.lng)
    return distA - distB
  })
}

function assignNearbyIds (locations, maxNearby = 3) {
  return locations.map((loc, index, all) => {
    const others = all
      .filter((other, i) => i !== index)
      .sort((a, b) => {
        const distA = haversineKm(loc.coordinates.lat, loc.coordinates.lng, a.coordinates.lat, a.coordinates.lng)
        const distB = haversineKm(loc.coordinates.lat, loc.coordinates.lng, b.coordinates.lat, b.coordinates.lng)
        return distA - distB
      })
      .slice(0, maxNearby)
      .map(other => other.id)
    return { ...loc, nearbyLocationIds: others }
  })
}

async function fetchBathingWatersNearPostcode (postcode, count = DEFAULT_NEARBY_COUNT) {
  const geocoded = await resolvePostcode(postcode)
  if (!geocoded) {
    throw new Error(`Could not resolve postcode ${postcode}`)
  }

  if (geocoded.easting == null || geocoded.northing == null) {
    throw new Error(`Postcode ${postcode} could not be resolved to a grid reference — try a full postcode`)
  }

  const eubwids = await bathingWaterClient.getNearestBathingWaterIds(
    geocoded.easting,
    geocoded.northing,
    count
  )

  if (!eubwids.length) {
    return []
  }

  const records = await bathingWaterClient.getBathingWaters(eubwids)
  return records.map(mapBathingWaterToLocation)
}

function isNearAny (candidate, existing, maxKm) {
  return existing.some(other =>
    haversineKm(
      candidate.coordinates.lat,
      candidate.coordinates.lng,
      other.coordinates.lat,
      other.coordinates.lng
    ) <= maxKm
  )
}

/**
 * Drop discovery pins that sit on top of a designated bathing water so the
 * official site remains the single card for that place.
 */
function dedupeDiscoveryAgainstBathingWaters (discoveryLocations, bathingLocations) {
  return discoveryLocations.filter(loc => !isNearAny(loc, bathingLocations, DISCOVERY_DEDUPE_KM))
}

async function fetchDiscoveryLocationsNear (centre, bathingLocations) {
  const [recreation, reservoirs] = await Promise.all([
    recreationLocationsClient.getRecreationLocationsNear(centre.lat, centre.lng, {
      limit: RECREATION_NEARBY_LIMIT
    }),
    crtAssetsClient.getReservoirsNear(centre.lat, centre.lng, {
      limit: CRT_NEARBY_LIMIT
    })
  ])

  const combined = [...recreation, ...reservoirs]
  const deduped = dedupeDiscoveryAgainstBathingWaters(combined, bathingLocations)
  const sorted = sortByDistance(deduped, centre)

  // Cap each discovery source after dedupe so bathing waters stay visible in lists/maps
  const recreationKept = sorted
    .filter(l => l.siteKind === 'recreation_research')
    .slice(0, RECREATION_NEARBY_LIMIT)
  const reservoirsKept = sorted
    .filter(l => l.siteKind === 'crt_reservoir')
    .slice(0, CRT_NEARBY_LIMIT)

  return sortByDistance([...recreationKept, ...reservoirsKept], centre)
}

async function enrichLocationBundle (locationList) {
  let enriched = await metOfficeClient.enrichLocationsWithRainfall(locationList)
  enriched = await stormOverflowClient.enrichLocationsWithStormOverflows(enriched)
  enriched = await pollutionIncidentClient.enrichLocationsWithPollutionIncidents(enriched)
  return enriched
}

async function enrichLocationDetail (location) {
  let enriched = await enrichLocationBundle([location])
  enriched = await hydrologyClient.enrichLocationsWithRiverConditions(enriched)
  enriched = await waterQualityClient.enrichLocationsWithWaterChemistry(enriched)
  return enriched[0]
}

function getLiveCache (postcode) {
  const entry = liveLocationCache.get(postcode)
  if (!entry) return null
  if (Date.now() - entry.time > LIVE_CACHE_TTL_MS) {
    liveLocationCache.delete(postcode)
    return null
  }
  return entry.data
}

function setLiveCache (postcode, data) {
  liveLocationCache.set(postcode, { time: Date.now(), data })
}

async function getLocationsByPostcode (postcode) {
  const normalised = normalisePostcode(postcode)

  if (!isValidPostcode(normalised)) {
    return []
  }

  const cached = getLiveCache(normalised)
  if (cached) return cached

  const area = await getAreaForPostcode(normalised)

  let bathingLocations = []
  try {
    bathingLocations = await fetchBathingWatersNearPostcode(normalised)
  } catch (err) {
    console.error(`Bathing water lookup failed for ${normalised}:`, err.message)
    bathingLocations = []
  }

  let discoveryLocations = []
  try {
    discoveryLocations = await fetchDiscoveryLocationsNear(area.centre, bathingLocations)
  } catch (err) {
    console.error(`Discovery location lookup failed for ${normalised}:`, err.message)
    discoveryLocations = []
  }

  if (!bathingLocations.length && !discoveryLocations.length) {
    return []
  }

  let combined = sortByDistance([...bathingLocations, ...discoveryLocations], area.centre)
  combined = assignNearbyIds(combined)
  // River level/flow and water chemistry are only shown on the single location
  // detail page, so they're fetched lazily in getLocationById rather than for
  // every nearby location here.
  combined = await enrichLocationBundle(combined)
  combined = combined.map(loc => ({
    ...loc,
    postcode: normalised
  }))

  setLiveCache(normalised, combined)
  return combined
}

async function getLocationById (id) {
  if (id.startsWith('bathing-water-')) {
    const eubwid = id.replace('bathing-water-', '')
    const record = await bathingWaterClient.getBathingWater(eubwid)
    return enrichLocationDetail(mapBathingWaterToLocation(record))
  }

  if (id.startsWith('recreation-')) {
    const locationId = id.replace(/^recreation-/, '')
    const location = await recreationLocationsClient.getRecreationLocationById(locationId)
    if (!location) return null
    return enrichLocationDetail(location)
  }

  if (id.startsWith('crt-reservoir-')) {
    const location = await crtAssetsClient.getReservoirById(id)
    if (!location) return null
    return enrichLocationDetail(location)
  }

  return locations.find(loc => loc.id === id) || null
}

function getLocationsByIds (ids) {
  return ids.map(id => locations.find(loc => loc.id === id)).filter(Boolean)
}

async function getOverviewForPostcode (postcode) {
  const area = await getAreaForPostcode(postcode)
  const nearbyLocations = await getLocationsByPostcode(postcode)
  const designatedBathingWaters = nearbyLocations.filter(l => l.isDesignatedBathingWater !== false && l.waterbodyType === 'bathing water')
  const recreationSites = nearbyLocations.filter(l => l.siteKind === 'recreation_research')
  const crtReservoirs = nearbyLocations.filter(l => l.siteKind === 'crt_reservoir')

  const statusCounts = { good: 0, caution: 0, poor: 0, unknown: 0 }
  // Overview confidence is driven by designated bathing waters only —
  // discovery sites always have limited evidence and must not dilute that signal.
  designatedBathingWaters.forEach(loc => {
    if (statusCounts[loc.overallStatus] !== undefined) {
      statusCounts[loc.overallStatus]++
    }
  })

  let overallConfidence = 'good'
  if (designatedBathingWaters.length === 0 && nearbyLocations.length > 0) {
    overallConfidence = 'caution'
  } else if (statusCounts.poor > 0) {
    overallConfidence = 'poor'
  } else if (statusCounts.caution > 0) {
    overallConfidence = 'caution'
  }

  const rivers = nearbyLocations.filter(l => l.waterbodyType === 'river' && l.siteKind !== 'recreation_research')
  const lakes = nearbyLocations.filter(l => l.waterbodyType === 'lake' && l.siteKind !== 'recreation_research')
  const reservoirs = nearbyLocations.filter(l => l.waterbodyType === 'reservoir' || l.siteKind === 'crt_reservoir')
  const bathingWaters = nearbyLocations.filter(l => l.waterbodyType === 'bathing water')
  // already defined above: recreationSites, crtReservoirs

  const sewageDischarges = nearbyLocations.filter(l => l.recentSewageDischarge?.occurred)
  const algaeAlerts = nearbyLocations.filter(l => l.algaeWarning?.active)
  const pollutionIncidents = nearbyLocations.filter(l => l.pollutionIncidents?.length > 0)
  const openPollutionIncidents = nearbyLocations.filter(l =>
    l.pollutionIncidents?.some(incident => incident.status === 'open')
  )
  const healthWarnings = nearbyLocations.filter(l => l.healthWarning?.active)

  const rainfallReadings = nearbyLocations
    .map(l => l.recentRainfall?.last24h)
    .filter(v => v != null)
  const avgRainfall = rainfallReadings.length
    ? rainfallReadings.reduce((sum, v) => sum + v, 0) / rainfallReadings.length
    : null

  const isLiveData = nearbyLocations.some(l => l.isLiveData)
  const isSewageLiveData = nearbyLocations.some(l => l.recentSewageDischarge?.isLiveData)
  const isPollutionLiveData = nearbyLocations.some(l => l.isPollutionLiveData)

  return {
    postcode: normalisePostcode(postcode),
    area: area.area,
    centre: area.centre,
    region: area.region,
    country: area.country,
    isDefaultArea: area.isDefault || false,
    isApproximateArea: area.isApproximate || false,
    isLiveData,
    isSewageLiveData,
    isPollutionLiveData,
    isMetOfficeConnected: metOfficeClient.isConfigured(),
    overallConfidence,
    statusCounts,
    nearbyLocations,
    rivers,
    lakes,
    reservoirs,
    bathingWaters,
    recreationSites,
    crtReservoirs,
    sewageDischarges,
    algaeAlerts,
    pollutionIncidents,
    openPollutionIncidents,
    healthWarnings,
    avgRainfall,
    summary: buildOverviewSummary({
      confidence: overallConfidence,
      sewage: sewageDischarges,
      algae: algaeAlerts,
      pollution: pollutionIncidents,
      rainfall: avgRainfall,
      isLiveData,
      locationCount: nearbyLocations.length,
      bathingCount: designatedBathingWaters.length,
      recreationCount: recreationSites.length,
      crtCount: crtReservoirs.length
    })
  }
}

function buildOverviewSummary ({
  confidence,
  sewage,
  algae,
  pollution,
  rainfall,
  isLiveData,
  locationCount,
  bathingCount,
  recreationCount,
  crtCount
}) {
  const parts = []

  if (isLiveData) {
    const bits = []
    if (bathingCount > 0) bits.push(`${bathingCount} designated bathing water${bathingCount === 1 ? '' : 's'}`)
    if (recreationCount > 0) bits.push(`${recreationCount} reported recreation site${recreationCount === 1 ? '' : 's'}`)
    if (crtCount > 0) bits.push(`${crtCount} Canal & River Trust reservoir${crtCount === 1 ? '' : 's'}`)
    if (bits.length) {
      parts.push(`Showing nearby places: ${bits.join(', ')}.`)
    } else {
      parts.push(`Showing ${locationCount} nearby water place${locationCount === 1 ? '' : 's'}.`)
    }
    if (rainfall != null) {
      parts.push('Rainfall totals are from the Met Office where available.')
    }
  } else if (locationCount === 0) {
    parts.push('No water locations were found near this postcode.')
  }

  if (locationCount === 0) {
    return parts.join(' ') || 'No water locations found for this postcode.'
  }

  if (bathingCount > 0) {
    if (confidence === 'good') {
      parts.push('Conditions across nearby designated bathing waters are generally good for recreational water use.')
    } else if (confidence === 'caution') {
      parts.push('Some nearby designated bathing waters need extra caution.')
    } else {
      parts.push('Several nearby designated bathing waters have poor conditions. Check individual locations before visiting.')
    }
  } else {
    parts.push('No designated bathing waters are in this list — nearby places have limited official swimming monitoring.')
  }

  if (recreationCount > 0 || crtCount > 0) {
    parts.push('Extra recreation and reservoir places are shown for discovery; they are not the same as Swimfo designated bathing waters.')
  }

  if (sewage.length > 0) {
    parts.push(`${sewage.length} location${sewage.length > 1 ? 's have' : ' has'} recent sewage discharge reports.`)
  }

  if (algae.length > 0) {
    parts.push(`Algae warnings are active at ${algae.length} location${algae.length > 1 ? 's' : ''}.`)
  }

  if (pollution.length > 0) {
    parts.push(`Pollution incidents have been reported at ${pollution.length} location${pollution.length > 1 ? 's' : ''}.`)
  }

  if (rainfall != null && rainfall > 10) {
    parts.push('Heavy rainfall in the last 24 hours may temporarily affect water quality.')
  }

  return parts.join(' ')
}

function getAllLocations () {
  return locations
}

function getAllQuestions () {
  return questions
}

function getQuestionById (id) {
  return questions.find(q => q.id === id) || null
}

function searchQuestions (query) {
  if (!query) return questions
  const lower = query.toLowerCase()
  return questions.filter(q =>
    q.question.toLowerCase().includes(lower) ||
    q.keywords.some(k => lower.includes(k) || k.includes(lower))
  )
}

function formatDate (isoString) {
  if (!isoString) return 'Unknown'
  const date = new Date(isoString)
  return date.toLocaleString('en-GB', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit'
  })
}

function formatRelativeTime (isoString) {
  if (!isoString) return 'Unknown'
  const date = new Date(isoString)
  const now = new Date()
  const hours = Math.round((now - date) / (1000 * 60 * 60))
  if (hours < 1) return 'Less than an hour ago'
  if (hours < 24) return `${hours} hour${hours > 1 ? 's' : ''} ago`
  const days = Math.round(hours / 24)
  return `${days} day${days > 1 ? 's' : ''} ago`
}

function getStatusLabel (status) {
  const labels = {
    good: 'Good',
    caution: 'Caution advised',
    poor: 'Poor – avoid contact',
    'acceptable with care': 'Acceptable with care',
    acceptable: 'Acceptable',
    'not recommended': 'Not recommended',
    'use caution': 'Use caution',
    'not permitted': 'Not permitted',
    'permit required': 'Permit required',
    restricted: 'Restricted',
    unknown: 'Limited evidence'
  }
  return labels[status] || status
}

function getWaterbodyTypeLabel (type) {
  const labels = {
    river: 'River',
    lake: 'Lake',
    reservoir: 'Reservoir',
    coastal: 'Coastal / estuarine',
    canal: 'Canal',
    water: 'Waterbody',
    'bathing water': 'Designated bathing water',
    'recreation site': 'Reported recreation site'
  }
  return labels[type] || type
}

function getSiteKindLabel (siteKind) {
  const labels = {
    recreation_research: 'Reported recreation area',
    crt_reservoir: 'CRT reservoir',
    designated_bathing_water: 'Designated bathing water'
  }
  return labels[siteKind] || null
}

module.exports = {
  isValidPostcode,
  normalisePostcode,
  getAreaForPostcode,
  getAllLocations,
  getLocationById,
  getLocationsByIds,
  getLocationsByPostcode,
  getOverviewForPostcode,
  getAllQuestions,
  getQuestionById,
  searchQuestions,
  formatDate,
  formatRelativeTime,
  getStatusLabel,
  getWaterbodyTypeLabel,
  getSiteKindLabel
}

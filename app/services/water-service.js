/**
 * Water Intelligence Service – data access layer
 *
 * Yorkshire bathing waters: live Environment Agency Bathing Water API
 * Berkshire area: mock JSON (pending further API integration)
 */

const locations = require('../data/water-locations.json')
const postcodeAreas = require('../data/postcode-areas.json')
const questions = require('../data/questions.json')
const yorkshireBathingWaters = require('../data/yorkshire-bathing-waters.json')
const bathingWaterClient = require('./clients/bathing-water-client')
const metOfficeClient = require('./clients/met-office-client')
const { mapBathingWaterToLocation } = require('./mappers/bathing-water-mapper')

const POSTCODE_REGEX = /^[A-Z]{1,2}[0-9][0-9A-Z]?\s?[0-9][A-Z]{2}$/i
const YORKSHIRE_PREFIXES = ['YO', 'HU', 'LS', 'WF', 'BD', 'HX', 'HD', 'DN', 'HG', 'S']

// In-memory cache of live locations by postcode (short TTL for prototype)
const liveLocationCache = new Map()
const LIVE_CACHE_TTL_MS = 10 * 60 * 1000

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

function isYorkshirePostcode (postcode) {
  const outcode = getPostcodeOutcode(postcode)
  if (!outcode) return false
  return YORKSHIRE_PREFIXES.some(prefix => outcode.startsWith(prefix))
}

function getAreaForPostcode (postcode) {
  const outcode = getPostcodeOutcode(postcode)
  if (!outcode) return null

  if (postcodeAreas[outcode]) {
    return { outcode, ...postcodeAreas[outcode] }
  }

  const partial = Object.keys(postcodeAreas).find(key => outcode.startsWith(key))
  if (partial) {
    return { outcode: partial, ...postcodeAreas[partial] }
  }

  if (isYorkshirePostcode(postcode)) {
    return {
      outcode: 'YO11',
      area: 'North Yorkshire coast',
      centre: { lat: 54.282, lng: -0.395 },
      region: 'yorkshire',
      isDefault: true
    }
  }

  return { outcode: 'RG1', ...postcodeAreas.RG1, isDefault: true }
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

async function fetchYorkshireBathingWaters () {
  const eubwids = yorkshireBathingWaters.map(bw => bw.eubwid)
  const records = await bathingWaterClient.getBathingWaters(eubwids)
  return records.map(mapBathingWaterToLocation)
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
  const area = getAreaForPostcode(normalised)

  if (area.region === 'yorkshire' || isYorkshirePostcode(normalised)) {
    const cached = getLiveCache(normalised)
    if (cached) return cached

    let bathingLocations = await fetchYorkshireBathingWaters()
    bathingLocations = sortByDistance(bathingLocations, area.centre)
    bathingLocations = assignNearbyIds(bathingLocations)
    bathingLocations = await metOfficeClient.enrichLocationsWithRainfall(bathingLocations)
    bathingLocations = bathingLocations.map(loc => ({
      ...loc,
      postcode: normalised
    }))

    setLiveCache(normalised, bathingLocations)
    return bathingLocations
  }

  if (area.locationIds) {
    return getLocationsByIds(area.locationIds)
  }

  return []
}

async function getLocationById (id) {
  if (id.startsWith('bathing-water-')) {
    const eubwid = id.replace('bathing-water-', '')
    const record = await bathingWaterClient.getBathingWater(eubwid)
    let location = mapBathingWaterToLocation(record)
    const enriched = await metOfficeClient.enrichLocationsWithRainfall([location])
    return enriched[0]
  }
  return locations.find(loc => loc.id === id) || null
}

function getLocationsByIds (ids) {
  return ids.map(id => locations.find(loc => loc.id === id)).filter(Boolean)
}

async function getOverviewForPostcode (postcode) {
  const area = getAreaForPostcode(postcode)
  const nearbyLocations = await getLocationsByPostcode(postcode)

  const statusCounts = { good: 0, caution: 0, poor: 0 }
  nearbyLocations.forEach(loc => {
    if (statusCounts[loc.overallStatus] !== undefined) {
      statusCounts[loc.overallStatus]++
    }
  })

  let overallConfidence = 'good'
  if (statusCounts.poor > 0) overallConfidence = 'poor'
  else if (statusCounts.caution > 0) overallConfidence = 'caution'

  const rivers = nearbyLocations.filter(l => l.waterbodyType === 'river')
  const lakes = nearbyLocations.filter(l => l.waterbodyType === 'lake')
  const reservoirs = nearbyLocations.filter(l => l.waterbodyType === 'reservoir')
  const bathingWaters = nearbyLocations.filter(l => l.waterbodyType === 'bathing water')

  const sewageDischarges = nearbyLocations.filter(l => l.recentSewageDischarge?.occurred)
  const algaeAlerts = nearbyLocations.filter(l => l.algaeWarning?.active)
  const pollutionIncidents = nearbyLocations.filter(l => l.pollutionIncidents?.length > 0)
  const healthWarnings = nearbyLocations.filter(l => l.healthWarning?.active)

  const rainfallReadings = nearbyLocations
    .map(l => l.recentRainfall?.last24h)
    .filter(v => v != null)
  const avgRainfall = rainfallReadings.length
    ? rainfallReadings.reduce((sum, v) => sum + v, 0) / rainfallReadings.length
    : null

  const isLiveData = nearbyLocations.some(l => l.isLiveData)

  return {
    postcode: normalisePostcode(postcode),
    area: area.area,
    centre: area.centre,
    region: area.region || (isYorkshirePostcode(postcode) ? 'yorkshire' : 'berkshire'),
    isDefaultArea: area.isDefault || false,
    isLiveData,
    isMetOfficeConnected: metOfficeClient.isConfigured(),
    overallConfidence,
    statusCounts,
    nearbyLocations,
    rivers,
    lakes,
    reservoirs,
    bathingWaters,
    sewageDischarges,
    algaeAlerts,
    pollutionIncidents,
    healthWarnings,
    avgRainfall,
    summary: buildOverviewSummary(overallConfidence, sewageDischarges, algaeAlerts, pollutionIncidents, avgRainfall, isLiveData)
  }
}

function buildOverviewSummary (confidence, sewage, algae, pollution, rainfall, isLiveData) {
  const parts = []

  if (isLiveData) {
    parts.push('Bathing water data is live from the Environment Agency.')
    if (rainfall != null) {
      parts.push('Rainfall totals are from the Met Office.')
    }
  }

  if (confidence === 'good') {
    parts.push('Conditions across your area are generally good for recreational water use.')
  } else if (confidence === 'caution') {
    parts.push('Some locations near you need extra caution today.')
  } else {
    parts.push('Several locations near you have poor conditions. Check individual locations before visiting.')
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
    unknown: 'Unknown'
  }
  return labels[status] || status
}

function getWaterbodyTypeLabel (type) {
  const labels = {
    river: 'River',
    lake: 'Lake',
    reservoir: 'Reservoir',
    'bathing water': 'Designated bathing water'
  }
  return labels[type] || type
}

module.exports = {
  isValidPostcode,
  normalisePostcode,
  getAreaForPostcode,
  isYorkshirePostcode,
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
  getWaterbodyTypeLabel
}

/**
 * Water Intelligence Service – data access layer
 *
 * This module separates data from presentation. In production, these functions
 * would call live APIs from the Environment Agency, Met Office, water companies,
 * Natural England, local authorities and citizen science platforms.
 */

const locations = require('../data/water-locations.json')
const postcodeAreas = require('../data/postcode-areas.json')
const questions = require('../data/questions.json')

// UK postcode validation (simplified for prototype)
const POSTCODE_REGEX = /^[A-Z]{1,2}[0-9][0-9A-Z]?\s?[0-9][A-Z]{2}$/i

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

function getAreaForPostcode (postcode) {
  const outcode = getPostcodeOutcode(postcode)
  if (!outcode) return null

  // Try exact outcode match, then partial (e.g. RG1 from RG1 1AA)
  if (postcodeAreas[outcode]) {
    return { outcode, ...postcodeAreas[outcode] }
  }

  const prefix = outcode.replace(/[0-9]+$/, '')
  const partial = Object.keys(postcodeAreas).find(key => outcode.startsWith(key))
  if (partial) {
    return { outcode: partial, ...postcodeAreas[partial] }
  }

  // Default to Reading area for unknown postcodes in prototype
  return { outcode: 'RG1', ...postcodeAreas.RG1, isDefault: true }
}

function getAllLocations () {
  return locations
}

function getLocationById (id) {
  return locations.find(loc => loc.id === id) || null
}

function getLocationsByIds (ids) {
  return ids.map(id => getLocationById(id)).filter(Boolean)
}

function getLocationsByPostcode (postcode) {
  const area = getAreaForPostcode(postcode)
  if (!area) return []
  return getLocationsByIds(area.locationIds)
}

function getOverviewForPostcode (postcode) {
  const area = getAreaForPostcode(postcode)
  const nearbyLocations = getLocationsByPostcode(postcode)

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

  const sewageDischarges = nearbyLocations.filter(l => l.recentSewageDischarge.occurred)
  const algaeAlerts = nearbyLocations.filter(l => l.algaeWarning.active)
  const pollutionIncidents = nearbyLocations.filter(l => l.pollutionIncidents.length > 0)
  const healthWarnings = nearbyLocations.filter(l => l.healthWarning.active)

  const avgRainfall = nearbyLocations.reduce((sum, l) => sum + l.recentRainfall.last24h, 0) / nearbyLocations.length

  return {
    postcode: normalisePostcode(postcode),
    area: area.area,
    centre: area.centre,
    isDefaultArea: area.isDefault || false,
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
    summary: buildOverviewSummary(overallConfidence, sewageDischarges, algaeAlerts, pollutionIncidents, avgRainfall)
  }
}

function buildOverviewSummary (confidence, sewage, algae, pollution, rainfall) {
  const parts = []

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

  if (rainfall > 10) {
    parts.push('Heavy rainfall in the last 24 hours may temporarily affect water quality.')
  }

  return parts.join(' ')
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
    caution: 'Use caution',
    'not permitted': 'Not permitted',
    'permit required': 'Permit required',
    restricted: 'Restricted'
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

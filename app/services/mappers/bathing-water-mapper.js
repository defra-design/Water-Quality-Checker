/**
 * Maps Environment Agency Bathing Water API responses to prototype location model.
 */

const { extractText, toHttps, BASE_URL } = require('../clients/bathing-water-client')

const CLASSIFICATION_STATUS = {
  Excellent: 'good',
  Good: 'good',
  Sufficient: 'caution',
  Poor: 'poor'
}

function bacteriaStatus (count, type) {
  if (count == null) return 'unknown'
  if (type === 'eColi') {
    if (count <= 250) return 'good'
    if (count <= 500) return 'elevated'
    return 'poor'
  }
  if (count <= 100) return 'good'
  if (count <= 200) return 'elevated'
  return 'poor'
}

function slugify (eubwid) {
  return `bathing-water-${eubwid.toLowerCase()}`
}

function getCoordinates (bathingWater, sample) {
  const point = sample?.bwq_samplingPoint
  if (point?.lat != null && point?.long != null) {
    return { lat: point.lat, lng: point.long }
  }
  return null
}

function getDistrict (bathingWater) {
  const district = bathingWater.district
  if (!district) return 'Yorkshire'
  if (Array.isArray(district)) {
    return extractText(district[0]?.name) || extractText(district[0]) || 'Yorkshire'
  }
  return extractText(district?.name) || extractText(district) || 'Yorkshire'
}

function getClassification (bathingWater) {
  return extractText(
    bathingWater.latestComplianceAssessment?.complianceClassification?.name
  )
}

function getRiskLevel (bathingWater) {
  return extractText(bathingWater.latestRiskPrediction?.riskLevel?.name)
}

function deriveOverallStatus (classification, riskLevel) {
  const base = CLASSIFICATION_STATUS[classification] || 'caution'
  if (riskLevel && riskLevel !== 'normal' && base === 'good') {
    return 'caution'
  }
  if (riskLevel && riskLevel !== 'normal' && base === 'caution') {
    return 'caution'
  }
  return base
}

function buildConfidenceSummary (name, classification, riskLevel, sampleDate, eColi, enterococci) {
  const parts = []
  if (classification) {
    parts.push(`${name} has a ${classification} annual classification (2025 season).`)
  }
  if (riskLevel && riskLevel !== 'normal') {
    parts.push(`Short-term pollution risk is currently ${riskLevel}.`)
  } else if (riskLevel === 'normal') {
    parts.push('No elevated short-term pollution risk is currently forecast.')
  }
  if (sampleDate && eColi != null) {
    parts.push(`Latest sample (${sampleDate}): E. coli ${eColi} cfu/100ml, intestinal enterococci ${enterococci ?? 'n/a'} cfu/100ml.`)
  }
  return parts.join(' ')
}

function buildRecommendedActivities (status) {
  if (status === 'good') {
    return {
      swimming: 'acceptable with care',
      paddling: 'acceptable',
      fishing: 'acceptable',
      dogWalking: 'acceptable with care'
    }
  }
  if (status === 'poor') {
    return {
      swimming: 'not recommended',
      paddling: 'caution',
      fishing: 'acceptable',
      dogWalking: 'caution'
    }
  }
  return {
    swimming: 'caution',
    paddling: 'caution',
    fishing: 'acceptable',
    dogWalking: 'caution'
  }
}

function mapBathingWaterToLocation ({ bathingWater, sample }) {
  const eubwid = bathingWater.eubwidNotation || bathingWater.sameAs?.split('/').pop() || 'unknown'
  const name = extractText(bathingWater.name) || eubwid
  const classification = getClassification(bathingWater)
  const riskLevel = getRiskLevel(bathingWater)
  const overallStatus = deriveOverallStatus(classification, riskLevel)
  const coordinates = getCoordinates(bathingWater, sample)
  const district = getDistrict(bathingWater)
  const eColi = sample?.escherichiaColiCount ?? null
  const enterococci = sample?.intestinalEnterococciCount ?? null
  const sampleDateTime = sample?.sampleDateTime?.inXSDDateTime?._value || null
  const profileUri = bathingWater.latestProfile
  const swimfoUrl = profileUri
    ? toHttps(profileUri).replace('http://', 'https://')
    : `https://environment.data.gov.uk/bwq/profiles/`

  const latestIssues = []
  if (classification === 'Poor') {
    latestIssues.push('Annual bathing water classification is Poor')
  }
  if (riskLevel && riskLevel !== 'normal') {
    latestIssues.push(`Short-term pollution risk: ${riskLevel}`)
  }

  const healthWarningActive = riskLevel != null && riskLevel !== 'normal'

  return {
    id: slugify(eubwid),
    eubwid,
    name,
    location: district,
    postcode: null,
    waterbodyType: 'bathing water',
    coordinates: coordinates || { lat: 54.28, lng: -0.4 },
    overallStatus,
    confidenceLevel: sample ? 'high' : 'moderate',
    confidenceSummary: buildConfidenceSummary(name, classification, riskLevel, sampleDateTime, eColi, enterococci),
    recentSewageDischarge: {
      occurred: false,
      when: null,
      description: 'Sewage overflow data not yet connected for this location',
      duration: null,
      source: 'Pending EDM API integration'
    },
    recentRainfall: {
      last24h: null,
      last48h: null,
      last72h: null,
      unit: 'mm',
      summary: 'Rainfall data not yet connected'
    },
    riverLevel: null,
    flow: null,
    waterTemperature: {
      value: null,
      unit: '°C',
      trend: null
    },
    pollutionIncidents: [],
    algaeWarning: {
      active: false,
      type: null,
      description: 'No algae alerts from this data source'
    },
    healthWarning: {
      active: healthWarningActive,
      type: healthWarningActive ? 'pollution risk forecast' : null,
      description: healthWarningActive
        ? `Short-term pollution risk is ${riskLevel}. Check Swimfo before swimming.`
        : 'No health warnings from current bathing water data'
    },
    bathingWaterWarning: {
      active: true,
      classification: classification || 'Unknown',
      seasonClassification: classification ? `${classification} (2025 season)` : 'Unknown',
      advisory: riskLevel && riskLevel !== 'normal'
        ? `Short-term pollution risk is ${riskLevel}.`
        : 'Check latest sample results and official Swimfo profile before swimming.',
      swimfoUrl
    },
    recommendedActivities: buildRecommendedActivities(overallStatus),
    waterChemistry: {
      eColi: { value: eColi, unit: 'cfu/100ml', status: bacteriaStatus(eColi, 'eColi') },
      intestinalEnterococci: { value: enterococci, unit: 'cfu/100ml', status: bacteriaStatus(enterococci, 'enterococci') },
      dissolvedOxygen: { value: null, unit: 'mg/L', status: 'unknown' },
      ph: { value: null, unit: '', status: 'unknown' },
      turbidity: { value: null, unit: 'NTU', status: 'unknown' },
      nitrate: { value: null, unit: 'mg/L', status: 'unknown' },
      phosphate: { value: null, unit: 'mg/L', status: 'unknown' },
      ammonia: { value: null, unit: 'mg/L', status: 'unknown' },
      conductivity: { value: null, unit: 'µS/cm', status: 'unknown' },
      chlorophyll: { value: null, unit: 'µg/L', status: 'unknown' }
    },
    latestIssues,
    recreationAdvice: overallStatus === 'poor'
      ? 'Annual classification is Poor. Avoid swimming.'
      : overallStatus === 'caution'
        ? 'Check the latest sample results and pollution risk forecast before swimming.'
        : 'Conditions are generally favourable based on official bathing water data. Always check on the day.',
    healthAdvice: 'Follow official bathing water advice. Shower after swimming and avoid swallowing water.',
    dataSources: [
      { name: 'Environment Agency Bathing Water API', url: 'https://environment.data.gov.uk/bwq/' },
      { name: 'Swimfo bathing water profiles', url: swimfoUrl }
    ],
    lastUpdated: sampleDateTime || new Date().toISOString(),
    futureApiSource: 'EA Bathing Water API (live), Met Office Weather DataHub, Flood Monitoring (pending)',
    nearbyLocationIds: [],
    isLiveData: true,
    dataSource: 'ea-bathing-water-api'
  }
}

module.exports = {
  mapBathingWaterToLocation,
  slugify
}

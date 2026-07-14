/**
 * Shared location model for non-designated discovery sites
 * (EA recreation research locations, CRT asset registers).
 */

function emptyChemistry () {
  return {
    eColi: { value: null, unit: 'cfu/100ml', status: 'unknown' },
    intestinalEnterococci: { value: null, unit: 'cfu/100ml', status: 'unknown' },
    dissolvedOxygen: { value: null, unit: 'mg/L', status: 'unknown' },
    ph: { value: null, unit: '', status: 'unknown' },
    turbidity: { value: null, unit: 'NTU', status: 'unknown' },
    nitrate: { value: null, unit: 'mg/L', status: 'unknown' },
    phosphate: { value: null, unit: 'mg/L', status: 'unknown' },
    ammonia: { value: null, unit: 'mg/L', status: 'unknown' },
    conductivity: { value: null, unit: 'µS/cm', status: 'unknown' },
    chlorophyll: { value: null, unit: 'µg/L', status: 'unknown' }
  }
}

function baseDiscoveryLocation (overrides) {
  return {
    eubwid: null,
    postcode: null,
    overallStatus: 'unknown',
    confidenceLevel: 'low',
    siteKind: 'discovery',
    limitedEvidence: true,
    isDesignatedBathingWater: false,
    recentSewageDischarge: {
      occurred: false,
      when: null,
      description: 'No nearby monitored overflow matched yet',
      duration: null,
      source: null
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
      active: false,
      type: null,
      description: 'This place is not an Environment Agency designated bathing water, so there is no official short-term pollution risk forecast here.'
    },
    bathingWaterWarning: {
      active: false,
      classification: null,
      seasonClassification: null,
      advisory: 'Not a designated bathing water. Treat water-quality indicators as limited and check local advice before entering the water.',
      swimfoUrl: null
    },
    recommendedActivities: {
      swimming: 'use caution',
      paddling: 'use caution',
      fishing: 'acceptable',
      dogWalking: 'use caution'
    },
    waterChemistry: emptyChemistry(),
    latestIssues: [],
    recreationAdvice: 'Limited official monitoring at this place. Nearby rainfall, river conditions and storm overflows may still help you judge risk.',
    healthAdvice: 'This is not a designated bathing water. Do not assume it is monitored like Swimfo sites.',
    nearbyLocationIds: [],
    isLiveData: true,
    ...overrides
  }
}

function mapWaterbodyType (raw) {
  if (!raw) return 'water'
  const lower = String(raw).toLowerCase()
  if (lower.includes('lake')) return 'lake'
  if (lower.includes('reservoir')) return 'reservoir'
  if (lower.includes('river')) return 'river'
  if (lower.includes('coast') || lower.includes('estuar')) return 'coastal'
  if (lower.includes('canal')) return 'canal'
  return 'water'
}

function shortActivityList (listText, max = 3) {
  if (!listText) return []
  return String(listText)
    .split(';')
    .map(s => s.trim())
    .filter(Boolean)
    .slice(0, max)
}

module.exports = {
  baseDiscoveryLocation,
  mapWaterbodyType,
  shortActivityList
}

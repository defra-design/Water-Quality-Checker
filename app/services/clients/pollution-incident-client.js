/**
 * Environment Agency Bathing Water pollution-incident client
 * https://environment.data.gov.uk/bwq/doc/api-reference-v0.6.html
 *
 * Near-real-time open and recently closed pollution incidents at designated
 * bathing waters (sewage, oil, chemicals, harmful algae, etc.). This is a
 * different dataset from the quarterly NIRS Category 1/2 national dump —
 * it's the live feed Swimfo uses for bathing-water advice.
 *
 * No API key required.
 */

const { fetchJsonWithRetry, runWithConcurrency, withTimeout } = require('./http-utils')

const BASE_URL = 'https://environment.data.gov.uk/doc/bathing-water-quality/pollution-incident'
const REQUEST_CONCURRENCY = 4
const PER_BATCH_TIMEOUT_MS = 8000
const CACHE_TTL_MS = 15 * 60 * 1000
const RECENT_CLOSED_WINDOW_MS = 90 * 24 * 60 * 60 * 1000
const MAX_INCIDENTS_PER_SITE = 5

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

function extractText (value) {
  if (!value) return null
  if (typeof value === 'string') return value
  if (value._value) return value._value
  if (Array.isArray(value)) return extractText(value[0])
  if (value.name) return extractText(value.name)
  return null
}

function extractDateTime (value) {
  if (!value) return null
  if (typeof value === 'string') return value
  if (value._value) return value._value
  return null
}

function capitalise (text) {
  if (!text) return text
  return text.charAt(0).toUpperCase() + text.slice(1)
}

async function fetchIncidents (url) {
  const data = await fetchJsonWithRetry(url, {
    errorPrefix: 'Bathing Water Pollution Incident API',
    retries: 1
  })
  return data.result?.items || []
}

/**
 * Fetch open + recent closed pollution incidents for a bathing water.
 */
async function getIncidentsForBathingWater (eubwid) {
  const cacheKey = `incidents:${eubwid}`
  const cached = getCached(cacheKey)
  if (cached !== undefined) return cached

  const url = `${BASE_URL}.json?bathingWater.eubwidNotation=${encodeURIComponent(eubwid)}&_pageSize=10&_sort=-startOfIncident`

  let items = []
  try {
    items = await fetchIncidents(url)
  } catch (err) {
    console.error(`Pollution incident fetch failed for ${eubwid}:`, err.message)
    setCache(cacheKey, [])
    return []
  }

  const now = Date.now()
  const mapped = items
    .map(item => mapIncident(item))
    .filter(Boolean)
    .filter(incident => {
      if (incident.status === 'open') return true
      if (!incident.endedAt) return false
      return (now - new Date(incident.endedAt).getTime()) < RECENT_CLOSED_WINDOW_MS
    })
    .slice(0, MAX_INCIDENTS_PER_SITE)

  setCache(cacheKey, mapped)
  return mapped
}

function mapIncident (item) {
  const type = extractText(item.incidentType?.name) || extractText(item.incidentType?.label) || 'Pollution incident'
  const startedAt = extractDateTime(item.startOfIncident)
  const endedAt = extractDateTime(item.endOfIncident)
  const isOpen = !endedAt
  const nirsRef = item.nirsRef || null
  const notation = item.incidentNotation || (Array.isArray(item.notation) ? item.notation[0] : item.notation) || null

  const date = startedAt ? startedAt.slice(0, 10) : null
  const description = isOpen
    ? `Open ${type} incident reported at this bathing water${nirsRef ? ` (NIRS ${nirsRef})` : ''}. Environment Agency advice against bathing may apply — check Swimfo before entering the water.`
    : `${capitalise(type)} incident reported${startedAt ? ` on ${date}` : ''}${endedAt ? `, closed ${endedAt.slice(0, 10)}` : ''}${nirsRef ? ` (NIRS ${nirsRef})` : ''}.`

  return {
    date: date || 'Unknown',
    type: capitalise(type),
    description,
    status: isOpen ? 'open' : 'resolved',
    startedAt,
    endedAt,
    nirsRef,
    notation,
    isAlgae: /algae/i.test(type),
    isLiveData: true
  }
}

function buildAlgaeWarning (incidents) {
  const openAlgae = incidents.find(i => i.status === 'open' && i.isAlgae)
  if (openAlgae) {
    return {
      active: true,
      type: 'harmful algae',
      description: 'Harmful algae incident is currently open at this bathing water. Keep dogs away from the water and avoid contact with scum or bloom.',
      isLiveData: true
    }
  }

  const recentAlgae = incidents.find(i => i.isAlgae && i.status === 'resolved')
  if (recentAlgae) {
    return {
      active: false,
      type: null,
      description: `A harmful algae incident was recently closed (${recentAlgae.date}). Remain cautious if blooms are still visible.`,
      isLiveData: true
    }
  }

  return null
}

function bumpStatusForOpenIncidents (location, incidents) {
  const hasOpen = incidents.some(i => i.status === 'open')
  if (!hasOpen) return location.overallStatus

  const hasOpenAlgae = incidents.some(i => i.status === 'open' && i.isAlgae)
  if (hasOpenAlgae) return 'poor'
  if (location.overallStatus === 'good') return 'caution'
  return location.overallStatus
}

/**
 * Enrich locations that have an eubwid with open/recent pollution incidents.
 * Harmful-algae incidents also update algaeWarning.
 */
async function enrichLocationsWithPollutionIncidents (locations) {
  if (!locations.length) return locations

  const withEubwid = locations.filter(l => l.eubwid)
  if (!withEubwid.length) return locations

  const uniqueEubwids = [...new Set(withEubwid.map(l => l.eubwid))]

  const pending = runWithConcurrency(uniqueEubwids, REQUEST_CONCURRENCY, async (eubwid) => {
    try {
      return [eubwid, await getIncidentsForBathingWater(eubwid)]
    } catch (err) {
      console.error(`Pollution incident enrichment failed for ${eubwid}:`, err.message)
      return [eubwid, []]
    }
  }).then(entries => new Map(entries))

  const incidentsByEubwid = await withTimeout(pending, PER_BATCH_TIMEOUT_MS, new Map())

  return locations.map(location => {
    if (!location.eubwid) return location

    const incidents = incidentsByEubwid.get(location.eubwid)
    // Timeout / miss: leave location unchanged rather than claiming "no incidents"
    if (incidents === undefined) return location

    const pollutionIncidents = incidents.map(({ date, type, description, status }) => ({
      date,
      type,
      description,
      status
    }))

    const algaeFromIncidents = buildAlgaeWarning(incidents)
    const hasOpen = incidents.some(i => i.status === 'open')
    const overallStatus = bumpStatusForOpenIncidents(location, incidents)

    let healthWarning = location.healthWarning
    if (hasOpen) {
      healthWarning = {
        active: true,
        type: 'pollution incident',
        description: 'An open pollution incident is recorded for this bathing water. Check Swimfo and official advice before entering the water.'
      }
    }

    const latestIssues = [...(location.latestIssues || [])]
    incidents.filter(i => i.status === 'open').forEach(i => {
      const issue = `Open pollution incident: ${i.type}`
      if (!latestIssues.includes(issue)) latestIssues.push(issue)
    })

    return {
      ...location,
      overallStatus,
      pollutionIncidents,
      algaeWarning: algaeFromIncidents || location.algaeWarning,
      healthWarning,
      latestIssues,
      isPollutionLiveData: true,
      dataSources: [
        ...location.dataSources.filter(s => !s.name.includes('pollution incident')),
        { name: 'EA Bathing Water pollution incidents', url: 'https://environment.data.gov.uk/bwq/profiles/' }
      ]
    }
  })
}

module.exports = {
  getIncidentsForBathingWater,
  enrichLocationsWithPollutionIncidents
}

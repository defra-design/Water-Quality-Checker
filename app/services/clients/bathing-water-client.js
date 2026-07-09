/**
 * Environment Agency Bathing Water API client
 * https://environment.data.gov.uk/bwq/
 */

const { fetchJsonWithRetry, runWithConcurrency } = require('./http-utils')

const BASE_URL = 'https://environment.data.gov.uk'
const REQUEST_CONCURRENCY = 4

const cache = new Map()
const CACHE_TTL_MS = 15 * 60 * 1000

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

async function fetchJson (url) {
  return fetchJsonWithRetry(url, { errorPrefix: 'Bathing Water API' })
}

function toHttps (uri) {
  if (!uri) return null
  return uri.replace(/^http:\/\//, 'https://')
}

function extractText (value) {
  if (!value) return null
  if (typeof value === 'string') return value
  if (value._value) return value._value
  if (Array.isArray(value)) return extractText(value[0])
  if (value.name) return extractText(value.name)
  return null
}

/**
 * Fetch a single bathing water record with compliance and risk data.
 */
async function getBathingWater (eubwid) {
  const cacheKey = `bw:${eubwid}`
  const cached = getCached(cacheKey)
  if (cached) return cached

  const data = await fetchJson(`${BASE_URL}/id/bathing-water/${eubwid}`)
  const topic = data.result?.primaryTopic
  if (!topic) {
    throw new Error(`No bathing water data for ${eubwid}`)
  }

  let sample = null
  const sampleUri = topic.latestSampleAssessment
  if (sampleUri) {
    try {
      sample = await getSampleAssessment(sampleUri)
    } catch (err) {
      console.error(`Sample fetch failed for ${eubwid}:`, err.message)
    }
  }

  const result = { bathingWater: topic, sample }
  setCache(cacheKey, result)
  return result
}

/**
 * Fetch latest in-season sample assessment (bacteria counts, coordinates).
 */
async function getSampleAssessment (uri) {
  const url = toHttps(uri)
  const cacheKey = `sample:${url}`
  const cached = getCached(cacheKey)
  if (cached) return cached

  const data = await fetchJson(url)
  const topic = data.result?.primaryTopic
  setCache(cacheKey, topic)
  return topic
}

/**
 * Fetch multiple bathing waters in parallel (with concurrency limit).
 */
async function getBathingWaters (eubwids) {
  const results = await runWithConcurrency(eubwids, REQUEST_CONCURRENCY, async (eubwid) => {
    try {
      return await getBathingWater(eubwid)
    } catch (err) {
      console.error(`Failed to load bathing water ${eubwid}:`, err.message)
      return null
    }
  })
  return results.filter(Boolean)
}

/**
 * Fetch nearest designated bathing water EUbWIDs by OSGB grid reference.
 */
async function getNearestBathingWaterIds (easting, northing, pageSize = 20) {
  const east = Math.round(easting)
  const north = Math.round(northing)
  const cacheKey = `near:${east}:${north}:${pageSize}`
  const cached = getCached(cacheKey)
  if (cached) return cached

  const url = `${BASE_URL}/doc/nearest-bathing-water/easting/${east}/northing/${north}?_pageSize=${pageSize}`
  const data = await fetchJson(url)
  const items = data.result?.items || []

  const eubwids = items.map((item) => {
    const about = item._about || item.bathingWater?._about
    if (!about) return null
    const parts = about.split('/')
    return parts[parts.length - 1]
  }).filter(Boolean)

  setCache(cacheKey, eubwids)
  return eubwids
}

module.exports = {
  getBathingWater,
  getBathingWaters,
  getNearestBathingWaterIds,
  getSampleAssessment,
  extractText,
  toHttps,
  BASE_URL
}

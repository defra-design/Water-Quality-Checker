/**
 * UK postcode geocoding via postcodes.io
 * https://postcodes.io/
 *
 * Free, no API key required. Used to resolve any valid UK postcode to
 * coordinates for nationwide EA / Met Office lookups.
 */

const BASE_URL = 'https://api.postcodes.io'

const cache = new Map()
const CACHE_TTL_MS = 24 * 60 * 60 * 1000

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

function mapResult (result) {
  return {
    postcode: result.postcode,
    lat: result.latitude,
    lng: result.longitude,
    easting: result.eastings,
    northing: result.northings,
    area: result.admin_district || result.parish || result.admin_ward || result.region,
    region: result.region,
    country: result.country,
    outcode: result.outcode,
    isApproximate: false
  }
}

async function fetchJson (url) {
  const response = await fetch(url)
  if (!response.ok) return null
  return response.json()
}

/**
 * Resolve a full UK postcode to coordinates and administrative area.
 */
async function lookupPostcode (postcode) {
  const normalised = postcode.trim().toUpperCase().replace(/\s+/g, ' ')
  const cacheKey = `pc:${normalised}`
  const cached = getCached(cacheKey)
  if (cached) return cached

  const encoded = encodeURIComponent(normalised)
  let data = await fetchJson(`${BASE_URL}/postcodes/${encoded}`)

  if (!data || data.status !== 200) {
    const outcodeMatch = normalised.match(/^([A-Z]{1,2}[0-9][0-9A-Z]?)/)
    if (!outcodeMatch) return null
    data = await fetchJson(`${BASE_URL}/outcodes/${encodeURIComponent(outcodeMatch[1])}`)
    if (!data || data.status !== 200) return null
    const result = {
      postcode: normalised,
      lat: data.result.latitude,
      lng: data.result.longitude,
      easting: null,
      northing: null,
      area: data.result.admin_district?.[0] || data.result.parish?.[0] || outcodeMatch[1],
      region: data.result.region?.[0] || data.result.country?.[0],
      country: data.result.country?.[0],
      outcode: data.result.outcode,
      isApproximate: true
    }
    setCache(cacheKey, result)
    return result
  }

  const result = mapResult(data.result)
  setCache(cacheKey, result)
  return result
}

module.exports = {
  lookupPostcode
}

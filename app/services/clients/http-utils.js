/**
 * Shared helpers for calling public Environment Agency / Defra APIs politely:
 * retry transient errors (429/403/503) with backoff, and cap concurrency so
 * we don't burst enough parallel requests to trip their rate limiting.
 */

const RETRYABLE_STATUS = new Set([403, 429, 503])
const DEFAULT_RETRIES = 2
const DEFAULT_BACKOFF_MS = 400

function wait (ms) {
  return new Promise(resolve => setTimeout(resolve, ms))
}

/**
 * Fetch JSON with retry-with-backoff on rate-limit / transient errors.
 */
async function fetchJsonWithRetry (url, { headers = { Accept: 'application/json' }, retries = DEFAULT_RETRIES, errorPrefix = 'API' } = {}) {
  let attempt = 0
  // eslint-disable-next-line no-constant-condition
  while (true) {
    const response = await fetch(url, { headers })
    if (response.ok) {
      return response.json()
    }
    if (RETRYABLE_STATUS.has(response.status) && attempt < retries) {
      await wait(DEFAULT_BACKOFF_MS * (attempt + 1))
      attempt++
      continue
    }
    throw new Error(`${errorPrefix} error ${response.status} for ${url}`)
  }
}

/**
 * Run async tasks with a concurrency cap, preserving input order in the result.
 */
async function runWithConcurrency (items, limit, task) {
  const results = new Array(items.length)
  let cursor = 0

  async function worker () {
    while (cursor < items.length) {
      const index = cursor++
      results[index] = await task(items[index], index)
    }
  }

  const workers = Array.from({ length: Math.min(limit, items.length) }, worker)
  await Promise.all(workers)
  return results
}

/**
 * Race a promise against a timeout, resolving to `fallback` if it's too slow.
 * Used so a slow/rate-limited upstream API can never block a page render.
 */
async function withTimeout (promise, ms, fallback = null) {
  let timer
  const timeout = new Promise(resolve => {
    timer = setTimeout(() => resolve(fallback), ms)
  })
  try {
    return await Promise.race([promise, timeout])
  } finally {
    clearTimeout(timer)
  }
}

module.exports = {
  fetchJsonWithRetry,
  runWithConcurrency,
  withTimeout
}

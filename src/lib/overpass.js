// Overpass API client. Prefers the /api/overpass serverless proxy (avoids
// browser CORS issues once deployed); falls back to calling public mirrors
// directly from the browser, which is what plain `vite dev` will always do
// locally since it doesn't serve the /api route.

export const MIRRORS = [
  'https://overpass-api.de/api/interpreter',
  'https://overpass.kumi.systems/api/interpreter',
  'https://overpass.private.coffee/api/interpreter',
  'https://lz4.overpass-api.de/api/interpreter',
]

const ROAD_CLASSES =
  'motorway|trunk|primary|secondary|tertiary|unclassified|residential|living_street|service|road|' +
  'motorway_link|trunk_link|primary_link|secondary_link|tertiary_link'

const cache = new Map()

export function buildQuery(lat, lon, radius) {
  const a = `around:${radius},${lat.toFixed(6)},${lon.toFixed(6)}`
  return `[out:json][timeout:25];
(
  way["highway"~"^(${ROAD_CLASSES})$"](${a});
  way["building"](${a});
);
out geom qt;`
}

async function tryProxy(query, timeoutMs, outerSignal) {
  const ctrl = new AbortController()
  const timer = setTimeout(() => ctrl.abort(new Error('timeout')), timeoutMs)
  const onAbort = () => ctrl.abort(outerSignal.reason)
  outerSignal?.addEventListener('abort', onAbort)
  try {
    const res = await fetch('/api/overpass', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ query }),
      signal: ctrl.signal,
    })
    // Plain `vite dev` has no /api route and returns the index.html fallback
    // (200, text/html) or a 404 — either way, that's not a real proxy response.
    const ct = res.headers.get('content-type') || ''
    if (!ct.includes('application/json')) throw new Error('proxy unavailable')
    const body = await res.json()
    if (!res.ok) throw new Error(body?.error || `HTTP ${res.status}`)
    if (!Array.isArray(body.json?.elements)) throw new Error('unexpected response')
    return { json: body.json, mirror: body.mirror || 'proxy' }
  } finally {
    clearTimeout(timer)
    outerSignal?.removeEventListener('abort', onAbort)
  }
}

async function tryMirror(url, query, timeoutMs, outerSignal) {
  const ctrl = new AbortController()
  const timer = setTimeout(() => ctrl.abort(new Error('timeout')), timeoutMs)
  const onAbort = () => ctrl.abort(outerSignal.reason)
  outerSignal?.addEventListener('abort', onAbort)
  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded;charset=UTF-8' },
      body: 'data=' + encodeURIComponent(query),
      signal: ctrl.signal,
    })
    if (!res.ok) throw new Error(`HTTP ${res.status}`)
    const json = await res.json()
    if (!Array.isArray(json.elements)) throw new Error('unexpected response')
    if (json.elements.length === 0 && json.remark) throw new Error(json.remark)
    return json
  } finally {
    clearTimeout(timer)
    outerSignal?.removeEventListener('abort', onAbort)
  }
}

/**
 * Fetch roads + buildings around a point.
 * Tries the serverless proxy first, then falls back to calling public
 * Overpass mirrors directly from the browser (rotating through them so load
 * is spread, with a random start point).
 */
export async function fetchOsm(lat, lon, radius = 800, { signal, onStatus, timeoutMs = 22000 } = {}) {
  const key = `${lat.toFixed(4)},${lon.toFixed(4)},${radius}`
  if (cache.has(key)) return { json: cache.get(key), mirror: 'cache', cached: true }

  const query = buildQuery(lat, lon, radius)

  onStatus?.('Contacting Overpass…')
  try {
    const { json, mirror } = await tryProxy(query, timeoutMs, signal)
    cache.set(key, json)
    return { json, mirror, cached: false }
  } catch (e) {
    if (signal?.aborted) throw e
    // fall through to direct mirror calls
  }

  const start = Math.floor(Math.random() * MIRRORS.length)
  const errors = []
  for (let i = 0; i < MIRRORS.length; i++) {
    const url = MIRRORS[(start + i) % MIRRORS.length]
    const host = new URL(url).host
    onStatus?.(`Asking ${host} (${i + 1}/${MIRRORS.length})…`)
    try {
      const json = await tryMirror(url, query, timeoutMs, signal)
      cache.set(key, json)
      return { json, mirror: host, cached: false }
    } catch (e) {
      if (signal?.aborted) throw e
      errors.push(`${host}: ${e.message || e}`)
    }
  }
  throw new Error('All Overpass servers failed.\n' + errors.join('\n'))
}
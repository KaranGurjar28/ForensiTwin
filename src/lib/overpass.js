// Overpass API client. Prefers the /api/overpass serverless proxy, which is
// cached at Vercel's CDN edge — once any request for a location succeeds,
// repeat requests for that same area are served instantly from cache and
// never touch Overpass again, which is what makes this reliable long-term
// (the free public mirrors rate-limit shared cloud IPs unpredictably, so
// no retry strategy alone can guarantee a mirror answers on every click).
//
// One click now tries the whole batch of server-side sources up to 3 times
// (with a short backoff) before giving up — these are independent public
// services, so a source that timed out or 500'd on attempt 1 often answers
// fine on attempt 2 or 3. This is purely about transient failures; it does
// NOT retry against sources that explicitly rejected the request (406/403),
// since those will reject again immediately.
//
// Falls back to calling public mirrors directly from the browser ONLY when
// the proxy route itself doesn't exist (plain `vite dev` without `vercel dev`,
// which doesn't serve /api at all).

export const MIRRORS = [
  'https://overpass-api.de/api/interpreter',
  'https://overpass.kumi.systems/api/interpreter',
  'https://lz4.overpass-api.de/api/interpreter',
  'https://overpass.osm.ch/api/interpreter',
  'https://overpass.openstreetmap.fr/api/interpreter',
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

async function tryProxy(lat, lon, radius, timeoutMs, outerSignal) {
  const ctrl = new AbortController()
  const timer = setTimeout(() => ctrl.abort(new Error('timeout')), timeoutMs)
  const onAbort = () => ctrl.abort(outerSignal.reason)
  outerSignal?.addEventListener('abort', onAbort)
  try {
    const url = `/api/overpass?lat=${lat}&lon=${lon}&radius=${radius}`
    const res = await fetch(url, { method: 'GET', signal: ctrl.signal })
    const ct = res.headers.get('content-type') || ''
    if (!ct.includes('application/json')) {
      const e = new Error('proxy route not served (local dev without /api)')
      e.routeMissing = true
      throw e
    }
    const body = await res.json()
    if (!res.ok) throw new Error(body?.error || `HTTP ${res.status}`)
    if (!Array.isArray(body.json?.elements)) throw new Error('unexpected response')
    return { json: body.json, mirror: body.mirror || 'proxy', fromCache: res.headers.get('x-vercel-cache') === 'HIT' }
  } finally {
    clearTimeout(timer)
    outerSignal?.removeEventListener('abort', onAbort)
  }
}

async function tryProxyWithRetries(lat, lon, radius, timeoutMs, outerSignal, onStatus) {
  const ATTEMPTS = 3
  let lastErr
  for (let attempt = 1; attempt <= ATTEMPTS; attempt++) {
    try {
      if (attempt > 1) onStatus?.(`Sources were busy — retrying (${attempt}/${ATTEMPTS})…`)
      return await tryProxy(lat, lon, radius, timeoutMs, outerSignal)
    } catch (e) {
      lastErr = e
      if (outerSignal?.aborted || e.routeMissing) throw e
      if (attempt < ATTEMPTS) await new Promise((r) => setTimeout(r, 1500 * attempt))
    }
  }
  throw lastErr
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

export async function fetchOsm(lat, lon, radius = 800, { signal, onStatus, timeoutMs = 11000 } = {}) {
  const key = `${lat.toFixed(4)},${lon.toFixed(4)},${radius}`
  if (cache.has(key)) return { json: cache.get(key), mirror: 'cache', cached: true }

  onStatus?.('Contacting Overpass…')
  try {
    const { json, mirror, fromCache } = await tryProxyWithRetries(lat, lon, radius, timeoutMs, signal, onStatus)
    cache.set(key, json)
    return { json, mirror, cached: fromCache }
  } catch (e) {
    if (signal?.aborted) throw e
    if (!e.routeMissing) throw e
  }

  const query = buildQuery(lat, lon, radius)
  const start = Math.floor(Math.random() * MIRRORS.length)
  const errors = []
  for (let i = 0; i < MIRRORS.length; i++) {
    const url = MIRRORS[(start + i) % MIRRORS.length]
    const host = new URL(url).host
    onStatus?.(`Asking ${host} (${i + 1}/${MIRRORS.length})…`)
    try {
      const json = await tryMirror(url, query, 25000, signal)
      cache.set(key, json)
      return { json, mirror: host, cached: false }
    } catch (e) {
      if (signal?.aborted) throw e
      errors.push(`${host}: ${e.message || e}`)
    }
  }
  throw new Error('All Overpass servers failed.\n' + errors.join('\n'))
}
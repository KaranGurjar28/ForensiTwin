// Overpass API client.
//
// Tries the /api/overpass serverless proxy first — it's cached at Vercel's
// CDN edge, so once any request for a location succeeds, repeat requests for
// that same area are served instantly and never touch Overpass again.
//
// If the proxy fails for ANY reason, this now always falls back to querying
// public mirrors directly from the VISITOR'S OWN BROWSER — not just in local
// dev. This matters because Vercel's shared serverless IP range appears to
// be blocked/deprioritized across the free OSM mirror ecosystem (consistent
// with their public April-2026 anti-scraper crackdown, which specifically
// calls out app-hosting platforms) — our server-side requests get 403/406/
// timeouts near-universally, while the exact same mirrors answer a normal
// visitor's browser fine, because that request comes from an ordinary
// residential/mobile IP, not a flagged datacenter range.
//
// The direct-browser request is a plain GET with no custom headers — the
// same shape the official overpass-turbo.eu tool uses from every browser on
// the public internet — because a "simple request" like this never triggers
// a CORS preflight, which is where most of these mirrors fail cross-origin
// calls. Adding custom headers here would silently break this path again.

export const MIRRORS = [
  'https://overpass-api.de/api/interpreter',
  'https://overpass.osm.ch/api/interpreter',
  'https://overpass.kumi.systems/api/interpreter',
  'https://overpass.openstreetmap.fr/api/interpreter',
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
  relation["building"](${a});
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
    if (!ct.includes('application/json')) throw new Error('proxy route not served')
    const body = await res.json()
    if (!res.ok) throw new Error(body?.error || `HTTP ${res.status}`)
    if (!Array.isArray(body.json?.elements)) throw new Error('unexpected response')
    return { json: body.json, mirror: body.mirror || 'proxy', fromCache: res.headers.get('x-vercel-cache') === 'HIT' }
  } finally {
    clearTimeout(timer)
    outerSignal?.removeEventListener('abort', onAbort)
  }
}

// Plain GET, no custom headers — a "simple request" that skips CORS
// preflight entirely. This is deliberately as close to what a browser
// typing the URL directly would send as possible.
async function tryMirror(url, query, timeoutMs, outerSignal) {
  const ctrl = new AbortController()
  const timer = setTimeout(() => ctrl.abort(new Error('timeout')), timeoutMs)
  const onAbort = () => ctrl.abort(outerSignal.reason)
  outerSignal?.addEventListener('abort', onAbort)
  try {
    const getUrl = `${url}?data=${encodeURIComponent(query)}`
    const res = await fetch(getUrl, { method: 'GET', signal: ctrl.signal })
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
 * Tries the serverless proxy first (instant + cached once any location has
 * succeeded once). On ANY proxy failure, falls back to querying mirrors
 * directly from this browser — on Vercel this is not a last resort, it is
 * often the ONLY path that actually works, since the proxy's own server-side
 * IP is frequently blocked by these same mirrors.
 */
export async function fetchOsm(lat, lon, radius = 800, { signal, onStatus, timeoutMs = 11000 } = {}) {
  const key = `${lat.toFixed(4)},${lon.toFixed(4)},${radius}`
  if (cache.has(key)) return { json: cache.get(key), mirror: 'cache', cached: true }

  onStatus?.('Contacting Overpass…')
  try {
    const { json, mirror, fromCache } = await tryProxy(lat, lon, radius, timeoutMs, signal)
    cache.set(key, json)
    return { json, mirror, cached: fromCache }
  } catch (e) {
    if (signal?.aborted) throw e
    // fall through to direct-from-browser mirror calls — see module header
  }

  const query = buildQuery(lat, lon, radius)
  const start = Math.floor(Math.random() * MIRRORS.length)
  const errors = []
  for (let i = 0; i < MIRRORS.length; i++) {
    const url = MIRRORS[(start + i) % MIRRORS.length]
    const host = new URL(url).host
    onStatus?.(`Asking ${host} directly (${i + 1}/${MIRRORS.length})…`)
    try {
      const json = await tryMirror(url, query, 20000, signal)
      cache.set(key, json)
      return { json, mirror: host, cached: false }
    } catch (e) {
      if (signal?.aborted) throw e
      errors.push(`${host}: ${e.message || e}`)
    }
  }
  throw new Error('All Overpass servers failed.\n' + errors.join('\n'))
}
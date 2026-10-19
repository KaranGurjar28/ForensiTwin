// Overpass API client.
//
// Tries the /api/overpass serverless proxy first — it's cached at Vercel's
// CDN edge, so once any request for a location succeeds, repeat requests for
// that same area are served instantly and never touch Overpass again.
//
// If the proxy fails, falls back to querying public mirrors directly from
// the visitor's own browser (Vercel's server IP is widely blocked by these
// mirrors; a normal visitor's IP usually isn't). Confirmed dead for browser
// CORS as of Oct 2026: overpass.private.coffee (unreachable), and
// overpass-api.de / lz4.overpass-api.de / overpass.kumi.systems /
// overpass.openstreetmap.fr (no CORS headers at all) — kept out of the list
// below since retrying them wastes the time budget.
//
// A single pass through the surviving mirrors can still come up empty if
// they're all transiently busy — the same reason a human has to hit "run"
// more than once on overpass-turbo sometimes. So this does up to 3 full
// passes with a short pause between them before giving up.

export const MIRRORS = [
  'https://overpass.osm.ch/api/interpreter',
  'https://maps.mail.ru/osm/tools/overpass/api/interpreter',
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

async function tryAllMirrorsOnce(query, timeoutMs, signal, onStatus) {
  const start = Math.floor(Math.random() * MIRRORS.length)
  const errors = []
  for (let i = 0; i < MIRRORS.length; i++) {
    const url = MIRRORS[(start + i) % MIRRORS.length]
    const host = new URL(url).host
    onStatus?.(`Asking ${host} directly (${i + 1}/${MIRRORS.length})…`)
    try {
      const json = await tryMirror(url, query, timeoutMs, signal)
      return { json, mirror: host }
    } catch (e) {
      if (signal?.aborted) throw e
      errors.push(`${host}: ${e.message || e}`)
    }
  }
  throw new Error(errors.join('\n'))
}

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
    // fall through to direct-from-browser mirror calls
  }

  const query = buildQuery(lat, lon, radius)
  const PASSES = 3
  let lastErr
  for (let pass = 1; pass <= PASSES; pass++) {
    try {
      if (pass > 1) onStatus?.(`First pass came up empty — trying again (${pass}/${PASSES})…`)
      const { json, mirror } = await tryAllMirrorsOnce(query, 20000, signal, onStatus)
      cache.set(key, json)
      return { json, mirror, cached: false }
    } catch (e) {
      lastErr = e
      if (signal?.aborted) throw e
      if (pass < PASSES) await new Promise((r) => setTimeout(r, 4000))
    }
  }
  throw new Error('All Overpass servers failed after multiple attempts.\n' + lastErr.message)
}
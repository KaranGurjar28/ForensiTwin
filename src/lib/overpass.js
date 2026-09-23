// Overpass API client with mirror rotation, per-request timeout and in-memory cache.

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
 * Rotates through mirrors (random start so load is spread) until one answers.
 */
export async function fetchOsm(lat, lon, radius = 800, { signal, onStatus, timeoutMs = 22000 } = {}) {
  const key = `${lat.toFixed(4)},${lon.toFixed(4)},${radius}`
  if (cache.has(key)) return { json: cache.get(key), mirror: 'cache', cached: true }

  const query = buildQuery(lat, lon, radius)
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

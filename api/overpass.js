// api/overpass.js
// Vercel serverless function that proxies Overpass API queries server-side AND
// is cached at Vercel's CDN/edge layer (Cache-Control: s-maxage + swr).
//
// Why caching matters more than retry logic: the free public Overpass mirrors
// rate-limit by IP, and Vercel serverless functions share IPs across many
// unrelated projects. No retry strategy can guarantee a mirror responds at
// the exact moment a given user clicks the button — that's inherent to using
// free shared infrastructure, not something fixable in application code.
// Caching sidesteps the problem: once ANY request for a given location
// succeeds, every later request for that same area (from anyone, for up to
// a week) is served instantly from Vercel's edge cache and never touches
// Overpass again, regardless of whether the mirrors are currently healthy.
//
// This only works for GET requests (Vercel's CDN does not cache POST
// responses), so this endpoint takes lat/lon/radius as query params and
// builds the Overpass query itself, rather than accepting a prebuilt query
// string in a POST body.

export const config = { maxDuration: 30 }

const ROAD_CLASSES =
  'motorway|trunk|primary|secondary|tertiary|unclassified|residential|living_street|service|road|' +
  'motorway_link|trunk_link|primary_link|secondary_link|tertiary_link'

function buildQuery(lat, lon, radius) {
  const a = `around:${radius},${lat.toFixed(6)},${lon.toFixed(6)}`
  return `[out:json][timeout:25];
(
  way["highway"~"^(${ROAD_CLASSES})$"](${a});
  way["building"](${a});
);
out geom qt;`
}

// Ordered by data completeness/reliability, not alphabetically:
// overpass-api.de and lz4.overpass-api.de are the same well-maintained
// cluster with the most complete global coverage; kumi.systems is also a
// long-running full mirror. The .fr/.ch instances are smaller community
// mirrors with sparser regional coverage in some areas, so they're last.
const MIRRORS = [
  { url: 'https://overpass-api.de/api/interpreter', timeoutMs: 8000 },
  { url: 'https://overpass.kumi.systems/api/interpreter', timeoutMs: 8000 },
  { url: 'https://lz4.overpass-api.de/api/interpreter', timeoutMs: 6000 },
  { url: 'https://overpass.osm.ch/api/interpreter', timeoutMs: 4000 },
  { url: 'https://overpass.openstreetmap.fr/api/interpreter', timeoutMs: 4000 },
]

const HEADERS = {
  'Content-Type': 'application/x-www-form-urlencoded;charset=UTF-8',
  'User-Agent': 'ForensiTwin/1.0 (forensic collision reconstruction tool; https://forensi-twin.vercel.app)',
}

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms))
}

async function askMirror(url, query, timeoutMs) {
  const host = new URL(url).host
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), timeoutMs)
  try {
    const r = await fetch(url, {
      method: 'POST',
      headers: HEADERS,
      body: 'data=' + encodeURIComponent(query),
      signal: controller.signal,
    })
    if (r.status === 429) throw new Error('HTTP 429 (rate limited)')
    if (!r.ok) throw new Error(`HTTP ${r.status}`)
    const json = await r.json()
    if (!Array.isArray(json.elements)) throw new Error('Unexpected response shape')
    return { json, mirror: host }
  } catch (e) {
    throw new Error(`${host}: ${e.name === 'AbortError' ? 'timeout' : e.message || e}`)
  } finally {
    clearTimeout(timer)
  }
}

export default async function handler(req, res) {
  if (req.method !== 'GET') {
    res.status(405).json({ error: 'Method not allowed — use GET with lat/lon/radius query params' })
    return
  }

  const lat = parseFloat(req.query.lat)
  const lon = parseFloat(req.query.lon)
  const radius = Math.min(1500, Math.max(100, parseInt(req.query.radius, 10) || 800))

  if (!Number.isFinite(lat) || !Number.isFinite(lon)) {
    res.status(400).json({ error: 'lat and lon query params are required and must be numbers' })
    return
  }

  const cacheKeyLat = lat.toFixed(4)
  const cacheKeyLon = lon.toFixed(4)

  const query = buildQuery(lat, lon, radius)
  const errors = []
  let weakResult = null // technically-successful but empty (0 elements) response, kept as a last resort

  // Two full passes through the mirror list: transient blips (a single
  // failed connection, a momentary 5xx) are common and don't mean a mirror
  // is actually down, so it's worth trying everything twice before giving up.
  for (let pass = 0; pass < 2 && !weakResult; pass++) {
    for (const { url, timeoutMs } of MIRRORS) {
      try {
        const result = await askMirror(url, query, timeoutMs)
        if (result.json.elements.length > 0) {
          res.setHeader('Cache-Control', 'public, max-age=0, s-maxage=86400, stale-while-revalidate=604800')
          res.setHeader('X-Cache-Key', `${cacheKeyLat},${cacheKeyLon},${radius}`)
          res.status(200).json(result)
          return
        }
        if (!weakResult) weakResult = result
      } catch (e) {
        errors.push(`[pass ${pass + 1}] ${e.message}`)
        await sleep(150)
      }
    }
  }

  if (weakResult) {
    // A genuinely quiet area (few/no roads in range) is legitimate and still
    // worth caching, just for a shorter window in case it was actually a
    // coverage gap rather than a truly empty area.
    res.setHeader('Cache-Control', 'public, max-age=0, s-maxage=3600, stale-while-revalidate=86400')
    res.status(200).json(weakResult)
    return
  }

  // Do not cache outright failures — the next request should try again fresh.
  res.setHeader('Cache-Control', 'no-store')
  res.status(502).json({ error: 'All Overpass servers failed.\n' + errors.join('\n') })
}
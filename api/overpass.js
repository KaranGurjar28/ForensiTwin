// api/overpass.js
// Vercel serverless function that proxies Overpass API queries server-side AND
// is cached at Vercel's CDN/edge layer (Cache-Control: s-maxage + swr + SIE).
//
// Empirically (observed from this project's own production traffic):
//   - overpass-api.de / lz4.overpass-api.de: consistently unreachable from
//     Vercel's network (fails fast, not a timeout) — tried last, short budget.
//   - overpass.kumi.systems: reachable but rate-limits aggressively (429).
//   - overpass.osm.ch: the most consistently reachable mirror from Vercel.
// This ordering + budget reflects that, and is easy to re-tune — nothing here
// is fundamental, just tuned to what actually responds from this host.
//
// Caching is the real fix for long-term reliability: once ANY request for a
// location succeeds, it's cached at the edge for a day, served stale for up
// to a week if mirrors are down, and — critically — `stale-if-error` means
// Vercel keeps serving the last good copy even if every mirror fails on a
// later revalidation. That's what stops "worked for days, then broke" for
// any location that was ever successfully loaded once.

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

// Ordered by observed reachability from Vercel's network, not by data
// completeness — a mirror that never connects is worse than a slightly
// less-complete one that actually answers.
const MIRRORS = [
  { url: 'https://overpass.osm.ch/api/interpreter', timeoutMs: 9000 },
  { url: 'https://overpass.kumi.systems/api/interpreter', timeoutMs: 7000 },
  { url: 'https://overpass.openstreetmap.fr/api/interpreter', timeoutMs: 5000 },
  { url: 'https://lz4.overpass-api.de/api/interpreter', timeoutMs: 3500 },
  { url: 'https://overpass-api.de/api/interpreter', timeoutMs: 3500 },
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

  const query = buildQuery(lat, lon, radius)
  const errors = []
  const emptyResults = [] // mirrors that cleanly responded but found 0 elements

  // One pass only — hitting the same mirror set twice in quick succession is
  // what tends to trigger their rate limits in the first place.
  for (const { url, timeoutMs } of MIRRORS) {
    try {
      const result = await askMirror(url, query, timeoutMs)
      if (result.json.elements.length > 0) {
        res.setHeader('Cache-Control', 'public, max-age=0, s-maxage=86400, stale-while-revalidate=604800, stale-if-error=2592000')
        res.status(200).json(result)
        return
      }
      emptyResults.push(result)
    } catch (e) {
      errors.push(e.message)
      await sleep(200)
    }
  }

  // A mirror that cleanly answers "nothing here" is only trustworthy once at
  // least two independent mirrors agree — a single empty response could just
  // mean that one mirror's index is behind, not that the area is actually
  // empty. If fewer than two agree, treat it as inconclusive, not a result.
  if (emptyResults.length >= 2) {
    res.setHeader('Cache-Control', 'public, max-age=0, s-maxage=3600, stale-while-revalidate=86400, stale-if-error=2592000')
    res.status(200).json(emptyResults[0])
    return
  }

  // Do not cache outright failures or single-mirror "empty" results — the
  // next request (from this user clicking "Try again", or anyone else) should
  // get a fresh attempt rather than being stuck with an inconclusive result.
  res.setHeader('Cache-Control', 'no-store')
  const reason = emptyResults.length === 1
    ? `Only one mirror (${emptyResults[0].mirror}) responded, with no data — inconclusive rather than confirmed-empty.\n`
    : ''
  res.status(502).json({ error: reason + 'All Overpass servers failed or gave inconclusive results.\n' + errors.join('\n') })
}
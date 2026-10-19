// api/overpass.js
// Fetches road + building geometry for a location, cached at Vercel's CDN
// edge (s-maxage + stale-while-revalidate + stale-if-error).
//
// Two hard-won lessons baked in here:
// 1. Vercel's Hobby plan hard-caps function execution at 10s regardless of
//    `maxDuration` — so every source is queried IN PARALLEL (Promise.allSettled)
//    instead of one after another; total time = slowest single timeout, not
//    the sum of all of them.
// 2. Since April 2026 the main OSM Overpass operators have cracked down hard
//    on unidentified/automated traffic (406/403), partly targeting app-hosting
//    platforms like Vercel by name. We send identifying headers, and if a
//    mirror rejects our POST with 400/405/406/413/415 we retry that same
//    mirror once with GET, since some only reject one verb.

export const config = { maxDuration: 10 }

const ROAD_CLASSES =
  'motorway|trunk|primary|secondary|tertiary|unclassified|residential|living_street|service|road|' +
  'motorway_link|trunk_link|primary_link|secondary_link|tertiary_link'

function buildOverpassQuery(lat, lon, radius) {
  const a = `around:${radius},${lat.toFixed(6)},${lon.toFixed(6)}`
  return `[out:json][timeout:9];
(
  way["highway"~"^(${ROAD_CLASSES})$"](${a});
  way["building"](${a});
  relation["building"](${a});
);
out geom qt;`
}

function buildPostpassQuery(lat, lon, radius) {
  const pt = `ST_SetSRID(ST_MakePoint(${lon.toFixed(6)},${lat.toFixed(6)}),4326)`
  return `
SELECT osm_id, osm_type, tags, geom FROM postpass_line
WHERE tags ? 'highway' AND tags->>'highway' ~ '^(${ROAD_CLASSES})$'
AND ST_DWithin(geom::geography, ${pt}::geography, ${radius})
UNION ALL
SELECT osm_id, osm_type, tags, geom FROM postpass_polygon
WHERE tags ? 'building'
AND ST_DWithin(geom::geography, ${pt}::geography, ${radius})
`.trim()
}

function geoJsonToElements(fc) {
  if (!fc || !Array.isArray(fc.features)) throw new Error('not a GeoJSON FeatureCollection')
  const elements = []
  for (const f of fc.features) {
    const g = f.geometry
    const tags = f.properties?.tags || {}
    const id = f.properties?.osm_id ?? f.id
    if (!g || id == null) continue
    const ringToPoints = (ring) => ring.map(([lon, lat]) => ({ lat, lon }))
    if (g.type === 'LineString') {
      elements.push({ type: 'way', id, tags, geometry: ringToPoints(g.coordinates) })
    } else if (g.type === 'Polygon' && g.coordinates[0]) {
      elements.push({ type: 'way', id, tags, geometry: ringToPoints(g.coordinates[0]) })
    } else if (g.type === 'MultiPolygon') {
      g.coordinates.forEach((poly, i) => {
        if (poly[0]) elements.push({ type: 'way', id: `${id}_${i}`, tags, geometry: ringToPoints(poly[0]) })
      })
    }
  }
  return elements
}

const HEADERS = {
  Accept: 'application/json',
  'User-Agent': 'ForensiTwin/1.0 (+https://github.com/KaranGurjar28/ForensiTwin; forensic collision reconstruction tool)',
  Referer: 'https://forensi-twin.vercel.app/',
}

async function fetchWithTimeout(url, init, timeoutMs) {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), timeoutMs)
  try {
    return await fetch(url, { ...init, signal: controller.signal })
  } finally {
    clearTimeout(timer)
  }
}

async function askPostpass(lat, lon, radius, timeoutMs) {
  try {
    const r = await fetchWithTimeout(
      'https://postpass.geofabrik.de/api/interpreter',
      {
        method: 'POST',
        headers: { ...HEADERS, 'Content-Type': 'application/x-www-form-urlencoded;charset=UTF-8' },
        body: 'data=' + encodeURIComponent(buildPostpassQuery(lat, lon, radius)),
      },
      timeoutMs,
    )
    if (r.status === 429) throw new Error('HTTP 429 (rate limited)')
    if (!r.ok) throw new Error(`HTTP ${r.status}`)
    const body = await r.json()
    const elements = geoJsonToElements(body)
    return { json: { elements }, mirror: 'postpass.geofabrik.de' }
  } catch (e) {
    throw new Error(`postpass.geofabrik.de: ${e.name === 'AbortError' ? 'timeout' : e.message || e}`)
  }
}

const OVERPASS_MIRRORS = [
  'https://overpass.private.coffee/api/interpreter',
  'https://overpass.osm.ch/api/interpreter',
  'https://maps.mail.ru/osm/tools/overpass/api/interpreter',
  'https://overpass.kumi.systems/api/interpreter',
  'https://overpass.openstreetmap.fr/api/interpreter',
  'https://lz4.overpass-api.de/api/interpreter',
  'https://overpass-api.de/api/interpreter',
]

async function askOverpassMirror(url, query, timeoutMs) {
  const host = new URL(url).host
  try {
    let r = await fetchWithTimeout(
      url,
      {
        method: 'POST',
        headers: { ...HEADERS, 'Content-Type': 'application/x-www-form-urlencoded;charset=UTF-8' },
        body: 'data=' + encodeURIComponent(query),
      },
      timeoutMs,
    )

    // Some mirrors reject POST outright — retry the same host with GET once.
    if ([400, 405, 406, 413, 415].includes(r.status)) {
      try { await r.body?.cancel() } catch {}
      r = await fetchWithTimeout(
        `${url}?data=${encodeURIComponent(query)}`,
        { method: 'GET', headers: HEADERS },
        timeoutMs,
      )
    }

    if (r.status === 429) throw new Error('HTTP 429 (rate limited)')
    if (!r.ok) throw new Error(`HTTP ${r.status}`)
    const json = await r.json()
    if (!Array.isArray(json.elements)) throw new Error('Unexpected response shape')
    return { json, mirror: host }
  } catch (e) {
    throw new Error(`${host}: ${e.name === 'AbortError' ? 'timeout' : e.message || e}`)
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

  const BUDGET_MS = 9000
  const overpassQuery = buildOverpassQuery(lat, lon, radius)
  const attempts = [
    askPostpass(lat, lon, radius, BUDGET_MS),
    ...OVERPASS_MIRRORS.map((url) => askOverpassMirror(url, overpassQuery, BUDGET_MS)),
  ]

  const settled = await Promise.allSettled(attempts)

  const errors = []
  const emptyResults = []
  for (const s of settled) {
    if (s.status === 'rejected') {
      errors.push(s.reason?.message || String(s.reason))
      continue
    }
    if (s.value.json.elements.length > 0) {
      res.setHeader('Cache-Control', 'public, max-age=0, s-maxage=86400, stale-while-revalidate=604800, stale-if-error=2592000')
      res.status(200).json(s.value)
      return
    }
    emptyResults.push(s.value)
  }

  if (emptyResults.length >= 2) {
    res.setHeader('Cache-Control', 'public, max-age=0, s-maxage=3600, stale-while-revalidate=86400, stale-if-error=2592000')
    res.status(200).json(emptyResults[0])
    return
  }

  res.setHeader('Cache-Control', 'no-store')
  const reason = emptyResults.length === 1
    ? `Only one source (${emptyResults[0].mirror}) responded, with no data — inconclusive rather than confirmed-empty.\n`
    : ''
  res.status(502).json({ error: reason + 'All data sources failed or gave inconclusive results.\n' + errors.join('\n') })
}
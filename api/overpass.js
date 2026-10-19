
 // api/overpass.js
// Server-side OpenStreetMap geometry proxy for roads and buildings.
// Response shape: { json, mirror }

export const config = { maxDuration: 10 }

const ROAD_CLASSES =
  'motorway|trunk|primary|secondary|tertiary|unclassified|residential|living_street|service|road|' +
  'motorway_link|trunk_link|primary_link|secondary_link|tertiary_link'

const MIRRORS = [
  'https://overpass.private.coffee/api/interpreter',
  'https://overpass-api.de/api/interpreter',
  'https://lz4.overpass-api.de/api/interpreter',
  'https://overpass.kumi.systems/api/interpreter',
  'https://overpass.osm.ch/api/interpreter',
  'https://overpass.openstreetmap.fr/api/interpreter',
  'https://maps.mail.ru/osm/tools/overpass/api/interpreter',
]

const HEADERS = {
  'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8',
  Accept: 'application/json',
  'User-Agent': 'ForensiTwin/1.0 (OpenStreetMap road/building geometry client)',
  Referer: 'https://forensi-twin.vercel.app/',
}

function buildQuery(lat, lon, radius) {
  const around = `around:${radius},${lat.toFixed(6)},${lon.toFixed(6)}`
  return `[out:json][timeout:7];\n(\n` +
    `  way["highway"~"^(${ROAD_CLASSES})$"](${around});\n` +
    `  way["building"](${around});\n` +
    `);\nout geom;`
}

function errorMessage(error) {
  if (error?.name === 'AbortError') return 'timeout'
  return error?.message || String(error)
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

async function askMirror(url, query, timeoutMs) {
  const host = new URL(url).host

  try {
    let response = await fetchWithTimeout(url, {
      method: 'POST',
      headers: HEADERS,
      body: `data=${encodeURIComponent(query)}`,
    }, timeoutMs)

    // Retry as GET if the mirror rejects this POST format.
    if ([405, 406, 415].includes(response.status)) {
      try {
        await response.body?.cancel()
      } catch {
        // Ignore a response body that has already closed.
      }

      const separator = url.includes('?') ? '&' : '?'
      response = await fetchWithTimeout(
        `${url}${separator}data=${encodeURIComponent(query)}`,
        {
          method: 'GET',
          headers: {
            Accept: 'application/json',
            'User-Agent': HEADERS['User-Agent'],
            Referer: HEADERS.Referer,
          },
        },
        timeoutMs,
      )
    }

    if (response.status === 429) {
      throw new Error('HTTP 429 (rate limited)')
    }
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`)
    }

    const contentType = response.headers.get('content-type') || ''
    if (!contentType.includes('json')) {
      const sample = (await response.text())
        .slice(0, 120)
        .replace(/\s+/g, ' ')
      throw new Error(
        `unexpected content type${sample ? `: ${sample}` : ''}`,
      )
    }

    const json = await response.json()

    if (!Array.isArray(json.elements)) {
      throw new Error('unexpected response shape (elements missing)')
    }
    if (json.remark && json.elements.length === 0) {
      throw new Error(`Overpass remark: ${json.remark}`)
    }

    return { json, mirror: host }
  } catch (error) {
    throw new Error(`${host}: ${errorMessage(error)}`)
  }
}

export default async function handler(req, res) {
  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET')
    return res.status(405).json({
      error: 'Method not allowed. Use GET with lat, lon, and optional radius.',
    })
  }

  const lat = Number(req.query.lat)
  const lon = Number(req.query.lon)
  const requestedRadius = Number.parseInt(req.query.radius, 10)
  const radius = Math.min(
    1500,
    Math.max(100, Number.isFinite(requestedRadius) ? requestedRadius : 800),
  )

  if (
    !Number.isFinite(lat) ||
    !Number.isFinite(lon) ||
    lat < -90 ||
    lat > 90 ||
    lon < -180 ||
    lon > 180
  ) {
    return res.status(400).json({
      error: 'Valid latitude and longitude are required (lat -90..90, lon -180..180).',
    })
  }

  const query = buildQuery(lat, lon, radius)
  const perRequestTimeoutMs = 6500

  const results = await Promise.allSettled(
    MIRRORS.map((url) => askMirror(url, query, perRequestTimeoutMs)),
  )

  const errors = []
  const emptyResults = []

  for (const result of results) {
    if (result.status === 'rejected') {
      errors.push(result.reason?.message || String(result.reason))
      continue
    }

    const value = result.value

    if (value.json.elements.length > 0) {
      res.setHeader(
        'Cache-Control',
        'public, max-age=0, s-maxage=86400, stale-while-revalidate=604800, stale-if-error=2592000',
      )
      return res.status(200).json(value)
    }

    emptyResults.push(value)
  }

  // One empty mirror is not enough to conclude that an area has no map data.
  if (emptyResults.length >= 2) {
    res.setHeader(
      'Cache-Control',
      'public, max-age=0, s-maxage=3600, stale-while-revalidate=86400, stale-if-error=2592000',
    )
    return res.status(200).json(emptyResults[0])
  }

  res.setHeader('Cache-Control', 'no-store')

  const emptyNote = emptyResults.length === 1
    ? `Only ${emptyResults[0].mirror} returned an empty result; that is inconclusive. `
    : ''

  return res.status(502).json({
    error:
      `${emptyNote}No Overpass mirror returned usable road/building data.\n` +
      errors.join('\n'),
    hint:
      'Wait briefly and retry. If this persists on Vercel, public Overpass mirrors may be rate-limiting the serverless IP; a dedicated or self-hosted OSM data endpoint is more dependable for production.',
  })
}


 // api/overpass.js

export const config = { maxDuration: 10 }

const ROAD_CLASSES =
  'motorway|trunk|primary|secondary|tertiary|unclassified|residential|living_street|service|road|' +
  'motorway_link|trunk_link|primary_link|secondary_link|tertiary_link'

const PROVIDERS = [
  'https://overpass.private.coffee/api/interpreter',
  'https://overpass-api.de/api/interpreter',
  'https://overpass.kumi.systems/api/interpreter',
  'https://overpass.osm.ch/api/interpreter',
]

function buildQuery(lat, lon, radius) {
  const around = `around:${radius},${lat.toFixed(6)},${lon.toFixed(6)}`
  return `[out:json][timeout:5];
(
 way["highway"~"^(${ROAD_CLASSES})$"](${around});
 way["building"](${around});
);
out geom;`
}

async function request(url, query, timeoutMs = 2200) {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), timeoutMs)

  try {
    const options = {
      headers: {
        Accept: 'application/json',
        'User-Agent': 'ForensiTwin/1.0',
      },
      signal: controller.signal,
    }

    let response = await fetch(url, {
      ...options,
      method: 'POST',
      headers: {
        ...options.headers,
        'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8',
      },
      body: `data=${encodeURIComponent(query)}`,
    })

    if ([405, 406, 415].includes(response.status)) {
      try {
        await response.body?.cancel()
      } catch {
        // Ignore a closed response body.
      }

      response = await fetch(
        `${url}?data=${encodeURIComponent(query)}`,
        options,
      )
    }

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`)
    }

    const contentType = response.headers.get('content-type') || ''
    if (!contentType.toLowerCase().includes('json')) {
      throw new Error(`Unexpected content type: ${contentType || 'missing'}`)
    }

    const json = await response.json()

    if (!Array.isArray(json.elements)) {
      throw new Error('Invalid Overpass response: elements missing')
    }

    if (json.remark) {
      throw new Error(`Overpass remark: ${json.remark}`)
    }

    return json
  } catch (error) {
    if (error?.name === 'AbortError') {
      throw new Error('Request timed out')
    }
    throw error
  } finally {
    clearTimeout(timer)
  }
}

export default async function handler(req, res) {
  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET')
    return res.status(405).json({
      error: 'Method not allowed. Use GET.',
    })
  }

  const lat = Number(req.query.lat)
  const lon = Number(req.query.lon)
  const requestedRadius = Number.parseInt(req.query.radius, 10)

  const radius = Math.min(
    1200,
    Math.max(
      100,
      Number.isFinite(requestedRadius) ? requestedRadius : 800,
    ),
  )

  if (
    !Number.isFinite(lat) ||
    lat < -90 ||
    lat > 90 ||
    !Number.isFinite(lon) ||
    lon < -180 ||
    lon > 180
  ) {
    return res.status(400).json({
      error: 'Valid latitude and longitude are required.',
    })
  }

  const query = buildQuery(lat, lon, radius)
  const errors = []
  let emptyResult = null

  // Try providers sequentially to avoid parallel requests.
  for (const endpoint of PROVIDERS) {
    const host = new URL(endpoint).host

    try {
      const json = await request(endpoint, query)

      if (json.elements.length > 0) {
        res.setHeader(
          'Cache-Control',
          'public, max-age=0, s-maxage=86400, stale-while-revalidate=604800',
        )

        return res.status(200).json({
          json,
          mirror: host,
        })
      }

      // An empty response alone is not proof the area has no data.
      emptyResult ||= {
        json,
        mirror: host,
      }
    } catch (error) {
      errors.push(`${host}: ${error?.message || String(error)}`)
    }
  }

  if (emptyResult) {
    res.setHeader(
      'Cache-Control',
      'public, max-age=0, s-maxage=300, stale-while-revalidate=3600',
    )

    return res.status(200).json(emptyResult)
  }

  res.setHeader('Cache-Control', 'no-store')

  return res.status(502).json({
    error:
      'No Overpass provider returned usable road/building data. ' +
      errors.join(' | '),
    hint:
      'Public Overpass services may be unavailable or rate-limiting this deployment. Retry later or configure a dedicated OSM provider.',
  })
}

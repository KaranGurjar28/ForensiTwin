// api/overpass.js
// Vercel serverless function that proxies Overpass API queries server-side.
// Browser -> Overpass calls are subject to CORS and can be blocked once the
// app is hosted on a public domain; a server-to-server call has no such
// restriction, so this is the reliable path in production.

export const config = { runtime: 'nodejs' }

const MIRRORS = [
  'https://overpass-api.de/api/interpreter',
  'https://overpass.kumi.systems/api/interpreter',
  'https://overpass.private.coffee/api/interpreter',
  'https://lz4.overpass-api.de/api/interpreter',
]

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Method not allowed' })
    return
  }

  const query = req.body?.query
  if (!query || typeof query !== 'string') {
    res.status(400).json({ error: 'Missing "query" string in JSON body' })
    return
  }

  const start = Math.floor(Math.random() * MIRRORS.length)
  const errors = []

  for (let i = 0; i < MIRRORS.length; i++) {
    const url = MIRRORS[(start + i) % MIRRORS.length]
    const host = new URL(url).host
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), 20000)
    try {
      const r = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded;charset=UTF-8' },
        body: 'data=' + encodeURIComponent(query),
        signal: controller.signal,
      })
      clearTimeout(timer)
      if (!r.ok) throw new Error(`HTTP ${r.status}`)
      const json = await r.json()
      if (!Array.isArray(json.elements)) throw new Error('Unexpected response shape')
      res.status(200).json({ json, mirror: host })
      return
    } catch (e) {
      clearTimeout(timer)
      errors.push(`${host}: ${e.name === 'AbortError' ? 'timeout' : e.message || e}`)
    }
  }

  res.status(502).json({ error: 'All Overpass servers failed.\n' + errors.join('\n') })
}
// api/overpass.js
// Vercel serverless function that proxies Overpass API queries server-side,
// racing all mirrors in parallel so the whole call finishes well inside
// Vercel's default function time limit (10s on Hobby).

export const config = { maxDuration: 20 }

const MIRRORS = [
  'https://overpass-api.de/api/interpreter',
  'https://overpass.kumi.systems/api/interpreter',
  'https://overpass.private.coffee/api/interpreter',
  'https://lz4.overpass-api.de/api/interpreter',
]

async function askMirror(url, query, timeoutMs) {
  const host = new URL(url).host
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), timeoutMs)
  try {
    const r = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded;charset=UTF-8' },
      body: 'data=' + encodeURIComponent(query),
      signal: controller.signal,
    })
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
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Method not allowed' })
    return
  }

  const query = req.body?.query
  if (!query || typeof query !== 'string') {
    res.status(400).json({ error: 'Missing "query" string in JSON body' })
    return
  }

  // Race every mirror at once (8s each) instead of trying them in sequence —
  // sequential attempts could add up to well over Vercel's function timeout.
  const attempts = MIRRORS.map((url) => askMirror(url, query, 8000))
  try {
    const winner = await Promise.any(attempts)
    res.status(200).json(winner)
  } catch (agg) {
    const errors = (agg.errors || []).map((e) => e.message)
    res.status(502).json({ error: 'All Overpass servers failed.\n' + errors.join('\n') })
  }
}
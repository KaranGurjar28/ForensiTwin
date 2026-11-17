/**
 * Run from ForensiTwin project root:
 *   node scripts/reconstruction.selftest.mjs
 * This test uses MOCK OSM data (no Google/Overpass API calls).
 * It confirms radii, cross-boundary roads and Three.js mesh generation.
 */
import assert from 'node:assert/strict'
import { buildGeometryQuery, fetchReconstructionGeometry, geometryCounts } from '../src/lib/reconstructionData.js'
import { buildWorld } from '../src/lib/siteGeometry.js'

const lat = 23.028269, lon = 72.63501
const simulatedOSM = { elements: [
  { type: 'way', id: 101, tags: { highway: 'residential' }, geometry: [
    { lat: lat - 0.01, lon }, { lat: lat + 0.01, lon },
  ] },
  { type: 'way', id: 102, tags: { building: 'yes', 'building:levels': '3' }, geometry: [
    { lat: lat + 0.00010, lon: lon + 0.00010 },
    { lat: lat + 0.00010, lon: lon + 0.00018 },
    { lat: lat + 0.00018, lon: lon + 0.00018 },
    { lat: lat + 0.00018, lon: lon + 0.00010 },
    { lat: lat + 0.00010, lon: lon + 0.00010 },
  ] },
] }
const originalFetch = globalThis.fetch
let calls = 0
try {
  globalThis.fetch = async () => {
    calls++
    return {
      ok: true, status: 200,
      headers: { get: () => 'application/json' },
      text: async () => JSON.stringify(simulatedOSM),
    }
  }
  for (const radius of [250, 800, 1500]) {
    assert(buildGeometryQuery(lat, lon, radius).includes(`around:${radius}`))
    // Force-refresh makes tests independent of any persistent cache.
    const { data } = await fetchReconstructionGeometry(lat, lon, radius, { forceRefresh: true })
    const counts = geometryCounts(data)
    assert.equal(counts.roads, 1)
    assert.equal(counts.buildings, 1)
    const world = buildWorld(data, { lat, lon }, { radius, heightAt: () => 0 })
    assert.equal(world.stats.roads, 1)
    assert.equal(world.stats.buildings, 1)
    assert(world.roadGeo && world.buildingGeo)
    for (const key of ['roadGeo', 'shoulderGeo', 'markGeo', 'crosswalkGeo', 'buildingGeo']) world[key]?.dispose()
    console.log(`PASS ${radius} m: cross-boundary road and building 3D meshes created`)
  }
  assert.equal(calls, 3)
  const cached = await fetchReconstructionGeometry(lat, lon, 800)
  assert.equal(cached.cached, true)
  assert.equal(calls, 3)
  console.log('PASS: repeated site uses cache without a new network request')
} finally {
  globalThis.fetch = originalFetch
}
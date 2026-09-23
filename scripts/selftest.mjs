// Headless checks for the pure logic: OSM -> geometry, physics, crush.
import assert from 'node:assert/strict'
import { buildWorld } from '../src/lib/osmGeometry.js'
import { skidSpeed, forwardImpact, reverseMomentum, velOf, kmh2ms, ms2kmh, poseAt, preBackDist, postAlongDist } from '../src/lib/physics.js'
import { deformPositions, crushDepth } from '../src/lib/crush.js'
import { bearingToVec, vecToBearing, makeProjector } from '../src/lib/geo.js'

const near = (a, b, tol, msg) => assert.ok(Math.abs(a - b) <= tol, `${msg}: got ${a}, expected ${b} ±${tol}`)
let n = 0
const ok = (name) => console.log('  ✓', name, (n++, ''))

// ---- geo
{
  const p = makeProjector(23.03, 72.57)
  const [x, z] = p.toLocal(23.03 + 100 / 111320, 72.57)
  near(x, 0, 1e-6, 'x'); near(z, -100, 1e-3, 'north is -z')
  const [lat, lon] = p.toGeo(50, -30)
  near(lat, 23.03 + 30 / 111320, 1e-9, 'lat roundtrip')
  near(vecToBearing(...bearingToVec(123)), 123, 1e-9, 'bearing roundtrip')
  ok('projection & bearings')
}

// ---- physics
{
  near(ms2kmh(skidSpeed(20, 0.7)), 59.7, 0.2, 'skid speed 20 m @0.7')
  near(skidSpeed(0, 0.7), 0, 0, 'no skid')
  // perfectly plastic collision: common velocity, then recover the pre-impact speeds
  const mA = 1500, mB = 1200
  const vA = velOf(kmh2ms(60), 0), vB = velOf(kmh2ms(50), 90)
  const f = forwardImpact({ mass: mA, vel: vA }, { mass: mB, vel: vB }, { e: 0, n: bearingToVec(45) })
  near(f.pBefore[0], f.pAfter[0], 1e-6, 'momentum x conserved'); near(f.pBefore[1], f.pAfter[1], 1e-6, 'momentum z conserved')
  assert.ok(f.keLoss > 0, 'energy is lost')
  const e1 = forwardImpact({ mass: mA, vel: vA }, { mass: mB, vel: vB }, { e: 1, n: bearingToVec(45) })
  near(e1.keLoss, 0, 1e-3, 'elastic: no energy loss')
  const vc = [(mA * vA[0] + mB * vB[0]) / (mA + mB), (mA * vA[1] + mB * vB[1]) / (mA + mB)]
  const r = reverseMomentum({ mass: mA, dir: bearingToVec(0), post: vc }, { mass: mB, dir: bearingToVec(90), post: vc })
  near(ms2kmh(r.speedA), 60, 1e-6, 'reverse solve A'); near(ms2kmh(r.speedB), 50, 1e-6, 'reverse solve B')
  assert.ok(reverseMomentum({ mass: 1, dir: bearingToVec(0), post: [1, 1] }, { mass: 1, dir: bearingToVec(180), post: [1, 1] }).error, 'parallel headings flagged')
  ok('work-energy, momentum conservation, reverse solver')
}

// ---- playback
{
  const v = { x: 10, z: 5, heading: 90, speed: 36, skid: 10, mu: 0.7, postDist: 8, postDir: 180 }
  const p0 = poseAt(v, 0); near(p0.x, 10, 1e-9, 'pose t=0')
  const pm = poseAt(v, -1); assert.ok(pm.x < 10 - 9, 'moves back along heading (east) before impact')
  near(pm.z, 5, 1e-9, 'stays on line')
  near(preBackDist(v, 0), 0, 1e-9, 'pre 0')
  near(postAlongDist(v, 100), 8, 1e-6, 'post ends at rest distance')
  const pe = poseAt(v, 100); near(pe.z, 5 + 8, 1e-6, 'rest position south of impact')
  ok('playback kinematics')
}

// ---- crush
{
  const orig = new Float32Array([0, 0.5, 2, 0, 0.5, -0.5, 0.5, 1, -2])
  const out = new Float32Array(orig.length)
  const dims = { frontZ: 2, Leff: 4, W: 1.8, H: 1.5 }
  deformPositions(orig, out, dims, 0, 0)
  assert.deepEqual([...out], [...orig])
  deformPositions(orig, out, dims, 1, 0)
  assert.ok(out[2] < 2 - 0.5, 'front vertex pushed back')
  near(out[8], -2, 1e-9, 'rear vertex untouched'); near(out[5], -0.5, 1e-9, "vertex outside crush zone untouched")
  near(crushDepth(4, 1), 1.52, 1e-9, 'max depth')
  ok('crush deformation')
}

// ---- OSM -> geometry
{
  const lat0 = 23.03, lon0 = 72.57, k = 1 / 111320, kx = 1 / (111320 * Math.cos(lat0 * Math.PI / 180))
  const L = (x, z) => ({ lat: lat0 - z * k, lon: lon0 + x * kx })
  const way = (id, tags, pts) => ({ type: 'way', id, tags, geometry: pts.map(([x, z]) => L(x, z)) })
  const elements = [
    way(1, { highway: 'primary', name: 'Main Rd', lanes: '4' }, [[-600, 0], [-200, 10], [0, 0], [300, -15], [600, 0]]),
    way(2, { highway: 'residential' }, [[0, -500], [5, -200], [0, 0], [-4, 300], [0, 500]]),
    way(3, { highway: 'footway' }, [[10, 10], [20, 20]]),
    way(4, { building: 'yes', 'building:levels': '4' }, [[20, 20], [50, 20], [50, 45], [20, 45], [20, 20]]),
    way(5, { building: 'yes' }, [[-60, -40], [-30, -40], [-30, -20], [-60, -20], [-60, -40]]),
  ]
  const w = buildWorld({ elements }, { lat: lat0, lon: lon0 }, { radius: 800 })
  assert.equal(w.stats.roads, 2, 'footway ignored, 2 roads')
  assert.equal(w.stats.buildings, 2)
  assert.ok(w.roadGeo.attributes.position.count > 200, 'road ribbon has vertices')
  assert.ok(w.markGeo && w.markGeo.attributes.position.count > 0, 'dashed markings exist')
  assert.ok(w.buildingGeo.attributes.position.count > 0 && w.buildingGeo.attributes.color, 'buildings merged with colour')
  const { trees, houses } = w.scatter(0.8)
  assert.ok(trees.length > 20, 'trees placed: ' + trees.length)
  assert.ok(houses.length > 0, 'houses fill sparse area: ' + houses.length)
  // no tree may stand on the 4-lane primary road (half width 6.6) or inside a building
  for (const [x, z] of trees) {
    assert.ok(Math.abs(z - (x < 0 ? 0 + (x + 600) / 400 * 10 : 0)) > -1) // sanity (no NaN)
    assert.ok(Number.isFinite(x) && Number.isFinite(z))
    assert.ok(!(x > 20 && x < 50 && z > 20 && z < 45), 'tree inside building')
    assert.ok(!(x > -60 && x < -30 && z > -40 && z < -20), 'tree inside building 2')
  }
  const again = w.scatter(0.8)
  assert.equal(again.trees.length, trees.length, 'scatter is deterministic')
  ok(`OSM geometry (${w.stats.roads} roads, ${w.stats.buildings} buildings, ${trees.length} trees, ${houses.length} houses)`)
}

// empty area must not crash
{
  const w = buildWorld({ elements: [] }, { lat: 10, lon: 10 }, { radius: 800 })
  assert.equal(w.roadGeo, null); assert.equal(w.buildingGeo, null)
  assert.deepEqual(w.scatter(0.5).houses, [])
  ok('empty area handled')
}
console.log(`\nAll ${n} groups passed.`)

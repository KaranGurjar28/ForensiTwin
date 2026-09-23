// OpenStreetMap JSON -> merged three.js geometries + collision-aware vegetation.
// Everything is merged into a handful of draw calls so it stays fast on phones.

import * as THREE from 'three'
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js'
import { makeProjector, mulberry32, clamp } from './geo.js'

const ROAD = {
  motorway: { w: 14, rank: 6 }, motorway_link: { w: 7, rank: 5 },
  trunk: { w: 12, rank: 6 }, trunk_link: { w: 7, rank: 5 },
  primary: { w: 11, rank: 5 }, primary_link: { w: 6.5, rank: 4 },
  secondary: { w: 9, rank: 4 }, secondary_link: { w: 6, rank: 3 },
  tertiary: { w: 8, rank: 3 }, tertiary_link: { w: 6, rank: 3 },
  unclassified: { w: 6.5, rank: 2 }, residential: { w: 6.5, rank: 2 },
  road: { w: 6, rank: 2 }, living_street: { w: 5, rank: 1 }, service: { w: 4, rank: 1 },
}

const WALLS = ['#c9b8a3', '#b8a99a', '#d6cfc4', '#a89f91', '#cbbfae', '#9aa3a8', '#c2a48a', '#b5b0a6', '#d8c7b0']
const LAYER_Y = { shoulder: 0.02, road: 0.04, mark: 0.06 }

// ---------------------------------------------------------------- parsing

function clipRuns(pts, R) {
  const R2 = R * R
  const runs = []
  let cur = []
  for (const p of pts) {
    if (p[0] * p[0] + p[1] * p[1] <= R2) cur.push(p)
    else {
      if (cur.length > 1) runs.push(cur)
      cur = []
    }
  }
  if (cur.length > 1) runs.push(cur)
  return runs
}

function centroid(pts) {
  let x = 0, z = 0
  for (const p of pts) { x += p[0]; z += p[1] }
  return [x / pts.length, z / pts.length]
}

export function parseOsm(json, proj, radius) {
  const roads = []
  const buildings = []
  for (const el of json.elements || []) {
    if (el.type !== 'way' || !el.geometry || el.geometry.length < 2) continue
    const tags = el.tags || {}
    const pts = el.geometry.map((g) => proj.toLocal(g.lat, g.lon))
    if (tags.highway) {
      const cls = ROAD[tags.highway]
      if (!cls) continue
      let w = cls.w
      const lanes = parseInt(tags.lanes, 10)
      if (lanes > 0) w = clamp(lanes * 3.3, 3, 32)
      const oneway = tags.oneway === 'yes' || tags.junction === 'roundabout'
      for (const run of clipRuns(pts, radius * 1.35)) {
        roads.push({ id: el.id, pts: run, width: w, rank: cls.rank, oneway, name: tags.name })
      }
    } else if (tags.building) {
      let poly = pts
      const f = poly[0], l = poly[poly.length - 1]
      if (f[0] === l[0] && f[1] === l[1]) poly = poly.slice(0, -1)
      if (poly.length < 3) continue
      const c = centroid(poly)
      if (Math.hypot(c[0], c[1]) > radius * 1.15) continue
      const rnd = mulberry32(el.id)
      let h = parseFloat(tags.height)
      if (!(h > 0)) {
        const lv = parseFloat(tags['building:levels'])
        h = lv > 0 ? lv * 3.2 : 6 + rnd() * 8
      }
      buildings.push({ id: el.id, pts: poly, height: clamp(h, 3, 180), c, dist: Math.hypot(c[0], c[1]) })
    }
  }
  buildings.sort((a, b) => a.dist - b.dist)
  return { roads, buildings: buildings.slice(0, 1800) }
}

// ---------------------------------------------------------------- roads

function smoothLine(pts, spacing = 2) {
  const clean = [pts[0]]
  for (let i = 1; i < pts.length; i++) {
    const p = clean[clean.length - 1]
    if (Math.hypot(pts[i][0] - p[0], pts[i][1] - p[1]) > 0.05) clean.push(pts[i])
  }
  if (clean.length < 2) return null
  const curve = new THREE.CatmullRomCurve3(
    clean.map((p) => new THREE.Vector3(p[0], 0, p[1])),
    false,
    'centripetal',
  )
  const len = curve.getLength()
  const n = clamp(Math.ceil(len / spacing), 2, 1500)
  return curve.getSpacedPoints(n).map((p) => [p.x, p.z])
}

function addRibbon(acc, pts, width, y) {
  if (pts.length < 2) return
  const hw = width / 2
  const base = acc.pos.length / 3
  for (let i = 0; i < pts.length; i++) {
    const a = pts[Math.max(0, i - 1)]
    const b = pts[Math.min(pts.length - 1, i + 1)]
    let tx = b[0] - a[0], tz = b[1] - a[1]
    const l = Math.hypot(tx, tz) || 1
    tx /= l; tz /= l
    const nx = -tz, nz = tx
    acc.pos.push(pts[i][0] - nx * hw, y, pts[i][1] - nz * hw, pts[i][0] + nx * hw, y, pts[i][1] + nz * hw)
    if (i > 0) {
      const k = base + (i - 1) * 2
      acc.idx.push(k, k + 1, k + 2, k + 1, k + 3, k + 2)
    }
  }
}

function accToGeometry(acc) {
  if (!acc.pos.length) return null
  const g = new THREE.BufferGeometry()
  g.setAttribute('position', new THREE.Float32BufferAttribute(acc.pos, 3))
  const n = new Float32Array(acc.pos.length)
  for (let i = 1; i < n.length; i += 3) n[i] = 1
  g.setAttribute('normal', new THREE.BufferAttribute(n, 3))
  g.setIndex(acc.idx)
  g.computeBoundingSphere()
  return g
}

// ---------------------------------------------------------------- spatial hash + tests

class Grid {
  constructor(cell) { this.c = cell; this.m = new Map() }
  k(i, j) { return i + ',' + j }
  add(x, z, item) {
    const key = this.k(Math.floor(x / this.c), Math.floor(z / this.c))
    const a = this.m.get(key)
    if (a) a.push(item); else this.m.set(key, [item])
  }
  addBox(x0, z0, x1, z1, item) {
    for (let i = Math.floor(x0 / this.c); i <= Math.floor(x1 / this.c); i++)
      for (let j = Math.floor(z0 / this.c); j <= Math.floor(z1 / this.c); j++) {
        const key = this.k(i, j)
        const a = this.m.get(key)
        if (a) a.push(item); else this.m.set(key, [item])
      }
  }
  near(x, z, ring = 1) {
    const ci = Math.floor(x / this.c), cj = Math.floor(z / this.c)
    const out = []
    for (let i = ci - ring; i <= ci + ring; i++)
      for (let j = cj - ring; j <= cj + ring; j++) {
        const a = this.m.get(this.k(i, j))
        if (a) for (const it of a) out.push(it)
      }
    return out
  }
}

function pointInPoly(x, z, poly) {
  let inside = false
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const xi = poly[i][0], zi = poly[i][1], xj = poly[j][0], zj = poly[j][1]
    if (zi > z !== zj > z && x < ((xj - xi) * (z - zi)) / (zj - zi) + xi) inside = !inside
  }
  return inside
}

function distToSeg(px, pz, ax, az, bx, bz) {
  const dx = bx - ax, dz = bz - az
  const l2 = dx * dx + dz * dz
  let t = l2 ? ((px - ax) * dx + (pz - az) * dz) / l2 : 0
  t = clamp(t, 0, 1)
  return Math.hypot(px - (ax + t * dx), pz - (az + t * dz))
}

function distToPoly(px, pz, poly) {
  let d = Infinity
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    d = Math.min(d, distToSeg(px, pz, poly[j][0], poly[j][1], poly[i][0], poly[i][1]))
  }
  return d
}

// ---------------------------------------------------------------- main builder

export function buildWorld(json, { lat, lon }, { radius = 800 } = {}) {
  const proj = makeProjector(lat, lon)
  const { roads, buildings } = parseOsm(json, proj, radius)

  // --- roads
  const shoulder = { pos: [], idx: [] }
  const asphalt = { pos: [], idx: [] }
  const marks = { pos: [], idx: [] }
  const lines = []
  const roadGrid = new Grid(20)
  for (const r of roads) {
    const sm = smoothLine(r.pts, 2)
    if (!sm) continue
    const rankLift = r.rank * 0.0005
    addRibbon(shoulder, sm, r.width + 1.6, LAYER_Y.shoulder)
    addRibbon(asphalt, sm, r.width, LAYER_Y.road + rankLift)
    if (!r.oneway && r.width >= 6 && r.rank >= 2) {
      // dashed centre line, trimmed near the ends so it does not run through junctions
      for (let s = 3; s + 2 < sm.length - 3; s += 5) addRibbon(marks, sm.slice(s, s + 3), 0.16, LAYER_Y.mark)
    }
    const line = { pts: sm, hw: r.width / 2, rank: r.rank }
    lines.push(line)
    for (let i = 0; i < sm.length - 1; i++) {
      const mx = (sm[i][0] + sm[i + 1][0]) / 2, mz = (sm[i][1] + sm[i + 1][1]) / 2
      roadGrid.add(mx, mz, [sm[i][0], sm[i][1], sm[i + 1][0], sm[i + 1][1], line.hw])
    }
  }

  // --- buildings
  const bGrid = new Grid(40)
  const bGeos = []
  buildings.forEach((b, idx) => {
    const shape = new THREE.Shape()
    b.pts.forEach((p, i) => (i ? shape.lineTo(p[0], -p[1]) : shape.moveTo(p[0], -p[1])))
    let g
    try {
      g = new THREE.ExtrudeGeometry(shape, { depth: b.height, bevelEnabled: false })
    } catch {
      return
    }
    g.rotateX(-Math.PI / 2)
    g.deleteAttribute('uv')
    g.clearGroups()
    const col = new THREE.Color(WALLS[b.id % WALLS.length])
    const n = g.attributes.position.count
    const arr = new Float32Array(n * 3)
    for (let i = 0; i < n; i++) { arr[i * 3] = col.r; arr[i * 3 + 1] = col.g; arr[i * 3 + 2] = col.b }
    g.setAttribute('color', new THREE.BufferAttribute(arr, 3))
    bGeos.push(g)
    let x0 = Infinity, z0 = Infinity, x1 = -Infinity, z1 = -Infinity
    for (const p of b.pts) { x0 = Math.min(x0, p[0]); x1 = Math.max(x1, p[0]); z0 = Math.min(z0, p[1]); z1 = Math.max(z1, p[1]) }
    bGrid.addBox(x0 - 4, z0 - 4, x1 + 4, z1 + 4, b)
  })
  const buildingGeo = bGeos.length ? mergeGeometries(bGeos, false) : null
  bGeos.forEach((g) => g.dispose())

  // --- collision helpers for scattering
  const roadClear = (x, z, margin) => {
    for (const s of roadGrid.near(x, z, 1)) {
      if (distToSeg(x, z, s[0], s[1], s[2], s[3]) < s[4] + margin) return false
    }
    return true
  }
  const buildingClear = (x, z, margin) => {
    for (const b of bGrid.near(x, z, 0)) {
      if (pointInPoly(x, z, b.pts) || distToPoly(x, z, b.pts) < margin) return false
    }
    return true
  }

  function scatter(density = 0.6, seedOffset = 0) {
    const rnd = mulberry32(Math.floor(Math.abs(lat * 1e4 + lon * 1e4)) + seedOffset)
    // trees: half along avenues, half scattered in open ground
    const trees = []
    const treeGrid = new Grid(5)
    const maxTrees = Math.round(900 * density)
    const avenueLines = lines.filter((l) => l.rank <= 4 && l.pts.length > 2)
    for (let tries = 0; tries < maxTrees * 5 && trees.length < maxTrees; tries++) {
      let x, z
      if (avenueLines.length && rnd() < 0.55) {
        const l = avenueLines[Math.floor(rnd() * avenueLines.length)]
        const i = 1 + Math.floor(rnd() * (l.pts.length - 2))
        const a = l.pts[i - 1], b = l.pts[i + 1]
        let tx = b[0] - a[0], tz = b[1] - a[1]
        const len = Math.hypot(tx, tz) || 1
        tx /= len; tz /= len
        const side = rnd() < 0.5 ? -1 : 1
        const off = l.hw + 2.2 + rnd() * 3.5
        x = l.pts[i][0] - tz * off * side
        z = l.pts[i][1] + tx * off * side
      } else {
        const a = rnd() * Math.PI * 2, r = Math.sqrt(rnd()) * radius * 0.85
        x = Math.cos(a) * r; z = Math.sin(a) * r
      }
      if (!roadClear(x, z, 1.6) || !buildingClear(x, z, 2.5)) continue
      if (treeGrid.near(x, z, 1).some((t) => Math.hypot(t[0] - x, t[1] - z) < 3.6)) continue
      const t = [x, z, 0.8 + rnd() * 0.9, rnd() * Math.PI * 2]
      trees.push(t)
      treeGrid.add(x, z, t)
    }

    // houses: only fill in when OSM has few buildings (rural / poorly mapped areas)
    const houses = []
    if (buildings.length < 30) {
      const hLines = lines.filter((l) => l.rank <= 3 && l.pts.length > 2)
      const hGrid = new Grid(15)
      for (let tries = 0; tries < 600 && houses.length < 90 && hLines.length; tries++) {
        const l = hLines[Math.floor(rnd() * hLines.length)]
        const i = 1 + Math.floor(rnd() * (l.pts.length - 2))
        const a = l.pts[i - 1], b = l.pts[i + 1]
        let tx = b[0] - a[0], tz = b[1] - a[1]
        const len = Math.hypot(tx, tz) || 1
        tx /= len; tz /= len
        const side = rnd() < 0.5 ? -1 : 1
        const w = 6 + rnd() * 5, d = 6 + rnd() * 4, h = 3 + rnd() * 3
        const off = l.hw + 6 + rnd() * 5 + d / 2
        const x = l.pts[i][0] - tz * off * side
        const z = l.pts[i][1] + tx * off * side
        const rot = Math.atan2(-tz, tx)
        const corners = [[0, 0], [w / 2, d / 2], [-w / 2, d / 2], [w / 2, -d / 2], [-w / 2, -d / 2]].map(([cx, cz]) => [
          x + cx * Math.cos(rot) + cz * Math.sin(rot),
          z - cx * Math.sin(rot) + cz * Math.cos(rot),
        ])
        if (!corners.every((p) => roadClear(p[0], p[1], 3) && buildingClear(p[0], p[1], 1))) continue
        if (hGrid.near(x, z, 1).some((o) => Math.hypot(o.x - x, o.z - z) < 11)) continue
        const house = { x, z, w, d, h, rot, color: WALLS[Math.floor(rnd() * WALLS.length)] }
        houses.push(house)
        hGrid.add(x, z, house)
      }
      // drop trees that landed inside a house footprint
      for (let i = trees.length - 1; i >= 0; i--) {
        if (houses.some((h) => Math.hypot(h.x - trees[i][0], h.z - trees[i][1]) < Math.max(h.w, h.d) * 0.75 + 1)) trees.splice(i, 1)
      }
    }
    return { trees, houses }
  }

  return {
    proj,
    roadGeo: accToGeometry(asphalt),
    shoulderGeo: accToGeometry(shoulder),
    markGeo: accToGeometry(marks),
    buildingGeo,
    scatter,
    stats: { roads: roads.length, buildings: buildings.length },
    roadNames: [...new Set(roads.map((r) => r.name).filter(Boolean))].slice(0, 8),
  }
}

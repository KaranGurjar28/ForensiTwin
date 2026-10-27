// Procedural vehicle models. Every part is built directly in vehicle-local space
// (+Z forward, +Y up, origin on the ground at the centre) so the crush function can
// deform all of them consistently. Wheels and people stay rigid.

import * as THREE from 'three'
import { CATALOG } from './catalog.js'

const seg = (v, k) => Math.max(1, Math.round(v * k))

function box(w, h, l, x = 0, y = 0, z = 0, k = [4, 4, 6]) {
  const g = new THREE.BoxGeometry(w, h, l, seg(w, k[0]), seg(h, k[1]), seg(l, k[2]))
  g.translate(x, y, z)
  return g
}
function wheel(r, wd, x, z) {
  const g = new THREE.CylinderGeometry(r, r, wd, 20)
  g.rotateZ(Math.PI / 2)
  g.translate(x, r, z)
  return g
}
function cyl(rt, rb, h, x, y, z, segs = 14) {
  const g = new THREE.CylinderGeometry(rt, rb, h, segs, 3)
  g.translate(x, y, z)
  return g
}
function ball(r, x, y, z) {
  const g = new THREE.SphereGeometry(r, 14, 10)
  g.translate(x, y, z)
  return g
}
function taper(g, { front = 0.25, rear = 0.12, side = 0.1 }) {
  g.computeBoundingBox()
  const bb = g.boundingBox
  const hy = (bb.max.y - bb.min.y) / 2, cy = (bb.max.y + bb.min.y) / 2
  const hz = (bb.max.z - bb.min.z) / 2, cz = (bb.max.z + bb.min.z) / 2
  const p = g.attributes.position
  for (let i = 0; i < p.count; i++) {
    const k = Math.max(0, (p.getY(i) - cy) / hy)
    const rel = (p.getZ(i) - cz) / hz
    p.setZ(i, cz + (p.getZ(i) - cz) * (1 - (rel > 0 ? front : rear) * k))
    p.setX(i, p.getX(i) * (1 - side * k))
  }
  p.needsUpdate = true
  g.computeVertexNormals()
  return g
}

const P = (geo, mat, deform = true) => ({ geo, mat, deform })

function buildCar(s, type = 'hatch_m') {
  const { L, W, H } = s
  const clear = 0.2
  const bodyTop = H * 0.55
  const bodyH = bodyTop - clear
  const cabinH = Math.max(0.42, H - bodyTop)
  const cabinL = L * (s.cabin ?? 0.56)
  const cabinZ = -L * 0.05
  const roofH = Math.max(0.08, H * 0.075)
  const paneY = bodyTop + cabinH * 0.52
  const paneH = Math.max(0.18, cabinH * 0.62)
  const sidePaneL = cabinL * 0.72
  const pillarW = Math.max(0.055, W * 0.035)
  const parts = [
    // Main body and roof are separate so the glass area is not an opaque black block.
    P(box(W, bodyH, L, 0, clear + bodyH / 2, 0, [4, 4, 6]), 'body'),
    P(box(W * 0.84, roofH, cabinL * 0.72, 0, H - roofH / 2, cabinZ - cabinL * 0.02, [4, 2, 5]), 'body', false),
    // Front and rear windscreens (thin, translucent panes).
    P(box(W * 0.70, paneH, 0.025, 0, paneY + cabinH * 0.04, cabinZ + cabinL * 0.39, [4, 3, 1]), 'glass', false),
    P(box(W * 0.68, paneH * 0.92, 0.025, 0, paneY, cabinZ - cabinL * 0.39, [4, 3, 1]), 'glass', false),
    // Side windows are transparent panels on both sides, split into front/rear sections.
    ...[-1, 1].flatMap((sx) => [
      P(box(0.022, paneH * 0.9, sidePaneL * 0.47, sx * W * 0.405, paneY, cabinZ + cabinL * 0.13, [1, 3, 4]), 'glass', false),
      P(box(0.022, paneH * 0.9, sidePaneL * 0.42, sx * W * 0.405, paneY, cabinZ - cabinL * 0.22, [1, 3, 4]), 'glass', false),
      P(box(pillarW, cabinH * 0.88, pillarW, sx * W * 0.405, bodyTop + cabinH * 0.45, cabinZ + cabinL * 0.43, [1, 3, 1]), 'body', false),
      P(box(pillarW, cabinH * 0.88, pillarW, sx * W * 0.405, bodyTop + cabinH * 0.45, cabinZ - cabinL * 0.42, [1, 3, 1]), 'body', false),
      P(box(pillarW * 0.8, cabinH * 0.86, pillarW, sx * W * 0.405, bodyTop + cabinH * 0.44, cabinZ - cabinL * 0.04, [1, 3, 1]), 'body', false),
    ]),
    // Cabin interior: dashboard, steering wheel, front seats and visible seated occupants.
    P(box(W * 0.72, 0.12, 0.22, 0, bodyTop + 0.12, cabinZ + cabinL * 0.30, [3, 2, 2]), 'interior', false),
    P(box(W * 0.12, 0.07, 0.08, -W * 0.20, bodyTop + 0.16, cabinZ + cabinL * 0.31, [2, 1, 1]), 'dark', false),
    P(new THREE.TorusGeometry(0.105, 0.018, 6, 14).rotateY(Math.PI / 2).translate(-W * 0.22, bodyTop + 0.30, cabinZ + cabinL * 0.30), 'dark', false),
    ...[-1, 1].flatMap((sx) => {
      const seatX = sx * W * 0.19
      const seatZ = cabinZ + cabinL * 0.02
      const headX = seatX
      return [
        P(box(W * 0.17, 0.16, 0.18, seatX, bodyTop + 0.18, seatZ, [2, 2, 2]), 'seat', false),
        P(box(W * 0.17, 0.27, 0.07, seatX, bodyTop + 0.36, seatZ - 0.045, [2, 3, 1]), 'seat', false),
        P(cyl(0.065, 0.075, 0.24, headX, bodyTop + 0.40, seatZ + 0.12, 10), 'clothes', false),
        P(ball(0.075, headX, Math.min(H - 0.16, bodyTop + 0.57), seatZ + 0.13), 'skin', false),
        P(box(0.055, 0.20, 0.055, headX - 0.085, bodyTop + 0.32, seatZ + 0.13, [1, 2, 1]), 'clothes', false),
        P(box(0.055, 0.20, 0.055, headX + 0.085, bodyTop + 0.32, seatZ + 0.13, [1, 2, 1]), 'clothes', false),
      ]
    }),
    P(box(W * 1.02, 0.16, 0.14, 0, clear + 0.14, L / 2 - 0.05, [4, 2, 1]), 'dark'),
    P(box(W * 1.02, 0.16, 0.14, 0, clear + 0.14, -L / 2 + 0.05, [4, 2, 1]), 'dark'),
    P(box(W * 0.42, 0.13, 0.05, 0, clear + bodyH * 0.6, L / 2 + 0.01, [4, 1, 1]), 'dark'),
    P(box(W * 0.2, 0.12, 0.05, -W * 0.34, clear + bodyH * 0.72, L / 2 + 0.01, [2, 1, 1]), 'headlight'),
    P(box(W * 0.2, 0.12, 0.05, W * 0.34, clear + bodyH * 0.72, L / 2 + 0.01, [2, 1, 1]), 'headlight'),
    P(box(W * 0.2, 0.12, 0.05, -W * 0.34, clear + bodyH * 0.72, -L / 2 - 0.01, [2, 1, 1]), 'tail'),
    P(box(W * 0.2, 0.12, 0.05, W * 0.34, clear + bodyH * 0.72, -L / 2 - 0.01, [2, 1, 1]), 'tail'),
  ]
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) parts.push(P(wheel(rWheel(s), 0.22, sx * (W / 2 - 0.09), sz * L * 0.32), 'dark', false))

  // Body-specific silhouettes so the catalogue doesn't render every road car as the same shape.
  if (type === 'sedan') {
    parts.push(P(box(W * 0.88, 0.22, L * 0.22, 0, bodyTop * 0.82, -L * 0.34, [3, 2, 3]), 'body'))
    parts.push(P(box(W * 0.84, 0.14, L * 0.2, 0, clear + bodyH * 0.52, L * 0.34, [3, 2, 2]), 'body'))
  } else if (type === 'suv') {
    parts.push(P(box(W * 0.88, 0.08, cabinL * 0.76, 0, H + 0.035, cabinZ, [3, 1, 4]), 'dark', false))
    for (const sx of [-1, 1]) parts.push(P(box(0.045, 0.06, cabinL * 0.78, sx * W * 0.34, H + 0.08, cabinZ, [1, 1, 4]), 'accent', false))
    parts.push(P(box(W * 1.015, 0.16, L * 0.72, 0, 0.29, 0, [3, 1, 4]), 'dark', false))
  } else if (type === 'van') {
    parts.push(P(box(W * 0.94, cabinH * 0.8, cabinL * 0.62, 0, bodyTop + cabinH * 0.44, cabinZ - cabinL * 0.08, [3, 3, 4]), 'body', false))
    parts.push(P(box(W * 0.73, cabinH * 0.55, 0.025, 0, bodyTop + cabinH * 0.48, cabinZ + cabinL * 0.31, [3, 2, 1]), 'glass', false))
  } else if (type === 'pickup') {
    // Open cargo bed with a visible floor and raised rails behind the passenger cabin.
    const bedZ = -L * 0.31
    parts.push(P(box(W * 0.78, 0.08, L * 0.34, 0, bodyTop + 0.07, bedZ, [2, 1, 3]), 'cargo', false))
    for (const sx of [-1, 1]) parts.push(P(box(0.08, 0.34, L * 0.36, sx * W * 0.43, bodyTop + 0.22, bedZ, [1, 2, 3]), 'body', false))
    parts.push(P(box(W * 0.86, 0.32, 0.08, 0, bodyTop + 0.21, bedZ - L * 0.18, [2, 2, 1]), 'body', false))
  } else if (type === 'hatch_s' || type === 'hatch_m') {
    parts.push(P(box(W * 0.84, 0.12, L * 0.12, 0, bodyTop * 0.96, -L * 0.39, [3, 1, 2]), 'body'))
  }
  return parts
}

function rWheel(s) { return s.high ? 0.36 : 0.31 }

function buildTruck(s) {
  const { L, W } = s
  const parts = [
    P(box(W * 0.85, 0.35, L * 0.96, 0, 0.62, 0, [2, 2, 3]), 'dark'),
    P(box(W, 2.0, 2.1, 0, 0.8 + 1.0, L / 2 - 1.1, [3, 3, 4]), 'accent'),
    P(box(W * 0.92, 0.85, 0.06, 0, 2.15, L / 2 + 0.02, [3, 3, 1]), 'glass'),
    P(box(W * 1.02, 0.25, 0.2, 0, 0.9, L / 2 - 0.02, [3, 2, 1]), 'dark'),
    P(box(W * 0.18, 0.16, 0.05, -W * 0.36, 1.05, L / 2 + 0.03, [2, 1, 1]), 'headlight'),
    P(box(W * 0.18, 0.16, 0.05, W * 0.36, 1.05, L / 2 + 0.03, [2, 1, 1]), 'headlight'),
    P(box(W, 2.4, L - 3.1, 0, 0.85 + 1.2, -L / 2 + (L - 3.1) / 2, [2, 2, 2]), 'cargo'),
    P(box(W * 0.2, 0.16, 0.05, -W * 0.36, 1.05, -L / 2 - 0.02, [2, 1, 1]), 'tail'),
    P(box(W * 0.2, 0.16, 0.05, W * 0.36, 1.05, -L / 2 - 0.02, [2, 1, 1]), 'tail'),
  ]
  for (const sx of [-1, 1]) {
    parts.push(P(wheel(0.5, 0.3, sx * (W / 2 - 0.12), L / 2 - 1.3), 'dark', false))
    parts.push(P(wheel(0.5, 0.3, sx * (W / 2 - 0.12), -L / 2 + 1.5), 'dark', false))
    parts.push(P(wheel(0.5, 0.3, sx * (W / 2 - 0.12), -L / 2 + 2.8), 'dark', false))
  }
  return parts
}

function buildRickshaw(s) {
  const { L, W, H } = s
  const parts = [
    P(box(W * 0.95, 0.5, L * 0.62, 0, 0.6, -0.35, [3, 3, 4]), 'body'),
    P(box(W * 0.6, 0.75, 0.75, 0, 0.72, L / 2 - 0.5, [3, 3, 4]), 'body'),
    P(box(W * 0.85, 0.16, 0.6, 0, 0.92, -0.6, [3, 1, 3]), 'dark'),
    P(box(W * 0.78, 0.55, 0.05, 0, 1.3, L / 2 - 0.8, [3, 3, 1]), 'glass'),
    P(box(W * 1.02, 0.06, L * 0.78, 0, H - 0.03, -0.18, [3, 1, 5]), 'dark'),
    P(box(0.06, H - 0.9, 0.06, -W * 0.46, 0.9 + (H - 0.9) / 2, -0.95, [1, 3, 1]), 'body'),
    P(box(0.06, H - 0.9, 0.06, W * 0.46, 0.9 + (H - 0.9) / 2, -0.95, [1, 3, 1]), 'body'),
    P(box(0.06, H - 0.9, 0.06, -W * 0.4, 0.9 + (H - 0.9) / 2, 0.42, [1, 3, 1]), 'body'),
    P(box(0.06, H - 0.9, 0.06, W * 0.4, 0.9 + (H - 0.9) / 2, 0.42, [1, 3, 1]), 'body'),
    P(box(0.22, 0.16, 0.06, 0, 0.98, L / 2 - 0.1, [1, 1, 1]), 'headlight'),
    P(box(0.5, 0.06, 0.06, 0, 1.15, L / 2 - 0.65, [2, 1, 1]), 'dark'),
    P(box(0.3, 0.1, 0.05, 0, 0.75, -L / 2 - 0.02, [1, 1, 1]), 'tail'),
    P(wheel(0.25, 0.14, 0, L / 2 - 0.45), 'dark', false),
    P(wheel(0.25, 0.14, -(W / 2 - 0.08), -L / 2 + 0.5), 'dark', false),
    P(wheel(0.25, 0.14, W / 2 - 0.08, -L / 2 + 0.5), 'dark', false),
  ]
  return parts
}

function buildMoto() {
  return [
    P(box(0.2, 0.3, 1.0, 0, 0.55, -0.1, [4, 3, 5]), 'dark'),
    P(box(0.3, 0.25, 0.42, 0, 0.86, 0.15, [3, 3, 4]), 'body'),
    P(box(0.26, 0.1, 0.55, 0, 0.8, -0.38, [3, 1, 4]), 'dark'),
    P(box(0.07, 0.62, 0.07, 0, 0.62, 0.66, [1, 3, 1]), 'dark'),
    P(box(0.62, 0.05, 0.05, 0, 1.02, 0.58, [4, 1, 1]), 'dark'),
    P(box(0.15, 0.15, 0.08, 0, 0.92, 0.74, [2, 2, 1]), 'headlight'),
    P(box(0.14, 0.08, 0.05, 0, 0.82, -0.86, [2, 1, 1]), 'tail'),
    P(wheel(0.32, 0.12, 0, 0.68), 'dark', false),
    P(wheel(0.32, 0.12, 0, -0.68), 'dark', false),
    P(cyl(0.17, 0.19, 0.55, 0, 1.22, -0.25), 'clothes', false),
    P(ball(0.115, 0, 1.64, -0.18), 'dark', false),
    P(box(0.34, 0.5, 0.26, 0, 0.82, -0.22, [2, 2, 2]), 'clothes', false),
  ]
}


function rodBetween(a, b, radius, mat) {
  const va = new THREE.Vector3(...a), vb = new THREE.Vector3(...b)
  const delta = vb.clone().sub(va)
  const geo = new THREE.CylinderGeometry(radius, radius, delta.length(), 8)
  // BufferGeometry has no quaternion property; rotate the vertices directly.
  const rotation = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), delta.clone().normalize())
  geo.applyQuaternion(rotation)
  geo.translate(...va.clone().add(vb).multiplyScalar(0.5).toArray())
  return P(geo, mat, false)
}

function buildBicycle(s) {
  const wheelRadius = 0.32
  const rear = [0, wheelRadius, -0.62]
  const front = [0, wheelRadius, 0.62]
  const crank = [0, 0.34, -0.02]
  const seat = [0, 0.82, -0.28]
  const head = [0, 0.76, 0.36]
  return [
    P(new THREE.TorusGeometry(wheelRadius, 0.035, 8, 20).rotateY(Math.PI / 2).translate(...rear), 'dark', false),
    P(new THREE.TorusGeometry(wheelRadius, 0.035, 8, 20).rotateY(Math.PI / 2).translate(...front), 'dark', false),
    rodBetween(rear, crank, 0.025, 'accent'),
    rodBetween(crank, front, 0.025, 'accent'),
    rodBetween(rear, seat, 0.025, 'accent'),
    rodBetween(seat, head, 0.025, 'accent'),
    rodBetween(head, crank, 0.025, 'accent'),
    rodBetween(seat, [0, 0.85, -0.48], 0.035, 'dark'),
    rodBetween(head, [0, 1.02, 0.42], 0.025, 'dark'),
    P(new THREE.BoxGeometry(0.24, 0.06, 0.08).translate(0, 0.87, -0.5), 'dark', false),
    P(new THREE.BoxGeometry(0.38, 0.035, 0.05).translate(0, 1.02, 0.42), 'dark', false),
  ]
}

function buildPerson() {
  return [
    P(box(0.14, 0.85, 0.16, -0.1, 0.425, 0, [1, 1, 1]), 'dark', false),
    P(box(0.14, 0.85, 0.16, 0.1, 0.425, 0, [1, 1, 1]), 'dark', false),
    P(cyl(0.2, 0.19, 0.65, 0, 1.17, 0), 'clothes', false),
    P(box(0.09, 0.6, 0.09, -0.28, 1.15, 0, [1, 1, 1]), 'clothes', false),
    P(box(0.09, 0.6, 0.09, 0.28, 1.15, 0, [1, 1, 1]), 'clothes', false),
    P(ball(0.12, 0, 1.62, 0), 'skin', false),
  ]
}

export function buildProcedural(type) {
  const s = CATALOG[type]
  if (!s) throw new Error(`Unknown ForensiTwin model type: ${type}`)
  let parts
  switch (s.kind) {
    case 'truck': parts = buildTruck(s); break
    case 'rickshaw': parts = buildRickshaw(s); break
    case 'moto': parts = buildMoto(s); break
    case 'person': parts = buildPerson(s); break
    case 'bicycle': parts = buildBicycle(s); break
    default: parts = buildCar(s, type)
  }
  for (const p of parts) {
    const position = p.geo?.attributes?.position
    if (!position || !position.array || position.array.length === 0) {
      p.geo?.dispose?.()
      throw new Error(`Invalid geometry generated for ${type}`)
    }
    for (let i = 0; i < position.array.length; i++) {
      if (!Number.isFinite(position.array[i])) {
        p.geo.dispose()
        throw new Error(`Non-finite geometry generated for ${type}`)
      }
    }
    p.orig = position.array.slice()
  }
  return parts
}

/** Flatten a loaded GLTF scene into crushable parts, normalised to real-world size. */
export function flattenGlb(scene, spec) {
  scene.updateMatrixWorld(true)
  const parts = []
  scene.traverse((o) => {
    if (!o.isMesh || !o.geometry) return
    const g = o.geometry.clone()
    g.applyMatrix4(o.matrixWorld)
    const rigid = /wheel|tyre|tire/i.test(o.name || '')
    parts.push({ geo: g, material: o.material, mat: 'body', deform: !rigid })
  })
  const box3 = new THREE.Box3()
  parts.forEach((p) => { p.geo.computeBoundingBox(); box3.union(p.geo.boundingBox) })
  const size = box3.getSize(new THREE.Vector3())
  const c = box3.getCenter(new THREE.Vector3())
  const rotate = size.x > size.z
  const len = rotate ? size.x : size.z
  const m = new THREE.Matrix4()
    .makeScale(spec.L / len, spec.L / len, spec.L / len)
    .multiply(new THREE.Matrix4().makeRotationY((rotate ? -Math.PI / 2 : 0) + (spec.glbFlip ? Math.PI : 0)))
    .multiply(new THREE.Matrix4().makeTranslation(-c.x, -box3.min.y, -c.z))
  for (const p of parts) {
    p.geo.applyMatrix4(m)
    p.orig = p.geo.attributes.position.array.slice()
  }
  return parts
}

export function makeMaterials(color) {
  return {
    body: new THREE.MeshStandardMaterial({ color, metalness: 0.35, roughness: 0.45 }),
    accent: new THREE.MeshStandardMaterial({ color, metalness: 0.3, roughness: 0.5 }),
    cargo: new THREE.MeshStandardMaterial({ color: '#d9dde2', roughness: 0.7 }),
    glass: new THREE.MeshPhysicalMaterial({ color: '#79b8d4', metalness: 0.05, roughness: 0.18, transparent: true, opacity: 0.28, transmission: 0.12, thickness: 0.04, depthWrite: false }),
    interior: new THREE.MeshStandardMaterial({ color: '#343a40', roughness: 0.82 }),
    seat: new THREE.MeshStandardMaterial({ color: '#20252b', roughness: 0.9 }),
    dark: new THREE.MeshStandardMaterial({ color: '#15181c', roughness: 0.85 }),
    headlight: new THREE.MeshStandardMaterial({ color: '#fff3c4', emissive: '#fff3c4', emissiveIntensity: 0.6 }),
    tail: new THREE.MeshStandardMaterial({ color: '#7a0f14', emissive: '#ff1a1a', emissiveIntensity: 0.5 }),
    skin: new THREE.MeshStandardMaterial({ color: '#c99a76', roughness: 0.8 }),
    clothes: new THREE.MeshStandardMaterial({ color, roughness: 0.85 }),
  }
}

/** eye position + look direction for the driver / witness camera */
export function eyeFor(v, pose) {
  const spec = CATALOG[v.type]
  const th = Math.PI - pose.bearing * (Math.PI / 180)
  const lx = spec.kind === 'person' ? 0 : -spec.W * 0.2 // right-hand drive: driver sits on the right
  const lz = spec.L * 0.05
  const c = Math.cos(th), s = Math.sin(th)
  return {
    pos: [pose.x + lx * c + lz * s, spec.eye, pose.z - lx * s + lz * c],
    dir: [Math.sin(th), 0, Math.cos(th)],
  }
}
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

function buildCar(s) {
  const { L, W, H } = s
  const clear = 0.2
  const bodyTop = H * 0.55
  const bodyH = bodyTop - clear
  const cabinH = H - bodyTop
  const cabinL = L * s.cabin
  const cabinZ = -L * 0.05
  const r = s.high ? 0.36 : 0.31
  const parts = [
    P(box(W, bodyH, L, 0, clear + bodyH / 2, 0, [4, 4, 6]), 'body'),
    P(taper(box(W * 0.9, cabinH, cabinL, 0, bodyTop + cabinH / 2, cabinZ, [4, 5, 6]), s.taper), 'glass'),
    P(box(W * 0.74, 0.05, cabinL * 0.62, 0, H - 0.015, cabinZ - 0.02, [4, 1, 4]), 'body'),
    P(box(W * 1.02, 0.16, 0.14, 0, clear + 0.14, L / 2 - 0.05, [4, 2, 1]), 'dark'),
    P(box(W * 1.02, 0.16, 0.14, 0, clear + 0.14, -L / 2 + 0.05, [4, 2, 1]), 'dark'),
    P(box(W * 0.42, 0.13, 0.05, 0, clear + bodyH * 0.6, L / 2 + 0.01, [4, 1, 1]), 'dark'),
    P(box(W * 0.2, 0.12, 0.05, -W * 0.34, clear + bodyH * 0.72, L / 2 + 0.01, [2, 1, 1]), 'headlight'),
    P(box(W * 0.2, 0.12, 0.05, W * 0.34, clear + bodyH * 0.72, L / 2 + 0.01, [2, 1, 1]), 'headlight'),
    P(box(W * 0.2, 0.12, 0.05, -W * 0.34, clear + bodyH * 0.72, -L / 2 - 0.01, [2, 1, 1]), 'tail'),
    P(box(W * 0.2, 0.12, 0.05, W * 0.34, clear + bodyH * 0.72, -L / 2 - 0.01, [2, 1, 1]), 'tail'),
  ]
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) parts.push(P(wheel(r, 0.22, sx * (W / 2 - 0.09), sz * L * 0.32), 'dark', false))
  return parts
}

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
  let parts
  switch (s.kind) {
    case 'truck': parts = buildTruck(s); break
    case 'rickshaw': parts = buildRickshaw(s); break
    case 'moto': parts = buildMoto(s); break
    case 'person': parts = buildPerson(s); break
    default: parts = buildCar(s)
  }
  for (const p of parts) p.orig = p.geo.attributes.position.array.slice()
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
    glass: new THREE.MeshStandardMaterial({ color: '#0d1620', metalness: 0.7, roughness: 0.12 }),
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

// Forensic physics helpers. SI units internally (m, s, kg); km/h at the UI boundary.
// These are first-order screening calculations - not a substitute for a qualified reconstruction.

import { bearingToVec, vecToBearing } from './geo.js'
import { crushDepth } from './crush.js'
import { CATALOG, crushDims } from './catalog.js'

export const G = 9.80665
export const kmh2ms = (v) => v / 3.6
export const ms2kmh = (v) => v * 3.6

/** Work-energy: speed lost while skidding distance d.  v = sqrt(2 g (mu*eff + grade) d) */
export function skidSpeed(d, mu, gradePct = 0, eff = 1) {
  const f = mu * eff + gradePct / 100
  if (d <= 0 || f <= 0) return 0
  return Math.sqrt(2 * G * f * d)
}

/** Campbell-style equivalent barrier speed from crush depth C (m). Indicative defaults. */
export const CAMPBELL = { b0: 2.2, b1: 23 }
export const crushEBS = (C, { b0, b1 } = CAMPBELL) => (C <= 0 ? 0 : b0 + b1 * C)

export const velOf = (speedMs, bearing) => {
  const [x, z] = bearingToVec(bearing)
  return [x * speedMs, z * speedMs]
}
const speedOfVec = (v) => Math.hypot(v[0], v[1])
const bearingOfVec = (v) => (speedOfVec(v) < 0.05 ? null : vecToBearing(v[0], v[1]))

/**
 * Two-body impact along a line of impact n (unit vector A -> B), coefficient of restitution e.
 * Momentum is conserved exactly; tangential velocity is unchanged (no friction, no spin).
 */
export function forwardImpact(A, B, { e = 0.2, n }) {
  const vr = [A.vel[0] - B.vel[0], A.vel[1] - B.vel[1]]
  const vn = vr[0] * n[0] + vr[1] * n[1]
  const KE = (m, v) => 0.5 * m * (v[0] ** 2 + v[1] ** 2)
  const before = KE(A.mass, A.vel) + KE(B.mass, B.vel)
  if (vn <= 0) return { separating: true }
  const J = ((1 + e) * vn) / (1 / A.mass + 1 / B.mass)
  const a = [A.vel[0] - (J / A.mass) * n[0], A.vel[1] - (J / A.mass) * n[1]]
  const b = [B.vel[0] + (J / B.mass) * n[0], B.vel[1] + (J / B.mass) * n[1]]
  const after = KE(A.mass, a) + KE(B.mass, b)
  const dv = (m, v0, v1) => Math.hypot(v1[0] - v0[0], v1[1] - v0[1])
  return {
    closing: vn,
    a: { speed: speedOfVec(a), bearing: bearingOfVec(a), dv: dv(A.mass, A.vel, a) },
    b: { speed: speedOfVec(b), bearing: bearingOfVec(b), dv: dv(B.mass, B.vel, b) },
    impulse: J,
    keLoss: before - after,
    keBefore: before,
    pBefore: [A.mass * A.vel[0] + B.mass * B.vel[0], A.mass * A.vel[1] + B.mass * B.vel[1]],
    pAfter: [A.mass * a[0] + B.mass * b[0], A.mass * a[1] + B.mass * b[1]],
  }
}

/**
 * Reverse momentum: known pre-impact directions + post-impact velocities -> pre-impact speeds.
 * Solves  mA*sA*dA + mB*sB*dB = mA*uA + mB*uB  (2 equations, 2 unknowns).
 */
export function reverseMomentum(A, B) {
  const P = [A.mass * A.post[0] + B.mass * B.post[0], A.mass * A.post[1] + B.mass * B.post[1]]
  const cross = A.dir[0] * B.dir[1] - B.dir[0] * A.dir[1]
  if (Math.abs(cross) < 0.05) {
    return {
      error: 'Pre-impact headings are almost parallel (head-on or rear-end). Momentum alone cannot separate the two speeds — measure one speed independently (skid or crush) and solve for the other.',
    }
  }
  const det = A.mass * B.mass * cross
  const sA = (P[0] * B.mass * B.dir[1] - B.mass * B.dir[0] * P[1]) / det
  const sB = (A.mass * A.dir[0] * P[1] - A.mass * A.dir[1] * P[0]) / det
  const warn = []
  if (sA < 0) warn.push('Vehicle A solves to a negative speed: its heading or post-impact direction is inconsistent.')
  if (sB < 0) warn.push('Vehicle B solves to a negative speed: its heading or post-impact direction is inconsistent.')
  return { speedA: sA, speedB: sB, warn, P }
}

// ---- playback kinematics -------------------------------------------------------------

/** distance behind the impact point, tau seconds before impact (decelerating through the skid) */
export function preBackDist(v, tau) {
  const vi = kmh2ms(v.speed)
  const a = v.mu * G
  if (v.skid <= 0 || a <= 0) return vi * tau
  const tSk = (-vi + Math.sqrt(vi * vi + 2 * a * v.skid)) / a
  if (tau <= tSk) return vi * tau + 0.5 * a * tau * tau
  const v0 = vi + a * tSk
  return v.skid + v0 * (tau - tSk)
}

export const postSpeedOf = (v) => (v.postDist > 0 ? skidSpeed(v.postDist, v.mu, 0) : 0)

export function postAlongDist(v, t) {
  if (v.postDist <= 0) return 0
  const u = postSpeedOf(v)
  const a = v.mu * G
  if (a <= 0 || u <= 0) return 0
  const tt = Math.min(t, u / a)
  return u * tt - 0.5 * a * tt * tt
}

export function poseAt(v, t) {
  if (t < 0) {
    const d = preBackDist(v, -t)
    const [dx, dz] = bearingToVec(v.heading)
    return { x: v.x - dx * d, z: v.z - dz * d, bearing: v.heading }
  }
  if (t > 0) {
    const d = postAlongDist(v, t)
    const [dx, dz] = bearingToVec(v.postDir)
    return { x: v.x + dx * d, z: v.z + dz * d, bearing: v.heading }
  }
  return { x: v.x, z: v.z, bearing: v.heading }
}

// ---- whole-case analysis --------------------------------------------------------------

export function analyzeVehicle(v, { grade = 0, eff = 1 } = {}) {
  const spec = CATALOG[v.type]
  const skidMin = skidSpeed(v.skid, v.mu, grade, eff)
  const vi = kmh2ms(v.speed)
  const startOfSkid = v.skid > 0 ? Math.sqrt(vi * vi + 2 * (v.mu * eff + grade / 100) * G * v.skid) : vi
  const dims = crushDims(spec)
  const C = spec.noCrush ? 0 : crushDepth(dims.Leff, v.crush)
  return {
    id: v.id,
    skidSpeed: skidMin, // m/s: speed lost in the skid alone (minimum speed at start of skid)
    startOfSkid,
    postSpeed: postSpeedOf(v),
    crushDepth: C,
    ebs: crushEBS(C),
  }
}

export function resolvePair(vehicles, pair) {
  const movers = vehicles
  const a = movers.find((v) => v.id === pair?.[0]) ?? movers[0]
  const b = movers.find((v) => v.id === pair?.[1] && v !== a) ?? movers.find((v) => v !== a)
  return a && b ? [a, b] : null
}

export function analyzeCase(vehicles, settings) {
  const per = vehicles.map((v) => analyzeVehicle(v, settings))
  const pairV = resolvePair(vehicles, settings.pair)
  let pair = null
  if (pairV) {
    const [A, B] = pairV
    const velA = velOf(kmh2ms(A.speed), A.heading)
    const velB = velOf(kmh2ms(B.speed), B.heading)
    let n
    if (settings.normalDeg != null) n = bearingToVec(settings.normalDeg)
    else {
      const dx = B.x - A.x, dz = B.z - A.z
      const d = Math.hypot(dx, dz)
      n = d > 0.1 ? [dx / d, dz / d] : bearingToVec(A.heading)
    }
    const forward = forwardImpact(
      { mass: A.mass, vel: velA },
      { mass: B.mass, vel: velB },
      { e: settings.e, n },
    )
    const reverse = reverseMomentum(
      { mass: A.mass, dir: bearingToVec(A.heading), post: velOf(postSpeedOf(A), A.postDir) },
      { mass: B.mass, dir: bearingToVec(B.heading), post: velOf(postSpeedOf(B), B.postDir) },
    )
    pair = { A, B, n, normalBearing: vecToBearing(n[0], n[1]), forward, reverse }
  }
  return { per, pair }
}

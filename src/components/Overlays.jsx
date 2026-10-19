import { useLayoutEffect, useRef } from 'react'
import { useFrame, useThree } from '@react-three/fiber'
import { Html, Line } from '@react-three/drei'
import { useStore, MARKER_KINDS } from '../store.js'
import { CATALOG } from '../lib/catalog.js'
import { bearingToRotY, bearingToVec } from '../lib/geo.js'
import { poseAt, postSpeedOf, ms2kmh } from '../lib/physics.js'

const offsetMat = (f) => ({ polygonOffset: true, polygonOffsetFactor: f, polygonOffsetUnits: f })

function Skids() {
  const vehicles = useStore((s) => s.vehicles)
  const heightAt = useStore((s) => s.heightAt)
  const on = useStore((s) => s.layers.skids)
  if (!on) return null
  return vehicles
    .filter((v) => v.skid > 0 && CATALOG[v.type].kind !== 'person')
    .map((v) => {
      const spec = CATALOG[v.type]
      const xs = spec.kind === 'moto' ? [0] : [-spec.W * 0.38, spec.W * 0.38]
      const y = heightAt(v.x, v.z) + 0.075
      return (
        <group key={v.id} position={[v.x, y, v.z]} rotation={[0, bearingToRotY(v.heading), 0]}>
          {xs.map((x) => (
            <mesh key={x} position={[x, 0, -v.skid / 2]}>
              <boxGeometry args={[0.2, 0.012, v.skid]} />
              <meshBasicMaterial color="#070707" transparent opacity={0.88} {...offsetMat(-6)} />
            </mesh>
          ))}
          <Html position={[0, 0.3, -v.skid]} center style={{ pointerEvents: 'none' }} zIndexRange={[10, 0]}>
            <div className="ft-chip ft-chip-dark">skid {v.skid.toFixed(1)} m</div>
          </Html>
        </group>
      )
    })
}

function Paths() {
  const vehicles = useStore((s) => s.vehicles)
  const heightAt = useStore((s) => s.heightAt)
  const on = useStore((s) => s.layers.paths)
  if (!on) return null
  return vehicles.map((v) => {
    const spec = CATALOG[v.type]
    const start = poseAt(v, -3)
    const els = []
    if (v.speed > 0) {
      els.push(
        <Line key="pre" points={[[start.x, heightAt(start.x, start.z) + 0.35, start.z], [v.x, heightAt(v.x, v.z) + 0.35, v.z]]} color="#1d6fb8" lineWidth={2.5} dashed dashSize={1.2} gapSize={0.7} />,
        <Html key="pre-l" position={[start.x, heightAt(start.x, start.z) + 0.9, start.z]} center style={{ pointerEvents: 'none' }} zIndexRange={[10, 0]}>
          <div className="ft-chip ft-chip-pre">{v.name} {Math.round(v.speed)} km/h</div>
        </Html>,
      )
    }
    if (v.postDist > 0) {
      const [dx, dz] = bearingToVec(v.postDir)
      const ex = v.x + dx * v.postDist, ez = v.z + dz * v.postDist
      const ey = heightAt(ex, ez)
      const rot = bearingToRotY(v.heading)
      els.push(
        <Line key="post" points={[[v.x, heightAt(v.x, v.z) + 0.4, v.z], [ex, ey + 0.4, ez]]} color="#d9412b" lineWidth={3} />,
        <mesh key="arrow" position={[ex, ey + 0.4, ez]} rotation={[Math.PI / 2, 0, -Math.atan2(dx, -dz) + Math.PI]}>
          <coneGeometry args={[0.35, 0.9, 12]} />
          <meshBasicMaterial color="#d9412b" />
        </mesh>,
        <mesh key="ghost" position={[ex, ey + spec.H / 2, ez]} rotation={[0, rot, 0]}>
          <boxGeometry args={[spec.W, spec.H, spec.L]} />
          <meshBasicMaterial color="#d9412b" wireframe transparent opacity={0.4} />
        </mesh>,
        <Html key="post-l" position={[ex, ey + spec.H + 0.6, ez]} center style={{ pointerEvents: 'none' }} zIndexRange={[10, 0]}>
          <div className="ft-chip ft-chip-post">{v.name} rest · {v.postDist.toFixed(1)} m · {Math.round(ms2kmh(postSpeedOf(v)))} km/h</div>
        </Html>,
      )
    }
    return <group key={v.id}>{els}</group>
  })
}

// ---- photorealistic numbered evidence tents (real forensic-photography style:
// a yellow A-frame placard with a bold black number) + per-kind ground decals.

function EvidenceTent({ n }) {
  return (
    <group>
      {/* A-frame tent body: two angled yellow faces meeting at a ridge */}
      <mesh position={[0, 0.17, 0.075]} rotation={[0.62, 0, 0]} castShadow>
        <boxGeometry args={[0.26, 0.015, 0.21]} />
        <meshStandardMaterial color="#fcd400" roughness={0.55} />
      </mesh>
      <mesh position={[0, 0.17, -0.075]} rotation={[-0.62, 0, 0]} castShadow>
        <boxGeometry args={[0.26, 0.015, 0.21]} />
        <meshStandardMaterial color="#fcd400" roughness={0.55} />
      </mesh>
      {/* end caps (triangular) so it doesn't read as two floating slabs */}
      {[-0.095, 0.095].map((x) => (
        <mesh key={x} position={[x, 0.17, 0]}>
          <coneGeometry args={[0.1, 0.17, 3]} />
          <meshStandardMaterial color="#e8bf00" roughness={0.6} />
        </mesh>
      ))}
      <Html position={[0, 0.2, 0.001]} center distanceFactor={9} style={{ pointerEvents: 'none' }}>
        <div className="ft-tent-number">{n}</div>
      </Html>
    </group>
  )
}

function GroundDecal({ kind }) {
  if (kind === 'glass') {
    // scatter of small glinting shards
    const shards = Array.from({ length: 9 }, (_, i) => {
      const a = (i / 9) * Math.PI * 2 + (i % 2) * 0.3
      const r = 0.08 + (i % 4) * 0.05
      return [Math.cos(a) * r, Math.sin(a) * r, (i * 37) % 360]
    })
    return (
      <group position={[0, 0.012, 0]} rotation={[-Math.PI / 2, 0, 0]}>
        {shards.map(([x, z, rot], i) => (
          <mesh key={i} position={[x, z, 0]} rotation={[0, 0, (rot * Math.PI) / 180]}>
            <planeGeometry args={[0.05, 0.08]} />
            <meshStandardMaterial color="#cfe8e4" transparent opacity={0.75} metalness={0.3} roughness={0.1} side={2} />
          </mesh>
        ))}
      </group>
    )
  }
  if (kind === 'fluid') {
    return (
      <mesh position={[0, 0.011, 0]} rotation={[-Math.PI / 2, 0, 0]}>
        <circleGeometry args={[0.32, 20]} />
        <meshStandardMaterial color="#17120d" transparent opacity={0.55} roughness={0.25} />
      </mesh>
    )
  }
  return null
}

function Markers() {
  const markers = useStore((s) => s.markers)
  const heightAt = useStore((s) => s.heightAt)
  return markers.map((m) => {
    const y = heightAt(m.x, m.z)
    return (
      <group key={m.id} position={[m.x, y, m.z]}>
        <GroundDecal kind={m.kind} />
        <EvidenceTent n={m.n} />
        <Html position={[0, 0.5, 0]} center style={{ pointerEvents: 'none' }} zIndexRange={[15, 0]}>
          <div className="ft-marker-label">{MARKER_KINDS[m.kind]}</div>
        </Html>
      </group>
    )
  })
}

// ---- click-to-measure ruler

function Ruler() {
  const tool = useStore((s) => s.tool)
  const ruler = useStore((s) => s.ruler)
  const heightAt = useStore((s) => s.heightAt)
  if (tool !== 'ruler' || ruler.length === 0) return null
  const pts = ruler.map((p) => [p.x, heightAt(p.x, p.z) + 0.4, p.z])
  const dist = ruler.length === 2 ? Math.hypot(ruler[1].x - ruler[0].x, ruler[1].z - ruler[0].z) : null
  const mid = ruler.length === 2
    ? [(ruler[0].x + ruler[1].x) / 2, Math.max(...pts.map((p) => p[1])) + 0.3, (ruler[0].z + ruler[1].z) / 2]
    : null
  return (
    <group>
      {pts.map((p, i) => (
        <mesh key={i} position={p}>
          <sphereGeometry args={[0.1, 12, 10]} />
          <meshBasicMaterial color="#f5c400" />
        </mesh>
      ))}
      {pts.length === 2 && <Line points={pts} color="#f5c400" lineWidth={2.5} dashed dashSize={0.3} gapSize={0.18} />}
      {dist != null && (
        <Html position={mid} center style={{ pointerEvents: 'none' }} zIndexRange={[20, 0]}>
          <div className="ft-chip ft-chip-dark">{dist.toFixed(2)} m</div>
        </Html>
      )}
    </group>
  )
}

function MeasureGrid() {
  const on = useStore((s) => s.layers.grid)
  const fine = useRef()
  const coarse = useRef()
  const group = useRef()
  useLayoutEffect(() => {
    for (const [r, o] of [[fine, 0.16], [coarse, 0.42]]) {
      const m = r.current?.material
      if (m) { m.transparent = true; m.opacity = o; m.depthWrite = false }
    }
  }, [on])
  useFrame(() => {
    const st = useStore.getState()
    const vs = st.vehicles
    let cx = 0, cz = 0
    if (vs.length) { cx = vs.reduce((a, v) => a + v.x, 0) / vs.length; cz = vs.reduce((a, v) => a + v.z, 0) / vs.length }
    const gx = Math.round(cx / 10) * 10, gz = Math.round(cz / 10) * 10
    group.current?.position.set(gx, st.heightAt(gx, gz) + 0.1, gz)
  })
  if (!on) return null
  return (
    <group ref={group}>
      <gridHelper ref={fine} args={[100, 100, '#ffffff', '#ffffff']} />
      <gridHelper ref={coarse} args={[100, 10, '#ffffff', '#ffffff']} position={[0, 0.005, 0]} />
    </group>
  )
}

export default function Overlays() {
  return (
    <>
      <MeasureGrid />
      <Skids />
      <Paths />
      <Markers />
      <Ruler />
    </>
  )
}
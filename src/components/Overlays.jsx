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
    .filter((v) => CATALOG[v.type]?.category === 'vehicle' && v.skid > 0)
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
  return vehicles.filter((v) => CATALOG[v.type]?.category === 'vehicle').map((v) => {
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

function GroundDecal({ kind, length = 0.5 }) {
  const markLength = Math.max(0.4, Math.min(Number(length) || 0.5, 18))
  if (kind === 'glass') {
    const shards = Array.from({ length: 14 }, (_, i) => {
      const a = (i / 14) * Math.PI * 2 + (i % 2) * 0.3
      const r = 0.08 + (i % 5) * 0.055
      return [Math.cos(a) * r, Math.sin(a) * r, (i * 37) % 360]
    })
    return <group position={[0, 0.018, 0]} rotation={[-Math.PI / 2, 0, 0]}>{shards.map(([x, z, rot], i) => (
      <mesh key={i} position={[x, z, 0]} rotation={[0, 0, (rot * Math.PI) / 180]}>
        <planeGeometry args={[0.045 + (i % 3) * 0.018, 0.07 + (i % 2) * 0.035]} />
        <meshStandardMaterial color={i % 3 ? '#cfe8e4' : '#eaf5ff'} transparent opacity={0.88} metalness={0.3} roughness={0.1} side={2} />
      </mesh>
    ))}</group>
  }
  if (kind === 'fluid') return <group>{[0, 1, 2, 3, 4].map((i) => <mesh key={i} position={[(i - 2) * 0.12, 0.012, Math.sin(i * 1.7) * 0.12]} scale={[1 + (i % 2) * 0.4, 1, 0.7]} rotation-x={-Math.PI / 2}><circleGeometry args={[0.23 + (i % 3) * 0.06, 20]} /><meshStandardMaterial color="#17120d" transparent opacity={0.62} roughness={0.25} /></mesh>)}</group>
  if (kind === 'blood' || kind === 'bio') return <group>{Array.from({ length: 12 }, (_, i) => {
    const a = i * 2.399, r = i === 0 ? 0 : 0.08 + (i % 4) * 0.11
    return <mesh key={i} position={[Math.cos(a) * r, 0.014, Math.sin(a) * r]} rotation={[-Math.PI / 2, 0, a]} scale={[1 + (i % 3) * 0.35, 0.7 + (i % 2) * 0.3, 1]}><circleGeometry args={[0.075 + (i % 4) * 0.025, 12]} /><meshStandardMaterial color={kind === 'blood' ? (i % 3 ? '#8e1724' : '#5f0711') : '#5b4b42'} roughness={0.7} /></mesh>
  })}</group>
  if (kind === 'paint') return <group>{Array.from({ length: 9 }, (_, i) => <mesh key={i} position={[(i % 3 - 1) * 0.13, 0.02, (Math.floor(i / 3) - 1) * 0.1]} rotation-x={-Math.PI / 2} rotation-z={i * 0.7}><circleGeometry args={[0.035 + (i % 2) * 0.025, 7]} /><meshStandardMaterial color={['#c92c2c', '#f0c419', '#2f6eb0', '#e6e8e9'][i % 4]} roughness={0.5} /></mesh>)}</group>
  if (kind === 'hair' || kind === 'fiber') return <group>{Array.from({ length: 7 }, (_, i) => <mesh key={i} position={[(i - 3) * 0.045, 0.025, Math.sin(i * 1.4) * 0.11]} rotation={[0, 0, (i - 3) * 0.22]}><capsuleGeometry args={[kind === 'hair' ? 0.008 : 0.012, 0.22 + (i % 3) * 0.08, 3, 4]} /><meshStandardMaterial color={kind === 'hair' ? '#29211d' : '#d4b68b'} roughness={0.9} /></mesh>)}</group>
  if (kind === 'skid') return <group>{[-0.34, 0.34].map((x) => <mesh key={x} position={[x, 0.012, 0]}><boxGeometry args={[0.16, 0.014, markLength]} /><meshBasicMaterial color="#090a0b" transparent opacity={0.88} /></mesh>)}</group>
  if (kind === 'tyre') return <group>{[-0.22, 0.22].map((x) => <group key={x} position={[x, 0.016, 0]}>{Array.from({ length: Math.max(3, Math.floor(markLength * 3)) }, (_, i) => <mesh key={i} position={[0, 0, -markLength / 2 + i * 0.32]}><boxGeometry args={[0.14, 0.014, 0.09]} /><meshBasicMaterial color="#181b1e" transparent opacity={0.9} /></mesh>)}</group>)}</group>
  if (kind === 'yaw' || kind === 'scrub') {
    const r = kind === 'yaw' ? 1.25 : 0.68
    const pts = Array.from({ length: 22 }, (_, i) => {
      const a = -1.15 + (i / 21) * 2.3
      return [Math.sin(a) * r, 0.025, Math.cos(a) * r]
    })
    return <group><Line points={pts} color={kind === 'yaw' ? '#24282b' : '#111416'} lineWidth={kind === 'yaw' ? 3 : 4} /><Line points={pts.map(([x, y, z]) => [x + 0.12, y + 0.001, z])} color="#41464a" lineWidth={1} transparent opacity={0.65} /></group>
  }
  if (kind === 'gouge' || kind === 'impact') return <group><mesh rotation-x={-Math.PI / 2} position={[0, 0.015, 0]}><ringGeometry args={[kind === 'impact' ? 0.42 : 0.18, kind === 'impact' ? 0.5 : 0.25, 28]} /><meshBasicMaterial color={kind === 'impact' ? '#f5c400' : '#34383b'} /></mesh>{kind === 'impact' && <mesh position={[0, 0.05, 0]}><sphereGeometry args={[0.09, 12, 10]} /><meshBasicMaterial color="#f5c400" /></mesh>}</group>
  if (kind === 'cctv') return <group><mesh position={[0, 0.65, 0]}><cylinderGeometry args={[0.035, 0.045, 1.3, 8]} /><meshStandardMaterial color="#555b60" metalness={0.6} /></mesh><mesh position={[0.18, 1.25, 0]} rotation-z={-0.12}><boxGeometry args={[0.34, 0.12, 0.14]} /><meshStandardMaterial color="#343b43" metalness={0.3} /></mesh><mesh position={[0.35, 1.25, 0.02]}><cylinderGeometry args={[0.045, 0.045, 0.035, 12]} rotation={[0, 0, Math.PI / 2]} /><meshStandardMaterial color="#182b3a" /></mesh></group>
  if (kind === 'seatbelt' || kind === 'airbag') return <group><mesh position={[0, 0.025, 0]} rotation-x={-Math.PI / 2} rotation-z={0.45}><planeGeometry args={kind === 'seatbelt' ? [0.1, 1.2] : [0.75, 0.6]} /><meshBasicMaterial color={kind === 'seatbelt' ? '#c6a35a' : '#e5e8e9'} transparent opacity={0.85} side={2} /></mesh></group>
  return null
}

function Markers() {
  const markers = useStore((s) => s.markers)
  const heightAt = useStore((s) => s.heightAt)
  return markers.map((m) => {
    const y = heightAt(m.x, m.z)
    return (
      <group key={m.id} position={[m.x, y, m.z]} rotation={[0, bearingToRotY(Number(m.heading || 0)), 0]}>
        <GroundDecal kind={m.kind} length={m.length} />
        <EvidenceTent n={m.n} />
        <Html position={[0, 0.5, 0]} center style={{ pointerEvents: 'none' }} zIndexRange={[15, 0]}>
          <div className={`ft-marker-label ft-marker-${m.kind}`}>{MARKER_KINDS[m.kind]}{m.note ? ` · ${m.note}` : ''}</div>
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
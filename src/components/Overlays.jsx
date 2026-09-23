import { useLayoutEffect, useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import { Html, Line } from '@react-three/drei'
import { useStore, MARKER_KINDS } from '../store.js'
import { CATALOG } from '../lib/catalog.js'
import { bearingToRotY, bearingToVec } from '../lib/geo.js'
import { poseAt, postSpeedOf, ms2kmh } from '../lib/physics.js'

const offsetMat = (f) => ({ polygonOffset: true, polygonOffsetFactor: f, polygonOffsetUnits: f })

function Skids() {
  const vehicles = useStore((s) => s.vehicles)
  const on = useStore((s) => s.layers.skids)
  if (!on) return null
  return vehicles
    .filter((v) => v.skid > 0 && CATALOG[v.type].kind !== 'person')
    .map((v) => {
      const spec = CATALOG[v.type]
      const xs = spec.kind === 'moto' ? [0] : [-spec.W * 0.38, spec.W * 0.38]
      return (
        <group key={v.id} position={[v.x, 0.075, v.z]} rotation={[0, bearingToRotY(v.heading), 0]}>
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
  const on = useStore((s) => s.layers.paths)
  if (!on) return null
  return vehicles.map((v) => {
    const spec = CATALOG[v.type]
    const start = poseAt(v, -3)
    const els = []
    if (v.speed > 0) {
      els.push(
        <Line key="pre" points={[[start.x, 0.35, start.z], [v.x, 0.35, v.z]]} color="#1d6fb8" lineWidth={2.5} dashed dashSize={1.2} gapSize={0.7} />,
        <Html key="pre-l" position={[start.x, 0.9, start.z]} center style={{ pointerEvents: 'none' }} zIndexRange={[10, 0]}>
          <div className="ft-chip ft-chip-pre">{v.name} {Math.round(v.speed)} km/h</div>
        </Html>,
      )
    }
    if (v.postDist > 0) {
      const [dx, dz] = bearingToVec(v.postDir)
      const ex = v.x + dx * v.postDist, ez = v.z + dz * v.postDist
      const rot = bearingToRotY(v.heading)
      els.push(
        <Line key="post" points={[[v.x, 0.4, v.z], [ex, 0.4, ez]]} color="#d9412b" lineWidth={3} />,
        <mesh key="arrow" position={[ex, 0.4, ez]} rotation={[Math.PI / 2, 0, -Math.atan2(dx, -dz) + Math.PI]}>
          <coneGeometry args={[0.35, 0.9, 12]} />
          <meshBasicMaterial color="#d9412b" />
        </mesh>,
        <mesh key="ghost" position={[ex, spec.H / 2, ez]} rotation={[0, rot, 0]}>
          <boxGeometry args={[spec.W, spec.H, spec.L]} />
          <meshBasicMaterial color="#d9412b" wireframe transparent opacity={0.4} />
        </mesh>,
        <Html key="post-l" position={[ex, spec.H + 0.6, ez]} center style={{ pointerEvents: 'none' }} zIndexRange={[10, 0]}>
          <div className="ft-chip ft-chip-post">{v.name} rest · {v.postDist.toFixed(1)} m · {Math.round(ms2kmh(postSpeedOf(v)))} km/h</div>
        </Html>,
      )
    }
    return <group key={v.id}>{els}</group>
  })
}

function Markers() {
  const markers = useStore((s) => s.markers)
  return markers.map((m) => (
    <group key={m.id} position={[m.x, 0, m.z]}>
      <mesh position={[0, 0.28, 0]} castShadow>
        <coneGeometry args={[0.2, 0.56, 4]} />
        <meshStandardMaterial color="#f5c400" roughness={0.6} />
      </mesh>
      <Html position={[0, 0.9, 0]} center style={{ pointerEvents: 'none' }} zIndexRange={[15, 0]}>
        <div className="ft-marker" title={MARKER_KINDS[m.kind]}>{m.n}</div>
      </Html>
    </group>
  ))
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
    const vs = useStore.getState().vehicles
    let cx = 0, cz = 0
    if (vs.length) { cx = vs.reduce((a, v) => a + v.x, 0) / vs.length; cz = vs.reduce((a, v) => a + v.z, 0) / vs.length }
    group.current?.position.set(Math.round(cx / 10) * 10, 0.1, Math.round(cz / 10) * 10)
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
    </>
  )
}

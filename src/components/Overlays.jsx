import { useLayoutEffect, useRef } from 'react'
import { useFrame, useThree } from '@react-three/fiber'
import { Html, Line } from '@react-three/drei'
import { useStore, MARKER_KINDS } from '../store.js'
import { CATALOG } from '../lib/catalog.js'
import { bearingToRotY, bearingToVec } from '../lib/geo.js'
import { poseAt, postSpeedOf, ms2kmh } from '../lib/physics.js'

const offsetMat = (f) => ({ polygonOffset: true, polygonOffsetFactor: f, polygonOffsetUnits: f, depthTest: false, depthWrite: false })

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

function GroundDecal({ kind, length = 1 }) {
  // Keep evidence graphics slightly above the road and use opaque/high-contrast
  // materials. Small samples are deliberately exaggerated for scene readability.
  const span = Math.max(0.65, Math.min(2.4, Number(length) || 1))
  const decalMaterial = (color, opacity = 0.96) => (
    <meshBasicMaterial color={color} transparent opacity={opacity} side={2} depthTest={false} depthWrite={false} polygonOffset polygonOffsetFactor={-8} polygonOffsetUnits={-8} />
  )

  if (kind === 'blood') {
    const drops = [
      [-0.24, -0.12, 0.12], [-0.12, 0.18, 0.085], [0.16, -0.16, 0.09],
      [0.25, 0.12, 0.07], [-0.02, -0.27, 0.055], [0.05, 0.29, 0.05],
      [-0.31, 0.08, 0.045], [0.31, -0.04, 0.045],
    ]
    return <group position={[0, 0.055, 0]} rotation={[-Math.PI / 2, 0, 0]} scale={span}>
      <mesh>{/* irregular-looking central pool */}<circleGeometry args={[0.31, 12]} />{decalMaterial('#b90018')}</mesh>
      <mesh position={[0, 0, 0.003]}><circleGeometry args={[0.23, 20]} />{decalMaterial('#ed1b2f')}</mesh>
      {drops.map(([x, y, r], i) => <mesh key={i} position={[x, y, 0.006 + i * 0.0001]}><circleGeometry args={[r, 10]} />{decalMaterial(i % 2 ? '#8d0010' : '#ff3347')}</mesh>)}
      <mesh position={[0.02, -0.02, 0.009]}><circleGeometry args={[0.075, 16]} />{decalMaterial('#ff5964')}</mesh>
    </group>
  }
  if (kind === 'hair' || kind === 'fibre' || kind === 'paint') {
    const isHair = kind === 'hair'
    const isFibre = kind === 'fibre'
    const main = isHair ? '#17120f' : isFibre ? '#fff0b3' : '#ff3d2e'
    const outline = isHair ? '#e6d5b8' : isFibre ? '#624b22' : '#fff1a8'
    return <group position={[0, 0.065, 0]} rotation={[-Math.PI / 2, 0, 0]} scale={span}>
      {Array.from({ length: isHair ? 8 : 7 }, (_, i) => {
        const x = (i - 3) * (isHair ? 0.045 : 0.07)
        const y = Math.sin(i * 1.7) * 0.14
        const width = isHair ? 0.032 : isFibre ? 0.045 : 0.15
        const height = isHair ? 0.62 : isFibre ? 0.48 : 0.11
        return <group key={i} position={[x, y, i * 0.002]} rotation={[0, 0, (i - 3) * 0.17]}>
          <mesh position={[0, 0, 0]}><planeGeometry args={[width + (isHair ? 0.018 : 0.025), height + (isHair ? 0.02 : 0.025)]} />{decalMaterial(outline)}</mesh>
          <mesh position={[0, 0, 0.003]}><planeGeometry args={[width, height]} />{decalMaterial(main)}</mesh>
        </group>
      })}
      {isHair && <mesh position={[0.02, 0.02, 0.02]}><circleGeometry args={[0.09, 12]} />{decalMaterial('#211a16')}</mesh>}
      {isFibre && <mesh position={[0, 0, 0.02]}><circleGeometry args={[0.16, 12]} />{decalMaterial('#e8c76a', 0.75)}</mesh>}
      {kind === 'paint' && Array.from({ length: 5 }, (_, i) => <mesh key={`chip-${i}`} position={[(i - 2) * 0.16, Math.sin(i * 2) * 0.1, 0.025]} rotation={[0, 0, i * 0.5]}><circleGeometry args={[0.07, 5]} />{decalMaterial(i % 2 ? '#d91e24' : '#ffad36')}</mesh>)}
    </group>
  }
  if (kind === 'skid' || kind === 'yaw' || kind === 'scrub' || kind === 'tyre') {
    const color = kind === 'tyre' ? '#272727' : '#101010'
    const w = kind === 'scrub' ? 0.75 : kind === 'tyre' ? 0.42 : kind === 'yaw' ? 0.34 : 0.26
    const h = kind === 'tyre' ? 0.95 : span * 1.15
    return <group position={[0, 0.045, 0]} rotation={[-Math.PI / 2, 0, kind === 'yaw' ? 0.34 : 0]}>
      <mesh><planeGeometry args={[w + 0.09, h + 0.09]} />{decalMaterial('#e6c86a', 0.82)}</mesh>
      <mesh position={[0, 0, 0.004]}><planeGeometry args={[w, h]} />{decalMaterial(color, 0.98)}</mesh>
      {kind === 'tyre' && Array.from({ length: 8 }, (_, i) => <mesh key={i} position={[0, (i - 3.5) * h / 8, 0.008]} rotation={[0, 0, 0.08]}><planeGeometry args={[w * 0.9, 0.035]} />{decalMaterial('#d0d0d0', 0.8)}</mesh>)}
      {kind === 'scrub' && Array.from({ length: 5 }, (_, i) => <mesh key={i} position={[(i - 2) * 0.13, (i % 2 ? 1 : -1) * 0.12, 0.009]} rotation={[0, 0, i * 0.17]}><planeGeometry args={[0.07, h * 0.65]} />{decalMaterial('#393939', 0.92)}</mesh>)}
    </group>
  }
  if (kind === 'impact') return <group position={[0, 0.065, 0]}>
    <mesh rotation={[-Math.PI / 2, 0, 0]}><ringGeometry args={[0.32, 0.46, 32]} />{decalMaterial('#fff000')}</mesh>
    <mesh rotation={[-Math.PI / 2, 0, 0]}><ringGeometry args={[0.18, 0.26, 32]} />{decalMaterial('#ff2418')}</mesh>
    <mesh position={[0, 0.04, 0]}><sphereGeometry args={[0.08, 12, 10]} /><meshBasicMaterial color="#fff000" depthTest={false} depthWrite={false} /></mesh>
  </group>
  if (kind === 'glass') {
    return <group position={[0, 0.055, 0]} rotation={[-Math.PI / 2, 0, 0]} scale={span}>
      {Array.from({ length: 22 }, (_, i) => {
        const a = i * 2.399
        const r = 0.08 + (i % 6) * 0.065
        return <mesh key={i} position={[Math.cos(a) * r, Math.sin(a) * r, 0.004 + i * 0.0002]} rotation={[0, 0, a]}>
          <circleGeometry args={[0.045 + (i % 3) * 0.012, 3]} />
          <meshBasicMaterial color={i % 2 ? '#a9f7ff' : '#f2ffff'} transparent opacity={0.98} side={2} depthTest={false} depthWrite={false} />
        </mesh>
      })}
      <mesh><ringGeometry args={[0.43, 0.48, 32]} />{decalMaterial('#47dfff', 0.9)}</mesh>
    </group>
  }
  if (kind === 'fluid') return <group position={[0, 0.055, 0]} rotation={[-Math.PI / 2, 0, 0]} scale={span}>
    <mesh><circleGeometry args={[0.42, 24]} />{decalMaterial('#f5bd36', 0.9)}</mesh>
    <mesh position={[0, 0, 0.004]}><circleGeometry args={[0.32, 24]} />{decalMaterial('#17120d', 0.98)}</mesh>
    {[-0.35, 0.28, 0.22].map((x, i) => <mesh key={i} position={[x, (i - 1) * 0.2, 0.008]}><circleGeometry args={[0.09, 12]} />{decalMaterial('#17120d')}</mesh>)}
  </group>
  if (kind === 'gouge') return <group position={[0, 0.055, 0]} rotation={[-Math.PI / 2, 0, 0]} scale={span}>
    <mesh rotation={[0, 0, 0.3]}><planeGeometry args={[0.22, 0.85]} />{decalMaterial('#fff000')}</mesh>
    <mesh position={[0, 0, 0.004]} rotation={[0, 0, 0.3]}><planeGeometry args={[0.11, 0.72]} />{decalMaterial('#171717')}</mesh>
  </group>
  if (kind === 'debris') return <group position={[0, 0.07, 0]}>
    {Array.from({ length: 9 }, (_, i) => <mesh key={i} position={[Math.cos(i * 2.4) * (0.18 + (i % 3) * 0.11), 0.02 + (i % 3) * 0.015, Math.sin(i * 2.4) * (0.18 + (i % 2) * 0.12)]} rotation={[i * 0.3, i * 0.6, i * 0.2]}><dodecahedronGeometry args={[0.09 + (i % 3) * 0.025, 0]} /><meshBasicMaterial color={['#e6d7b8', '#b8c4cf', '#31353a', '#c92d2d'][i % 4]} depthTest={false} depthWrite={false} /></mesh>)}
  </group>
  if (kind === 'rest') return <group position={[0, 0.06, 0]} rotation={[-Math.PI / 2, 0, 0]}>
    <mesh><ringGeometry args={[0.42, 0.5, 32]} />{decalMaterial('#f5d000')}</mesh>
    <mesh><ringGeometry args={[0.22, 0.28, 32]} />{decalMaterial('#ff3b30')}</mesh>
  </group>
  if (kind === 'seatbelt' || kind === 'airbag' || kind === 'cctv' || kind === 'witness' || kind === 'photo' || kind === 'other') {
    const color = kind === 'seatbelt' ? '#29a7ff' : kind === 'airbag' ? '#f4f4f4' : kind === 'cctv' ? '#9a5cff' : kind === 'witness' ? '#35d07f' : kind === 'photo' ? '#ffb12b' : '#ffffff'
    return <group position={[0, 0.08, 0]}>
      <mesh rotation={[-Math.PI / 2, 0, 0]}><ringGeometry args={[0.24, 0.33, 24]} />{decalMaterial(color)}</mesh>
      <mesh position={[0, 0.08, 0]}><cylinderGeometry args={[0.11, 0.11, 0.16, 12]} /><meshBasicMaterial color={color} /></mesh>
      <mesh position={[0, 0.18, 0]}><sphereGeometry args={[0.08, 12, 10]} /><meshBasicMaterial color={color} /></mesh>
    </group>
  }
  return <group position={[0, 0.06, 0]} rotation={[-Math.PI / 2, 0, 0]}>
    <mesh><ringGeometry args={[0.25, 0.34, 24]} />{decalMaterial('#fff000')}</mesh>
    <mesh><circleGeometry args={[0.16, 16]} />{decalMaterial('#ff6b00')}</mesh>
  </group>
}

function Markers() {
  const markers = useStore((s) => s.markers)
  const heightAt = useStore((s) => s.heightAt)
  return markers.map((m) => {
    const y = heightAt(m.x, m.z)
    const label = MARKER_KINDS[m.kind] || m.kind || 'Evidence'
    return (
      <group key={m.id} position={[m.x, y + 0.08, m.z]} renderOrder={1000}>
        <GroundDecal kind={m.kind} length={m.length || 1} />
        {/* Move the evidence tent away from the trace so it doesn't cover the evidence graphic. */}
        <group position={[0.72, 0, 0.42]}><EvidenceTent n={m.n} /></group>
        <Html position={[0, 1.05, 0]} center distanceFactor={11} style={{ pointerEvents: 'none' }} zIndexRange={[25, 0]}>
          <div className="ft-marker-label" style={{ background: '#111827', color: '#fff', border: '2px solid #f5c400', padding: '4px 7px', borderRadius: 5, fontWeight: 800, fontSize: 12, whiteSpace: 'nowrap', boxShadow: '0 2px 8px #0008' }}>{m.n}. {label}</div>
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
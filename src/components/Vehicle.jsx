import { Component, Suspense, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { useFrame } from '@react-three/fiber'
import { Html, TransformControls, useGLTF } from '@react-three/drei'
import * as THREE from 'three'
import { useStore } from '../store.js'
import { CATALOG, crushDims } from '../lib/catalog.js'
import { DEG, bearingToRotY, wrap360, round } from '../lib/geo.js'
import { poseAt } from '../lib/physics.js'
import { deformPositions } from '../lib/crush.js'
import { buildProcedural, flattenGlb, makeMaterials } from '../lib/models.js'

// ---- is a custom .glb present? (HEAD request, cached; dev servers answer html for missing files)
const glbCache = new Map()
function useGlbAvailable(url) {
  const [ok, setOk] = useState(() => (url ? glbCache.get(url) ?? null : false))
  useEffect(() => {
    if (!url || glbCache.has(url)) return
    let dead = false
    fetch(url, { method: 'HEAD' })
      .then((r) => {
        const good = r.ok && !(r.headers.get('content-type') || '').includes('text/html')
        glbCache.set(url, good)
        if (!dead) setOk(good)
      })
      .catch(() => { glbCache.set(url, false); if (!dead) setOk(false) })
    return () => { dead = true }
  }, [url])
  return ok === true
}

class Boundary extends Component {
  state = { failed: false }
  static getDerivedStateFromError() { return { failed: true } }
  render() { return this.state.failed ? this.props.fallback : this.props.children }
}

// ---- meshes whose vertices are deformed by the crush model
function Crushable({ parts, spec, crush, offset, side = 'front', mats }) {
  const dims = useMemo(() => crushDims(spec), [spec])
  useLayoutEffect(() => {
    for (const p of parts) {
      if (!p.deform) continue
      const pos = p.geo.attributes.position
      deformPositions(p.orig, pos.array, dims, spec.noCrush ? 0 : crush, offset, side)
      pos.needsUpdate = true
      if (pos.count < 60000) p.geo.computeVertexNormals()
      p.geo.computeBoundingSphere()
    }
  }, [parts, dims, crush, offset, side, spec.noCrush])
  return parts.map((p, i) => (
    <mesh key={i} geometry={p.geo} material={p.material || mats[p.mat]} castShadow receiveShadow />
  ))
}

function GlbCrushable({ spec, crush, offset, side = 'front', mats }) {
  const { scene } = useGLTF(spec.glb)
  const parts = useMemo(() => flattenGlb(scene, spec), [scene, spec])
  return <Crushable parts={parts} spec={spec} crush={crush} offset={offset} side={side} mats={mats} />
}

function VehicleBody({ v, spec }) {
  const impactDamageActive = useStore((s) => s.time >= 0)
  const hasGlb = useGlbAvailable(spec.glb)
  const mats = useMemo(() => makeMaterials(v.color), [v.color])
  useEffect(() => () => Object.values(mats).forEach((m) => m.dispose()), [mats])
  const parts = useMemo(() => buildProcedural(v.type), [v.type])
  useEffect(() => () => parts.forEach((p) => p.geo.dispose()), [parts])
  const visibleCrush = impactDamageActive ? v.crush : 0
  const visibleOffset = impactDamageActive ? v.impactOffset : 0
  const damageSide = v.damageSide || 'front'
  const fallback = <Crushable parts={parts} spec={spec} crush={visibleCrush} offset={visibleOffset} side={damageSide} mats={mats} />
  if (!hasGlb) return fallback
  return (
    <Boundary fallback={fallback}>
      <Suspense fallback={fallback}>
        <GlbCrushable spec={spec} crush={visibleCrush} offset={visibleOffset} side={damageSide} mats={mats} />
      </Suspense>
    </Boundary>
  )
}

function Headlights({ spec }) {
  const target = useMemo(() => new THREE.Object3D(), [])
  const light = useRef()
  useLayoutEffect(() => { if (light.current) light.current.target = target }, [target])
  return (
    <>
      <spotLight ref={light} position={[0, 0.75, spec.L / 2]} angle={0.45} penumbra={0.6} intensity={1400} distance={65} decay={2} color="#fff3d6" />
      <primitive object={target} position={[0, 0.2, spec.L / 2 + 20]} />
    </>
  )
}

function SelectionRing({ spec }) {
  const r = Math.max(spec.L, spec.W * 1.6) * 0.62
  return (
    <group>
      <mesh rotation-x={-Math.PI / 2} position={[0, 0.09, 0]}>
        <ringGeometry args={[r, r + 0.12, 48]} />
        <meshBasicMaterial color="#f5c400" transparent opacity={0.95} depthWrite={false} polygonOffset polygonOffsetFactor={-8} polygonOffsetUnits={-8} />
      </mesh>
      <mesh position={[0, 0.12, r + 0.55]} rotation-x={Math.PI / 2}>
        <coneGeometry args={[0.32, 0.7, 3]} />
        <meshBasicMaterial color="#f5c400" />
      </mesh>
    </group>
  )
}

const lightsSel = (s) => {
  const elev = Math.sin(((s.env.hour - 6) / 12) * Math.PI)
  return elev < 0.08 || (s.env.weather !== 'clear' && s.env.visibility < 350 && s.env.weather !== 'overcast')
}

function Occupants({ v, spec }) {
  const count = Math.max(0, Math.min(8, Number(v.occupantCount || 0)))
  if (!count) return null
  const seats = [
    [-spec.W * 0.22, spec.L * 0.19], [spec.W * 0.22, spec.L * 0.19],
    [-spec.W * 0.22, -spec.L * 0.12], [spec.W * 0.22, -spec.L * 0.12],
    [-spec.W * 0.22, -spec.L * 0.32], [spec.W * 0.22, -spec.L * 0.32],
    [0, -spec.L * 0.42], [0, spec.L * 0.36],
  ]
  return <group>{seats.slice(0, count).map(([x, z], i) => (
    <group key={i} position={[x, spec.H * 0.78, z]}>
      <mesh position={[0, 0.08, 0]} castShadow><capsuleGeometry args={[0.09, 0.2, 3, 6]} /><meshStandardMaterial color={i % 2 ? '#334e68' : '#8c5c43'} roughness={0.8} /></mesh>
      <mesh position={[0, 0.25, 0]} castShadow><sphereGeometry args={[0.105, 12, 10]} /><meshStandardMaterial color="#c99a76" roughness={0.9} /></mesh>
    </group>
  ))}</group>
}

function PlateTag({ text, back = false }) {
  if (!text) return null
  return <Html position={[0, 0.32, back ? -0.1 : 0.1]} center distanceFactor={12} style={{ pointerEvents: 'none' }} zIndexRange={[30, 0]}>
    <div style={{ background: '#f5f4e9', color: '#111', border: '1px solid #171717', borderRadius: 2, padding: '1px 4px', fontSize: 8, fontFamily: 'monospace', fontWeight: 800, letterSpacing: '.05em', whiteSpace: 'nowrap', boxShadow: '0 1px 3px #0005' }}>{text}</div>
  </Html>
}

export default function Vehicle({ v }) {
  const spec = CATALOG[v.type]
  const groupRef = useRef(null)
  const [obj, setObj] = useState(null)
  const setRef = useCallback((n) => { groupRef.current = n; setObj(n) }, [])
  const selected = useStore((s) => s.selectedId === v.id)
  const editable = useStore((s) => s.time === 0 && !s.playing)
  const gizmo = useStore((s) => s.gizmo)
  const lightsOn = useStore(lightsSel)
  const labels = useStore((s) => s.layers.labels)
  const impactDamageActive = useStore((s) => s.time >= 0)
  const physics = useStore((s) => s.physics)
  const lastT = useRef(0)

  // playback: drive the pose imperatively so React does not re-render every frame
   useFrame(() => {
    const g = groupRef.current
    if (!g) return
    const st = useStore.getState()
    const t = st.time
    const p = t === 0 ? { x: v.x, z: v.z, bearing: v.heading } : poseAt(v, t)
    const y = st.heightAt(p.x, p.z)
    g.position.set(p.x, y, p.z)
    const isRolloverVehicle = st.physics?.collisionType === 'rollover' && (st.physics?.primaryVehicleId === v.id || !st.physics?.primaryVehicleId)
    const roll = isRolloverVehicle && t > 0 ? Math.min(Math.PI * 0.48, t * 0.75) : 0
    g.rotation.set(0, bearingToRotY(p.bearing), roll)
    lastT.current = t
  })
  const onChange = () => {
    const g = groupRef.current
    if (!g) return
    const f = new THREE.Vector3(0, 0, 1).applyQuaternion(g.quaternion)
    const bearing = wrap360((Math.PI - Math.atan2(f.x, f.z)) / DEG)
    const patch = { x: round(g.position.x, 2), z: round(g.position.z, 2), heading: round(bearing, 1) }
    const st = useStore.getState()
    const cur = st.vehicles.find((q) => q.id === v.id)
    // keep the post-impact direction glued to the heading until the user sets it on purpose
    if (cur && Math.abs(wrap360(cur.postDir - cur.heading)) < 0.01) patch.postDir = patch.heading
    st.updateVehicle(v.id, patch)
  }

  return (
    <>
      <group
        ref={setRef}
        position={[v.x, 0, v.z]}
        rotation={[0, bearingToRotY(v.heading), 0]}
        onClick={(e) => {
          const st = useStore.getState()
          if (st.placing) return
          e.stopPropagation()
          st.select(v.id)
        }}
      >
        <VehicleBody v={v} spec={spec} />
        <Occupants v={v} spec={spec} />
        <group position={[0, 0, spec.L / 2]}><PlateTag text={v.licensePlate} /></group>
        <group position={[0, 0, -spec.L / 2]}><PlateTag text={v.licensePlate} back /></group>
        {lightsOn && spec.kind !== 'person' && <Headlights spec={spec} />}
        {selected && <SelectionRing spec={spec} />}
        {(labels || selected) && (
          <Html position={[0, spec.H + 0.8, 0]} center style={{ pointerEvents: 'none' }} zIndexRange={[20, 0]}>
            <div className={`ft-tag ${selected ? 'ft-tag-on' : ''}`}>
              <b>{v.name}</b>
              {v.licensePlate && <small style={{ display: 'block', fontFamily: 'monospace' }}>PLATE · {v.licensePlate}</small>}
              {v.vin && <small style={{ display: 'block', fontFamily: 'monospace' }}>VIN · {v.vin}</small>}
              {v.speedometerKmh !== '' && v.speedometerKmh != null && <small style={{ display: 'block' }}>SPEEDOMETER · {v.speedometerKmh} km/h</small>}
              {Number(v.occupantCount) > 0 && <small style={{ display: 'block' }}>OCCUPANTS · {v.occupantCount}</small>}
            </div>
          </Html>
        )}
      </group>
      {selected && editable && obj && (
        <TransformControls
          object={obj}
          mode={gizmo}
          showY={false}
          showX={gizmo === 'translate'}
          showZ={gizmo === 'translate'}
          size={0.9}
          rotationSnap={null}
          onObjectChange={onChange}
        />
      )}
    </>
  )
}
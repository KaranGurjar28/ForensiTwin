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
function Crushable({ parts, spec, crush, offset, mats }) {
  const dims = useMemo(() => crushDims(spec), [spec])
  useLayoutEffect(() => {
    for (const p of parts) {
      if (!p.deform) continue
      const pos = p.geo.attributes.position
      deformPositions(p.orig, pos.array, dims, spec.noCrush ? 0 : crush, offset)
      pos.needsUpdate = true
      if (pos.count < 60000) p.geo.computeVertexNormals()
      p.geo.computeBoundingSphere()
    }
  }, [parts, dims, crush, offset, spec.noCrush])
  return parts.map((p, i) => (
    <mesh key={i} geometry={p.geo} material={p.material || mats[p.mat]} castShadow receiveShadow />
  ))
}

function GlbCrushable({ spec, crush, offset, mats }) {
  const { scene } = useGLTF(spec.glb)
  const parts = useMemo(() => flattenGlb(scene, spec), [scene, spec])
  return <Crushable parts={parts} spec={spec} crush={crush} offset={offset} mats={mats} />
}

function VehicleBody({ v, spec }) {
  const hasGlb = useGlbAvailable(spec.glb)
  const mats = useMemo(() => makeMaterials(v.color), [v.color])
  useEffect(() => () => Object.values(mats).forEach((m) => m.dispose()), [mats])
  const parts = useMemo(() => buildProcedural(v.type), [v.type])
  useEffect(() => () => parts.forEach((p) => p.geo.dispose()), [parts])
  const fallback = <Crushable parts={parts} spec={spec} crush={v.crush} offset={v.impactOffset} mats={mats} />
  if (!hasGlb) return fallback
  return (
    <Boundary fallback={fallback}>
      <Suspense fallback={fallback}>
        <GlbCrushable spec={spec} crush={v.crush} offset={v.impactOffset} mats={mats} />
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
  const lastT = useRef(0)

  // playback: drive the pose imperatively so React does not re-render every frame
  useFrame(() => {
    const g = groupRef.current
    if (!g) return
    const t = useStore.getState().time
    if (t !== 0 || lastT.current !== 0) {
      const p = t === 0 ? { x: v.x, z: v.z, bearing: v.heading } : poseAt(v, t)
      g.position.set(p.x, 0, p.z)
      g.rotation.set(0, bearingToRotY(p.bearing), 0)
    }
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
        {lightsOn && spec.kind !== 'person' && <Headlights spec={spec} />}
        {selected && <SelectionRing spec={spec} />}
        {labels && (
          <Html position={[0, spec.H + 0.8, 0]} center style={{ pointerEvents: 'none' }} zIndexRange={[20, 0]}>
            <div className={`ft-tag ${selected ? 'ft-tag-on' : ''}`}>{v.name}</div>
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

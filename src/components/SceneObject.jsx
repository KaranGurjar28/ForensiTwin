import { useCallback, useRef, useState } from 'react'
import { useFrame } from '@react-three/fiber'
import { Html, TransformControls } from '@react-three/drei'
import * as THREE from 'three'
import { useStore } from '../store.js'
import { CATALOG } from '../lib/catalog.js'
import { bearingToRotY, wrap360, DEG, round } from '../lib/geo.js'

function PersonModel({ color, posture = 'upright' }) {
  const lying = ['prone-front', 'prone-back', 'side-lying'].includes(posture)
  const rotZ = posture === 'prone-back' ? -Math.PI / 2 : lying ? Math.PI / 2 : 0
  const scaleY = posture === 'seated' ? 0.62 : posture === 'crouched' ? 0.78 : 1
  return (
    <group rotation={[0, 0, rotZ]} scale={[1, scaleY, 1]} position={[0, lying ? 0.08 : 0, 0]}>
      <mesh position={[0, 0.85, 0]} castShadow>
        <capsuleGeometry args={[0.16, 0.72, 4, 8]} />
        <meshStandardMaterial color={color} roughness={0.85} />
      </mesh>
      <mesh position={[0, 1.55, 0]} castShadow>
        <sphereGeometry args={[0.13, 14, 10]} />
        <meshStandardMaterial color="#c99a76" roughness={0.85} />
      </mesh>
      <mesh position={[-0.1, 0.2, 0]} castShadow>
        <boxGeometry args={[0.09, 0.4, 0.1]} />
        <meshStandardMaterial color="#222831" />
      </mesh>
      <mesh position={[0.1, 0.2, 0]} castShadow>
        <boxGeometry args={[0.09, 0.4, 0.1]} />
        <meshStandardMaterial color="#222831" />
      </mesh>
    </group>
  )
}

function AnimalModel({ type, color, posture = 'standing' }) {
  const lying = ['lying', 'lying-left', 'lying-right'].includes(posture)
  const cow = type === 'cow'
  const bodyL = cow ? 1.25 : 0.58
  const bodyH = cow ? 0.62 : 0.3
  const legH = cow ? 0.48 : 0.22
  return (
    <group rotation={[0, 0, posture === 'lying-right' ? -Math.PI / 2 : lying ? Math.PI / 2 : 0]} position={[0, lying ? 0.12 : 0, 0]}>
      <mesh position={[0, legH + bodyH / 2, 0]} castShadow>
        <boxGeometry args={[cow ? 0.62 : 0.32, bodyH, bodyL]} />
        <meshStandardMaterial color={color} roughness={0.9} />
      </mesh>
      <mesh position={[0, legH + bodyH * 0.72, bodyL * 0.42]} castShadow>
        <sphereGeometry args={[cow ? 0.22 : 0.15, 12, 10]} />
        <meshStandardMaterial color={color} roughness={0.9} />
      </mesh>
      {[-1, 1].map((x) => [-1, 1].map((z) => (
        <mesh key={`${x}-${z}`} position={[x * (cow ? 0.2 : 0.12), legH / 2, z * bodyL * 0.28]} castShadow>
          <boxGeometry args={[cow ? 0.1 : 0.07, legH, 0.08]} />
          <meshStandardMaterial color={cow ? '#51463c' : '#4a392d'} />
        </mesh>
      )))}
      {cow && <mesh position={[0, legH + bodyH / 2, -bodyL * 0.52]} rotation-x={-0.4}>
        <cylinderGeometry args={[0.025, 0.035, 0.42, 8]} />
        <meshStandardMaterial color="#51463c" />
      </mesh>}
    </group>
  )
}

function ObjectModel({ v, spec }) {
  const c = v.color || spec.color
  switch (v.type) {
    case 'person':
      return <PersonModel color={c} posture={v.posture || 'upright'} />
    case 'dog':
    case 'cow':
      return <AnimalModel type={v.type} color={c} posture={v.posture || 'standing'} />
    case 'tree':
      return (
        <group>
          <mesh position={[0, 1.1, 0]} castShadow>
            <cylinderGeometry args={[0.13, 0.23, 2.2, 8]} />
            <meshStandardMaterial color="#62442f" roughness={1} />
          </mesh>
          <mesh position={[0, 3.1, 0]} castShadow>
            <coneGeometry args={[1.15, 2.6, 9]} />
            <meshStandardMaterial color={c} roughness={1} />
          </mesh>
        </group>
      )
    case 'building':
      return (
        <group>
          <mesh position={[0, spec.H / 2, 0]} castShadow receiveShadow>
            <boxGeometry args={[spec.W, spec.H, spec.L]} />
            <meshStandardMaterial color={c} roughness={0.9} />
          </mesh>
          <mesh position={[0, spec.H + 0.45, 0]} castShadow>
            <boxGeometry args={[spec.W * 1.08, 0.9, spec.L * 1.08]} />
            <meshStandardMaterial color="#6f5144" roughness={0.9} />
          </mesh>
          {[-1, 1].map((x) => [-1, 1].map((z) => (
            <mesh key={`${x}-${z}`} position={[x * spec.W * 0.24, spec.H * 0.62, z * spec.L * 0.501]}>
              <boxGeometry args={[spec.W * 0.16, spec.H * 0.18, 0.025]} />
              <meshStandardMaterial color="#6d9db0" metalness={0.2} roughness={0.25} />
            </mesh>
          )))}
        </group>
      )
    case 'divider':
      return (
        <group>
          <mesh position={[0, spec.H / 2, 0]} castShadow receiveShadow>
            <boxGeometry args={[spec.W, spec.H, spec.L]} />
            <meshStandardMaterial color={c} roughness={0.9} />
          </mesh>
          {[-0.3, 0.3].map((x) => (
            <mesh key={x} position={[x, spec.H + 0.01, 0]}>
              <boxGeometry args={[0.08, 0.025, spec.L * 0.9]} />
              <meshStandardMaterial color="#e7e2d7" />
            </mesh>
          ))}
        </group>
      )
    case 'barrier':
      return (
        <group>
          {[-1, 1].map((z) => (
            <mesh key={z} position={[0, 0.32, z * spec.L * 0.36]} castShadow>
              <boxGeometry args={[0.22, 0.64, 0.2]} />
              <meshStandardMaterial color="#565b60" />
            </mesh>
          ))}
          <mesh position={[0, 0.72, 0]} castShadow>
            <boxGeometry args={[0.18, 0.2, spec.L]} />
            <meshStandardMaterial color={c} roughness={0.7} />
          </mesh>
          <mesh position={[0, 0.72, 0]}>
            <boxGeometry args={[0.19, 0.08, spec.L * 0.85]} />
            <meshStandardMaterial color="#f4f0e8" />
          </mesh>
        </group>
      )
    case 'pole':
      return (
        <group>
          <mesh position={[0, spec.H / 2, 0]} castShadow>
            <cylinderGeometry args={[0.09, 0.13, spec.H, 10]} />
            <meshStandardMaterial color={c} metalness={0.55} roughness={0.5} />
          </mesh>
          <mesh position={[0.32, spec.H - 0.15, 0]} rotation-z={-0.18} castShadow>
            <boxGeometry args={[0.8, 0.09, 0.1]} />
            <meshStandardMaterial color="#555b60" metalness={0.5} />
          </mesh>
          <mesh position={[0.68, spec.H - 0.22, 0]}>
            <boxGeometry args={[0.34, 0.12, 0.24]} />
            <meshStandardMaterial color="#f3e9bf" emissive="#f3e9bf" emissiveIntensity={0.15} />
          </mesh>
        </group>
      )
    case 'cone':
      return (
        <group>
          <mesh position={[0, 0.05, 0]}>
            <boxGeometry args={[0.42, 0.1, 0.42]} />
            <meshStandardMaterial color="#eeeeea" />
          </mesh>
          <mesh position={[0, spec.H * 0.52, 0]} castShadow>
            <coneGeometry args={[0.2, spec.H * 0.9, 12]} />
            <meshStandardMaterial color={c} roughness={0.75} />
          </mesh>
          <mesh position={[0, 0.29, 0]}>
            <cylinderGeometry args={[0.135, 0.16, 0.08, 12]} />
            <meshStandardMaterial color="#f5f1e8" />
          </mesh>
        </group>
      )
    case 'sign':
      return (
        <group>
          <mesh position={[0, spec.H / 2, 0]} castShadow>
            <cylinderGeometry args={[0.045, 0.055, spec.H, 8]} />
            <meshStandardMaterial color="#666a6d" metalness={0.45} />
          </mesh>
          <mesh position={[0, spec.H - 0.35, 0]} castShadow>
            <boxGeometry args={[0.65, 0.55, 0.12]} />
            <meshStandardMaterial color={c} roughness={0.6} />
          </mesh>
        </group>
      )
    case 'wall':
      return (
        <mesh position={[0, spec.H / 2, 0]} castShadow receiveShadow>
          <boxGeometry args={[spec.W, spec.H, spec.L]} />
          <meshStandardMaterial color={c} roughness={0.95} />
        </mesh>
      )
    default:
      return (
        <mesh position={[0, spec.H / 2, 0]} castShadow receiveShadow>
          <boxGeometry args={[spec.W, spec.H, spec.L]} />
          <meshStandardMaterial color={c} roughness={0.85} />
        </mesh>
      )
  }
}

function SelectionRing({ spec }) {
  const r = Math.max(spec.L, spec.W * 1.6) * 0.62
  return (
    <mesh rotation-x={-Math.PI / 2} position={[0, 0.07, 0]}>
      <ringGeometry args={[r, r + 0.1, 48]} />
      <meshBasicMaterial color="#f5c400" transparent opacity={0.95} depthWrite={false} />
    </mesh>
  )
}

export default function SceneObject({ v }) {
  const spec = CATALOG[v.type]
  const groupRef = useRef(null)
  const [obj, setObj] = useState(null)
  const setRef = useCallback((node) => { groupRef.current = node; setObj(node) }, [])
  const selected = useStore((s) => s.selectedId === v.id)
  const editable = useStore((s) => s.time === 0 && !s.playing)
  const gizmo = useStore((s) => s.gizmo)
  const labels = useStore((s) => s.layers.labels)
  const heightAt = useStore((s) => s.heightAt)
  const afterImpact = useStore((s) => s.time >= 0)
  const physics = useStore((s) => s.physics)

  useFrame(() => {
    const g = groupRef.current
    if (!g) return
    const st = useStore.getState()
    const isTarget = st.physics?.collisionTargetKind === 'object' && st.physics?.collisionTargetId === v.id
    if (isTarget && st.time > 0 && (v.type === 'person' || v.type === 'dog' || v.type === 'cow')) {
      const primary = st.vehicles.find((item) => item.id === st.physics?.primaryVehicleId) || st.vehicles[0]
      const heading = Number(v.postImpactHeading ?? primary?.heading ?? v.heading ?? 0)
      const a = heading * Math.PI / 180
      const distance = Math.min(st.time * 2.2, Number(v.postImpactDistance || 2.5))
      const x = v.x + Math.sin(a) * distance
      const z = v.z + Math.cos(a) * distance
      g.position.set(x, st.heightAt(x, z), z)
      g.rotation.set(0, bearingToRotY(heading), v.type === 'person' ? Math.min(0.25, st.time * 0.12) : 0)
    }
  })

  const onChange = () => {
    const g = groupRef.current
    if (!g) return
    const forward = new THREE.Vector3(0, 0, 1).applyQuaternion(g.quaternion)
    const heading = wrap360((Math.PI - Math.atan2(forward.x, forward.z)) / DEG)
    const st = useStore.getState()
    const y = st.heightAt(g.position.x, g.position.z)
    g.position.y = y
    st.updateObject(v.id, {
      x: round(g.position.x, 2),
      z: round(g.position.z, 2),
      heading: round(heading, 1),
    })
  }

  if (!spec) return null
  return (
    <>
      <group
        ref={setRef}
        position={[v.x, heightAt(v.x, v.z), v.z]}
        rotation={[0, bearingToRotY(v.heading), 0]}
        onClick={(e) => {
          const st = useStore.getState()
          if (st.placing) return
          e.stopPropagation()
          st.select(v.id)
        }}
      >
        <ObjectModel v={{ ...v, posture: afterImpact && ['person', 'dog', 'cow'].includes(v.type) && physics?.collisionTargetId === v.id && physics?.collisionTargetKind === 'object' ? (v.postImpactPosture || (v.type === 'person' ? 'prone-front' : 'lying')) : (v.posture || (v.type === 'person' ? 'upright' : 'standing')) }} spec={spec} />
        {selected && <SelectionRing spec={spec} />}
        {labels && (
          <Html position={[0, spec.H + 0.45, 0]} center style={{ pointerEvents: 'none' }} zIndexRange={[20, 0]}>
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
          onObjectChange={onChange}
        />
      )}
    </>
  )
}
import { useMemo, useRef } from 'react'
import { useFrame, useThree } from '@react-three/fiber'
import * as THREE from 'three'
import { useStore } from '../store.js'
import { fmtHour } from '../lib/geo.js'

// Physically loose but visually convincing day/night sky driven purely by env.hour.
function skyColors(hour) {
  const elev = Math.sin(((hour - 6) / 12) * Math.PI) // -1..1, 0 at 6/18, 1 at noon
  const stops = [
    { e: -1, top: '#03040c', bottom: '#0a0e1c', sun: '#1a2036', fog: '#05060d', amb: 0.06, sunI: 0.02 },
    { e: -0.08, top: '#0e1330', bottom: '#3a2a4a', sun: '#ff8a5b', fog: '#241d33', amb: 0.16, sunI: 0.35 },
    { e: 0.05, top: '#2a3a6b', bottom: '#ffb27a', sun: '#ffcf8f', fog: '#8a7a72', amb: 0.5, sunI: 1.6 },
    { e: 0.5, top: '#4f86c9', bottom: '#cfe4f2', sun: '#fff6e0', fog: '#c7d8e3', amb: 0.85, sunI: 2.6 },
    { e: 1.0, top: '#3f7fd1', bottom: '#e7f1f8', sun: '#ffffff', fog: '#d7e5ee', amb: 1.0, sunI: 3.2 },
  ]
  let a = stops[0], b = stops[stops.length - 1]
  for (let i = 0; i < stops.length - 1; i++) if (elev >= stops[i].e && elev <= stops[i + 1].e) { a = stops[i]; b = stops[i + 1]; break }
  if (elev < stops[0].e) { a = b = stops[0] }
  if (elev > stops[stops.length - 1].e) { a = b = stops[stops.length - 1] }
  const k = b.e === a.e ? 0 : THREE.MathUtils.clamp((elev - a.e) / (b.e - a.e), 0, 1)
  const c = (k2, p) => new THREE.Color(a[p]).lerp(new THREE.Color(b[p]), k2)
  return { top: c(k, 'top'), bottom: c(k, 'bottom'), sun: c(k, 'sun'), fog: c(k, 'fog'), amb: THREE.MathUtils.lerp(a.amb, b.amb, k), sunI: THREE.MathUtils.lerp(a.sunI, b.sunI, k), elev }
}

const WEATHER_FOG = { clear: 1, overcast: 0.55, rain: 0.4, fog: 0.12 }

function Sky({ top, bottom }) {
  const mat = useRef()
  const uniforms = useMemo(() => ({ top: { value: new THREE.Color() }, bottom: { value: new THREE.Color() } }), [])
  useFrame(() => { uniforms.top.value.copy(top); uniforms.bottom.value.copy(bottom) })
  return (
    <mesh scale={[1, 1, 1]}>
      <sphereGeometry args={[1900, 24, 16]} />
      <shaderMaterial
        ref={mat}
        side={THREE.BackSide}
        uniforms={uniforms}
        vertexShader={`varying vec3 vPos; void main(){ vPos = position; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }`}
        fragmentShader={`varying vec3 vPos; uniform vec3 top; uniform vec3 bottom; void main(){ float h = clamp(normalize(vPos).y*0.5+0.5, 0.0, 1.0); gl_FragColor = vec4(mix(bottom, top, pow(h, 0.55)), 1.0); }`}
      />
    </mesh>
  )
}

function Rain({ count = 2200 }) {
  const ref = useRef()
  const positions = useMemo(() => {
    const a = new Float32Array(count * 3)
    for (let i = 0; i < count; i++) {
      a[i * 3] = (Math.random() - 0.5) * 160
      a[i * 3 + 1] = Math.random() * 60
      a[i * 3 + 2] = (Math.random() - 0.5) * 160
    }
    return a
  }, [count])
  useFrame((_, dt) => {
    const cam = ref.current?.parent
    const arr = ref.current.geometry.attributes.position.array
    for (let i = 0; i < count; i++) {
      arr[i * 3 + 1] -= dt * 42
      if (arr[i * 3 + 1] < 0) arr[i * 3 + 1] = 60
    }
    ref.current.geometry.attributes.position.needsUpdate = true
  })
  return (
    <points ref={ref}>
      <bufferGeometry>
        <bufferAttribute attach="attributes-position" args={[positions, 3]} />
      </bufferGeometry>
      <pointsMaterial color="#bcd4e6" size={0.09} transparent opacity={0.55} sizeAttenuation />
    </points>
  )
}

export default function Environment() {
  const env = useStore((s) => s.env)
  const scene = useThree((s) => s.scene)
  const sky = useMemo(() => skyColors(env.hour), [env.hour])
  const fogDensity = useMemo(() => {
    const base = env.weather === 'fog' ? Math.min(env.visibility, 300) : env.visibility
    return 2.2 / Math.max(60, base * WEATHER_FOG[env.weather])
  }, [env.visibility, env.weather])
  const sunDist = 550
  const sunAngle = ((env.hour - 6) / 12) * Math.PI
  const sunPos = [Math.cos(sunAngle) * sunDist * 0.4, Math.max(sky.elev, -0.15) * sunDist, Math.sin(sunAngle * 0.3) * sunDist * 0.6 - sunDist * 0.3]

  return (
    <>
      <Sky top={sky.top} bottom={sky.bottom} />
      <fog attach="fog" args={[sky.fog.getHex(), 1, Math.min(1400, 3.2 / fogDensity)]} />
      <hemisphereLight args={[sky.top.getHex(), '#3a3f34', 0.55 * sky.amb + 0.12]} />
      <ambientLight intensity={0.18 * sky.amb + 0.05} />
      <directionalLight
        position={sunPos}
        intensity={sky.sunI * (env.weather === 'overcast' ? 0.5 : env.weather === 'rain' ? 0.4 : env.weather === 'fog' ? 0.3 : 1)}
        color={sky.sun}
        castShadow
        shadow-mapSize={[2048, 2048]}
        shadow-camera-near={1}
        shadow-camera-far={1000}
        shadow-camera-left={-90}
        shadow-camera-right={90}
        shadow-camera-top={90}
        shadow-camera-bottom={-90}
        shadow-bias={-0.0003}
      />
      {env.weather === 'rain' && <Rain />}
    </>
  )
}

export function EnvBadge() {
  const env = useStore((s) => s.env)
  return (
    <div className="ft-envbadge">
      <span>{fmtHour(env.hour)}</span>
      <span className="ft-dot" />
      <span className="capitalize">{env.weather}</span>
      <span className="ft-dot" />
      <span>{env.visibility >= 1000 ? `${(env.visibility / 1000).toFixed(1)} km` : `${env.visibility} m`} vis.</span>
    </div>
  )
}

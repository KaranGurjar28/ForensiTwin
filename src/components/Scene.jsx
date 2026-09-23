import { Suspense } from 'react'
import { Canvas } from '@react-three/fiber'
import * as THREE from 'three'
import { useStore } from '../store.js'
import World from './World.jsx'
import Vehicle from './Vehicle.jsx'
import Overlays from './Overlays.jsx'
import Environment from './Environment.jsx'
import CameraRig from './CameraRig.jsx'
import Snapshot from './Snapshot.jsx'

export default function Scene() {
  const vehicles = useStore((s) => s.vehicles)
  const sceneId = useStore((s) => s.sceneId)
  const cameraMode = useStore((s) => s.cameraMode)

  return (
    <Canvas
      key={sceneId}
      shadows
      camera={{ position: [28, 22, 30], fov: 50, near: 0.1, far: 4000 }}
      gl={{ antialias: true, toneMapping: THREE.ACESFilmicToneMapping, toneMappingExposure: 1.05 }}
      dpr={[1, 1.75]}
      onPointerMissed={() => useStore.getState().select(null)}
    >
      <Snapshot />
      <Environment />
      <Suspense fallback={null}>
        <World />
        {vehicles.map((v) => (
          <Vehicle key={v.id} v={v} />
        ))}
      </Suspense>
      <Overlays />
      <CameraRig />
      <group visible={cameraMode !== 'driver'} />
    </Canvas>
  )
}

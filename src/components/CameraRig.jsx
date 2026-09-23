import { useEffect, useMemo, useRef } from 'react'
import { useFrame, useThree } from '@react-three/fiber'
import { OrbitControls } from '@react-three/drei'
import * as THREE from 'three'
import { useStore } from '../store.js'
import { CATALOG } from '../lib/catalog.js'
import { poseAt } from '../lib/physics.js'
import { eyeFor } from '../lib/models.js'

const tmp = new THREE.Vector3()

export default function CameraRig() {
  const controls = useRef()
  const { camera } = useThree()
  const mode = useStore((s) => s.cameraMode)
  const prevMode = useRef(mode)

  useEffect(() => {
    if (mode === 'orbit' && prevMode.current !== 'orbit') {
      camera.position.set(28, 22, 30)
      controls.current?.target.set(0, 0, 0)
    }
    if (mode === 'top') {
      camera.position.set(0.01, 130, 0)
      controls.current?.target.set(0, 0, 0)
    }
    prevMode.current = mode
  }, [mode, camera])

  useFrame(() => {
    if (mode !== 'driver' && mode !== 'witness') return
    const st = useStore.getState()
    const v = st.vehicles.find((v) => v.id === st.selectedId) ?? st.vehicles[0]
    if (!v) return
    const spec = CATALOG[v.type]
    const pose = poseAt(v, st.time)
    const { pos, dir } = eyeFor(v, pose)
    if (mode === 'driver') {
      camera.position.set(...pos)
      tmp.set(pos[0] + dir[0] * 10, pos[1] - 0.05, pos[2] + dir[2] * 10)
      camera.lookAt(tmp)
    } else {
      const back = 9 + spec.L * 0.6
      camera.position.set(pose.x - dir[0] * back, spec.H + 5, pose.z - dir[2] * back)
      camera.lookAt(pose.x, spec.H * 0.4, pose.z)
    }
  })

  const orbitLike = mode === 'orbit' || mode === 'top'
  return orbitLike ? (
    <OrbitControls
      ref={controls}
      makeDefault
      enableDamping
      dampingFactor={0.08}
      minDistance={3}
      maxDistance={400}
      maxPolarAngle={mode === 'top' ? 0.1 : Math.PI / 2 - 0.02}
      mouseButtons={{ LEFT: THREE.MOUSE.ROTATE, MIDDLE: THREE.MOUSE.DOLLY, RIGHT: THREE.MOUSE.PAN }}
    />
  ) : null
}

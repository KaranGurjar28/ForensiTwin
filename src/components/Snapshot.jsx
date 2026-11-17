import { useEffect } from 'react'
import { useThree } from '@react-three/fiber'
import * as THREE from 'three'
import { useStore } from '../store.js'

// WebGL screenshots for PDF and evidence markers.
// A marker viewpoint is a SIMULATED camera, not an actual recorded CCTV frame.
export default function Snapshot() {
  const { gl, scene, camera } = useThree()
  useEffect(() => {
    const fn = (opts = {}) => {
      const originalPosition = camera.position.clone()
      const originalQuaternion = camera.quaternion.clone()
      const originalUp = camera.up.clone()
      const originalZoom = camera.zoom
      const originalFov = camera.fov
      try {
        if (opts.marker && Number.isFinite(Number(opts.marker.x)) && Number.isFinite(Number(opts.marker.z))) {
          const marker = opts.marker
          const x = Number(marker.x), z = Number(marker.z)
          const h = useStore.getState().heightAt(x, z)
          const y = (Number.isFinite(h) ? h : 0) + (marker.kind === 'cctv' ? 5.2 : 1.65)
          const bearing = ((Number(marker.heading) || 0) * Math.PI) / 180
          const isPole = marker.kind === 'cctv'
          const cameraX = x + (isPole ? Math.sin(bearing) * 1.34 : 0)
          const cameraZ = z - (isPole ? Math.cos(bearing) * 1.34 : 0)
          camera.position.set(cameraX, y, cameraZ)
          camera.up.set(0, 1, 0)
          camera.lookAt(new THREE.Vector3(
            cameraX + Math.sin(bearing) * 23,
            y - (marker.kind === 'cctv' ? 3.5 : 0.4),
            cameraZ - Math.cos(bearing) * 23,
          ))
          if (typeof camera.fov === 'number') camera.fov = marker.kind === 'cctv' ? 66 : 62
          camera.updateProjectionMatrix()
        }
        gl.render(scene, camera)
        return gl.domElement.toDataURL('image/jpeg', opts.quality ?? 0.86)
      } finally {
        camera.position.copy(originalPosition)
        camera.quaternion.copy(originalQuaternion)
        camera.up.copy(originalUp)
        camera.zoom = originalZoom
        if (typeof originalFov === 'number') camera.fov = originalFov
        camera.updateProjectionMatrix()
        gl.render(scene, camera)
      }
    }
    useStore.setState({ screenshotFn: fn })
    return () => useStore.setState(s => s.screenshotFn === fn ? { screenshotFn: null } : {})
  }, [gl, scene, camera])
  return null
}
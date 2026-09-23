import { useEffect } from 'react'
import { useThree } from '@react-three/fiber'
import { useStore } from '../store.js'

// Registers a GL-context screenshot function the outer React tree (outside <Canvas>) can call.
export default function Snapshot() {
  const { gl, scene, camera } = useThree()
  useEffect(() => {
    const fn = (opts = {}) => {
      gl.render(scene, camera)
      return gl.domElement.toDataURL('image/jpeg', opts.quality ?? 0.92)
    }
    useStore.setState({ screenshotFn: fn })
    return () => useStore.setState((s) => (s.screenshotFn === fn ? { screenshotFn: null } : {}))
  }, [gl, scene, camera])
  return null
}

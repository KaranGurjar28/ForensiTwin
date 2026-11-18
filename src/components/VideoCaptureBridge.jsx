import { useEffect } from 'react'
import { useThree } from '@react-three/fiber'
import * as THREE from 'three'
import { useStore } from '../store.js'

// Export frames at their true target resolution using a second WebGL renderer.
// Resizing the on-screen canvas would blur the recording and disrupt editing.
export default function VideoCaptureBridge() {
  const { gl, scene, camera } = useThree()

  useEffect(() => {
    const createCapture = ({ width, height }) => {
      if (!Number.isInteger(width) || !Number.isInteger(height) || width < 1 || height < 1) {
        throw new Error('Invalid export resolution.')
      }
      const canvas = document.createElement('canvas')
      canvas.width = width
      canvas.height = height
      const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: false, preserveDrawingBuffer: true })
      renderer.setPixelRatio(1)
      renderer.setSize(width, height, false)
      renderer.outputColorSpace = gl.outputColorSpace
      renderer.toneMapping = gl.toneMapping
      renderer.toneMappingExposure = gl.toneMappingExposure
      renderer.shadowMap.enabled = gl.shadowMap.enabled
      renderer.shadowMap.type = gl.shadowMap.type
      const exportCamera = camera.clone()
      let disposed = false

      return {
        canvas,
        draw() {
          if (disposed) throw new Error('The video renderer is no longer available.')
          exportCamera.copy(camera)
          if (exportCamera.isPerspectiveCamera) {
            exportCamera.aspect = width / height
            exportCamera.updateProjectionMatrix()
          } else if (exportCamera.isOrthographicCamera) {
            const halfH = (camera.top - camera.bottom) / 2
            const centerX = (camera.left + camera.right) / 2
            exportCamera.left = centerX - halfH * width / height
            exportCamera.right = centerX + halfH * width / height
            exportCamera.updateProjectionMatrix()
          }
          exportCamera.updateMatrixWorld(true)
          renderer.render(scene, exportCamera)
          return canvas
        },
        dispose() {
          if (disposed) return
          disposed = true
          renderer.dispose()
          renderer.forceContextLoss()
          canvas.width = 0
          canvas.height = 0
        },
      }
    }
    useStore.setState({ videoFrameFn: createCapture })
    return () => useStore.setState((s) => s.videoFrameFn === createCapture ? { videoFrameFn: null } : {})
  }, [gl, scene, camera])

  return null
}
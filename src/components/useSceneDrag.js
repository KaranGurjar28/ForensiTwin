import { useCallback, useEffect, useRef } from 'react'
import * as THREE from 'three'
import { useStore } from '../store.js'
import { round } from '../lib/geo.js'

// Drag a selected (or previously placed) model directly across the ground.
// The temporary draggingSceneId also disables OrbitControls while the pointer
// is held down, so a move does not rotate the camera instead.
export default function useSceneDrag({ id, kind, groupRef, heightOffset = 0 }) {
  const active = useRef(null)
  const moved = useRef(false)

  const finish = useCallback((event) => {
    const drag = active.current
    if (!drag) return
    if (event && drag.pointerId !== event.pointerId) return
    event?.stopPropagation?.()
    try { event?.target?.releasePointerCapture?.(drag.pointerId) } catch { /* capture already released */ }
    active.current = null
    if (useStore.getState().draggingSceneId === id) {
      useStore.setState({ draggingSceneId: null })
    }
  }, [id])

  useEffect(() => () => {
    active.current = null
    if (useStore.getState().draggingSceneId === id) {
      useStore.setState({ draggingSceneId: null })
    }
  }, [id])

  const onPointerDown = useCallback((event) => {
    const state = useStore.getState()
    if (event.button !== 0 || state.placing || state.tool !== 'select') return
    event.stopPropagation()
    moved.current = false

    // The editing position is T=0. Selecting a previously placed model always
    // returns to that pose and makes the move/rotate controls available again.
    if (state.playing || state.time !== 0) state.setTime(0)
    state.select(id)

    if (state.gizmo !== 'translate') return
    const group = groupRef.current
    if (!group) return

    const groundY = state.heightAt(group.position.x, group.position.z)
    const plane = new THREE.Plane(new THREE.Vector3(0, 1, 0), -groundY)
    const hit = new THREE.Vector3()
    if (!event.ray.intersectPlane(plane, hit)) return

    active.current = {
      pointerId: event.pointerId,
      plane,
      offsetX: group.position.x - hit.x,
      offsetZ: group.position.z - hit.z,
    }
    useStore.setState({ draggingSceneId: id })
    try { event.target.setPointerCapture?.(event.pointerId) } catch { /* pointer capture unsupported */ }
  }, [groupRef, id])

  const onPointerMove = useCallback((event) => {
    const drag = active.current
    if (!drag || event.pointerId !== drag.pointerId) return
    event.stopPropagation()
    const hit = new THREE.Vector3()
    if (!event.ray.intersectPlane(drag.plane, hit)) return

    const x = round(hit.x + drag.offsetX, 2)
    const z = round(hit.z + drag.offsetZ, 2)
    const group = groupRef.current
    if (!group) return
    if (Math.abs(x - group.position.x) < 0.01 && Math.abs(z - group.position.z) < 0.01) return

    moved.current = true
    const state = useStore.getState()
    group.position.set(x, state.heightAt(x, z) + heightOffset, z)
    if (kind === 'vehicle') state.updateVehicle(id, { x, z })
    else state.updateObject(id, { x, z })
  }, [groupRef, heightOffset, id, kind])

  const consumeMovedClick = useCallback(() => {
    const wasMoved = moved.current
    moved.current = false
    return wasMoved
  }, [])

  return {
    onPointerDown,
    onPointerMove,
    onPointerUp: finish,
    onPointerCancel: finish,
    isDragging: () => active.current !== null,
    consumeMovedClick,
  }
}
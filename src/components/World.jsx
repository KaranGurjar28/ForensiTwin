import { useEffect, useLayoutEffect, useMemo, useRef } from 'react'
import * as THREE from 'three'
import { useStore } from '../store.js'
import { buildWorld } from '../lib/osmGeometry.js'

const Y = new THREE.Vector3(0, 1, 0)

function handleGroundClick(e) {
  const s = useStore.getState()
  if (s.placing) {
    e.stopPropagation()
    s.addMarker(s.placing, e.point.x, e.point.z)
  } else {
    s.select(null)
  }
}

function Trees({ trees }) {
  const trunk = useRef()
  const crown = useRef()
  const geos = useMemo(() => ({
    trunk: new THREE.CylinderGeometry(0.12, 0.2, 2.2, 6).translate(0, 1.1, 0),
    crown: new THREE.IcosahedronGeometry(1.5, 1).translate(0, 3.5, 0),
  }), [])
  useLayoutEffect(() => {
    if (!trees.length || !trunk.current || !crown.current) return
    const m = new THREE.Matrix4(), q = new THREE.Quaternion(), s = new THREE.Vector3(), p = new THREE.Vector3(), c = new THREE.Color()
    trees.forEach((t, i) => {
      q.setFromAxisAngle(Y, t[3]); s.setScalar(t[2]); p.set(t[0], 0, t[1])
      m.compose(p, q, s)
      trunk.current.setMatrixAt(i, m)
      crown.current.setMatrixAt(i, m)
      c.setHSL(0.27 + (i % 7) * 0.008, 0.38, 0.2 + (i % 5) * 0.022)
      crown.current.setColorAt(i, c)
    })
    trunk.current.instanceMatrix.needsUpdate = true
    crown.current.instanceMatrix.needsUpdate = true
    if (crown.current.instanceColor) crown.current.instanceColor.needsUpdate = true
  }, [trees])
  if (!trees.length) return null
  return (
    <group key={trees.length}>
      <instancedMesh ref={trunk} args={[geos.trunk, undefined, trees.length]} castShadow>
        <meshStandardMaterial color="#5a4331" roughness={1} />
      </instancedMesh>
      <instancedMesh ref={crown} args={[geos.crown, undefined, trees.length]} castShadow>
        <meshStandardMaterial color="#ffffff" roughness={0.95} flatShading />
      </instancedMesh>
    </group>
  )
}

function Houses({ houses }) {
  const walls = useRef()
  const roofs = useRef()
  const geos = useMemo(() => ({
    wall: new THREE.BoxGeometry(1, 1, 1).translate(0, 0.5, 0),
    roof: new THREE.ConeGeometry(0.7071, 1, 4).rotateY(Math.PI / 4).translate(0, 0.5, 0),
  }), [])
  useLayoutEffect(() => {
    if (!houses.length || !walls.current || !roofs.current) return
    const m = new THREE.Matrix4(), q = new THREE.Quaternion(), s = new THREE.Vector3(), p = new THREE.Vector3(), c = new THREE.Color()
    houses.forEach((h, i) => {
      q.setFromAxisAngle(Y, h.rot)
      p.set(h.x, 0, h.z); s.set(h.w, h.h, h.d); m.compose(p, q, s)
      walls.current.setMatrixAt(i, m)
      walls.current.setColorAt(i, c.set(h.color))
      p.set(h.x, h.h, h.z); s.set(h.w * 1.08, 1.6 + (i % 3) * 0.3, h.d * 1.08); m.compose(p, q, s)
      roofs.current.setMatrixAt(i, m)
      roofs.current.setColorAt(i, c.set(i % 2 ? '#8a4b3a' : '#6d5d54'))
    })
    for (const r of [walls, roofs]) {
      r.current.instanceMatrix.needsUpdate = true
      if (r.current.instanceColor) r.current.instanceColor.needsUpdate = true
    }
  }, [houses])
  if (!houses.length) return null
  return (
    <group key={houses.length}>
      <instancedMesh ref={walls} args={[geos.wall, undefined, houses.length]} castShadow receiveShadow>
        <meshStandardMaterial color="#ffffff" roughness={0.9} />
      </instancedMesh>
      <instancedMesh ref={roofs} args={[geos.roof, undefined, houses.length]} castShadow>
        <meshStandardMaterial color="#ffffff" roughness={0.85} />
      </instancedMesh>
    </group>
  )
}

export default function World() {
  const osm = useStore((s) => s.osm)
  const layers = useStore((s) => s.layers)
  const greenery = useStore((s) => s.env.greenery)
  const wet = useStore((s) => s.env.weather === 'rain')

  const world = useMemo(
    () => (osm.data && osm.origin ? buildWorld(osm.data, osm.origin, { radius: osm.origin.radius }) : null),
    [osm.data, osm.origin],
  )
  const scatter = useMemo(() => (world ? world.scatter(greenery) : { trees: [], houses: [] }), [world, greenery])

  useEffect(() => {
    if (!world) return
    useStore.setState({ worldStats: { ...world.stats, roadNames: world.roadNames } })
    return () => {
      for (const g of [world.roadGeo, world.shoulderGeo, world.markGeo, world.buildingGeo]) g?.dispose()
    }
  }, [world])
  useEffect(() => {
    useStore.setState((s) => ({ worldStats: s.worldStats && { ...s.worldStats, trees: scatter.trees.length, houses: scatter.houses.length } }))
  }, [scatter])

  if (!world) return null
  return (
    <group>
      <mesh rotation-x={-Math.PI / 2} receiveShadow onClick={handleGroundClick}>
        <planeGeometry args={[8000, 8000]} />
        <meshStandardMaterial color="#58664f" roughness={1} />
      </mesh>
      {world.shoulderGeo && (
        <mesh geometry={world.shoulderGeo} receiveShadow onClick={handleGroundClick}>
          <meshStandardMaterial color="#6d7176" roughness={0.95} side={THREE.DoubleSide} polygonOffset polygonOffsetFactor={-1} polygonOffsetUnits={-1} />
        </mesh>
      )}
      {world.roadGeo && (
        <mesh geometry={world.roadGeo} receiveShadow onClick={handleGroundClick}>
          <meshStandardMaterial color={wet ? '#202429' : '#2d3035'} roughness={wet ? 0.35 : 0.95} metalness={wet ? 0.2 : 0} side={THREE.DoubleSide} polygonOffset polygonOffsetFactor={-2} polygonOffsetUnits={-2} />
        </mesh>
      )}
      {world.markGeo && (
        <mesh geometry={world.markGeo} onClick={handleGroundClick}>
          <meshStandardMaterial color="#e9e7dd" roughness={0.8} side={THREE.DoubleSide} polygonOffset polygonOffsetFactor={-4} polygonOffsetUnits={-4} />
        </mesh>
      )}
      {layers.buildings && world.buildingGeo && (
        <mesh geometry={world.buildingGeo} castShadow receiveShadow onClick={handleGroundClick}>
          <meshStandardMaterial vertexColors roughness={0.9} />
        </mesh>
      )}
      {layers.trees && <Trees trees={scatter.trees} />}
      {layers.trees && <Houses houses={scatter.houses} />}
    </group>
  )
}

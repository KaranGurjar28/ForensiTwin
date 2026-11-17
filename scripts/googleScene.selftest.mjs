// Run from the project root: node scripts/googleScene.selftest.mjs
// Verifies generated geometry without requesting a Google API key or external data.
import assert from 'node:assert/strict'
import { makeProjector } from '../src/lib/geo.js'
import { createTracedScene, emptySiteLayout } from '../src/lib/googleScene.js'
import { buildWorld } from '../src/lib/siteGeometry.js'

const center = { lat:23.0225,lon:72.5714 }
const proj=makeProjector(center.lat,center.lon)
const point=(x,z)=>{const [lat,lng]=proj.toGeo(x,z);return {lat,lng}}
const layout={
  roads:[
    {id:'close',name:'Manually traced central road',width:8.5,points:[point(-80,0),point(80,0)]},
    {id:'far',name:'Manually traced outer road',width:6.5,points:[point(700,0),point(780,0)]},
  ],
  buildings:[{id:'b1',name:'Observed structure',height:12,points:[point(-20,20),point(-10,20),point(-10,35),point(-20,35)]}],
}
for(const radius of [250,800,1500]) {
  const data=createTracedScene(center,radius,layout)
  const scene=buildWorld(data,{...center,radius},{radius,heightAt:()=>0})
  assert.equal(scene.stats.roads,radius===250?1:2)
  assert.equal(scene.stats.buildings,1)
  assert.ok(scene.roadGeo?.attributes.position.count>0)
  assert.ok(scene.buildingGeo?.attributes.position.count>0)
  for (const geo of [scene.roadGeo,scene.shoulderGeo,scene.markGeo,scene.crosswalkGeo,scene.buildingGeo]) geo?.dispose()
  console.log(`PASS radius ${radius}m: ${scene.stats.roads} traced roads, ${scene.stats.buildings} traced buildings`)
}
const a=createTracedScene(center,800,emptySiteLayout())
assert.deepEqual(a.elements,[])
const b=createTracedScene({lat:22,lon:73},800,emptySiteLayout())
assert.deepEqual(b.elements,[])
console.log('PASS: No fictional road/building grid generated for any location.')
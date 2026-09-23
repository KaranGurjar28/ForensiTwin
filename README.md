# ForensiTwin

A browser-based 3D digital-twin platform for traffic-collision reconstruction. Pin a
real-world location, generate a 1:1 3D scene from OpenStreetMap data, place vehicles,
apply frontal crush damage, and run first-order forensic physics calculations.

## Run it

```bash
npm install
npm run dev       # http://localhost:5173
npm run build     # production build → dist/
npm test          # headless checks for geometry + physics logic
```

No backend or API key is required. Map search uses OpenStreetMap Nominatim, and the
3D geometry is built from the Overpass API, both called directly from the browser.

## What's implemented (matches "Milestones Achieved" + core of the roadmap)

- **2D → 3D pipeline**: search or click a location, set a capture radius, and the app
  queries Overpass (rotating through 4 public mirrors with per-request timeout and
  in-memory caching) and procedurally builds smoothed road ribbons (Catmull-Rom),
  extruded buildings, and collision-aware trees/houses that never overlap roads or
  buildings (`src/lib/osmGeometry.js`).
- **Vehicle catalogue**: hatchback, sedan, SUV, truck, auto-rickshaw, motorcycle,
  pedestrian — each procedurally modelled (`src/lib/models.js`) so the app always
  works with zero setup. Drop a `.glb` into `public/models/` (see the README there)
  and it's used automatically instead, scaled and centred to the catalogue's
  real-world dimensions.
- **Kinematic controls**: translate/rotate gizmos, numeric X/Z/heading fields.
- **Morph-target-style crush damage**: a procedural vertex-displacement model
  (`src/lib/crush.js`) that deforms only the front zone, respects impact offset
  (full-width vs. corner hits), and works identically on procedural and GLB meshes.
- **Trajectory & skid-mark visualization**: pre-impact path, skid marks, post-impact
  rest position with a ghost outline, all driven by a play/scrub timeline.
- **Forensic physics** (`src/lib/physics.js`): work-energy skid-speed, Campbell-style
  crush energy (equivalent barrier speed), a full 2D forward momentum solve between
  any two vehicles, and a reverse momentum solve (rest positions → pre-impact speeds).
- **Environment**: time-of-day sky/lighting, weather (clear/overcast/rain/fog) with
  visibility-driven fog and auto headlights, adjustable greenery density.
- **Evidence markers**: debris, gouges, yaw marks, rest positions, witnesses — placed
  by clicking the ground, listed and annotatable in the sidebar.
- **Case files & export**: save/load the whole case as JSON (re-fetches map data on
  load), and export a PDF report with cover page, top-down/overview/driver's-eye
  captures, and every calculated speed (`src/lib/report.js`, uses jsPDF).
- **Responsive UI**: full sidebar on desktop, bottom-sheet drawer on mobile.

## Roadmap items not yet built

Elevation/DEM terrain, multi-user sync, and a real database backend (Firebase/
Supabase) for cloud case storage are out of scope for this pass — the app currently
uses flat terrain and local JSON files for save/load. The architecture (`store.js`,
pure `lib/` functions with no React or Three.js dependency) is written so any of
these can be added without reworking the geometry or physics.

## Project layout

```
src/
  lib/            pure logic: geo, overpass client, OSM→geometry, catalog,
                   procedural vehicle models, crush deformation, physics
  components/      World, Vehicle, Overlays, Environment, CameraRig, Scene,
                   MapPicker, TopBar, PlaybackBar
  components/panels/  Scene / Vehicles / Physics / Evidence / Case sidebar tabs
  store.js        zustand app state
scripts/selftest.mjs  headless tests for the lib/ logic (no browser needed)
```

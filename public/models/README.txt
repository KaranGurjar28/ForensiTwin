Optional: drop your own vehicle models here (.glb).

ForensiTwin ships with built-in procedural vehicles that always work.
If a file with one of these names exists, it is used automatically
(scaled to real-world length, centred, and made crushable):

  alto.glb        -> Compact hatchback
  swift.glb       -> Hatchback
  sedan.glb       -> Sedan
  suv.glb         -> SUV
  truck.glb       -> Truck
  rickshaw.glb    -> Auto-rickshaw
  motorcycle.glb  -> Motorcycle

Tips
  - Front of the vehicle should point to +Z. If it faces the other way,
    set  glbFlip: true  for that entry in src/lib/catalog.js.
  - Keep each model under ~50k vertices so the crush slider stays smooth.
  - Wheels are left rigid if their mesh name contains "wheel" or "tire".

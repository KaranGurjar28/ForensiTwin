import { useEffect, useState } from 'react'
import { useStore } from './store.js'
import MapPicker from './components/MapPicker.jsx'
import Scene from './components/Scene.jsx'
import TopBar from './components/TopBar.jsx'
import PlaybackBar from './components/PlaybackBar.jsx'
import ScenePanel from './components/panels/ScenePanel.jsx'
import VehiclesPanel from './components/panels/VehiclesPanel.jsx'
import PhysicsPanel from './components/panels/PhysicsPanel.jsx'
import EvidencePanel from './components/panels/EvidencePanel.jsx'
import CasePanel from './components/panels/CasePanel.jsx'

const PANELS = { scene: ScenePanel, vehicles: VehiclesPanel, physics: PhysicsPanel, evidence: EvidencePanel, case: CasePanel }

export default function App() {
  const view = useStore((s) => s.view)
  const tab = useStore((s) => s.tab)
  const placing = useStore((s) => s.placing)
  const [drawerOpen, setDrawerOpen] = useState(false)
  const Panel = PANELS[tab]

  useEffect(() => {
    const onKey = (e) => {
      if (e.key === 'Escape') useStore.getState().setPlacing(null)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  if (view === 'map') {
    return (
      <div className="ft-app">
        <div className="ft-hero-topbar">
          <span className="ft-logo">ForensiTwin</span>
          <span className="ft-hero-tag">Spatial forensics, from a pin to a scene</span>
        </div>
        <MapPicker />
      </div>
    )
  }

  return (
    <div className="ft-app ft-app-scene">
      <TopBar onOpenMenu={() => setDrawerOpen(true)} />
      <div className="ft-workspace">
        <div className={`ft-sidebar ${drawerOpen ? 'ft-sidebar-open' : ''}`}>
          <div className="ft-sidebar-drag" onClick={() => setDrawerOpen(false)} />
          <Panel />
        </div>
        <div className="ft-viewport" onClick={() => setDrawerOpen(false)}>
          <Scene />
          {placing && <div className="ft-placing-banner">Click the ground to place a marker · Esc to cancel</div>}
          <PlaybackBar />
        </div>
      </div>
      <button className="ft-fab" onClick={() => setDrawerOpen((v) => !v)}>
        {drawerOpen ? 'Close' : tab[0].toUpperCase() + tab.slice(1)}
      </button>
    </div>
  )
}

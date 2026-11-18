import { useEffect, useState } from 'react'
import { useStore } from './store.js'
import MapPicker from './components/MapPicker.jsx'
import Scene from './components/Scene.jsx'
import GoogleWorkspace from './components/GoogleWorkspace.jsx'
import SiteDataImport from './components/SiteDataImport.jsx'
import TopBar from './components/TopBar.jsx'
import PlaybackBar from './components/PlaybackBar.jsx'
import ScenePanel from './components/panels/ScenePanel.jsx'
import VehiclesPanel from './components/panels/VehiclesPanel.jsx'
import PhysicsPanel from './components/panels/PhysicsPanel.jsx'
import EvidencePanel from './components/panels/EvidencePanel.jsx'
import CasePanel from './components/panels/CasePanel.jsx'
import { saveWorkspaceFiles } from './lib/workspaceFiles.js'

const PANELS = {
  scene: ScenePanel,
  vehicles: VehiclesPanel,
  physics: PhysicsPanel,
  evidence: EvidencePanel,
  case: CasePanel,
}
const switchStyle = {
  position:'absolute', top:10, right:14, zIndex:9,
  display:'flex', flexWrap:'wrap', gap:5, padding:5, borderRadius:11, maxWidth:'calc(100% - 28px)',
  background:'rgba(13,23,34,.94)', border:'1px solid rgba(255,255,255,.23)',
  boxShadow:'0 3px 14px rgba(0,0,0,.33)',
}
const buttonStyle = {
  fontFamily:'inherit', fontSize:12, fontWeight:700, borderRadius:7,
  padding:'9px 12px', border:'none', cursor:'pointer', whiteSpace:'nowrap',
}

export default function App() {
  const view = useStore(s => s.view)
  const tab = useStore(s => s.tab)
  const placing = useStore(s => s.placing)
  const location = useStore(s => s.location)
  const osm = useStore(s => s.osm)
  const siteLayout = useStore(s => s.siteLayout)
  const [drawerOpen, setDrawerOpen] = useState(false)
  const [workspaceMode, setWorkspaceMode] = useState('google')
  const [showImporter, setShowImporter] = useState(false)
  const [allowEmptyScene, setAllowEmptyScene] = useState(false)
  const [savingWorkspace, setSavingWorkspace] = useState(false)
  const [saveMessage, setSaveMessage] = useState('')

  const Panel = PANELS[tab] || ScenePanel
  // Google displays a location; OSM provides editable road/building geometry.
  // Only a successful load with actual road/building ways opens Editable 3D.
  const builtFeatures = Array.isArray(osm?.data?.elements)
    ? osm.data.elements.filter(item => item?.tags?.highway || item?.tags?.building).length : 0
  const importedFeatures = (siteLayout?.roads?.length || 0) + (siteLayout?.buildings?.length || 0)
  const hasEditableGeometry = builtFeatures > 0

  // Successful automatic geography loads open the populated Three.js scene.
  // Do not switch to a blank grid while the request is pending or has failed.
  useEffect(() => {
    if (view === 'scene' && osm?.status === 'ready' && builtFeatures > 0) {
      setWorkspaceMode('mesh')
      setShowImporter(false)
      setAllowEmptyScene(false)
    }
  }, [view, osm?.loadedKey, osm?.status, builtFeatures])

  // Starting a new case location must never keep an old empty-lab override.
  useEffect(() => {
    setAllowEmptyScene(false)
    setWorkspaceMode(osm?.status === 'ready' && builtFeatures > 0 ? 'mesh' : 'google')
  }, [location?.lat, location?.lon])

  useEffect(() => {
    const onKey = (e) => {
      if (e.key === 'Escape') {
        useStore.getState().setPlacing(null)
        setShowImporter(false)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  // If the user changes location or clears the imported geometry, return
  // to the correct Google map rather than showing a deceptively blank simulation.
  useEffect(() => {
    if (workspaceMode === 'mesh' && !hasEditableGeometry && !allowEmptyScene) {
      setWorkspaceMode('google')
    }
  }, [workspaceMode, hasEditableGeometry, allowEmptyScene])

  async function handleSaveWorkspace() {
    if (savingWorkspace) return
    setSavingWorkspace(true)
    setSaveMessage('')
    try {
      const result = await saveWorkspaceFiles()
      if (result.cancelled) {
        setSaveMessage('Save cancelled. No files were changed.')
      } else if (result.method === 'folder') {
        setSaveMessage(`Saved both files to your selected folder (${result.featureCount} GeoJSON features).`)
      } else {
        setSaveMessage('Started both downloads. If one is missing, allow multiple downloads for this site.')
      }
    } catch (error) {
      setSaveMessage(`Save failed: ${error.message || String(error)}`)
    } finally {
      setSavingWorkspace(false)
    }
  }

  function openMesh() {
    if (!hasEditableGeometry && !allowEmptyScene) {
      setWorkspaceMode('google')
      setShowImporter(true)
      return
    }
    setWorkspaceMode('mesh')
  }

  if (view === 'map') {
    return <div className="ft-app">
      <div className="ft-hero-topbar">
        <span className="ft-logo">ForensiTwin</span>
        <span className="ft-hero-tag">Spatial forensics, from a pin to a scene</span>
      </div>
      <MapPicker />
    </div>
  }

  return <div className="ft-app ft-app-scene">
    <TopBar onOpenMenu={() => setDrawerOpen(true)} />
    <div className="ft-workspace">
      <div className={`ft-sidebar ${drawerOpen ? 'ft-sidebar-open' : ''}`}>
        <div className="ft-sidebar-drag" onClick={() => setDrawerOpen(false)} />
        <Panel />
      </div>
      <div className="ft-viewport" onClick={() => setDrawerOpen(false)}>
        {/* Preserve the editable Three.js engine mounted for camera captures,
            damage editing, physics input and existing PDF/video workflows. */}
        <div style={{position:'absolute',inset:0,
          visibility:workspaceMode==='mesh'?'visible':'hidden',
          pointerEvents:workspaceMode==='mesh'?'auto':'none'}}>
          <Scene />
        </div>
        {workspaceMode==='google' && location && <div style={{position:'absolute',inset:0}}>
          {/* This renderer uses Google's REAL geographic imagery and
              georeferenced illustrative objects, not generated fake buildings. */}
          <GoogleWorkspace />
        </div>}

        <div role="group" aria-label="Reconstruction view" style={switchStyle}>
          <button type="button" style={{...buttonStyle,
            background:workspaceMode==='google'?'#f6c400':'transparent',
            color:workspaceMode==='google'?'#12202d':'#f0f5f9'}}
            onClick={() => setWorkspaceMode('google')}>
            Google location + Replay
          </button>
          <button type="button" style={{...buttonStyle,
            background:workspaceMode==='mesh'?'#f6c400':'transparent',
            color:workspaceMode==='mesh'?'#12202d':'#f0f5f9'}}
            onClick={openMesh}>
            Editable 3D {hasEditableGeometry ? `(${builtFeatures} features)` : '· Add geometry'}
          </button>
          <button type="button" style={{...buttonStyle,background:'#2a8766',color:'#fff'}}
            onClick={handleSaveWorkspace}
            disabled={savingWorkspace}
            title="Choose a folder and save the editable 3D workspace JSON plus matching GeoJSON">
            {savingWorkspace ? 'Saving workspace…' : 'Save workspace (2 files)'}
          </button>
          <button type="button" style={{...buttonStyle,background:'transparent',color:'#cbd9e5'}}
            onClick={() => setShowImporter(true)} title="Import independently obtained GeoJSON road and building outlines">
            Import
          </button>
        </div>

        {saveMessage && <div role="status" style={{
          position: 'absolute', top: 67, right: 14, zIndex: 9,
          background: 'rgba(13,23,34,.96)', color: '#f2f7fb',
          border: '1px solid rgba(255,255,255,.24)', borderRadius: 8,
          padding: '9px 12px', fontSize: 12, maxWidth: 390,
          boxShadow: '0 3px 14px rgba(0,0,0,.3)',
        }}>{saveMessage}</div>}

        {workspaceMode==='mesh' && hasEditableGeometry && <div style={{position:'absolute',bottom:54,left:12,zIndex:8,
          background:'rgba(12,25,37,.80)',color:'#f7f9fb',fontSize:11,padding:'5px 9px',borderRadius:6,pointerEvents:'auto'}}>
          Geometry: {osm?.mirror || osm?.origin?.source || 'Unknown source'} · <a style={{color:'#ffdf70'}} target="_blank" rel="noreferrer" href="https://www.openstreetmap.org/copyright">© OpenStreetMap contributors</a> · <a style={{color:'#ffdf70'}} target="_blank" rel="noreferrer" href="https://www.openmaptiles.org/">OpenMapTiles</a> · <a style={{color:'#ffdf70'}} target="_blank" rel="noreferrer" href="https://openfreemap.org/">OpenFreeMap</a>
          <span style={{display:'block',fontSize:10,opacity:.83}}>Unmeasured building heights are estimated. Not survey-grade geometry.</span>
          {osm?.partial && <span style={{display:'block',color:'#ffcc66',fontWeight:800}}>WARNING: Some geographic tiles could not load. This scene is incomplete.</span>}
        </div>}

        {workspaceMode==='mesh' && (
          <>
            {!hasEditableGeometry && <div style={{position:'absolute',bottom:68,left:14,zIndex:8,
              background:'rgba(16,30,40,.92)',color:'#f0f6f9',padding:'10px 13px',
              borderRadius:9,maxWidth:440,fontSize:12,lineHeight:1.5}}>
              <strong>No editable roads or buildings were loaded.</strong> Retry the geographic data fetch or import independently sourced GeoJSON.
              <button type="button" style={{...buttonStyle,padding:'5px 8px',marginLeft:9,background:'#f6c400'}}
                onClick={() => setShowImporter(true)}>Import scene</button>
            </div>}
            {placing && <div className="ft-placing-banner">Click the ground to place a marker · Esc to cancel</div>}
            <PlaybackBar />
          </>
        )}

        {showImporter && <SiteDataImport
          onClose={() => setShowImporter(false)}
          onComplete={() => { setAllowEmptyScene(false); setWorkspaceMode('mesh'); setShowImporter(false) }}
          onEmptyScene={() => { setAllowEmptyScene(true); setWorkspaceMode('mesh'); setShowImporter(false) }}
        />}
      </div>
    </div>
    <button className="ft-fab" onClick={() => setDrawerOpen(v => !v)}>
      {drawerOpen ? 'Close' : tab[0].toUpperCase() + tab.slice(1)}
    </button>
  </div>
}
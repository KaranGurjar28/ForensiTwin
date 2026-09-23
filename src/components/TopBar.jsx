import { useStore } from '../store.js'
import { EnvBadge } from './Environment.jsx'

const TABS = [
  { id: 'scene', label: 'Scene' },
  { id: 'vehicles', label: 'Vehicles' },
  { id: 'physics', label: 'Physics' },
  { id: 'evidence', label: 'Evidence' },
  { id: 'case', label: 'Case' },
]

export default function TopBar({ onOpenMenu }) {
  const caseInfo = useStore((s) => s.caseInfo)
  const tab = useStore((s) => s.tab)
  const setTab = useStore((s) => s.setTab)
  const worldStats = useStore((s) => s.worldStats)

  return (
    <div className="ft-topbar">
      <div className="ft-topbar-left">
        <span className="ft-logo">ForensiTwin</span>
        <span className="ft-casechip">{caseInfo.number || 'Untitled case'}</span>
        {worldStats && <EnvBadge />}
      </div>
      <nav className="ft-tabs">
        {TABS.map((t) => (
          <button key={t.id} className={tab === t.id ? 'on' : ''} onClick={() => { setTab(t.id); onOpenMenu?.() }}>
            {t.label}
          </button>
        ))}
      </nav>
    </div>
  )
}

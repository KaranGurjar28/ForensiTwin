import { useEffect, useRef } from 'react'
import { useStore } from '../store.js'

const RATES = [0.25, 0.5, 1, 2]

export default function PlaybackBar() {
  const vehicles = useStore((s) => s.vehicles)
  const time = useStore((s) => s.time)
  const playing = useStore((s) => s.playing)
  const rate = useStore((s) => s.rate)
  const { tMin, tMax } = useStore((s) => ({ tMin: s.tMin, tMax: s.tMax }))
  const raf = useRef()
  const last = useRef(0)

  useEffect(() => {
    if (!playing) return
    last.current = performance.now()
    const step = (now) => {
      const dt = ((now - last.current) / 1000) * useStore.getState().rate
      last.current = now
      const st = useStore.getState()
      let t = st.time + dt
      if (t >= st.tMax) { t = st.tMax; useStore.setState({ time: t, playing: false }); return }
      useStore.setState({ time: t })
      raf.current = requestAnimationFrame(step)
    }
    raf.current = requestAnimationFrame(step)
    return () => cancelAnimationFrame(raf.current)
  }, [playing])

  if (!vehicles.length) return null
  const hasMotion = vehicles.some((v) => v.speed > 0 || v.postDist > 0)
  if (!hasMotion) return null

  const pct = ((time - tMin) / (tMax - tMin)) * 100

  return (
    <div className="ft-playbar">
      <button className="ft-playbtn" onClick={() => useStore.getState().setPlaying(!playing)}>
        {playing ? (
          <svg width="16" height="16" viewBox="0 0 24 24"><rect x="6" y="5" width="4" height="14" fill="currentColor" /><rect x="14" y="5" width="4" height="14" fill="currentColor" /></svg>
        ) : (
          <svg width="16" height="16" viewBox="0 0 24 24"><path d="M7 5v14l12-7z" fill="currentColor" /></svg>
        )}
      </button>
      <div className="ft-playtrack">
        <div className="ft-playfill" style={{ width: `${pct}%` }} />
        <div className="ft-playzero" style={{ left: `${((0 - tMin) / (tMax - tMin)) * 100}%` }} />
        <input type="range" min={tMin} max={tMax} step={0.02} value={time} onChange={(e) => useStore.getState().setTime(+e.target.value)} />
      </div>
      <span className="ft-playtime">{time <= -0.02 ? `T${time.toFixed(1)}s` : time >= 0.02 ? `T+${time.toFixed(1)}s` : 'Impact'}</span>
      <div className="ft-segmented ft-ratepicker">
        {RATES.map((r) => (
          <button key={r} className={rate === r ? 'on' : ''} onClick={() => useStore.getState().setRate(r)}>{r}×</button>
        ))}
      </div>
    </div>
  )
}

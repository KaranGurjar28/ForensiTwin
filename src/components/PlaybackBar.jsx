import { useEffect, useRef, useState } from 'react'
import { useStore } from '../store.js'
import { Output, WebMOutputFormat, BufferTarget, CanvasSource, Quality, getFirstEncodableVideoCodec } from 'mediabunny'

const RATES = [0.25, 0.5, 1, 2]
const RESOLUTIONS = {
  '1080p': { width: 1920, height: 1080, bitrate: 12_000_000 },
  '1440p': { width: 2560, height: 1440, bitrate: 24_000_000 },
  '4K': { width: 3840, height: 2160, bitrate: 45_000_000 },
}
const FPS_OPTIONS = [30, 60]
const nextFrame = () => new Promise((resolve) => requestAnimationFrame(resolve))

function drawBrand(ctx, width, height, caseNumber, time) {
  const scale = width / 1280
  const x = 26 * scale
  const y = 24 * scale
  const boxW = 370 * scale
  const boxH = 64 * scale
  ctx.save()
  ctx.fillStyle = 'rgba(13, 19, 26, 0.88)'
  ctx.beginPath()
  ctx.roundRect(x, y, boxW, boxH, 10 * scale)
  ctx.fill()
  ctx.fillStyle = '#f5c400'
  ctx.fillRect(x + 12 * scale, y + 12 * scale, 4 * scale, boxH - 24 * scale)
  ctx.font = `700 ${18 * scale}px Arial, sans-serif`
  ctx.fillStyle = '#f5c400'
  ctx.fillText('FORENSITWIN', x + 28 * scale, y + 27 * scale)
  ctx.font = `500 ${10 * scale}px Arial, sans-serif`
  ctx.fillStyle = '#f4f6f8'
  ctx.fillText('DIGITAL ACCIDENT RECONSTRUCTION', x + 28 * scale, y + 44 * scale)
  const label = caseNumber ? `CASE ${caseNumber}` : 'UNASSIGNED CASE'
  ctx.font = `600 ${11 * scale}px Arial, sans-serif`
  const rightW = ctx.measureText(label).width + 24 * scale
  ctx.fillStyle = 'rgba(13, 19, 26, 0.8)'
  ctx.beginPath()
  ctx.roundRect(width - rightW - 22 * scale, y, rightW, 32 * scale, 7 * scale)
  ctx.fill()
  ctx.fillStyle = '#f4f6f8'
  ctx.fillText(label, width - rightW - 10 * scale, y + 20 * scale)
  ctx.font = `600 ${12 * scale}px Arial, sans-serif`
  ctx.fillStyle = '#ffffff'
  const timeLabel = time < 0 ? `T ${time.toFixed(2)} s` : time > 0 ? `T+ ${time.toFixed(2)} s` : 'IMPACT'
  const timeW = ctx.measureText(timeLabel).width + 26 * scale
  ctx.fillStyle = 'rgba(13, 19, 26, 0.78)'
  ctx.beginPath()
  ctx.roundRect(width - timeW - 22 * scale, height - 52 * scale, timeW, 30 * scale, 7 * scale)
  ctx.fill()
  ctx.fillStyle = '#ffffff'
  ctx.fillText(timeLabel, width - timeW - 9 * scale, height - 32 * scale)
  ctx.restore()
}

export default function PlaybackBar() {
  const vehicles = useStore((s) => s.vehicles)
  const time = useStore((s) => s.time)
  const playing = useStore((s) => s.playing)
  const rate = useStore((s) => s.rate)
  const { tMin, tMax } = useStore((s) => ({ tMin: s.tMin, tMax: s.tMax }))
  const raf = useRef(null)
  const last = useRef(0)
  const [resolution, setResolution] = useState('1440p')
  const [fps, setFps] = useState(60)
  const [exporting, setExporting] = useState(false)
  const [exportMessage, setExportMessage] = useState('')

  useEffect(() => {
    if (!playing || exporting) return
    last.current = performance.now()
    const step = (now) => {
      const dt = Math.max(0, Math.min(0.1, (now - last.current) / 1000)) * useStore.getState().rate
      last.current = now
      const st = useStore.getState()
      const t = Math.min(st.tMax, st.time + dt)
      if (t >= st.tMax) {
        useStore.setState({ time: t, playing: false })
        return
      }
      useStore.setState({ time: t })
      raf.current = requestAnimationFrame(step)
    }
    raf.current = requestAnimationFrame(step)
    return () => cancelAnimationFrame(raf.current)
  }, [playing, exporting])

  const exportVideo = async () => {
    if (exporting) return
    if (typeof window.VideoEncoder === 'undefined') {
      setExportMessage('Frame-accurate export requires a current Chrome or Edge browser with WebCodecs support.')
      return
    }
    const createCapture = useStore.getState().videoFrameFn
    if (typeof createCapture !== 'function') {
      setExportMessage('Open Editable 3D and wait for the renderer before exporting.')
      return
    }

    const settings = RESOLUTIONS[resolution]
    const originalTime = useStore.getState().time
    setExporting(true)
    setExportMessage(`Preparing offline ${resolution} / ${fps} FPS export…`)
    let capture = null
    let output = null

    try {
      // This is an offline render: simulation time advances by exactly 1/FPS
      // for every encoded frame, regardless of how slowly the GPU renders.
      useStore.setState({ playing: false, time: useStore.getState().tMin })
      await nextFrame()
      capture = createCapture(settings)

      const canvas = document.createElement('canvas')
      canvas.width = settings.width
      canvas.height = settings.height
      const ctx = canvas.getContext('2d', { alpha: false })
      if (!ctx) throw new Error('Could not create the video output canvas.')

      const format = new WebMOutputFormat()
      const codec = await getFirstEncodableVideoCodec(['vp9', 'vp8'], {
        width: settings.width,
        height: settings.height,
        frameRate: fps,
      })
      if (!codec) throw new Error(`${resolution} / ${fps} FPS encoding is not supported by this browser. Try 30 FPS or a lower resolution.`)

      output = new Output({ format, target: new BufferTarget() })
      const source = new CanvasSource(canvas, {
        codec,
        quality: new Quality({ bitrate: Math.round(settings.bitrate * fps / 30) }),
        latencyMode: 'quality',
        hardwareAcceleration: 'prefer-hardware',
      })
      output.addVideoTrack(source, { frameRate: fps })
      await output.start()

      const state = useStore.getState()
      const simStart = state.tMin
      const simEnd = state.tMax
      const duration = Math.max(1 / fps, simEnd - simStart)
      const frameCount = Math.max(1, Math.ceil(duration * fps))
      const caseNumber = state.caseInfo?.number || ''

      for (let i = 0; i < frameCount; i++) {
        const simulationTime = Math.min(simEnd, simStart + i / fps)
        useStore.setState({ time: simulationTime, playing: false })

        // Let React Three Fiber's useFrame callbacks position vehicles,
        // camera, people and damage BEFORE capturing this simulation frame.
        await nextFrame()
        await nextFrame()
        const frame = capture.draw()
        ctx.drawImage(frame, 0, 0, settings.width, settings.height)
        drawBrand(ctx, settings.width, settings.height, caseNumber, simulationTime)

        // Explicit timestamps give a constant-frame-rate file. Waiting for
        // encoding backpressure never causes skipped simulation frames.
        await source.add(i / fps, 1 / fps, { keyFrame: i % (fps * 2) === 0 })
        if (i % Math.max(1, Math.round(fps / 3)) === 0 || i === frameCount - 1) {
          setExportMessage(`Rendering ${resolution} / ${fps} FPS… ${Math.round((i + 1) / frameCount * 100)}% (${i + 1}/${frameCount} frames)`)
        }
      }

      source.close()
      setExportMessage(`Finalizing ${resolution} / ${fps} FPS WebM video…`)
      await output.finalize()
      const buffer = output.target.buffer
      if (!buffer?.byteLength) throw new Error('The encoded video is empty.')

      const blob = new Blob([buffer], { type: 'video/webm' })
      const url = URL.createObjectURL(blob)
      const link = document.createElement('a')
      const safeCase = (caseNumber || 'case').replace(/[^\w-]+/g, '_')
      link.href = url
      link.download = `ForensiTwin_${safeCase}_${resolution}_${fps}fps_crash-replay.webm`
      document.body.appendChild(link)
      link.click()
      link.remove()
      window.setTimeout(() => URL.revokeObjectURL(url), 60_000)
      setExportMessage(`${resolution} / ${fps} FPS exported: ${frameCount} evenly timed frames. Offline rendering may take longer than the video duration.`)
    } catch (error) {
      setExportMessage(`Video export failed: ${error?.message || error}. Try 30 FPS or a lower resolution.`)
    } finally {
      if (output?.state === 'started') {
        try { await output.cancel() } catch { /* best-effort cleanup */ }
      }
      capture?.dispose?.()
      useStore.setState({ time: originalTime, playing: false })
      setExporting(false)
    }
  }

  if (!vehicles.length) return null
  const hasMotion = vehicles.some((v) => v.speed > 0 || v.postDist > 0)
  if (!hasMotion) return null
  const span = Math.max(0.001, tMax - tMin)
  const pct = Math.max(0, Math.min(100, ((time - tMin) / span) * 100))

  return (
    <div className="ft-playbar-wrap">
      <div className="ft-playbar">
        <button className="ft-playbtn" disabled={exporting} title={playing ? 'Pause replay' : 'Play replay'} onClick={() => useStore.getState().setPlaying(!playing)}>
          {playing ? (
            <svg width="16" height="16" viewBox="0 0 24 24"><rect x="6" y="5" width="4" height="14" fill="currentColor" /><rect x="14" y="5" width="4" height="14" fill="currentColor" /></svg>
          ) : (
            <svg width="16" height="16" viewBox="0 0 24 24"><path d="M7 5v14l12-7z" fill="currentColor" /></svg>
          )}
        </button>
        <div className="ft-playtrack">
          <div className="ft-playfill" style={{ width: `${pct}%` }} />
          <div className="ft-playzero" style={{ left: `${((0 - tMin) / span) * 100}%` }} />
          <input aria-label="Crash replay timeline" disabled={exporting} type="range" min={tMin} max={tMax} step={0.02} value={time} onChange={(e) => useStore.getState().setTime(+e.target.value)} />
        </div>
        <span className="ft-playtime">{time <= -0.02 ? `T${time.toFixed(1)}s` : time >= 0.02 ? `T+${time.toFixed(1)}s` : 'Impact'}</span>
        <div className="ft-segmented ft-ratepicker">
          {RATES.map((r) => <button key={r} disabled={exporting} className={rate === r ? 'on' : ''} onClick={() => useStore.getState().setRate(r)}>{r}×</button>)}
        </div>
        <label className="ft-video-quality" style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 11 }}>
          Quality
          <select aria-label="Video export resolution" value={resolution} disabled={exporting}
            onChange={(e) => setResolution(e.target.value)}
            style={{ color: '#fff', background: '#263440', border: '1px solid #61707d', borderRadius: 6, padding: '5px 3px', fontSize: 11 }}>
            <option value="1080p">1080p</option>
            <option value="1440p">2K / 1440p</option>
            <option value="4K">4K / 2160p</option>
          </select>
        </label>
        <label className="ft-video-fps" style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 11 }}>
          FPS
          <select aria-label="Video export frame rate" value={fps} disabled={exporting}
            onChange={(e) => setFps(Number(e.target.value))}
            style={{ color: '#fff', background: '#263440', border: '1px solid #61707d', borderRadius: 6, padding: '5px 3px', fontSize: 11 }}>
            {FPS_OPTIONS.map((value) => <option key={value} value={value}>{value} FPS</option>)}
          </select>
        </label>
        <button className="ft-export-video" disabled={exporting} onClick={exportVideo} title="Offline frame-accurate export; no skipped simulation frames">
          {exporting ? 'Recording…' : 'Export video'}
        </button>
      </div>
      {exportMessage && <div className="ft-export-message" role="status">{exportMessage}</div>}
    </div>
  )
}
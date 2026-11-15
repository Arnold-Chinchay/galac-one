// "Follow your own star": pick any dot (or frame an area first), the tracker follows it through every photograph,
// measures how fast it moves and how much its brightness changes, and the person reports what they think it is.
import { useEffect, useMemo, useRef, useState } from 'react'
import type { PointerEvent } from 'react'
import type { Tile } from '../data/types'
import { submitReport } from '../data/provider'
import { anonymousId, safeRead, safeWrite } from '../lib/storage'
import { timeColour } from '../lib/render'
import { track } from '../lib/track'
import type { Track } from '../lib/track'
import { Icon } from './Icons'
import FrameCanvas from './FrameCanvas'
import Pictogram from './Pictogram'
import { Scatter } from './Results'

type ReportLabel = 'moving' | 'variable' | 'static' | 'artifact' | 'unsure'
const OPTIONS: { label: ReportLabel; title: string }[] = [
  { label: 'moving', title: 'It moves' }, { label: 'variable', title: 'It blinks in place' },
  { label: 'static', title: 'A steady star' }, { label: 'artifact', title: 'A glitch' }, { label: 'unsure', title: 'Not sure' },
]
interface Find { tile_id: string; x: number; y: number; label: ReportLabel; total: number | null; sent: boolean; at: string }
const FINDS_KEY = 'galac.finds.v1'
const MOON_ARCSEC = 1860

export default function FollowStar({ tile }: { tile: Tile }) {
  const W = tile.manifest.width_px, H = tile.manifest.height_px, pix = tile.manifest.pixel_scale_arcsec || 6.15
  const [area, setArea] = useState<{ x0: number; y0: number; x1: number; y1: number } | null>(null)
  const [drag, setDrag] = useState<{ x0: number; y0: number; x1: number; y1: number } | null>(null)
  const [tr, setTr] = useState<Track | null>(null)
  const [k, setK] = useState(0), [playing, setPlaying] = useState(true)
  const [label, setLabel] = useState<ReportLabel | null>(null), [note, setNote] = useState('')
  const [sending, setSending] = useState(false), [sent, setSent] = useState<string>('')
  const [finds, setFinds] = useState<Find[]>(() => safeRead<Find[]>(FINDS_KEY, []))
  const box = useRef<HTMLDivElement>(null)

  useEffect(() => { setArea(null); setTr(null); setLabel(null); setNote(''); setSent('') }, [tile])
  const toPix = (e: PointerEvent) => {
    const r = box.current!.getBoundingClientRect()
    return { x: (e.clientX - r.left) / r.width * W - .5, y: (e.clientY - r.top) / r.height * H - .5 }
  }
  function choose(x: number, y: number) {
    if (!tile.cube) return
    const t = track(tile.cube, x, y, pix)
    setTr(t); setK(0); setPlaying(true); setLabel(null); setNote(''); setSent('')
  }
  function up(e: PointerEvent) {
    if (!drag) return
    const p = toPix(e), d = { ...drag, x1: p.x, y1: p.y }
    setDrag(null)
    if (Math.hypot(d.x1 - d.x0, d.y1 - d.y0) < 2) choose(d.x0, d.y0)
    else { setArea({ x0: Math.min(d.x0, d.x1), y0: Math.min(d.y0, d.y1), x1: Math.max(d.x0, d.x1), y1: Math.max(d.y0, d.y1) }); setTr(null) }
  }

  // Frames to loop: where the tracker saw the source, thinned to at most 80 so the loop stays short.
  const seq = useMemo(() => {
    if (!tr) return area ? Array.from({ length: tile.frames.length }, (_, i) => i).filter((_, i, a) => i % Math.ceil(a.length / 80) === 0) : []
    const det = tr.points.filter(q => q.detected).map(q => q.k)
    const use = det.length >= 3 ? det : tr.points.map(q => q.k)
    return use.filter((_, i, a) => i % Math.ceil(a.length / 80) === 0)
  }, [tr, area, tile])
  const crop = useMemo(() => {
    if (tr) {
      const det = tr.points.filter(q => q.detected), pts = det.length ? det : tr.points
      const cx = pts.reduce((s, q) => s + q.x, 0) / pts.length, cy = pts.reduce((s, q) => s + q.y, 0) / pts.length
      const reach = Math.max(...pts.map(q => Math.hypot(q.x - cx, q.y - cy)))
      return { cx, cy, half: Math.min(16, Math.max(7, Math.ceil(reach) + 4)) }
    }
    if (area) return { cx: (area.x0 + area.x1) / 2, cy: (area.y0 + area.y1) / 2, half: Math.max(4, Math.ceil(Math.max(area.x1 - area.x0, area.y1 - area.y0) / 2)) }
    return null
  }, [tr, area])
  useEffect(() => {
    if (!playing || seq.length < 2) return
    const id = setInterval(() => setK(n => (n + 1) % seq.length), 350)
    return () => clearInterval(id)
  }, [playing, seq.length])

  const side = crop ? crop.half * 2 + 1 : 1, ox = crop ? Math.round(crop.cx) - crop.half : 0, oy = crop ? Math.round(crop.cy) - crop.half : 0
  const fi = seq[Math.min(k, Math.max(0, seq.length - 1))], frame = fi !== undefined ? tile.frames[fi] : undefined
  const here = tr && fi !== undefined ? tr.points[fi] : undefined
  const det = tr?.points.filter(q => q.detected) ?? []
  const m = tr?.motion
  const moves = !!m && m.significance >= 5 && m.total >= 1
  // The brightness change is summed over ~7 pixels of unit noise, so pure noise scatters by about sqrt(7).
  const varies = !!tr && tr.light.length >= 10 && tr.variability > 2 * Math.sqrt(7)
  const t0 = det.length ? tile.frames[det[0].k].observed_at_utc : '', span = Math.max(1, (tr?.years ?? 0) * 365.25 * 86400000)

  function clickLoop(e: PointerEvent<HTMLDivElement>) {
    if (!crop) return
    const r = e.currentTarget.getBoundingClientRect()
    choose(ox + (e.clientX - r.left) / r.width * side - .5, oy + (e.clientY - r.top) / r.height * side - .5)
  }
  async function send() {
    if (!tr || !label) return
    setSending(true)
    const find: Find = { tile_id: tile.manifest.tile_id, x: tr.start.x, y: tr.start.y, label, total: m?.total ?? null, sent: false, at: new Date().toISOString() }
    try {
      const total = await submitReport({ tile_id: find.tile_id, x: find.x, y: find.y, label, note: note || undefined, pm_east: m?.east, pm_north: m?.north,
        pm_err: m?.error, n_detected: tr.detected, variability: Number.isFinite(tr.variability) ? tr.variability : undefined }, anonymousId())
      find.sent = true
      setSent(`Sent to the team. ${total} report${total === 1 ? '' : 's'} so far.`)
    } catch (e) {
      setSent(`Saved on this device; sending failed (${e instanceof Error ? e.message : 'network error'}).`)
    }
    const next = [find, ...finds].slice(0, 50)
    setFinds(next); safeWrite(FINDS_KEY, next); setSending(false)
  }

  return <div className={"follow" + (tr || (!tr && finds.length > 0) ? " has-side" : "")}>
    <section className="stage">
      <div className="stage-head"><div><span className="eyebrow">{tile.manifest.title.toUpperCase()} · ALL PHOTOGRAPHS COMBINED</span>
        <strong>{tr ? 'Following your star' : area ? 'Your area' : 'Pick a star, or frame an area'}</strong></div>
        {(tr || area) && <button className="text-button" onClick={() => { setTr(null); setArea(null) }}><Icon name="reset" size={14} />Start over</button>}</div>
      <div className="follow-grid">
        <div>
          <div className="pick" ref={box} onPointerDown={e => { const p = toPix(e); setDrag({ x0: p.x, y0: p.y, x1: p.x, y1: p.y }); try { e.currentTarget.setPointerCapture(e.pointerId) } catch { /* capture is optional */ } }}
            onPointerMove={e => { if (drag) { const p = toPix(e); setDrag({ ...drag, x1: p.x, y1: p.y }) } }} onPointerUp={up}>
            <FrameCanvas tile={tile} k={0} options={{ view: 'colour' }} label={`${tile.manifest.title}, every photograph combined`} />
            <svg viewBox={`0 0 ${W} ${H}`} aria-hidden="true">
              {drag && <rect x={Math.min(drag.x0, drag.x1) + .5} y={Math.min(drag.y0, drag.y1) + .5} width={Math.abs(drag.x1 - drag.x0)} height={Math.abs(drag.y1 - drag.y0)} fill="#78ecdb22" stroke="#78ecdb" strokeWidth={.15} />}
              {crop && <rect x={ox} y={oy} width={side} height={side} fill="none" stroke="#78ecdb" strokeWidth={.2} strokeDasharray=".6 .4" />}
              {tr && <circle cx={tr.start.x + .5} cy={tr.start.y + .5} r={1.6} fill="none" stroke="#ffb454" strokeWidth={.25} />}
            </svg>
          </div>
          <p className="loop-caption">Click any dot to follow it through all {tile.frames.length} photographs, or drag to frame an area and watch it. Blue-white dots are ordinary stars; red ones are cool objects.</p>
        </div>
        {crop ? <div>
          <div className="loop small" onClick={clickLoop} title={area && !tr ? 'Click a dot here to follow it' : undefined} style={{ cursor: area && !tr ? 'crosshair' : 'default' }}>
            {frame && <FrameCanvas tile={tile} k={frame.cube_index ?? fi} options={{ view: 'science', crop }} label={`Photograph ${k + 1} of ${seq.length}`} />}
            <svg viewBox={`0 0 ${side} ${side}`} aria-hidden="true">
              {here && <circle cx={here.x - ox + .5} cy={here.y - oy + .5} r={Math.max(1.2, side * .07)} fill="none" stroke="#78ecdb" strokeWidth={side * .008} strokeDasharray={here.detected ? undefined : `${side * .025} ${side * .02}`} />}
              {tr && det.map((q, i) => <circle key={i} cx={q.x - ox + .5} cy={q.y - oy + .5} r={side * .012} fill={timeColour((Date.parse(tile.frames[q.k].observed_at_utc) - Date.parse(t0)) / span)} opacity={.8} />)}
            </svg>
          </div>
          <div className="loop-bar">
            <button className="play-button" aria-label={playing ? 'Pause' : 'Play'} onClick={() => setPlaying(!playing)}><Icon name={playing ? 'pause' : 'play'} size={16} /></button>
            <input type="range" min={0} max={Math.max(0, seq.length - 1)} value={Math.min(k, Math.max(0, seq.length - 1))} aria-label="Photograph" onChange={e => { setPlaying(false); setK(+e.target.value) }} />
            <span className="mono">{frame?.observed_at_utc.slice(0, 10)}</span>
          </div>
          {area && !tr && <p className="loop-caption">Every photograph of your area, in time order. Click a dot in it to follow that one.</p>}
        </div> : <div className="follow-hint"><Icon name="crosshair" size={28} /><p>Your close-up appears here.</p></div>}
      </div>
    </section>

    {tr && <aside className="ask follow-results">
      <h2>What the computer measured</h2>
      {det.length < 5 ? <p className="facts">Only {det.length} photographs show something clear at that spot, too few to measure. Try a brighter dot.</p> : <>
        <div className={'measure ' + (moves ? 'yes' : '')}>
          <span className="eyebrow">MOTION</span>
          {m ? <><strong>{moves ? `Moves ${m.total.toFixed(1)}″ per year` : 'No motion we can measure'}</strong>
            <p>{moves
              ? `Measured to within ${m.error.toFixed(1)}″ per year. At that pace it would cross the width of the full Moon in about ${Math.round(MOON_ARCSEC / m.total).toLocaleString()} years, which is fast for a star: it is probably close to us.`
              : `Anything slower than about ${(Math.max(1, 5 * m.error)).toFixed(1)}″ per year would not show up in ${tr.years.toFixed(1)} years of SPHEREx photographs.`}</p></>
            : <p>Not enough time between the photographs to measure motion.</p>}
        </div>
        <div className={'measure ' + (varies ? 'yes' : '')}>
          <span className="eyebrow">BRIGHTNESS</span>
          <strong>{varies ? 'Its brightness changes' : 'Steady brightness'}</strong>
          {tr.light.length >= 3 && <Scatter points={tr.light} colour={() => '#7ce7d5'} yLabel="brighter (+) or fainter (−) than usual" height={110} />}
          <p>{varies ? 'It changes more than the noise does. That can mean a variable star, or a bright star the method could not fully subtract.' : 'Within the noise from one photograph to the next.'}</p>
        </div>
        <p className="facts">Followed in <b>{tr.detected}</b> of {tr.points.length} photographs over <b>{tr.years.toFixed(1)} years</b>. The dots on the close-up are where it was each time, blue (early) to red (late).</p>
      </>}

      <h2>What do you think it is?</h2>
      <div className="choices compact">{OPTIONS.map(o => <button key={o.label} className={'choice ' + (label === o.label ? 'chosen' : '')} onClick={() => setLabel(o.label)}>
        <Pictogram label={o.label} /><span><strong>{o.title}</strong></span></button>)}</div>
      <label className="note">Anything else? (optional)<textarea maxLength={280} rows={2} value={note} onChange={e => setNote(e.target.value)} placeholder="For example: it fades in May, or there is a second dot next to it" /></label>
      <div className="ask-actions">
        <button className="button primary" disabled={!label || sending || !!sent} onClick={send}>{sending ? 'Sending…' : 'Send to the team'} <Icon name="arrow" size={14} /></button>
        <button className="text-button" onClick={() => { setTr(null) }}>Pick another</button>
      </div>
      {sent && <div className="vote-status"><Icon name="check" size={16} />{sent}</div>}
      <p className="fine-print">Reports go to the team for review and are not shown to other visitors. The position is saved in this field’s pixels.</p>
    </aside>}

    {!tr && finds.length > 0 && <aside className="ask">
      <h2>Your finds</h2>
      <ul className="finds">{finds.slice(0, 8).map((f, i) => <li key={i}><Pictogram label={f.label} /><span><strong>{f.tile_id}</strong> · x {f.x}, y {f.y}{f.total !== null ? ` · ${f.total.toFixed(1)}″/yr` : ''}</span><small>{f.sent ? 'sent' : 'on this device'}</small></li>)}</ul>
    </aside>}
  </div>
}

// Sky hunt: every region the crawler stacks is searched for sources far redder than stars; people look at each one
// in the deep image and say what it is. New regions join the queue on their own as the sky grows.
import { useEffect, useMemo, useRef, useState } from 'react'
import { skyCounts, submitSkyVote } from '../data/provider'
import type { SkyCounts, SkyLabel } from '../data/provider'
import { anonymousId, safeRead, safeWrite } from '../lib/storage'
import { Icon } from './Icons'
import SkyMap from './SkyMap'
import { risesTo45 } from './SkySearch'
import { pixNest } from '../lib/healpix'

const HF = 'https://huggingface.co/datasets/naylamp-space/spherex-deep-sky/resolve/main'
const DEEP_SKY = `${HF}/hips/deep-sky`
const DONE_KEY = 'galac.hunt.v1'
interface Band { lam_um: [number, number]; snr: number | null; excess_mjy_sr?: number | null }
interface Source { ra: number; dec: number; excess_snr: number; y_dwarf_like: boolean; spectrum: Band[] }
interface Hit extends Source { region: string; key: string }

const CHOICES: { label: SkyLabel; title: string; hint: string }[] = [
  { label: 'red', title: 'Yes, a red dot', hint: 'A small round dot, redder than the stars around it' },
  { label: 'star', title: 'No, an ordinary star', hint: 'White or blue, like its neighbours' },
  { label: 'glare', title: 'No, glare from a bright star', hint: 'A halo or smear from something bright nearby' },
  { label: 'nothing', title: 'No, nothing there', hint: 'Just dark sky or noise in the ring' },
]
const VIEW_FOV = 0.1, CLOSEST_FOV = 0.05         // degrees: 6′ across, zoomable to 3′ (the deep layer has 3.2″ pixels)

/** What each answer looks like inside the ring. */
function Look({ label }: { label: SkyLabel }) {
  return <svg className="look" viewBox="0 0 40 40" aria-hidden="true">
    <rect width="40" height="40" rx="8" fill="#05080f" />
    {label === 'red' && <circle cx="20" cy="20" r="4" fill="#ff5a3c" />}
    {label === 'star' && <><circle cx="20" cy="20" r="4" fill="#e8f0ff" /><circle cx="9" cy="10" r="1.6" fill="#cfe0ff" /><circle cx="31" cy="29" r="1.4" fill="#cfe0ff" /></>}
    {label === 'glare' && <><circle cx="27" cy="13" r="13" fill="url(#halo)" /><defs><radialGradient id="halo"><stop offset="0" stopColor="#fff6e0" /><stop offset=".35" stopColor="#ffd38a" stopOpacity=".7" /><stop offset="1" stopColor="#ffd38a" stopOpacity="0" /></radialGradient></defs></>}
    {label === 'nothing' && <>{[[12, 14], [26, 9], [30, 27], [15, 30], [21, 21]].map(([x, y]) => <circle key={x} cx={x} cy={y} r=".9" fill="#5d6f88" />)}</>}
    <circle cx="20" cy="20" r="10" fill="none" stroke="#78ecdb" strokeWidth="1.4" strokeDasharray="3 2" />
  </svg>
}
/** Most promising first: cold-dwarf colours, then excess rising toward 4.5 µm; huge excesses (bright-star leftovers) last. */
const rank = (h: Source) => (h.y_dwarf_like ? 0 : risesTo45(h) ? 1 : 2) + (h.excess_snr > 150 ? 3 : 0)
export const sourceKey = (region: string, ra: number, dec: number) => `${region}:${ra.toFixed(4)}:${dec.toFixed(4)}`

/** How much redder than the stars it is, band by band: the cold-dwarf signature is a bar chart rising to the right. */
function Redness({ spectrum }: { spectrum: Band[] }) {
  const top = Math.max(5, ...spectrum.map(b => b.snr ?? 0))
  return <div className="redness" aria-label="Red excess by wavelength band">
    {spectrum.filter(b => b.lam_um[0] >= 2.5).map(b => <div key={b.lam_um[0]}><i style={{ height: `${Math.max(4, (b.snr ?? 0) / top * 100)}%` }} /><small>{b.lam_um[0]}</small></div>)}
  </div>
}

export default function SkyHunt({ onAnswered, alias }: { onAnswered: (cold: boolean) => void; alias: string }) {
  const [regions, setRegions] = useState<string[] | null>(null)
  const [queue, setQueue] = useState<Hit[]>([])
  const [counts, setCounts] = useState<SkyCounts>({})
  const [done, setDone] = useState<Record<string, SkyLabel>>(() => safeRead(DONE_KEY, {}))
  const [picked, setPicked] = useState<SkyLabel | null>(null), [error, setError] = useState('')
  const [tried, setTried] = useState<string[]>([]), [loading, setLoading] = useState(false)
  const busy = useRef(false)

  useEffect(() => {
    fetch(`${HF}/analysis/index.json`, { referrerPolicy: 'no-referrer' }).then(r => r.ok ? r.json() : null)
      .then(i => setRegions(i ? Object.keys(i.regions ?? {}).map(k => `r${k}`) : [])).catch(() => setRegions([]))
  }, [])
  // Keep a few sources ready: take an unvisited region, newest regions and cold-looking sources first.
  // One region at a time; a change of state must not cancel the download in flight.
  useEffect(() => {
    if (!regions || queue.length > 2 || busy.current) return
    const next = regions.filter(r => !tried.includes(r)).reverse()[0]
    if (!next) return
    busy.current = true; setLoading(true)
    setTried(t => [...t, next])
    Promise.all([
      fetch(`${HF}/analysis/regions/${next}.json`, { referrerPolicy: 'no-referrer' }).then(r => r.ok ? r.text() : '{}'),
      skyCounts(next),
    ]).then(([text, c]) => {
      const file = JSON.parse(text.replace(/\bNaN\b/g, 'null')) as { sources?: Source[] }
      // Only sources inside the region itself: just outside it the deep image has not been stacked yet.
      const pix = Number(next.slice(1))
      const hits = (file.sources ?? []).filter(s => pixNest(5, s.ra, s.dec) === pix).map(s => ({ ...s, region: next, key: sourceKey(next, s.ra, s.dec) }))
        .filter(h => !done[h.key]).sort((a, b) => rank(a) - rank(b) || b.excess_snr - a.excess_snr).slice(0, 12)
      setCounts(prev => ({ ...prev, ...c }))
      setQueue(q => [...q, ...hits])
    }).catch(() => {}).finally(() => { busy.current = false; setLoading(false) })
  }, [regions, queue.length, tried.length, loading])

  const hit = queue[0]
  const tally = useMemo(() => hit ? counts[hit.key] ?? { red: 0, star: 0, glare: 0, nothing: 0 } : null, [hit, counts])

  async function answer(label: SkyLabel) {
    if (!hit || picked) return
    setPicked(label); setError('')
    const nextDone = { ...done, [hit.key]: label }
    setDone(nextDone); safeWrite(DONE_KEY, nextDone)
    setCounts(c => ({ ...c, [hit.key]: { ...(c[hit.key] ?? { red: 0, star: 0, glare: 0, nothing: 0 }), [label]: (c[hit.key]?.[label] ?? 0) + 1 } }))
    onAnswered(hit.y_dwarf_like)
    try { await submitSkyVote({ source_key: hit.key, ra: hit.ra, dec: hit.dec, label }, anonymousId(), alias) }
    catch (e) { setError(e instanceof Error ? e.message : 'Not saved') }
  }
  function next() { setPicked(null); setError(''); setQueue(q => q.slice(1)) }
  useEffect(() => {
    const key = (e: KeyboardEvent) => {
      if ((e.target as HTMLElement)?.closest('input,textarea,select')) return
      const i = ['1', '2', '3', '4'].indexOf(e.key)
      if (i >= 0) { e.preventDefault(); e.stopImmediatePropagation(); void answer(CHOICES[i].label) }
      if (e.key === '5' && hit && !picked) { e.preventDefault(); e.stopImmediatePropagation(); next() }
      if (e.key === 'Enter' && picked) { e.preventDefault(); e.stopImmediatePropagation(); next() }
    }
    window.addEventListener('keydown', key, true)
    return () => window.removeEventListener('keydown', key, true)
  })

  const voters = tally ? Object.values(tally).reduce((s, n) => s + n, 0) : 0
  const top = tally ? (Object.entries(tally) as [SkyLabel, number][]).sort((a, b) => b[1] - a[1])[0] : null
  return <div className="play-main">
    <section className="arena hunt-arena" aria-label="Deep image around the source">
      {regions === null || (!hit && (loading || tried.length < regions.length)) ? <div className="stage-empty">Loading the latest sky…</div>
        : !hit ? <div className="stage-empty">{regions.length ? 'You have looked at every source in the regions searched so far. New regions arrive every couple of hours.' : 'The automatic sky search has not published a region yet.'}</div>
        : <div className="loop-card hunt-card" key={hit.key}>
          <SkyMap ra={hit.ra} dec={hit.dec} fovDeg={VIEW_FOV} minFov={CLOSEST_FOV} height="100%" caption={false} mosaics={[DEEP_SKY]} resetLabel="Back to the ring" />
          <span className="hunt-ring" aria-hidden="true"><b>look here</b></span>
          <div className="arena-top"><span className="chip">Region {hit.region.slice(1)} · RA {hit.ra.toFixed(3)}°, Dec {hit.dec.toFixed(3)}°</span>
            {hit.y_dwarf_like && <span className="chip hot">Cold-dwarf colours</span>}</div>
          <div className="hunt-legend"><Redness spectrum={hit.spectrum} /><span>How much redder than the stars, from 2.5 µm (left) to 5 µm (right)</span></div>
        </div>}
    </section>
    <aside className="answer-panel">
      <h2>Is there a small red dot in the ring?</h2>
      <div className="answers">{CHOICES.map((c, i) => <button key={c.label} disabled={!hit || !!picked} onClick={() => answer(c.label)} className={'answer ' + (picked === c.label ? 'chosen' : '')}>
        <Look label={c.label} /><span><strong>{c.title}</strong><small>{c.hint}</small></span><kbd>{i + 1}</kbd>
      </button>)}</div>
      {picked && tally && <div className="verdict right">
        <strong>{voters === 1 ? 'You are the first to look at this one.' : `${voters} people have looked: most say “${CHOICES.find(c => c.label === top?.[0])?.title.toLowerCase()}”.`}</strong>
        {hit?.y_dwarf_like ? ' Its colours match a cold brown dwarf; your answer helps decide whether it is worth a closer look.' : ''}
        {error && <span className="warn"> Not saved: {error}</span>}
        <button className="button primary compact" onClick={next}>Next source <Icon name="arrow" size={14} /></button>
      </div>}
      {!picked && <button className="answer unsure" disabled={!hit} onClick={next}>
        <svg className="look" viewBox="0 0 40 40" aria-hidden="true"><rect width="40" height="40" rx="8" fill="#05080f" /><text x="20" y="27" textAnchor="middle" fontSize="20" fontWeight="700" fill="#8fa3bb">?</text></svg>
        <span><strong>I can't tell</strong><small>Too blurry or confusing: show me another one. No points lost.</small></span><kbd>5</kbd>
      </button>}
      {!picked && <div className="answer-foot"><span>{Object.keys(done).length} looked at · {regions?.length ?? 0} regions searched</span></div>}
      <p className="play-hint">These come from the automatic search of the sky as it grows. A red dot that the community confirms becomes a lead for astronomers, not yet a discovery.</p>
    </aside>
  </div>
}

// Sky hunt: every region the crawler stacks is searched for sources far redder than stars; people look at each one
// in the deep image and say what it is. New regions join the queue on their own as the sky grows.
import { useEffect, useMemo, useRef, useState } from 'react'
import { skyCounts, submitSkyVote } from '../data/provider'
import type { SkyCounts, SkyLabel } from '../data/provider'
import { anonymousId, safeRead, safeWrite } from '../lib/storage'
import { Icon } from './Icons'
import SkyMap, { MIN_FOV } from './SkyMap'

const HF = 'https://huggingface.co/datasets/naylamp-space/spherex-deep-sky/resolve/main'
const DEEP_SKY = `${HF}/hips/deep-sky`
const DONE_KEY = 'galac.hunt.v1'
interface Band { lam_um: [number, number]; snr: number | null }
interface Source { ra: number; dec: number; excess_snr: number; y_dwarf_like: boolean; spectrum: Band[] }
interface Hit extends Source { region: string; key: string }

const CHOICES: { label: SkyLabel; title: string; hint: string; swatch: string }[] = [
  { label: 'red', title: 'A red dot', hint: 'Small, round and redder than the stars around it', swatch: '#ff6b4a' },
  { label: 'star', title: 'An ordinary star', hint: 'White or blue, like its neighbours', swatch: '#cfe0ff' },
  { label: 'glare', title: 'Glow from a bright star', hint: 'A halo, spike or smear next to something bright', swatch: '#ffd38a' },
  { label: 'nothing', title: 'Nothing clear', hint: 'Just noise in the circle', swatch: '#5d6f88' },
]
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
      const hits = (file.sources ?? []).map(s => ({ ...s, region: next, key: sourceKey(next, s.ra, s.dec) }))
        .filter(h => !done[h.key]).sort((a, b) => Number(b.y_dwarf_like) - Number(a.y_dwarf_like) || b.excess_snr - a.excess_snr).slice(0, 12)
      setCounts(prev => ({ ...prev, ...c }))
      setQueue(q => [...q, ...hits])
    }).catch(() => {}).finally(() => { busy.current = false; setLoading(false) })
  }, [regions, queue.length, tried.length, loading])

  const hit = queue[0]
  const tally = useMemo(() => hit ? counts[hit.key] ?? { red: 0, star: 0, glare: 0, nothing: 0 } : null, [hit, counts])
  const marks = useMemo(() => hit ? [{ id: hit.key, title: '', ra: hit.ra, dec: hit.dec }] : [], [hit])

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
          <SkyMap ra={hit.ra} dec={hit.dec} fovDeg={MIN_FOV} height="100%" caption={false} marks={marks} mosaics={[DEEP_SKY]} />
          <div className="arena-top"><span className="chip">Region {hit.region.slice(1)} · RA {hit.ra.toFixed(3)}°, Dec {hit.dec.toFixed(3)}°</span>
            {hit.y_dwarf_like && <span className="chip hot">Cold-dwarf colours</span>}</div>
          <div className="hunt-legend"><Redness spectrum={hit.spectrum} /><span>How much redder than the stars, from 2.5 µm (left) to 5 µm (right)</span></div>
        </div>}
    </section>
    <aside className="answer-panel">
      <h2>What is in the circle?</h2>
      <div className="answers">{CHOICES.map((c, i) => <button key={c.label} disabled={!hit || !!picked} onClick={() => answer(c.label)} className={'answer ' + (picked === c.label ? 'chosen' : '')}>
        <span className="swatch" style={{ background: c.swatch }} /><span><strong>{c.title}</strong><small>{c.hint}</small></span><kbd>{i + 1}</kbd>
      </button>)}</div>
      {picked && tally && <div className="verdict right">
        <strong>{voters === 1 ? 'You are the first to look at this one.' : `${voters} people have looked: most say “${CHOICES.find(c => c.label === top?.[0])?.title.toLowerCase()}”.`}</strong>
        {hit?.y_dwarf_like ? ' Its colours match a cold brown dwarf; your answer helps decide whether it is worth a closer look.' : ''}
        {error && <span className="warn"> Not saved: {error}</span>}
        <button className="button primary compact" onClick={next}>Next source <Icon name="arrow" size={14} /></button>
      </div>}
      {!picked && <div className="answer-foot"><button className="button secondary compact" disabled={!hit} onClick={next}>Skip <Icon name="arrow" size={14} /></button>
        <span>{Object.keys(done).length} looked at · {regions?.length ?? 0} regions searched</span></div>}
      <p className="play-hint">These come from the automatic search of the sky as it grows. A red dot that the community confirms becomes a lead for astronomers, not yet a discovery.</p>
    </aside>
  </div>
}

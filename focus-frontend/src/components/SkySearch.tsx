// The automatic search that runs as the sky grows: how much is covered and the most interesting very red sources.
import { useEffect, useState } from 'react'
import { Icon } from './Icons'

const BASE = 'https://huggingface.co/datasets/naylamp-space/spherex-deep-sky/resolve/main'
export interface RedSource { region: string; ra: number; dec: number; excess_snr: number; y_dwarf_like: boolean; moving: boolean; motion: { total: number; err: number; p_null: number } | null }
interface Index { n_regions: number; n_sources: number; n_cold: number; n_moving: number; sources: RedSource[] }

const TOTAL_REGIONS = 12288

export default function SkySearch({ onFocus }: { onFocus: (ra: number, dec: number) => void }) {
  const [done, setDone] = useState<number | null>(null), [index, setIndex] = useState<Index | null>(null)
  useEffect(() => {
    const c = new AbortController()
    const get = (p: string) => fetch(`${BASE}/${p}`, { signal: c.signal, referrerPolicy: 'no-referrer' }).then(r => r.ok ? r.json() : null).catch(() => null)
    get('state/regions.json').then(s => s && setDone(Object.keys(s.regions ?? {}).length))
    get('analysis/index.json').then(i => i && setIndex(i))
    return () => c.abort()
  }, [])
  const best = (index?.sources ?? []).filter(s => s.y_dwarf_like || s.moving).slice(0, 5)
  return <div className="sky-search">
    <span className="eyebrow">AUTOMATIC SEARCH · RUNS EVERY 2 HOURS</span>
    <div className="sky-search-stats">
      <div><strong>{done ?? '—'}</strong><span>regions stacked of {TOTAL_REGIONS.toLocaleString()}</span></div>
      <div><strong>{index?.n_regions ?? 0}</strong><span>searched for cold objects</span></div>
      <div><strong>{index?.n_cold ?? 0}</strong><span>cold-dwarf-like sources</span></div>
    </div>
    <p>New SPHEREx photographs are stacked region by region, starting along the ecliptic where Planet X would orbit. Each region is then searched for sources far redder than stars that also move, the same test that found WISE 0855 without being told where to look.</p>
    {best.length > 0 && <ul className="search-hits">{best.map((s, i) => <li key={i}><button onClick={() => onFocus(s.ra, s.dec)}>
      <span>{s.y_dwarf_like ? 'Cold-dwarf-like' : 'Very red'}{s.moving && s.motion ? ` · moves ${s.motion.total.toFixed(1)}″/yr` : ''}</span>
      <small>RA {s.ra.toFixed(3)}°, Dec {s.dec.toFixed(3)}° · {s.excess_snr.toFixed(0)}σ</small><Icon name="arrow" size={14} />
    </button></li>)}</ul>}
    {index && !best.length && <p className="fine-print">{index.n_sources} very red sources so far, none yet with a cold-dwarf spectrum or clear motion. Candidates still need follow-up before anyone calls them discoveries.</p>}
  </div>
}

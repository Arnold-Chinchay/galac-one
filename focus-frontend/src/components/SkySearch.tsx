// The automatic search that runs as the sky grows: how much is covered and the most interesting very red sources.
import { useEffect, useState } from 'react'
import { Icon } from './Icons'

const BASE = 'https://huggingface.co/datasets/naylamp-space/spherex-deep-sky/resolve/main'
export interface RedSource { region: string; ra: number; dec: number; excess_snr: number; y_dwarf_like: boolean; moving: boolean; motion: { total: number; err: number; p_null: number } | null
  spectrum?: { lam_um: [number, number]; snr: number | null; excess_mjy_sr?: number | null }[] }
interface Index { n_regions: number; n_sources: number; n_red?: number; n_cold: number; sources: RedSource[] }

const TOTAL_REGIONS = 12288
/** Same test as pipeline/region_analysis.py: a cold dwarf's excess rises from 3.5-4.0 um to 4.4-4.7 um. */
export function risesTo45(s: Pick<RedSource, 'spectrum'>): boolean {
  const at = (lo: number) => s.spectrum?.find(b => Math.abs(b.lam_um[0] - lo) < 1e-6)
  const a = at(3.5), b = at(4.4)
  if (a?.excess_mjy_sr != null && b?.excess_mjy_sr != null) return b.excess_mjy_sr >= 2 * Math.max(a.excess_mjy_sr, 0) && b.excess_mjy_sr > 0
  if (a?.snr != null && b?.snr != null) return b.snr >= Math.max(a.snr, 0) && b.snr > 0
  return false
}

export default function SkySearch({ onFocus, onCandidates }: { onFocus: (ra: number, dec: number) => void; onCandidates?: (c: RedSource[]) => void }) {
  const [done, setDone] = useState<number | null>(null), [index, setIndex] = useState<Index | null>(null)
  useEffect(() => {
    const c = new AbortController()
    const get = (p: string) => fetch(`${BASE}/${p}`, { signal: c.signal, referrerPolicy: 'no-referrer' }).then(r => r.ok ? r.json() : null).catch(() => null)
    get('state/regions.json').then(s => s && setDone(Object.keys(s.regions ?? {}).length))
    get('analysis/index.json').then(i => i && setIndex(i))
    return () => c.abort()
  }, [])
  // Cold-dwarf-like sources only: motion alone is not trusted over thousands of tests (see sky_publish.py).
  const cold = (index?.sources ?? []).filter(s => s.y_dwarf_like && risesTo45(s))
  const coldKey = cold.map(s => `${s.ra},${s.dec}`).join(';')
  useEffect(() => { onCandidates?.(cold) }, [coldKey])
  const best = [...cold].sort((a, b) => b.excess_snr - a.excess_snr).slice(0, 5)
  return <div className="sky-search">
    <span className="eyebrow">AUTOMATIC SEARCH · RUNS EVERY 2 HOURS</span>
    <div className="sky-search-stats">
      <div><strong>{done ?? '—'}</strong><span>regions stacked of {TOTAL_REGIONS.toLocaleString()}</span></div>
      <div><strong>{index?.n_regions ?? 0}</strong><span>searched for cold objects</span></div>
      <div><strong>{index ? cold.length : 0}</strong><span>cold-dwarf-like candidates</span></div>
    </div>
    <p>New SPHEREx photographs are stacked region by region, starting along the ecliptic where Planet X would orbit. Each region is then searched for sources far redder than stars{index?.n_red ? ` (${index.n_red.toLocaleString()} so far)` : ''}, and those with the spectrum of a cold brown dwarf are kept as candidates: the same test that found WISE 0855 without being told where to look.</p>
    {best.length > 0 && <ul className="search-hits">{best.map((s, i) => <li key={i}><button onClick={() => onFocus(s.ra, s.dec)}>
      <span>Cold-dwarf-like · {s.excess_snr.toFixed(0)}σ red excess</span>
      <small>RA {s.ra.toFixed(3)}°, Dec {s.dec.toFixed(3)}°{s.motion ? ` · motion ${s.motion.total.toFixed(1)} ± ${s.motion.err.toFixed(1)}″/yr${s.moving ? '' : ', not significant'}` : ''}</small><Icon name="arrow" size={14} />
    </button></li>)}</ul>}
    <p className="fine-print">{index && !best.length ? 'No source with a cold-dwarf spectrum yet. ' : ''}Candidates are leads, not discoveries: each needs checking against other catalogues and more time to confirm any motion.</p>
  </div>
}

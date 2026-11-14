// Measurements the pipeline published next to each tile: light curve, proper motion or red-source search.
import { useEffect, useState } from 'react'
import type { ReactNode } from 'react'
import { readJson } from '../data/provider'
import { mjdToUtc } from '../data/naylamp'

interface LightCurve { label: string; points: [number, number, number][]; period?: { period_d: number; fap: number } | null }
interface ProperMotion { label: string; n: number; years: number; pm_mas_yr: [number, number]; err_mas_yr: [number, number]; reference_mas_yr?: [number, number] | null; points: [number, number, number][] }
interface RedSource {
  ra: number; dec: number; excess_snr: number; y_dwarf_like: boolean
  motion?: { pm_ra_arcsec_yr: number; pm_dec_arcsec_yr: number; err_arcsec_yr: number; p_null: number; years: number } | null
  spectrum: { lam_um: [number, number]; excess_mjy_sr: number; snr: number | null }[]
}
interface RedSearch { sources: RedSource[] }
interface Loaded { lightcurve?: LightCurve; propermotion?: ProperMotion; redsearch?: RedSearch }

const DETECTOR_COLOURS = ['#8fb8ff', '#7ce7d5', '#b8e986', '#e4b66d', '#f08c6c', '#e06c9f']
const date = (mjd: number) => mjdToUtc(mjd).slice(0, 10)
const quantile = (values: number[], q: number) => { const s = [...values].sort((a, b) => a - b); return s[Math.round(q * (s.length - 1))] }
const range = (values: number[]) => { const lo = quantile(values, .02), hi = quantile(values, .98), pad = (hi - lo) * .12 || 1; return [lo - pad, hi + pad] as const }
const fmt = (n: number, digits = 2) => n.toFixed(digits)

function Scatter({ points, colour, line, yLabel, height = 120 }: { points: [number, number, number?][]; colour: (p: [number, number, number?]) => string; line?: (x: number) => number; yLabel: string; height?: number }) {
  const W = 320, L = 34, R = 6, T = 8, B = 18
  const xs = points.map(p => p[0]), ys = points.map(p => p[1])
  const x0 = Math.min(...xs), x1 = Math.max(...xs), [y0, y1] = range(ys)
  const px = (x: number) => L + (x - x0) / (x1 - x0 || 1) * (W - L - R), py = (y: number) => T + (1 - (y - y0) / (y1 - y0)) * (height - T - B)
  return <svg className="result-chart" viewBox={`0 0 ${W} ${height}`} role="img" aria-label={`${yLabel} against observation date`}>
    <line x1={L} y1={height - B} x2={W - R} y2={height - B} /><line x1={L} y1={T} x2={L} y2={height - B} />
    <text x={L - 4} y={T + 7} textAnchor="end">{fmt(y1, Math.abs(y1) < 10 ? 1 : 0)}</text>
    <text x={L - 4} y={height - B} textAnchor="end">{fmt(y0, Math.abs(y0) < 10 ? 1 : 0)}</text>
    <text x={L} y={height - 5}>{date(x0)}</text><text x={W - R} y={height - 5} textAnchor="end">{date(x1)}</text>
    <text className="axis-title" x={L + 4} y={T + 7}>{yLabel}</text>
    {line && <line className="fit" x1={px(x0)} y1={py(line(x0))} x2={px(x1)} y2={py(line(x1))} />}
    {points.filter(p => p[1] >= y0 && p[1] <= y1).map((p, i) => <circle key={i} cx={px(p[0])} cy={py(p[1])} r={1.8} fill={colour(p)} />)}
  </svg>
}

function LightCurvePanel({ d }: { d: LightCurve }) {
  const significant = d.period && d.period.fap < 1e-6
  return <>
    <Scatter points={d.points} colour={p => DETECTOR_COLOURS[((p[2] ?? 1) - 1) % 6]} yLabel="relative brightness" />
    <div className="result-legend">{DETECTOR_COLOURS.map((c, i) => <span key={c}><i style={{ background: c }} />D{i + 1}</span>)}</div>
    {d.period && <p className="result-number">{significant ? <>Period <strong>{fmt(d.period.period_d, 0)} days</strong></> : <>No clear period</>}</p>}
    <p className="subtle-label">{d.points.length} SPHEREx measurements of {d.label}, with the wavelength dependence of each frame removed.{d.period && (significant
      ? ` False-alarm probability ${d.period.fap.toExponential(0)}.`
      : ` The strongest periodicity (${fmt(d.period.period_d, 0)} d) is weak: false-alarm probability ${d.period.fap.toExponential(0)}.`)}</p>
  </>
}

function ProperMotionPanel({ d }: { d: ProperMotion }) {
  const [pmRa, pmDec] = d.pm_mas_yr, total = Math.hypot(pmRa, pmDec)
  const error = Math.hypot(pmRa * d.err_mas_yr[0], pmDec * d.err_mas_yr[1]) / total
  const reference = d.reference_mas_yr ? Math.hypot(...d.reference_mas_yr) : null
  const t0 = quantile(d.points.map(p => p[0]), .5)
  const axis = (k: 1 | 2, pm: number, label: string) => {
    const pts = d.points.map(p => [p[0], p[k] / 1000] as [number, number])
    const mid = quantile(pts.map(p => p[1]), .5)
    return <Scatter points={pts} colour={() => '#7ce7d5'} yLabel={label} height={96} line={x => mid + pm / 1000 * (x - t0) / 365.25} />
  }
  return <>
    {axis(1, pmRa, 'ΔRA (″)')}{axis(2, pmDec, 'ΔDec (″)')}
    <p className="result-number">SPHEREx <strong>{fmt(total / 1000)} ± {fmt(error / 1000)} ″/yr</strong></p>
    {reference && <p className="result-number reference">Gaia DR3 {fmt(reference / 1000)} ″/yr <span>({total > reference ? '+' : '−'}{fmt(Math.abs(total / reference - 1) * 100, 1)}%)</span></p>}
    <p className="subtle-label">{d.n} positions of {d.label} over {fmt(d.years, 1)} years, measured on SPHEREx frames alone. The line is the fitted motion.</p>
  </>
}

function RedSearchPanel({ d }: { d: RedSearch }) {
  const cold = d.sources.find(s => s.y_dwarf_like)
  const peak = cold ? Math.max(...cold.spectrum.map(b => b.excess_mjy_sr), 1e-9) : 1
  return <>
    {cold && <>
      <div className="band-chart" role="img" aria-label="Excess brightness of the cold source by wavelength band">
        {cold.spectrum.map(b => <div key={b.lam_um[0]}><span style={{ height: `${Math.max(2, b.excess_mjy_sr / peak * 100)}%` }} className={b.snr !== null && b.snr >= 5 ? 'strong' : ''} /><small>{b.lam_um[0]}–{b.lam_um[1]}</small><em>{b.snr === null ? '—' : fmt(b.snr, 1) + 'σ'}</em></div>)}
      </div>
      <p className="subtle-label">Excess brightness by wavelength band (µm). Nothing below 3.5 µm, bright beyond 4 µm: the spectrum of a very cold object.</p>
      {cold.motion && <p className="result-number">Motion <strong>{fmt(Math.hypot(cold.motion.pm_ra_arcsec_yr, cold.motion.pm_dec_arcsec_yr), 1)} ± {fmt(cold.motion.err_arcsec_yr, 1)} ″/yr</strong></p>}
    </>}
    <table className="result-table"><thead><tr><th>RA, Dec</th><th>Excess</th><th>Motion ″/yr</th><th>p</th></tr></thead><tbody>
      {d.sources.map(s => <tr key={`${s.ra}${s.dec}`} className={s.y_dwarf_like ? 'hit' : ''}><td>{fmt(s.ra, 3)}, {fmt(s.dec, 3)}</td><td>{fmt(s.excess_snr, 0)}σ</td><td>{s.motion ? `${fmt(Math.hypot(s.motion.pm_ra_arcsec_yr, s.motion.pm_dec_arcsec_yr), 1)} ± ${fmt(s.motion.err_arcsec_yr, 1)}` : '—'}</td><td>{s.motion ? fmt(s.motion.p_null, 2) : '—'}</td></tr>)}
    </tbody></table>
    <p className="subtle-label">Blind search of a wider field for sources far redder than the stars. {cold ? 'The highlighted source is the only one with a cold-dwarf spectrum, and the only one whose motion is unlikely to be chance (p is the probability of that shift from random splits of the frames). It lies at the expected position of WISE 0855.' : 'No source passed the cold-dwarf test.'}</p>
  </>
}

export default function Results({ filesUrl }: { filesUrl: string }) {
  const [data, setData] = useState<Loaded | null>(null)
  useEffect(() => {
    const controller = new AbortController()
    setData(null)
    const get = <T,>(name: string) => readJson<T>(filesUrl + name, controller.signal).catch(() => undefined)
    Promise.all([get<LightCurve>('lightcurve.json'), get<ProperMotion>('propermotion.json'), get<RedSearch>('redsearch.json')])
      .then(([lightcurve, propermotion, redsearch]) => { if (!controller.signal.aborted) setData({ lightcurve, propermotion, redsearch }) })
    return () => controller.abort()
  }, [filesUrl])
  const section = (title: string, body: ReactNode) => <div className="result-block"><span className="eyebrow">{title}</span>{body}</div>
  if (!data) return <p className="subtle-label">Loading measurements…</p>
  if (!data.lightcurve?.points?.length && !data.propermotion?.points?.length && !data.redsearch?.sources?.length) return <p className="subtle-label">No measurement has been published for this field yet.</p>
  return <>
    {data.propermotion?.points?.length ? section('PROPER MOTION', <ProperMotionPanel d={data.propermotion} />) : null}
    {data.lightcurve?.points?.length ? section('LIGHT CURVE', <LightCurvePanel d={data.lightcurve} />) : null}
    {data.redsearch?.sources?.length ? section('COLD-OBJECT SEARCH', <RedSearchPanel d={data.redsearch} />) : null}
  </>
}

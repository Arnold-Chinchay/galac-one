// Close-ups of one candidate on the frames where the detector saw it, plus the plain facts of its track.
import type { Candidate, Tile } from '../data/types'
import FrameCanvas from './FrameCanvas'

export function candidateFacts(tile: Tile, candidate: Candidate) {
  const byId = new Map(tile.frames.map(f => [f.frame_id, f]))
  const seen = candidate.positions.filter(p => p.detected).map(p => ({ ...p, frame: byId.get(p.frame_id)! })).filter(p => p.frame)
  if (!seen.length) return null
  const first = seen[0], last = seen[seen.length - 1]
  const shiftPx = Math.hypot(last.x_px - first.x_px, last.y_px - first.y_px)
  const days = (Date.parse(last.frame.observed_at_utc) - Date.parse(first.frame.observed_at_utc)) / 86400000
  const cx = seen.reduce((s, p) => s + p.x_px, 0) / seen.length, cy = seen.reduce((s, p) => s + p.y_px, 0) / seen.length
  return { seen, first, last, shiftPx, shiftArcsec: shiftPx * (tile.manifest.pixel_scale_arcsec || 0), days, cx, cy }
}

export default function CandidateAid({ tile, candidate, onPick }: { tile: Tile; candidate: Candidate; onPick: (frameId: string) => void }) {
  const facts = candidateFacts(tile, candidate)
  if (!facts) return null
  const { seen, first, last, shiftPx, shiftArcsec, days, cx, cy } = facts
  const count = Math.min(6, seen.length), picks = Array.from({ length: count }, (_, i) => seen[Math.round(i * (seen.length - 1) / Math.max(1, count - 1))])
  const half = 6
  return <div className="candidate-aid">
    <span className="eyebrow">CLOSE-UPS, IN TIME ORDER</span>
    <div className="film-strip">{picks.map((p, i) => <button key={p.frame_id + i} onClick={() => onPick(p.frame_id)} title="Show this exposure in the viewer">
      <span className="stamp"><FrameCanvas tile={tile} k={p.frame.cube_index ?? 0} options={{ view: 'residual', crop: { cx, cy, half } }} label={`Close-up on ${p.frame.observed_at_utc.slice(0, 10)}`} /><i /></span>
      <small>{p.frame.observed_at_utc.slice(5, 10)}</small>
    </button>)}</div>
    <p className="subtle-label">Each square is the same {(half * 2 + 1) * (tile.manifest.pixel_scale_arcsec || 0) | 0}″ of sky, centred on the cross. If the amber dot drifts away from the cross from left to right, it is moving.</p>
    <ul className="fact-list">
      <li>Flagged in <b>{seen.length}</b> of {tile.frames.length} photographs</li>
      <li>{days < 1 ? 'All within one day' : <>Over <b>{days.toFixed(0)} days</b> ({first.frame.observed_at_utc.slice(0, 10)} to {last.frame.observed_at_utc.slice(0, 10)})</>}</li>
      <li>First and last position differ by <b>{shiftPx.toFixed(1)} px</b>{shiftArcsec ? ` (${shiftArcsec.toFixed(0)}″)` : ''}</li>
    </ul>
  </div>
}

export function HowToTell() {
  const dot = (cx: number, cy: number, r = 3, o = 1) => <circle cx={cx} cy={cy} r={r} fill="#ffb454" opacity={o} />
  const box = (children: React.ReactNode) => <svg viewBox="0 0 96 40" aria-hidden="true">{[0, 1, 2].map(i => <rect key={i} x={2 + i * 32} y={4} width={28} height={32} rx={2} fill="#0e1422" stroke="#2b4056" />)}{children}</svg>
  return <details className="how-to-tell"><summary>How to tell them apart</summary>
    <div><figure>{box(<>{dot(10, 26)}{dot(48, 20)}{dot(86, 14)}</>)}<figcaption><b>Moving</b> The dot is in a new place each time, along a line.</figcaption></figure>
      <figure>{box(<>{dot(16, 20, 2, .5)}{dot(48, 20, 5)}{dot(80, 20, 3, .8)}</>)}<figcaption><b>Variable</b> The dot stays put and gets brighter or fainter.</figcaption></figure>
      <figure>{box(<>{dot(48, 20, 4)}</>)}<figcaption><b>Artifact</b> It appears once and never again, or has a strange shape.</figcaption></figure></div>
    <p className="subtle-label">Schematic drawings, not data. If you cannot decide, “Unsure” is a useful answer.</p>
  </details>
}

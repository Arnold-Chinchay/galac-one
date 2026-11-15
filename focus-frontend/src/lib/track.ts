// Follows one source through every photograph of a field: centroid in a small window around a predicted
// position, then a robust straight-line fit of position against time, repeated once around the fitted path.
import type { Cube } from './render.ts'

export interface TrackPoint { k: number; x: number; y: number; detected: boolean; snr: number; change: number }
export interface Track {
  start: { x: number; y: number }
  points: TrackPoint[]
  detected: number
  years: number
  /** Proper motion in arcsec/yr, east and north positive, with 1-sigma errors. */
  motion: { east: number; north: number; total: number; error: number; significance: number } | null
  /** Brightness against the usual (residual flux in noise units) for detected frames: [mjd, change]. */
  light: [number, number][]
  variability: number
}

const DAY_PER_YEAR = 365.25
/** Spread measured on fixed field stars in the Barnard and Epsilon Indi B fields (0.1-0.3 arcsec/yr): added to every error. */
export const SYSTEMATIC_ARCSEC_YR = 0.3

function median(v: number[]): number {
  if (!v.length) return NaN
  const s = [...v].sort((a, b) => a - b), m = s.length >> 1
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2
}
const mad = (v: number[]) => { const m = median(v); return 1.4826 * median(v.map(x => Math.abs(x - m))) }

/** Brightest pixel of the per-pixel median image within `r` of (x, y): snaps a click onto the source. */
export function snap(cube: Cube, x: number, y: number, r = 2): { x: number; y: number } {
  const { n, h, w, science } = cube, size = w * h, step = Math.max(1, Math.floor(n / 60))
  let best = { x: Math.round(x), y: Math.round(y), v: -Infinity }
  for (let yy = Math.max(0, Math.round(y) - r); yy <= Math.min(h - 1, Math.round(y) + r); yy++)
    for (let xx = Math.max(0, Math.round(x) - r); xx <= Math.min(w - 1, Math.round(x) + r); xx++) {
      const vals: number[] = []
      for (let k = 0; k < n; k += step) { const v = science[k * size + yy * w + xx]; if (Number.isFinite(v)) vals.push(v) }
      const m = median(vals)
      if (m > best.v) best = { x: xx, y: yy, v: m }
    }
  return { x: best.x, y: best.y }
}

/** Background-subtracted centroid of frame k in a window of radius r around (px, py). */
export function centroid(cube: Cube, k: number, px: number, py: number, r: number): { x: number; y: number; snr: number } | null {
  const { h, w, science } = cube, size = w * h, base = k * size
  const ring: number[] = []
  for (let y = Math.floor(py - r - 3); y <= Math.ceil(py + r + 3); y++)
    for (let x = Math.floor(px - r - 3); x <= Math.ceil(px + r + 3); x++) {
      if (x < 0 || y < 0 || x >= w || y >= h) continue
      const d = Math.hypot(x - px, y - py), v = science[base + y * w + x]
      if (d > r + 1 && d <= r + 3 && Number.isFinite(v)) ring.push(v)
    }
  if (ring.length < 8) return null
  const bkg = median(ring), noise = Math.max(mad(ring), 1e-9)
  let peak = -Infinity
  for (let y = Math.floor(py - r); y <= Math.ceil(py + r); y++)
    for (let x = Math.floor(px - r); x <= Math.ceil(px + r); x++) {
      if (x < 0 || y < 0 || x >= w || y >= h || Math.hypot(x - px, y - py) > r) continue
      const v = science[base + y * w + x] - bkg
      if (Number.isFinite(v)) peak = Math.max(peak, v)
    }
  // Windowed centroid: Gaussian weights around the current estimate, re-centred a few times. A hard-edged window
  // gains or loses a whole pixel at its rim as the centre shifts by a hair, which shows up as fake motion.
  const sig = 1.2, reach = 3 * sig
  let cx = px, cy = py
  for (let it = 0; it < 6; it++) {
    let sw = 0, sx = 0, sy = 0
    for (let y = Math.floor(cy - reach); y <= Math.ceil(cy + reach); y++)
      for (let x = Math.floor(cx - reach); x <= Math.ceil(cx + reach); x++) {
        if (x < 0 || y < 0 || x >= w || y >= h) continue
        const v = science[base + y * w + x] - bkg
        if (!Number.isFinite(v)) continue
        const g = Math.exp(-((x - cx) ** 2 + (y - cy) ** 2) / (2 * sig * sig)) * v
        sw += g; sx += g * x; sy += g * y
      }
    if (!(sw > 0)) return null
    const nx = sx / sw, ny = sy / sw
    if (Math.hypot(nx - px, ny - py) > r) return null          // drifted onto something else
    const moved = Math.hypot(nx - cx, ny - cy)
    cx = nx; cy = ny
    if (moved < 1e-3) break
  }
  return { x: cx, y: cy, snr: peak / noise }
}

/** Straight line v = a + b t with iterative 3-sigma clipping; returns slope error from the scatter. */
export function robustLine(t: number[], v: number[]) {
  let keep = t.map(() => true)
  let fit = { a: median(v), b: 0, err: Infinity, scatter: 0, used: t.length }
  for (let it = 0; it < 4; it++) {
    const ti = t.filter((_, i) => keep[i]), vi = v.filter((_, i) => keep[i])
    if (ti.length < 5) break
    const tm = ti.reduce((s, x) => s + x, 0) / ti.length, vm = vi.reduce((s, x) => s + x, 0) / vi.length
    const stt = ti.reduce((s, x) => s + (x - tm) ** 2, 0)
    if (stt <= 0) break
    const b = ti.reduce((s, x, i) => s + (x - tm) * (vi[i] - vm), 0) / stt, a = vm - b * tm
    const res = v.map((x, i) => x - (a + b * t[i])), sc = mad(res.filter((_, i) => keep[i])) || 1e-6
    fit = { a, b, err: sc / Math.sqrt(stt), scatter: sc, used: ti.length }
    keep = res.map(r => Math.abs(r) <= 3 * sc)
  }
  return fit
}

export function track(cube: Cube, x0: number, y0: number, pixArcsec: number, minSnr = 5): Track {
  const start = snap(cube, x0, y0)
  const t = Array.from(cube.mjd, m => (m - cube.mjd[0]) / DAY_PER_YEAR)
  const measure = (predict: (k: number) => [number, number], r: number) => {
    const out: TrackPoint[] = []
    for (let k = 0; k < cube.n; k++) {
      const [px, py] = predict(k), c = centroid(cube, k, px, py, r)
      const ok = !!c && c.snr >= minSnr
      out.push({ k, x: ok ? c!.x : px, y: ok ? c!.y : py, detected: ok, snr: c?.snr ?? 0, change: 0 })
    }
    return out
  }
  const fitOf = (pts: TrackPoint[]) => {
    const d = pts.filter(q => q.detected)
    return { fx: robustLine(d.map(q => t[q.k]), d.map(q => q.x)), fy: robustLine(d.map(q => t[q.k]), d.map(q => q.y)), n: d.length }
  }
  let points = measure(() => [start.x, start.y], 2.5)
  let { fx, fy, n } = fitOf(points)
  if (n >= 5) {                                          // second pass around the fitted path, tighter window
    points = measure(k => [fx.a + fx.b * t[k], fy.a + fy.b * t[k]], 2)
    ;({ fx, fy, n } = fitOf(points))
  }
  // Brightness change: residual (noise units) summed within 1.5 px of the tracked position.
  const size = cube.w * cube.h
  for (const q of points) {
    let s = 0
    for (let y = Math.floor(q.y - 1.5); y <= Math.ceil(q.y + 1.5); y++)
      for (let x = Math.floor(q.x - 1.5); x <= Math.ceil(q.x + 1.5); x++) {
        if (x < 0 || y < 0 || x >= cube.w || y >= cube.h || Math.hypot(x - q.x, y - q.y) > 1.5) continue
        const v = cube.residual[q.k * size + y * cube.w + x]
        if (Number.isFinite(v)) s += v
      }
    q.change = s
  }
  const det = points.filter(q => q.detected)
  const years = det.length ? t[det[det.length - 1].k] - t[det[0].k] : 0
  let motion: Track['motion'] = null
  if (n >= 5 && years > 0.05 && Number.isFinite(fx.err) && Number.isFinite(fy.err)) {
    // Row 0 is north and x grows to the west (east is left), so both axes flip sign.
    const east = -fx.b * pixArcsec, north = -fy.b * pixArcsec, total = Math.hypot(east, north)
    const error = Math.hypot(Math.hypot(fx.err, fy.err) * pixArcsec / Math.SQRT2, SYSTEMATIC_ARCSEC_YR)
    motion = { east, north, total, error, significance: error > 0 ? total / error : 0 }
  }
  const light = det.map(q => [cube.mjd[q.k], q.change] as [number, number])
  return { start, points, detected: det.length, years, motion, light, variability: mad(light.map(l => l[1])) }
}

// Turns the numeric SPHEREx cubes into pictures: one exposure, its residual, a colour composite and a motion map.
import type { Tile } from '../data/types'

export type View = 'science' | 'residual' | 'colour' | 'motion'
export interface Crop { cx: number; cy: number; half: number }
export interface RenderOptions { view: View; smooth?: boolean; combine?: number; mask?: boolean; crop?: Crop }
export interface Cube {
  n: number; h: number; w: number
  /** Row 0 is north. NaN marks pixels the pipeline masked. */
  science: Float32Array; residual: Float32Array
  mjd: Float64Array; lam: Float32Array
  stretch: { lo: number; hi: number; soft: number }
}
type Rgb = [Float32Array, Float32Array, Float32Array]

const INFERNO = [[0, 0, 4], [31, 12, 72], [85, 15, 109], [136, 34, 106], [186, 54, 85], [227, 89, 51], [249, 140, 10], [249, 201, 50], [252, 255, 164]]
const TIME = [[70, 107, 227], [40, 187, 236], [50, 241, 151], [238, 207, 58], [251, 128, 34], [210, 49, 5]]
export const BANDS: [number, number][] = [[0.7, 1.6], [1.6, 3.0], [3.0, 5.1]]
const ramp = (stops: number[][], t: number, c: number) => {
  const u = Math.max(0, Math.min(1, t)) * (stops.length - 1), i = Math.min(stops.length - 2, Math.floor(u))
  return stops[i][c] + (stops[i + 1][c] - stops[i][c]) * (u - i)
}
export const timeColour = (t: number) => `rgb(${[0, 1, 2].map(c => Math.round(ramp(TIME, t, c))).join(',')})`

export function quantiles(values: Float32Array, qs: number[]): number[] {
  const step = Math.max(1, Math.floor(values.length / 200000)), sample: number[] = []
  for (let i = 0; i < values.length; i += step) if (Number.isFinite(values[i])) sample.push(values[i])
  sample.sort((a, b) => a - b)
  return qs.map(q => sample.length ? sample[Math.min(sample.length - 1, Math.round(q * (sample.length - 1)))] : 0)
}
export function scienceStretch(science: Float32Array) {
  const [lo, mid, hi] = quantiles(science, [0.25, 0.9, 0.999])
  return { lo, hi: hi > lo ? hi : lo + 1, soft: Math.max((mid - lo) * 0.6, (hi - lo) / 400, 1e-6) }
}
const asinhScale = (v: number, lo: number, hi: number, soft: number) => Math.asinh(Math.max(0, v - lo) / soft) / Math.asinh((hi - lo) / soft)

/** Masked pixels take the mean of their valid neighbours, growing inward, so a picture has no holes. */
export function inpaint(plane: Float32Array, w: number, h: number, fallback: number): Float32Array {
  const out = Float32Array.from(plane)
  for (let pass = 0; pass < 8; pass++) {
    let left = 0
    const src = Float32Array.from(out)
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      if (Number.isFinite(src[y * w + x])) continue
      let sum = 0, count = 0
      for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
        const yy = y + dy, xx = x + dx
        if (yy < 0 || yy >= h || xx < 0 || xx >= w) continue
        const v = src[yy * w + xx]
        if (Number.isFinite(v)) { sum += v; count++ }
      }
      if (count) out[y * w + x] = sum / count; else left++
    }
    if (!left) break
  }
  for (let i = 0; i < out.length; i++) if (!Number.isFinite(out[i])) out[i] = fallback
  return out
}

/** Mitchell-Netravali cubic: smooth enlargement without the dark rings a sharper kernel leaves around stars. */
function kernel(x: number): number {
  const a = Math.abs(x), B = 1 / 3, C = 1 / 3
  if (a < 1) return ((12 - 9 * B - 6 * C) * a ** 3 + (-18 + 12 * B + 6 * C) * a ** 2 + (6 - 2 * B)) / 6
  if (a < 2) return ((-B - 6 * C) * a ** 3 + (6 * B + 30 * C) * a ** 2 + (-12 * B - 48 * C) * a + (8 * B + 24 * C)) / 6
  return 0
}
/** Noise left after soften() on unit noise (product of the per-axis kernel norms): dividing by it keeps the residual
 * in units of the noise, so sources the size of the SPHEREx PSF stand out more and single-pixel hits less. */
const BLUR_NOISE = 0.3534

/** Light blur (Gaussian, sigma 0.6 px) so single-pixel steps of a 6″ grid read as soft light, not tiles. */
export function soften(plane: Float32Array, w: number, h: number): Float32Array {
  const k = [0.0277, 0.2196, 0.5054, 0.2196, 0.0277], tmp = new Float32Array(w * h), out = new Float32Array(w * h)
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    let s = 0, n = 0
    for (let d = -2; d <= 2; d++) { const xx = x + d; if (xx >= 0 && xx < w) { s += plane[y * w + xx] * k[d + 2]; n += k[d + 2] } }
    tmp[y * w + x] = s / n
  }
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    let s = 0, n = 0
    for (let d = -2; d <= 2; d++) { const yy = y + d; if (yy >= 0 && yy < h) { s += tmp[yy * w + x] * k[d + 2]; n += k[d + 2] } }
    out[y * w + x] = s / n
  }
  return out
}

export function enlarge(plane: Float32Array, w: number, h: number, scale: number, smooth: boolean): Float32Array {
  const W = w * scale, H = h * scale, out = new Float32Array(W * H)
  if (!smooth) {
    for (let Y = 0; Y < H; Y++) for (let X = 0; X < W; X++) out[Y * W + X] = plane[Math.floor(Y / scale) * w + Math.floor(X / scale)]
    return out
  }
  const taps = (n: number, N: number) => {
    const idx = new Int32Array(N * 4), wt = new Float32Array(N * 4)
    for (let X = 0; X < N; X++) {
      const s = (X + 0.5) / scale - 0.5, i = Math.floor(s)
      for (let k = 0; k < 4; k++) { idx[X * 4 + k] = Math.max(0, Math.min(n - 1, i - 1 + k)); wt[X * 4 + k] = kernel(s - (i - 1 + k)) }
    }
    return { idx, wt }
  }
  const tx = taps(w, W), ty = taps(h, H), tmp = new Float32Array(W * h)
  for (let y = 0; y < h; y++) for (let X = 0; X < W; X++) {
    let v = 0
    for (let k = 0; k < 4; k++) v += plane[y * w + tx.idx[X * 4 + k]] * tx.wt[X * 4 + k]
    tmp[y * W + X] = v
  }
  for (let Y = 0; Y < H; Y++) for (let X = 0; X < W; X++) {
    let v = 0
    for (let k = 0; k < 4; k++) v += tmp[ty.idx[Y * 4 + k] * W + X] * ty.wt[Y * 4 + k]
    out[Y * W + X] = v
  }
  return out
}

/** Residual of frame k in units of the noise. Combining n neighbouring exposures lowers the noise by √n. */
export function residualPlane(cube: Cube, k: number, combine = 1): Float32Array {
  const { n, h, w, residual } = cube, size = w * h, out = new Float32Array(size), half = Math.floor(Math.max(1, combine) / 2)
  const k0 = Math.max(0, k - half), k1 = Math.min(n - 1, k + half)
  for (let i = 0; i < size; i++) {
    let sum = 0, count = 0
    for (let j = k0; j <= k1; j++) { const v = residual[j * size + i]; if (Number.isFinite(v)) { sum += v; count++ } }
    out[i] = count ? sum / Math.sqrt(count) : NaN
  }
  return out
}

/** One picture from the whole sequence: each channel is the per-pixel median of the exposures in one wavelength band. */
export function colourComposite(cube: Cube): Rgb {
  const { n, h, w, science, lam } = cube, size = w * h
  // Display order is red, green, blue = long, middle, short wavelengths.
  return [2, 1, 0].map(b => {
    const frames: number[] = []
    for (let k = 0; k < n; k++) if (lam[k] >= BANDS[b][0] && lam[k] < BANDS[b][1]) frames.push(k)
    const plane = new Float32Array(size), values: number[] = []
    for (let i = 0; i < size; i++) {
      values.length = 0
      for (const k of frames) { const v = science[k * size + i]; if (Number.isFinite(v)) values.push(v) }
      values.sort((a, c) => a - c)
      plane[i] = values.length ? values[values.length >> 1] : NaN
    }
    const [lo, hi] = quantiles(plane, [0.1, 0.997]), filled = inpaint(plane, w, h, lo), soft = Math.max((hi - lo) / 40, 1e-6)
    for (let i = 0; i < size; i++) filled[i] = asinhScale(filled[i], lo, hi > lo ? hi : lo + 1, soft)
    return filled
  }) as Rgb
}

/** Every significant brightening in the sequence, drawn once and coloured by its date: early blue, late red. */
export function motionMap(cube: Cube, threshold = 6): Rgb {
  const { n, h, w, residual, mjd } = cube, size = w * h
  const acc = [new Float32Array(size), new Float32Array(size), new Float32Array(size)], weight = new Float32Array(size)
  const t0 = mjd[0], span = (mjd[n - 1] - t0) || 1
  for (let k = 0; k < n; k++) {
    const t = (mjd[k] - t0) / span, colour = [0, 1, 2].map(c => ramp(TIME, t, c) / 255)
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      let sum = 0, count = 0
      for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
        const yy = y + dy, xx = x + dx
        if (yy < 0 || yy >= h || xx < 0 || xx >= w) continue
        const v = residual[k * size + yy * w + xx]
        if (Number.isFinite(v)) { sum += v; count++ }
      }
      const centre = residual[k * size + y * w + x]
      if (count < 6 || !Number.isFinite(centre)) continue
      const s = sum / Math.sqrt(count)
      if (s < threshold || centre < 2) continue
      const wgt = Math.min(s, 20), i = y * w + x
      for (let c = 0; c < 3; c++) acc[c][i] += wgt * colour[c]
      weight[i] += wgt
    }
  }
  const positive = weight.filter(v => v > 0), top = positive.length ? quantiles(positive, [0.97])[0] : 1
  return acc.map(plane => plane.map((v, i) => weight[i] ? v / weight[i] * Math.min(1, Math.asinh(weight[i] / top * 6) / Math.asinh(6)) : 0)) as Rgb
}

const derived = new WeakMap<Cube, { colour?: Rgb; motion?: Rgb }>()
function composite(cube: Cube, view: 'colour' | 'motion'): Rgb {
  const cache = derived.get(cube) || {}
  derived.set(cube, cache)
  return cache[view] ||= view === 'colour' ? colourComposite(cube) : motionMap(cube)
}

function cut(plane: Float32Array, w: number, h: number, crop: Crop | undefined, fill: number) {
  if (!crop) return { plane, w, h }
  const side = crop.half * 2 + 1, out = new Float32Array(side * side).fill(fill)
  for (let y = 0; y < side; y++) for (let x = 0; x < side; x++) {
    const sx = Math.round(crop.cx) - crop.half + x, sy = Math.round(crop.cy) - crop.half + y
    if (sx >= 0 && sx < w && sy >= 0 && sy < h) out[y * side + x] = plane[sy * w + sx]
  }
  return { plane: out, w: side, h: side }
}

export function drawFrame(canvas: HTMLCanvasElement, tile: Tile, k: number, options: RenderOptions) {
  const cube = tile.cube
  if (!cube) return
  const { view, smooth = true, crop } = options, size = cube.w * cube.h
  const frame = Math.max(0, Math.min(cube.n - 1, k))
  const scale = crop ? 14 : 10
  let planes: Float32Array[], w = cube.w, h = cube.h, masked: Float32Array | null = null
  if (view === 'colour' || view === 'motion') {
    planes = composite(cube, view).map(p => { const c = cut(p, cube.w, cube.h, crop, 0); w = c.w; h = c.h; return c.plane })
  } else {
    const raw = view === 'science' ? cube.science.subarray(frame * size, (frame + 1) * size) : residualPlane(cube, frame, options.combine)
    const c = cut(raw as Float32Array, cube.w, cube.h, crop, NaN)
    w = c.w; h = c.h
    if (options.mask) masked = c.plane.map(v => Number.isFinite(v) ? 0 : 1)
    planes = [view === 'science' ? inpaint(c.plane, w, h, cube.stretch.lo) : soften(c.plane.map(v => Number.isFinite(v) ? v : 0), w, h).map(v => v / BLUR_NOISE)]
  }
  const W = w * scale, H = h * scale, big = planes.map(p => enlarge(p, w, h, scale, smooth))
  const flags = masked ? enlarge(masked, w, h, scale, false) : null
  canvas.width = W; canvas.height = H
  const ctx = canvas.getContext('2d')!, img = ctx.createImageData(W, H), d = img.data, { lo, hi, soft } = cube.stretch
  for (let i = 0, o = 0; i < W * H; i++, o += 4) {
    let r: number, g: number, b: number
    if (view === 'science') { const t = asinhScale(big[0][i], lo, hi, soft); r = ramp(INFERNO, t, 0); g = ramp(INFERNO, t, 1); b = ramp(INFERNO, t, 2) }
    else if (view === 'residual') {
      // Brighter than the static sky glows amber, fainter glows blue, no change stays dark.
      // Soft compression: faint changes grow quickly, the huge leftovers of saturated stars level off instead of
      // turning into flat white and blue blocks.
      const v = big[0][i], a = Math.min(1, Math.asinh(Math.max(0, Math.abs(v) - 1.5) / 2) / Math.asinh(5))
      // Brighter than usual tops out at a soft light amber, never flat white, so a bright star's leftovers stay readable.
      if (v >= 0) { r = 14 + 241 * Math.min(1, a * 1.5); g = 20 + 188 * a; b = 34 + 86 * a * a }
      else { r = 14 + 40 * a; g = 20 + 130 * a; b = 34 + 221 * a }
    } else { const gain = view === 'motion' ? 255 : 255; r = 10 + big[0][i] * gain; g = 14 + big[1][i] * gain; b = 26 + big[2][i] * gain }
    if (flags && flags[i]) { r = r * .45 + 228 * .55; g = g * .45 + 182 * .55; b = b * .45 + 109 * .55 }
    d[o] = r; d[o + 1] = g; d[o + 2] = b; d[o + 3] = 255
  }
  ctx.putImageData(img, 0, 0)
}

/** Removes the smooth tilt left in each residual photograph, fitted on pixels that are not sources. */
export function flattenResiduals(residual: Float32Array, n: number, h: number, w: number) {
  const size = w * h
  for (let k = 0; k < n; k++) {
    const frame = residual.subarray(k * size, (k + 1) * size)
    let a = 0, bx = 0, by = 0
    for (let pass = 0; pass < 2; pass++) {
      let s = 0, sx = 0, sy = 0, sxx = 0, syy = 0, sv = 0, sxv = 0, syv = 0
      for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
        const v = frame[y * w + x], dx = x - (w - 1) / 2, dy = y - (h - 1) / 2
        if (!Number.isFinite(v) || Math.abs(v - (a + bx * dx + by * dy)) > 3) continue
        s++; sx += dx; sy += dy; sxx += dx * dx; syy += dy * dy; sv += v; sxv += dx * v; syv += dy * v
      }
      if (s < 50) break
      // Offsets are centred, so the cross terms are small and each slope can be solved on its own.
      a = sv / s; bx = (sxv - sx * a) / (sxx || 1); by = (syv - sy * a) / (syy || 1)
    }
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) frame[y * w + x] -= a + bx * (x - (w - 1) / 2) + by * (y - (h - 1) / 2)
  }
}

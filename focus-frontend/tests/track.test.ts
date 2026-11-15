import test from 'node:test'
import assert from 'node:assert/strict'
import { track } from '../src/lib/track.ts'
import type { Cube } from '../src/lib/render.ts'

// Synthetic field: Gaussian sources on noise, 240 frames over 1.2 years, 6.15"/px like SPHEREx.
function sky(sources: { x: number; y: number; vx: number; vy: number; flux: number }[], seed = 1): Cube {
  const n = 240, h = 40, w = 40, size = w * h
  let s = seed
  const rand = () => { s = (s + 0x6D2B79F5) | 0; let t = Math.imul(s ^ (s >>> 15), 1 | s); t ^= t + Math.imul(t ^ (t >>> 7), 61 | t); return ((t ^ (t >>> 14)) >>> 0) / 4294967296 }   // mulberry32
  const gauss = () => Math.sqrt(-2 * Math.log(rand() + 1e-12)) * Math.cos(2 * Math.PI * rand())
  const science = new Float32Array(n * size), residual = new Float32Array(n * size), mjd = new Float64Array(n)
  for (let k = 0; k < n; k++) {
    mjd[k] = 60800 + k * 1.2 * 365.25 / n
    const yr = (mjd[k] - mjd[0]) / 365.25
    for (let i = 0; i < size; i++) { science[k * size + i] = 0.1 + 0.02 * gauss(); residual[k * size + i] = gauss() }
    for (const src of sources) {
      const cx = src.x + src.vx * yr, cy = src.y + src.vy * yr
      for (let y = 0; y < h; y++) for (let x = 0; x < w; x++)
        science[k * size + y * w + x] += src.flux * Math.exp(-((x - cx) ** 2 + (y - cy) ** 2) / (2 * 1.1 ** 2))
    }
  }
  return { n, h, w, science, residual, mjd, lam: new Float32Array(n).fill(2), stretch: { lo: 0, hi: 1, soft: .1 } }
}

test('a moving star is followed and its motion recovered within its error', () => {
  // 1.6 px/yr toward +x (west) and -y (north): east = -1.6*6.15, north = +1.6*6.15... per axis below.
  const cube = sky([{ x: 18, y: 22, vx: 1.6, vy: -1.0, flux: 1.5 }, { x: 8, y: 8, vx: 0, vy: 0, flux: 1 }])
  const tr = track(cube, 18.4, 21.6, 6.15)
  assert.ok(tr.detected > 200, `detected ${tr.detected}`)
  assert.ok(tr.motion, 'motion fitted')
  const { east, north, error, significance } = tr.motion!
  assert.ok(Math.abs(east - -1.6 * 6.15) < Math.max(4 * error, 0.3), `east ${east} err ${error}`)
  assert.ok(Math.abs(north - 1.0 * 6.15) < Math.max(4 * error, 0.3), `north ${north}`)
  assert.ok(significance > 10)
})

test('a fixed star shows no significant motion, and a click near it snaps onto it', () => {
  const cube = sky([{ x: 25, y: 12, vx: 0, vy: 0, flux: 1.2 }], 7)
  const tr = track(cube, 26.2, 13.1, 6.15)
  assert.deepEqual(tr.start, { x: 25, y: 12 })
  assert.ok(tr.motion && tr.motion.significance < 4, `significance ${tr.motion?.significance}`)
})

test('empty sky gives too few detections to claim any motion', () => {
  const tr = track(sky([], 3), 20, 20, 6.15)
  assert.ok(tr.detected < 40, `detected ${tr.detected}`)
})

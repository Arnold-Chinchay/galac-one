import test from 'node:test'
import assert from 'node:assert/strict'
import { DEFAULT_EXPLORE_STATE, parseCoordinate, parseExploreSearch, toExploreSearch } from '../src/lib/state.ts'
import { clampPan, imageToScreen, screenToImage } from '../src/lib/geometry.ts'
import { loadAnnotations, saveAnnotations, loadVotes, saveVotes, toCSV } from '../src/lib/storage.ts'

const close = (a: number, b: number) => assert.ok(Math.abs(a - b) < 1e-9, `${a} != ${b}`)

test('RA sexagesimal hours normalize to degrees while declination keeps its sign', () => {
  close(parseCoordinate('08h55m10.831s', 'ra'), 133.79512916666668)
  close(parseCoordinate('−07°14′42.53″', 'dec'), -7.245147222222222)
  close(parseCoordinate('133d47m42.465s', 'ra'), 133.79512916666668)
  assert.equal(parseCoordinate('359.9999', 'ra'), 359.9999)
  assert.equal(parseCoordinate('-90', 'dec'), -90)
  for (const value of ['360', '-0.1', '24:00:00', '08:60:00', '8:20:60', 'Infinity', 'NaN']) assert.throws(() => parseCoordinate(value, 'ra'))
  for (const value of ['90.01', '-91', '1:-2:3', '1:2:-3']) assert.throws(() => parseCoordinate(value, 'dec'))
})

test('the WiseView integration URL and complete comparison state survive sharing', () => {
  const linked = parseExploreSearch('?ra=133.786245&dec=-7.244372&fov=176&mode=blink&delayMs=500&zoom=9&invert=1')
  assert.equal(linked.ra, 133.786245)
  assert.equal(linked.dec, -7.244372)
  assert.equal(linked.fov, 176)
  assert.equal(linked.zoom, 9)
  assert.equal(linked.invert, true)
  const state = { ...linked, a: 1, b: 5, detector: '5', channel: '3.92', product: 'residual' as const, dateFrom: '2026-01-01', dateTo: '2026-10-31', embed: true }
  assert.deepEqual(parseExploreSearch(toExploreSearch(state)), state)
})

test('invalid URL coordinates, ranges, dates and executable text fall back safely', () => {
  const bad = parseExploreSearch('?ra=999&dec=-100&fov=-1&zoom=Infinity&delayMs=2&mode=bad&release=%3Cscript%3E&dateFrom=2026-02-30&dateTo=bad')
  assert.equal(bad.ra, DEFAULT_EXPLORE_STATE.ra)
  assert.equal(bad.dec, DEFAULT_EXPLORE_STATE.dec)
  assert.equal(bad.fov, DEFAULT_EXPLORE_STATE.fov)
  assert.equal(bad.zoom, DEFAULT_EXPLORE_STATE.zoom)
  assert.equal(bad.delayMs, DEFAULT_EXPLORE_STATE.delayMs)
  assert.equal(bad.release, DEFAULT_EXPLORE_STATE.release)
  assert.equal(bad.dateFrom, undefined)
  const reversed = parseExploreSearch('?dateFrom=2026-10-01&dateTo=2026-01-01')
  assert.equal(reversed.dateFrom, undefined)
  assert.equal(reversed.dateTo, undefined)
})

test('annotation pixel centers remain invariant through zoom, pan and letterboxing', () => {
  const rect = { left: 30, top: 70, width: 900, height: 600 }
  for (const zoom of [1, 2, 9]) for (const pan of [{ x: 0, y: 0 }, { x: 93, y: -42 }]) {
    for (const point of [{ x: 0, y: 0 }, { x: 511, y: 511 }, { x: 220.25, y: 284.75 }]) {
      const screen = imageToScreen(point, rect, 512, 512, zoom, pan)
      const original = screenToImage(screen.x, screen.y, rect, 512, 512, zoom, pan)
      assert.ok(original)
      close(original.x, point.x)
      close(original.y, point.y)
    }
  }
  assert.equal(screenToImage(31, 71, rect, 512, 512), null)
  const clamped = clampPan({ x: 100, y: -100 }, rect, 512, 512, 1)
  close(clamped.x, 0)
  close(clamped.y, 0)
})

test('local classifications persist independently from real pending votes and export safely', t => {
  const data = new Map<string, string>()
  const previous = Object.getOwnPropertyDescriptor(globalThis, 'localStorage')
  Object.defineProperty(globalThis, 'localStorage', { configurable: true, value: { getItem: (key: string) => data.get(key) ?? null, setItem: (key: string, value: string) => data.set(key, value) } })
  t.after(() => previous ? Object.defineProperty(globalThis, 'localStorage', previous) : delete (globalThis as any).localStorage)
  const annotation = { id: 'note-1', tile_id: 'demo-wiseview', grid_id: 'demo-grid-512', frame_id: 'demo-01', x_px: 220, y_px: 284, label: 'moving' as const, note: '=IMPORTDATA("example")', created_at_utc: '2026-11-14T00:00:00Z', origin: 'synthetic' as const }
  assert.equal(saveAnnotations('synthetic', [annotation]), true)
  assert.deepEqual(loadAnnotations('synthetic'), [annotation])
  assert.deepEqual(loadAnnotations('real'), [])
  const vote = { vote_id: 'vote-1', user_id: 'user-1', tile_id: 'real-field', candidate_id: 'candidate-1', label: 'unsure' as const, created_at_utc: annotation.created_at_utc, status: 'pending' as const }
  assert.equal(saveVotes('real', [vote]), true)
  assert.deepEqual(loadVotes('real'), [vote])
  assert.deepEqual(loadVotes('synthetic'), [])
  assert.match(toCSV([annotation]), /'=IMPORTDATA/)
  assert.match(toCSV([{ note: 'first\nsecond, "quoted"' }]), /"first\nsecond, ""quoted"""/)
})

import test from 'node:test'
import assert from 'node:assert/strict'
import { decodeF16, fieldFromRow, mjdToUtc, submitNaylampVotes, toCandidates, toFrames, toManifest } from '../src/data/naylamp.ts'

const manifest = { contract_version: 1, id: 'rdra', label: 'R Draconis field', release: 'DR1+QR3', ra: 248.1788, dec: 66.755, fov_deg: 0.0683333, pix_arcsec: 6.15, shape: { n_frames: 4, height: 40, width: 40 } }

test('live tile metadata maps onto the viewer contract', () => {
  assert.equal(mjdToUtc(51544.5), '2000-01-01T12:00:00Z')
  assert.deepEqual([...decodeF16(new Uint16Array([0x3c00, 0xc000, 0x7e00, 0x0000]))].map(v => Number.isNaN(v) ? 'nan' : v), [1, -2, 'nan', 0])
  const field = fieldFromRow({ id: 'rdra', ra: 248.1788, dec: 66.755, fov_deg: 0.06833, release: 'DR1+QR3', n_frames: 289, label: 'R Draconis field', files_url: '/tiles/rdra/' }, 'https://api.example/api/tiles')
  assert.equal(field.manifest_url, 'https://api.example/tiles/rdra/manifest.json')
  assert.equal(field.fov_arcsec, 246)
  const m = toManifest(manifest, { min: 0, max: 1 })
  assert.equal(m.origin, 'spherex')
  assert.equal(m.width_px, 40)
  const frames = toFrames(manifest, [0, 1, 2, 3].map(i => ({ i, mjd: 60789.5 + i, det: 3, lam_um: 1.66, bad_frac: 0.1 })))
  assert.equal(new Set(frames.map(f => f.frame_id)).size, 4)
  assert.equal(frames[0].observed_at_utc, '2025-04-24T12:00:00Z')
})

test('candidate tracks are flipped north-up and mark which frames hold a detection', () => {
  const [c] = toCandidates(manifest, [{ id: 'rdra-a', x: 11, y: 26, track: [[1, 11, 26], [3, 12, 27], [3, 30, 30], [9, 1, 1]] }])
  assert.equal(c.positions.length, 4)
  assert.deepEqual(c.positions.map(p => [p.x_px, p.y_px, p.detected]), [[11, 13, false], [11, 13, true], [12, 12, false], [12, 12, true]])
  const [still] = toCandidates(manifest, [{ id: 'rdra-b', x: 5, y: 0, track: null }])
  assert.ok(still.positions.every(p => p.y_px === 39 && p.detected === false))
})

test('votes use the live Worker contract and unknown candidates stay unconfirmed', async t => {
  const old = globalThis.fetch
  t.after(() => { globalThis.fetch = old })
  const bodies: any[] = []
  globalThis.fetch = (async (_url: string, init: RequestInit) => {
    const body = JSON.parse(String(init.body)); bodies.push(body)
    const known = body.votes.filter((v: any) => v.candidate_id !== 'gone')
    if (!known.length) return Response.json({ error: 'no known candidates in votes' }, { status: 400 })
    return Response.json({ ok: true, accepted: known.length, ignored: body.votes.length - known.length, n_votes: 7, reliability: 0.8 })
  }) as typeof fetch
  const vote = (vote_id: string, candidate_id: string) => ({ vote_id, candidate_id, user_id: 'u', tile_id: 'rdra', label: 'moving' as const, created_at_utc: '2026-11-14T00:00:00Z' })
  const result = await submitNaylampVotes('https://api.example/api', [vote('1', 'a'), vote('2', 'gone')])
  assert.deepEqual(result.accepted_vote_ids, ['1'])
  assert.deepEqual(result.issues?.map(i => [i.vote_id, i.code]), [['2', 'candidate_not_found']])
  assert.deepEqual(result.stats, { n_votes: 7, reliability: 0.8 })
  assert.deepEqual(bodies[0], { user_id: 'u', votes: [{ candidate_id: 'a', label: 'moving' }, { candidate_id: 'gone', label: 'moving' }] })
})

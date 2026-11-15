// Adapter from the live Naylamp API and tile format (docs/frontend.md) to the viewer's types.
import type { Candidate, Field, Frame, Label, Manifest, Position, Tile, Vote, VoteResult } from './types'
import { flattenResiduals, scienceStretch } from '../lib/render.ts'
import type { Cube } from '../lib/render.ts'

export interface NaylampTileRow { id: string; ra: number; dec: number; fov_deg: number; release: string; n_frames: number; label: string; files_url: string }
export interface NaylampManifest {
  contract_version: number; id: string; label: string; release: string; ra: number; dec: number
  fov_deg: number; pix_arcsec: number; shape: { n_frames: number; height: number; width: number }; created?: string
}
export interface NaylampFrame { i: number; mjd: number; det: number | null; lam_um: number | null; bad_frac: number | null; obsid?: string | null }
export interface NaylampCandidate { id: string; x: number; y: number; track?: [number, number, number][] | null; kind_hint?: string | null }

const PIPELINE = 'naylamp-contract-'
const LABELS: Label[] = ['moving', 'variable', 'artifact', 'unsure']
export const isNaylampManifest = (m: unknown): m is NaylampManifest =>
  Boolean(m && typeof m === 'object' && 'contract_version' in m && 'shape' in m && 'id' in m)
export const isNaylampTile = (tile?: Tile) => Boolean(tile?.manifest.pipeline_version.startsWith(PIPELINE))
export const isNaylampIndex = (raw: unknown): raw is { tiles: NaylampTileRow[] } =>
  Boolean(raw && typeof raw === 'object' && Array.isArray((raw as { tiles?: unknown }).tiles))

export const mjdToUtc = (mjd: number) => new Date(Math.round((mjd - 40587) * 86400000)).toISOString().replace('.000Z', 'Z')
export const frameId = (tileId: string, i: number) => `${tileId}-f${String(i).padStart(4, '0')}`
const origin = (id: string) => id === 'mock' ? 'synthetic' as const : 'spherex' as const

export function fieldFromRow(row: NaylampTileRow, indexUrl: string): Field {
  return {
    tile_id: row.id, title: row.label, center: { ra_deg: row.ra, dec_deg: row.dec, frame: 'ICRS' },
    fov_arcsec: Math.round(row.fov_deg * 3600), release: row.release, status: 'ready', origin: origin(row.id),
    manifest_url: new URL(row.files_url + 'manifest.json', indexUrl).href, frame_count: row.n_frames,
  }
}

export function toManifest(m: NaylampManifest, stretch: { min: number; max: number }): Manifest {
  const real = origin(m.id) === 'spherex'
  return {
    schema_version: '1.0', tile_id: m.id, title: m.label, center: { ra_deg: m.ra, dec_deg: m.dec, frame: 'ICRS' },
    fov_arcsec: Math.round(m.fov_deg * 3600), release: m.release, origin: origin(m.id),
    pipeline_version: PIPELINE + m.contract_version, processed_at_utc: m.created || '', frame_count: m.shape.n_frames,
    grid_id: `${m.id}-grid`, width_px: m.shape.width, height_px: m.shape.height, pixel_scale_arcsec: m.pix_arcsec,
    frames_url: 'frames.json', candidates_url: 'candidates.json', releases: [m.release],
    products: {
      science: {
        available: true, units: 'MJy/sr, zodiacal background removed',
        validation: real ? 'SPHEREx spectral image cutouts reprojected to a common grid' : 'synthetic sky with known answers',
        stretch: { type: 'asinh', ...stretch },
      },
      residuals: {
        available: true, units: 'z-score (σ), display ±5',
        method: 'Per-pixel static spectrum with a per-frame gain, subtracted at each frame’s wavelength',
        version: 'spectral-sub', validation: real ? 'injection-recovery tested' : 'synthetic sky with known answers',
        stretch: { type: 'linear', min: -5, max: 5 },
      },
      quality_mask: { available: true, units: null, validation: 'pixels the pipeline masked (NaN)' },
    },
  }
}

export function toFrames(m: NaylampManifest, raw: NaylampFrame[]): Frame[] {
  return raw.map((f, n) => ({
    frame_id: frameId(m.id, n), obs_id: f.obsid || 'not exported', detector: f.det,
    observed_at_utc: mjdToUtc(f.mjd), t_mid: f.mjd, time_scale: 'UTC', wavelength_um: f.lam_um, bandwidth_um: null,
    wavelength_position: 'tile centre', masked_fraction: f.bad_frac, quality_flags: [], release: m.release,
    source_url: null, processing_version: PIPELINE + m.contract_version, cube_index: n,
    photometric_group_id: f.lam_um === null ? null : `d${f.det}-${f.lam_um.toFixed(2)}`,
    science_url: '', residual_url: null, quality_mask_url: null, width_px: m.shape.width, height_px: m.shape.height,
  }))
}

/** Tile y=0 is south; the viewer's y=0 is the top row, so rows are flipped. Frames without a detection reuse the nearest one. */
export function toCandidates(m: NaylampManifest, raw: NaylampCandidate[]): Candidate[] {
  const { n_frames: N, height: H, width: W } = m.shape
  const inside = (x: number, y: number) => x >= 0 && x < W && y >= 0 && y < H
  return raw.map((c, n) => {
    const seen = new Map<number, [number, number]>()
    for (const [k, x, y] of c.track || []) if (!seen.has(k) && k >= 0 && k < N && inside(x, y)) seen.set(k, [x, y])
    const keys = [...seen.keys()].sort((a, b) => a - b)
    const positions: Position[] = []
    for (let k = 0, j = 0; k < N; k++) {
      while (j + 1 < keys.length && Math.abs(keys[j + 1] - k) <= Math.abs(keys[j] - k)) j++
      const [x, y] = keys.length ? seen.get(keys[j])! : [c.x, c.y]
      if (inside(x, y)) positions.push({ frame_id: frameId(m.id, k), x_px: x, y_px: H - 1 - y, detected: seen.has(k) })
    }
    return { candidate_id: c.id, tile_id: m.id, grid_id: `${m.id}-grid`, title: `Candidate ${String(n + 1).padStart(2, '0')}`, positions, catalog_match: null,
      // Only the training tile publishes its answers; real tiles always carry null here.
      suggested_label: LABELS.includes(c.kind_hint as Label) ? c.kind_hint as Label : undefined }
  })
}

export function decodeF16(u16: Uint16Array): Float32Array {
  const out = new Float32Array(u16.length)
  for (let i = 0; i < u16.length; i++) {
    const h = u16[i], s = h & 0x8000 ? -1 : 1, e = (h >> 10) & 0x1f, f = h & 0x3ff
    out[i] = e === 0 ? s * 2 ** -14 * (f / 1024) : e === 31 ? (f ? NaN : s * Infinity) : s * 2 ** (e - 15) * (1 + f / 1024)
  }
  return out
}

type Json = <T>(url: string, signal?: AbortSignal) => Promise<T>
export async function loadNaylampTile(manifestUrl: string, raw: NaylampManifest, json: Json, candidatesUrl: string | null, signal?: AbortSignal): Promise<Tile> {
  const { n_frames: N, height: H, width: W } = raw.shape
  if (!(N > 0 && H > 0 && W > 0 && N * H * W <= 4e7)) throw new Error('This tile has invalid dimensions.')
  const rel = (name: string) => new URL(name, manifestUrl).href
  const cube = async (name: string) => {
    const response = await fetch(rel(name), { signal })
    if (!response.ok) throw new Error(`Image cube ${name} could not be loaded (${response.status}).`)
    const buffer = await response.arrayBuffer()
    if (buffer.byteLength !== N * H * W * 2) throw new Error(`Image cube ${name} does not match the manifest dimensions.`)
    return decodeF16(new Uint16Array(buffer))
  }
  const candidateList = async () => {
    if (candidatesUrl) try { return (await json<{ candidates: NaylampCandidate[] }>(candidatesUrl, signal)).candidates } catch (e) { if (signal?.aborted) throw e }
    return json<NaylampCandidate[]>(rel('candidates.json'), signal).catch(e => { if (signal?.aborted) throw e; return [] })
  }
  const [rawFrames, science, residual, rawCandidates] = await Promise.all([
    json<NaylampFrame[]>(rel('frames.json'), signal), cube('science.f16.bin'), cube('residuals.f16.bin'), candidateList(),
  ])
  if (!Array.isArray(rawFrames) || rawFrames.length !== N) throw new Error('Frame count does not match the manifest.')
  // Cubes are stored south-up; flip each frame once so row 0 is north everywhere in the viewer.
  for (const data of [science, residual]) for (let k = 0; k < N; k++) for (let y = 0; y < H >> 1; y++) {
    const top = (k * H + y) * W, bottom = (k * H + H - 1 - y) * W, row = data.slice(top, top + W)
    data.copyWithin(top, bottom, bottom + W); data.set(row, bottom)
  }
  flattenResiduals(residual, N, H, W)
  const frames = toFrames(raw, rawFrames)
  const data: Cube = { n: N, h: H, w: W, science, residual, mjd: Float64Array.from(rawFrames, f => f.mjd), lam: Float32Array.from(rawFrames, f => f.lam_um ?? NaN), stretch: scienceStretch(science) }
  const stretch = { min: data.stretch.lo, max: data.stretch.hi }
  return { manifest: toManifest(raw, stretch), frames, candidates: toCandidates(raw, rawCandidates || []), gaia: [], known: [], files_url: rel('./'), cube: data }
}

/** The live Worker answers with counts, not vote ids; a partly ignored batch is resent one vote at a time. */
export async function submitNaylampVotes(api: string, votes: Vote[], signal?: AbortSignal): Promise<VoteResult> {
  const result: VoteResult = { accepted_vote_ids: [], issues: [] }
  const post = async (batch: Vote[]) => {
    const response = await fetch(`${api}/votes`, {
      method: 'POST', signal, headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ user_id: batch[0].user_id, votes: batch.map(v => ({ candidate_id: v.candidate_id, label: v.label })) }),
    })
    const body = await response.json().catch(() => null)
    const ok = response.ok && body?.ok === true && body.ignored === 0
    if (ok) result.stats = { n_votes: body.n_votes ?? 0, reliability: body.reliability ?? null }
    return { ok, status: response.status, message: typeof body?.error === 'string' ? body.error : 'The vote was not recorded.' }
  }
  const reject = (batch: Vote[], status: number, message: string) => {
    for (const v of batch) result.issues!.push({ vote_id: v.vote_id, code: status === 400 || status === 200 ? 'candidate_not_found' : 'temporarily_unavailable', message })
  }
  for (let i = 0; i < votes.length; i += 50) {
    const batch = votes.slice(i, i + 50)
    const whole = await post(batch)
    if (whole.ok) { result.accepted_vote_ids.push(...batch.map(v => v.vote_id)); continue }
    if (batch.length === 1 || whole.status === 429 || whole.status >= 500) { reject(batch, whole.status, whole.message); continue }
    for (const v of batch) {
      const one = await post([v])
      if (one.ok) result.accepted_vote_ids.push(v.vote_id)
      else reject([v], one.status, one.message)
    }
  }
  return result
}

export async function fetchUserStats(api: string, userId: string, signal?: AbortSignal): Promise<{ n_votes: number; reliability: number | null } | null> {
  const response = await fetch(`${api}/me?user=${encodeURIComponent(userId)}`, { signal })
  if (!response.ok) return null
  const body = await response.json().catch(() => null)
  return body && typeof body.n_votes === 'number' ? { n_votes: body.n_votes, reliability: body.reliability ?? null } : null
}

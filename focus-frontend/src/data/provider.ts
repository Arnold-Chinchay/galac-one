import type { CommunityStats, DataProvider, Field, FieldQuery, Tile, UserStats, Vote, VoteResult } from './types'
import { fetchUserStats, fieldFromRow, isNaylampIndex, isNaylampManifest, loadNaylampTile, submitNaylampVotes } from './naylamp'
export { curatedTargets } from './targets'

const API = (import.meta.env.VITE_API_BASE_URL || '/api').replace(/\/$/, '')
/** Synthetic sky processed by the real pipeline, with published answers. Votes on it stay on the device. */
export const TRAINING_TILE = 'mock'
const tiles = new Map<string, Tile>()
let index: { at: number; items: Promise<Field[]> } | null = null

export class DataError extends Error {
  constructor(message: string, public code: string, public status = 0) { super(message); this.name = 'DataError' }
}
const fullUrl = (path: string) => new URL(path, window.location.origin).href
async function json<T>(path: string, signal?: AbortSignal): Promise<T> {
  const response = await fetch(path, { signal, headers: { Accept: 'application/json' } })
  if (!response.ok) {
    const body = await response.json().catch(() => null)
    const message = typeof body?.error === 'string' ? body.error : body?.error?.message
    throw new DataError(message || `Data request failed (${response.status}).`, response.status === 404 ? 'NOT_FOUND' : 'HTTP_ERROR', response.status)
  }
  // Result files written by numpy can contain bare NaN, which is not JSON.
  return JSON.parse((await response.text()).replace(/\bNaN\b/g, 'null')) as T
}
export const readJson = json
/** Absolute URL of a file the Worker serves next to the API (tiles, HiPS layers). */
export const siteUrl = (path: string) => fullUrl(API.replace(/\/api$/, '') + path)

/** A name or id selects a field; otherwise a position resolves to the field whose footprint contains it. */
function matches(field: Field, q: FieldQuery): boolean {
  const plain = (s: string) => s.toLowerCase().replace(/[’']/g, '')
  if (q.q) return field.tile_id === q.q || plain(field.title).includes(plain(q.q))
  if (q.ra !== undefined && q.dec !== undefined) {
    const dra = Math.min(Math.abs(q.ra - field.center.ra_deg), 360 - Math.abs(q.ra - field.center.ra_deg))
    return field.origin !== 'synthetic' && Math.hypot(dra * Math.cos(q.dec * Math.PI / 180), q.dec - field.center.dec_deg) <= field.fov_arcsec / 2 / 3600
  }
  return true
}

export const provider: DataProvider = {
  async listFields(query = {}, signal) {
    // The index is shared for a minute: the Worker's free plan counts every request.
    if (!index || Date.now() - index.at > 60000) {
      const indexUrl = fullUrl(`${API}/tiles`)
      const items = json<unknown>(indexUrl).then(raw => {
        if (!isNaylampIndex(raw)) throw new DataError('The field index is not in the expected format.', 'INVALID_INDEX')
        // The training tile's files ship with this site, so they load from here even when the API is elsewhere.
        return raw.tiles.map(row => fieldFromRow(row, row.id === TRAINING_TILE ? fullUrl('/') : indexUrl))
      })
      index = { at: Date.now(), items }
      items.catch(() => { index = null })
    }
    const items = await index.items
    if (signal?.aborted) throw new DOMException('The request was aborted.', 'AbortError')
    return items.filter(f => matches(f, query))
  },
  async resolveField(query, signal) {
    return (await provider.listFields(query, signal))[0] || null
  },
  async loadTile(field, signal) {
    const record = typeof field === 'string' ? await provider.resolveField({ q: field }, signal) : field
    if (!record?.manifest_url) throw new DataError('No prepared observation set for this field.', 'NOT_FOUND', 404)
    const cached = tiles.get(record.tile_id)
    if (cached) return cached
    const manifest = await json<unknown>(record.manifest_url, signal)
    if (!isNaylampManifest(manifest) || manifest.id !== record.tile_id) throw new DataError('The returned package does not belong to this field.', 'TILE_MISMATCH')
    const tile = await loadNaylampTile(record.manifest_url, manifest, json, fullUrl(`${API}/tiles/${encodeURIComponent(record.tile_id)}/candidates`), signal)
    tiles.set(record.tile_id, tile)
    while (tiles.size > 3) tiles.delete(tiles.keys().next().value!)
    return tile
  },
  async listCandidates(tileId, signal) {
    return (tiles.get(tileId) || await provider.loadTile(tileId, signal)).candidates
  },
  async submitVotes(votes: Vote[], signal): Promise<VoteResult> {
    const real = votes.filter(v => v.tile_id !== TRAINING_TILE)
    return real.length ? submitNaylampVotes(fullUrl(API), real, signal) : { accepted_vote_ids: [] }
  },
}

export const userStats = (userId: string, signal?: AbortSignal): Promise<UserStats | null> => fetchUserStats(fullUrl(API), userId, signal).catch(() => null)
export const communityStats = (signal?: AbortSignal): Promise<CommunityStats | null> => json<CommunityStats>(fullUrl(`${API}/stats`), signal).catch(() => null)

export interface ReportInput { tile_id: string; x: number; y: number; label: string; note?: string; pm_east?: number; pm_north?: number; pm_err?: number; n_detected?: number; variability?: number }
/** Sends a source the person followed themselves; resolves to the total number of reports, or throws. */
export async function submitReport(r: ReportInput, userId: string): Promise<number> {
  const response = await fetch(fullUrl(`${API}/reports`), { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ...r, user_id: userId }) })
  const body = await response.json().catch(() => null)
  if (!response.ok || !body?.ok) throw new DataError(typeof body?.error === 'string' ? body.error : `The report could not be sent (${response.status}).`, 'REPORT_FAILED', response.status)
  return body.reports
}

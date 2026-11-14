import type { Label, Position, Vote } from '../data/types';

export type DataScope = 'synthetic' | 'real';
export interface Annotation {
  id: string;
  tile_id: string;
  grid_id: string;
  frame_id: string;
  x_px: number;
  y_px: number;
  label: Label;
  note: string;
  created_at_utc: string;
  origin: 'synthetic' | 'spherex';
  obs_id?: string;
  observed_at_utc?: string;
  ra_deg?: number | null;
  dec_deg?: number | null;
  source_url?: string | null;
  linked_positions?: Position[];
}

export interface StoredVote extends Vote {
  status: 'local' | 'pending' | 'submitted';
  error?: string;
}

/** Browser storage can be blocked or full; callers keep their current in-memory state. */
export function safeRead<T>(key: string, fallback: T): T {
  try {
    const value = globalThis.localStorage?.getItem(key);
    return value === null || value === undefined ? fallback : JSON.parse(value) as T;
  } catch { return fallback; }
}

export function safeWrite(key: string, value: unknown): boolean {
  try {
    globalThis.localStorage.setItem(key, JSON.stringify(value));
    return true;
  } catch { return false; }
}

export function newId(): string {
  if (globalThis.crypto?.randomUUID) return globalThis.crypto.randomUUID();
  const bytes = new Uint8Array(16);
  if (globalThis.crypto?.getRandomValues) globalThis.crypto.getRandomValues(bytes);
  else for (let i = 0; i < bytes.length; i++) bytes[i] = Math.floor(Math.random() * 256);
  bytes[6] = (bytes[6] & 0x0f) | 0x40;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const hex = Array.from(bytes, b => b.toString(16).padStart(2, '0')).join('');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

let sessionId: string | undefined;
export function anonymousId(): string {
  if (sessionId) return sessionId;
  const saved = safeRead<unknown>('focus.anonymous-id.v1', null);
  sessionId = typeof saved === 'string' && /^[\da-f]{8}-[\da-f]{4}-[\da-f]{4}-[\da-f]{4}-[\da-f]{12}$/i.test(saved) ? saved : newId();
  safeWrite('focus.anonymous-id.v1', sessionId);
  return sessionId;
}

const labels: Label[] = ['moving', 'variable', 'artifact', 'unsure'];
const keyFor = (kind: 'annotations' | 'votes', scope: DataScope) => `focus.${kind}.${scope}.v1`;

function annotationValid(value: unknown): value is Annotation {
  if (!value || typeof value !== 'object') return false;
  const a = value as Annotation;
  return typeof a.id === 'string' && typeof a.tile_id === 'string' && typeof a.grid_id === 'string'
    && typeof a.frame_id === 'string' && Number.isFinite(a.x_px) && Number.isFinite(a.y_px)
    && labels.includes(a.label) && typeof a.note === 'string'
    && ['synthetic', 'spherex'].includes(a.origin) && typeof a.created_at_utc === 'string';
}

export function loadAnnotations(scope: DataScope): Annotation[] {
  const stored = safeRead<unknown>(keyFor('annotations', scope), []);
  return Array.isArray(stored) ? stored.filter(annotationValid) : [];
}

export function saveAnnotations(scope: DataScope, items: Annotation[]): boolean {
  return safeWrite(keyFor('annotations', scope), items);
}

function voteValid(value: unknown): value is StoredVote {
  if (!value || typeof value !== 'object') return false;
  const v = value as StoredVote;
  return typeof v.vote_id === 'string' && typeof v.user_id === 'string' && typeof v.tile_id === 'string'
    && typeof v.candidate_id === 'string' && labels.includes(v.label)
    && typeof v.created_at_utc === 'string' && ['local', 'pending', 'submitted'].includes(v.status);
}

export function loadVotes(scope: DataScope): StoredVote[] {
  const stored = safeRead<unknown>(keyFor('votes', scope), []);
  return Array.isArray(stored) ? stored.filter(voteValid) : [];
}

export function saveVotes(scope: DataScope, items: StoredVote[]): boolean {
  return safeWrite(keyFor('votes', scope), items);
}

export function toCSV(rows: Record<string, unknown>[]): string {
  if (!rows.length) return '';
  const columns = Array.from(new Set(rows.flatMap(row => Object.keys(row))));
  const cell = (value: unknown) => {
    let text = value === null || value === undefined ? '' : typeof value === 'object' ? JSON.stringify(value) : String(value);
    // Prevent spreadsheet formula evaluation when exported notes are opened in Excel.
    if (/^[=+@\-\t\r]/.test(text) && typeof value === 'string') text = `'${text}`;
    return `"${text.replace(/"/g, '""')}"`;
  };
  return [columns.map(cell).join(','), ...rows.map(row => columns.map(column => cell(row[column])).join(','))].join('\r\n');
}

function download(name: string, text: string, mime: string): void {
  const url = URL.createObjectURL(new Blob([text], { type: mime }));
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = name;
  document.body.append(anchor);
  anchor.click();
  anchor.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export function downloadJSON(name: string, data: unknown): void {
  download(name.endsWith('.json') ? name : `${name}.json`, JSON.stringify(data, null, 2), 'application/json');
}

export function downloadCSV(name: string, rows: Record<string, unknown>[]): void {
  download(name.endsWith('.csv') ? name : `${name}.csv`, '\uFEFF' + toCSV(rows), 'text/csv;charset=utf-8');
}

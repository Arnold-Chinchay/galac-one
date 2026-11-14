/** Shareable explorer state. FOV is the full width of a square cutout, in arcsec. */
export interface ExploreState {
  ra: number;
  dec: number;
  fov: number;
  release: string;
  mode: 'timeline' | 'blink' | 'side' | 'side-by-side' | 'swipe';
  delayMs: number;
  zoom: number;
  invert: boolean;
  detector: string;
  product: 'deep' | 'science' | 'residual' | 'motion';
  a: number;
  b: number;
  channel?: string;
  dateFrom?: string;
  dateTo?: string;
  embed?: boolean;
  /** Prepared field id; when present it selects the field instead of the coordinates. */
  tile?: string;
}

export const DEFAULT_EXPLORE_STATE: Readonly<ExploreState> = Object.freeze({
  ra: 133.786245,
  dec: -7.244372,
  fov: 176,
  release: 'DR1',
  mode: 'timeline',
  delayMs: 250,
  zoom: 1,
  invert: false,
  detector: 'all',
  product: 'deep',
  a: 0,
  b: 7,
});
export const DEFAULT_STATE = DEFAULT_EXPLORE_STATE;

const decimalPattern = /^[+-]?(?:\d+\.?\d*|\.\d+)(?:e[+-]?\d+)?$/i;

/** Decimal RA is degrees; colon/space/h-m-s RA is hours, unless marked d/°. */
export function parseCoordinate(raw: string, axis: 'ra' | 'dec'): number {
  const value = raw.trim().replace(/[−–]/g, '-').replace(/＋/g, '+');
  if (!value) throw new Error(`${axis === 'ra' ? 'RA' : 'Dec'} is required.`);
  let result: number;
  const plain = value.replace(/(?:deg|degrees?|[°d])\s*$/i, '').trim();
  if (decimalPattern.test(plain)) {
    result = Number(plain);
  } else {
    if (/[^\d\s+\-.:hHdDmMsS°′″'"]/.test(value)) {
      throw new Error('Use decimal degrees or sexagesimal coordinates.');
    }
    const degreeMarked = /[dD°]/.test(value);
    if (/[hH]/.test(value) && degreeMarked) throw new Error('Do not mix hours and degrees.');
    const sign = value.startsWith('-') ? -1 : 1;
    const unsigned = value.replace(/^[+-]/, '');
    if (/[+-]/.test(unsigned)) throw new Error('Only the first coordinate component may have a sign.');
    const parts = unsigned.replace(/[hHdDmMsS°′″'":]/g, ' ').trim().split(/\s+/);
    if (parts.length < 2 || parts.length > 3 || parts.some(p => !decimalPattern.test(p))) {
      throw new Error('Use degrees or three sexagesimal components.');
    }
    const [whole, minutes, seconds = 0] = parts.map(Number);
    if (!Number.isInteger(whole) || (parts.length === 3 && !Number.isInteger(minutes)) || minutes >= 60 || seconds >= 60) {
      throw new Error('Sexagesimal minutes and seconds must be below 60.');
    }
    result = sign * (whole + minutes / 60 + seconds / 3600);
    if (axis === 'ra' && !degreeMarked) result *= 15;
  }
  const valid = Number.isFinite(result) && (axis === 'ra' ? result >= 0 && result < 360 : result >= -90 && result <= 90);
  if (!valid) throw new Error(axis === 'ra' ? 'RA must be at least 0° and below 360°.' : 'Dec must be between −90° and +90°.');
  return result;
}

function numeric(params: URLSearchParams, name: string, fallback: number, min: number, max: number, integer = false) {
  const raw = params.get(name);
  if (raw === null || raw.trim() === '') return fallback;
  const n = Number(raw);
  return Number.isFinite(n) && n >= min && n <= max && (!integer || Number.isInteger(n)) ? n : fallback;
}

function dateValue(raw: string | null): string | undefined {
  if (!raw || !/^\d{4}-\d{2}-\d{2}$/.test(raw)) return undefined;
  const time = Date.parse(`${raw}T00:00:00Z`);
  return Number.isFinite(time) && new Date(time).toISOString().slice(0, 10) === raw ? raw : undefined;
}

export function parseExploreSearch(search: string): ExploreState {
  const params = new URLSearchParams(search.startsWith('?') ? search.slice(1) : search);
  const state: ExploreState = { ...DEFAULT_EXPLORE_STATE };
  for (const axis of ['ra', 'dec'] as const) {
    const raw = params.get(axis);
    if (raw !== null) { try { state[axis] = parseCoordinate(raw, axis); } catch { /* Ignore invalid deep-link input. */ } }
  }
  state.fov = numeric(params, 'fov', state.fov, 1, 36000);
  state.delayMs = numeric(params, 'delayMs', state.delayMs, 100, 10000, true);
  state.zoom = numeric(params, 'zoom', state.zoom, 1, 20);
  state.a = numeric(params, 'a', state.a, 0, 100000, true);
  state.b = numeric(params, 'b', state.b, 0, 100000, true);
  const mode = params.get('mode');
  if (mode && ['timeline', 'blink', 'side', 'side-by-side', 'swipe'].includes(mode)) state.mode = mode as ExploreState['mode'];
  const release = params.get('release');
  if (release && /^[A-Za-z0-9][A-Za-z0-9_.+-]{0,39}$/.test(release)) state.release = release;
  const detector = params.get('detector');
  if (detector && /^(?:all|[A-Za-z0-9_-]{1,32})$/.test(detector)) state.detector = detector;
  const channel = params.get('channel');
  if (channel && /^[A-Za-z0-9_.-]{1,32}$/.test(channel)) state.channel = channel;
  state.invert = params.get('invert') === '1' || params.get('invert') === 'true';
  const product = params.get('product');
  if (product === 'residual' || product === 'residuals') state.product = 'residual';
  if (product === 'deep' || product === 'science' || product === 'motion') state.product = product;
  state.dateFrom = dateValue(params.get('dateFrom'));
  state.dateTo = dateValue(params.get('dateTo'));
  if (state.dateFrom && state.dateTo && state.dateFrom > state.dateTo) { state.dateFrom = undefined; state.dateTo = undefined; }
  state.embed = params.get('embed') === '1';
  const tile = params.get('tile');
  if (tile && /^[A-Za-z0-9_-]{1,64}$/.test(tile)) state.tile = tile;
  return state;
}

export function toExploreSearch(state: ExploreState): string {
  const params = new URLSearchParams({
    ra: String(state.ra), dec: String(state.dec), fov: String(state.fov),
    release: state.release, mode: state.mode, delayMs: String(state.delayMs),
    zoom: String(state.zoom), invert: state.invert ? '1' : '0',
    detector: state.detector, product: state.product, a: String(state.a), b: String(state.b),
  });
  if (state.channel) params.set('channel', state.channel);
  if (state.dateFrom) params.set('dateFrom', state.dateFrom);
  if (state.dateTo) params.set('dateTo', state.dateTo);
  if (state.embed) params.set('embed', '1');
  if (state.tile) params.set('tile', state.tile);
  return `?${params.toString()}`;
}

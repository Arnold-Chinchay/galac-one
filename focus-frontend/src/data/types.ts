export type Label = 'moving' | 'variable' | 'artifact' | 'unsure'
export interface FieldQuery { q?: string; ra?: number; dec?: number; fov?: number; release?: string }
export interface Field {
  tile_id: string; title: string; center: { ra_deg: number; dec_deg: number; frame: 'ICRS' };
  fov_arcsec: number; release: string; status: 'queued' | 'processing' | 'ready' | 'failed' | 'pending';
  manifest_url?: string; origin?: 'spherex' | 'synthetic'; match?: 'exact' | 'nearby';
  kind?: 'moving' | 'variable'; description?: string; source_url?: string; reference_epoch?: string; frame_count?: number;
}
export interface Product {
  available: boolean; units?: string | null; method?: string; version?: string;
  validation?: string; stretch?: { type: string; min: number; max: number }; url?: string;
}
export interface Manifest {
  schema_version: string; tile_id: string; title: string; center: Field['center'];
  fov_arcsec: number; release: string; origin: 'spherex' | 'synthetic'; pipeline_version: string;
  processed_at_utc: string; frame_count: number; grid_id: string; width_px: number; height_px: number;
  pixel_scale_arcsec: number | null; wcs?: unknown; frames_url: string; candidates_url?: string;
  gaia_url?: string; known_url?: string; products: Record<string, Product>; releases?: string[];
}
export interface Frame {
  frame_id: string; obs_id: string; detector: number | null; observed_at_utc: string;
  t_mid: number | null; time_scale?: string; wavelength_um: number | null; bandwidth_um: number | null;
  wavelength_position?: string; masked_fraction: number | null; quality_flags: string[];
  release: string; source_url: string | null; processing_version: string; photometric_group_id?: string | null;
  science_url: string; residual_url?: string | null; quality_mask_url?: string | null; cube_index?: number;
  width_px?: number; height_px?: number;
}
export interface Position { frame_id: string; x_px: number; y_px: number; ra_deg?: number; dec_deg?: number; detected?: boolean }
export interface Candidate {
  candidate_id: string; tile_id: string; grid_id: string; title: string; positions: Position[];
  suggested_label?: Label; catalog_match?: { catalog: string; source_id: string } | null;
  /** Sits on a saturated or very bright star, whose imperfect subtraction often fools the detector. */
  bright_star?: boolean;
}
export interface Overlay extends Position {
  source_id: string; grid_id: string; catalog: string; reference_epoch?: string;
  propagated_to_frame?: boolean; simulated?: boolean;
}
export interface Tile { manifest: Manifest; frames: Frame[]; candidates: Candidate[]; gaia: Overlay[]; known: Overlay[]; files_url?: string; cube?: import('../lib/render').Cube }
export interface CommunityStats { tiles: number; candidates: number; votes: number; users: number; leaderboard: { alias: string; n_votes: number; reliability: number | null }[] }
export interface Vote {
  vote_id: string; user_id: string; tile_id: string; candidate_id: string; label: Label; created_at_utc: string;
}
export interface VoteResult { accepted_vote_ids: string[]; issues?: { vote_id: string; code: string; message: string }[]; stats?: UserStats }
export interface UserStats { n_votes: number; reliability: number | null }
export interface DataProvider {
  listFields(query?: FieldQuery, signal?: AbortSignal): Promise<Field[]>;
  resolveField(query: FieldQuery, signal?: AbortSignal): Promise<Field | null>;
  loadTile(field: Field | string, signal?: AbortSignal): Promise<Tile>;
  listCandidates(tileId: string, signal?: AbortSignal): Promise<Candidate[]>;
  submitVotes(votes: Vote[], signal?: AbortSignal): Promise<VoteResult>;
}

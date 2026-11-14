-- D1 schema for Naylamp Space (see docs/11 section 7)

CREATE TABLE IF NOT EXISTS tiles (
  id          TEXT PRIMARY KEY,
  ra          REAL NOT NULL,
  dec         REAL NOT NULL,
  fov_deg     REAL NOT NULL,
  release     TEXT NOT NULL DEFAULT 'DR1',
  status      TEXT NOT NULL DEFAULT 'queued' CHECK (status IN ('queued','processing','ready','failed')),
  n_frames    INTEGER,
  completeness REAL,
  label       TEXT,
  created_at  TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS candidates (
  id          TEXT PRIMARY KEY,
  tile_id     TEXT NOT NULL REFERENCES tiles(id),
  x           REAL NOT NULL,
  y           REAL NOT NULL,
  t_ref       REAL,
  kind        TEXT,
  score       REAL,
  is_injection INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS idx_candidates_tile ON candidates(tile_id);

-- Ground truth for injected synthetic objects. NEVER exposed by the API.
CREATE TABLE IF NOT EXISTS injections (
  id          TEXT PRIMARY KEY,
  tile_id     TEXT NOT NULL REFERENCES tiles(id),
  candidate_id TEXT NOT NULL REFERENCES candidates(id),
  x0          REAL NOT NULL,
  y0          REAL NOT NULL,
  vx          REAL NOT NULL,
  vy          REAL NOT NULL,
  mag         REAL NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_injections_tile ON injections(tile_id);
CREATE INDEX IF NOT EXISTS idx_injections_candidate ON injections(candidate_id);

CREATE TABLE IF NOT EXISTS users (
  id          TEXT PRIMARY KEY,
  alias       TEXT,
  reliability REAL NOT NULL DEFAULT 0.5,
  n_votes     INTEGER NOT NULL DEFAULT 0,
  n_graded    INTEGER NOT NULL DEFAULT 0,
  n_correct   INTEGER NOT NULL DEFAULT 0,
  created_at  TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS votes (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id     TEXT NOT NULL REFERENCES users(id),
  candidate_id TEXT NOT NULL REFERENCES candidates(id),
  label       TEXT NOT NULL CHECK (label IN ('moving','variable','artifact','unsure')),
  ms          INTEGER,
  created_at  TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE (user_id, candidate_id)
);
CREATE INDEX IF NOT EXISTS idx_votes_candidate ON votes(candidate_id);

-- Community answers on sources the automatic sky search found (Classify > Sky hunt). One answer per person per source.
-- source_key = "<region>:<ra 4 decimals>:<dec 4 decimals>", stable across reruns of the same region.
CREATE TABLE IF NOT EXISTS sky_votes (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id     TEXT NOT NULL,
  source_key  TEXT NOT NULL,
  region      TEXT NOT NULL,
  ra          REAL NOT NULL,
  dec         REAL NOT NULL,
  label       TEXT NOT NULL CHECK (label IN ('red', 'star', 'glare', 'nothing')),
  created_at  TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE (user_id, source_key)
);
CREATE INDEX IF NOT EXISTS idx_sky_votes_region ON sky_votes(region);
CREATE INDEX IF NOT EXISTS idx_sky_votes_source ON sky_votes(source_key);

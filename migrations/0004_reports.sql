-- Reports from people who picked their own source to follow (Classify > Follow your own star).
-- Stored for the team to review; never shown to other users.
CREATE TABLE IF NOT EXISTS reports (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id     TEXT NOT NULL,
  tile_id     TEXT NOT NULL REFERENCES tiles(id),
  x           REAL NOT NULL,
  y           REAL NOT NULL,
  label       TEXT NOT NULL CHECK (label IN ('moving','variable','artifact','unsure','static')),
  note        TEXT,
  pm_east     REAL,
  pm_north    REAL,
  pm_err      REAL,
  n_detected  INTEGER,
  variability REAL,
  created_at  TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_reports_tile ON reports(tile_id);
CREATE INDEX IF NOT EXISTS idx_reports_user ON reports(user_id, created_at);

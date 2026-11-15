// One Worker: static web, API and tile files from R2.
// Injection truth (candidates.is_injection, table injections) is never returned by any endpoint.

const CORS = {
  "access-control-allow-origin": "*",
  "access-control-allow-methods": "GET,POST,OPTIONS",
  "access-control-allow-headers": "content-type",
};
const json = (data, status = 200, extra = {}) =>
  new Response(JSON.stringify(data), { status, headers: { "content-type": "application/json; charset=utf-8", ...CORS, ...extra } });
const err = (status, message) => json({ error: message }, status);

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const LABELS = new Set(["moving", "variable", "artifact", "unsure"]);
const filesUrl = (id) => (id === "mock" ? "/mock-tile/" : `/tiles/${id}/`);

function parseTrack(s) {
  try { return s ? JSON.parse(s) : null; } catch { return null; }
}

// Playable fields the sky crawler cuts around its most promising red sources (files on Hugging Face).
const SKY_FIELDS = "https://huggingface.co/datasets/naylamp-space/spherex-deep-sky/resolve/main/fields/index.json";
const SKY_ID = /^sky\d+-[0-9a-f]{6}$/;
async function skyFields() {
  try {
    const r = await fetch(SKY_FIELDS, { cf: { cacheTtl: 600, cacheEverything: true } });
    if (!r.ok) return [];
    const rows = (await r.json()).tiles ?? [];
    return rows.filter((t) => SKY_ID.test(t.id) && typeof t.files_url === "string" && t.files_url.startsWith("https://huggingface.co/"));
  } catch { return []; }
}

async function listTiles(env) {
  const [{ results }, sky] = await Promise.all([env.DB.prepare(
    "SELECT id, ra, dec, fov_deg, release, n_frames, completeness, label FROM tiles WHERE status = 'ready' AND id NOT LIKE 'sky%' ORDER BY created_at DESC LIMIT 200"
  ).all(), skyFields()]);
  const fixed = results.map((t) => ({ ...t, files_url: filesUrl(t.id) }));
  const fresh = sky.map(({ id, ra, dec, fov_deg, release, n_frames, label, files_url }) => ({ id, ra, dec, fov_deg, release, n_frames, completeness: null, label, files_url, sky: true }));
  return json({ tiles: [...fixed, ...fresh] });
}

// The first vote on a crawler field registers it and its spots, so votes keep their foreign keys.
async function registerSkyFields(env, ids) {
  const tileIds = [...new Set(ids.map((id) => id.replace(/-c\d+$/, "")).filter((t) => SKY_ID.test(t)))];
  if (!tileIds.length) return;
  const rows = (await skyFields()).filter((t) => tileIds.includes(t.id));
  for (const t of rows) {
    const r = await fetch(t.files_url + "candidates.json", { cf: { cacheTtl: 3600, cacheEverything: true } }).catch(() => null);
    if (!r?.ok) continue;
    const cands = (await r.json().catch(() => [])).filter((c) => typeof c?.id === "string" && c.id.startsWith(t.id + "-c"));
    await env.DB.batch([
      env.DB.prepare("INSERT OR IGNORE INTO tiles (id, ra, dec, fov_deg, release, status, n_frames, label) VALUES (?1, ?2, ?3, ?4, ?5, 'ready', ?6, ?7)")
        .bind(t.id, t.ra, t.dec, t.fov_deg, t.release || "DR1+QR3", t.n_frames ?? null, String(t.label ?? t.id).slice(0, 80)),
      ...cands.slice(0, 20).map((c) => env.DB.prepare(
        "INSERT OR IGNORE INTO candidates (id, tile_id, x, y, t_ref, kind, score, is_injection, track) VALUES (?1, ?2, ?3, ?4, ?5, NULL, NULL, 0, ?6)"
      ).bind(c.id, t.id, Number(c.x), Number(c.y), Number.isFinite(c.frame) ? c.frame : null, c.track ? JSON.stringify(c.track) : null)),
    ]);
  }
}

// Candidates of a tile with public vote counts. Does not select is_injection.
async function tileCandidates(env, tileId) {
  const { results } = await env.DB.prepare(
    `SELECT c.id, c.x, c.y, c.t_ref, c.kind AS kind_hint, c.score, c.track,
            SUM(v.label='moving') AS n_moving, SUM(v.label='variable') AS n_variable,
            SUM(v.label='artifact') AS n_artifact, SUM(v.label='unsure') AS n_unsure, COUNT(v.id) AS n_votes
     FROM candidates c LEFT JOIN votes v ON v.candidate_id = c.id
     WHERE c.tile_id = ?1 GROUP BY c.id ORDER BY c.id LIMIT 500`
  ).bind(tileId).all();
  return json({ tile_id: tileId, candidates: results.map((r) => ({ ...r, track: parseTrack(r.track) })) });
}

// Next candidates this user has not voted on yet (random order).
async function nextCandidates(env, url) {
  const tile = url.searchParams.get("tile");
  const user = url.searchParams.get("user") || "";
  const n = Math.min(Math.max(parseInt(url.searchParams.get("n") || "5", 10) || 5, 1), 20);
  if (!tile) return err(400, "tile is required");
  const { results } = await env.DB.prepare(
    `SELECT c.id, c.x, c.y, c.t_ref, c.kind AS kind_hint, c.score, c.track FROM candidates c
     WHERE c.tile_id = ?1 AND NOT EXISTS (SELECT 1 FROM votes v WHERE v.candidate_id = c.id AND v.user_id = ?2)
     ORDER BY RANDOM() LIMIT ?3`
  ).bind(tile, user, n).all();
  return json({ tile_id: tile, candidates: results.map((r) => ({ ...r, track: parseTrack(r.track) })) });
}

// POST /api/votes  { user_id, alias?, votes: [{ candidate_id, label, ms? }] }  (max 50 per call)
async function postVotes(env, request) {
  let body;
  try { body = await request.json(); } catch { return err(400, "invalid json"); }
  const userId = body?.user_id;
  if (typeof userId !== "string" || !UUID.test(userId)) return err(400, "user_id must be a uuid");
  const votes = Array.isArray(body.votes) ? body.votes.slice(0, 50) : [];
  if (!votes.length) return err(400, "votes must be a non-empty array");
  for (const v of votes) {
    if (typeof v?.candidate_id !== "string" || v.candidate_id.length > 64) return err(400, "bad candidate_id");
    if (!LABELS.has(v.label)) return err(400, `label must be one of ${[...LABELS].join(", ")}`);
  }
  const alias = typeof body.alias === "string" ? body.alias.replace(/[^\w .\-]/g, "").trim().slice(0, 24) || null : null;

  // keep only candidates that exist (D1 enforces foreign keys)
  const ids = [...new Set(votes.map((v) => v.candidate_id))];
  const ph = ids.map((_, i) => `?${i + 1}`).join(",");
  const lookup = async () => new Set((await env.DB.prepare(`SELECT id FROM candidates WHERE id IN (${ph})`).bind(...ids).all()).results.map((r) => r.id));
  let known = await lookup();
  const missing = ids.filter((id) => !known.has(id));
  if (missing.some((id) => id.startsWith("sky"))) { try { await registerSkyFields(env, missing); known = await lookup(); } catch { /* field not reachable: those votes are ignored */ } }
  const valid = votes.filter((v) => known.has(v.candidate_id));
  if (!valid.length) return err(400, "no known candidates in votes");

  const stmts = [
    env.DB.prepare("INSERT OR IGNORE INTO users (id, alias) VALUES (?1, ?2)").bind(userId, alias),
    ...(alias ? [env.DB.prepare("UPDATE users SET alias = ?2 WHERE id = ?1").bind(userId, alias)] : []),
    ...valid.map((v) =>
      env.DB.prepare("INSERT OR IGNORE INTO votes (user_id, candidate_id, label, ms) VALUES (?1, ?2, ?3, ?4)")
        .bind(userId, v.candidate_id, v.label, Number.isFinite(v.ms) ? Math.round(v.ms) : null)),
    // reliability = accuracy on hidden injections (must be 'moving') and blank controls (must not be)
    env.DB.prepare(
      `UPDATE users SET
         n_votes   = (SELECT COUNT(*) FROM votes WHERE user_id = ?1),
         n_graded  = (SELECT COUNT(*) FROM votes v JOIN candidates c ON c.id = v.candidate_id WHERE v.user_id = ?1 AND c.is_injection IN (1, 2)),
         n_correct = (SELECT COUNT(*) FROM votes v JOIN candidates c ON c.id = v.candidate_id WHERE v.user_id = ?1 AND
                      ((c.is_injection = 1 AND v.label = 'moving') OR (c.is_injection = 2 AND v.label IN ('artifact', 'unsure'))))
       WHERE id = ?1`).bind(userId),
    env.DB.prepare("UPDATE users SET reliability = (n_correct + 1.0) / (n_graded + 2.0) WHERE id = ?1").bind(userId),
    env.DB.prepare("SELECT n_votes, reliability FROM users WHERE id = ?1").bind(userId),
  ];
  const res = await env.DB.batch(stmts);
  const me = res[res.length - 1].results[0] || {};
  // Deliberately NOT revealing which votes were test objects.
  return json({ ok: true, accepted: valid.length, ignored: votes.length - valid.length, n_votes: me.n_votes, reliability: me.reliability });
}

// POST /api/reports  { user_id, tile_id, x, y, label, note?, pm_east?, pm_north?, pm_err?, n_detected?, variability? }
// A source the person chose and followed themselves. Stored for review only; no endpoint lists them back.
const REPORT_LABELS = new Set(["moving", "variable", "artifact", "unsure", "static"]);
async function postReport(env, request) {
  let b;
  try { b = await request.json(); } catch { return err(400, "invalid json"); }
  if (typeof b?.user_id !== "string" || !UUID.test(b.user_id)) return err(400, "user_id must be a uuid");
  if (typeof b.tile_id !== "string" || !/^[\w\-]{1,64}$/.test(b.tile_id)) return err(400, "bad tile_id");
  if (!REPORT_LABELS.has(b.label)) return err(400, `label must be one of ${[...REPORT_LABELS].join(", ")}`);
  const num = (v, lo, hi) => (typeof v === "number" && Number.isFinite(v) && v >= lo && v <= hi ? v : null);
  const x = num(b.x, -1, 10000), y = num(b.y, -1, 10000);
  if (x === null || y === null) return err(400, "x and y must be pixel positions");
  // Printable text only, short: notes are read by the team, never shown to other visitors.
  const note = typeof b.note === "string" ? b.note.replace(/[\u0000-\u001f\u007f]/g, " ").trim().slice(0, 280) || null : null;
  const tile = await env.DB.prepare("SELECT id FROM tiles WHERE id = ?1").bind(b.tile_id).first();
  if (!tile) return err(400, "unknown tile");
  const recent = await env.DB.prepare("SELECT COUNT(*) AS n FROM reports WHERE user_id = ?1 AND created_at > datetime('now', '-1 hour')").bind(b.user_id).first();
  if (recent.n >= 60) return err(429, "too many reports in the last hour");
  await env.DB.batch([
    env.DB.prepare("INSERT OR IGNORE INTO users (id) VALUES (?1)").bind(b.user_id),
    env.DB.prepare(
      `INSERT INTO reports (user_id, tile_id, x, y, label, note, pm_east, pm_north, pm_err, n_detected, variability)
       VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11)`
    ).bind(b.user_id, b.tile_id, x, y, b.label, note, num(b.pm_east, -1e4, 1e4), num(b.pm_north, -1e4, 1e4),
      num(b.pm_err, 0, 1e4), num(b.n_detected, 0, 1e6), num(b.variability, -1e6, 1e6)),
  ]);
  const total = await env.DB.prepare("SELECT COUNT(*) AS n FROM reports").first();
  return json({ ok: true, reports: total.n });
}

// POST /api/sky-votes { user_id, alias?, votes: [{ source_key, region, ra, dec, label }] } (max 20)
// GET  /api/sky-votes?region=r6783 -> { counts: { <source_key>: { red, star, glare, nothing } } }
const SKY_LABELS = new Set(["red", "star", "glare", "nothing"]);
const SOURCE_KEY = /^r\d{1,6}:-?\d{1,3}\.\d{4}:-?\d{1,2}\.\d{4}$/;
async function postSkyVotes(env, request) {
  let b;
  try { b = await request.json(); } catch { return err(400, "invalid json"); }
  if (typeof b?.user_id !== "string" || !UUID.test(b.user_id)) return err(400, "user_id must be a uuid");
  const votes = Array.isArray(b.votes) ? b.votes.slice(0, 20) : [];
  if (!votes.length) return err(400, "votes must be a non-empty array");
  for (const v of votes) {
    if (typeof v?.source_key !== "string" || !SOURCE_KEY.test(v.source_key)) return err(400, "bad source_key");
    if (!SKY_LABELS.has(v.label)) return err(400, `label must be one of ${[...SKY_LABELS].join(", ")}`);
    if (!(Number.isFinite(v.ra) && Number.isFinite(v.dec) && Math.abs(v.dec) <= 90)) return err(400, "bad position");
  }
  const alias = typeof b.alias === "string" ? b.alias.replace(/[^\w .\-]/g, "").trim().slice(0, 24) || null : null;
  await env.DB.batch([
    env.DB.prepare("INSERT OR IGNORE INTO users (id, alias) VALUES (?1, ?2)").bind(b.user_id, alias),
    ...votes.map((v) => env.DB.prepare(
      "INSERT OR IGNORE INTO sky_votes (user_id, source_key, region, ra, dec, label) VALUES (?1, ?2, ?3, ?4, ?5, ?6)"
    ).bind(b.user_id, v.source_key, v.source_key.split(":")[0], v.ra, v.dec, v.label)),
  ]);
  return json({ ok: true, accepted: votes.map((v) => v.source_key) });
}
async function skyVoteCounts(env, url) {
  const region = url.searchParams.get("region") || "";
  if (!/^r\d{1,6}$/.test(region)) return err(400, "region must look like r1234");
  const { results } = await env.DB.prepare(
    "SELECT source_key, label, COUNT(*) AS n FROM sky_votes WHERE region = ?1 GROUP BY source_key, label LIMIT 2000"
  ).bind(region).all();
  const counts = {};
  for (const r of results) (counts[r.source_key] ??= { red: 0, star: 0, glare: 0, nothing: 0 })[r.label] = r.n;
  return json({ region, counts }, 200, { "cache-control": "public, max-age=30" });
}

async function stats(env) {
  const [a, top] = await env.DB.batch([
    env.DB.prepare(
      `SELECT (SELECT COUNT(*) FROM tiles WHERE status='ready') AS tiles,
              (SELECT COUNT(*) FROM candidates) AS candidates,
              (SELECT COUNT(*) FROM votes) AS votes, (SELECT COUNT(*) FROM users) AS users`),
    env.DB.prepare(
      "SELECT COALESCE(alias,'anonymous') AS alias, n_votes, ROUND(reliability,2) AS reliability FROM users WHERE n_votes > 0 ORDER BY n_votes DESC LIMIT 10"),
  ]);
  // The reports table arrives with migration 0004; stats keep working without it.
  let reports = null;
  try { reports = (await env.DB.prepare("SELECT COUNT(*) AS n FROM reports").first()).n; } catch { /* not migrated yet */ }
  let sky_votes = null;
  try { sky_votes = (await env.DB.prepare("SELECT COUNT(*) AS n FROM sky_votes").first()).n; } catch { /* not migrated yet */ }
  return json({ ...a.results[0], reports, sky_votes, leaderboard: top.results });
}

async function me(env, url) {
  const u = url.searchParams.get("user") || "";
  if (!UUID.test(u)) return err(400, "user must be a uuid");
  const r = await env.DB.prepare("SELECT COALESCE(alias,'anonymous') AS alias, n_votes, ROUND(reliability,3) AS reliability FROM users WHERE id = ?1").bind(u).first();
  return json(r || { alias: null, n_votes: 0, reliability: null });
}

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    const path = url.pathname;
    if (request.method === "OPTIONS") return new Response(null, { status: 204, headers: CORS });

    try {
      if (path === "/api/health") {
        const out = { ok: true, time: new Date().toISOString() };
        try { out.tiles = (await env.DB.prepare("SELECT COUNT(*) AS n FROM tiles").first()).n; } catch (e) { out.ok = false; out.d1_error = String(e).slice(0, 120); }
        try { out.r2_objects_seen = (await env.TILES.list({ limit: 1 })).objects.length; } catch (e) { out.ok = false; out.r2_error = String(e).slice(0, 120); }
        return json(out, out.ok ? 200 : 500);
      }
      if (path === "/api/tiles") return listTiles(env);
      let m = path.match(/^\/api\/tiles\/([\w\-]+)\/candidates$/);
      if (m) return tileCandidates(env, m[1]);
      if (path === "/api/next") return nextCandidates(env, url);
      if (path === "/api/votes" && request.method === "POST") return postVotes(env, request);
      if (path === "/api/reports" && request.method === "POST") return postReport(env, request);
      if (path === "/api/sky-votes" && request.method === "POST") return postSkyVotes(env, request);
      if (path === "/api/sky-votes") return skyVoteCounts(env, url);
      if (path === "/api/stats") return stats(env);
      if (path === "/api/me") return me(env, url);

      if (path.startsWith("/tiles/")) {
        // Tile files are read from R2 once per data centre and then served from Cloudflare's cache.
        const cache = caches.default, key = new Request(url.origin + path);
        const hit = await cache.match(key);
        if (hit) return hit;
        const obj = await env.TILES.get(decodeURIComponent(path.slice(1)));
        if (!obj) return err(404, "not found");
        const headers = new Headers(CORS);
        obj.writeHttpMetadata(headers);
        headers.set("etag", obj.httpEtag);
        headers.set("cache-control", "public, max-age=86400, stale-while-revalidate=604800");
        const res = new Response(obj.body, { headers });
        ctx?.waitUntil(cache.put(key, res.clone()));
        return res;
      }
      if (path.startsWith("/api/")) return err(404, "not found");
    } catch (e) {
      return err(500, String(e).slice(0, 160));
    }

    // Everything else: the static web (mock tile files are static assets under /mock-tile/).
    const res = await env.ASSETS.fetch(request);
    if (path.startsWith("/mock-tile/")) {
      const h = new Headers(res.headers);
      h.set("access-control-allow-origin", "*");
      return new Response(res.body, { status: res.status, headers: h });
    }
    return res;
  },
};

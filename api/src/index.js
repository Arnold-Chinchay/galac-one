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

async function listTiles(env) {
  const { results } = await env.DB.prepare(
    "SELECT id, ra, dec, fov_deg, release, n_frames, completeness, label FROM tiles WHERE status = 'ready' ORDER BY created_at DESC LIMIT 200"
  ).all();
  return json({ tiles: results.map((t) => ({ ...t, files_url: filesUrl(t.id) })) });
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
  const known = new Set((await env.DB.prepare(`SELECT id FROM candidates WHERE id IN (${ph})`).bind(...ids).all()).results.map((r) => r.id));
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

async function stats(env) {
  const [a, top] = await env.DB.batch([
    env.DB.prepare(
      `SELECT (SELECT COUNT(*) FROM tiles WHERE status='ready') AS tiles,
              (SELECT COUNT(*) FROM candidates) AS candidates,
              (SELECT COUNT(*) FROM votes) AS votes, (SELECT COUNT(*) FROM users) AS users`),
    env.DB.prepare(
      "SELECT COALESCE(alias,'anonymous') AS alias, n_votes, ROUND(reliability,2) AS reliability FROM users WHERE n_votes > 0 ORDER BY n_votes DESC LIMIT 10"),
  ]);
  return json({ ...a.results[0], leaderboard: top.results });
}

async function me(env, url) {
  const u = url.searchParams.get("user") || "";
  if (!UUID.test(u)) return err(400, "user must be a uuid");
  const r = await env.DB.prepare("SELECT COALESCE(alias,'anonymous') AS alias, n_votes, ROUND(reliability,3) AS reliability FROM users WHERE id = ?1").bind(u).first();
  return json(r || { alias: null, n_votes: 0, reliability: null });
}

export default {
  async fetch(request, env) {
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
      if (path === "/api/stats") return stats(env);
      if (path === "/api/me") return me(env, url);

      if (path.startsWith("/tiles/")) {
        const obj = await env.TILES.get(decodeURIComponent(path.slice(1)));
        if (!obj) return err(404, "not found");
        const headers = new Headers(CORS);
        obj.writeHttpMetadata(headers);
        headers.set("etag", obj.httpEtag);
        headers.set("cache-control", "public, max-age=3600");
        return new Response(obj.body, { headers });
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

// Naylamp Space - one Worker: static web + light API + tile files from R2.
// Free plan limits: 10 ms CPU/request, 100k requests/day -> keep every handler trivial (docs/11).

const JSON_HEADERS = { "content-type": "application/json; charset=utf-8", "access-control-allow-origin": "*" };
const json = (data, status = 200) => new Response(JSON.stringify(data), { status, headers: JSON_HEADERS });

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const path = url.pathname;

    // Health: proves D1 and R2 are wired up.
    if (path === "/api/health") {
      const out = { ok: true, time: new Date().toISOString() };
      try {
        const r = await env.DB.prepare("SELECT COUNT(*) AS n FROM tiles").first();
        out.tiles = r.n;
      } catch (e) {
        out.ok = false;
        out.d1_error = String(e).slice(0, 120);
      }
      try {
        const l = await env.TILES.list({ limit: 1 });
        out.r2_objects_seen = l.objects.length;
      } catch (e) {
        out.ok = false;
        out.r2_error = String(e).slice(0, 120);
      }
      return json(out, out.ok ? 200 : 500);
    }

    // List ready tiles.
    if (path === "/api/tiles") {
      const { results } = await env.DB.prepare(
        "SELECT id, ra, dec, fov_deg, release, n_frames, completeness, label FROM tiles WHERE status = 'ready' ORDER BY created_at DESC LIMIT 200"
      ).all();
      return json({ tiles: results });
    }

    // Tile files from R2: /tiles/<tile_id>/<file>. Long cache so the CDN absorbs repeat downloads.
    if (path.startsWith("/tiles/")) {
      const key = decodeURIComponent(path.slice(1));
      const obj = await env.TILES.get(key);
      if (!obj) return json({ error: "not found" }, 404);
      const headers = new Headers();
      obj.writeHttpMetadata(headers);
      headers.set("etag", obj.httpEtag);
      headers.set("cache-control", "public, max-age=3600");
      headers.set("access-control-allow-origin", "*");
      return new Response(obj.body, { headers });
    }

    if (path.startsWith("/api/")) return json({ error: "not found" }, 404);

    // Everything else: the static web.
    return env.ASSETS.fetch(request);
  },
};

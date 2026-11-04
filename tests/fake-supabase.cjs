// A small in-memory stand-in for the parts of Supabase the app uses (auth, the
// hb_records table, the hb-photos bucket), for browser tests. It mirrors the rules
// in supabase/setup.sql: each token reaches only its own user's rows and files,
// and an older updated_at never replaces a newer one.
const http = require('http');
const crypto = require('crypto');

function createFakeSupabase({ anonKey = 'sb_publishable_test', expiresIn = 3600 } = {}) {
  const users = new Map();      // email -> {id, email, password}
  const access = new Map();     // token -> user id
  const refresh = new Map();    // token -> user id
  const rows = new Map();       // `${uid}|${kind}|${id}` -> row
  const files = new Map();      // path -> {type, body}
  const links = new Map();      // email -> the sign-in link last "emailed"
  const fail = new Set();       // emails whose next link comes back expired
  let clock = 0;
  const now = () => (clock = Math.max(clock + 1, Date.now()));
  const tok = () => crypto.randomBytes(16).toString('hex');

  const session = (u) => {
    const a = tok(), r = tok();
    access.set(a, u.id); refresh.set(r, u.id);
    return { access_token: a, token_type: 'bearer', expires_in: expiresIn, expires_at: Math.floor(Date.now() / 1000) + expiresIn, refresh_token: r, user: { id: u.id, email: u.email } };
  };
  const byId = (id) => [...users.values()].find((u) => u.id === id);

  const server = http.createServer(async (req, res) => {
    const cors = { 'access-control-allow-origin': '*', 'access-control-allow-headers': '*', 'access-control-allow-methods': 'GET,POST,PUT,PATCH,DELETE,OPTIONS' };
    const send = (status, body, headers = {}) => {
      const isBuf = Buffer.isBuffer(body);
      res.writeHead(status, { ...cors, ...(isBuf ? {} : { 'content-type': 'application/json' }), ...headers });
      res.end(body == null ? '' : isBuf ? body : JSON.stringify(body));
    };
    if (req.method === 'OPTIONS') return send(204, null);
    const chunks = [];
    for await (const c of req) chunks.push(c);
    const raw = Buffer.concat(chunks);
    const json = () => { try { return JSON.parse(raw.toString() || 'null'); } catch { return null; } };
    const url = new URL(req.url, 'http://x');
    const p = url.pathname;

    if (p === '/__link') return send(200, { link: links.get(url.searchParams.get('email')) || null });
    if (p === '/__dump') return send(200, { users: [...users.values()].map((u) => ({ id: u.id, email: u.email })), rows: [...rows.values()], files: [...files.keys()] });
    if (req.headers.apikey !== anonKey) return send(401, { message: 'Invalid API key' });

    // ── Auth ──
    if (p.startsWith('/auth/v1/')) {
      const b = json() || {};
      const route = p.slice('/auth/v1/'.length);
      if (route === 'signup') {
        if (users.has(b.email)) return send(422, { code: 422, error_code: 'user_already_exists', msg: 'User already registered' });
        const u = { id: crypto.randomUUID(), email: b.email, password: b.password };
        users.set(b.email, u);
        return send(200, session(u));
      }
      if (route === 'token') {
        const g = url.searchParams.get('grant_type');
        if (g === 'password') {
          const u = users.get(b.email);
          if (!u || u.password !== b.password) return send(400, { code: 400, error_code: 'invalid_credentials', msg: 'Invalid login credentials' });
          return send(200, session(u));
        }
        if (g === 'refresh_token') {
          const uid = refresh.get(b.refresh_token);
          if (!uid) return send(400, { code: 400, error_code: 'refresh_token_not_found', msg: 'Invalid Refresh Token: Refresh Token Not Found' });
          refresh.delete(b.refresh_token); // rotation
          return send(200, session(byId(uid)));
        }
      }
      if (route === 'otp') {
        const u = users.get(b.email);
        if (!u) return send(422, { code: 422, error_code: 'otp_disabled', msg: 'Signups not allowed for otp' });
        // The link's verify step redirects back with the session (or an error) in the hash.
        const back = url.searchParams.get('redirect_to');
        let hash;
        if (fail.delete(b.email)) hash = 'error=access_denied&error_code=otp_expired&error_description=Email+link+is+invalid+or+has+expired';
        else {
          const s = session(u);
          hash = new URLSearchParams({ access_token: s.access_token, expires_at: String(s.expires_at), expires_in: String(s.expires_in), refresh_token: s.refresh_token, token_type: 'bearer', type: 'magiclink' }).toString();
        }
        links.set(b.email, `${back}#${hash}`);
        return send(200, {});
      }
      if (route === 'user') {
        const uid = access.get((req.headers.authorization || '').replace(/^Bearer /, ''));
        const u = uid && byId(uid);
        if (!u) return send(401, { code: 401, error_code: 'bad_jwt', msg: 'invalid JWT' });
        return send(200, { id: u.id, email: u.email, aud: 'authenticated' });
      }
      if (route === 'logout') { access.delete((req.headers.authorization || '').slice(7)); return send(204, null); }
      return send(404, { msg: 'not found' });
    }

    const uid = access.get((req.headers.authorization || '').replace(/^Bearer /, ''));
    if (!uid) return send(401, { message: 'JWT expired' });

    // ── PostgREST ──
    if (p === '/rest/v1/hb_records') {
      if (req.method === 'GET') {
        const gt = Number((url.searchParams.get('synced_at') || 'gt.0').slice(3));
        const limit = Number(url.searchParams.get('limit') || 1000), offset = Number(url.searchParams.get('offset') || 0);
        const mine = [...rows.values()].filter((r) => r.user_id === uid && r.synced_at > gt)
          .sort((a, b) => a.synced_at - b.synced_at || a.kind.localeCompare(b.kind) || a.id.localeCompare(b.id));
        return send(200, mine.slice(offset, offset + limit).map(({ kind, id, data, deleted, updated_at, synced_at }) => ({ kind, id, data, deleted, updated_at, synced_at })));
      }
      if (req.method === 'POST') {
        const list = json();
        if (!Array.isArray(list)) return send(400, { message: 'expected an array' });
        if (list.some((r) => r.user_id !== uid)) return send(403, { code: '42501', message: 'new row violates row-level security policy for table "hb_records"' });
        for (const r of list) {
          const k = `${uid}|${r.kind}|${r.id}`;
          const old = rows.get(k);
          if (old && r.updated_at < old.updated_at) continue;
          rows.set(k, { user_id: uid, kind: r.kind, id: r.id, data: r.data ?? null, deleted: !!r.deleted, updated_at: r.updated_at, synced_at: now() });
        }
        return send(201, null);
      }
    }

    // ── Storage ──
    const own = (path) => path.split('/')[0] === uid;
    if (p === '/storage/v1/object/hb-photos' && req.method === 'DELETE') {
      for (const path of json()?.prefixes || []) if (own(path)) files.delete(path);
      return send(200, []);
    }
    let m = /^\/storage\/v1\/object\/hb-photos\/(.+)$/.exec(p);
    if (m && req.method === 'POST') {
      const path = decodeURIComponent(m[1]);
      if (!own(path)) return send(403, { statusCode: '403', error: 'Unauthorized', message: 'new row violates row-level security policy' });
      files.set(path, { type: req.headers['content-type'], body: raw });
      return send(200, { Key: `hb-photos/${path}` });
    }
    m = /^\/storage\/v1\/object\/authenticated\/hb-photos\/(.+)$/.exec(p);
    if (m && req.method === 'GET') {
      const path = decodeURIComponent(m[1]);
      const f = own(path) && files.get(path);
      if (!f) return send(400, { statusCode: '404', error: 'not_found', message: 'Object not found' });
      return send(200, f.body, { 'content-type': f.type || 'application/octet-stream' });
    }
    return send(404, { message: 'not found' });
  });

  return {
    server, anonKey,
    link: (email) => links.get(email),
    expireNextLink: (email) => fail.add(email),
    listen: () => new Promise((r) => server.listen(0, () => r(`http://localhost:${server.address().port}`))),
    close: () => server.close(),
    dump: () => ({ users: [...users.values()], rows: [...rows.values()], files: [...files.keys()] }),
  };
}

module.exports = { createFakeSupabase };

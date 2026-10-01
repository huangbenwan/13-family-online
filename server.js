// 五人十三支 Online — 零依賴 Node 伺服器(靜態頁面 + 簡易即時資料庫,SSE 推送)
const http = require('http'), fs = require('fs'), path = require('path');
const PORT = process.env.PORT || 3000;
const store = new Map(), touched = new Map(), clients = new Map();
const par = p => p.split('/').slice(0, -1).join('/');
const clone = x => JSON.parse(JSON.stringify(x));
const merge = (a, b) => { for (const k in b) { const v = b[k];
  if (v && typeof v === 'object' && !Array.isArray(v) && a[k] && typeof a[k] === 'object' && !Array.isArray(a[k])) merge(a[k], v); else a[k] = clone(v); } return a; };
const colDocs = p => { const o = []; for (const [k, v] of store) if (par(k) === p) o.push({ id: k.split('/').pop(), data: v }); return o; };
const push = (c, ev, obj) => { try { c.res.write('event: ' + ev + '\ndata: ' + JSON.stringify(obj) + '\n\n'); } catch (e) {} };
const snapFor = s => s.kind === 'doc'
  ? { sub: s.id, kind: 'doc', exists: store.has(s.path), data: store.get(s.path) || null }
  : { sub: s.id, kind: 'col', docs: colDocs(s.path) };
function notify(p) { for (const c of clients.values()) for (const s of c.subs.values())
  if ((s.kind === 'doc' && s.path === p) || (s.kind === 'col' && par(p) === s.path)) push(c, 'snap', snapFor(s)); }
const okPath = p => typeof p === 'string' && /^rooms\/[A-Za-z0-9_\/-]+$/.test(p) && p.length < 120;
const bump = p => touched.set(p.split('/')[1], Date.now());
function readBody(req) { return new Promise((ok, no) => { let b = ''; req.on('data', d => { b += d; if (b.length > 400000) { no(new Error('too big')); req.destroy(); } });
  req.on('end', () => { try { ok(JSON.parse(b || '{}')); } catch (e) { no(e); } }); }); }
function doOp(m) {
  const { op, path: p, data } = m;
  if (!okPath(p)) return { ok: false, code: 'invalid_argument', error: 'bad path' };
  const segs = p.split('/').length;
  if (op === 'list') return { ok: true, docs: colDocs(p) };
  if (segs % 2 !== 0) return { ok: false, code: 'invalid_argument', error: 'not a doc path' };
  if (op === 'get') return { ok: true, exists: store.has(p), data: store.get(p) || null };
  if (op === 'delete') { store.delete(p); notify(p); return { ok: true }; }
  if (!data || typeof data !== 'object' || JSON.stringify(data).length > 250000) return { ok: false, code: 'invalid_argument', error: 'bad data' };
  if (op === 'set') { store.set(p, clone(data)); }
  else if (op === 'update') { if (!store.has(p)) return { ok: false, code: 'invalid_argument', error: 'doc missing' }; merge(store.get(p), data); }
  else return { ok: false, code: 'invalid_argument', error: 'bad op' };
  bump(p); notify(p); return { ok: true };
}
const send = (res, code, obj) => { res.writeHead(code, { 'Content-Type': 'application/json' }); res.end(JSON.stringify(obj)); };
http.createServer(async (req, res) => {
  const u = new URL(req.url, 'http://x');
  try {
    if (req.method === 'GET' && (u.pathname === '/' || u.pathname === '/index.html')) {
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
      return res.end(fs.readFileSync(path.join(__dirname, 'public', 'index.html')));
    }
    if (req.method === 'GET' && /^\/cards\/[A-Za-z0-9_-]+\.jpg$/.test(u.pathname)) {
      const f = path.join(__dirname, 'public', u.pathname);
      if (!fs.existsSync(f)) { res.writeHead(404); return res.end('nf'); }
      res.writeHead(200, { 'Content-Type': 'image/jpeg', 'Cache-Control': 'public, max-age=86400' });
      return res.end(fs.readFileSync(f));
    }
    if (req.method === 'GET' && /^\/sfx\/[A-Za-z0-9_-]+\.mp3$/.test(u.pathname)) {
      const f = path.join(__dirname, 'public', u.pathname);
      if (!fs.existsSync(f)) { res.writeHead(404); return res.end('nf'); }
      const buf = fs.readFileSync(f), total = buf.length, h = { 'Content-Type': 'audio/mpeg', 'Accept-Ranges': 'bytes', 'Cache-Control': 'public, max-age=86400' };
      const m = /^bytes=(\d*)-(\d*)$/.exec(req.headers.range || '');
      if (m) { let s = m[1] === '' ? total - Number(m[2]) : Number(m[1]), e = m[1] !== '' && m[2] !== '' ? Number(m[2]) : total - 1;
        s = Math.max(0, s); e = Math.min(e, total - 1);
        if (s > e) { res.writeHead(416, { 'Content-Range': 'bytes */' + total }); return res.end(); }
        res.writeHead(206, { ...h, 'Content-Range': `bytes ${s}-${e}/${total}`, 'Content-Length': e - s + 1 }); return res.end(buf.subarray(s, e + 1)); }
      res.writeHead(200, { ...h, 'Content-Length': total }); return res.end(buf);
    }
    if (u.pathname === '/healthz') return send(res, 200, { ok: true, rooms: touched.size });
    if (req.method === 'GET' && u.pathname === '/events') {
      const cid = u.searchParams.get('cid') || 'x';
      res.writeHead(200, { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache, no-transform', Connection: 'keep-alive', 'X-Accel-Buffering': 'no' });
      res.write('retry: 1500\n\n');
      const c = { res, subs: new Map() }; clients.set(cid, c);
      const ka = setInterval(() => { try { res.write(': ka\n\n'); } catch (e) {} }, 20000);
      req.on('close', () => { clearInterval(ka); if (clients.get(cid) === c) clients.delete(cid); });
      return push(c, 'hello', { ok: true });
    }
    if (req.method === 'POST') {
      const m = await readBody(req);
      if (u.pathname === '/op') return send(res, 200, doOp(m));
      const c = clients.get(m.cid);
      if (!c) return send(res, 200, { ok: false, code: 'unavailable', error: 'no stream' });
      if (u.pathname === '/sub') {
        if (!okPath(m.path)) return send(res, 200, { ok: false });
        const s = { id: m.id, kind: m.kind === 'col' ? 'col' : 'doc', path: m.path };
        c.subs.set(m.id, s); push(c, 'snap', snapFor(s)); return send(res, 200, { ok: true });
      }
      if (u.pathname === '/unsub') { c.subs.delete(m.id); return send(res, 200, { ok: true }); }
    }
    res.writeHead(404); res.end('not found');
  } catch (e) { try { send(res, 400, { ok: false, error: String(e.message || e) }); } catch (_) {} }
}).listen(PORT, () => console.log('listening on ' + PORT));
// 8 小時沒動靜的房間自動清除
setInterval(() => { const now = Date.now();
  for (const [code, t] of touched) if (now - t > 8 * 3600e3) { for (const k of [...store.keys()]) if (k.startsWith('rooms/' + code)) store.delete(k); touched.delete(code); }
}, 30 * 60e3);

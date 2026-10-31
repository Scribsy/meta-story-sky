// Story Sky's local server: serves the page and runs the API in api.mjs, so no key ever reaches the browser.
// Run it with the keys in the environment:  META_MODEL_API_KEY=... [ELEVENLABS_API_KEY=...] node server.mjs
// Without a Meta key it serves replay mode: the page plays back a recorded run and says so.
// The hosted version is worker.mjs (Cloudflare), which runs the same API behind an access code.
import { createServer } from 'node:http';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { extname, join, normalize } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createApi } from './api.mjs';

const ROOT = fileURLToPath(new URL('./public/', import.meta.url));
const RUNS = fileURLToPath(new URL('./runs/', import.meta.url));
const PORT = Number(process.env.PORT ?? 5177);
// The caps stop this server well inside the credits. They count from when it starts.
const SPEND_CAP_USD = Number(process.env.SPEND_CAP_USD ?? 15);
const XI_CHAR_CAP = Number(process.env.ELEVENLABS_CHAR_CAP ?? 6000);

const log = async (line) => {
  await mkdir(RUNS, { recursive: true });
  await writeFile(join(RUNS, 'spend.log'), `${new Date().toISOString()} ${line}\n`, { flag: 'a' });
};
let spent = 0;
let spokenChars = 0;
const meter = {
  allow: async () => (spent >= SPEND_CAP_USD ? `Spend cap of $${SPEND_CAP_USD} reached for this server run.` : null),
  charge: async (usd, what) => { spent += usd; await log(`${what} $${usd.toFixed(5)} total $${spent.toFixed(4)}`); },
  speak: async (chars) => (spokenChars + chars > XI_CHAR_CAP ? `Voice cap of ${XI_CHAR_CAP} characters reached for this server run.` : null),
  spoken: async (chars) => { spokenChars += chars; await log(`speak ${chars} chars total ${spokenChars}`); },
  claim: async () => null,
  totals: async () => ({ spent: Number(spent.toFixed(4)), cap: SPEND_CAP_USD, spokenChars }),
};
// Claimed story starts, in memory: they last until collected, their day is up, or this server stops.
const claims = new Map();
const store = {
  put: async (id, text, ttl) => { claims.set(id, { text, until: Date.now() + ttl * 1000 }); },
  take: async (id) => { const c = claims.get(id); claims.delete(id); return c && c.until > Date.now() ? c.text : null; },
};
const api = createApi(process.env, meter, store);

const TYPES = { '.html': 'text/html; charset=utf-8', '.mjs': 'text/javascript', '.js': 'text/javascript', '.css': 'text/css',
  '.json': 'application/json', '.svg': 'image/svg+xml', '.png': 'image/png', '.jpg': 'image/jpeg', '.wav': 'audio/wav', '.mp3': 'audio/mpeg' };

createServer(async (req, res) => {
  const url = new URL(req.url, 'http://localhost');
  try {
    if (url.pathname.startsWith('/api/')) {
      const chunks = [];
      for await (const c of req) chunks.push(c);
      const body = req.method === 'POST' ? Buffer.concat(chunks) : undefined;
      const out = await api(new Request(url, { method: req.method, headers: req.headers, body }), req.socket.remoteAddress);
      res.writeHead(out.status, Object.fromEntries(out.headers));
      return res.end(Buffer.from(await out.arrayBuffer()));
    }
    const path = normalize(join(ROOT, url.pathname === '/' ? 'index.html' : decodeURIComponent(url.pathname)));
    if (!path.startsWith(normalize(ROOT))) { res.writeHead(403); return res.end('Forbidden'); }
    const file = await readFile(path);
    res.writeHead(200, { 'Content-Type': TYPES[extname(path)] ?? 'application/octet-stream', 'Cache-Control': 'no-store' });
    return res.end(file);
  } catch (e) {
    res.writeHead(e.code === 'ENOENT' ? 404 : 500, { 'Content-Type': 'text/plain' });
    return res.end(e.code === 'ENOENT' ? 'Not found' : 'Server error');
  }
}).listen(PORT, () => {
  const live = Boolean(process.env.META_MODEL_API_KEY ?? process.env.MODEL_API_KEY);
  console.log(`Story Sky on http://localhost:${PORT}  (${live ? 'live: Meta Model API' : 'replay mode: no Meta key in the environment'}; `
    + `voice ${process.env.ELEVENLABS_API_KEY ? 'on' : 'off'}; spend cap $${SPEND_CAP_USD}${process.env.ACCESS_CODE ? '; access code on' : ''})`);
});

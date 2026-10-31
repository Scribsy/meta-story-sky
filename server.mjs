// Story Sky's local server: serves the page and talks to Meta's Model API, so the key never reaches the browser.
// Run it with the key in the environment (we use Doppler):  doppler run -- node server.mjs
// Without a key it serves replay mode: the page plays back a recorded run and says so.
import { createServer } from 'node:http';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { extname, join, normalize } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildQuestion, rulesQuestion, verifyCards } from './public/lib/verify.mjs';
import { missedNames, spot } from './public/lib/spot.mjs';
import { REVEAL_SCHEMA, REVEAL_SYSTEM, skyPrompt } from './prompts.mjs';

const ROOT = fileURLToPath(new URL('./public/', import.meta.url));
const RUNS = fileURLToPath(new URL('./runs/', import.meta.url));
const API = 'https://api.meta.ai/v1';
const KEY = process.env.META_MODEL_API_KEY ?? process.env.MODEL_API_KEY ?? '';
const PORT = Number(process.env.PORT ?? 5177);
const MODELS = { text: 'muse-spark-1.3', voice: 'muse-voice-transcribe-1.0', image: 'muse-image-1.0' };
// Prices from dev.meta.ai/docs/pricing-rate-limits (31 Oct 2026). The cap stops this server well inside the $150 credits.
const PRICE = { inTok: 1.25 / 1e6, outTok: 4.25 / 1e6, audioHour: 0.18, image: 0.01 };
const SPEND_CAP_USD = Number(process.env.SPEND_CAP_USD ?? 15);

let spent = 0;
const charge = async (usd, what) => {
  spent += usd;
  await mkdir(RUNS, { recursive: true });
  await writeFile(join(RUNS, 'spend.log'), `${new Date().toISOString()} ${what} $${usd.toFixed(5)} total $${spent.toFixed(4)}\n`, { flag: 'a' });
};
const guard = () => { if (spent >= SPEND_CAP_USD) throw httpError(429, `Spend cap of $${SPEND_CAP_USD} reached for this server run.`); };
const httpError = (status, message) => Object.assign(new Error(message), { status });

async function meta(path, init) {
  guard();
  const res = await fetch(`${API}${path}`, { ...init, headers: { Authorization: `Bearer ${KEY}`, ...init.headers } });
  const body = await res.text();
  if (!res.ok) throw httpError(502, `Meta API ${path} answered ${res.status}: ${body.slice(0, 300)}`);
  return JSON.parse(body);
}

/** Muse Voice Transcribe: a 16 kHz mono WAV in, the transcript out. */
async function transcribe(wav) {
  const form = new FormData();
  form.append('request', new Blob([JSON.stringify({ model: MODELS.voice, audioEncoding: 'WAV', mode: 'PUSH_TO_TALK', languageBias: ['English'] })], { type: 'application/json' }));
  form.append('audio', new Blob([wav], { type: 'audio/wav' }), 'idea.wav');
  const out = await meta('/asr/transcribe', { method: 'POST', body: form, headers: { Accept: 'application/json' } });
  await charge(((out.audioDurationMs ?? 0) / 3.6e6) * PRICE.audioHour, 'transcribe');
  return { transcript: String(out.transcript ?? '').trim(), audioDurationMs: out.audioDurationMs ?? null, model: MODELS.voice };
}

/** Muse Spark proposes cards and one question; verify.mjs decides what survives. */
async function reveal(transcript) {
  const started = Date.now();
  let proposal = null;
  let error = null;
  try {
    const out = await meta('/chat/completions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: MODELS.text,
        messages: [{ role: 'system', content: REVEAL_SYSTEM }, { role: 'user', content: `TRANSCRIPT:\n${transcript}` }],
        response_format: { type: 'json_schema', json_schema: { name: 'reveal', schema: REVEAL_SCHEMA, strict: true } },
      }),
    });
    const u = out.usage ?? {};
    await charge((u.prompt_tokens ?? 0) * PRICE.inTok + (u.completion_tokens ?? 0) * PRICE.outTok, 'reveal');
    proposal = JSON.parse(out.choices?.[0]?.message?.content ?? '{}');
  } catch (e) {
    error = e.message;
  }
  if (!proposal) {
    // The model is unavailable: the rules alone still give a reveal, and the page says so.
    const cards = spot(transcript);
    return { source: 'rules', error, cards, dropped: [], proposed: 0, question: rulesQuestion(transcript, cards), ms: Date.now() - started };
  }
  const { cards, dropped } = verifyCards(transcript, proposal.cards);
  const extra = missedNames(transcript, cards);
  const question = buildQuestion(transcript, proposal.question) ?? rulesQuestion(transcript, cards);
  return { source: 'model', model: MODELS.text, cards: [...cards, ...extra], added: extra.length, dropped, proposed: proposal.cards?.length ?? 0, question, ms: Date.now() - started };
}

/** Muse Image paints the night sky behind the kept cards; the page draws the stars and their names on top. */
async function sky(cards) {
  const out = await meta('/images/generations', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ model: MODELS.image, prompt: skyPrompt(cards), n: 1, size: '1792x1024', response_format: 'b64_json' }),
  });
  await charge(PRICE.image, 'sky');
  const img = out.data?.[0];
  return { image: img?.b64_json ? `data:image/png;base64,${img.b64_json}` : img?.url ?? null, model: MODELS.image };
}

const TYPES = { '.html': 'text/html; charset=utf-8', '.mjs': 'text/javascript', '.js': 'text/javascript', '.css': 'text/css',
  '.json': 'application/json', '.svg': 'image/svg+xml', '.png': 'image/png', '.jpg': 'image/jpeg', '.wav': 'audio/wav' };

async function readBody(req, limit = 32 * 1024 * 1024) {
  const chunks = [];
  let size = 0;
  for await (const c of req) {
    size += c.length;
    if (size > limit) throw httpError(413, 'Too large');
    chunks.push(c);
  }
  return Buffer.concat(chunks);
}

const send = (res, status, body, type = 'application/json') => {
  res.writeHead(status, { 'Content-Type': type, 'Cache-Control': 'no-store' });
  res.end(type === 'application/json' ? JSON.stringify(body) : body);
};

createServer(async (req, res) => {
  const url = new URL(req.url, 'http://localhost');
  try {
    if (url.pathname === '/api/status') return send(res, 200, { live: Boolean(KEY), models: MODELS, spent: Number(spent.toFixed(4)), cap: SPEND_CAP_USD });
    if (url.pathname.startsWith('/api/') && !KEY) return send(res, 503, { error: 'No META_MODEL_API_KEY: replay mode only.' });
    if (req.method === 'POST' && url.pathname === '/api/transcribe') return send(res, 200, await transcribe(await readBody(req)));
    if (req.method === 'POST' && url.pathname === '/api/reveal') {
      const { transcript } = JSON.parse(await readBody(req, 200_000));
      return send(res, 200, await reveal(String(transcript ?? '')));
    }
    if (req.method === 'POST' && url.pathname === '/api/sky') {
      const { cards } = JSON.parse(await readBody(req, 200_000));
      return send(res, 200, await sky(Array.isArray(cards) ? cards.slice(0, 12) : []));
    }
    const path = normalize(join(ROOT, url.pathname === '/' ? 'index.html' : decodeURIComponent(url.pathname)));
    if (!path.startsWith(normalize(ROOT))) return send(res, 403, 'Forbidden', 'text/plain');
    return send(res, 200, await readFile(path), TYPES[extname(path)] ?? 'application/octet-stream');
  } catch (e) {
    if (e.code === 'ENOENT') return send(res, 404, 'Not found', 'text/plain');
    console.error(`[story-sky] ${url.pathname}: ${e.message}`);
    return send(res, e.status ?? 500, { error: e.message });
  }
}).listen(PORT, () => {
  console.log(`Story Sky on http://localhost:${PORT}  (${KEY ? 'live: Meta Model API' : 'replay mode: no key in the environment'}; spend cap $${SPEND_CAP_USD})`);
});

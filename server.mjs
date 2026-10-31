// Story Sky's local server: serves the page and talks to Meta's Model API (and, for the spoken question only,
// ElevenLabs), so no key ever reaches the browser.
// Run it with the keys in the environment:  META_MODEL_API_KEY=... [ELEVENLABS_API_KEY=...] node server.mjs
// Without a Meta key it serves replay mode: the page plays back a recorded run and says so.
import { createServer } from 'node:http';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { extname, join, normalize } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildQuestion, questionText, rulesQuestion, verifyCards } from './public/lib/verify.mjs';
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
// The voice: ElevenLabs reads the question aloud, nothing else. "Story Sky Muse" is a voice designed for this demo
// with ElevenLabs Voice Design: airy, ageless, unhurried. Set ELEVENLABS_VOICE_ID to use any other voice.
const XI_KEY = process.env.ELEVENLABS_API_KEY ?? '';
const XI_VOICE = process.env.ELEVENLABS_VOICE_ID ?? 'cTLtc9FcFdsMXKOrrC79';
// Eleven v4 Turbo: the expressive real-time model. The style is an audio tag (not spoken) that sets a muse's delivery.
const XI_MODEL = process.env.ELEVENLABS_MODEL ?? 'eleven_v4_turbo';
const XI_STYLE = process.env.ELEVENLABS_STYLE ?? '[softly, curious]';
const XI_CHAR_CAP = Number(process.env.ELEVENLABS_CHAR_CAP ?? 6000);
let spokenChars = 0;
const spoken = new Map();

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

/**
 * Muse Spark proposes cards and the next question; verify.mjs decides what survives. `from` is where the writer's latest
 * answer starts in the transcript, and `asked` lists the questions already asked, so none is repeated.
 */
async function reveal(transcript, { from = 0, asked = [] } = {}) {
  const started = Date.now();
  let proposal = null;
  let error = null;
  try {
    const out = await meta('/chat/completions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: MODELS.text,
        messages: [{ role: 'system', content: REVEAL_SYSTEM }, { role: 'user', content: revealInput(transcript, from, asked) }],
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
    return { source: 'rules', error, cards, dropped: [], proposed: 0, question: rulesQuestion(transcript, cards, asked, from), ms: Date.now() - started };
  }
  const { cards, dropped } = verifyCards(transcript, proposal.cards);
  const extra = missedNames(transcript, cards);
  const all = [...cards, ...extra];
  const question = buildQuestion(transcript, proposal.question, asked) ?? rulesQuestion(transcript, all, asked, from);
  return { source: 'model', model: MODELS.text, cards: all, added: extra.length, dropped, proposed: proposal.cards?.length ?? 0, question, ms: Date.now() - started };
}

function revealInput(transcript, from, asked) {
  const parts = [`TRANSCRIPT:\n${transcript}`];
  if (from > 0) parts.push(`LATEST ANSWER (ask about this if you can):\n${transcript.slice(from)}`);
  if (asked.length) parts.push(`ALREADY ASKED (never ask about these spans again):\n${asked.map((a) => `- ${a.span}`).join('\n')}`);
  return parts.join('\n\n');
}

/** ElevenLabs speaks a question built from a known template, so the voice can only ever ask, never answer. */
async function speak(template, span) {
  const text = questionText(template, String(span ?? '').slice(0, 120));
  if (!text) throw httpError(400, 'Only a template question can be spoken.');
  if (spoken.has(text)) return spoken.get(text);
  if (spokenChars + text.length > XI_CHAR_CAP) throw httpError(429, `Voice cap of ${XI_CHAR_CAP} characters reached for this server run.`);
  const res = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${XI_VOICE}?output_format=mp3_44100_128`, {
    method: 'POST',
    headers: { 'xi-api-key': XI_KEY, 'Content-Type': 'application/json', Accept: 'audio/mpeg' },
    body: JSON.stringify({ text: `${XI_STYLE} ${text}`, model_id: XI_MODEL, voice_settings: { stability: 0.5, similarity_boost: 0.75 } }),
  });
  if (!res.ok) throw httpError(502, `ElevenLabs answered ${res.status}: ${(await res.text()).slice(0, 200)}`);
  spokenChars += text.length;
  await mkdir(RUNS, { recursive: true });
  await writeFile(join(RUNS, 'spend.log'), `${new Date().toISOString()} speak ${text.length} chars total ${spokenChars}\n`, { flag: 'a' });
  const audio = Buffer.from(await res.arrayBuffer());
  spoken.set(text, audio);
  return audio;
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
  '.json': 'application/json', '.svg': 'image/svg+xml', '.png': 'image/png', '.jpg': 'image/jpeg', '.wav': 'audio/wav', '.mp3': 'audio/mpeg' };

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
    if (url.pathname === '/api/status') {
      return send(res, 200, { live: Boolean(KEY), voice: Boolean(XI_KEY), models: MODELS, spent: Number(spent.toFixed(4)), cap: SPEND_CAP_USD, spokenChars });
    }
    if (req.method === 'POST' && url.pathname === '/api/speak') {
      if (!XI_KEY) return send(res, 503, { error: 'No ELEVENLABS_API_KEY: questions are shown, not spoken.' });
      const { template, span } = JSON.parse(await readBody(req, 10_000));
      return send(res, 200, await speak(template, span), 'audio/mpeg');
    }
    if (url.pathname.startsWith('/api/') && !KEY) return send(res, 503, { error: 'No META_MODEL_API_KEY: replay mode only.' });
    if (req.method === 'POST' && url.pathname === '/api/transcribe') return send(res, 200, await transcribe(await readBody(req)));
    if (req.method === 'POST' && url.pathname === '/api/reveal') {
      const { transcript, from, asked } = JSON.parse(await readBody(req, 200_000));
      return send(res, 200, await reveal(String(transcript ?? ''), { from: Number(from) || 0, asked: Array.isArray(asked) ? asked.slice(0, 10) : [] }));
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
  console.log(`Story Sky on http://localhost:${PORT}  (${KEY ? 'live: Meta Model API' : 'replay mode: no Meta key in the environment'}; `
    + `voice ${XI_KEY ? 'on' : 'off'}; spend cap $${SPEND_CAP_USD})`);
});

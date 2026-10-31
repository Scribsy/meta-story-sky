// Story Sky's API, shared by the local Node server (server.mjs) and the hosted Worker (worker.mjs). It talks to Meta's
// Model API and, for the spoken question only, ElevenLabs, so no key ever reaches the browser. Web-standard Request and
// Response only. Where the money is counted is the caller's choice: a `meter` (see server.mjs and worker.mjs).
import { buildQuestion, questionText, rulesQuestion, verifyCards } from './public/lib/verify.mjs';
import { missedNames, spot } from './public/lib/spot.mjs';
import { REVEAL_SCHEMA, REVEAL_SYSTEM, skyPrompt } from './prompts.mjs';

const API = 'https://api.meta.ai/v1';
export const MODELS = { text: 'muse-spark-1.3', voice: 'muse-voice-transcribe-1.0', image: 'muse-image-1.0' };
// Prices from dev.meta.ai/docs/pricing-rate-limits (31 Oct 2026).
const PRICE = { inTok: 1.25 / 1e6, outTok: 4.25 / 1e6, audioHour: 0.18, image: 0.01 };
// The voice: "Story Sky Muse" is a voice designed for this demo with ElevenLabs Voice Design: airy, ageless, unhurried.
// Eleven v4 Turbo is the expressive real-time model; the style is an audio tag (not spoken) that sets a muse's delivery.
const XI = { voice: 'cTLtc9FcFdsMXKOrrC79', model: 'eleven_v4_turbo', style: '[softly, curious]' };
const BILLED = new Set(['/api/transcribe', '/api/reveal', '/api/sky', '/api/speak']);

export const httpError = (status, message) => Object.assign(new Error(message), { status });
const json = (body, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' } });

/** Compares the access code in constant time, so its length is the only thing a timing attack could learn. */
function codeMatches(given, code) {
  const a = new TextEncoder().encode(given ?? '');
  const b = new TextEncoder().encode(code);
  let diff = a.length ^ b.length;
  for (let i = 0; i < b.length; i++) diff |= (a[i] ?? 0) ^ b[i];
  return diff === 0;
}

/**
 * env: META_MODEL_API_KEY, ELEVENLABS_API_KEY, ELEVENLABS_VOICE_ID, ELEVENLABS_MODEL, ELEVENLABS_STYLE,
 *      REASONING_EFFORT, ACCESS_CODE (when set, every billed call must carry it in the x-access-code header).
 * meter: { allow(ip) → reason it is refused, or null; charge(usd, what); speak(chars) → reason, or null; spoken(chars);
 *          totals() → { spent, cap, spokenChars } }.
 * Returns handle(request, ip) → Response, or null when the path is not an API path.
 */
export function createApi(env, meter) {
  const KEY = env.META_MODEL_API_KEY ?? env.MODEL_API_KEY ?? '';
  const XI_KEY = env.ELEVENLABS_API_KEY ?? '';
  const voice = { id: env.ELEVENLABS_VOICE_ID ?? XI.voice, model: env.ELEVENLABS_MODEL ?? XI.model, style: env.ELEVENLABS_STYLE ?? XI.style };
  // Muse Spark reasons before it answers. Finding quotes in a short transcript needs little of it: at "minimal" a reveal
  // took about 5 s and under a cent in testing, against about 24 s and 3 cents at the model's own default.
  const REASONING = env.REASONING_EFFORT ?? 'minimal';
  const CODE = env.ACCESS_CODE ?? '';
  const spokenCache = new Map();

  async function meta(path, init) {
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
    await meter.charge(((out.audioDurationMs ?? 0) / 3.6e6) * PRICE.audioHour, 'transcribe');
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
          reasoning_effort: REASONING,
          messages: [{ role: 'system', content: REVEAL_SYSTEM }, { role: 'user', content: revealInput(transcript, from, asked) }],
          response_format: { type: 'json_schema', json_schema: { name: 'reveal', schema: REVEAL_SCHEMA, strict: true } },
        }),
      });
      const u = out.usage ?? {};
      await meter.charge((u.prompt_tokens ?? 0) * PRICE.inTok + (u.completion_tokens ?? 0) * PRICE.outTok, 'reveal');
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

  /** ElevenLabs speaks a question built from a known template, so the voice can only ever ask, never answer. */
  async function speak(template, span) {
    const text = questionText(template, String(span ?? '').slice(0, 120));
    if (!text) throw httpError(400, 'Only a template question can be spoken.');
    if (spokenCache.has(text)) return spokenCache.get(text);
    const refused = await meter.speak(text.length);
    if (refused) throw httpError(429, refused);
    const res = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${voice.id}?output_format=mp3_44100_128`, {
      method: 'POST',
      headers: { 'xi-api-key': XI_KEY, 'Content-Type': 'application/json', Accept: 'audio/mpeg' },
      body: JSON.stringify({ text: `${voice.style} ${text}`, model_id: voice.model, voice_settings: { stability: 0.5, similarity_boost: 0.75 } }),
    });
    if (!res.ok) throw httpError(502, `ElevenLabs answered ${res.status}: ${(await res.text()).slice(0, 200)}`);
    await meter.spoken(text.length);
    const audio = await res.arrayBuffer();
    spokenCache.set(text, audio);
    return audio;
  }

  /** Muse Image paints the night sky behind the kept cards; the page draws the stars and their names on top. */
  async function sky(cards) {
    const out = await meta('/images/generations', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ model: MODELS.image, prompt: skyPrompt(cards), n: 1, size: '1792x1024', response_format: 'b64_json' }),
    });
    await meter.charge(PRICE.image, 'sky');
    const img = out.data?.[0];
    // Muse Image may send WebP ("UklGR" is RIFF in base64) or PNG; label the data URL with what it really is.
    const type = img?.b64_json?.startsWith('UklGR') ? 'webp' : 'png';
    return { image: img?.b64_json ? `data:image/${type};base64,${img.b64_json}` : img?.url ?? null, model: MODELS.image };
  }

  async function body(request, limit) {
    if (Number(request.headers.get('content-length') ?? 0) > limit) throw httpError(413, 'Too large');
    const buf = await request.arrayBuffer();
    if (buf.byteLength > limit) throw httpError(413, 'Too large');
    return buf;
  }
  const bodyJson = async (request, limit) => JSON.parse(new TextDecoder().decode(await body(request, limit)));

  return async function handle(request, ip = '') {
    const { pathname } = new URL(request.url);
    if (!pathname.startsWith('/api/')) return null;
    try {
      const unlocked = !CODE || codeMatches(request.headers.get('x-access-code'), CODE);
      if (pathname === '/api/status') {
        // Without the code the page still works: replay, or the rules alone in the browser.
        return json({ live: Boolean(KEY) && unlocked, voice: Boolean(XI_KEY) && unlocked, gated: Boolean(CODE), unlocked, models: MODELS, ...(unlocked ? await meter.totals() : {}) });
      }
      if (request.method !== 'POST' || !BILLED.has(pathname)) return json({ error: 'Not found' }, 404);
      if (!unlocked) return json({ error: 'This needs the access code.' }, 401);
      if (pathname === '/api/speak' && !XI_KEY) return json({ error: 'No ELEVENLABS_API_KEY: questions are shown, not spoken.' }, 503);
      if (pathname !== '/api/speak' && !KEY) return json({ error: 'No META_MODEL_API_KEY: replay mode only.' }, 503);
      const refused = await meter.allow(ip);
      if (refused) return json({ error: refused }, 429);
      if (pathname === '/api/speak') {
        const { template, span } = await bodyJson(request, 10_000);
        return new Response(await speak(template, span), { headers: { 'Content-Type': 'audio/mpeg', 'Cache-Control': 'no-store' } });
      }
      if (pathname === '/api/transcribe') return json(await transcribe(await body(request, 32 * 1024 * 1024)));
      if (pathname === '/api/reveal') {
        const { transcript, from, asked } = await bodyJson(request, 200_000);
        return json(await reveal(String(transcript ?? ''), { from: Number(from) || 0, asked: Array.isArray(asked) ? asked.slice(0, 10) : [] }));
      }
      const { cards } = await bodyJson(request, 200_000);
      return json(await sky(Array.isArray(cards) ? cards.slice(0, 12) : []));
    } catch (e) {
      console.error(`[story-sky] ${pathname}: ${e.message}`);
      return json({ error: e.message }, e.status ?? 500);
    }
  };
}

function revealInput(transcript, from, asked) {
  const parts = [`TRANSCRIPT:\n${transcript}`];
  if (from > 0) parts.push(`LATEST ANSWER (ask about this if you can):\n${transcript.slice(from)}`);
  if (asked.length) parts.push(`ALREADY ASKED (never ask about these spans again):\n${asked.map((a) => `- ${a.span}`).join('\n')}`);
  return parts.join('\n\n');
}

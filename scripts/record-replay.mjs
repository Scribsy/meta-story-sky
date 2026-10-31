// Records one real live run through a running server and saves it as the replay the page plays when no key is
// available: public/replay/run.json (+ sky.png). Each WAV is one answer: the first answers the opening question, each
// later one answers the question the run asked before it.
//   node scripts/record-replay.mjs first.wav [second.wav third.wav …]
// The easiest source is the page itself: open http://localhost:5177/?record, do a run, and download run.json at the end.
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { encodeWav } from '../public/lib/wav.mjs';

const BASE = process.env.STORY_SKY_URL ?? 'http://localhost:5177';
const wavs = process.argv.slice(2).filter((a) => a.endsWith('.wav'));
if (!wavs.length) wavs.push(new URL('../runs/sample.wav', import.meta.url));

/** Re-write any PCM16 mono WAV with a plain 16-byte fmt chunk (Windows' voice writes an 18-byte one). */
function normaliseWav(buf) {
  const rate = buf.readUInt32LE(24);
  let at = 12;
  while (at < buf.length && buf.toString('ascii', at, at + 4) !== 'data') at += 8 + buf.readUInt32LE(at + 4);
  const len = buf.readUInt32LE(at + 4);
  const pcm = new Int16Array(buf.buffer.slice(buf.byteOffset + at + 8, buf.byteOffset + at + 8 + len));
  return { rate, samples: Float32Array.from(pcm, (s) => s / 0x8000) };
}

async function post(path, body, type = 'application/json') {
  const res = await fetch(`${BASE}${path}`, { method: 'POST', headers: { 'Content-Type': type }, body });
  if (res.headers.get('content-type')?.startsWith('audio/')) return Buffer.from(await res.arrayBuffer());
  const out = await res.json();
  if (!res.ok) throw new Error(`${path}: ${out.error}`);
  return out;
}

const status = await (await fetch(`${BASE}/api/status`)).json();
if (!status.live) throw new Error('The server has no META_MODEL_API_KEY.');

let transcript = '';
let question = null;
const asked = [];
const rounds = [];
let reveal = null;
for (const path of wavs) {
  const { rate, samples } = normaliseWav(await readFile(path));
  const t = await post('/api/transcribe', Buffer.from(await encodeWav(samples, rate).arrayBuffer()), 'audio/wav');
  const from = transcript ? transcript.length + 2 : 0;
  transcript = transcript ? `${transcript}\n\n${t.transcript}` : t.transcript;
  if (question) asked.push({ template: question.template, span: question.span });
  reveal = await post('/api/reveal', JSON.stringify({ transcript, from, asked }));
  console.log(`\n[${rounds.length + 1}] ${t.transcript}`);
  console.log(`    ${reveal.source}: proposed ${reveal.proposed}, dropped ${reveal.dropped.length}, rules added ${reveal.added ?? 0}, ${reveal.ms} ms`);
  for (const c of reveal.cards) console.log(`    ${c.kind.padEnd(8)} ${c.label} [${c.start}-${c.end}] ${c.kindSource}${c.clue ? ` clue="${c.clue}"` : ''}`);
  for (const d of reveal.dropped) console.log(`    DROPPED ${d.kind} ${d.label}: ${d.reason}`);
  console.log(`    next question: ${reveal.question?.text ?? '(none)'}`);
  let questionAudio;
  if (question && status.voice) {
    const mp3 = await post('/api/speak', JSON.stringify({ template: question.template, span: question.span }));
    questionAudio = `data:audio/mpeg;base64,${mp3.toString('base64')}`;
  }
  rounds.push({ answer: t.transcript, transcribedBy: `transcribed by ${t.model}`, question, questionAudio, reveal });
  question = reveal.question;
}

const kept = reveal.cards.filter((c) => c.kind !== 'question').slice(0, 8);
const s = await post('/api/sky', JSON.stringify({ cards: kept.map(({ kind, label }) => ({ kind, label })) }));
await mkdir(new URL('../public/replay/', import.meta.url), { recursive: true });
let image = s.image;
if (image?.startsWith('data:')) {
  await writeFile(new URL('../public/replay/sky.png', import.meta.url), Buffer.from(image.split(',')[1], 'base64'));
  image = 'replay/sky.png';
}
const run = { version: 2, recordedAt: new Date().toISOString(), note: 'A real live run, recorded by scripts/record-replay.mjs.',
  rounds, kept: kept.map((c) => c.label), sky: { image, model: s.model } };
await writeFile(new URL('../public/replay/run.json', import.meta.url), `${JSON.stringify(run, null, 2)}\n`);
const st = await (await fetch(`${BASE}/api/status`)).json();
console.log(`\nsaved public/replay/run.json; this server run spent about $${st.spent} at Meta and ${st.spokenChars} voice characters`);

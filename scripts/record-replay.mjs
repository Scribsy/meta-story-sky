// Records one real live run through a running server (doppler run -- node server.mjs) and saves it as the replay that
// the page plays when no key is available: public/replay/run.json and public/replay/sky.png.
//   node scripts/record-replay.mjs [audio.wav] [--keep "Label A,Label B"]
// The default audio is runs/sample.wav, made by scripts/sample-wav.ps1 from a public-domain passage.
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { encodeWav } from '../public/lib/wav.mjs';

const BASE = process.env.STORY_SKY_URL ?? 'http://localhost:5177';
const args = process.argv.slice(2);
const wavPath = args.find((a) => !a.startsWith('--') && a.endsWith('.wav')) ?? new URL('../runs/sample.wav', import.meta.url);
const keepArg = args[args.indexOf('--keep') + 1];

/** Re-write any PCM16 mono WAV with a plain 16-byte fmt chunk (Windows' voice writes an 18-byte one). */
function normaliseWav(buf) {
  const rate = buf.readUInt32LE(24);
  let at = 12;
  while (at < buf.length && buf.toString('ascii', at, at + 4) !== 'data') at += 8 + buf.readUInt32LE(at + 4);
  const len = buf.readUInt32LE(at + 4);
  const pcm = new Int16Array(buf.buffer.slice(buf.byteOffset + at + 8, buf.byteOffset + at + 8 + len));
  return { rate, samples: Float32Array.from(pcm, (s) => s / 0x8000) };
}

const post = async (path, body, type = 'application/json') => {
  const res = await fetch(`${BASE}${path}`, { method: 'POST', headers: { 'Content-Type': type }, body });
  const out = await res.json();
  if (!res.ok) throw new Error(`${path}: ${out.error}`);
  return out;
};

const status = await (await fetch(`${BASE}/api/status`)).json();
if (!status.live) throw new Error('The server has no META_MODEL_API_KEY. Start it with: doppler run -- node server.mjs');

const { rate, samples } = normaliseWav(await readFile(wavPath));
const wav = Buffer.from(await encodeWav(samples, rate).arrayBuffer());
const t = await post('/api/transcribe', wav, 'audio/wav');
console.log(`transcript (${t.audioDurationMs} ms): ${t.transcript}`);

const r = await post('/api/reveal', JSON.stringify({ transcript: t.transcript }));
console.log(`reveal: ${r.source}, proposed ${r.proposed}, kept ${r.cards.length - (r.added ?? 0)}, dropped ${r.dropped.length}, rules added ${r.added ?? 0}, ${r.ms} ms`);
for (const c of r.cards) console.log(`  ${c.kind.padEnd(8)} ${c.label}  [${c.start}-${c.end}] ${c.kindSource}${c.clue ? ` clue="${c.clue}"` : ''}`);
for (const d of r.dropped) console.log(`  DROPPED ${d.kind} ${d.label}: ${d.reason}`);
console.log(`question: ${r.question?.text ?? '(none)'}`);

const wanted = keepArg ? keepArg.split(',').map((s) => s.trim()) : null;
const kept = r.cards.filter((c) => (wanted ? wanted.includes(c.label) : c.kind !== 'question')).slice(0, 8);
const s = await post('/api/sky', JSON.stringify({ cards: kept.map(({ kind, label }) => ({ kind, label })) }));

await mkdir(new URL('../public/replay/', import.meta.url), { recursive: true });
let image = s.image;
if (image?.startsWith('data:')) {
  await writeFile(new URL('../public/replay/sky.png', import.meta.url), Buffer.from(image.split(',')[1], 'base64'));
  image = 'replay/sky.png';
}
const run = {
  recordedAt: new Date().toISOString(),
  note: 'A real live run, recorded by scripts/record-replay.mjs. Audio: Windows text-to-speech reading the opening of Treasure Island (R. L. Stevenson, public domain).',
  transcript: t.transcript,
  transcribedBy: `transcribed by ${t.model}`,
  reveal: r,
  kept: kept.map((c) => c.label),
  sky: { image, model: s.model },
};
await writeFile(new URL('../public/replay/run.json', import.meta.url), `${JSON.stringify(run, null, 2)}\n`);
const st = await (await fetch(`${BASE}/api/status`)).json();
console.log(`saved public/replay/run.json; this server run has spent about $${st.spent}`);

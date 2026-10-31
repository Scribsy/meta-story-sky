// Renders the one fixed line the page speaks before the writer has said anything, once, into public/audio/opening.mp3.
//   ELEVENLABS_API_KEY=... node scripts/render-opening.mjs
import { mkdir, writeFile } from 'node:fs/promises';

const TEXT = 'What’s the first thing you see?';
const VOICE = process.env.ELEVENLABS_VOICE_ID ?? 'SAz9YHcvj6GT2YYXdXww';
const MODEL = process.env.ELEVENLABS_MODEL ?? 'eleven_flash_v2_5';
const key = process.env.ELEVENLABS_API_KEY;
if (!key) throw new Error('Set ELEVENLABS_API_KEY.');

const res = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${VOICE}?output_format=mp3_44100_128`, {
  method: 'POST',
  headers: { 'xi-api-key': key, 'Content-Type': 'application/json', Accept: 'audio/mpeg' },
  body: JSON.stringify({ text: TEXT, model_id: MODEL, voice_settings: { stability: 0.6, similarity_boost: 0.75 } }),
});
if (!res.ok) throw new Error(`ElevenLabs answered ${res.status}: ${(await res.text()).slice(0, 200)}`);
await mkdir(new URL('../public/audio/', import.meta.url), { recursive: true });
const audio = Buffer.from(await res.arrayBuffer());
await writeFile(new URL('../public/audio/opening.mp3', import.meta.url), audio);
console.log(`wrote public/audio/opening.mp3 (${audio.length} bytes, ${TEXT.length} characters)`);

// Story Sky: Talk → Your words → Reveal (+ one question, Keep) → Sky.
import { toWav16k } from './lib/wav.mjs';
import { spot } from './lib/spot.mjs';
import { rulesQuestion } from './lib/verify.mjs';

const $ = (s) => document.querySelector(s);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
const KIND = {
  person: { icon: '●', word: 'Person' },
  place: { icon: '◆', word: 'Place' },
  thing: { icon: '▲', word: 'Thing' },
  name: { icon: '◎', word: 'Name' },
  question: { icon: '?', word: 'Open question' },
};

const state = { live: false, replay: null, transcript: '', transcribedBy: '', reveal: null, cards: [], kept: new Set(), run: {} };

// ---------- frames ----------
function show(id) {
  document.querySelectorAll('.frame').forEach((f) => f.classList.toggle('active', f.id === id));
  window.scrollTo({ top: 0, behavior: reduced ? 'auto' : 'smooth' });
}
function setMode(text, cls) { const m = $('#mode'); m.textContent = text; m.className = `mode ${cls}`; }

// ---------- status ----------
async function init() {
  try {
    const s = await (await fetch('/api/status')).json();
    state.live = s.live;
  } catch { state.live = false; }
  if (state.live) setMode('Live · Meta Model API', 'live');
  else setMode('Replay · no API key here', 'replay');
  if (new URLSearchParams(location.search).has('replay')) startReplay();
}

// ---------- 1 Talk ----------
let recorder = null;
let chunks = [];
let tick = null;
$('#mic').addEventListener('click', async () => {
  if (recorder?.state === 'recording') return recorder.stop();
  if (!state.live) return note('Talking needs the live server with a Meta key. Type it instead, or play the recorded run.');
  try {
    const stream = await navigator.mediaDevices.getUserMedia({ audio: { channelCount: 1, echoCancellation: true, noiseSuppression: true } });
    chunks = [];
    recorder = new MediaRecorder(stream);
    recorder.ondataavailable = (e) => e.data.size && chunks.push(e.data);
    recorder.onstop = async () => {
      stream.getTracks().forEach((t) => t.stop());
      clearInterval(tick);
      $('#mic').setAttribute('aria-pressed', 'false');
      $('#mic').classList.remove('on');
      $('#mic-label').textContent = 'Listening back…';
      note('Muse Voice Transcribe is writing down what you said…');
      try {
        const wav = await toWav16k(new Blob(chunks, { type: recorder.mimeType }));
        const res = await fetch('/api/transcribe', { method: 'POST', headers: { 'Content-Type': 'audio/wav' }, body: wav });
        const out = await res.json();
        if (!res.ok) throw new Error(out.error);
        if (!out.transcript) throw new Error('No words came back. Try again a little closer to the mic.');
        state.run.transcribe = out;
        useWords(out.transcript, `transcribed by ${out.model}`);
      } catch (e) {
        note(e.message);
      } finally {
        $('#mic-label').textContent = 'Tap to talk';
      }
    };
    recorder.start(1000);
    const t0 = Date.now();
    $('#mic').setAttribute('aria-pressed', 'true');
    $('#mic').classList.add('on');
    $('#mic-label').textContent = 'Tap when you’re done';
    tick = setInterval(() => {
      const s = Math.round((Date.now() - t0) / 1000);
      note(`${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}${s >= 60 ? ' · that’s plenty, finish your thought' : ''}`);
      if (s >= 180) recorder.stop();
    }, 500);
  } catch (e) {
    note(`The microphone isn’t available (${e.message}). Type it instead.`);
  }
});
function note(t) { $('#mic-time').textContent = t; }

$('#type-open').addEventListener('click', () => { $('#type-form').hidden = false; $('#type-text').focus(); });
$('#type-form').addEventListener('submit', (e) => {
  e.preventDefault();
  const t = $('#type-text').value.trim();
  if (t) useWords(t, 'typed');
});
$('#replay').addEventListener('click', () => startReplay());

function useWords(text, by) {
  state.transcript = text;
  state.transcribedBy = by;
  $('#words-by').textContent = `· ${by}`;
  state.cards = [];
  $('#words').insertBefore($('#transcript'), $('#reveal'));
  renderTranscript();
  show('words');
}

// ---------- 2 → 3 Reveal ----------
$('#reveal').addEventListener('click', async () => {
  const btn = $('#reveal');
  btn.disabled = true;
  btn.textContent = state.live && !state.replay ? 'Muse Spark is reading…' : 'Reading…';
  try {
    let r;
    if (state.replay) { await sleep(900); r = state.replay.reveal; }
    else if (state.live) {
      const res = await fetch('/api/reveal', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ transcript: state.transcript }) });
      r = await res.json();
      if (!res.ok) throw new Error(r.error);
    } else {
      const cards = spot(state.transcript);
      r = { source: 'rules', cards, dropped: [], proposed: 0, question: rulesQuestion(state.transcript, cards) };
    }
    state.run.reveal = r;
    await playReveal(r);
  } catch (e) {
    alert(e.message);
  } finally {
    btn.disabled = false;
    btn.textContent = "Show me what's there →";
  }
});

async function playReveal(r) {
  state.reveal = r;
  state.cards = r.cards.map((c, i) => ({ ...c, id: i }));
  state.kept.clear();
  show('board');
  $('#board-by').textContent = r.source === 'model' ? `· proposed by ${r.model}, checked in your browser` : '· found by rules on this device (no model)';
  const extra = r.added ?? 0;
  $('#check').innerHTML = r.source === 'model'
    ? `Muse Spark proposed <b>${r.proposed}</b> cards. <b>${r.proposed - r.dropped.length}</b> quote you exactly, checked character by character${r.dropped.length ? `; <b>${r.dropped.length}</b> didn’t, so ${r.dropped.length === 1 ? 'it’s' : 'they’re'} gone` : ''}.${extra > 0 ? ` The rules added <b>${extra}</b> name${extra > 1 ? 's' : ''} it missed.` : ''}`
    : `<b>${r.cards.length}</b> found by rules alone, each quoting your words.`;
  renderDropped(r.dropped);
  $('#board').insertBefore($('#transcript'), $('#cards'));
  renderTranscript();
  const box = $('#cards');
  box.innerHTML = '';
  $('#ask').hidden = true;
  $('#keep').hidden = true;
  for (const c of state.cards) {
    box.append(cardEl(c));
    flash(c.id);
    await sleep(reduced ? 0 : 380);
  }
  await sleep(reduced ? 0 : 600);
  if (r.question) showQuestion(r.question);
  else showKeep();
}

function cardEl(c) {
  const k = KIND[c.kind] ?? KIND.thing;
  const li = document.createElement('div');
  li.setAttribute('role', 'listitem');
  li.className = `card k-${c.kind}`;
  li.dataset.id = c.id;
  const at = c.quote.indexOf(c.label);
  const quote = c.kind === 'question' || at < 0 ? esc(c.quote)
    : `${esc(c.quote.slice(0, at))}<b>${esc(c.label)}</b>${esc(c.quote.slice(at + c.label.length))}`;
  const why = c.kindSource === 'clue' ? `${k.word}: you said “${esc(c.clue)}”`
    : c.kind === 'name' ? 'Name: no person or place clue, so not guessed'
      : c.kindSource === 'rule' ? 'found by rules' : '';
  li.innerHTML = `
    <button type="button" aria-pressed="false" aria-label="${esc(k.word)}: ${esc(c.label)}">
      <span class="kind"><span class="icon" aria-hidden="true">${k.icon}</span>${k.word}</span>
      ${c.kind === 'question' ? '' : `<span class="label">${esc(c.label)}</span>`}
      <span class="quote">“${quote}”</span>
      <span class="proof">✓ exact quote · characters ${c.start}–${c.end}${why ? ` · ${why}` : ''}</span>
      <span class="state" aria-hidden="true"></span>
    </button>`;
  const b = li.querySelector('button');
  b.addEventListener('click', () => {
    state.kept.has(c.id) ? state.kept.delete(c.id) : state.kept.add(c.id);
    b.setAttribute('aria-pressed', String(state.kept.has(c.id)));
    li.classList.toggle('kept', state.kept.has(c.id));
    updateKeep();
  });
  b.addEventListener('mouseenter', () => flash(c.id, true));
  b.addEventListener('focus', () => flash(c.id, true));
  return li;
}

function renderDropped(dropped) {
  const d = $('#dropped');
  d.hidden = !dropped?.length;
  if (!dropped?.length) return;
  d.querySelector('summary').textContent = `Show what the check threw away (${dropped.length})`;
  d.querySelector('ul').innerHTML = dropped.map((x) => `<li><b>${esc(x.label || x.kind)}</b> “${esc(x.quote)}” <span class="by">— ${esc(x.reason)}</span></li>`).join('');
}

// The transcript, with each card's verified span marked at its offsets.
function renderTranscript() {
  const t = state.transcript;
  const spans = state.cards.filter((c) => Number.isInteger(c.start)).map((c) => {
    const at = c.kind === 'question' ? -1 : t.slice(c.start, c.end).indexOf(c.label);
    return at >= 0 ? { id: c.id, start: c.start + at, end: c.start + at + c.label.length } : { id: c.id, start: c.start, end: c.end };
  }).sort((a, b) => a.start - b.start);
  let html = '';
  let pos = 0;
  for (const s of spans) {
    if (s.start < pos) continue;
    html += esc(t.slice(pos, s.start)) + `<mark data-id="${s.id}">${esc(t.slice(s.start, s.end))}</mark>`;
    pos = s.end;
  }
  html += esc(t.slice(pos));
  $('#transcript').innerHTML = html.replace(/\n/g, '<br>');
}
function flash(id, hover = false) {
  document.querySelectorAll('mark.on').forEach((m) => m.classList.remove('on'));
  document.querySelectorAll(`mark[data-id="${id}"]`).forEach((m) => m.classList.add(hover ? 'on' : 'lit', 'on'));
}

// ---------- the one question ----------
function showQuestion(q) {
  const ask = $('#ask');
  const i = q.text.indexOf(q.span);
  $('#ask-q').innerHTML = `${esc(q.text.slice(0, i))}<em>${esc(q.span)}</em>${esc(q.text.slice(i + q.span.length))}`;
  ask.hidden = false;
  state.run.question = q;
  const about = state.cards.find((c) => c.label === q.span || c.quote.includes(q.span));
  if (about) document.querySelector(`.card[data-id="${about.id}"]`)?.classList.add('about');
}
$('#ask-form').addEventListener('submit', (e) => {
  e.preventDefault();
  const a = $('#ask-a').value.trim();
  if (!a) return;
  // The answer joins the writer's words. Scribsy never replies; the rules look for new names in it.
  const base = state.transcript.length + 2;
  state.transcript = `${state.transcript}\n\n${a}`;
  const known = state.cards.map((c) => c.label.toLowerCase());
  const fresh = spot(a).filter((c) => c.kind !== 'question' && !known.includes(c.label.toLowerCase()))
    .map((c, j) => ({ ...c, start: base + c.start, end: base + c.end, id: state.cards.length + j }));
  state.cards.push(...fresh);
  fresh.forEach((c) => $('#cards').append(cardEl(c)));
  state.run.answer = a;
  renderTranscript();
  $('#ask').innerHTML = `<p class="eyebrow">Added to what you said</p><p class="ask-a">${esc(a)}</p>`;
  showKeep();
});
$('#ask-skip').addEventListener('click', () => { $('#ask').hidden = true; showKeep(); });
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape' && !$('#ask').hidden && !e.isComposing) $('#ask-skip').click();
});

// ---------- keep ----------
function showKeep() { $('#keep').hidden = false; updateKeep(); }
function updateKeep() {
  const n = state.kept.size;
  $('#keep-go').textContent = n ? `Keep these (${n}) →` : 'Keep all →';
  $('#board-title').textContent = $('#keep').hidden ? "Look what's already there." : 'Tap the cards that belong to your story.';
}
$('#keep-go').addEventListener('click', () => {
  const kept = state.kept.size ? state.cards.filter((c) => state.kept.has(c.id)) : state.cards;
  paintSky(kept);
});

// ---------- 4 Sky ----------
async function paintSky(kept) {
  show('sky');
  drawConstellation(kept);
  const img = $('#sky-img');
  img.classList.remove('in');
  $('#sky-cap').textContent = 'Muse Image is painting your sky…';
  try {
    let out;
    if (state.replay) { await sleep(1200); out = state.replay.sky; }
    else if (state.live) {
      const res = await fetch('/api/sky', { method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ cards: kept.map(({ kind, label }) => ({ kind, label })) }) });
      out = await res.json();
      if (!res.ok) throw new Error(out.error);
    } else out = { image: null };
    state.run.sky = out;
    if (out.image) {
      img.src = out.image;
      img.alt = `A painted night sky for a story with ${kept.map((c) => c.label).join(', ')}`;
      img.onload = () => img.classList.add('in');
      $('#sky-cap').textContent = `Sky painted by ${out.model}. Stars are your kept cards.`;
    } else $('#sky-cap').textContent = 'Stars are your kept cards. (The painted sky needs the live server.)';
  } catch (e) {
    $('#sky-cap').textContent = `The painted sky didn’t come back (${e.message}). Your stars are still here.`;
  }
  if (new URLSearchParams(location.search).has('record')) offerRunDownload();
}

function hash(s) { let h = 2166136261; for (const ch of s) h = Math.imul(h ^ ch.charCodeAt(0), 16777619); return (h >>> 0) / 4294967296; }

function drawConstellation(kept) {
  const svg = $('#sky-svg');
  const W = 1792; const H = 1024;
  const n = kept.length;
  const pts = kept.map((c, i) => {
    const t = n === 1 ? 0.5 : i / (n - 1);
    const x = 260 + t * (W - 520) + (hash(c.label) - 0.5) * 100;
    const y = H * 0.48 + Math.sin(t * Math.PI * 1.6 + 0.6) * H * 0.2 + (hash(`${c.label}y`) - 0.5) * 140;
    return { c, x, y };
  });
  const lines = pts.slice(1).map((p, i) => `<line class="fil" x1="${pts[i].x}" y1="${pts[i].y}" x2="${p.x}" y2="${p.y}" style="animation-delay:${i * 0.25}s"/>`).join('');
  const stars = pts.map((p, i) => {
    const q = p.c.kind === 'question';
    const r = q ? 9 : p.c.kind === 'person' || p.c.kind === 'name' ? 12 : 10;
    return `<g class="star k-${p.c.kind}" style="animation-delay:${0.3 + i * 0.25}s">
      <circle class="halo" cx="${p.x}" cy="${p.y}" r="${r * 3.2}"/>
      <circle class="core${q ? ' open' : ''}" cx="${p.x}" cy="${p.y}" r="${r}"/>
      <text x="${p.x}" y="${p.y + r + 38}" text-anchor="${p.x < 420 ? 'start' : p.x > W - 420 ? 'end' : 'middle'}" dx="${p.x < 420 ? -24 : p.x > W - 420 ? 24 : 0}">${esc(q ? short(p.c.label) : p.c.label)}</text>
    </g>`;
  }).join('');
  svg.innerHTML = lines + stars;
}
const short = (s) => (s.length > 28 ? `${s.slice(0, 26)}…` : s);

function offerRunDownload() {
  const run = { recordedAt: new Date().toISOString(), transcript: state.run.transcribe?.transcript ?? state.transcript,
    transcribedBy: state.transcribedBy, reveal: state.run.reveal, answer: state.run.answer ?? null, sky: state.run.sky };
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([JSON.stringify(run, null, 2)], { type: 'application/json' }));
  a.download = 'run.json';
  a.textContent = 'Download this run as replay/run.json';
  a.className = 'link';
  $('#sky .row').append(a);
}

$('#again').addEventListener('click', () => { state.replay = null; state.run = {}; $('#type-text').value = ''; show('talk'); });

// ---------- replay ----------
async function startReplay() {
  try {
    state.replay = await (await fetch('replay/run.json')).json();
  } catch {
    return note('No recorded run is in this build yet.');
  }
  setMode('Replay · a recorded live run', 'replay');
  state.run = {};
  useWords(state.replay.transcript, `${state.replay.transcribedBy} · recorded ${state.replay.recordedAt.slice(0, 10)}`);
}

// ---------- background stars ----------
function starfield() {
  const cv = $('#stars');
  const ctx = cv.getContext('2d');
  let pts = [];
  const size = () => {
    cv.width = innerWidth * devicePixelRatio; cv.height = innerHeight * devicePixelRatio;
    pts = Array.from({ length: Math.round((innerWidth * innerHeight) / 9000) }, () => ({ x: Math.random() * cv.width, y: Math.random() * cv.height, r: Math.random() * 1.2 + 0.2, p: Math.random() * 6 }));
  };
  size();
  addEventListener('resize', size);
  const draw = (t) => {
    ctx.clearRect(0, 0, cv.width, cv.height);
    for (const s of pts) {
      ctx.globalAlpha = 0.35 + 0.35 * Math.sin(t / 1400 + s.p);
      ctx.fillStyle = '#dfe6ff';
      ctx.beginPath(); ctx.arc(s.x, s.y, s.r * devicePixelRatio, 0, 7); ctx.fill();
    }
    if (!reduced) requestAnimationFrame(draw);
  };
  requestAnimationFrame(draw);
}

function esc(s) { return String(s).replace(/[&<>"']/g, (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch])); }

starfield();
init();

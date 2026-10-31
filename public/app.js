// Story Sky: Title → one easy question → rounds (cards, one question asked aloud, an answer out loud) → Keep → Sky.
import { toWav16k } from './lib/wav.mjs';
import { spot } from './lib/spot.mjs';
import { rulesQuestion } from './lib/verify.mjs';

const $ = (s) => document.querySelector(s);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
const MAX_QUESTIONS = 3;
const KIND = {
  person: { icon: '●', word: 'Person' },
  place: { icon: '◆', word: 'Place' },
  thing: { icon: '▲', word: 'Thing' },
  name: { icon: '◎', word: 'Name' },
  question: { icon: '?', word: 'Open question' },
};
const OPENING = 'audio/opening.mp3';

const state = {
  live: false, voice: false, muted: false, replay: null, replayRound: 0,
  transcript: '', rounds: [], asked: [], question: null, cards: [], kept: new Set(), shown: new Set(), run: { rounds: [] },
};
const keyOf = (c) => `${c.kind}:${c.label.toLowerCase()}`;

// ---------- frames and status ----------
function show(id) {
  document.querySelectorAll('.frame').forEach((f) => f.classList.toggle('active', f.id === id));
  window.scrollTo({ top: 0, behavior: reduced ? 'auto' : 'smooth' });
}
function setMode(text, cls) { const m = $('#mode'); m.textContent = text; m.className = `mode ${cls}`; }

async function init() {
  try {
    const s = await (await fetch('/api/status')).json();
    state.live = s.live;
    state.voice = s.voice;
  } catch { state.live = false; }
  setMode(state.live ? 'Live · Meta Model API' : 'No API key here · rules only', state.live ? 'live' : 'replay');
  $('#mute').hidden = !state.voice;
  if (new URLSearchParams(location.search).has('replay')) startReplay();
}

$('#mute').addEventListener('click', () => {
  state.muted = !state.muted;
  $('#mute').setAttribute('aria-pressed', String(state.muted));
  $('#mute').textContent = state.muted ? 'Voice off' : 'Voice on';
  if (state.muted) $('#voice').pause();
});

$('#begin').addEventListener('click', () => {
  show('talk');
  if (state.voice || state.replay) say(OPENING);
});

// ---------- the voice: it only ever reads the question ----------
async function say(src) {
  if (state.muted || !src) return;
  const a = $('#voice');
  try {
    a.src = src;
    await a.play();
  } catch { /* the page still shows every question */ }
}
async function speakQuestion(q) {
  if (state.replay) return say(state.replay.rounds[state.replayRound + 1]?.questionAudio);
  if (!state.voice || state.muted) return;
  try {
    const res = await fetch('/api/speak', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ template: q.template, span: q.span }) });
    if (!res.ok) return;
    const blob = await res.blob();
    if (new URLSearchParams(location.search).has('record')) q.audioData = await blobToDataUrl(blob);
    say(URL.createObjectURL(blob));
  } catch { /* shown, not spoken */ }
}
const blobToDataUrl = (b) => new Promise((r) => { const f = new FileReader(); f.onload = () => r(f.result); f.readAsDataURL(b); });

// ---------- recording, shared by the first answer and every later one ----------
function recorderFor(button, noteEl) {
  let rec = null;
  let tick = null;
  const label = button.querySelector('.mic-label');
  const note = (t) => { noteEl.textContent = t; };
  button.addEventListener('click', async () => {
    if (state.replay) return nextReplayAnswer();
    if (rec?.state === 'recording') return rec.stop();
    if (!state.live) return note('Talking needs the live server with a Meta key. Type instead.');
    $('#voice').pause();
    const idle = label.textContent;
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: { channelCount: 1, echoCancellation: true, noiseSuppression: true } });
      const chunks = [];
      rec = new MediaRecorder(stream);
      rec.ondataavailable = (e) => e.data.size && chunks.push(e.data);
      rec.onstop = async () => {
        stream.getTracks().forEach((t) => t.stop());
        clearInterval(tick);
        button.setAttribute('aria-pressed', 'false');
        button.classList.remove('on');
        label.textContent = 'Listening back…';
        note('Muse Voice Transcribe is writing down what you said…');
        try {
          const wav = await toWav16k(new Blob(chunks, { type: rec.mimeType }));
          const res = await fetch('/api/transcribe', { method: 'POST', headers: { 'Content-Type': 'audio/wav' }, body: wav });
          const out = await res.json();
          if (!res.ok) throw new Error(out.error);
          if (!out.transcript) throw new Error('No words came back. Try again a little closer to the mic.');
          note('');
          await answer(out.transcript, `transcribed by ${out.model}`);
        } catch (e) {
          note(e.message);
        } finally {
          label.textContent = idle;
        }
      };
      rec.start(1000);
      const t0 = Date.now();
      button.setAttribute('aria-pressed', 'true');
      button.classList.add('on');
      label.textContent = 'Tap when you’re done';
      tick = setInterval(() => {
        const s = Math.round((Date.now() - t0) / 1000);
        note(`${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`);
        if (s >= 120) rec.stop();
      }, 500);
    } catch (e) {
      note(`The microphone isn’t available (${e.message}). Type instead.`);
    }
  });
}
recorderFor($('#mic'), $('#mic-time'));
recorderFor($('#ask-mic'), $('#ask-time'));

$('#type-open').addEventListener('click', () => { $('#type-form').hidden = false; $('#type-text').focus(); });
$('#type-form').addEventListener('submit', (e) => {
  e.preventDefault();
  const t = $('#type-text').value.trim();
  if (t) answer(t, 'typed');
});
$('#ask-form').addEventListener('submit', (e) => {
  e.preventDefault();
  const a = $('#ask-a').value.trim();
  if (a) { $('#ask-a').value = ''; answer(a, 'typed'); }
});
$('#ask-skip').addEventListener('click', () => {
  // A skipped question still counts as asked, so the next one is about something else.
  if (state.question) state.asked.push({ template: state.question.template, span: state.question.span });
  state.question = null;
  state.pending = rulesQuestion(state.transcript, state.cards, state.asked, state.rounds.at(-1)?.start ?? 0);
  nextQuestion();
});

// ---------- one round: the writer's words join the transcript, then the cards and the next question ----------
async function answer(text, by) {
  const first = state.rounds.length === 0;
  const from = first ? 0 : state.transcript.length + 2;
  state.transcript = first ? text : `${state.transcript}\n\n${text}`;
  if (state.question) state.asked.push({ template: state.question.template, span: state.question.span });
  state.rounds.push({ question: state.question?.text ?? null, start: from });
  state.run.rounds.push({ answer: text, transcribedBy: by, question: state.question ? { ...state.question, audioData: undefined } : null,
    questionAudio: state.question?.audioData });
  state.question = null;
  $('#ask').hidden = true;
  if (first) show('board');
  $('#board-by').textContent = `· ${by}`;
  renderTranscript();
  $('#check').textContent = state.live && !state.replay ? 'Muse Spark is reading…' : 'Reading…';
  try {
    let r;
    if (state.replay) { await sleep(800); r = state.replay.rounds[state.replayRound].reveal; }
    else if (state.live) {
      const res = await fetch('/api/reveal', { method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ transcript: state.transcript, from, asked: state.asked }) });
      r = await res.json();
      if (!res.ok) throw new Error(r.error);
    } else {
      const cards = spot(state.transcript);
      r = { source: 'rules', cards, dropped: [], proposed: 0, question: rulesQuestion(state.transcript, cards, state.asked, from) };
    }
    state.run.rounds.at(-1).reveal = r;
    await playReveal(r);
  } catch (e) {
    $('#check').textContent = e.message;
  }
}

async function playReveal(r) {
  state.cards = r.cards.map((c, i) => ({ ...c, id: i }));
  $('#board-title').textContent = state.rounds.length === 1 ? 'Look what’s already there.' : 'Your story is filling in.';
  const ok = r.proposed - r.dropped.length;
  $('#check').innerHTML = r.source === 'model'
    ? `Muse Spark proposed <b>${r.proposed}</b> cards. <b>${ok}</b> quote you exactly, checked character by character${r.dropped.length ? `; <b>${r.dropped.length}</b> didn’t, so ${r.dropped.length === 1 ? 'it’s' : 'they’re'} gone` : ''}.${r.added > 0 ? ` The rules added <b>${r.added}</b> name${r.added > 1 ? 's' : ''} it missed.` : ''}`
    : `<b>${r.cards.length}</b> found by rules alone, each quoting your words.`;
  renderDropped(r.dropped);
  renderTranscript();
  const box = $('#cards');
  box.innerHTML = '';
  const fresh = [];
  for (const c of state.cards) {
    const el = cardEl(c);
    if (!state.shown.has(keyOf(c))) { el.classList.add('new'); fresh.push(el); }
    box.append(el);
  }
  for (const el of fresh) {
    await sleep(reduced ? 0 : 320);
    el.classList.add('in');
  }
  state.cards.forEach((c) => state.shown.add(keyOf(c)));
  await sleep(reduced ? 0 : 500);
  state.pending = r.question;
  nextQuestion();
}

function nextQuestion() {
  const p = state.pending;
  const q = p && !state.asked.some((a) => a.span.toLowerCase() === p.span.toLowerCase()) ? p : null;
  state.pending = null;
  const replayDone = state.replay && state.rounds.length >= state.replay.rounds.length;
  if (!q || state.asked.length >= MAX_QUESTIONS || replayDone) {
    $('#ask').hidden = true;
    $('#keep-h').textContent = 'That’s plenty to start. Tap the cards that belong to your story.';
    $('#keep').classList.add('ready');
    $('#keep').scrollIntoView({ behavior: reduced ? 'auto' : 'smooth', block: 'center' });
    return;
  }
  state.question = q;
  const i = q.text.indexOf(q.span);
  $('#ask-q').innerHTML = `${esc(q.text.slice(0, i))}<em>${esc(q.span)}</em>${esc(q.text.slice(i + q.span.length))}`;
  $('#ask-round').textContent = `Question ${state.asked.length + 1} of ${MAX_QUESTIONS}`;
  $('#ask-by').textContent = '· your words, in a Clean Language question';
  $('#ask-mic .mic-label').textContent = state.replay ? 'Hear the recorded answer →' : 'Answer out loud';
  $('#ask').hidden = false;
  document.querySelectorAll('.card.about').forEach((c) => c.classList.remove('about'));
  const about = state.cards.find((c) => c.label.toLowerCase() === q.span.toLowerCase()) ?? state.cards.find((c) => c.quote.includes(q.span));
  if (about) document.querySelector(`.card[data-id="${about.id}"]`)?.classList.add('about');
  flashSpan(q.start);
  $('#ask').scrollIntoView({ behavior: reduced ? 'auto' : 'smooth', block: 'center' });
  speakQuestion(q);
}

// ---------- cards ----------
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
  const sync = () => {
    const on = state.kept.has(keyOf(c));
    b.setAttribute('aria-pressed', String(on));
    li.classList.toggle('kept', on);
  };
  sync();
  b.addEventListener('click', () => {
    state.kept.has(keyOf(c)) ? state.kept.delete(keyOf(c)) : state.kept.add(keyOf(c));
    sync();
    updateKeep();
  });
  b.addEventListener('mouseenter', () => flash(c.id));
  b.addEventListener('focus', () => flash(c.id));
  return li;
}

function renderDropped(dropped) {
  const d = $('#dropped');
  d.hidden = !dropped?.length;
  if (!dropped?.length) return;
  d.querySelector('summary').textContent = `Show what the check threw away (${dropped.length})`;
  d.querySelector('ul').innerHTML = dropped.map((x) => `<li><b>${esc(x.label || x.kind)}</b> “${esc(x.quote)}” <span class="by">— ${esc(x.reason)}</span></li>`).join('');
}

// The transcript, round by round, with each card's verified span marked at its offsets. The questions sit between the
// rounds as labels; they are never part of the writer's text.
function renderTranscript() {
  const t = state.transcript;
  const spans = state.cards.filter((c) => Number.isInteger(c.start)).map((c) => {
    const at = c.kind === 'question' ? -1 : t.slice(c.start, c.end).indexOf(c.label);
    return at >= 0 ? { id: c.id, start: c.start + at, end: c.start + at + c.label.length } : { id: c.id, start: c.start, end: c.end };
  }).sort((a, b) => a.start - b.start);
  const marks = (lo, hi) => {
    let html = '';
    let pos = lo;
    for (const s of spans) {
      if (s.start < pos || s.end > hi) continue;
      html += esc(t.slice(pos, s.start)) + `<mark data-id="${s.id}" data-start="${s.start}">${esc(t.slice(s.start, s.end))}</mark>`;
      pos = s.end;
    }
    return html + esc(t.slice(pos, hi));
  };
  $('#transcript').innerHTML = state.rounds.map((r, i) => {
    const end = i + 1 < state.rounds.length ? state.rounds[i + 1].start - 2 : t.length;
    return `${r.question ? `<p class="asked">${esc(r.question)}</p>` : ''}<p>${marks(r.start, end)}</p>`;
  }).join('');
}
function flash(id) {
  document.querySelectorAll('mark.on').forEach((m) => m.classList.remove('on'));
  document.querySelectorAll(`mark[data-id="${id}"]`).forEach((m) => m.classList.add('on'));
}
function flashSpan(start) {
  document.querySelectorAll('mark.on').forEach((m) => m.classList.remove('on'));
  document.querySelector(`mark[data-start="${start}"]`)?.classList.add('on');
}

// ---------- keep ----------
function updateKeep() {
  const n = state.kept.size;
  $('#keep-go').textContent = n ? `Show my sky with ${n} →` : 'Show my sky →';
}
$('#keep-go').addEventListener('click', () => {
  const kept = state.kept.size ? state.cards.filter((c) => state.kept.has(keyOf(c))) : state.cards;
  paintSky(kept);
});

// ---------- sky ----------
async function paintSky(kept) {
  $('#voice').pause();
  show('sky');
  drawConstellation(kept);
  const img = $('#sky-img');
  img.classList.remove('in');
  img.removeAttribute('src');
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
    state.run.kept = kept.map((c) => c.label);
    if (out.image) {
      img.src = out.image;
      img.alt = `A painted night sky for a story with ${kept.map((c) => c.label).join(', ')}`;
      img.onload = () => img.classList.add('in');
      $('#sky-cap').textContent = `Sky painted by ${out.model}. Stars are your kept cards.`;
    } else $('#sky-cap').textContent = 'Stars are your kept cards. (The painted sky needs the live server.)';
  } catch (e) {
    $('#sky-cap').textContent = `The painted sky didn’t come back (${e.message}). Your stars are still here.`;
  }
  if (new URLSearchParams(location.search).has('record') && !state.replay) offerRunDownload();
}

function hash(s) { let h = 2166136261; for (const ch of s) h = Math.imul(h ^ ch.charCodeAt(0), 16777619); return (h >>> 0) / 4294967296; }

function drawConstellation(kept) {
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
    const anchor = p.x < 420 ? 'start' : p.x > W - 420 ? 'end' : 'middle';
    const dx = p.x < 420 ? -24 : p.x > W - 420 ? 24 : 0;
    return `<g class="star k-${p.c.kind}" style="animation-delay:${0.3 + i * 0.25}s">
      <circle class="halo" cx="${p.x}" cy="${p.y}" r="${r * 3.2}"/>
      <circle class="core${q ? ' open' : ''}" cx="${p.x}" cy="${p.y}" r="${r}"/>
      <text x="${p.x}" y="${p.y + r + 38}" text-anchor="${anchor}" dx="${dx}">${esc(q ? short(p.c.label) : p.c.label)}</text>
    </g>`;
  }).join('');
  $('#sky-svg').innerHTML = lines + stars;
}
const short = (s) => (s.length > 28 ? `${s.slice(0, 26)}…` : s);

// ---------- saving a live run as the replay (?record) ----------
function offerRunDownload() {
  const run = { version: 2, recordedAt: new Date().toISOString(), note: 'A real live run, saved from the page with ?record.',
    rounds: state.run.rounds, kept: state.run.kept, sky: state.run.sky };
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([JSON.stringify(run, null, 2)], { type: 'application/json' }));
  a.download = 'run.json';
  a.textContent = 'Download this run as replay/run.json';
  a.className = 'link';
  $('#sky .row').append(a);
}

$('#again').addEventListener('click', () => location.assign(location.pathname));

// ---------- replay: a recorded live run, played round by round ----------
async function startReplay() {
  try {
    state.replay = await (await fetch('replay/run.json')).json();
    if (state.replay.version !== 2) throw new Error('old format');
  } catch {
    state.replay = null;
    return alert('No recorded run is in this build yet.');
  }
  setMode(`Replay · a live run recorded ${state.replay.recordedAt.slice(0, 10)}`, 'replay');
  show('talk');
  say(OPENING);
  $('#mic .mic-label').textContent = 'Hear the recorded answer →';
}
async function nextReplayAnswer() {
  const r = state.replay.rounds[state.rounds.length];
  if (!r) return;
  state.replayRound = state.rounds.length;
  $('#voice').pause();
  await answer(r.answer, r.transcribedBy);
}
$('#replay').addEventListener('click', () => startReplay());

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

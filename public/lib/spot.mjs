// Rules-only spotting that runs on the device with no model: names (runs of capitalised words), places (after in/at/to…
// or with a place word), and the writer's own open questions. It is the fallback when the model is unavailable, and the
// cross-check that adds any name the model missed. A title makes a person; any other unplaced name stays a neutral Name.
import { NOT_NAMES, PLACE_WORDS, TITLES } from './words.mjs';

const CONTRACTION = /^\p{L}+['’](?:ve|ll|re|d|m|t|s)$/u;
const WORD = /\p{Lu}[\p{L}'’-]*/gu;
const PLACE_BEFORE = /\b(?:in|at|to|from|near|into)\s+$/;
const UNKNOWN = /\b(?:don['’]t know|not sure|no idea|I wonder)\b/i;

const isNotName = (w) => NOT_NAMES.has(w.replace(/['’]s$/u, '')) || CONTRACTION.test(w) && NOT_NAMES.has(w.split(/['’]/)[0]);

function sentencesOf(text) {
  return [...text.matchAll(/[^.!?\n]+[.!?]*/g)]
    .map((m) => ({ start: m.index + (m[0].length - m[0].trimStart().length), body: m[0].trim() }))
    .filter((s) => s.body);
}

/** Cards found by rules alone, each with an exact quote (its sentence) and offsets. */
export function spot(text) {
  const cards = [];
  const keys = new Set();
  const add = (card) => {
    const key = `${card.kind}:${card.label.toLowerCase()}`;
    if (keys.has(key)) return;
    keys.add(key);
    cards.push(card);
  };
  for (const s of sentencesOf(text)) {
    if (s.body.endsWith('?') || UNKNOWN.test(s.body)) {
      add({ kind: 'question', label: s.body, quote: s.body, clue: '', kindSource: 'rule', start: s.start, end: s.start + s.body.length });
    }
    let run = null;
    const runs = [];
    for (const m of s.body.matchAll(WORD)) {
      const w = m[0];
      // A capitalised first word counts unless it is a common word ("Wren runs" gives Wren; "Then Wren" gives Wren).
      if (isNotName(w)) { run = null; continue; }
      if (run && s.body.slice(run.end, m.index) === ' ') { run.end = m.index + w.length; continue; }
      run = { start: m.index, end: m.index + w.length };
      runs.push(run);
    }
    for (const r of runs) {
      const label = s.body.slice(r.start, r.end).replace(/['’]s$/u, '');
      const ws = label.split(' ');
      if (ws.length === 1 && TITLES.has(label)) continue;
      const before = s.body.slice(0, r.start);
      const place = PLACE_BEFORE.test(before) || (ws.length > 1 && (PLACE_WORDS.has(ws[ws.length - 1]) || PLACE_WORDS.has(ws[0])));
      const person = !place && ws.length > 1 && TITLES.has(ws[0]);
      add({ kind: place ? 'place' : person ? 'person' : 'name', label, quote: s.body, clue: '', kindSource: 'rule', start: s.start, end: s.start + s.body.length });
    }
  }
  // "Calloway" beside "Inspector Calloway" is the same person, so only the longer name gets a card.
  return cards.filter((c) => c.kind === 'question' || !cards.some((o) => o !== c && o.kind !== 'question'
    && o.label.length > c.label.length && o.label.split(' ').includes(c.label)));
}

/** Names the device found that no model card covers, to add as "found by rules". */
export function missedNames(text, modelCards) {
  const covered = modelCards.map((c) => c.label.toLowerCase());
  return spot(text).filter((c) => c.kind !== 'question'
    && !covered.some((l) => l.includes(c.label.toLowerCase()) || c.label.toLowerCase().includes(l)));
}

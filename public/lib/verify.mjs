// The verifiable half of Story Sky. Nothing the model says reaches the screen until it is checked here against the
// writer's own words: every card's quote must be an exact substring of the transcript (we record its offsets), its label
// must sit inside that quote, and a person or place claim on a name must point at a clue the writer actually said.
// Runs unchanged in the browser and in Node (tests and the server).
import { PERSON_CUES, PLACE_PREPS, PLACE_WORDS, TITLES } from './words.mjs';

/** Every place `needle` occurs in `text`, exactly (case and punctuation included). */
export function findAll(text, needle) {
  const out = [];
  if (!needle) return out;
  for (let at = text.indexOf(needle); at >= 0; at = text.indexOf(needle, at + 1)) {
    out.push({ start: at, end: at + needle.length });
  }
  return out;
}

const words = (s) => s.match(/[\p{L}'’]+/gu) ?? [];
const isProperName = (label) => /^\p{Lu}/u.test(label.replace(/^(the|a|an)\s+/i, ''));

/** The clue that makes a name a person or a place, judged only from words the writer said. */
export function clueKind(label, clue) {
  const lw = words(label);
  if (lw.length > 1 && TITLES.has(lw[0])) return 'person';
  if (lw.length > 1 && (PLACE_WORDS.has(lw[lw.length - 1]) || PLACE_WORDS.has(lw[0]))) return 'place';
  if (!clue || !clue.includes(label)) return null;
  const before = words(clue.slice(0, clue.indexOf(label))).map((w) => w.toLowerCase());
  const all = words(clue).map((w) => w.toLowerCase());
  if (before.length && PLACE_PREPS.has(before[before.length - 1])) return 'place';
  if (all.some((w) => PERSON_CUES.has(w))) return 'person';
  return null;
}

/**
 * Check the model's cards. Returns { cards, dropped }. A kept card gains `start`/`end` (offsets of its quote in the
 * transcript) and `kindSource` ('model' | 'clue' | 'rule'); a dropped card says why.
 */
export function verifyCards(transcript, modelCards) {
  const cards = [];
  const dropped = [];
  const seen = new Set();
  for (const raw of modelCards ?? []) {
    const card = { kind: String(raw.kind ?? ''), label: String(raw.label ?? '').trim(), quote: String(raw.quote ?? ''), clue: String(raw.clue ?? '') };
    const hits = findAll(transcript, card.quote);
    if (!card.quote || hits.length === 0) { dropped.push({ ...card, reason: 'quote is not in the transcript' }); continue; }
    if (card.kind !== 'question' && (!card.label || !card.quote.includes(card.label))) {
      dropped.push({ ...card, reason: 'label is not inside its quote' });
      continue;
    }
    if (!['person', 'place', 'thing', 'question'].includes(card.kind)) { dropped.push({ ...card, reason: `unknown kind "${card.kind}"` }); continue; }
    let kind = card.kind;
    let kindSource = 'model';
    // A name with no clear person or place clue in the writer's words stays a neutral "Name": the writer decides.
    if ((kind === 'person' || kind === 'place') && isProperName(card.label)) {
      const clueOk = card.clue && findAll(transcript, card.clue).length > 0;
      const k = clueKind(card.label, clueOk ? card.clue : '');
      kind = k ?? 'name';
      kindSource = k ? 'clue' : 'rule';
      if (!clueOk) card.clue = '';
    }
    if (kind === 'question') card.label = card.label || card.quote;
    const key = `${kind}:${card.label.toLowerCase()}`;
    if (seen.has(key)) continue;
    seen.add(key);
    cards.push({ ...card, kind, kindSource, start: hits[0].start, end: hits[0].end });
  }
  return { cards, dropped };
}

// Clean Language questions in their published form (David Grove's basic questions). The model only picks one and a
// span of the writer's words; the words around the span are fixed, and the app never answers.
export const TEMPLATES = {
  what_kind: 'And what kind of {X} is that {X}?',
  anything_else: 'And is there anything else about {X}?',
  where_is: 'And where is {X}?',
  like_what: 'And that’s {X} like what?',
  come_from: 'And where could {X} come from?',
  when_then: 'And when {X}, what happens?',
};
const MAX_SPAN_WORDS = 8;

/** Build the one question, or null. The span must be the writer's exact words. */
export function buildQuestion(transcript, pick) {
  if (!pick) return null;
  const template = TEMPLATES[pick.template];
  const span = String(pick.span ?? '').trim().replace(/[.,!?;:]+$/, '');
  if (!template || !span) return null;
  const hits = findAll(transcript, span);
  if (!hits.length || words(span).length > MAX_SPAN_WORDS) return null;
  // what_kind repeats the span, which only reads well for a short noun phrase.
  if (pick.template === 'what_kind' && words(span).length > 3) return null;
  return { template: pick.template, span, start: hits[0].start, end: hits[0].end, text: template.replaceAll('{X}', span) };
}

/** The question when no model picked one: about the writer's own open question first, else about a name. */
export function rulesQuestion(transcript, cards) {
  const unknown = cards.find((c) => c.kind === 'question');
  const span = unknown?.quote.match(/\b(?:who|why|what|where|how)(?:\s+[^\s.?!,]+){1,3}/i)?.[0];
  const q = span && buildQuestion(transcript, { template: 'anything_else', span });
  if (q) return q;
  const named = cards.find((c) => c.kind !== 'question');
  return named ? buildQuestion(transcript, { template: 'anything_else', span: named.label }) : null;
}

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

const LONG_QUOTE = 30;

/**
 * A quote longer than LONG_QUOTE words is cut to the sentence that holds the label (and a sentence that is still long,
 * to its clause), so the proof points at the words that matter rather than a whole answer. The result is still an exact
 * slice of the quote; `at` is where it starts.
 */
export function narrowQuote(quote, label) {
  let at = 0;
  for (const stop of [/[.?!\n]/, /[.?!\n,;:—]/]) {
    const i = label ? quote.indexOf(label) : -1;
    if (words(quote).length <= LONG_QUOTE || i < 0) break;
    let start = 0;
    for (let k = i - 1; k >= 0; k--) if (stop.test(quote[k])) { start = k + 1; break; }
    while (/\s/.test(quote[start] ?? '')) start++;
    let end = quote.length;
    for (let k = i + label.length; k < quote.length; k++) if (stop.test(quote[k])) { end = k + 1; break; }
    quote = quote.slice(start, end);
    at += start;
  }
  return { quote, at };
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
    const { quote, at } = narrowQuote(card.quote, card.label);
    const start = hits[0].start + at;
    cards.push({ ...card, quote, kind, kindSource, start, end: start + quote.length });
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

const sameSpan = (a, b) => a.trim().toLowerCase() === b.trim().toLowerCase();

/** Fill a template with a span. Used by the page and by the server's voice, so only these questions are ever spoken. */
export function questionText(template, span) {
  return TEMPLATES[template] ? TEMPLATES[template].replaceAll('{X}', span) : null;
}

/**
 * Build one question, or null. The span must be the writer's exact words, and the question must not repeat an earlier
 * one in this conversation (`asked`: [{ template, span }]): no span is asked about twice.
 */
export function buildQuestion(transcript, pick, asked = []) {
  if (!pick) return null;
  const template = TEMPLATES[pick.template];
  const span = String(pick.span ?? '').trim().replace(/[.,!?;:]+$/, '');
  if (!template || !span) return null;
  const hits = findAll(transcript, span);
  if (!hits.length || words(span).length > MAX_SPAN_WORDS) return null;
  // what_kind repeats the span, which only reads well for a short noun phrase.
  if (pick.template === 'what_kind' && words(span).length > 3) return null;
  if (asked.some((a) => sameSpan(a.span, span))) return null;
  // Each question in a run uses a different template: a second "like what?" reads as a loop, not a conversation.
  if (asked.some((a) => a.template === pick.template)) return null;
  const at = hits[hits.length - 1];
  return { template: pick.template, span, start: at.start, end: at.end, text: questionText(pick.template, span) };
}

/**
 * The question when no model picked one, preferring what the writer said most recently (at or after `from`): their own
 * open question first, then a place, then any other card. Never repeats a span.
 */
export function rulesQuestion(transcript, cards, asked = [], from = 0) {
  const recent = [...cards.filter((c) => c.start >= from), ...cards.filter((c) => c.start < from)];
  const picks = [];
  for (const c of recent.filter((x) => x.kind === 'question')) {
    const span = c.quote.match(/\b(?:who|why|what|where|how)(?:\s+[^\s.?!,]+){1,3}/i)?.[0];
    if (span) picks.push({ template: 'anything_else', span });
  }
  for (const c of recent.filter((x) => x.kind !== 'question')) {
    if (c.kind === 'place') picks.push({ template: 'where_is', span: c.label });
    if (c.kind === 'thing') picks.push({ template: 'what_kind', span: c.label.replace(/^(the|a|an)\s+/i, '') });
    picks.push({ template: 'anything_else', span: c.label });
    picks.push({ template: 'come_from', span: c.label });
  }
  for (const p of picks) {
    const q = buildQuestion(transcript, p, asked);
    if (q) return q;
  }
  return null;
}

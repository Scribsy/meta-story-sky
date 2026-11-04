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

// Clean Language questions (David Grove's basic questions), worded as a person would say them aloud: "And what kind of
// hedgehog?" rather than the textbook "…is that hedgehog?". The model only picks one and a span of the writer's words;
// the words around the span are fixed, and the app never answers.
export const TEMPLATES = {
  what_kind: 'And what kind of {X}?',
  anything_else: 'And is there anything else about {X}?',
  where_is: 'And where is {X}?',
  like_what: 'And that’s {X} like what?',
  come_from: 'And where could {X} come from?',
  when_then: 'And when {X}, what happens?',
};
const MAX_SPAN_WORDS = 8;
const WHAT_KIND_WORDS = 2;

// What each template's slot takes. "thing": a noun phrase ("the brass key"). "event": something happening ("he absorbs
// powers", "walking through the wasteland"). "image": a noun or a quality ("nightmares", "razor sharp"). "any": a noun
// phrase or the writer's own wh-question ("who rang the bell").
export const SLOTS = { what_kind: 'thing', anything_else: 'any', where_is: 'thing', like_what: 'image', come_from: 'thing', when_then: 'event' };

const LEADING = /^(?:a|an|the|this|that|these|those|his|her|their|its|my|our|your|some)\s+/i;
const SUBJECT = /^(?:i|you|he|she|it|we|they|someone|somebody|everyone|everybody|nobody|there)\b/i;
const FINITE = /\b(?:am|is|are|was|were|be|been|has|have|had|do|does|did|can|could|will|would|shall|should|may|might|must|i'm|it's|he's|she's|they're|we're|don't|doesn't|didn't|can't|won't|isn't|aren't|wasn't|weren't)\b/i;
const WH = /^(?:who|what|why|where|when|how|whether)\b/i;
// A span that stops mid-phrase ("holes in the") never fits a slot.
const DANGLING = /\b(?:a|an|the|of|to|in|on|at|for|with|and|or|but|from|by|into|my|his|her|their|our|your|its|that|which)$/i;

const isClause = (s) => SUBJECT.test(s) || FINITE.test(s);

/** Does the span read naturally in this template's slot? Cheap grammar, no model: it only has to catch the clear misfits. */
export function fits(template, span) {
  if (DANGLING.test(span)) return false;
  const n = words(span).length;
  switch (SLOTS[template]) {
    case 'thing': return !isClause(span) && !WH.test(span) && (template !== 'what_kind' || n <= WHAT_KIND_WORDS);
    case 'image': return !isClause(span) && !WH.test(span);
    case 'any': return !isClause(span) || WH.test(span);
    // An event needs something happening: a subject with a verb, a verb, or a gerund ("walking through…").
    case 'event': return n >= 2 && !/^(?:a|an|the)\s/i.test(span) && (isClause(span) || /^\p{L}+ing\b/iu.test(span) || /\b\p{L}+(?:s|ed)\s/u.test(`${span} `));
    default: return false;
  }
}

// Clean Language hands the writer's words back from the listener's side: "my father" → "your father", "I'm lost" →
// "you're lost". The highlight in the transcript still points at the writer's exact words.
const PERSON = [
  [/\bI am\b/g, 'you are'], [/\bI was\b/g, 'you were'], [/\bI'm\b/g, 'you’re'], [/\bI’m\b/g, 'you’re'],
  [/\bI've\b/g, 'you’ve'], [/\bI'd\b/g, 'you’d'], [/\bI'll\b/g, 'you’ll'], [/\bwe're\b/gi, 'you’re'],
  [/\bmyself\b/gi, 'yourself'], [/\bourselves\b/gi, 'yourselves'], [/\bmine\b/gi, 'yours'], [/\bours\b/gi, 'yours'],
  [/\bI\b/g, 'you'], [/\bme\b/gi, 'you'], [/\bmy\b/gi, 'your'], [/\bwe\b/gi, 'you'], [/\bus\b/gi, 'you'], [/\bour\b/gi, 'your'],
];
const toListener = (s) => PERSON.reduce((t, [re, to]) => t.replace(re, to), s);

/**
 * The span as it is spoken in the template. "What kind of X?" takes the bare noun ("what kind of dog?"); the other thing slots point with "that" ("And where is that wasteland?"). Then first person becomes second.
 */
function spoken(template, span) {
  // A span that began a sentence ("The boy…") sits mid-question now; names keep their capitals.
  let s = span.replace(LEADING, (m) => m.toLowerCase());
  if (template === 'what_kind') s = s.replace(LEADING, '');
  else if (SLOTS[template] === 'thing' || (SLOTS[template] === 'any' && !WH.test(s))) {
    s = s.replace(/^(?:a|an)\s+(?=\p{Ll})/u, 'that ');
    if (words(s).length <= 3) s = s.replace(/^the\s+(?=\p{Ll})/u, 'that ');
  }
  // "And when they will grow up" → "And when they grow up": the when-clause takes the plain present.
  if (template === 'when_then') s = s.replace(/\b(?:will|shall)\s+/g, '').replace(/\b(\p{L}+)'ll\b/gu, '$1');
  return toListener(s);
}

const HEAD_STOP = /\s(?:of|in|on|at|with|from|by|for|to|into|under|over|that|who|which|like)\s/i;
/** A noun phrase whose head word is a plain plural ("holes in the fabric", "the great Kansas prairies"). */
function isPlural(span) {
  const head = words(span.split(HEAD_STOP)[0]).pop() ?? '';
  return /^\p{Ll}/u.test(head) && /[^s]s$/.test(head) && !/(?:us|is|ss|ics|news)$/.test(head);
}

// "the brass key" and "brass key" are the same thing to ask about.
const sameSpan = (a, b) => {
  const norm = (s) => s.trim().toLowerCase().replace(LEADING, '');
  return norm(a) === norm(b);
};

/** Fill a template with a span. Used by the page and by the server's voice, so only these questions are ever spoken. */
export function questionText(template, span) {
  if (!TEMPLATES[template]) return null;
  let text = TEMPLATES[template];
  // The verb agrees with a plural: "And where are those holes…?"
  if (isPlural(span) && template === 'where_is') text = text.replace('where is', 'where are');
  let x = spoken(template, span);
  if (isPlural(span) && template !== 'what_kind') x = x.replace(/^that\s/, 'those ');
  return text.replaceAll('{X}', x);
}

/**
 * Build one question, or null. The span must be the writer's exact words, and the question must not repeat an earlier
 * one in this conversation (`asked`: [{ template, span }]): no span is asked about twice, no template is used twice.
 * When the span doesn't fit the picked template's slot, the same words are tried in the most generic question first
 * ("And is there anything else about X?"), then the others.
 */
export function buildQuestion(transcript, pick, asked = [], fallback = true) {
  if (!pick) return null;
  const template = TEMPLATES[pick.template];
  const raw = String(pick.span ?? '').trim().replace(/[.,!?;:]+$/, '');
  const span = pick.template === 'what_kind' ? raw.replace(LEADING, '') : raw;
  if (!template || !span) return null;
  const hits = findAll(transcript, span);
  if (!hits.length || words(span).length > MAX_SPAN_WORDS) return null;
  if (asked.some((a) => sameSpan(a.span, span))) return null;
  const used = asked.some((a) => a.template === pick.template);
  if (used || !fits(pick.template, span)) {
    if (!fallback) return null;
    for (const t of ['anything_else', 'when_then', 'like_what', 'come_from']) {
      if (t === pick.template) continue;
      const q = buildQuestion(transcript, { template: t, span: raw }, asked, false);
      if (q) return q;
    }
    return null;
  }
  const at = hits[hits.length - 1];
  // The model sometimes trims the writer's article ("sour expression" for "a sour expression"). Where the transcript has
  // one right before the span, it goes back in: the words are still exactly the writer's.
  let start = at.start;
  let full = span;
  if (pick.template !== 'what_kind' && SLOTS[pick.template] !== 'event' && /^\p{Ll}/u.test(span) && !LEADING.test(span)) {
    const article = transcript.slice(0, at.start).match(/\b(?:a|an|the|his|her|their|its|my|our|your) $/i)?.[0];
    if (article) { start -= article.length; full = article + span; }
  }
  return { template: pick.template, span: full, start, end: at.end, text: questionText(pick.template, full) };
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

// The verifiable half of Story Sky. Nothing the model says reaches the screen until it is checked here against the
// writer's own words: every card's quote must be an exact substring of the transcript (we record its offsets), its label
// must sit inside that quote, and a person or place claim on a name must point at a clue the writer actually said.
// Runs unchanged in the browser and in Node (tests and the server).
import { ADJECTIVES, ING_NOUNS, IRREGULAR_PAST, IRREGULAR_PLURALS, PERSON_CUES, PLACE_PREPS, PLACE_WORDS, TITLES } from './words.mjs';

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
// hedgehog?" rather than the textbook "And what kind of hedgehog is that hedgehog?". The model only picks one and a span
// of the writer's words; the words around the span are fixed, and the app never answers.
export const TEMPLATES = {
  what_kind: 'And what kind of {X}?',
  anything_else: 'And is there anything else about {X}?',
  where_is: 'And where is {X}?',
  like_what: 'And {X}, like what?',
  come_from: 'And where could {X} come from?',
  when_then: 'And when {X}, what happens?',
};
const MAX_SPAN_WORDS = 8;
const WHAT_KIND_WORDS = 2;
const MAX_QUESTION_WORDS = 18;

// What each template's slot takes. "thing": a noun phrase ("the brass key"). "event": something happening ("he absorbs
// powers", "the tide went out"). "image": a quality or a plain noun ("razor sharp", "nightmares"). "any": a noun phrase
// or the writer's own wh-question ("who rang the bell").
export const SLOTS = { what_kind: 'thing', anything_else: 'any', where_is: 'thing', like_what: 'image', come_from: 'thing', when_then: 'event' };

const LEADING = /^(?:a|an|the|this|that|these|those|his|her|their|its|my|our|your|some)\s+/i;
const SUBJECT = /^(?:i|you|he|she|it|we|they|someone|somebody|everyone|everybody|nobody|there)\b/i;
const FINITE = /\b(?:am|is|are|was|were|be|been|has|have|had|do|does|did|can|could|will|would|shall|should|may|might|must|i'm|it's|he's|she's|they're|we're|don't|doesn't|didn't|can't|won't|isn't|aren't|wasn't|weren't)\b/i;
const WH = /^(?:who|what|why|where|when|how|whether)\b/i;
// A span that stops mid-phrase ("holes in the") never fits a slot.
const DANGLING = /\b(?:a|an|the|of|to|in|on|at|for|with|and|or|but|from|by|into|my|his|her|their|our|your|its|that|which)$/i;
// Counting words: "twelve ravens", "a hundred winters", "thousands of moths" keep the writer's own wording.
const QUANTITY = /^(?:(?:a|an)\s+)?(?:one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve|twenty|thirty|forty|fifty|hundreds?|thousands?|millions?|dozens?|many|few|several|all|both|each|every|no|most|lots?|couple|handful|pair)\b/i;
const PRONOUN = /^(?:i|me|you|he|him|she|her|it|we|us|they|them|someone|somebody|something|anyone|anybody|anything|everyone|everybody|everything|nobody|nothing|no one)$/i;
// Words that are always lower case mid-question, whatever the writer's sentence did with them.
const CLOSED = /^(?:a|an|the|this|that|these|those|his|her|their|its|my|our|your|some|he|she|it|we|they|you|someone|somebody|something|everyone|everybody|everything|nobody|nothing|there|one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve|twenty|hundreds|thousands|millions|dozens|many|few|several|all|both|each|every|no|most|lots)\b/i;
// What can follow a verb in the past ("stole the crown", "went out", "died"), as opposed to "a held breath".
const AFTER_VERB = /^(?:a|an|the|this|that|these|those|his|her|their|its|my|our|your|him|them|me|us|it|out|up|down|away|back|off|over|in|on|at|to|into|from|for|with|by|through|across|around|until|before|after|again|home|there|here|together|apart|forever|alone)$/i;
// "you're lost", "she felt scared": a describing word after these, not an event in the past.
const LINKING = /(?:['’](?:re|m|s)|^(?:am|is|are|was|were|be|been|being|get|gets|got|feel|feels|felt|seem|seems|seemed|look|looks|looked|stay|stays|stayed|so|very|too))$/;
const NOT_PAST = new Set(['bed', 'red', 'need', 'seed', 'hundred', 'sled', 'shed', 'speed', 'feed', 'weed', 'creed',
  'greed', 'reed', 'steed', 'sacred', 'kindred', 'naked', 'wicked', 'rugged', 'ragged', 'beloved', 'aged', 'blessed',
  'cursed', 'jagged', 'crooked', 'wretched', 'tired', 'scared', 'bored', 'sled']);

const lowerWords = (s) => words(s).map((w) => w.toLowerCase());
/** A verb in the past with something after it that only a verb takes: "the king died", "my brother stole the crown". */
function pastVerb(span) {
  const ws = lowerWords(span);
  return ws.some((w, i) => i > 0 && (IRREGULAR_PAST.has(w) || (w.length > 3 && /ed$/.test(w) && !NOT_PAST.has(w)))
    && (i === ws.length - 1 || AFTER_VERB.test(ws[i + 1])) && !LINKING.test(ws[i - 1]));
}
const isClause = (s) => SUBJECT.test(s) || FINITE.test(s) || pastVerb(s);
const isPast = (s) => pastVerb(s) || /\b(?:was|were|had|did)\b/i.test(s);
/** "razor sharp", "cold and heavy", "lonely": a quality, not a thing. */
const isQuality = (s) => {
  const last = lowerWords(s).pop() ?? '';
  return ADJECTIVES.has(last) || (/(?:ful|ous|less)$/.test(last) && !/(?:handful|mouthful|spoonful|cupful)$/.test(last));
};
const startsDoing = (s) => {
  const w = lowerWords(s)[0] ?? '';
  return w.length >= 5 && w.endsWith('ing') && !ING_NOUNS.has(w);
};
const possessive = (s) => /['’]s\b/.test(s);
const doubled = (s) => /\b(\p{L}+)\s+\1\b/iu.test(s);

/**
 * Does the span read naturally in this template's slot? Cheap grammar, no model: it only has to catch the clear misfits.
 * The span is as it will be said: a name keeps its capital, a sentence's first word that isn't a name has lost it.
 */
export function fits(template, span) {
  if (DANGLING.test(span) || doubled(span)) return false;
  const n = words(span).length;
  const clause = isClause(span);
  const wh = WH.test(span);
  const pronoun = PRONOUN.test(span.trim());
  switch (SLOTS[template]) {
    case 'thing': {
      if (clause || wh || pronoun || isQuality(span) || startsDoing(span)) return false;
      if (template !== 'what_kind') return true;
      // "And what kind of hedgehog?": one or two plain words. Never a name ("what kind of Mabel?"), a possessive or a count.
      const bare = span.replace(LEADING, '');
      return words(bare).length <= WHAT_KIND_WORDS && !/^\p{Lu}/u.test(bare) && !possessive(bare) && !QUANTITY.test(bare);
    }
    case 'image':
      // A quality ("razor sharp"), or an image the writer gave an article or made plural ("a held breath", "nightmares").
      if (wh || pronoun || n > 4 || /^\p{Lu}/u.test(span) || possessive(span) || startsDoing(span) || QUANTITY.test(span)) return false;
      if (isQuality(span)) return !clause;
      return !clause && !/,|\s(?:and|or|&)\s/.test(span) && !/\b(?:i|me|my|we|us|our)\b/i.test(span)
        && !/^(?:the|this|that|these|those|his|her|their|its|your|some)\s/i.test(span)
        && (/^(?:a|an)\s/i.test(span) || isPlural(span));
    case 'any': return wh || (!clause && !pronoun && !isQuality(span));
    case 'event': return n >= 2 && !wh && (clause || startsDoing(span));
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

const HEAD_STOP = /\s(?:of|in|on|at|with|from|by|for|to|into|under|over|that|who|which|like)\s/i;
/** A noun phrase about more than one thing: "holes in the fabric", "the children", "you and your sister". */
function isPlural(span) {
  const head = span.split(HEAD_STOP)[0];
  if (/\s(?:and|&)\s/i.test(head)) return true;
  const last = lowerWords(head).pop() ?? '';
  if (IRREGULAR_PLURALS.has(last)) return true;
  return /^\p{Ll}/u.test(words(head).pop() ?? '') && /[^s]s$/.test(last) && !/(?:us|is|ss|ics|news)$/.test(last);
}

// "she will open the door" → "she opens the door": a when-clause takes the plain present, agreeing with its subject.
const SINGULAR_SUBJECT = /^(?:he|she|it|someone|somebody|everyone|everybody|nobody|something|nothing|everything|one)$/i;
function present(subject, verb) {
  const v = verb.toLowerCase();
  const plural = /^(?:i|you|we|they)$/i.test(subject) || (!SINGULAR_SUBJECT.test(subject) && isPlural(subject));
  if (v === 'be') return plural || /^i$/i.test(subject) ? 'are' : 'is';
  if (plural) return verb;
  if (v === 'have') return 'has';
  if (/(?:s|sh|ch|x|z|o)$/.test(v)) return `${verb}es`;
  if (/[^aeiou]y$/.test(v)) return `${verb.slice(0, -1)}ies`;
  return `${verb}s`;
}

/**
 * The span as the question says it. `lower`: the span began the writer's sentence and isn't a name ("Spiders live…").
 * "What kind of X?" takes the bare noun ("what kind of dog?"); the other noun slots point with "that" ("And where is that
 * wasteland?", "those holes"), keeping the writer's own words for names, counts and lists. Then first person becomes
 * second.
 */
export function saidAs(template, span, lower = false) {
  let s = lower ? span.replace(/^\p{Lu}/u, (c) => c.toLowerCase()) : span;
  s = s.replace(CLOSED, (m) => m.toLowerCase()).replace(/\b\p{Lu}{4,}\b/gu, (m) => m.toLowerCase());
  const slot = SLOTS[template];
  if (template === 'what_kind') s = s.replace(LEADING, '');
  else if (slot === 'thing' || (slot === 'any' && !WH.test(s))) {
    const list = /,|\s(?:and|or|&)\s/.test(s);
    const counted = QUANTITY.test(s);
    if (!list && !counted) {
      s = s.replace(/^(?:a|an)\s+(?=\p{Ll})/u, 'that ');
      if (words(s).length <= 3) s = s.replace(/^the\s+(?=\p{Ll})/u, 'that ');
      // A plain noun with nothing before it ("hedgehog", "fog") is pointed at too: "about that hedgehog".
      if (/^\p{Ll}/u.test(s) && !LEADING.test(s) && !PRONOUN.test(s) && !possessive(words(s)[0] ?? '') && !startsDoing(s)) s = `that ${s}`;
    }
    if (isPlural(s)) s = s.replace(/^that\s/, 'those ');
  } else if (slot === 'image') {
    s = s.replace(/^(?:A|An)\s/, (m) => m.toLowerCase());
  }
  if (template === 'when_then') {
    s = s.replace(/\b(\p{L}+)\s+(?:will|shall)\s+(\p{L}+)/gu, (m, subject, verb) => `${subject} ${present(subject, verb)}`)
      .replace(/\b(\p{L}+)['’]ll\s+(\p{L}+)/gu, (m, subject, verb) => `${subject} ${present(subject, verb)}`);
  }
  return toListener(s);
}

/** Fill a template with a span. Used by the page and by the server's voice, so only these questions are ever spoken. */
export function questionText(template, span, lower = false) {
  if (!TEMPLATES[template]) return null;
  const x = saidAs(template, span, lower);
  let text = TEMPLATES[template];
  // The verb agrees: "And where are those holes…?"; a past event asks what happened.
  if (template === 'where_is' && isPlural(x)) text = text.replace('where is', 'where are');
  if (template === 'when_then' && isPast(x)) text = text.replace('what happens', 'what happened');
  return text.replace('{X}', x);
}

/**
 * What would sound wrong aloud in a finished question: the last check before anything is shown or spoken. Every rule
 * here is a wording we have heard go wrong. An empty list means the question reads like a person asking it.
 */
// Words a question may say twice without sounding odd: the templates' own, and the small words that hold phrases together.
const TEMPLATE_WORDS = new Set([...words(Object.values(TEMPLATES).join(' ').toLowerCase()), 'that', 'this', 'those',
  'these', 'with', 'from', 'into', 'have', 'were', 'they', 'them', 'their', 'your', 'when', 'then', 'there', 'than', 'what']);
export function wordingProblems(text) {
  const p = [];
  if (!/^And [^?]+\?$/.test(text) || /\s{2,}|\s[?,]/.test(text)) p.push('spacing or punctuation');
  if (doubled(text)) p.push('a word said twice ("that that", "old old")');
  if (/\b(?:a|an|the|that|those|this|these|your|my|his|their|our)\s+(?:a|an|the|that|those|this|these|your|my|our|their)\b/i.test(text)) p.push('two determiners in a row');
  if (/\bkind of (?:a|an|the|that|those|this|these|your|my|his|her|their|our|some)\b/i.test(text) || /\bkind of \p{Lu}/u.test(text)) p.push('"what kind of" needs a plain noun');
  const said = lowerWords(text).filter((w) => w.length >= 4 && !TEMPLATE_WORDS.has(w));
  if (said.some((w, i) => said.indexOf(w) !== i)) p.push('a word said twice ("…kind of hedgehog is that hedgehog?")');
  if (/like what\?$/.test(text) && !/, like what\?$/.test(text)) p.push('textbook "that’s X like what?"');
  if (/\b(?:when|about|where is|where are) (?:who|what|why|where|how|whether)\b/i.test(text) && !/^And is there anything else about (?:who|what|why|where|how|whether)\b/i.test(text)) p.push('a question inside a question');
  if (/\bwhere (?:is|are|could) (?:lonely|quiet|sharp|cold|heavy)\b/i.test(text)) p.push('asks where a quality is');
  if (/\bis (?:those|these|you|they|we)\b|\bare (?:that|this|a|an|he|she|it)\b|\byou (?:is|was|has|does)\b|\b(?:he|she|it) (?:are|were|have)\b/i.test(text)) p.push('the verb does not agree');
  if (/\b(?:that|this) (?:children|people|men|women|mice|geese|feet|teeth)\b/i.test(text)) p.push('"that" before a plural');
  if (/\bwhen (?:he|she|it|someone|somebody|nobody) (?:open|go|find|come|make|take|see|run|walk|fall)\b/i.test(text)) p.push('the verb does not agree');
  if (/\b\p{Lu}{4,}\b/u.test(text)) p.push('shouting capitals');
  if (/[^.!?]\s(?:The|A|An|He|She|It|They|We|You|My|Our|Their|His|Her|This|That|Those|These|Someone|Nobody)\b/.test(text.slice(4))) p.push('a capital mid-question on a word that is not a name');
  if (words(text).length > MAX_QUESTION_WORDS) p.push('too long to say in one breath');
  return p;
}

// "the brass key" and "brass key" are the same thing to ask about.
const sameSpan = (a, b) => {
  const norm = (s) => s.trim().toLowerCase().replace(LEADING, '');
  return norm(a) === norm(b);
};

/** Labels the writer's words show are names, so "Mabel" at the start of a sentence keeps her capital. */
export const namesIn = (cards = []) => cards.filter((c) => ['person', 'place', 'name'].includes(c.kind)).map((c) => c.label);

/** Does the span begin a sentence with a word that isn't a name? Then the question says it in lower case. */
function lowerAt(transcript, start, span, names) {
  const first = (words(span)[0] ?? '').replace(/['’]s$/, '');
  if (!/^\p{Lu}/u.test(first) || /^I(?:['’]|$)/.test(first)) return false;
  // "Thimble Isle", "Hollow Isle": a run of capitals is a name.
  if (/^\p{Lu}/u.test(words(span)[1] ?? '')) return false;
  if (!/(?:^|[.!?…]["”’)]*\s+)$/.test(transcript.slice(0, start))) return false;
  if (TITLES.has(first) || names.some((n) => words(n).includes(first))) return false;
  // Capitalised again mid-sentence somewhere else: it's a name the cards missed.
  return !findAll(transcript, first).some((h) => /[^.!?…"”’\s]["”’]?\s+$/.test(transcript.slice(0, h.start)));
}

/**
 * Build one question, or null. The span must be the writer's exact words, and the question must not repeat an earlier
 * one in this conversation (`asked`: [{ template, span }]): no span is asked about twice, no template is used twice.
 * When the span doesn't fit the picked template's slot, or the finished question would sound wrong, the same words are
 * tried in the most generic question first ("And is there anything else about X?"), then the others.
 * `names`: card labels known to be names (see namesIn). The result says the span as the question does (`said`) and
 * whether it was lowered (`lower`), which the voice needs to say the same words.
 */
export function buildQuestion(transcript, pick, asked = [], { fallback = true, names = [] } = {}) {
  if (!pick) return null;
  const template = TEMPLATES[pick.template];
  const raw = String(pick.span ?? '').trim().replace(/[.,!?;:]+$/, '');
  const span = pick.template === 'what_kind' ? raw.replace(LEADING, '') : raw;
  if (!template || !span) return null;
  const hits = findAll(transcript, span);
  if (!hits.length || words(span).length > MAX_SPAN_WORDS) return null;
  if (asked.some((a) => sameSpan(a.span, span))) return null;
  const at = hits[hits.length - 1];
  // The model sometimes trims the writer's article ("sour expression" for "a sour expression"). Where the transcript has
  // one right before the span, it goes back in: the words are still exactly the writer's.
  let start = at.start;
  let full = span;
  if (pick.template !== 'what_kind' && SLOTS[pick.template] !== 'event' && /^\p{Ll}/u.test(span) && !LEADING.test(span)) {
    const article = transcript.slice(0, at.start).match(/(?:^|\s)((?:a|an|the|his|her|their|its|my|our|your) )$/i)?.[1];
    if (article) { start -= article.length; full = article + span; }
  }
  const lower = lowerAt(transcript, start, full, names);
  const asSaid = lower ? full.replace(/^\p{Lu}/u, (c) => c.toLowerCase()) : full;
  const used = asked.some((a) => a.template === pick.template);
  const text = !used && fits(pick.template, asSaid.replace(CLOSED, (m) => m.toLowerCase())) ? questionText(pick.template, full, lower) : null;
  if (!text || wordingProblems(text).length) {
    if (!fallback) return null;
    for (const t of ['anything_else', 'when_then', 'like_what', 'come_from']) {
      if (t === pick.template) continue;
      const q = buildQuestion(transcript, { template: t, span: raw }, asked, { fallback: false, names });
      if (q) return q;
    }
    return null;
  }
  return { template: pick.template, span: full, start, end: at.end, lower, said: saidAs(pick.template, full, lower), text };
}

/**
 * The question when no model picked one, preferring what the writer said most recently (at or after `from`): their own
 * open question first, then a place, then any other card. Never repeats a span.
 */
export function rulesQuestion(transcript, cards, asked = [], from = 0) {
  const recent = [...cards.filter((c) => c.start >= from), ...cards.filter((c) => c.start < from)];
  const names = namesIn(cards);
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
    const q = buildQuestion(transcript, p, asked, { names });
    if (q) return q;
  }
  return null;
}

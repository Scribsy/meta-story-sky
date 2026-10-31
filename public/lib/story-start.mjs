// A "story start": everything one Story Sky run produced, in a form another app can import (see docs/STORY-START.md).
// The page builds it; the server checks it again before keeping it, so every card still quotes the writer exactly.
// Runs unchanged in the browser and in Node.

export const FORMAT = 'story-start';
export const VERSION = 1;
const KINDS = new Set(['person', 'place', 'thing', 'name', 'question']);
const MAX_IMAGE = 4 * 1024 * 1024;

/**
 * From the page's run: rounds [{ answer, transcribedBy, question }], every card shown, the keys of the kept ones, the sky.
 * The transcript is the answers joined as the page joins them, so the cards' offsets point into it.
 */
export function buildStoryStart({ rounds, cards, kept, sky, keyOf }) {
  return {
    format: FORMAT,
    version: VERSION,
    createdAt: new Date().toISOString(),
    producer: { app: 'Story Sky', source: 'https://github.com/Scribsy/meta-story-sky' },
    transcript: rounds.map((r) => r.answer).join('\n\n'),
    rounds: rounds.map((r) => ({ question: r.question?.text ?? null, answer: r.answer, transcribedBy: r.transcribedBy ?? null })),
    cards: cards.map((c) => ({ kind: c.kind, label: c.label, quote: c.quote, start: c.start, end: c.end, clue: c.clue || null, kept: kept.has(keyOf(c)) })),
    sky: sky?.image ? { image: sky.image, model: sky.model ?? null, painted: sky.painted ?? 'words' } : null,
  };
}

const str = (v, max) => (typeof v === 'string' ? v.slice(0, max) : null);

/**
 * Checks a story start and returns a clean copy, or throws. Unknown fields are dropped; a card whose quote is not
 * exactly at its offsets in the transcript is dropped too, so nothing imported claims words the writer didn't say.
 */
export function checkStoryStart(input) {
  if (!input || input.format !== FORMAT || input.version !== VERSION) throw new Error('Not a story start.');
  const transcript = str(input.transcript, 50_000);
  if (!transcript) throw new Error('A story start needs a transcript.');
  const rounds = (Array.isArray(input.rounds) ? input.rounds : []).slice(0, 12).map((r) => ({
    question: str(r?.question, 300), answer: str(r?.answer, 20_000) ?? '', transcribedBy: str(r?.transcribedBy, 120),
  }));
  const cards = (Array.isArray(input.cards) ? input.cards : []).slice(0, 60).filter((c) =>
    KINDS.has(c?.kind) && typeof c.quote === 'string' && Number.isInteger(c.start) && Number.isInteger(c.end)
    && transcript.slice(c.start, c.end) === c.quote && typeof c.label === 'string' && c.quote.includes(c.label),
  ).map((c) => ({ kind: c.kind, label: c.label.slice(0, 200), quote: c.quote, start: c.start, end: c.end, clue: str(c.clue, 300), kept: c.kept === true }));
  let sky = null;
  const image = input.sky?.image;
  if (typeof image === 'string' && /^data:image\/(?:png|webp|jpeg);base64,/.test(image) && image.length <= MAX_IMAGE) {
    sky = { image, model: str(input.sky.model, 60), painted: ['words', 'hints', 'none'].includes(input.sky.painted) ? input.sky.painted : 'words' };
  }
  return { format: FORMAT, version: VERSION, createdAt: str(input.createdAt, 40), producer: { app: 'Story Sky', source: 'https://github.com/Scribsy/meta-story-sky' }, transcript, rounds, cards, sky };
}

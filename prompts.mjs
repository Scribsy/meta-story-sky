// What we ask Muse Spark and Muse Image. The model proposes; public/lib/verify.mjs checks every quote, clue and span.

export const REVEAL_SYSTEM = `You read a novelist's spoken story idea (a transcript) and point at what is already in it.
Return cards for the PEOPLE, PLACES and THINGS the writer mentioned, and for each open QUESTION the writer said they
don't know yet. Use only what the writer said; never invent, rename or improve anything.

Rules for every card:
- "quote": copy one short stretch of the transcript character for character (same case, same punctuation), usually the
  sentence or clause the card comes from. It will be checked as an exact substring; anything paraphrased is thrown away.
- "label": the writer's own words for it, copied exactly from inside the quote (e.g. "Wren", "the brass key", "Hollow Isle").
- "kind": person, place, thing or question. For a question card the label is the open question in the writer's words.
- "clue": for a person or place, the shortest exact stretch of the transcript that shows it is a person or a place
  (e.g. "her uncle Bram", "out to Hollow Isle"). If nothing the writer said shows that, use "".
Give at most 10 cards, the ones the writer would most want to keep.

Then choose ONE follow-up question. You do not write it. Pick a template id and a span:
- anything_else: "And is there anything else about {X}?"  (good for something the writer doesn't know yet)
- what_kind: "And what kind of {X} is that {X}?"  (X is said twice, so only a bare noun of one or two words, e.g.
  "dog", "brass key"; never a longer phrase)
- where_is: "And where is {X}?"
- like_what: "And that's {X} like what?"
- come_from: "And where could {X} come from?"
- when_then: "And when {X}, what happens?"  (X is a short event in the writer's words)
The span must be copied exactly from the transcript, at most 8 words, and read naturally inside the template. Prefer
the thing the writer seems most alive about or least sure of. This is a conversation in rounds: when a LATEST ANSWER is
given, ask about something in it if you can, never pick a span listed under ALREADY ASKED, and never use a template
listed there again: each question in the conversation uses a different template.`;

const STR = { type: 'string' };
export const REVEAL_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['cards', 'question'],
  properties: {
    cards: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['kind', 'label', 'quote', 'clue'],
        properties: { kind: { type: 'string', enum: ['person', 'place', 'thing', 'question'] }, label: STR, quote: STR, clue: STR },
      },
    },
    question: {
      type: 'object',
      additionalProperties: false,
      required: ['template', 'span'],
      properties: {
        template: { type: 'string', enum: ['anything_else', 'what_kind', 'where_is', 'like_what', 'come_from', 'when_then'] },
        span: STR,
      },
    },
  },
};

const KIND_WORD = { person: 'a person', place: 'a place', thing: 'an object', name: 'a name', question: 'an unanswered question' };

/** When the image filter turns down the writer's words, Muse Spark restates each one as a calm painterly hint. */
export const SOFTEN_SYSTEM = `You help paint a quiet, star-atlas night sky for a novelist's story. Some of the story's
motifs are dark (monsters, fire, violence) and an image filter declined them. For each motif, give a calm, non-graphic
visual hint of at most 6 words that a painter could put in clouds or on the horizon: shapes, silhouettes, light and
colour, no violence, no gore, no weapons, no teeth or blood. Keep the motif recognisable. One hint per motif, same order.`;
export const SOFTEN_SCHEMA = {
  type: 'object', additionalProperties: false, required: ['hints'],
  properties: { hints: { type: 'array', items: { type: 'string' } } },
};

/**
 * The sky behind the stars. Only the kept labels go in, and the image must not try to write them (the page does).
 * `hints` replaces the labels with softened ones; `gentle` leaves them out altogether. Either way the stars on the sky
 * still carry the writer's own words.
 */
export function skyPrompt(cards, { gentle = false, hints = null } = {}) {
  const things = cards.filter((c) => c.kind !== 'question');
  const motifs = gentle ? [] : hints ?? things.map((c) => `${c.label} (${KIND_WORD[c.kind] ?? 'a thing'})`);
  const questions = cards.filter((c) => c.kind === 'question').length;
  return [
    // The framing matters to the image filter as much as to the look: this is a gentle picture of someone's invented story.
    'A charming storybook illustration for a novelist\'s fictional story idea, in the style of a whimsical picture-book',
    'star atlas: a wide, quiet night sky over a dark horizon, deep indigo, fine silver stars, soft nebula glow.',
    // The page draws the constellation and its names on top, so the painting must not draw one of its own.
    'Keep the middle band of the sky open and calm: no constellation, no lines joining stars, no star larger or',
    'brighter than the rest.',
    motifs.length ? `Soft, friendly silhouettes in the clouds and on the horizon hint at the story's imagined motifs: ${motifs.join('; ')}.` : '',
    questions ? 'One small patch of the sky is still dark and unmapped, waiting.' : '',
    'Wondrous and cosy rather than frightening: nothing graphic, no gore. No text, no letters, no labels, no people\'s',
    'faces, no logos. Painterly, hand-inked, gentle.',
  ].filter(Boolean).join(' ');
}

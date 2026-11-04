import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildQuestion, clueKind, findAll, rulesQuestion, verifyCards } from '../public/lib/verify.mjs';
import { missedNames, spot } from '../public/lib/spot.mjs';

const S1 = 'Wren runs the night ferry to Hollow Isle.';
const S2 = 'Her uncle Bram sold the old bell and moved to Mount Ash.';
const S3 = 'Inspector Calloway keeps asking about the brass key.';
const S4 = 'I don\'t know yet who rang the bell the night Bram left.';
const T = [S1, S2, S3, S4].join(' ');

test('findAll returns exact offsets', () => {
  assert.deepEqual(findAll(T, 'Hollow Isle'), [{ start: 29, end: 40 }]);
  assert.equal(findAll(T, 'hollow isle').length, 0);
});

test('a card whose quote is not in the transcript is dropped', () => {
  const { cards, dropped } = verifyCards(T, [
    { kind: 'thing', label: 'the night ferry', quote: S1 },
    { kind: 'thing', label: 'the ferry', quote: 'Wren runs the ferry out to the island.' },
  ]);
  assert.equal(cards.length, 1);
  assert.equal(cards[0].start, 0);
  assert.equal(dropped[0].reason, 'quote is not in the transcript');
});

test('a label outside its quote is dropped', () => {
  const { dropped } = verifyCards(T, [{ kind: 'thing', label: 'the lantern', quote: S3 }]);
  assert.equal(dropped[0].reason, 'label is not inside its quote');
});

test('a name with no clue is a neutral Name card', () => {
  const { cards } = verifyCards(T, [{ kind: 'person', label: 'Wren', quote: S1, clue: '' }]);
  assert.equal(cards[0].kind, 'name');
  assert.equal(cards[0].kindSource, 'rule');
});

test('a clue the writer said keeps person or place', () => {
  const { cards } = verifyCards(T, [
    { kind: 'person', label: 'Bram', quote: S2, clue: 'Her uncle Bram' },
    { kind: 'place', label: 'Hollow Isle', quote: S1, clue: 'ferry to Hollow Isle' },
    { kind: 'person', label: 'Inspector Calloway', quote: S3, clue: '' },
    { kind: 'person', label: 'Mount Ash', quote: S2, clue: 'moved to Mount Ash' },
  ]);
  assert.deepEqual(cards.map((c) => c.kind), ['person', 'place', 'person', 'place']);
});

test('an invented clue does not count', () => {
  const { cards } = verifyCards(T, [{ kind: 'person', label: 'Wren', quote: S1, clue: 'she is Wren' }]);
  assert.equal(cards[0].kind, 'name');
  assert.equal(cards[0].clue, '');
});

test('a whole-answer quote is cut to the sentence holding the label, still exact', () => {
  const { cards } = verifyCards(T, [{ kind: 'thing', label: 'the brass key', quote: T, clue: '' }]);
  assert.equal(cards[0].quote, S3);
  assert.equal(T.slice(cards[0].start, cards[0].end), S3);
  const short = verifyCards(T, [{ kind: 'thing', label: 'the brass key', quote: S3, clue: '' }]).cards[0];
  assert.equal(short.quote, S3);
  const long = `On the ${'very '.repeat(30)}last night, by the ferry, Wren found the brass key, and she kept it.`;
  const clause = verifyCards(long, [{ kind: 'thing', label: 'the brass key', quote: long, clue: '' }]).cards[0];
  assert.equal(clause.quote, 'Wren found the brass key,');
  assert.equal(long.slice(clause.start, clause.end), clause.quote);
});

test('clueKind reads prepositions and person words', () => {
  assert.equal(clueKind('Ash', 'to Ash'), 'place');
  assert.equal(clueKind('Wren', 'Wren and her dog'), 'person');
  assert.equal(clueKind('Wren', 'Wren runs the night ferry'), null);
  assert.equal(clueKind('Squire Trelawney', ''), 'person');
  assert.equal(clueKind('the Admiral Benbow Inn', ''), 'place');
});

test('the question is a fixed template around the writer\'s exact span', () => {
  const q = buildQuestion(T, { template: 'anything_else', span: 'the brass key' });
  assert.equal(q.text, 'And is there anything else about that brass key?');
  assert.equal(T.slice(q.start, q.end), 'the brass key');
  assert.equal(buildQuestion(T, { template: 'what_kind', span: 'bell' }).text, 'And what kind of bell?');
  assert.equal(buildQuestion(T, { template: 'anything_else', span: 'the silver key' }), null);
  assert.equal(buildQuestion(T, { template: 'tell_me_more', span: 'the bell' }), null);
  // A long span never goes into "what kind of": the same words are asked about with a template that says them once.
  assert.equal(buildQuestion(T, { template: 'what_kind', span: 'who rang the bell the night' }).text,
    'And is there anything else about who rang the bell the night?');
  const mind = 'She hides in a virtual mind space.';
  assert.equal(buildQuestion(mind, { template: 'what_kind', span: 'virtual mind space' }).text,
    'And is there anything else about that virtual mind space?');
  assert.equal(buildQuestion(mind, { template: 'what_kind', span: 'virtual mind space' }, [{ template: 'anything_else', span: 'She' }]).text,
    'And a virtual mind space, like what?');
  assert.equal(buildQuestion(mind, { template: 'what_kind', span: 'mind space' }).text, 'And what kind of mind space?');
});

test('rules spot names, places and the open question', () => {
  const got = spot(T).map((c) => `${c.kind}:${c.label}`);
  for (const want of ['name:Wren', 'place:Hollow Isle', 'name:Bram', 'place:Mount Ash', 'person:Inspector Calloway']) {
    assert.ok(got.includes(want), want);
  }
  assert.ok(got.some((g) => g.startsWith('question:I don\'t know yet')));
  for (const c of spot(T)) assert.equal(T.slice(c.start, c.end), c.quote);
});

test('missedNames adds only what the model did not cover', () => {
  const model = [{ label: 'Wren' }, { label: 'Hollow Isle' }, { label: 'Bram' }, { label: 'Mount Ash' }];
  assert.deepEqual(missedNames(T, model).map((c) => c.label), ['Inspector Calloway']);
});

test('rulesQuestion asks about the writer\'s own open question first', () => {
  assert.equal(rulesQuestion(T, spot(T)).text, 'And is there anything else about who rang the bell?');
});

test('no span is asked about twice', () => {
  const asked = [{ template: 'anything_else', span: 'the brass key' }];
  assert.equal(buildQuestion(T, { template: 'what_kind', span: 'the brass key' }, asked), null);
  assert.ok(buildQuestion(T, { template: 'where_is', span: 'Hollow Isle' }, asked));
});

test('"what kind of" takes the bare noun, still the writer\'s exact words', async () => {
  const { questionText } = await import('../public/lib/verify.mjs');
  const t = 'A boy and a dog walking through the wasteland. His dog limps.';
  const q = buildQuestion(t, { template: 'what_kind', span: 'a dog' });
  assert.equal(q.text, 'And what kind of dog?');
  assert.equal(t.slice(q.start, q.end), 'dog');
  assert.equal(buildQuestion(t, { template: 'what_kind', span: 'His dog' }).text, 'And what kind of dog?');
  assert.equal(questionText('what_kind', 'the wasteland'), 'And what kind of wasteland?');
  assert.equal(questionText('like_what', 'a dog'), 'And a dog, like what?');
});

test('no template is used twice in a run, and the rules pick another', () => {
  const asked = [{ template: 'like_what', span: 'the night ferry' }];
  assert.equal(buildQuestion(T, { template: 'like_what', span: 'the brass key' }, asked).template, 'anything_else');
  const q = rulesQuestion(T, spot(T), [{ template: 'anything_else', span: 'who rang the bell' }], T.indexOf(S3));
  assert.notEqual(q.template, 'anything_else');
});

test('rulesQuestion prefers the latest answer and skips what was asked', () => {
  const from = T.indexOf(S3);
  const q = rulesQuestion(T, spot(T), [{ template: 'anything_else', span: 'who rang the bell' }], from);
  assert.equal(q.span, 'Inspector Calloway');
});

test('questionText only fills known templates', async () => {
  const { questionText } = await import('../public/lib/verify.mjs');
  assert.equal(questionText('where_is', 'Hollow Isle'), 'And where is Hollow Isle?');
  assert.equal(questionText('say_anything', 'hi'), null);
});

test('star names never overlap each other, even when the stars crowd together', async () => {
  const { placeLabels, textWidth } = await import('../public/lib/layout.mjs');
  const names = ['A boy', 'his dog', 'the central United States', 'an apocalyptic wasteland', 'holes', 'monsters',
    'four-headed spiders', 'fire breathing dragons', 'Another dimension or anoth…', 'snakes the size of a bus'];
  const W = 1792; const H = 1024; const fs = 34;
  const stars = names.map((text, i) => ({ x: 220 + (i / 9) * (W - 440), y: H * 0.44 + Math.sin(i) * 120 + (i % 2 ? 72 : -72), r: 11, text }));
  const spots = placeLabels(stars, { W, H, fs });
  const boxes = spots.map((s, i) => {
    const w = textWidth(names[i], fs);
    const x1 = s.anchor === 'start' ? s.x : s.anchor === 'end' ? s.x - w : s.x - w / 2;
    return { x1, x2: x1 + w, y1: s.y - fs * 0.8, y2: s.y + fs * 0.25 };
  });
  for (let i = 0; i < boxes.length; i++) {
    const a = boxes[i];
    assert.ok(a.x1 >= 0 && a.x2 <= W && a.y1 >= 0 && a.y2 <= H, `${names[i]} stays inside the sky`);
    for (let j = i + 1; j < boxes.length; j++) {
      const b = boxes[j];
      const hit = a.x1 < b.x2 && b.x1 < a.x2 && a.y1 < b.y2 && b.y1 < a.y2;
      assert.ok(!hit, `${names[i]} overlaps ${names[j]}`);
    }
  }
});

test('the writer\'s words come back from the listener\'s side, and "a" points as "that"', async () => {
  const { questionText } = await import('../public/lib/verify.mjs');
  assert.equal(questionText('come_from', 'my father'), 'And where could your father come from?');
  assert.equal(questionText('when_then', 'I am alone'), 'And when you are alone, what happens?');
  assert.equal(questionText('when_then', "I'm lost in our house"), 'And when you’re lost in your house, what happens?');
  assert.equal(questionText('where_is', 'an apocalyptic wasteland'), 'And where is that apocalyptic wasteland?');
  assert.equal(questionText('anything_else', 'the rest of these gentlemen'), 'And is there anything else about the rest of these gentlemen?');
  assert.equal(questionText('like_what', 'a dog'), 'And a dog, like what?');
  assert.equal(questionText('anything_else', 'who rang the bell'), 'And is there anything else about who rang the bell?');
});

test('a span that doesn\'t fit its slot moves to a template it does fit', async () => {
  const { fits } = await import('../public/lib/verify.mjs');
  assert.equal(fits('when_then', 'the boy'), false, 'an event slot needs something happening');
  assert.equal(fits('when_then', 'he absorbs powers'), true);
  assert.equal(fits('when_then', 'walking through the wasteland'), true);
  assert.equal(fits('where_is', 'he absorbs powers'), false, 'a thing slot takes no clause');
  assert.equal(fits('anything_else', 'holes in the'), false, 'a span that stops mid-phrase fits nowhere');
  const t = 'The boy fights. In one of the fights he absorbs powers he doesn\'t understand.';
  assert.equal(buildQuestion(t, { template: 'where_is', span: 'he absorbs powers' }).text, 'And when he absorbs powers, what happens?');
  assert.equal(buildQuestion(t, { template: 'when_then', span: 'The boy' }).text, 'And is there anything else about that boy?');
});

test('plurals agree, trimmed articles come back, and a when-clause takes the plain present', async () => {
  const { questionText } = await import('../public/lib/verify.mjs');
  assert.equal(questionText('where_is', 'holes in the fabric of reality'), 'And where are those holes in the fabric of reality?');
  assert.equal(questionText('where_is', 'the great Kansas prairies'), 'And where are the great Kansas prairies?');
  assert.equal(questionText('what_kind', 'spiders'), 'And what kind of spiders?');
  assert.equal(questionText('where_is', 'Misselthwaite Manor'), 'And where is Misselthwaite Manor?');
  assert.equal(questionText('when_then', 'they will grow up'), 'And when they grow up, what happens?');
  const t = 'She had a little thin face and a sour expression.';
  const q = buildQuestion(t, { template: 'like_what', span: 'sour expression' });
  assert.equal(q.text, 'And a sour expression, like what?');
  assert.equal(t.slice(q.start, q.end), 'a sour expression');
});

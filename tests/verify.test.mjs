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

test('clueKind reads prepositions and person words', () => {
  assert.equal(clueKind('Ash', 'to Ash'), 'place');
  assert.equal(clueKind('Wren', 'Wren and her dog'), 'person');
  assert.equal(clueKind('Wren', 'Wren runs the night ferry'), null);
});

test('the question is a fixed template around the writer\'s exact span', () => {
  const q = buildQuestion(T, { template: 'anything_else', span: 'the brass key' });
  assert.equal(q.text, 'And is there anything else about the brass key?');
  assert.equal(T.slice(q.start, q.end), 'the brass key');
  assert.equal(buildQuestion(T, { template: 'what_kind', span: 'bell' }).text, 'And what kind of bell is that bell?');
  assert.equal(buildQuestion(T, { template: 'anything_else', span: 'the silver key' }), null);
  assert.equal(buildQuestion(T, { template: 'tell_me_more', span: 'the bell' }), null);
  assert.equal(buildQuestion(T, { template: 'what_kind', span: 'who rang the bell the night' }), null);
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

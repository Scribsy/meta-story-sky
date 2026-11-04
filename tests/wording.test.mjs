// How the questions sound, across a wide range of things a writer might say (tests/wording-corpus.mjs). Every question
// the builder can make from the corpus, in every template, must pass the wording check, point at the writer's exact
// words, and be the same question the voice would speak.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildQuestion, namesIn, questionText, TEMPLATES, wordingProblems } from '../public/lib/verify.mjs';
import { spot } from '../public/lib/spot.mjs';
import { CORPUS } from './wording-corpus.mjs';

// The names Muse Spark marks as people or places in the corpus. The rules alone (spot) also call any capitalised word that
// starts a sentence a name ("Spiders live…"); both kinds of names are checked below.
const NAMES = ['Pip', 'Mabel', 'Hollow Isle', 'Inspector Calloway', 'Paris', 'Thames', 'Thimble Isle', 'Dr. Okafor'];
const build = (t, template, span, fallback = false, names = NAMES) => buildQuestion(t, { template, span }, [], { fallback, names });

test('every question from the corpus reads cleanly, points at the writer\'s words, and is what the voice says', () => {
  let made = 0;
  for (const [t, span] of CORPUS) {
    for (const template of Object.keys(TEMPLATES)) for (const names of [NAMES, namesIn(spot(t))]) {
      const q = build(t, template, span, false, names);
      if (!q) continue;
      made++;
      const where = `${template} / "${span}" → "${q.text}"`;
      assert.deepEqual(wordingProblems(q.text), [], where);
      assert.equal(t.slice(q.start, q.end), q.span, where);
      assert.ok(q.text.includes(q.said), `${where}: the highlighted words "${q.said}" are not in the question`);
      assert.equal(questionText(q.template, q.span, q.lower), q.text, `${where}: the voice would say something else`);
    }
  }
  assert.ok(made > 250, `only ${made} questions made`);
});

test('almost every span gets a question in some template', () => {
  // A doubled word from the transcription and a bare pronoun are better left alone.
  const leftAlone = new Set(['old old hedgehog', 'Something', 'It']);
  for (const [t, span] of CORPUS) {
    const got = Object.keys(TEMPLATES).some((template) => build(t, template, span, true));
    assert.equal(got, !leftAlone.has(span), `"${span}"`);
  }
});

// Read and approved by ear. If one of these changes, read the new wording aloud before updating it.
const HEARD = [
  ['A tiny hedgehog named Pip keeps the light.', 'hedgehog', 'what_kind', 'And what kind of hedgehog?'],
  ['There was a dog by the door.', 'a dog', 'what_kind', 'And what kind of dog?'],
  ['His dog limps.', 'His dog', 'what_kind', 'And what kind of dog?'],
  ['Spiders live in the walls.', 'Spiders', 'what_kind', 'And what kind of spiders?'],
  ['Mabel sings back from past the fog.', 'Mabel', 'what_kind', 'And is there anything else about Mabel?'],
  ['She found the brass key under the stairs.', 'the brass key', 'anything_else', 'And is there anything else about that brass key?'],
  ['A tiny hedgehog named Pip keeps the light.', 'hedgehog', 'anything_else', 'And is there anything else about that hedgehog?'],
  ['The children never sleep.', 'The children', 'anything_else', 'And is there anything else about those children?'],
  ['My father built the boat.', 'My father', 'anything_else', 'And is there anything else about your father?'],
  ['I don\'t know yet who leaves it.', 'who leaves it', 'anything_else', 'And is there anything else about who leaves it?'],
  ['Me and my sister found it.', 'Me and my sister', 'where_is', 'And where are you and your sister?'],
  ['THE MACHINE never stops.', 'THE MACHINE', 'where_is', 'And where is that machine?'],
  ['She took the ferry to Hollow Isle.', 'Hollow Isle', 'where_is', 'And where is Hollow Isle?'],
  ['There are holes in the fabric of the sky.', 'holes in the fabric of the sky', 'where_is', 'And where are those holes in the fabric of the sky?'],
  ['Twelve ravens guard the tower.', 'Twelve ravens', 'where_is', 'And where are twelve ravens?'],
  ['Fog rolls in every evening.', 'Fog', 'come_from', 'And where could that fog come from?'],
  ['She’s kept the light for a hundred winters.', 'a hundred winters', 'come_from', 'And where could a hundred winters come from?'],
  ['A boy and a dog walking through the wasteland.', 'A boy and a dog', 'come_from', 'And where could a boy and a dog come from?'],
  ['Pip\'s scarf is striped.', 'Pip\'s scarf', 'come_from', 'And where could Pip\'s scarf come from?'],
  ['Her voice was razor sharp.', 'razor sharp', 'like_what', 'And razor sharp, like what?'],
  ['He has nightmares about the sea.', 'nightmares', 'like_what', 'And nightmares, like what?'],
  ['It was like a held breath.', 'a held breath', 'like_what', 'And a held breath, like what?'],
  ['Every night she lights the lamp.', 'she lights the lamp', 'when_then', 'And when she lights the lamp, what happens?'],
  ['He absorbs powers from anyone he touches.', 'He absorbs powers', 'when_then', 'And when he absorbs powers, what happens?'],
  ['She will open the door at midnight.', 'She will open the door', 'when_then', 'And when she opens the door, what happens?'],
  ['They\'ll find the map eventually.', 'They\'ll find the map', 'when_then', 'And when they find the map, what happens?'],
  ['I\'m lost.', 'I\'m lost', 'when_then', 'And when you’re lost, what happens?'],
  ['The king died.', 'The king died', 'when_then', 'And when the king died, what happened?'],
  ['The tide went out and never came back.', 'The tide went out', 'when_then', 'And when the tide went out, what happened?'],
  ['I wake up in a different room every day.', 'I wake up in a different room', 'when_then', 'And when you wake up in a different room, what happens?'],
  // Misfits fall back to a plainer question rather than say something odd.
  ['The tide went out and never came back.', 'The tide went out', 'anything_else', 'And when the tide went out, what happened?'],
  ['Her voice was razor sharp.', 'razor sharp', 'where_is', 'And razor sharp, like what?'],
  ['I don\'t know yet who leaves it.', 'who leaves it', 'when_then', 'And is there anything else about who leaves it?'],
  ['There is a door in the hill.', 'a door in the hill', 'what_kind', 'And is there anything else about that door in the hill?'],
];

test('the wordings we have read aloud stay as heard', () => {
  for (const [t, span, template, want] of HEARD) assert.equal(build(t, template, span, true)?.text, want, `${template} / "${span}"`);
});

test('the wording check catches every phrasing that has gone wrong before', () => {
  for (const bad of [
    'And what kind of hedgehog is that hedgehog?',
    'And what kind of a dog is that a dog?',
    'And what kind of Mabel?',
    'And what kind of Twelve ravens?',
    'And where is lonely?',
    'And when who leaves it, what happens?',
    'And is there anything else about that children?',
    'And when She open the door, what happens?',
    'And where is you and your sister?',
    'And that’s that boy like what?',
    'And is there anything else about THE MACHINE?',
    'And where could that that boy come from?',
    'And is there anything else about old old hedgehog?',
  ]) assert.notDeepEqual(wordingProblems(bad), [], bad);
});

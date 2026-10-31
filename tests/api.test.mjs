import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createApi } from '../api.mjs';

const meter = { allow: async () => null, charge: async () => {}, speak: async () => null, spoken: async () => {}, claim: async () => null, totals: async () => ({ spent: 0 }) };
const call = (api, path, code, method = 'POST') => api(new Request(`http://x${path}`, {
  method, headers: code ? { 'x-access-code': code } : {}, body: method === 'POST' ? '{}' : undefined }));

test('with an access code set, billed calls need it, and status says so', async () => {
  const api = createApi({ ACCESS_CODE: 'stars' }, meter);
  assert.deepEqual(await (await call(api, '/api/status', '', 'GET')).json(), (await (await call(api, '/api/status', 'nope', 'GET')).json()));
  const locked = await (await call(api, '/api/status', '', 'GET')).json();
  assert.equal(locked.gated, true);
  assert.equal(locked.unlocked, false);
  assert.equal((await call(api, '/api/reveal', '')).status, 401);
  assert.equal((await call(api, '/api/reveal', 'star')).status, 401);
  assert.equal((await call(api, '/api/reveal', 'stars')).status, 503, 'unlocked, but no Meta key here');
  assert.equal(await call(api, '/index.html', ''), null, 'not an API path: the caller serves it');
});

test('a refusal from the meter stops the call before any model is reached', async () => {
  const api = createApi({ META_MODEL_API_KEY: 'not-used' }, { ...meter, allow: async () => 'Budget used up.' });
  const res = await call(api, '/api/reveal', '');
  assert.equal(res.status, 429);
  assert.equal((await res.json()).error, 'Budget used up.');
});

test('the hand-off to Scribsy is off unless configured, checks the story, and gives it up once, to Scribsy only', async () => {
  const { buildStoryStart } = await import('../public/lib/story-start.mjs');
  const mem = new Map();
  const store = { put: async (id, t) => { mem.set(id, t); }, take: async (id) => { const t = mem.get(id) ?? null; mem.delete(id); return t; } };
  const post = (api, body) => api(new Request('http://x/api/claim', { method: 'POST', body: JSON.stringify(body) }));
  const get = (api, id, token) => api(new Request(`http://x/api/claim/${id}`, { headers: token ? { 'x-claim-token': token } : {} }));

  const off = createApi({}, meter, store);
  assert.equal((await (await call(off, '/api/status', '', 'GET')).json()).claim, false);
  assert.equal((await post(off, {})).status, 404);

  const api = createApi({ SCRIBSY_IMPORT_URL: 'https://app.example/import', CLAIM_READ_TOKEN: 'tok' }, meter, store);
  assert.equal((await (await call(api, '/api/status', '', 'GET')).json()).claim, true);
  const transcript = 'Wren runs the night ferry to Hollow Isle.';
  const keyOf = (c) => `${c.kind}:${c.label}`;
  const cards = [
    { kind: 'name', label: 'Wren', quote: 'Wren runs the night ferry', start: 0, end: 25, clue: '' },
    { kind: 'place', label: 'Hollow Isle', quote: 'to Hollow Isle', start: 26, end: 40, clue: 'to Hollow Isle' },
    { kind: 'thing', label: 'the brass key', quote: 'the brass key', start: 0, end: 13 }, // not what the writer said there
  ];
  const story = buildStoryStart({ rounds: [{ answer: transcript, transcribedBy: 'typed' }], cards, kept: new Set(['place:Hollow Isle']), sky: null, keyOf });
  const made = await (await post(api, story)).json();
  assert.match(made.url, /^https:\/\/app\.example\/import\?claim=[a-z2-7]{26}$/);
  assert.equal(made.cards, 2, 'a card whose quote is not at its offsets is dropped');
  assert.equal((await post(api, { format: 'nope' })).status, 400);

  assert.equal((await get(api, made.id, '')).status, 404, 'no token, no story');
  assert.equal((await get(api, made.id, 'wrong')).status, 404);
  const got = await (await get(api, made.id, 'tok')).json();
  assert.deepEqual(got.cards.map((c) => [c.label, c.kept]), [['Wren', false], ['Hollow Isle', true]]);
  assert.equal((await get(api, made.id, 'tok')).status, 404, 'collected once, then gone');
});

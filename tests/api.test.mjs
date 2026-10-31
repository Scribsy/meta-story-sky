import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createApi } from '../api.mjs';

const meter = { allow: async () => null, charge: async () => {}, speak: async () => null, spoken: async () => {}, totals: async () => ({ spent: 0 }) };
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

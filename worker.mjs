// Story Sky on Cloudflare: the page is served as static assets, and /api/* runs the same API as the local server
// (api.mjs) behind an access code. Anyone can open the page and play the recorded run; the live Meta models and the
// voice need the code. One Durable Object keeps the money: a daily Meta spend cap, a daily voice cap and an hourly limit
// per visitor, all of which survive restarts.
import { DurableObject } from 'cloudflare:workers';
import { createApi } from './api.mjs';

const day = () => new Date().toISOString().slice(0, 10);
const hour = () => new Date().toISOString().slice(0, 13);

export class Meter extends DurableObject {
  constructor(ctx, env) {
    super(ctx, env);
    this.cap = Number(env.DAILY_CAP_USD ?? 5);
    this.charCap = Number(env.DAILY_VOICE_CHARS ?? 6000);
    this.perIp = Number(env.HOURLY_CALLS_PER_IP ?? 60);
  }

  async #get(key) { return (await this.ctx.storage.get(key)) ?? 0; }
  async #add(key, n) { const v = (await this.#get(key)) + n; await this.ctx.storage.put(key, v); return v; }

  /** Refuses a billed call once today's spend is at the cap, or once this visitor has made too many calls this hour. */
  async allow(ip) {
    if (!(await this.ctx.storage.getAlarm())) await this.ctx.storage.setAlarm(Date.now() + 864e5);
    if ((await this.#get(`usd:${day()}`)) >= this.cap) return `Today's live budget of $${this.cap} is used up. The recorded run still plays.`;
    if ((await this.#add(`ip:${hour()}:${ip}`, 1)) > this.perIp) return 'Too many live calls from here this hour. The recorded run still plays.';
    return null;
  }
  async charge(usd, what) {
    const total = await this.#add(`usd:${day()}`, usd);
    console.log(`[story-sky] ${what} $${usd.toFixed(5)} today $${total.toFixed(4)}`);
  }
  async speak(chars) {
    return (await this.#get(`chars:${day()}`)) + chars > this.charCap ? 'Today\'s voice budget is used up: questions are shown, not spoken.' : null;
  }
  async spoken(chars) { await this.#add(`chars:${day()}`, chars); }
  /** Story starts kept for Scribsy: a few an hour per visitor is plenty for a person and useless for flooding. */
  async claim(ip) {
    return (await this.#add(`claim:${hour()}:${ip}`, 1)) > 10 ? 'Too many stories kept from here this hour.' : null;
  }
  async totals() {
    return { spent: Number((await this.#get(`usd:${day()}`)).toFixed(4)), cap: this.cap, spokenChars: await this.#get(`chars:${day()}`) };
  }
  /** Old days and hours are deleted once a day, so storage stays a handful of keys. */
  async alarm() {
    const keep = [day(), hour()];
    const all = await this.ctx.storage.list();
    await this.ctx.storage.delete([...all.keys()].filter((k) => !keep.some((t) => k.includes(t))));
    await this.ctx.storage.setAlarm(Date.now() + 864e5);
  }
}

export default {
  async fetch(request, env) {
    const stub = env.METER.get(env.METER.idFromName('story-sky'));
    const meter = {
      allow: (ip) => stub.allow(ip),
      charge: (usd, what) => stub.charge(usd, what),
      speak: (chars) => stub.speak(chars),
      spoken: (chars) => stub.spoken(chars),
      claim: (ip) => stub.claim(ip),
      totals: () => stub.totals(),
    };
    // Claimed story starts live in KV, which deletes each one after its day on its own.
    const store = env.CLAIMS ? {
      put: (id, text, ttl) => env.CLAIMS.put(id, text, { expirationTtl: ttl }),
      take: async (id) => { const text = await env.CLAIMS.get(id); if (text) await env.CLAIMS.delete(id); return text; },
    } : null;
    const out = await createApi(env, meter, store)(request, request.headers.get('cf-connecting-ip') ?? '');
    return out ?? env.ASSETS.fetch(request);
  },
};

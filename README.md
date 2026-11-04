# Story Sky: start a story out loud, see what's already in it

**Scribsy's entry for the Meta Global AI Developer Hackathon (Startups track, "Build for Your World").**

A blank page is the hardest part of a novel. Story Sky starts a story as a short spoken conversation and hands it back
as the beginning of a story bible, in the writer's own words:

1. **One easy question.** Story Sky asks, out loud, *"What's the first thing you see?"* You answer in a sentence or
   two. **Muse Voice Transcribe** writes it down.
2. **Reveal.** **Muse Spark** points at the people, places, things and open questions already in what you said. Every
   card carries an exact quote, and **the page checks each one mechanically**: the quote must be an exact substring of
   your transcript (we show its character offsets), and the label must sit inside that quote. Any card that fails is
   thrown away, and you can see what was thrown away and why.
3. **No guessing about names.** A name only becomes a *Person* or a *Place* when you said something that shows it
   ("her uncle Bram", "the ferry to Hollow Isle", a title such as *Inspector*). That clue is checked against your words
   too. Otherwise it's a neutral **Name** card: the writer decides, not the model.
4. **Back and forth.** Story Sky asks one question at a time, up to three, each built only from your words: one of
   Clean Language's published questions ("And is there anything else about *the brass key*?") around a span the model
   picks and the page verifies. It prefers what you just said and never asks about the same words twice. The question
   is spoken aloud; you answer out loud, and the cards grow with every answer. Story Sky never answers, explains or
   suggests anything.
5. **Keep.** You tap the cards that belong to your story.
6. **Sky.** **Muse Image** paints a night sky, and your kept cards become its constellation: *your story's sky*.

The model proposes; your words decide. That is the point of the build: an AI drawing out a writer's idea without
putting words in their mouth, and proving it on screen.

## What was built during the hackathon

Everything in this repository was written during the hackathon (27 Oct – 4 Nov 2026), starting from an empty repo on
31 Oct. It contains no code from the Scribsy app, and **nothing in the Scribsy app changes**. Story Sky is a standalone
demo.

| Built in the hackathon | File |
|---|---|
| The quote, label, clue and span checker (exact substrings with offsets; unclued names stay neutral; no repeated questions) | [`public/lib/verify.mjs`](public/lib/verify.mjs) |
| Rules-only spotting on the device, used when the model is unavailable and to add names the model missed | [`public/lib/spot.mjs`](public/lib/spot.mjs), [`public/lib/words.mjs`](public/lib/words.mjs) |
| The prompt and JSON schema for Muse Spark, and the Muse Image prompt | [`prompts.mjs`](prompts.mjs) |
| The API that keeps the keys off the page, calls Muse Voice Transcribe, Muse Spark and Muse Image, speaks only template questions, and asks a meter before every billed call | [`api.mjs`](api.mjs) |
| A small Node server for running it locally | [`server.mjs`](server.mjs) |
| The hosted version on Cloudflare Workers: the same API behind an access code, with daily caps kept in a Durable Object | [`worker.mjs`](worker.mjs), [`wrangler.jsonc`](wrangler.jsonc) |
| In-browser recording and 16 kHz WAV encoding for Muse Voice Transcribe | [`public/lib/wav.mjs`](public/lib/wav.mjs) |
| The page: the opening question, the rounds, keep, sky | [`public/`](public/) |
| The hand-off: a "story start" package of the run, checked again on the server, kept 24 hours for Scribsy to collect once (off until configured) | [`public/lib/story-start.mjs`](public/lib/story-start.mjs), [`docs/STORY-START.md`](docs/STORY-START.md) |
| Tests | [`tests/`](tests/) |
| Replay recorder and the one pre-rendered line of audio | [`scripts/`](scripts/) |

**What came before.** Scribsy is a writing app for novelists, and the idea of turning a writer's first rush of words
into a story bible they choose from is Scribsy's. Story Sky is a fresh, standalone take on that idea for the hackathon:
the code, prompts, word lists and copy here were all written new, and the model-plus-verifier pipeline is new.

## Models used

Meta's models do all the listening, reading and painting:

| Step | Model | Endpoint |
|---|---|---|
| Hear each answer | `muse-voice-transcribe-1.0` | `POST /v1/asr/transcribe` |
| Cards and the next question | `muse-spark-1.3`, structured output (JSON schema) | `POST /v1/chat/completions` |
| Sky | `muse-image-1.0` | `POST /v1/images/generations` |

All three are called through the [Meta Model API](https://dev.meta.ai/products/meta-model-api). Muse Spark runs at
`reasoning_effort: minimal` (set `REASONING_EFFORT` to change it): finding quotes in a short transcript needs little
reasoning. In testing, a reveal took 3 to 17 seconds this way, against about 24 at the model's default. A full
three-round run, sky included, cost about four to five cents.

The only other service is the voice: Meta's API has no text-to-speech, so **ElevenLabs** reads each question aloud
(Eleven v4 Turbo with a soft audio-tag direction, in "Story Sky Muse", a voice we designed for the demo with ElevenLabs Voice Design; the opening line is pre-rendered with Eleven v4). The server will only speak a filled-in template question, never free text, and
it is optional: without an ElevenLabs key the questions are shown, not spoken. "Story Sky Muse" lives in Scribsy's ElevenLabs
workspace, so with your own key set `ELEVENLABS_VOICE_ID` to one of your voices. The question text, which contains a few
of the writer's words, is the only thing sent to ElevenLabs.

## Run it

You need Node 20 or later. There are no dependencies to install.

```bash
META_MODEL_API_KEY=... ELEVENLABS_API_KEY=... node server.mjs     # the voice key is optional
# then open http://localhost:5177
```

Without a Meta key, `node server.mjs` still serves the page. Choose **Play a recorded run** to watch a real live run
recorded earlier, or **Type it instead** to see the rules-only version that runs entirely in your browser. The page
always says which mode it is in. The [live demo](https://story-sky.stevenrpattison.workers.dev) runs everything, with
the live models behind an access code; the [GitHub Pages copy](https://scribsy.github.io/meta-story-sky/) has no server,
so it runs the same two ways as above.

```bash
npm test     # the verifier, the rules and the question builder
```

The server never sends a key to the browser and never logs one. It stops calling Meta once a run passes
`SPEND_CAP_USD` (default $15), and stops speaking after `ELEVENLABS_CHAR_CAP` characters (default 6,000).

### The hosted live version

`worker.mjs` runs the same page and API on Cloudflare Workers. Anyone can open it, play the recorded run or type a story
(the rules alone). The live version, with your voice, Meta's models and the spoken questions, needs an access code, which
the page asks for and keeps in the browser. Every billed call goes through one Durable Object that keeps three limits
across restarts: a daily Meta budget (`DAILY_CAP_USD`, $5), a daily voice budget (`DAILY_VOICE_CHARS`, 6,000) and calls
per visitor per hour (`HOURLY_CALLS_PER_IP`, 60). When one is reached the page says so and carries on with the rules.

```bash
wrangler secret put META_MODEL_API_KEY      # and ELEVENLABS_API_KEY, ACCESS_CODE
wrangler deploy
```

## How the check works

```text
transcript ──► Muse Spark ──► proposed cards {kind, label, quote, clue} + {template, span}
                                   │
                                   ▼  verify.mjs (runs in the browser and the server)
             quote is an exact substring?  ──no──► dropped ("quote is not in the transcript")
             label inside the quote?       ──no──► dropped ("label is not inside its quote")
             person/place on a name: does a clue the writer said show it?  ──no──► neutral "Name"
             question: known template, exact span (≤ 8 words), not asked before?  ──no──► rules pick one
                                   │
                                   ▼
             cards with offsets, shown dashed until the writer keeps them
```

## Data

No writer's data is used anywhere. The recorded run is a story written for the demo (Pip, a hedgehog who keeps a
lighthouse), spoken by an ElevenLabs voice and run live through Meta's models. Tests and evaluations use only words
written for them, words Scribsy's founder spoke for the demo, or public-domain text.

## License

MIT. See [LICENSE](LICENSE).

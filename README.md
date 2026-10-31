# Story Sky — say your story idea, see what's already in it

**Scribsy's entry for the Meta Global AI Developer Hackathon (Startups track, "Build for Your World").**

Novelists start books in a mess: a minute of talking, a page of notes, a name you can't shake. Story Sky takes a minute
of a writer speaking their idea and hands it back as the start of a story bible, in their own words:

1. **Talk.** You speak your idea for about a minute. **Muse Voice Transcribe** writes it down.
2. **Reveal.** **Muse Spark** points at the people, places, things and open questions already in it. Every card
   carries an exact quote from what you said, and **the page checks each one mechanically**: the quote must be an
   exact substring of your transcript (we show its character offsets), and the label must sit inside that quote. Any
   card that fails is thrown away, and you can see what was thrown away and why.
3. **No guessing about names.** A name only becomes a *Person* or a *Place* when you said something that shows it
   ("her uncle Bram", "the ferry to Hollow Isle", a title such as *Inspector*). That clue is checked against your words too.
   Otherwise it's a neutral **Name** card: the writer decides, not the model.
4. **One question.** Story Sky asks a single follow-up question built only from your words: one of Clean Language's
   published questions ("And is there anything else about *the brass key*?") around a span the model picks and the page
   verifies. It never answers. Your answer joins your words, and any new name in it becomes a card.
5. **Keep.** You tap the cards that are yours.
6. **Sky.** **Muse Image** paints a night sky, and your kept cards become its constellation: *your story's sky*.

The model proposes; your words decide. That is the point of the build: an AI reading a writer's idea without putting
words in their mouth, and proving it on screen.

## What was built during the hackathon

Everything in this repository was written during the hackathon (27 Oct – 4 Nov 2026), starting from an empty repo on
31 Oct. It contains no code from the Scribsy app, and **nothing in the Scribsy app changes**. Story Sky is a standalone
demo.

| Built in the hackathon | File |
|---|---|
| The quote, label, clue and span checker (exact substrings with offsets; unclued names stay neutral) | [`public/lib/verify.mjs`](public/lib/verify.mjs) |
| Rules-only spotting on the device, used when the model is unavailable and to add names the model missed | [`public/lib/spot.mjs`](public/lib/spot.mjs), [`public/lib/words.mjs`](public/lib/words.mjs) |
| The prompt and JSON schema for Muse Spark, and the Muse Image prompt | [`prompts.mjs`](prompts.mjs) |
| A small Node server that keeps the API key off the page and calls Muse Voice Transcribe, Muse Spark and Muse Image, with a spend cap | [`server.mjs`](server.mjs) |
| In-browser recording and 16 kHz WAV encoding for Muse Voice Transcribe | [`public/lib/wav.mjs`](public/lib/wav.mjs) |
| The page: talk, reveal, question, keep, sky | [`public/`](public/) |
| Tests | [`tests/`](tests/) |
| Replay recorder (a real live run saved for judges without a key) | [`scripts/`](scripts/) |

**What came before.** Scribsy is a writing app for novelists, and the idea of turning a writer's first rush of words
into a story bible they choose from is Scribsy's. Story Sky is a fresh, standalone take on that idea for the hackathon:
the code, prompts, word lists and copy here were all written new, and the model-plus-verifier pipeline is new.

## Meta models used

| Step | Model | Endpoint |
|---|---|---|
| Talk | `muse-voice-transcribe-1.0` | `POST /v1/asr/transcribe` |
| Reveal and question | `muse-spark-1.3`, structured output (JSON schema) | `POST /v1/chat/completions` |
| Sky | `muse-image-1.0` | `POST /v1/images/generations` |

All three are called through the [Meta Model API](https://dev.meta.ai/products/meta-model-api). A full run costs about
two cents: under a cent for a minute of audio, a few thousand Spark tokens, and $0.01 for the image.

## Run it

You need Node 20 or later. There are no dependencies to install.

```bash
# live, with your Meta Model API key in the environment (we keep ours in Doppler)
META_MODEL_API_KEY=... node server.mjs        # or: doppler run -- node server.mjs
# then open http://localhost:5177
```

Without a key, `node server.mjs` still serves the page in **replay mode**. Choose **Play a recorded run** to watch a
real live run recorded earlier, or **Type it instead** to see the rules-only reveal that runs entirely in your browser.
The page always says which mode it is in.

```bash
npm test     # the verifier, the rules and the question builder
```

The server never sends the key to the browser, never logs it, and stops calling Meta once a run passes
`SPEND_CAP_USD` (default $15).

## How the check works

```text
transcript ──► Muse Spark ──► proposed cards {kind, label, quote, clue} + {template, span}
                                   │
                                   ▼  verify.mjs (runs in the browser and the server)
             quote is an exact substring?  ──no──► dropped ("quote is not in the transcript")
             label inside the quote?       ──no──► dropped ("label is not inside its quote")
             person/place on a name: does a clue the writer said show it?  ──no──► neutral "Name"
             question: known template + exact span (≤ 8 words)?             ──no──► rules pick one
                                   │
                                   ▼
             cards with offsets, shown dashed until the writer keeps them
```

## Data

The demo uses only words Steven (Scribsy's founder) speaks for it, or public-domain text: the recorded replay is
Windows' built-in voice reading the opening of *Treasure Island* (R. L. Stevenson, 1883, Project Gutenberg #120),
lightly trimmed. No writer's data is used anywhere.

## License

MIT. See [LICENSE](LICENSE).

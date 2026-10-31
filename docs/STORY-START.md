# Story start: the hand-off format

At the end of a run, Story Sky can offer **Keep this story in Scribsy →**. Pressing it is the only way anything is kept:
the page sends the run as a *story start*, Story Sky holds it for 24 hours under a one-time claim id, and the writer goes
to Scribsy's import page with that id. Scribsy's server collects the story once, and then it is gone.

The button only appears when the server has `SCRIBSY_IMPORT_URL` set (and, on the Worker, a `CLAIMS` KV namespace).

## The flow

1. **Writer presses the button.** The page `POST`s the story start to `/api/claim`. The server checks it (below),
   stores it for 24 hours, and answers `{ id, url, expiresAt, cards }`.
2. **Writer goes to `url`**, which is `SCRIBSY_IMPORT_URL?claim=<id>`, and signs up or signs in there.
3. **Scribsy's server collects it**: `GET /api/claim/<id>` with header `x-claim-token: <CLAIM_READ_TOKEN>`. The answer is
   the story start as JSON. It can be collected once; after that, or after 24 hours, the answer is `404`.

The id is 26 random base-32 characters (130 bits). Without the token the story can't be read even with the id.

## The story start (version 1)

```jsonc
{
  "format": "story-start",
  "version": 1,
  "createdAt": "2026-11-05T14:02:11.000Z",
  "producer": { "app": "Story Sky", "source": "https://github.com/Scribsy/meta-story-sky" },

  // Everything the writer said, each answer separated by a blank line. Card offsets point into this.
  "transcript": "A boy and his dog walking through an apocalyptic wasteland.\n\nAll manner of monsters…",

  // The conversation: the question that came before each answer (null before the first), and how it was captured.
  "rounds": [
    { "question": null, "answer": "A boy and his dog walking…", "transcribedBy": "transcribed by muse-voice-transcribe-1.0" },
    { "question": "And when he absorbs powers, what happens?", "answer": "…", "transcribedBy": "typed" }
  ],

  // Every card the writer saw, kept or not.
  "cards": [
    {
      "kind": "person",            // person | place | thing | name (a name with no clue yet) | question (left open)
      "label": "his dog",          // the writer's words for it, inside the quote
      "quote": "A boy and his dog walking through an apocalyptic wasteland.",
      "start": 0, "end": 59,       // transcript.slice(start, end) === quote, always
      "clue": "his dog",           // for person/place: the writer's words that show it; null otherwise
      "kept": true                 // the writer tapped it
    }
  ],

  // The painted sky, if there was one: a data URL (PNG or WebP, under 4 MB), the model, and whether the image filter
  // made Story Sky paint from gentler hints ("hints") or without the words ("none").
  "sky": { "image": "data:image/webp;base64,…", "model": "muse-image-1.0", "painted": "words" }
}
```

## What the server guarantees

`checkStoryStart` in [`public/lib/story-start.mjs`](../public/lib/story-start.mjs) runs before anything is kept:

- the format and version match;
- **every card's quote is exactly at its offsets in the transcript** and contains its label; any card that isn't is
  dropped, so nothing imported claims words the writer didn't say;
- kinds are from the list above; strings, rounds and cards are capped in size; unknown fields are dropped;
- the sky is kept only if it is a PNG, WebP or JPEG data URL under 4 MB.

## Not included

No audio (Story Sky never keeps it), no access code, no IP address, nothing about the device.

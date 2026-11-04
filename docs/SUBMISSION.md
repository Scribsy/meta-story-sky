# Submission draft (for Steven to paste into the CV platform)

Form: https://cerebralvalley.ai/e/meta-ai-developer-hackathon/hackathon/submit. **Due Wed 4 Nov, 9:00 PM ET.** Steven
submits it himself. Field names below are our best guess at the form's; paste the closest match.

**Project name**
Story Sky by Scribsy

**Tagline (one line)**
Start a story out loud: Meta's Muse models listen, ask back in your own words, and turn it into a verified story bible and your story's sky.

**Track**
Startups

**Problem statement**
Build for Your World

**Description**
The blank page is the hardest part of a novel. Story Sky starts a story as a short spoken conversation. It asks one easy
question out loud ("What's the first thing you see?"), and the writer answers in a sentence. Muse Voice Transcribe
writes it down. Muse Spark points at the people, places, things and open questions already in it, and every card
carries an exact quote that the page verifies mechanically: the quote must be an exact substring of the transcript
(shown with its character offsets), or the card is thrown away, visibly. A name only becomes a person or a place when
the writer said something that shows it; otherwise it stays a neutral Name. Then Story Sky asks back, up to three times,
each question a published Clean Language question around the writer's own words, which the model picks and the page
checks. It never asks about the same words twice and never answers or suggests anything. The writer answers out loud
and the cards grow. At the end they tap the cards that belong to their story, and Muse Image paints a night sky with
those cards as its constellation. The model proposes; the writer's words decide.

**How we used Meta's models**
- Muse Voice Transcribe (`muse-voice-transcribe-1.0`, `/v1/asr/transcribe`): every spoken answer, recorded in the
  browser and sent as 16 kHz WAV.
- Muse Spark (`muse-spark-1.3`, chat completions with a strict JSON schema): proposes cards (kind, label, exact quote,
  clue) after each answer, and picks the next question's template and span, preferring the latest answer.
- Muse Image (`muse-image-1.0`): paints the sky behind the kept cards.
A full three-round run costs about four cents. The questions are spoken by ElevenLabs (Meta's API has no
text-to-speech); the server only ever speaks a filled-in template question, and the voice is optional.

**What was built during the hackathon**
All of it. The repository was started on 31 Oct 2026 and contains only code written during the hackathon:
- the quote verifier;
- the Clean Language question grammar (listener's-side pronouns, slot fit, no repeats);
- the rules-only fallback;
- the prompts and schema;
- the API, plus the hosted demo on Cloudflare Workers with an access code and daily spend caps;
- the spoken questions in "Story Sky Muse", a voice designed for the demo with ElevenLabs Voice Design;
- the storybook sky with collision-free star labels and a fallback when the image filter declines dark words;
- in-browser recording to 16 kHz WAV;
- the page, including a phone layout;
- a story hand-off format, built and switched off;
- 28 tests, including a wide check of how every question reads aloud.

No Scribsy app code is included, and nothing in the Scribsy app changes. The idea of a story bible the writer chooses
from is Scribsy's; this take on it was written fresh. The README lists each file.

**What's next**
Testing with novelists whether verified, writer-chosen cards are a better start to a book than a blank page, and
whether the idea belongs in Scribsy itself. The first step is already built here and switched off: a consented,
one-time hand-off ("Keep this story in Scribsy"), which packages the run with every quote re-checked against the
writer's words and holds it for 24 hours so a new Scribsy account could import it as a braindump and story-bible
entries. Nothing changes in the Scribsy app today; the import would be built after launch.

**GitHub repo**
https://github.com/Scribsy/meta-story-sky

**Demo video**
(Unlisted YouTube or Loom link, 3:00 or less)

**Live demo**
https://story-sky.stevenrpattison.workers.dev. Anyone can play the recorded run there or type a story (rules only).
For the live version (mic, Meta's models, the spoken questions), enter the access code on the title screen.

**Testing instructions / notes for judges** (the code is in Doppler, `scribsy-labs/research` → `STORY_SKY_ACCESS_CODE`;
paste it here, never into the repo)
Open the live demo in Chrome, enter the access code `<paste code>`, click Begin and allow the microphone. Answer each
question out loud in a sentence or two (tap the mic to start and again to stop), keep the cards you like, then Show my
sky. Headphones help, so the spoken question doesn't feed back into the mic. If the day's live budget runs out, the page
says so and carries on with the rules alone; "Play a recorded run" always works.
Backup with no server: https://scribsy.github.io/meta-story-sky/ (recorded run and rules only).

**Team**
Steven (Scribsy founder). Add your full name as on your CV profile, and anyone else who worked on it.

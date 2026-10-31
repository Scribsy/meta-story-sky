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
A full three-round run costs about five cents. The questions are spoken by ElevenLabs (Meta's API has no
text-to-speech); the server only ever speaks a filled-in template question, and the voice is optional.

**What was built during the hackathon**
All of it. The repository was started on 31 Oct 2026 and contains only code written during the hackathon: the
verifier, the rules-only spotter, the prompts and schema, the server, the recording and WAV encoder, the spoken
questions, the page and the tests. No Scribsy app code is included, and nothing in the Scribsy app changes. The idea of a story bible the writer
chooses from is Scribsy's; this take on it was written fresh. The README lists each file.

**What's next**
Testing with novelists whether verified, writer-chosen cards are a better start to a book than a blank page, and
whether the idea belongs in Scribsy itself.

**GitHub repo**
https://github.com/Scribsy/meta-story-sky

**Demo video**
(Unlisted YouTube or Loom link, 3:00 or less)

**Live demo**
https://scribsy.github.io/meta-story-sky/ (no server behind it: "Play a recorded run" plays a real live run; typing runs the
rules-only version in the browser). To run it live: `META_MODEL_API_KEY=... ELEVENLABS_API_KEY=... node server.mjs`.

**Team**
Steven (Scribsy founder). Add your full name as on your CV profile, and anyone else who worked on it.

# Submission draft (for Steven to paste into the CV platform)

Form: https://cerebralvalley.ai/e/meta-ai-developer-hackathon/hackathon/submit. **Due Wed 4 Nov, 9:00 PM ET.** Steven
submits it himself. Field names below are our best guess at the form's; paste the closest match.

**Project name**
Story Sky by Scribsy

**Tagline (one line)**
Say your story idea out loud; Meta's Muse models turn it into a verified story bible and paint your story's sky.

**Track**
Startups

**Problem statement**
Build for Your World

**Description**
Every novel starts as a mess in a writer's head. Story Sky lets a novelist speak their idea for a minute and hands it
back as the start of a story bible, in their own words. Muse Voice Transcribe writes down what they said. Muse Spark
points at the people, places, things and open questions already in it, and every card carries an exact quote that the
page verifies mechanically: the quote must be an exact substring of the transcript (shown with its character offsets),
or the card is thrown away, visibly. A name only becomes a person or a place when the writer said something that shows
it; otherwise it stays a neutral Name. Then Story Sky asks one follow-up question built only from the writer's words: a
published Clean Language question around a span the model picks and the page checks. It never answers. The writer
taps the cards that are theirs, and Muse Image paints a night sky with the kept cards as its constellation. The model
proposes; the writer's words decide.

**How we used Meta's models**
- Muse Voice Transcribe (`muse-voice-transcribe-1.0`, `/v1/asr/transcribe`): the spoken idea, recorded in the browser
  and sent as 16 kHz WAV.
- Muse Spark (`muse-spark-1.3`, chat completions with a strict JSON schema): proposes cards (kind, label, exact quote,
  clue) and picks one question template and span.
- Muse Image (`muse-image-1.0`): paints the sky behind the kept cards.
A full run costs about two cents.

**What was built during the hackathon**
All of it. The repository was started on 31 Oct 2026 and contains only code written during the hackathon: the
verifier, the rules-only spotter, the prompts and schema, the server, the recording and WAV encoder, the page and the
tests. No Scribsy app code is included, and nothing in the Scribsy app changes. The idea of a story bible the writer
chooses from is Scribsy's; this take on it was written fresh. The README lists each file.

**What's next**
Testing with novelists whether verified, writer-chosen cards are a better start to a book than a blank page, and
whether the idea belongs in Scribsy itself.

**GitHub repo**
https://github.com/Scribsy/meta-story-sky

**Demo video**
(Unlisted YouTube or Loom link, 3:00 or less)

**Live demo**
https://scribsy.github.io/meta-story-sky/ (replay mode: a static page holds no key; the recorded run appears once credits land)
To run it live: `META_MODEL_API_KEY=... node server.mjs`.

**Team**
Steven (Scribsy founder). Add your full name as on your CV profile, and anyone else who worked on it.

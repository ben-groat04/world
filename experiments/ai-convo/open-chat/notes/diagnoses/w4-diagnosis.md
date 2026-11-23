# W4 diagnosis (cold read of the W3 paired batch)

Evidence: eval/w3 and the chats in writer-runs/2026-11-23T06-21-41-430Z (W3) and 06-21-43-593Z (W2M). The counts are crude, and the noise is about ±0.3.

## Scores
W3 6.84 vs W2M 6.62. Two-person chats score 7.0, three-person 6.6, groups of five or more 6.5. Window length makes no difference (≤25 messages 6.7, 40 messages 6.7). The 8-9 windows are sparse, unresolved and mundane.

## What separates these from 8/10, with root causes

**1. A fixed register per person, almost always "one formal speaker and one lowercase speaker".** Judges mention "formal" 36 times and "consistent" 22 times. Example: stern Nino ("Received. Thank you.").
- **Root cause: the casting style line.** Every W3 cast (23/23) has someone typing "in full sentences with proper capitals and punctuation" next to a lowercase speaker. W2M has this in 21/23.
- "Full sentences" is register, not typing, despite writer.mjs:94's "Only the typing". The writer applies it to every message.
- W3 item 4's writer-side wording left the capital-vs-lowercase word gap at 3.5 in the batch.

**2. Tidy arcs, callbacks and quips** ("tidy" 37, "callback" 22, "resolv" 21, "sitcom" 10).
- **Root cause:** one author plans a whole waking day per call, thinking for a median of about 2.6k tokens, with the whole chat in view. Bringing an earlier detail back and closing each thread is how an author makes a day hang together.
- W3's "jokes are occasional and often fall flat" left the share of messages of 4 words or fewer at 23%. Three rounds of writer wording sit within ±0.2.

**3. People who live together text all evening** (K43: "i'm making the rice thing. want some", then "Good dinner. Thank you for the rice."). This happens in 5/23 casts that share a home. Same root as item 2: the writer has a day to fill with chat.

**Smaller tells:** an essay-length opener (K11), a self-correction glued into a message, and the same places and names across runs (Porto 5-6/23).

## Cause of the chunk rejects (and of W3's "0.3% night")
- **Midnight cliff.** W3 has 5 messages in the 00h hour and 0 from 01:00 to 05:59. 49 nights end at 23:xx. W2M has 65 messages at 00h, and 34 of its nights end after midnight.
- **Mechanism:**
  - W3's span lines (writer.mjs:42) never name the next weekday. The later-chunk line even says "the messages of Tue", so a message after midnight gets headed "Tue 00:30" (or "Mon 00:40" on the first evening).
  - `dated()` (writer.mjs:55) reads that as earlier than the last message and adds 7 days. writer.mjs:69 then rejects the whole chunk.
  - W2's line named "to Wed 04:00", so it didn't do this.
- **Consequences:**
  - The chunks that survive are the ones that stopped before midnight. Part of W3's "night fixed" result is survivorship.
- **Proof still missing:** rejected texts aren't saved, so this is a strong inference.
- **The lost runs:**
  - K1-K11 logged only 1 usage. Day 2 failed through three CLI errors, not stamp rejects, because a parse or stamp reject still logs usage.
  - K7-K72 left no log, so its cause can't be recovered.

## Prompt edits or structure?
- **Two incremental fixes are worth making**, because each has an upstream cause: the casting style line and the midnight header.
- **Item 2 needs structure**, because the writer's wording has stopped moving the numbers. The options:
  - **Per-person drafting:** rounds 1-19 plateaued at 5-6. Don't retry it.
  - **Rewrite pass:** rounds 11-18 leaked reasoning and cut decisions.
  - **More context:** nothing sourced to add; real-chat anchors are ruled out.
  - **A bigger writer:** untested, since round 8's Sonnet result was multi-agent. Worth a diagnostic.
  - **Recommendation: a delete-only pass per day.** A second Haiku call returns only message numbers to cut, so it writes no text and nothing can leak. It runs on day N+1 while day N plays.

## W4 plan (ranked; every item works chunk by chunk, ahead of the story clock)

**1. Fix the midnight header and keep rejected texts.**
- writer.mjs:42, with `nx = WD[(new Date(from + ':00Z').getUTCDay() + 1) % 7]`:
  - First chunk: append to the sentence ` (a message after midnight is headed ${nx}, e.g. "${nx} 00:40")`.
  - Later chunks: replace "until the last stops for the night." with `until the last stops for the night (a message after midnight is headed ${nx}).`
- writer.mjs:69: append `r.text` to `<run dir>/rejects.txt`.
- **Check** (`--gen`, the 8 briefs, 1 seed): rejects ≤ 3/27, no lost day, and messages exist between 00:00 and 02:00 (no cliff). Every logged reject should show a backwards header. If none do, the inference was wrong; re-diagnose.

**2. Run the writer in the live app.**
- writer.mjs:123: write log.jsonl after every day, not only at the end.
- writer.mjs:114: start time from the form or the current time, not a fixed date.
- viewer/build.mjs:3: also read `writer-runs/`.
- On a START RUN comment (README "Viewer"), run `node writer.mjs --gen` with a one-brief file built from the form. Push day N with viewer/live.mjs while day N+1 is written, releasing turns to `live_turns` as their story time comes (the speed is a design parameter). Republish viewer/index.html in this account.
- **Check:** one 2-day run started from the form plays in the viewer, and day 2 arrives before day 1 finishes playing at 1x.

**3. Drop the style line from the sheet.**
- writer.mjs:36: delete `How ${n} types, when it shows: ${p.style}`.
- writer.mjs:94: delete the `"<name> style:"` line.
- writer.mjs:102: drop `style` from the cast object.
- **Check** (8 briefs, against W3 on the same casts):
  - Capital-vs-lowercase word gap < 2.
  - By eye, ≤ 2/8 chats have a stiff, formal speaker.
  - Abort if all voices read the same (for example, everyone lowercase).

**4. @claude as cut-and-resume.**
- Add to the writer prompt: `Anyone can ask Claude, an AI assistant that searches the web, by starting a message with "@claude"; stop right after such a message.`
- In writeDay (writer.mjs:63), keep the messages up to the first @claude message. Reuse run.mjs's askOracle (Sonnet with web search): the answer is sourced or "couldn't find it", never guessed. Post it as `Claude`, stamped after the real call time. Resume the same day: `Continue the chat from ${stamp}, until the last stops for the night.`
- **Check** on 5 briefs that need a fact (a train time, a venue's hours):
  - Ask rate.
  - No answer content appears before the answer.
  - Characters don't invent beyond the answer.

**5. A delete-only pass per day, for the tidiness tell.**
- One Haiku call is given the last 20 earlier messages and the day's messages, numbered. The ask: `Which of the numbered messages read as written for an audience rather than typed by the person: a punchline, a callback to an earlier joke, a line that neatly closes a thread, an over-complete message? Reply with their numbers only, or none.`
- Code drops them. Cap the deletions at a quarter of the day (a design parameter).
- **Check** first by replay on the existing 46 batch chats (no new chats needed):
  - Deletion share, and orphaned replies by eye. Round 13 cut decisions, so watch for that.
  - Then judge the original vs the cut windows blind, never both versions with one judge. They differ only by deletions, so the pairing is tight.
  - Keep it only if the cut windows win.

**6. Diagnostic: Sonnet as the writer** on the same casts, 8 briefs × 3 seeds, judged blind against W3. If it's ≥ 1 point ahead, the ceiling is Haiku's capacity. Haiku stays the production writer otherwise.

**Not now:** big-group tuning; place and name variety (an artifact of the eval); co-presence (recheck it after item 5).

Against ITERATIONS: item 3 removes a field instead of rewording it (W2 item 1 rewording missed). Item 5 never writes text, unlike the round 11-18 polish passes. Item 1 changes the cause and leaves the reject guard in place.

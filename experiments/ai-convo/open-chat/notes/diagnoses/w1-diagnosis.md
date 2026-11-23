I read ITERATIONS.md (all rounds), README.md, baseline.mjs, prompts.mjs, the casting part of run.mjs, all 9 one-call transcripts, judges.md and scores.tsv. I edited nothing and ran no simulations. I did run one small read-only script over the baseline logs to count how often the cast's example texts appear word for word in the chats.

## What gives the one-call chats away, and why

**1. The cast's example texts get pasted into the chat (main cause).** The casting call asks for "six texts you might send *in this chat*". baseline.mjs then passes them as "Some of X's texts: …", and Haiku treats them as lines to use.
- 85 of 334 one-call messages (25%) contain an example word for word. About half of all examples get used.
- Most of the oddities the judges named are pasted examples:
  - Mei's "exactly what I was going to say about the cafe" (Josh's example, given to Mei).
  - Hannah's "is chloe still…" about Chloe, who is in the chat.
  - Miguel's "i do ngl" and Mia's lone 👍.
  - Tom's "lol Dev you'd sleep through a fire", with a made-up excuse tacked on.
  - The found water bottle and helmet in the housemates chat.
- Per chat, the copying roughly tracks the score:

| Chat | Mean score | Messages with a pasted example |
|---|---|---|
| U21 (the 8.25) | 8.25 | 2 of 41 |
| T41 | ~5.75 | 4 of 40 |
| T51 | 4 | 16 of 33 |
| U31 | ~3.75 | 13 of 40 |
| U11 | ~3.75 | 9 of 39 |

  T11 is the exception: 13 pasted and still about 6.9. Group size is also a confound, since the 1:1 chats score best.
- The multi-agent round only ever showed examples to the rewrite pass, labelled "from other chats (for the feel only)".

**2. Typing styles become caricatures.** A `style` line like "polite sign-off" or "complete sentences, a few lines long", plus examples in the same voice, gets applied to every message. That gives "one formal writer per group" (Mei, Carlo, Aoi). Nothing in the prompt says habits show only some of the time. This is the round 12/16 "voice applied twice" lesson again.

**3. Names and sign-offs.** The baseline says nothing about how people text. The multi-agent chats had the relay note's "no names unless unclear, no sign-offs, no restating plans", and the rewrite pass cut thanks, sign-offs and names. Result: names 23% vs 10%, sign-offs and thanks 12% vs 4%.

**4. "Everyone gets a line" and people announcing their week.** Each person's `life` line ("this week you're…") is the only content given, so the writer shows all of it. Every member states their availability or schedule (T51, T31, T11), and every person gets equal airtime.

**5. A fixed count makes a tidy rhythm.** "About 35 messages in 36 hours" gives evenly spaced messages and lots of small threads each neatly closed. There are no lulls, and every message moves the plot along.

**6. Some facts get repeated.** The Kenta and Aoi 1:1 (d9efd1) restates the inspection and the Midosuji line. This is milder than the multi-agent timeline errors (f520f1). One writer means one shared offline reality, which is a real advantage.

## What carries over from ITERATIONS.md

**Carries over:**
- The relay note's texting rules: no names unless unclear, no sign-offs, no restating, answer questions but don't add agreement or thanks.
- "Habits show in some texts, not every one."
- A shared register within one cohort.
- The random place draw and ordinary circumstances in casting (the boiler, 10K and Leeds lessons).
- Sleeping hours.
- Running jokes need a setup, and the same fact shouldn't be confirmed twice.
- The whole evaluation method: paired arms on shared casts, time windows, fresh briefs each round, and the warning that 6-9 windows can't show differences under about 1.8 points. One-call is cheap, so use 3 seeds × 9 scenarios plus fresh briefs.
- Secrets as "Only X knows this, at least at first".

**Doesn't carry over:**
- Check-ins, the re-check, PASS/REACT, Day refreshes and `Next:`, the rewrite pass, notification delays, the memory arm. All of that machinery only exists to make separate agents behave as one story.
- The worry that rules silence the chat (rounds 11 and 17). A writer has to produce messages anyway; the risk turns into volume, which a metric can watch.
- Don't add a rewrite pass back by default: rounds 17-18 showed it barely touches echoes and it leaks its own reasoning.

## Ranked plan

**1. Drop example texts from the writer's input.**
- Have casting either stop writing them or not pass them on.
- Check (9 calls on the same casts): pasted-example share should go from 25% to about 0%, and the named non-sequiturs should be gone.

**2. Rewrite the people block.** For each person:
- `X (who). {knows} {life} {like} Usually asleep 23:00-07:00. {texts} How X types, when it shows: {style}`
- Then after all people: "This is background you know as the writer. Most of it never comes up in the chat, and nobody announces their week or schedule. A person's typing habits show in some messages, not all; most messages are plain."
- Check: the per-person habit-marker share (the replay.mjs polish metric), and Mei/Carlo sign-off and formal share falling.

**3. Add a texting block and let volume float.** Replace the count sentence with:

> "This is texting between people who know each other. Messages are short, often fragments. No names unless it would be unclear who is meant, no greetings, thanks or sign-offs as a habit, and nobody restates a plan or repeats what someone just said. Not everyone answers everything: some people say little for hours, a question can sit unanswered, a thread gets dropped, someone goes off on something unrelated. Nobody texts while asleep, and people they're with in person they talk to there. Quiet stretches of hours are normal. Write as many messages as these people would really send in this time."

- Check with score.mjs on 9 casts:
  - Names: 23% should fall to ≤10%. Sign-offs: 12% should fall to ≤4%.
  - Messages per day: abort if under about 8.
  - Gap distribution should get burstier.
  - Spread of posts across people: in groups, a few people should carry most of the chat.
  - Then blind judges, paired against the round-19 one-call chats.

**4. Big groups (5-8 people).** Add: "In a group this size most messages come from two or three people; others chime in once or lurk."
- Check: the per-person share, and the judges' "everyone gets a line" complaints.

**5. Chunk by story day.** One call per in-story day. It gets the cast block, the chat so far (all of it, or the last ~60 messages plus a 3-line "earlier" summary), and "Write the messages from Tue 07:00 to Wed 07:00."
- This is what makes live play, secrets, @claude and mid-run topics possible.
- Check: a 36h one-call vs 2 day-chunks on the same casts. Judge both, and count contradictions and re-confirmed facts.

**6. Secrets.** Inside the person's block: "Only X knows this, at least at first: … Nobody else acts as if they know it unless X tells them in the chat."
- Check: 9 casts with one secret each. Count messages where someone else refers to the secret before it is revealed (keyword grep plus reading).
- The fallback if the writer leaks: the writer still writes everyone, but the secret appears only in a per-chunk "X's private context" line. Don't build that unless the check fails.

**7. @claude.**
- Tell the writer that a person may ask Claude privately, as a separate line `[X asks Claude: …]`.
- Parse the output and cut the chunk at that line. Call the real oracle (Sonnet with web, as in askOracle today).
- Restart the chunk from that point with "(Claude answered X privately: …). Only X saw this."
- Check: an ORACLE arm on casts that need a fact (venue, hours). Measure the ask rate, and look for leaks of the answer by anyone other than X.

**8. Model and effort arms.**
- Haiku at `--effort low` vs medium. It already thought for about 3.8k tokens on U21.
- Sonnet as the writer (round 8's "Sonnet is worse" was about multi-agent characters).
- Only after items 1-4 are settled; same paired judging.

**9. Casting.** Keep the call, drop `examples`, and keep `style` as one line.
- Check: GEN_ONLY on 5 fresh briefs, reading for caricature.

The writer prompt order: cast line, setting, people block (with secrets), topic or opener, "The chat so far:", the time span, the texting block, then the format line as now (`--- Mon 19:41, Name`, reaction lines). Keep baseline.mjs's `parse()` and `dated()`.

## Fitting it into the live app

1. Keep the start flow, the casting call and the log format. baseline.mjs already writes `log.jsonl` rows that eval-prep, score.mjs and `viewer/live.mjs` can read.
2. Replace run.mjs's event loop with a writer loop. It generates day N+1 while day N plays, which is easy: one call takes about a minute, far less than a story day.
3. Release each parsed message when the story clock reaches its timestamp. Derive a typing indicator from its length and the sender's words per minute, as today.
4. Messages go to `live_turns` as now.
5. An @claude line pauses the writer at that message: the oracle answers, the answer posts privately (`private: true, to: X`, as the existing oracle rows do), and the writer continues from there.
6. Optional topic and 2-8 people go to casting unchanged. Secrets go in the people block. A topic or person the user adds mid-run starts the next chunk.

Paths: baseline.mjs (`promptFor`) and run.mjs (`castPrompt`, the "examples" line) in /home/user/world/experiments/ai-convo/open-chat/; the judge reports are at /tmp/claude-0/-home-user-world/f8895907-66f8-5315-a40a-9b9125a9ca28/scratchpad/r19/prep-both/judges.md.

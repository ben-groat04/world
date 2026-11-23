# W3 diagnosis (cold read of the W2 paired batch)

Evidence: eval/w2, the chats and logs in writer-runs/2026-11-23T05-49-4*. Metrics are crude regex counts: they point in a direction, no more.

## What W2 and effort medium changed

- **Scores:** W1 6.66, W2 6.67, medium 6.82, all within noise. W2's A windows score 6.35 against 7.00 for B; W1's are 6.69 and 6.63. Windows with 35 or more messages score 6.48.
- **Effort medium does make Haiku think.** "0 thinking" came from `thinking_chars`, and the CLI streams thinking with no text. `usage.output_tokens_details.thinking_tokens` shows thinking in 22/52 W1 calls, 37/82 W2-low calls and 77/87 medium calls (median 2640 tokens). So the W2 item 6 bullet in ITERATIONS is wrong.
- **Medium is also more coherent:** night messages 10% vs 17%, messages during the sender's own sleep hours 8% vs 16%, and the best A and B windows. **Keep medium.** It costs about 2.4x the output tokens.
- **Keep W2.** It has no appointment hooks, its secrets surface, and its B windows score 7.0. But it brought in regressions 1 and 3 below.

## What still gives them away, with root causes

**1. Messages at 3-5am (W2 only).**
- W1: 0% of messages between 00:00 and 06:00. W2: 17%, with 82 messages in 03:00-05:00 across 18/23 runs, and 14 at exactly 04:00.
- Judges named it about 15 times ("sends at 04:00", "awake 1-4am for no reason", "3am grief scene").
- **Root cause:** writer.mjs:43 says "from Mon 19:00 to Tue 04:00 (9 hours) … stop at Tue 04:00". The writer fills up to the end time, starts the next chunk at 04:00, and invents insomnia to get past "Nobody texts while asleep".
- The same fill makes the first evening dense: 22.6 messages per run vs W1's 13.8 in those 9 hours. That is likely why W2's A windows score lowest.

**2. Writerly lines.** Punchlines, callbacks, quotable lines and "sitcom ensemble" are the top judged tell, with about 80 mentions.
- **Root cause:** one author writes every voice for a reader, so every line is a beat.
- likeSpec (writer.mjs:77) gives everyone a "sense of humour" and topics to have "opinions about".
- TEXTING (writer.mjs:33) controls the form of messages, not their content. Only 15-19% of messages are 4 words or fewer.

**3. Cast-sheet details become motifs, and W2 made it worse.**
- Examples: the cat Biscuit in five chats, the setting's "last talked about" pavlova argument running through all of K73, a sock eaten twice.
- W2 dropped W1's "Most of it never comes up" (writer.mjs:34), and "who you live with" added pets.
- Casts with a cat or dog: 5/24 (W1), 9/23 (W2), 20/24 (medium).
- Cast-sheet words recurring in 4+ messages from 2+ senders over 2+ chunks: 1.9 / 3.9 / 4.4 per run.
- Runs reusing the setting's last-talked topic 3 or more times: 3/16, 10/17, 14/21.
- **Root cause:** the writer treats every concrete detail as material, and bringing it back is how an author creates coherence.

**4. A stiff organiser next to a lowercase speaker** (about 43 mentions). Capital-start messages average 13-14 words against 10 and read as "composed". Same root as item 2.

**Smaller tells:** 94% of questions answered; big groups (K5, 6.1-6.2 in every arm); one essay-length opener.

## Ranked plan for W3 (build in order, a check per item)

**1. Each chunk is a waking day, with no end time to write up to.**
- Replace both span strings at writer.mjs:43.
  - First chunk:
    > `Write this evening's messages in the order they were sent, starting with ${first}'s first message at ${stampOf(from)}, until the last of them stops for the night. The next day is written separately.`
  - Later chunks:
    > `Continue the chat with the messages of ${stampOf(from).slice(0, 3)}, in the order they were sent: from whenever the first of them picks up the phone until the last stops for the night. The next day is written separately.`
- Keep `chunkEnds` and writer.mjs:69-71 as the parse bound only. Drop `spanHours`.
- Check (`--gen`, the 8 batch briefs, 1 seed): messages 00:00-06:00 at most 3%, in the sender's sleep hours at most 2%, at 04:0x about 0; first-evening messages close to 14.
- Abort if rejects go above W2's 9 in 42 calls, or a day comes out empty.

**2. Medium as the default, and measure thinking correctly.**
- writer.mjs:16: `process.env.EFFORT || 'medium'`.
- writer.mjs:25: drop `thinking_chars`. `thinking_tokens` is already logged.
- Correct the W2 item 6 bullet in ITERATIONS.
- Check: thinking above 0 in at least 85% of calls.

**3. The background is not material to use.**
- writer.mjs:34, BACKGROUND's first sentence becomes:
  > `This is background you know as the writer, not material to work in: most of it never comes up, and nothing in it turns into a running joke. Their days are ordinary; now and then something from someone's day comes up, unplanned.`
- writer.mjs:87: delete "if the situation implies you have been in touch before, also what you last talked about, which must be unrelated small talk, not the topic." The writer already has the whole chat. Round 8's common ground stays as "how you know each other".
- Check: recurring cast-sheet words at about 2 per run, and the setting-reuse count falls.
- Abort if messages per 24 h fall below 15, or the chats turn all logistics (round 18's tell).
- Against ITERATIONS: round 16's joke rule did nothing, but that was in multi-agent replay. If this check misses, revert the sentence; don't push it.

**4. Plain content, not just plain form.**
- writer.mjs:33, replace "Someone who types with capitals and full stops still talks as plainly as everyone else: no polite padding, no full explanations." with:
  > `Most messages are unremarkable (a plain answer, a time, ok, a half-thought); nobody is writing for an audience, so jokes are occasional and often fall flat, and someone who types with capitals and full stops talks as plainly as the rest.`
- writer.mjs:77 likeSpec:
  > `in the second person, one short sentence: your temperament. An ordinary person, not a type.`
- Check: messages of 4 words or fewer at least 25%. The capitals-vs-lowercase word gap under 2. By eye, on 5 chats against medium on the same briefs: punchline and callback lines.
- Abort if the chats go flat.

**Not now:** a chunk rewrite pass that flattens writerly lines. That is the W4 arm if item 4 misses; rounds 15-18 polish leaked.

## Evaluation

- W2-medium vs W3, paired, on fresh briefs plus "Cousins." and "My ex.", 3 seeds.
- **Two judges per window.** One judge can't separate 0.25 points.
- Report A and B windows separately.

## Live app and @claude

- **Live app:** wire it once W3's checks pass. Item 1 makes the live unit one waking day per call, and the interface is then stable. Write day N+1 while day N releases on the story clock into `live_turns`, republish the viewer (HANDOFF), and smoke-test one 2-day run.
- **@claude:** after that, as a cut-and-resume line.
  1. When the writer emits "@claude …", cut the day there.
  2. Sonnet with web search answers: sourced, or "couldn't find it", never guessed.
  3. Insert the answer and resume the same day from that point.
  - Check, on 5 casts that need a fact: the ask rate, and no leaks of the answer.

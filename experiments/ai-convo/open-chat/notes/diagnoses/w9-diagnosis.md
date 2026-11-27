# W9 diagnosis (cold read of the W7 vs W8 paired batch)

Read: HANDOFF, ITERATIONS, README, both writers, w8-diagnosis, and `eval/w8-batch/` (tally, key, all 30 judge reports joined to labels, several transcripts). The counts come from throwaway scripts over the log rows.

## What the batch says

| | W7 | W8 |
|---|---|---|
| p_real (judge-centred) | 72 (+2.6) | 64 (-2.6) |
| messages per chat | 52 | 89 |
| messages with emoji | 19% | 39% |
| people (5+ msgs) with one emoji in ≥40% of their messages | 1 of 104 | 15 of 108 |
| people with emoji in ≥60% of their messages | 11 | 38 |
| judge comments with tidy/neat | 9 | 32 |
| judge comments with callback/resolved | 2 | 25 |

The worst W8 windows (p_real ≤45) are mostly emoji signatures: "Sofia 🙂, Jonas 🙃, Julia 😩"; "Sakura 😅/😊 on almost every message"; "Michalis puts 🍝😤 on everything"; "Rodrigo's 😴 on every driving message". Sofia's style line says "a few emoji", and she starts nearly every message with 🙂. Other complaints: each member runs a subplot taken from their life line (in X52, Jonas's fuse box comes up six times and Thomas's cycle into the wind twice); people text at the same café table ("Thomas you want one or just coffee"); a Tuesday question is answered on Thursday as if it were still current (X31). W8 fixed what it aimed at (status messages fell from 8.9% to about 2%, purpose clauses are gone). But the stretch unit doubled the emoji and roughly doubled the density. It also failed its own abort line (the median stretch spans 4.3 h, the line was 3 h), and the gate that was meant to decide it was never run.

## Why seven rounds haven't moved

1. **Every round swaps one tell for another.** One Haiku author with a per-person sheet performs whatever the sheet says. A descriptor becomes a tic (style, texts, like, knows). A life detail becomes a prop or subplot (Biscuit the cat, the fuse box). An open thread gets a payoff. Each round removed one channel by rewording it. The author's habits found another, so the net change stayed near 0.
2. **The instrument is near its ceiling and noisy.** "Score" is never defined. Judges say so ("since the scale wasn't defined") and grade coherence. 9s are 6 of 236 scores, so a mean of 8 needs almost every window to land in the top bucket judges actually use. Judge means for p_real run from 36 to 88. That spread is larger than any difference between arms. p_real is the real target.
3. **What limits realism now** is not texting mechanics. Names, sign-offs, night messages, status messages and Claude's format are solved. What is left: rates the writer cannot hit (emoji, volume), details on the cast sheet that get used as props, and a single author's tidiness. The levers that have worked are taking a decision away from the model and making it in code (place, names, opener, volume, capitals) and thinning what the model sees. W9 does more of both.

**Plainly:** revert W8's writing unit (item 7) to W7's day unit. Keep W8's items 2, 4, 5 and 6.

## W9 plan (ranked; every item runs ahead of the clock and leaves @claude cut-and-resume as it is)

**1. Revert the stretch unit.** In `writer.mjs`, take `promptFor`'s span lines (59-61), `chunk` (88-98) and `writeDay` (101-117) back to writer-w7.mjs 59-64, 91-102 and 103 onward. One call per day, @claude cutting and resuming as in W7. In `TEXTING` (49), restore "Quiet stretches of hours are normal." and "Write as many messages as these people would really send in this time." The main loop (210) emits each day, or each part of a day cut by @claude. Keep W8's opening (58), BACKGROUND, code-drawn volume and the topic openers. *ITERATIONS:* W2-W7 ran this unit live: day N+1 is written while day N plays (W4 smoke 2). *Check:* 8 plain chats (fresh briefs, 1 seed, 2 days): messages per chat 40-65, emoji 15-25%, gaps ≤2 min reported. One `--live` fact run at speed 60: the Claude answer comes mid-day and `run.json` reaches done.

**2. Emoji per message decided in code.** The root cause, found in W7 and again in W8: a per-person level word is realised on every message, and no wording has fixed that. Dropping the line gives nobody any emoji (W4 and W8 aborts). Keep the style line, so the writer offers emoji, and let code decide per message, as it already does for capitals. In `parseCast` (164), add `emojiKeep: pick([0.15, 0.35, 0.6])` (design parameters, like `textsFor`). In `chunk` (94), after `caps`, for that person and with probability 1 - emojiKeep, strip `\p{Extended_Pictographic}` with any following U+FE0F/ZWJ sequence and tidy the spaces. Messages that are only emoji stay as they are. Casts without the field are untouched. The writer then sees the thinned chat, so it stops copying its own tics. *ITERATIONS:* not tried. Capitals by code (W5) is the precedent. *Check (item 1 chats):* people with one emoji in ≥40% of their messages ≤2, people at ≥60% ≤2, people at 0% and at ≥30% both present, no message left empty.

**3. Fewer props on the cast sheet.** The 151 life line becomes:
> "<name> life:" in the second person ('You ...'), one plain sentence: where you live, what fills your days (given above) and who you live with. No other details.

The 150 knows line becomes:
> ...who each of the others is to you and how you know them, a few words each, nothing about what they are like or what they do for you.

(X52: three of the four knows lines cast Sofia as "the pharmacist who always has good advice", and she spends the chat handing out advice.) *ITERATIONS:* W2 removed appointments, W8 removed routine, W7 cut knows traits to 16% but not lower. This item goes further down the same path. *Check:* 30 casts. Trait-regex hits in knows (`w7-checks/casting.mjs`) ≤5%. Life lines one sentence. Recurring cast words per run (`w3-checks/metrics.mjs`) below the W7 batch. By eye on 3 group chats: nobody's work thread is updated 3 or more times.

**4. Co-presence wording.** In `TEXTING` (49), "People who are together talk in person, not in the chat." becomes "Once people are in the same place they stop texting each other until they are apart again." *ITERATIONS:* W4 lives-with, W5 removal, W8 re-add; X52 still fails. *Check:* the X6 brief ("meet up this weekend") ×3. Messages between people the chat has put together: 0.

**5. Work variety.** In `peoplePrompt` (131), "four different things that could fill their days" becomes "eight". This batch has 7 graphic designers, 7 teachers and 5 electricians, which give the "more blue" client joke in two chats and fuse boxes or kettles in six. *ITERATIONS:* W6 top occupation 10% (missed), W7 5 of 108. *Check:* 30 casts, top occupation ≤4%.

**6. Eval: judge-centred tally.** In `eval-prep.mjs --tally`, also print p_real minus that judge's mean, by arm and by window. That removes the 36-88 judge offset from paired arms. *Check:* the w8-batch reproduces +2.6 / -2.6.

**User decision (not an item I can make neutral myself):** the score is undefined. Either restate the target on p_real (e.g. a mean of 80 or more), or let the judge note say what 0 and 10 mean. Either way p_real should stay the headline.

**Then:** a paired batch of W7 against W9 (W7 is the better baseline), with fresh briefs, 3 seeds and a judge-centred tally. Report emoji, messages per chat and the subplot count by eye. Expect a gain from undoing W8's regressions (back to W7 level or above) plus the prop reduction. Don't expect 8 from writer wording alone while the scale stays undefined.

# W10 diagnosis (cold read of the W7 vs W9 paired batch)

Read: HANDOFF, ITERATIONS, README, both writers, w9-diagnosis, `eval/w9-batch/` (scores joined to key, all 30 judge reports, about 12 chats in full, rejects). Counts are throwaway regex scripts over the log rows. Lines refer to `writer.mjs` as it stands.

## Where W9 stands

Judges never give 10, and 8 is the mode (W9: 67 of 120). A mean of 8 needs about as many 9s as scores of 7 or less. W9 has 16 nines against 37 at 7 or less (19 at 6 or less). So the target means removing the low tail. Most of that tail has one cause:

| briefs | W7 score / p_real | W9 score / p_real | W9 scores ≤6 |
|---|---|---|---|
| no shared business (Z1 old housemates, Z2 my aunt, Z3 parkrun regulars) | 6.81 / 67 | 7.17 / 72 | 11 of 36 |
| shared business (the other 7) | 7.63 / 79 | 7.77 / 79 | 8 of 84 |

## What still separates W9 from 8, with root causes

**1. Chats with nothing shared invent "bits".** W9-Z13 has the old house gate, the fan and "14000 vs 9000", raised on all three days ("Tell the gate I'm still thinking about it"; judges gave 4/30 and 6/55). W9-Z22 has the "photo guy" timesheet five times and "Don't." twice (4/35, 5/40, 5/45). W9-Z12 has "track 7" and the tape. In W7, Z13 has "feet are dead" and 7b, and Z31 has "3 books holding it". These words dominate the low-score judge notes in both arms. *Root cause:* one author continues its own text. When the situation gives these people nothing to do together, the only material is what the opener or a person's work line seeds. The author then keeps that alive as a motif and narrates each person's work day as a subplot (Z13: pilot "Landed / Doha / Lahore sector", lab "column rerun" three times). Business briefs avoid this because the business is the material.

**2. Nightly sign-offs and insomnia beats.** Greetings and sign-offs ("Off to bed", "Night all", "gn", "morning"): W9 has 4.0 per chat, W7 has 2.6. 126 W9 messages use sleep words ("still up" twice in a row from one person, "esp is asleep lol", "anyone else awake"). Most of the 18 exact duplicate messages are "night" lines. Six judge notes flag sleep ("sleep-schedule motif again", "near-duplicate Off to bed lines"); W7 has two. *Root cause:* `Usually asleep HH to HH` (51) is now the most concrete per-person fact left on the thinned sheet, and the author performs it. It doesn't even keep people asleep: 5.4% of messages fall in the sender's sleep hours (W7 5.7%), and 5.1% fall between 00:00 and 06:00.

**3. Invented cohabiting pairs.** 8 of 15 groups whose brief implies no household have a lives-with pair (parkrun, café, garden, friends). Those pairs report on each other or bring household matters into the group: "esp is asleep lol", "Dec is still up and making a noise", Daniel and Rachel's bins in the parkrun chat ("Bins. Go on then", 5/48). *Root cause:* `lives with:` (152) asks every person, so the model pairs people up.

**4. Tidy resolution in business chats** (Z61 printer, Z83 hose washer). Same author. Items 1 and 2 remove its two main feeds: invented material and a nightly closing beat. Wording (W3, W4), a cut pass and Sonnet (W4) already failed.

**No change needed.** Emoji: judge complaints 3 to 0; the 15-25% range was a design number. Long capital-start messages with no contraction: people at 30% or more went from 23 to 9. Message density does not correlate with score (r = 0.12).

## What W9 broke

- **W9-V22 lost day 3.** After an `@claude` line the writer went on and wrote "Claude"'s answer itself. `parse` (66-74) rejects the whole reply because "Claude" is not a cast name. Three attempts failed and the chat ended, which in the live app ends the run. The root cause is that `parse` validates text that `writeDay` throws away anyway (it cuts at the first ask, 109). Related: W7-Z32 was rejected once for a reaction line under its own header.
- **The sign-off rise** (item 2 above). W9's thinner sheet left the sleep line as the only prop.

## W10 plan (ranked; every item is in casting or parsing, runs ahead of the clock, and leaves cut-and-resume unchanged)

**1. Shared business in the Setting (casting).** At 148, replace "how you know each other." with:
> how you know each other, and one or two ordinary things you have going on together at the moment that this chat gets used for.

General: for a task brief it restates the task; for "My aunt." it supplies material. The openers (154) follow it. *ITERATIONS:* W3 dropped the Setting's "last talked about" because it was reused as a prop, and W2 removed per-person appointments because they were announced. This is shared and current, but the risk is the same. Abort line: recurring cast words per run (`w3-checks/metrics.mjs`) go above the W7 batch's 0.8, or the business turns into a running bit by eye. *Check:* 6 fresh minimal briefs (for example "My brother.", "Neighbours.", "Two people who used to work together.") × 2 seeds, 2 days, against W9 on the same briefs and starts. The Setting names something shared in 12 of 12. Running bits (a non-task joke or object raised on 2 or more days), counted by eye, are fewer than W9's.

**2. Take the sleep line out.** At 51, delete `` Usually asleep ${hhmm(c.sleep[n][0])} to ${hhmm(c.sleep[n][1])}.`` Since nothing else reads it, also remove the `sleeps:` line (153), the sleep parse (163), `sleep: {}` (162), `&& c.sleep[n]` (165) and `hhmm` from the import (16). Night workers still show through the life sentence. *ITERATIONS:* per-person sleep dates from round 9 (multi-agent). The writer's night fix was the chunk shape (W3: 17% to 0.2% at 00-06). The line itself has never been tested in the writer. *Check:* 8 plain chats (fresh briefs, 1 seed, 2 days) with regex `going to (bed|sleep)|off to bed|night all|\bgn\b|goodnight|^night\b|^morning\b`. Target 2.6 or fewer per chat (from 4.0). Exact duplicate messages per chat should fall below W9's 0.6. Abort and restore the line if messages between 00:00 and 06:00 exceed 7% (W9 5.1%).

**3. Lives-with only for real households.** At 152:
> "<name> lives with:" the names of the others in this chat who share your home because of what they are to you above (family, partner, housemate), or "nobody".

*ITERATIONS:* W4 added the line for co-presence; this keeps it for real households. *Check:* 30 casts (the W9 casting set). Pairs whose `who` names no family, partner or housemate relation: 0 (W9 8 of 15 groups). Family briefs still have their pairs.

**4. Parse stops at the ask.** `parse(text, names, min, stop)` (66). After the `msgs.push` (71) add `if (stop && ASKS.test(msgs.at(-1).text)) break;`. A block whose body is only a reaction line attaches its reactions to the previous message instead of failing. `chunk` (91) takes and passes `stop`; `writeDay` (106) passes `ORACLE && asks < MAX_ASKS`, so the ask limit still lets a day run on. *ITERATIONS:* new; W5 only lowered `min` when an ask is present. *Check:* feed the three W9-V22 format rejects and the W7-Z32 one in `eval/w9-batch/rejects-all.txt` through `parse`. All parse; the V22 ones end at an ask. One `--live` fact run at speed 300 reaches done.

**5. Eval.** Run a W9 vs W10 paired batch with 10 fresh briefs, at least 4 of them minimal with no shared business, and print the tally split by that class as well as by window. The target is to close the 7.17 vs 7.77 gap. Expect the main gain there. The business briefs are already near 8, and 8 overall still needs more 9s.

# W11 diagnosis (cold read of the W9 vs W10 paired batch)

Read: the handoff files, `writer.mjs` (W10), w10-diagnosis, `eval/w10-batch/` (all 30 judge reports, about 12 windows in full, the cast Settings). Numbers are from throwaway scripts. Line numbers are for `writer.mjs`.

## Is 8 reachable with these judges?

- **Scale use.** Scores run 4-9 and no judge gives 10. Of 240 scores: 4 (1), 5 (10), 6 (23), 7 (65), 8 (112), 9 (29). An 8 means "likely real" and a 9 "very natural".
- **The judge matters as much as the chat.** Judge means run from 6.25 (j20, j15, j27) to 8.5 (j14, j23, j30). Judge means account for 0.46 of the total variance of 0.98. Two judges on the same window agree at r 0.30 (0.43 judge-centred), so the true spread between chats is only about 0.47 SD.
- **Strict judges cap the score.** j20 gives 7 to a window it calls "Very believable".
- **What 8 would take.** W10 has 16 nines against 46 scores of 7 or less. Even if every window at 7 or less became an 8, the mean would be 8.13. So 8 needs the average chat to read like today's top sixth (judge-centred +0.5), with almost no low tail.
- **Where real chats score is unmeasured.** Since W7, the anchor rule is "no real anchors for now". Measuring the ceiling once is the user's call; this report only flags it.

## What separates 9s from 7s and below

Tells in judge notes, coded by score:

| tell | ≤6 (n=34) | 9 (n=29) |
|---|---|---|
| quips, crafted, staged, callbacks | 41% | 28% (praised) |
| tidy, neat, resolves | 26% | 7% |
| slips (dates, who-did-what, geography) | 24% | 7% |
| each person narrates their job ("parallel monologues", "everyone gets a topic") | 15% | 0% |
| terse, people ignore each other, unresolved | 15% | 34% |
| local, specific texture | 3% | 24% |

- **The 9s** are terse and asymmetric. E.g. a mother's "Eat something." / "Ya" ritual, people talking past each other, outcomes left open, local texture (Germiston, R1200, "anne").
- **The low windows** are rounds of anecdotes:
  - M32 (4.5): a greyhound saga runs over two days, with a sock x-ray and lines like "I told him the principle is the outlets".
  - M41 B and V13 B: each person posts one work story in turn (a checkout bug, a knee, a found thermos, an electrician's client).

## Root causes

**1. Everyone's job gets performed, evenly.** This is the sleep-line mechanism from the W10 diagnosis again. The work entry in each life line is now the most concrete per-person fact, and BACKGROUND (51) adds "now and then something from someone's day comes up". The single author gives each person a work anecdote, tells it as a story and follows it up the next day.
- **Stock stories repeat across chats.** A sock-eating dog appears in 5 chats, two electricians' "client wants more sockets" stories in two separate chats, and "Biscuit" again.
- **W10 made it worse.** The new Setting line (152) often fills "things going on together" with each person's own job or week. That happened in 6 of the 15 W10 minimal casts, e.g. M32 "Priya is working busy shifts …, Jonah is wiring a kitchen" and M42 "sharing updates about your week".

**2. Calendar slips.** Judges check weekdays against dates ("20 December 2026 is a Sunday"). `calLine` (44) gives only the next Mondays. There are 2-3 real mismatches in 60 chats, and judges named each one.

**3. Language does not match the place.** About 19 of the 26 casts placed in non-English-speaking places text in English. One judge also flagged "a British-sounding teacher in Phoenix". Nothing tells the writer which language these people use. Non-English windows sit at +0.17 judge-centred (n=12).

**4. Tidy resolution in business chats.** Same author. Wording (W2-W4), a cut pass and Sonnet as writer have all already failed. Item 1 removes its main feed.

**5. @claude hedges** in 17 of 20 answers. V briefs score about 0.4 below B briefs, but the hedging follows the user's "sourced or couldn't find it" rule, so it is kept.

**No change needed.** Sleep beats are gone ("can't sleep" style lines 20 to 3).

## W11 plan (ranked)

Every item works in casting, the per-day prompt or code. All run ahead of the clock, and cut-and-resume is unchanged.

**1. Code draws, per day, whose day may come up.**
- At 51, cut BACKGROUND's "; now and then something from someone's day comes up, unplanned" so it reads "Their days are ordinary."
- In the main loop (213), per day: `const today = Math.random() < 0.5 ? null : pick(c.names);` (a design parameter).
- Pass `today` through `writeDay` → `chunk` → `promptFor`. Resumes after @claude reuse it, and it is logged.
- At 63, after BACKGROUND: `${today ? `\n\nSomething from ${today}'s own day may come up today.` : ''}`

The author performs whatever the sheet names, so this gives about one anecdote a day instead of one per person. It is the W9 lesson (decisions in code), not new wording.

*ITERATIONS:* unlike W2's appointments it names no event; unlike round 12's per-turn reason it is one line a day, absent half the days.

*Check:* 10 w10-batch briefs, plain, 1 seed, 2 days, W10 vs W11 on the same starts.
- A Haiku labeller marks "the sender reports their own day, not what the chat is discussing". Count distinct people with such a report per chat-day.
- Target: half of W10's count.
- Abort if messages per chat fall more than 25%, or if a read of 4 minimal 1:1s finds them plan-only.

**2. Keep the Setting's business shared (casting, 152).** Change the end of the Setting line to:
> one or two ordinary things you have going on together at the moment that this chat gets used for (shared between you, not one person's own job or week).

*ITERATIONS:* this refines W10 item 1.

*Check:* 30 casts.
- Minimal casts whose business is each person's own job or week: 6 of 15 → 0.
- Colleague and volunteer briefs still name their shared task.

**3. Full calendar (44).** Replace "The next Mondays: …" with every date for 8 weeks:
```js
`${todayLine(at)} Coming dates: ${Array.from({ length: 56 }, (_, k) => { const x = new Date(+d + k * 864e5); return `${WD[x.getUTCDay()]} ${x.getUTCDate()} ${MON[x.getUTCMonth()]}`; }).join(', ')}.`
```
Drop the now-unused `m`.

*ITERATIONS:* W6 added the Mondays ("too few mentions to tell").

*Check:*
- A weekday-date regex (weekday + day number + optional month, checked against the story year) over the item 1 chats plus 20 more. Target 0 mismatches.
- Stamp rejects do not rise.

**4. Language from casting (146-168, 63).**
- In `castPrompt`, before Setting, add: `One line starting "Language:": the language these people text each other in.`
- `parseCast` sets `language: f('Language')`, optional so old casts still work.
- Line 63 becomes `Setting: ${c.setting}${c.language ? ` They text each other in ${c.language}.` : ''}`.

*Check:* 30 casts.
- Language is filled in 30 of 30.
- Casts in non-English-speaking places come out in English 0 times unless the brief says so; locally mixed language such as Singlish is fine.
- Format rejects do not rise.

*User decision:* a user typing an English brief may then read French. If they want English chats, the root-cause alternative is a language-tagged place list (a design list) drawn by the brief's language.

**5. Eval.** Run a W10 vs W11 paired batch: 10 fresh briefs (at least 4 minimal), 3 seeds, split by class, with the judge-centred tally as the comparison. Before more rounds chase a mean of 8, the user may want to decide on measuring the judges' ceiling once (see top).

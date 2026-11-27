# W12 diagnosis (cold read of the W10 vs W11 paired batch)

Read: HANDOFF, ITERATIONS (all), README, `writer.mjs` (W11), w11-diagnosis, `eval/w11-batch/` (all 30 judge reports, tally, keys, casts, about 10 windows in full). Numbers come from throwaway scripts over `chats/*/log.jsonl` and the judges' SCORES blocks. "Centred" means judge-centred. Line numbers refer to `writer.mjs`.

## Why the minimal briefs rose, and whether it is real

**The driver is the English-speaking places (W11 item 4).** The other items show no effect.
- In W10, 10 of the 15 minimal casts were set in non-English places (Karachi, Hanoi, Casablanca, Lima and others). The 5 W10 minimal chats set in English-speaking places score +0.46 centred, against −0.26 for the rest. W11's minimal chats score +0.52.
- Within each brief, the English-place W10 chats score higher in all 4 briefs that have both kinds: M1 +0.81 vs −0.17, M3 0.97 vs 0.43, M4 0.01 vs −0.10, M5 0.27 vs −0.13.
- The M2 jump (6.50 → 7.83) is W10's Karachi and Hanoi chats. Judges called those "separate vignettes" and "staged for atmosphere" (bia, Fahasa, banh gai).
- In English-speaking places the judges praise native idiom ("Leave it so", Bunnings, esky, Heuston).
- Language itself is not the tell: W10's chats written in Spanish or French scored 8-9.

**The Setting-shared fix does not explain it.** The W10 minimal casts whose Setting was about each person's own work (M32, M33, M41, M43) score no lower.

**The gain is real in direction; the level is flattered.**
- Paired by brief, 4 of 5 rose and 1 was flat, for a mean of +0.65.
- But 3 of the 5 minimal briefs are 1:1s, and both arms found these easy (W10 7.97, W11 8.42).
- W11's group chats average 7.56. In the W10 batch the 1:1s were the low ones (7.39), so 8.25 is partly this brief mix.

## What holds the business briefs at ~7.4

All 5 business briefs are group chats.

**1. W11's per-day "whose day" line (64, 215) causes the lowest W11 windows.** The writer acts out the named person's day as an apology plus a work anecdote, and the line leaks into the text.
- **Apologies.** 22 of the 31 "Sorry, was …" messages in W11 come from the drawn person on their drawn day. Examples: "sorry was on a callout since 6. geyser in salt river…"; "Sorry, been on site since 7…".
- **Verbatim leak.** In B12, Thabo writes "Something from my day. The bylaw officials…". That window scored 5/5, and both judges named the "neat excuse with a tidy backstory".
- **Leak into a name.** On Rowan's drawn day, Rowan writes "Rowan's car is in the shop". That window got 3 from one judge, who called it a generation error.
- **Calendar slip.** On Grace's drawn day she writes "a friday rush", stamped Thursday 23:48. That window scored 6/3.
- **Work talk rises.** Messages with work words: drawn person 7.8%, others on drawn days 6.5%, days with nobody drawn 4.9%.
- **Net effect.** Business windows go from −0.45 centred in W10 (non-English places) to −0.36 in W11. Without the two windows hit by the line, W11 is −0.07: the place gain was eaten by this line.
- **W11's own check missed the target.** Own-day reports per chat-day were 1.40 vs 1.47. The line adds anecdotes rather than replacing them.

**2. Everyone shows up every day and every ask gets answered.**
- In groups, the share of members who post on a chat-day (days with 5 or more messages) is **1.00 in both arms**.
- The code-drawn "only now and again" people still post 0.82 of an even share.
- Only 8% of questions go unanswered for an hour, and each gets 1.4 responders.
- Judges say: "everyone responds on cue", "a sequence of offers and confirmations is very orderly", "each person posts a vignette in turn", "list-like, threads each resolve neatly".
- The volume sentence in the cast barely moves the single author, who gives every person on the sheet a turn.

**3. Casting invents an org chart.**
- B1 ("Organising a school fundraiser.") came out as PTA chair, treasurer, teacher sponsor, volunteer coordinator, student representative. Other casts add a principal and a 16-year-old student.
- B1 is the lowest brief in both arms (7.00, 6.67).
- Judges: "Frank's formal tone", "each person's job neatly distinct", "everyone very polite".
- Each title becomes a register and a duty to perform.

**4. Parse slips.**
- A message that was only "( 1)" (W11-V12, named by both judges): a reaction line the parse missed (probably spacing), whose emoji `emojiDrop` then stripped.
- A reaction line placed before the text (W10-B12, named by 2 judges).

**Looked at and not changed:**
- **"Can't sleep" late-night beats.** 9-10 of 30 chats in each arm have one. Judges praised them in four 9-scored windows and flagged them as a cross-file motif twice.
- **Repeated jobs.** Accountant 6 and electrician 5 of about 100 people. This is only visible across files.
- **The calendar line.** No real weekday slips this batch apart from the one above.

## W12 plan (ranked)

Every item runs per day or at casting, ahead of the clock. @claude cut-and-resume is unchanged: a resume reuses the day's line.

**1. Remove the whose-day line, and use its plumbing for item 2.**
- 64: replace `${today ? `\n\nSomething from ${today}'s own day may come up today.` : ''}` with `${today ? `\n\n${today}` : ''}`.
- Keep "Their days are ordinary." The W10 line "now and then something from someone's day comes up" stays out.
- *ITERATIONS:* this undoes W11 item 1, whose own check failed.
- *Check:* 10 briefs × 1 seed against W11 (same casts, list mode).
  - "Sorry, was/been" messages per business chat: 2.1 → at most W10's 0.6.
  - Senders naming themselves: 0.
  - Work-word share at most 4.9%.

**2. Per-day presence in group chats, drawn in code.** This replaces the per-chat volume sentence.
- At 215, replace the `today` draw with:
```js
const lead = c.names.find(n => /a lot/.test(c.cast[n].texts ?? '')), seen = ['looks in now and then', 'looks in once or twice', "doesn't look at it"]; // design odds
const today = c.names.length < 3 ? null : `Today in this chat: ${c.names.map(n => `${n} ${n === lead ? 'is on it a lot' : pick(d === 0 && n === c.names[0] ? seen.slice(0, 2) : seen)}`).join('; ')}.`;
```
- 53: drop `${p.texts ? ' ' + p.texts : ''}`, so there is one volume channel, not two. `textsFor` still marks the lead.
- *ITERATIONS:*
  - It works like the co-presence negation that held (W9 item 4, 0 of 3), not like W11's additive cue, which the author acted out.
  - It is not W5's silent-day allowance: the lead is always present, and nothing says a day may be empty.
  - It is the same kind of design draw as W8's volume.
- *Check:* group briefs (B1-B3, V1, M2, M4) × 2 seeds against item 1 alone.
  - Members posting per chat-day: 1.00 → about 0.75.
  - Questions unanswered for an hour: 8% → 15% or more.
  - "Sorry/missed" catch-up messages: no higher than item 1 alone.
  - Messages per chat: abort if down more than 30%.
  - Read 4 chats for monologues.

**3. No invented titles in casting.**
- 136: change `e.g. "58, woman, the parent" (no character traits)` to `e.g. "58, woman, the parent" (no character traits, and no title or duty the situation doesn't give them)`.
- *ITERATIONS:* casting wording that names an output field has held before (W10 knows line, 7 → 0; W7 place).
- *Check:* casts for 6 group briefs × 3. Title words (chair, treasurer, coordinator, representative, sponsor, secretary, principal) in `who` where the brief names none: B1 9 of 15 → 0. Colleague briefs still get their jobs (baker, counter).

**4. Tolerant reaction lines (72-74).**
- Match a reaction line with `/^\(\s*((?:\p{Extended_Pictographic}️?[^,()]*?\s*\d+)(?:\s*,\s*\p{Extended_Pictographic}️?[^,()]*?\s*\d+)*)\s*\)$/u`. Split the counts with `/\s*,\s*/` and `/^(.*?)\s*(\d+)$/`.
- Test the first body line as well as the last. A reaction line in either place is taken out of the text.
- *ITERATIONS:* this extends the W10 parse fix.
- *Check:*
  - Unit test on "( 👍 1)", "(👍1)", "(👍 2)\ntext" and "text\n(😂 1, 👍 2)".
  - Bracket-count messages in the check chats: 0.

**5. Eval: W11 vs W12 paired batch.**
- 10 fresh briefs × 3 seeds, 2 days.
- At least 6 briefs should be groups (minimal and business both), and `classes.json` should also carry `group` or `1:1`, so the tally separates brief type from chat size.
- One `--live` fact run to confirm the resume keeps the day's line.

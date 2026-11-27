# W12 diagnosis (cold read of the W10 vs W11 batch and the two demos)

Read: HANDOFF, ITERATIONS, README, `writer.mjs` (W11), w11-diagnosis, all 30 judge reports (ids mapped to labels), ~10 chats in full, every cast Setting, both demos. Numbers are from throwaway scripts. Line numbers are for the current `writer.mjs`. It carries an uncommitted edit for casts that are not people (`c.place === null`), which keeps line numbers the same and is left alone here.

## 1. Why the minimal briefs rose

The rise comes from the place list (item 4), and it is real.

| windows | n | score | judge-centred |
|---|---|---|---|
| W10 minimal, English-speaking place | 20 | 8.00 | +0.46 |
| W10 minimal, other place | 40 | 7.40 | −0.26 |
| W11 minimal | 60 | 8.25 | +0.52 |

W10's minimal chats set in English-speaking places already score what W11 scores. Ten of W10's 15 minimal casts were set elsewhere (Hanoi 5.25, Karachi 6.5), and judges flag that ("set in Italy but written in English", j27). The per-day draw did not cause the rise. Caveat: only 5 W10 chats sit in that first row.

## 2. What holds the business briefs at ~7.4

**A. W11's `today` line breeds "sorry, [work vignette]".** Holding place constant, business did not gain: W10's B1-B3 chats outside English-speaking places scored 7.25, and W11's B1-B3 scored 7.28.
- "sorry" went from 1.6% to 3.7% of business messages, and thanks from 1.0% to 3.0%.
- The new apologies are excuse vignettes: "sorry was on a callout since 6. geyser in salt river… she made me tea anyway", "Basement flooded in the stacks".
- On drawn days, the drawn person writes 20 of the 33 excuse/day-report messages while sending 32% of the messages.
- The line leaked word for word: B12 has "Something from my day. The bylaw officials…". j18 and j24 scored that window 5 and named "each person explaining their day".
- W11's own check missed its target (1.40 vs 1.47 reporters per chat-day). The line concentrates the anecdotes on one person; it does not reduce them.

**B. Everyone appears every day.** In 63 of 63 group chat-days (both arms, both classes), every member posts. The single author gives each person a cue, so every slot gets filled and every question gets answered. Judges name it: "everyone responding on cue" (j22), "offers and confirmations very orderly" (j12), "threads resolve neatly" (j28), "totals match" (j9). Task chats show it most. `textsFor` (163) sets volume per chat, never per day.

**C. Slips** (about 4 in 60 chats): "Rowan's car is in the shop" written by Rowan (B21), a "friday rush" mentioned on a Thursday (V12), date muddles (M11, B13). I found no cause that the prompt or code controls: the calendar is already exact, and Sonnet as writer did no better (W4).

**D. A ghost message from a reaction.** V12 has Ethan sending "( 1)". The writer put a reaction line under Ethan's own header, the parse kept it as text, and `emojiDrop` removed the emoji. j8 scored that window 3.

## 3. Causes of the user's observations

- **"(😂 2)" in a 1:1.** The prompt asks for anonymous counts (line 64). The code cannot know who reacted, so impossible counts and self-reactions pass. They are logged with `who: ''` (211) and sent to the viewer as N anonymous reactions (187). D has the same cause.
- **The same crush beat twice.** The secret line (54) says "may hint at it or tell someone in the chat when it fits, or not yet". The author plays that out in order across the days:
  - hint: "can I ask you something random"
  - not yet: "nvm"
  - tell: "not over text", then coffee

  Both secrets mirrored each other, so both demos ran the script.
- **Related sameness in the Settings.** 11 of 15 W11 minimal Settings, and both demo Settings, are "planning a birthday, Christmas or braai event" (W10: 8 of 15). This is Haiku's most likely answer to "one or two ordinary things you have going on together" (153).

## 4. What W11 broke or didn't work

**Item 1 (the `today` draw) comes out.** Its check missed, it leaked word for word, and the extra business excuses track it. Keep "Their days are ordinary."

**Items 2-4 stay.** Judges check dates and praise consistent ones (j18, j20).

## 5. W12 plan (ranked)

Every per-day draw happens in the main loop before that day's call. An @claude resume reuses it, and nothing is rewritten after release.

**1. Remove `today`.**
- At 64, delete `${today && c.place !== null ? `\n\nSomething from ${today}'s own day may come up today.` : ''}`.
- At 214-215, drop `todays` and `today`. Item 2 reuses the slot.

*Check:* B1, B2, V1 × 2 seeds. Excuse/"sorry" rate at or below 1.6%; "my day" 0.

**2. Per-day presence in groups, drawn in code.** This refines `textsFor`; it sets who is around, not what anyone says.
- At 215, per day:
```js
const away = c.names.length < 3 ? [] : c.names.filter((n, j) => !(d === 0 && j === 0) && Math.random() < ({ 'now and then': 0.25, 'only now and again': 0.5 }[c.cast[n].texts.match(/now and then|only now and again/)?.[0]] ?? 0));
```
  The two odds are design parameters.
- At 64, after BACKGROUND: `${away?.length ? `\n\n${list(away)} ${away.length > 1 ? "don't" : "doesn't"} open this chat today.` : ''}`.
- Log `away` in the head row.

*ITERATIONS:* this is not W5's silent days, since the chat itself stays live. It follows the away flags of rounds 4-5, which helped, and the W9 lesson of deciding in code.

*Check:* B1-B3, M2, M4 × 2 seeds.
- Group chat-days where every member posts: 100% → at most 70%.
- People drawn as away post 0 messages that day.
- Questions left without a reply for 2 h become more common.
- Abort if messages per chat drop more than 25%, or if "sorry, was…" rises above 1.6%.

**3. Reactions name who reacted.**
- At 64, the reaction sentence becomes: `If others reacted to a message, put a line like "(👍 Sam, 😂 Priya)" directly under it: each emoji with who sent it.`
- `parse` (72-74) reads `emoji Name` entries and keeps one per person, only for cast names other than the sender. A block from X that holds only a bracketed reaction becomes X's reaction to the message before it.
- `reacts` becomes `[[emoji, who]]`. `transcript` (55) shows names to the writer.
- The log (211) and the viewer (187) get the real `who`. `eval-prep` still shows judges counts.

*ITERATIONS:* counts were chosen against copying between agents (rounds 13-16). That doesn't apply to a single author, and readers still see counts.

*Check:*
- Unit-parse "(😂 2)", a self-reaction, and "--- Fri 17:15, Ethan\n(👍 1)".
- Regenerate the 2 demo specs and 4 group briefs: reactions by the sender or by non-members 0; text that is only a reaction 0; reactions per message within ±50% of 3.5%.

**4. Take the script out of the secret line.**
- At 54, replace `It is on ${n}'s mind; ${n} may hint at it or tell someone in the chat when it fits, or not yet.` with `It is on ${n}'s mind.`

*ITERATIONS:* W2 found secrets surface only when they are on the person's mind, so that part stays.

*Check:* both demo specs × 3 seeds (`--gen` with secrets).
- Hint/retreat beat ("ask you something", "nvm", "not over text"): 2 of 2 → at most 2 of 6.
- The secret still surfaces in at least 4 of 6.
- If the beat stays at 3 or more of 6, this round also applies the opener mechanism to the secret: casting writes four ways it could go and the code picks one. Watch for re-asks (round 12's hidden director).

**5. Vary what is going on (casting).**
- At 153 (people branch), end the Setting at "how you know each other." and add: `One line starting "Going on:": four different ordinary things these people could have going on together at the moment that this chat gets used for (shared between them, not one person's own job or week), separated by " | ".`
- `parseCast` (164): `going: pick(options)`, optional, so old casts still load.
- At 64: `Setting: ${c.setting}${c.going ? ` At the moment: ${c.going}.` : ''}`.

This is W7's opener mechanism (8 of 8 openers distinct) applied to W10's business line.

*Check:* 15 minimal casts.
- Event planning: 11 of 15 → at most 7 of 15.
- Task briefs still name their task.
- The opener fits the picked item in 10 of 10.

**6. Eval.** W11 vs W12 paired batch: 10 fresh briefs (at least 4 business with 4+ people), 3 seeds, tallied by class and judge-centred. Add one secret brief per arm, read by eye.

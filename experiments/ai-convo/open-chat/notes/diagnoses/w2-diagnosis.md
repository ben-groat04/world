# W2 diagnosis (cold read of W1)

## What gives W1 away, and why

**1. People who type with capitals sound like Claude.** The judges' top complaint is "fixed register per person" (Mei, Carlo, Aoi, Dan, Priya, Ahmed, Tomasz, Haruka). Judges praise the lowercase speakers. Speakers who use capitals for more than 60% of messages average 14.8 words a message (lowercase: 10.5), use thanks words in 9% (4%) and name someone in 20% (11%). Fresh casts show the same gap.

Root cause: the cast `style` line carries tone and length, not just typing: "longer messages… polite sign-off" (Mei), "polite and tidy" (Nadia), "lots of exclamation marks" (Daisuke's "!!" in nearly every line). The writer shows the contrast in every message. Neither "when it shows" (writer.mjs:36) nor "most messages are plain" (writer.mjs:34) stopped it: the habit-marker share rose from 0.51 to 0.65. Most remaining names come from these speakers.

**2. The cast is a list of plot hooks, and the writer uses every one.** The life line's "what is going on in your life this week" (writer.mjs:84) gives each person one appointment: Cara's dentist, Nadia's parents' evenings, Mei's field trip, Jess's marathon clinic. Each one gets announced, which is what judges call "everyone lists their busy week, stock reasons". The listed content beats "nobody announces their week". Judges noticed the same items recurring across casts (dentist, marathon).

On fresh casts, `likeSpec` (writer.mjs:70) asks "who you tease, who you look out for". In G3 that becomes staged bits nobody set up (the bento rota, "THERE'S ALWAYS CAKE"): the catchphrase and running-joke tell.

**3. Tidy, prompt turn-taking, and every message advances the plot.** 74-96% of messages with a "?" get an answer from someone else within 2 h. The work chats read as project-management scripts. The system prompt, "message history of a chat **for a story**" (writer.mjs:19), plus a 24 h block to fill means each call plots an arc that resolves. That outweighs "a question can sit unanswered".

**4. Chunks break at 19:00, the start time.** 26% of all messages fall in the 19:00 hour, against 5-9% for other evening hours: each chunk opens with a burst and fills up to its end. Events get cut off (T41 ends on "Which exit exactly?" and the date is never written). There is one duplicate message at a boundary (U21). Day 2 copies day 1's template: "bien dormi toi ?" both mornings, "morning." at about 07:50 twice, 12:20 used as a time 10 times.

**5. Continuity slips when Haiku doesn't think.** Day-1 calls had 0 thinking tokens in 9 of 9 runs. The slips:
- Kenta answers his own question.
- "jeudi pour samedi", and "départ 8h" sent at 12:58 (U21).
- "Dentist on Wed" sent on Wednesday (T11).
- Muddled Perrache/Dijon geography (U21).

**6. Secrets never surface (0/9).** The secret sits inside the block that BACKGROUND says "never comes up", next to "Nobody else acts as if they know it".

Reactions, volume and big-group spread are fine. Leave them alone.

## Ranked plan for W2 (one set, a cheap check per item)

**1. Style is typing only.**
- writer.mjs:88 style spec:
  > `"<name> style:" one plain sentence, in the second person, on how you type: capitals, punctuation, emoji, abbreviations. Only the typing, not tone, length or politeness; most people type in a fairly ordinary way.`
- writer.mjs:33, append to TEXTING:
  > `Someone who types with capitals and full stops still talks as plainly as everyone else: no polite padding, no full explanations.`
- Check, on the 9 old casts plus 5 fresh `--gen` briefs: the capitals-vs-lowercase gap in words, thanks and names should halve, names ≤10%, top habit-marker share ≤0.51. Abort if the share of lowercase messages rises more than 10 points.
- New versus ITERATIONS: W1 tried how often a habit shows; this targets tone.

**2. Take the hooks out of the cast.**
- writer.mjs:84, life line: replace "your occupation and what is going on in your life this week… not all of it" with:
  > `your occupation, who you live with and how your days usually go. Ordinary circumstances that fit the situation; no appointments or events for this week.`
- writer.mjs:70 likeSpec:
  > `in the second person, one or two short sentences: your temperament and sense of humour, and what you have opinions about. An ordinary person, not a type.`
- writer.mjs:34, replace BACKGROUND's first sentence with:
  > `This is background you know as the writer. Their days are ordinary and you know what happens in them; now and then something from someone's day comes up, unplanned.`
- Check (fresh casts only): grep for "dentist", "appointment" and "this week" (should be near 0). Count self-schedule announcements by eye on 5 chats against W1. Abort if messages per day fall below 8 or the chats become only topic logistics.
- Round 19 found the like-template; the Setting keeps round 8's common ground.

**3. Secrets out of the background.**
- writer.mjs:36: drop the secret clause.
- writer.mjs:42: after `${BACKGROUND}` add:
  > `Only ${n} knows this, at least at first: ${s} It is on ${n}'s mind; ${n} may hint at it or tell someone in the chat when it fits, or not yet. Nobody else knows it until ${n} says it in the chat.`
- Check with `secrets.json` on the 9 casts: the owner hints or tells in ≥3/9, others refer to it before it is revealed in 0/9 (`leaks.mjs`).

**4. Chunks break at 04:00.**
- writer.mjs:112: the first chunk runs from the start to the next 04:00 (or the one after, if the next is under 6 h away), then 04:00 to 04:00.
- writer.mjs:41: print the real span, not "(24 hours)".
- Check: the 19:00-hour share should go from 26% to ≤12%, with 0 same-sender near-duplicates (≥60% word overlap) across boundaries.

**5. Drop "for a story".**
- writer.mjs:19:
  > `${ENV_NOTE} You write out the message history of a chat between people who know each other.`
- Check: share of "?" messages answered within 2 h (74-96% now), messages per day, then judges.
- Round 7 tested a fiction framing on multi-agent (no gain); this is the reverse, in a single writer. Do it after 1-4 so their effects stay attributable.

**6. Effort arm** (W1 plan item 8).
- writer.mjs:21: `'--effort', process.env.EFFORT || 'low'`. Run medium against low on the W2 casts.
- Check: continuity slips per chat by eye (W1: U21 3, T41 1, T11 1), day-2 template repeats, day-1 thinking tokens.

## Evaluation
- Fresh briefs, including minimal ones ("Cousins.", "my ex") and the held-out set, 3 seeds each.
- W1 against W2 end-to-end, paired by brief: casting is part of the change.
- Effort medium as a third arm.
- Neutral judges, plus judge-detect.

## Order, with @claude and the live app
1. Items 1-4, cheap checks, item 5, then the judged batch, with effort in the same batch.
2. Live app once W2 is at or above W1. The 04:00 chunk is the live unit: write the next one while the current one releases on the story clock into `live_turns`.
3. @claude last, as a cut-and-resume inside the live loop's pause/release. Check its ask rate and any leaks of the answer, on casts that need a fact.

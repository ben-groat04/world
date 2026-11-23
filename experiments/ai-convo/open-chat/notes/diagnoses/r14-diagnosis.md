## Round 14 cold read: why the chats are short, what else gives them away, and what to change

I read all 9 transcripts and log.jsonl in full and wrote small read-only Python counts over the logs. I edited nothing and launched no runs.

### Why the chats are short

It is partly realistic restraint and partly mechanism.

**Where quiet is plausible:**
- **T2 and T6 (coworkers):** they share an office, so a quiet chat makes sense.
- **U3 (cousins):** "yo voy" ×4 is how people confirm a lunch.
- **U1 (housemates):** plausible.

**Where it is not:**
- **T4 (dating-app match a week in):** 5 messages, then 2 days of silence.
- **T3 (siblings):** Tara finds a photo of Mum at her 50th while the chat is planning Mum's 60th, and passes.

I have no sourced base rate to compare against, so this judgement is qualitative.

**Turn outcomes (all 9 runs):**
- Openers posted 9/9.
- Unprompted looks: 41/143 posted (29%). The coder's round-14 replay of the same kind of turn got 53%.
- Notification looks: 87/233 posted (37%).
- Looks skipped because the Small thing was "nothing": 29 of 169 refreshes. This is minor.

**Mechanisms I could measure:**

1. **Messages already seen are shown again as "(new)": 169 of 376 turns (45%).** A quiet look isn't kept (round 12), so `from = kept[n]` (run.mjs:129) puts the "(new)" marker back at the last *kept* look.
   - The agent sees 12-hour-old messages as just arrived, under a header saying "You last looked Mon 15:33".
   - It re-reacts to them: 20 of 143 looks ended in a REACT on a message it had already seen. That is logged as a PASS, and the look is used up.
   - It also answers stale things. Marta posts "ok 9:00 monday, i'll be there" on Monday at 22:13, about a meeting that was already over. Ravi's "Deal" lands 5 hours late.
2. **The Day often leaves out the Small thing.** In 69 of 140 refreshes, fewer than 40% of the Small thing's content words appear in the Day.
   - Examples: Tara's Day says "You propped that photo on the fridge" but never says what the photo shows. Priya's says "You saw the news" but not what news. Jamie's pitch booking is missing altogether.
   - Cause: the model writes "Small thing:" first and then treats it as already said.
   - Looks post 34% of the time when the Small thing is in the Day, 23% when it isn't.
3. **The agent won't text twice in a row.** When its own message is last on screen, a look posts 9/35 times (26%). Nothing in the cast says how often a person messages this chat unprompted, so Haiku defaults to staying quiet. This is what kills T4.
4. **The run settings.** DAYS=2 ends T2 on Tuesday, before its Friday crunch, and leaves only 3 runs long enough to judge.

### Everything else that gives them away

- **Protocol leaks:**
  - Rhona's raw reply was `PASS\n</br>`. `lastLine` reads `</br>` as the last line, so the reply was polished and posted as "Pass.". Rhona then apologised for it ("that 'Pass.' was a slip").
  - The polish output leaked its own framing ("Draft: …" and "Mateo's version:"), posted as two messages. This happened once in 160 replies.
- **Plans restated:** "sunday 6 hope and anchor" appears 6 times in T1.
- **Assistant cadence survives polish:** Tom: "Let me know which you go for." Daichi: "…if that works for you." This comes from the round-14 polish rule "changing as few words as needed".
- **Reactions:** a 😂 reaction on nearly every quip (13 reactions in 39 messages in T1).
- **Name clash:** Ailsa's pupil "Callum" has the same name as chat member Callum, which led to "you're in a different chat now".
- **Logic and role slips:** "can't wait till Monday" said on a Sunday; in T2, Rui tells Marta "you don't need to come early" for a 9:00 he was told is before they arrive.
- **Caricature:** Shona's ALL-CAPS style.
- **Small things come out as show-and-tell:** Bex's "chain off" joke appears twice.

### Plan, ranked

**1. Put "(new)" where the person last actually looked** (run.mjs:116-119, 132). This keeps round 12's rule that quiet looks stay out of memory; it only stops the screen pretending old messages are new.

Change 116 to:
```js
function screen(n, from, extra = [], shown = from) {
  const mark = …, old = convo.slice(Math.max(0, from - RECENT), shown).map(mark),
    nu = [...convo.slice(shown).map(m => ({ at: m.at, s: mark(m) })), ...extra]…
```
Change 132 to `screen(n, from, extra, firstShown)`.

Then update the README "Memory" paragraph: messages since the last kept look show above "(new)", and only unseen ones show below it.

Cheap check: rebuild screens from the R14 logs with the new function and count already-seen messages under "(new)" (169/376 now, target 0). In the next batch, count REACTs on already-seen messages (20 now) and stale replies.

**2. Have the generator write the Day first, then name the Small thing by copying it from the Day** (run.mjs:243-244). This makes round 14's "small thing inside the Day, unlabelled" true by construction. It does not add a reason.

Replace the last paragraph of the prompt with:
> Reply with exactly two parts. First the day, on one line starting "Day:": two or three short sentences of what actually happened. If something happened that ${n} would want to tell these particular people because it connects to them or to what they share (…as now…), it is one of those sentences, told in full. Then a line starting "Small thing:": that sentence copied word for word, or "nothing".

Line 244 then needs `fieldOf(j.text, 'Day')` without the `rest` flag; with it, the Day would swallow the Small thing line.

Cheap check: on about 20 rebuilt refresh inputs, count how often the Small thing appears in the Day word for word (target 90% or more; about 50% now). The "nothing" rate should stay around 17%.

**3. Make the cast say how often each person messages the chat** (run.mjs:211). Change the start of the `texts:` line to:
> "<name> texts:" one or two plain sentences, in the second person, on how you text in this chat with these people: how often you message it without being asked anything, then capitals, punctuation, …

It reaches the agent through "How you text:". It is per person and drawn from the situation, so it is not the NOTE-wide norm that read as "hold back" in round 11.

Cheap check:
- Run GEN_ONLY on 6 briefs, including the dating match and siblings; the frequencies should vary (not all "rarely").
- Then run `replay.mjs turns --kind look` on R14 with the edited "How you text" line. Look post rate is 29% live now; also break it out for looks where the agent's own message is last on screen (26% now).

**4. Ignore stray tag lines when reading the last line** (prompts.mjs:13):
```js
.filter(l => l && !/^<\/?[a-z]+\s*\/?>$/i.test(l))
```
Cheap check: `isPass('PASS\n</br>')` returns true; grep every run's `raw` for tag-only lines to see how often this happens.

**5. Use sc.sh's own DAYS values (3 to 6.25) instead of DAYS=2.** Each topic's timeline then falls inside the run (T2's Friday) and more runs reach 50 messages to judge. This changes run settings, not code.

**6. Diagnostic before changing anything else.** Replay R14 look turns fresh, with no saved session (`replay.mjs turns --kind look --n 5`).
- If the fresh rate is near 53% against 29% live, the resumed session is holding agents back. Compare against a STATELESS run.
- If the fresh rate is also low, the cause is in the prompt.

### Not proposed, and why

- **Bringing back a per-look reason or want** (to raise post rates): round 12's hidden director, already removed in round 13.
- **A polish rule against restating plans:** round 14 tried a stricter version, it dropped real content and was reverted. The repeats are visible, but leave them until fixes 1-3 are in.
- **Loosening polish to reduce the assistant cadence:** round 14 tightened it to stop added words. This needs a judged comparison, not a hunch.
- **Name clashes and polish framing leaks:** rare (1-2 cases). Watch them; a fix now would be clutter.

Fixes 1 and 2 correct round-14 mechanisms that didn't do what they were meant to; neither undoes an earlier round. Nothing needs restoring from an earlier round.

My count scripts are at `/tmp/claude-0/-home-user-world/f8895907-66f8-5315-a40a-9b9125a9ca28/scratchpad/p6/an.py` (loader only; the counts were run inline).

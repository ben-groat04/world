## Round 17 cold read

**Versus round 16.** These were different worlds with one window per scenario, so the score movements are suggestive only.
- **Better:**
  - All 9 openers posted (round 16: 2/9 passed).
  - Names fell from 27% to 11%.
  - Polish DROPs fell from 17 to 5.
  - The 1:1 dating run (T4) went from 4.3 to 7. Judges no longer named over-attentive questioning, which fits the NOTE change to "asks you something" only.
- **Worse:** the group A windows fell. T1 went 6 → 4.7, T3 6.5 → 4, T2 5.5 → 5.3, U2 is 5.3. Overall A-window mean 5.9 → 5.3.
- **Unchanged:**
  - Volume: 275 posts vs 297.
  - Reaction share: 0.39 of acts vs 0.38.
  - Echoes are still named. The polish echo sentence moved overlap only from 10.1% to 9.0%; the raw drafts are at 10.9%.
- I found no group drop that I can pin on a round 17 change. The biggest tell below is in the life generator, which round 17 did not touch.

**Cause of the polish leak.** It was the polish call itself (T1, row 200, 125 output tokens), not the agent. The output had three parts: the draft unchanged ("Ta. Just getting my coat off."), then its reasoning ("Rewrite: … the 'Ta' is a thank-you opener, so it gets cut … only repeats what the chat already shows, but … stays"), then the answer. `splitReply` split that on blank lines and all three posted (22:45, 22:50, 22:51).
- Root cause: at `--effort low` (thinking_tokens 0) Haiku has nowhere to weigh competing cut rules except in its answer. It weighed "cut thanks", "only repeats what's in the chat" and the DROP clause out loud.
- The reasoning cites mostly round 16 rules. Round 15 had a similar leak, and the replay leak count went 3 → 3. So it is a standing rate of roughly 1 per batch, not something round 17 introduced.

**Cause of the refusals.** All 10 came after the leak. 10 of the 12 agent turns that had the "Rewrite:" message on screen were refused with `[reasoning_extraction]`, and 0 turns without it were. The classifier reads model reasoning in the context as an extraction attempt. Posts stop at 22:51 Saturday, so T1 lost its last ~26 hours, and its B window scored ~0.7. Fixing the leak removes the trigger, so no refusal backstop is needed.

**What still gives these away, with root causes**
1. **Recurring props and in-jokes** ("edges/scarf/jam", hot water bottle ×5, "rain on the zinc"): judges named these in 4 of 6 windows. The cause is `dayAsk`. It reads the whole chat and is asked for things that "connect to what they share", so it builds the chat's objects into people's days, and the agents then post them.
   - T1 Days: Callum "cut the edges of the living room wall", Rory "finished the edge-case checks", Shona "lifted the shortbread lid to check the edges".
   - U2: Fiona's Day "found the old hot water bottle".
   - T4: Adaeze's Day has *Tunde's* zinc roof.
2. **Texting people they are physically with.** The T1 pub sequence ran 19:21–22:45: "through the door" at 20:10, "found you" at 21:22, "just got here" at 22:30. That gave judges the timeline contradictions.
   - Every post notifies everyone, and nothing tells an agent it is with the others.
   - No refresh was due inside that window: refreshes come every 3.6–10.8 hours.
   - Later Days also misdate the plan: on Sunday, Callum's Day has him ring Rory "to confirm Saturday", and Eilidh's has her Saturday shift swapped "so you're free for the bar".
3. **Parallel quips** (fox ×3 within 11 minutes) and phrase echo. These come from the raw drafts, and polish can't fix them.
4. **Uniform acknowledgement reactions.** About a third of group turns are REACT. When a message already has reactions, 72% of new reactions copy the existing emoji, giving rows like 🔥×4 or 🎉×3.
5. **Tidy, agreeable resolutions, and a capitalised vs lowercase split** inside one cohort, despite the casting prompt asking a cohort to share a register. The polish rule "changing as few words" keeps Haiku's tidy capitalised drafts for people whose style says "normal capitals".

## Ranked plan

**1. Give polish a thinking channel**
- Where: run.mjs:59–60 and :76.
- Change: `const mkArgv = (sys, effort = EFFORT) => [... ...(effort === 'default' ? [] : ['--effort', effort]), ...]`, and at :76 `mkArgv(POLISH_SYS, 'medium')`. `claude()` already drops thinking blocks, because it keeps only text blocks.
- Check: `replay.mjs polish` on the 9 round 17 runs plus the 18 round 16 runs (~1000 drafts), low vs medium.
  - Leak regex count, plus by eye.
  - `thinking_tokens` > 0 at medium.
  - Re-polish the row-200 case 20×.
  - DROPs and added words no worse.
- Fallback if Haiku doesn't think at medium: "Write the texts after a line TEXTS:" and parse only what follows, the same way agents' replies are read by their last line.
- ITERATIONS: round 8 tested effort for agents only; this has not been tried.

**2. Keep chat material out of the Days**
- Where: prompts.mjs:13, after "Don't mention the chat or messages at all."
- Add: `Apart from how what ${n} said they would do turned out, nothing in the day comes from the chat: no jokes, objects, places or details from it.`
- Check: `replay.mjs refresh` ×5.
  - Rows: T1 143, 146 and 180, plus Fiona's 11-24 23:05 row (U2) and Adaeze's 11-26 05:52 row (T4), plus 20 random rows.
  - Measure: the share of Days containing a content word from chat-since that isn't in that person's life line.
  - Abort if the "Small thing: nothing" share rises by more than 15 points, or if commitment outcomes disappear.
- ITERATIONS: rounds 9 and 13 fixed the Day narrating chat *moves*. Reusing chat content has not been tried. Do not reintroduce own-messages-only (round 8 froze the world that way).

**3. Co-presence in NOTE**
- Where: prompts.mjs:6, after "…you know how it went."
- Add: `When you're with some of them in person, you talk to them there, not here.`
- Check: `replay.mjs turns --kind notif` ×5.
  - The T1 turns from 19:21 to 22:45 (~15): their post rate should fall.
  - 100 non-meetup notification turns from 4 other runs: abort if their post rate drops by more than 5 points (round 11's "hold back" silence).

**4. (Optional) Stop showing reaction counts to agents**
- Where: run.mjs:108, `screen()`. Drop `+ tally(...)` for agents. eval-prep and the transcripts keep the counts.
- Check: notification replay with the counts stripped: emoji-copy rate (72% now), REACT rate, and post rate within ±5 points.
- ITERATIONS: round 13 replaced "X reacted" lines with counts. Hiding them entirely has not been tried.

**Not proposed:**
- A "don't continue jokes" rule: round 16 item 7 had no effect.
- More polish echo rules: raw drafts hold the echo, and polish barely moves it.
- Reverting to the memory arm.

## Should any round 17 change be reverted?
**None on the evidence.**
- The NOTE "asks you something" change is the likely T4 gain.
- The opener fix and the texts/style split have no harm shown.
- The leak predates round 17.
- The echo-cut sentence in `polishAsk` (prompts.mjs:11) did not fix echo. In item 1's replay, also run with that sentence removed. If leaks, DROPs and emoji repeats are equal without it, drop it to keep the prompt lean.

Main evidence: `/home/user/world/experiments/ai-convo/open-chat/runs/2026-11-23T03-02-31-076Z/log.jsonl`, rows 200–225 for the leak and refusals, and the refresh rows 143, 146 and 180.

## Verdict: the quiet comes from a bug, not from realistic restraint

**Root cause: the agent never sees the "Small thing".** At run.mjs:124 `news = r?.day`. Only the Day paragraph goes into the user turn. The Small thing is used only for gating (run.mjs:128) and for the `smalls` list. The generator writes Small thing and Day as two separate parts (run.mjs:243), and the Day almost never contains it. Across the four runs there are **47 non-"nothing" small things, and 0 of them share even half their content words with the Day the agent was shown**. Of those 47 looks, 11 posted, all replies to new chat. **0 posted messages mention a small thing.** No message in any run opens a new subject after the opener.

Examples that were generated but never shown:
- Liam bought the oat milk Mei likes, and it's in the fridge with her name on it.
- The lemon tree out the back has its first fruit.
- Leanne's corner chippy has a "Bristol's best chips" sign (their last chat was about which city has the better chippy).
- A band Callum and Leanne used to queue for has announced a reunion tour.
- Nadia found a photo of all five cousins on Gran's step.

These are exactly what real people text. The agent saw only "you marked mocks, booked a train" and answered PASS (bare PASS, no narration).

What follows from this:
- The round 13 note ("foxes and muffins had no tie to the group") misread the problem. The three later runs had connected small things and still used 0 of 37.
- Allotment: 7 messages, then silence for Sun 23:04 to Wed 19:00. That's 10 small-thing looks, 10 PASS.
- Housemates: silent after Mon 07:11, through 36 hours and 10 more small-thing looks (all PASS).
- Old school friends: the last message is Tue 08:36.
- Cousins: 37 messages only because the topic is an open task (venue, money). It is all logistics. Nobody asks about anyone's life (mocks, the house move, night shifts).
- Three of the four runs can't fill one 25-message judging window (eval-prep counts them as "short").

Some quiet would be realistic: an allotment job settled for Saturday, a 1:1 that agreed on Manchester. But the material for normal chatter existed and was dropped in the pipeline.

## Other giveaways

1. **The rewrite pass deletes commitments and decisions and leaves orphan fragments.** The cause is "Cut thanks, acknowledgements, … restated plans or promises, follow-up promises" (prompts.mjs:11):
   - Hannah's draft "Nobody has… I'll see what's free near Footscray and send a few options" became "Nobody has, as far as I know. Near Footscray."
   - Jordan's draft "pay lands friday so i can do my share… might be a bit short tho" became just "might be a bit short tho".
   - Callum's draft "nice one, manchester it is. i'll look at pubs and float…" became "floating the 10th vs 17th to the group". The decision is gone, so he seems to ignore Leanne.
   - Gordon lost "I'll sort the batten", and Hannah's 15:11 "I'll ring the venue tomorrow" became a vague "Need to check…".
   - Meanwhile a real restatement survived: Hannah at Tue 09:18, "Deposit goes to Nadia on Friday, and everyone sends their share to her after".
2. **Emoji echo.**
   - Mei uses 🍝 in all 3 of her texts, copied from the opener. Polish even moved it mid-sentence: "Have a great dinner 🍝 without me".
   - Priya uses 🍝 in 2 of 2; Callum ends 4 of 6 texts with 🍻; Ruby uses 🙏 three times.
   - Polish only forbids adding emoji, so emoji already in the draft stay.
3. **Phrasing mirrored across people.** Tomas and Liam both send "home all night, …" then "dinner sounds good / works…". The polish rule "Don't repeat a phrase or opener" didn't catch it.
4. **"Group" wording in a 1:1 chat.**
   - The casting call's opener line is hard-coded "picks up the phone to send the group tonight" (run.mjs:213), and the fallback is 'send the group something' (run.mjs:127).
   - So Callum writes "hey all…", "floating… to the group" and "whichever suits the others" with only one other person in the chat.
   - A refresh also invented "the three of you" in a Year 11 photo.
5. **The life generator narrates the chat.** "the chat had been quiet since Ruby's thumbs-up", "you haven't replied to the mock exam dates yet", "more than the family group chat has managed". That is the round 9 failure (the chat moves offstage, reticence written in) creeping back through the chat log fed to the generator.
6. **Pile-ons and minor slips.**
   - Cousins, Tue 09:18–09:38: three people tell Jordan "pay what you can". Ruby saw both earlier replies and still sent hers.
   - Liam proposes "dinner, 7?" at 20:01.

## Ranked plan

**1. Put the small thing inside the Day the agent reads.**
- Change: run.mjs:243, last sentence, to: `Then the day, starting "Day:": two or three short sentences of what actually happened, the small thing among them.`
- Why this way: it stays an unlabelled part of the lived day. It is not a "reason", "want" or "tell them" line, which keeps clear of the round 12 hidden director and round 13's removal of reasons.
- Don't put it in as a separate labelled line; that would be a director again.
- Check 1: re-run the refresh prompt on the 47 logged inputs. The word-overlap measure (≥50% of the small thing's content words appear in the Day) should go from 0/47 to near 47/47.
- Check 2: replay those 47 look turns (replay.mjs turns, `--kind look`) with the new Day put in. Report the post rate (now 11/47), the share of posts that mention the small thing (now 0), and read them for show-and-tell register.
- Watch: everyone posting every small thing would be a new giveaway. If the post rate jumps near 100%, tighten the generator's "connects to them" bar (or let it say "nothing" more often). Don't add a note telling agents to hold back; round 11 showed that wording read as "hold back" silenced the chats.

**2. Narrow the polish cut list to filler only (prompts.mjs:11).**
- Replace "Cut thanks, acknowledgements, sympathy formulas, restated plans or promises, follow-up promises, greetings, sign-offs, and names or @ unless it would be unclear who is meant." with: "Cut thanks, sympathy formulas, greetings, sign-offs, anything that only repeats what is already in the chat, and names or @ unless it would be unclear who is meant. Keep what the draft adds: a decision, a yes or no, an offer, a time, what they will do."
- This keeps round 12's faithful polish and the NOTE's "no restating plans", and stops cutting new content.
- Check: `node replay.mjs polish` on the 4 runs.
  - The five drafts above (Hannah 19:02, Jordan 20:34, Callum 08:36, Hannah 15:11, Gordon 20:17) should keep their commitment or decision clause.
  - Hannah's 09:18 restatement should now be cut.
  - The three pure-thanks drafts dropped at 18:02 and 09:44–45 should still DROP (Liam "ta hannah. appreciate it", "Sounds good…").
  - Ruby's 12:58 "Nothing new from me" should still DROP.
  - The `added` style counts should not rise.

**3. Stop the emoji echo (prompts.mjs:11).**
- "Don't repeat a phrase or opener from the last messages." becomes "Don't repeat a phrase, opener or emoji from the last messages."
- Also "don't start or end this one the way these did" becomes "…the way these did, or with the same emoji".
- Check: on the same polish replay, count posts whose emoji also appears in the last 12 messages. That should cover Mei's 🍝 ×3 and Callum's 🍻 ×4.

**4. Fix "group" wording for two people.**
- run.mjs:213: "picks up the phone to send the group tonight" becomes `…to send ${N > 2 ? 'the group' : 'the other'} tonight`.
- run.mjs:127: `'send the group something'` becomes `` `send ${N > 2 ? 'the group' : 'them'} something` ``.
- run.mjs:243: "(the group, the plans…)" becomes "(what they share, the plans…)".
- Check: `GEN_ONLY=1 PEOPLE=2` ×5 on minimal situations; grep the opener and setting for group, all, "three of".

**5. Keep the chat out of the Day.**
- run.mjs:243: after "Don't say what ${n} posted or will post." add: "Don't mention the chat or messages at all."
- The chat stays in the input so outcomes ("you said you'd ring the venue") still resolve. Only narrating the chat is banned.
- Check: regenerate the logged refreshes and grep Day for chat|group|message|replied|thumbs (now at least 3 hits in 47).

## Not proposed, and why

- **A reason or cue for unprompted looks:** it failed in round 12 (hidden director, re-asks ×4).
- **More frequent looks:** round 8 showed PASS on 98% of "nothing new" looks.
- **Norms like "people share little things":** round 11 found NOTE norms change behaviour badly.

Process: do item 1 alone first and check it, since it is the dominant cause. Then items 2–3 together (both are polish, both checked by one `replay.mjs polish`), then items 4–5. Only then launch runs.

**Doc fix:** ITERATIONS.md round 13's last bullet and README "Life events" (lines 365 area) say small things were "never texted" because they lacked a tie to the group. They should instead record that the small thing never reached the agent.

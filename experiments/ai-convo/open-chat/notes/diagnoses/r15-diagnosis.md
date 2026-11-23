## Round 15 cold read: what gives the transcripts away, and a plan

**Scope.** I read ITERATIONS.md, run.mjs, prompts.mjs and README.md in full. I read all 6 judge reports and these windows: 286c6d, ed1f1f, fe759e and 6175a0. I went through the log rows of SL-T2, SF-T3, SF-T4, SF-U1 and SF-U2, and counted reactions, PASSes and refreshes in all 18 runs.

## What gives them away, with root causes

**1. Status loops and plans that never finish.** This is the most common tell the judges named. Examples:
- Mei's export "still running, no stall" for 1.5 h (ed1f1f).
- Tiago's "acabo isto e desço" ×4 (6175a0).
- "jumpers till Thursday" and Pieter's "late but I'll come".
- In 6175a0 dinner happens offline, but Rui is "à porta" at 22:16 and still texting at 23:12.
- Chloe says "i'll send you the name" (SF-T4) and never does.

Root cause: the world only moves at a refresh. Refreshes come only at unprompted looks, every 3.6-11 h. Between them the agent is frozen in its last Day, so anything in progress can only be reported as unfinished. The refresh itself carries it on: Mei's 16:09 Day ends "The sleeve export is still running, with no stall so far."

**2. Clock blindness.** At 15:43 Mei writes "I'll tell you by 3:15". Hannah at 16:10 says "ideally before 3:30". The time is the first line of the turn, separated from the point of reply by a long screen.

**3. Reactions on nearly every message.** All 6 judges named this. There are 185 reactions to 611 posts; SL-T1 has 34 to 63. Three causes:
- The note licenses it: "such as a confirmation or news" (prompts.mjs:4), and in planning chats most messages are confirmations.
- REACT is the easy way out on any notification check-in.
- Reactions show in the windows as timestamped "X reacted" lines, which no real chat screen shows. The agents themselves see counts.

**4. Chats die.** 6 of 18 runs posted fewer than 25 messages (SF-T4: 8 messages in 3 days), so they were never judged. 362 of 658 refreshes said "nothing", and a "nothing" refresh with nothing new skips the look entirely (run.mjs:128). This cancels round 15's per-person unprompted frequency: Kate "messages now and then without a reason" but never gets the turn to do it. The Small thing also only counts things that connect to the group, not how a person's own promise turned out.

**5. Polish leaked its instructions.** "— wait, I need to leave out the emoji and opener already used. Rewriting:" scored 1-2 from every judge. The polish prompt has three overlapping no-repeat rules (prompts.mjs:11: the "don't start or end this one the way these did" parenthetical, "don't reuse their past texts' wording", and "Don't repeat a phrase, opener or emoji"). At low effort the model checked itself in the output.

**6. The polish refusal crashed SF-U1.** The API refused with `[reasoning_extraction]`. The draft was never logged, so the trigger is unknown. One agent reply in this batch held its narration ("As Chloe, I should answer..."), and that whole text went to polish. That is a possible trigger, not confirmed.

**7. Smaller tells.**
- Running jokes taken up by everyone ("bords" by 5 people, window seat, thermos).
- Echo confirmations ("Sure, I'll tell you the cost after.").
- Over-complete manager sentences.

Root cause: on every notification check-in each agent answers the most visible hook. The note's "says something to you, you answer it" reads as covering anything said to the group.

## Memory or stateless as default

**Make stateless the default.**
- Judges: stateless 5.2 vs memory 4.9 (small n, but no sign that memory helps).
- Round 15 replay: quiet looks post 39% fresh vs 29% live.
- Posts per run are similar (36 vs 34).
- Every loop above also happens in stateless runs, so memory is not what fixes them.
- Memory needs the fork/kept/back/amend/hush machinery. Keep memory (SF) as an arm for one more batch, then delete that code if it still doesn't win.

## Ranked plan

Ordered for one coherent set per step.

**1. Life goes on between looks** (fixes 1).
- prompts.mjs:5: after "...you can just do." add: " Your life goes on between looks at the chat: whatever you were doing or waiting for when you last looked has moved on by now, and you know how it went."
- run.mjs:243 (refresh prompt): replace "Don't continue or worsen earlier problems: they can simply be over." with "Don't continue or worsen earlier problems, and anything they were in the middle of or waiting on is over by now: say how it ended."
- run.mjs:243: in the first-sentence rule, after "...the people they have in common)" add ", or it is how something they said in the chat they would do or find out turned out".
- Cheap check: run `replay.mjs turns --rows` on Mei's 16:09, 16:27 and 17:03 rows (runs/2026-11-23T00-33-05-846Z) and Tiago's 21:59 to 23:12 rows (runs/2026-11-23T00-33-00-631Z), N=5. Count replies that repeat an unfinished status (aim: most report an outcome), and check the overall notification post rate does not drop. Then re-run the refresh prompt on Mei 16:09 and Chloe 07:28: the Day should end the export, and Chloe's Small thing should not be "nothing".

**2. Stop skipping "nothing" looks** (fixes 4).
- run.mjs:128: drop `!(r && !NOTHING.test(r.small)) &&`, so every refresh look is a turn and the cast's own unprompted frequency decides.
- Keep the Small thing line only for the `smalls` de-duplication.
- This is not a repeat of round 8: quiet looks are no longer kept in memory, and the agent now has a Day.
- Cheap check: take the logged "nothing" Days (SF-T4, SF-T1, SL-U1, SL-T5), put each in front of that run's screen at that time, replay N=3. Look for a post rate well above 0 and below about 40%, and read the posts for show-and-tell. Note the cost: about +360 turns per batch.

**3. Put the clock next to the reply** (fixes 2).
- run.mjs:132: move the `(${now}. You last looked …)` part to the end of `user`, after the chat. Move it; don't duplicate it.
- Cheap check: replay Mei 15:43 and Hannah 16:10, N=5. Count replies naming a time that has already passed.

**4. Reactions** (fixes 3).
- prompts.mjs:4: replace "Use it only on a message that a reaction answers, such as a confirmation or news." with "Use it only on a message that a reaction answers."
- run.mjs:211: after "how often you message it without being asked anything," add "how often you react to a message with an emoji instead of replying,". This is per person, not a note norm, and states no unsourced rate.
- Cheap check: `replay.mjs turns --kind notif` on the R15 runs (REACT rate before and after), plus `GEN_ONLY=1` ×6 to read the new cast sentences for variety.
- Separate eval change: eval-prep should show reactions as counts under the message, as the agents and a phone screen show them. Score that batch apart from the prompt change so the two don't mix.

**5. Polish: one no-repeat rule** (fixes 5). In prompts.mjs:11:
- delete the parenthetical "(don't start or end this one the way these did, or with the same emoji)";
- delete "Don't repeat a phrase, opener or emoji from the last messages.";
- replace "and don't reuse their past texts' wording: those show the feel only." with "and don't reuse an opener, phrase or emoji from their past texts or the last messages."

Round 14's emoji fix stays, as one rule. Cheap check: `replay.mjs polish` on all of about 600 R15 drafts. Count outputs matching `/rewrit|draft|wait,|I need to|opener/i` (now 1) and emoji repeats (no worse than round 14's 2/11).

**6. A refusal is a failed turn, not a crash** (fixes 6).
- run.mjs:86 (and :73): on error, log `{who, failed: 'refusal', error, draft}` and treat it like the continuation path (not posted, PASS for scheduling).
- This matches the existing failed-turn design, and logging the draft finds the root cause.
- Cheap check: grep the next batch for `failed: 'refusal'` and read the drafts.

**7. Group answers** (fixes 7; risky, do last).
- prompts.mjs:6: "You don't need to add a reply to something others have already answered, or just to agree or thank." becomes "...already answered, to agree or thank, or to carry on someone else's joke."
- Round 11 showed note norms can silence chats, so watch the post rate.
- Cheap check: replay notification turns from fe759e and cbc288 (bords, thermos), N=5. Count posts reusing the joke's key word, and check the post rate stays the same.

**Eval note.** Judges marked B windows down for starting mid-thread ("It's yours now, Mei"). Telling judges that a window is an excerpt from a longer chat is a plain fact, not steering.

**Checked against ITERATIONS.md:**
- No wants or reasons come back: items 1-2 give facts, not directions.
- The rule against restating plans, "(new)", quiet looks not being kept, and "change as few words" all stay.
- Voice stays in polish only.
- No numeric norms are added.

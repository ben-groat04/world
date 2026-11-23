I read run.mjs, styles.mjs, README.md and the previous plan, then went through every log.jsonl (14 runs) and one CLI session file. I edited and ran nothing.

## 1. Why the chats go quiet

I sorted every agent turn by situation and outcome:

| Situation | Turns | Posted | PASS or DROP |
|---|---|---|---|
| Opener (Maya, first look, with the "(You've opened the chat to send something.)" cue) | 14 | **1** | 13 |
| Others' first look at an empty chat | 33 | 4 | 29 |
| Events look, chat empty | 21 | 4 | 17 |
| Events look, nothing new in the chat | 30 | **1** | 28 |
| Events look with new messages | 11 | 3 | 6 (2 more reacted) |
| Notification look (new messages) | 47 | 18 | 23 (6 more reacted) |

The polish pass is not the main cause. Across all runs it dropped 6 replies, all of them reasonable drops. About 90% of silences are the agent's own raw "PASS". Five causes, in order of weight:

1. **Starting a conversation has collapsed.** Before this change, openers posted 3/3 (runs 21-33-*) and 6/6 in the earlier pilot. Now they post 1/14 (an 11/12 PASS rate) with the same opener cue. The only system-prompt changes were: the NOTE norms (PASS is now offered twice: "send nothing (PASS)", "You don't reply to every message", "Chats just stop"), the style cards (terse ones say "answers the question asked and nothing else" and "rarely asks a question"), the wants, and the topic wording. Haiku reads the norms block as an instruction to hold back. It applies with or without a topic: in the coder's runs Maya had no TOPIC, so the cue says "to send something" with nothing to send.
2. **Unprompted looks have no purpose.** A look means the person picked up their phone, but all the agent gets is a second-person day story ("You slept badly… a fox…"), and it posts after 5 of 51 such looks. A real person opens the chat because they have something to send. Nothing here turns an event into that intent.
3. **PASS lock-in in stateful memory.** Priya's session file in 22-00-41 ends with 7 PASS assistant turns in a row. In 21-55-56 the last post is Mon 08:09, followed by 0 posts in about 20 looks. In 22-00-41 it is 0 posts in 14 looks after Mon 17:34. Haiku copies its own run of PASSes. STATELESS turns never see their own PASSes. The SL runs got 25 posts against 3 for SF at the point they were stopped, but they stopped too early to compare the arms properly.
4. **The wants are favours someone else should do** ("You want Tom to book…", "You want Sam to drive you…"). None was ever raised in any run. The group's real shared plan, Friday leaving drinks in the setting, was never mentioned either.
5. **The events give little worth texting.** The shareable item is mostly stock wildlife: foxes in 8 of 64 events, pigeon/magpie/cat in 16 more, "slept" in 16. Nothing ties it to the group.

The events-echo effect is real but small. Priya's events pick up chat content (a "lost cat" sign on Gloucester Rd after the Gino thread). Two independent events both invented a "Gino" (Maya's tortoise, Priya's pigeon), which led to the "is that the gino on gloucester rd" confusion and Tom repeating Maya's question back to her. Scheduling is not the cause: there are about 3 looks per person per day, which is plenty if a look has roughly a 30-50% chance of producing a post.

## 2. Other remaining tells and bugs

- **The agent still treats its own events as messages.** Priya replies "Gino's gone?? 😭" to her own pigeon story (raw: "that's the most dramatic thing that's happened to me all week"). Cause: the events are written in the second person and read like someone telling her.
- **The polish pass caricatures.** It adds slang, emoji and jokes that were not in the draft: "yeah ask priya 🙌" became "yesss 🙌 … 🤝"; "the feather is doing a lot of work" became "…genius". Phrases from the style examples get copied ("no because", "ngl", "ok bet"). Cause: the polish prompt never says "add nothing", and the brief shows the examples as text to imitate.
- **The polish pass drops content.** "wed it is then, ill check which pub" became "wed 7+ then"; Maya's question was cut to "wait".
- **The reasoning leak is still possible.** Sam's raw reply was "…so I'll stay quiet.\n\nPASS". `isPass` (run.mjs:101) only matches a bare PASS, so this went to polish, which happened to DROP it.
- **Worlds collapse to the same few places.** The setting is in Leeds in 11 of 14 runs. In T3 both arms produced a pharmacist Maya in Leeds and a Glasgow logistics Jo. Cause: "a real or plausible town" with no source of variety.
- **Events slip into future tense** ("when you got to work tonight you'll find…").
- **The burst-sender card forces 4-message bursts** ("usually three or four lines").

## 3. Fix plan, ranked

**F1. Every look has a purpose, decided by the generator** (refresh, run.mjs:213; checkin, :126-132). This fixes causes 1, 2, 4 and the events-as-message tell.
- Append to the refresh prompt: `Then a line starting "Reason:": what, if anything, ${n} would pick up the phone right now to send these people (news worth sharing, a question, a photo, chasing something left open in the chat such as a question put to ${n} or a plan with no time, or this: ${wants[n]}), in a few words, not the message itself; or "nothing". Then the day, starting "Day:".`
- Parse both lines. `events[n]` = the Day line.
- In `checkin`: if Reason is "nothing" and nothing on the phone is new, skip the agent turn entirely. Write no PASS row and call `nextLook(n)`.
- Otherwise end the user turn with `\n\n(You've opened the chat to ${reason}.)`.
- Replace the Maya-only cue at :132. Her first look's reason is TOPIC (`put it your own way`), or with no TOPIC an extra setting-generator line `"${NAMES[0]} opens with:" what ${NAMES[0]} picks up the phone to send the group tonight, in a few words`.
- Change the events header to `[Not on your phone: your own day, which you lived yourself. Nobody sent you this.]`.
- Add to the refresh prompt: `Only what has already happened by now.`
- Verify cheaply: run the refresh on 30 logged refresh inputs. Check that the Reason is concrete and not "nothing" in roughly 30-60% of cases, then read them.

**F2. Rewrite NOTE** (run.mjs:26-28). Keep the PASS mechanics sentence once. Replace the texting sentence with:
> ` This is texting. When you send something it's short, often a fragment, with few names, no sign-offs, and no restating plans or announcing what you'll do. When someone asks you something or says something to you, you answer it. If you opened the chat to say something, say it. You don't need to add a reply to something others have already answered, or just to agree or thank${REACT ? ' (react instead)' : ''}. You never give advice like a leaflet.`

Also delete "answers the question asked and nothing else" from terse-dad (styles.mjs) and "rarely asks a question" from dry-and-brief.

- Verify: build a small `replay.mjs`. It takes a run folder and row indices, re-issues the logged `argv` (system prompt swapped for the new NOTE and brief) and `user`, 5 samples each, and prints the post rate.
- Target: openers at 90% or more (now 1/14).
- Also replay the 23 notification looks that passed; any that ignored a question put to that person should now post.

**F3. End PASS lock-in** (checkin :134-148, recheck :165).
- On PASS, DROP or REACT, don't keep the fork (`session[n]` stays as it was), and add `kept[n] = firstShown`.
- The screen shows everything from `kept[n]`, so nothing read is lost. `seen[n]` still advances, so notifications behave as before.
- F1 removes most empty looks anyway.
- Alternative: make STATELESS=1 the default if the arm comparison favours it.
- Verify: replay the late SF rows (21-55 after Mon 08:09, 22-00 after Mon 17:34) with the PASS turns removed from the session file (a copy). Compare post rates.

**F4. Wants the person would raise themselves** (setting generator, :199). Replace the wants clause with:

`one thing they'd like to sort out, find out or get going with these people this week, which they would bring up themselves (not a chore for someone else), ordinary and specific to them`

Keep the secret-holder clause. F1 feeds the want into Reason.

**F5. Faithful polish** (:90). Replace the rules with:
> `Rules: keep every fact, question, request and joke in the draft, in ${n}'s way. Don't add words, slang, emoji or jokes that aren't in the draft, and don't reuse their past texts' wording: those show the feel only. Cut thanks, acknowledgements, sympathy formulas, restated plans or promises, follow-up promises, greetings, sign-offs, and names unless picking out one person in a group. Don't repeat a phrase or opener from the last messages. Split into several texts on blank lines only if ${n} would. Reply DROP only if the whole draft just thanks, agrees with, or repeats what is already in the chat. Reply with only the texts.`
- In `briefFor` (:40), change the examples label to: `Some texts you've sent before (other chats; for the feel, not to reuse):`.
- In burst-sender, change "usually three or four lines" to "sometimes two or three".
- Verify: re-polish the ~60 logged `raw` drafts. Count added slang and emoji tokens that are not in the raw (should be about 0), and check by eye that facts and questions survive.

**F6. Variety in the world, with no hard-coded lists.**
- Setting (:199): `First privately list 12 quite different places in different regions where these people could plausibly live, then use place number ${1+Math.floor(Math.random()*12)} (don't print the list).`
- Refresh (:213): pass the last 10 "small things" from anyone's events in this run with `Nothing similar in kind to these, and no names already used in them: …`. Animals then stop recurring, and two people can't both invent a "Gino".
- Verify: run `GEN_ONLY=1` 10 times. Aim for 8 or more distinct places.

**F7. Protocol: the final line decides** (:101). A reply whose last non-empty line is PASS (or REACT plus an emoji) is that decision. The model's narration before it is not a message. That defines the reply format; it is not a backstop for a symptom.

**F8. Run metrics in score.mjs** (needed for any batch). Per run: posts per in-story day, conversations started per day (a post at least 2 h after the previous one), opener posted (yes/no), PASS rate by situation (the table above), DROP rate, and added-token rate in polish.

**Sequence:**
1. F2 and F5 via replay. Cheapest, a few dozen Haiku calls.
2. F1, F4 and F6 via the generator alone.
3. F3, via replayed sessions.
4. A mini batch: 6 scenarios × both arms, DAYS=2, MESSAGES=60, plus one unseen brief (for example a 1:1 between a parent and their adult child, or a 7-person football team chat) to check it generalises.
   - Batch gates before judging: opener posts in 12/12, at least 2 conversation starts per day, 25 or more messages per run, no repeated animals or names in the events.
5. Only then a blind-judge batch.

**Expected effect:** F1 to F3 restore volume without bringing back the long assistant register. F5 removes the main new tell, the stacked style markers. 8/10 still depends on tuning the polish prompt against windows the judges flag.

## Cold read, round 18 (p10)

I only read files. I made no edits and ran nothing.

### What gives these chats away now, and why

**1. Group chats stop after the topic is settled, and the 5.6 average hides this.** T3, T5 and U1 are all groups of three to six people. Each posted 8 to 14 messages, all of them by Tuesday morning. After that there were 20 to 30 unprompted looks per run, and nearly every one ended in PASS or a reaction. Those three runs had too few messages for a judged window, so the 5.6 comes from the six runs that kept going. The same has happened every round: 4 to 7 runs per batch were "short" in p7, p8 and p9.

Why it happens: an agent only has two sources of something to say, the topic and its own generated Day. The Day's "Small thing" was "nothing" in most of the late refreshes I looked at in U1 and T5 (the coder's replay put it at about 57%). The relay note then lets an agent reply only when someone asks it something ("When someone asks you something, you answer it… You don't need to add a reply…"). But only 14% of posted messages contain a question (34 of 239). So each message sets off less than one reply on average, and every thread fades out.

Messages per turn have fallen every round: 0.53, 0.45, 0.39, 0.35 (p7 to p10). Reactions per posted message rose from 0.29 and 0.37 to 0.65 and 0.64. A REACT counts as a turn spent, so reactions are replacing replies. This is the volume drift you noticed.

**2. Every message pushes the plot along; there is no banter.** Judges named this in every round ("every message advances the plot", "tidy", "one formal writer"). The cast gives each person a job, a week and how they type, and nothing else. There is no temperament, no humour, no opinions, and nothing about how they get on with each other. The cast prompt even says "Describe the life, not how you behave in the chat." So people post Day news ("Dentist went fine, no fillings") and logistics. The life lines give each person one event for the week (the rewire, the boxes, the inspection), and every Day mentions it again. That is where the status loops come from: Callum's rewire four times, Kenta's 検査 six times.

**3. Plans made in the chat have no shared reality offline.** Each person's Day is generated separately, and notification check-ins carry no Day at all. Three examples:
- T4, row 44: Aoi's 18:40 Day says she booked for 17:30 but not that she went. She then texts "17時半で予約…今からでも行けそう？" at 18:40.
- T1: Cara texts "get yourself here for 5:30" at 20:32 Saturday. Nadia, who had agreed to Saturday 17:30, says Sunday "Didn't make it, I was in bed by half nine". She had no look during the evening of the pub.

Unprompted look times are random (6 h × 0.6–1.8). If one falls in someone's sleeping hours it moves to their wake time. So nobody checks the chat around an agreed time, which is when real people text most ("here", "running late"). Instead, 21% of posts land at 06:00–07:59 (50 of 239). Judges called the timestamps "patterned".

**4. The re-check makes agents talk about their unsent draft.** T2: Tomasz's unsent draft had the wrong file attached. At the re-check he wrote "@Hannah Wrong one, that's my bag file", correcting a file nobody had seen. A judge named it.

**5. The rewrite pass makes formal people stiffer.** For example, raw "Yep, good. Checked it last night" became "Yes, it's good. I checked it last night". It earns its place as a cleaner: it removes narration (about 2% of raw drafts, e.g. "Hannah, texting the group. Short, no sign-off."), names and repeated emoji. So it is a minor tell, not a root cause.

### Can this architecture reach 8/10?

The parts can. The control logic, as it stands, can't.
- Haiku writes good fragments. The raw drafts are mostly fine, and Sonnet characters did worse in round 8.
- Stateless won over memory.
- Topic-driven windows already get 7–8 from single judges (e2f07f, df917a, U2, U3).

What limits it is what the system holds. It has no personality to generate tangents, no shared calendar to make offline events and timing agree, and no group dynamic beyond question and answer. Meanwhile about ten rules tell agents what not to send. Each round added a restraint to fix an over-talking tell, and together they explain the drift. I would add the three missing pieces rather than keep patching individual tells.

### Can the evaluation detect an improvement?

No. Per-window mean scores in p10 are 7, 4, 3, 7, 6 and 6.7 (SD about 1.6). The three judges on a window mostly agree within 1–2 points, so adding judges buys little; the variance is between windows. With six windows, the standard error is about 0.65, and the gap between two rounds has a standard error of about 0.9. Only differences of roughly 1.8 points or more are visible, so rounds 15–18 (5.0–5.9) are noise.

There are two more problems:
- **Survivorship:** runs that died are never scored.
- **No calibration:** we don't know what these Sonnet judges give real chats. "8/10" might be above what real chats score.

### Plan, ranked

**1. Fix the evaluation before the next prompt change.**
- **a) Pair the arms.** Generate casts once (GEN_ONLY), then run both arms on them with LINES_FROM and the same START. Use at least 3 seeds per scenario, and swap in 3 fresh briefs each round so tuning doesn't overfit to T1–T6.
- **b) Time-span windows.** At eval-prep.mjs:56, cut each window as "the first 36 in-story hours, at most 40 messages". Judge every run with 8 or more messages, and report the share of short or dead runs next to the mean.
- **c) Machine metrics in score.mjs on every run.** Posts per turn, reactions per post, share of posts containing a question, share of posts within 90 min of the person's wake time, and messages per run. These come free on every run and have the power that judges don't.
- **d) Real anchors.** Ask the user for a few real exports, used with their consent and with names changed, in the `--- Sun 19:41, Name` format. eval-prep already mixes these in blind as arm REAL. Define the target as "AI windows score like real windows". This respects the rule against unsourced data: the anchors are real.
- **e) Optionally, a binary "real or generated, with confidence" question** in addition to the 0–10, to measure detection.
- **Check:** recompute the p7–p10 tallies with time windows. ITERATIONS: neutral judging is kept; pairwise judging is not reintroduced.

**2. Add a personality line to the cast (fixes 1 and 2).**
- At run.mjs:199, after the "life:" line, add: `"<name> is like:" in the second person, two short sentences: your temperament and sense of humour, what you have opinions about or get enthusiastic about, and how you get on with each of the others (who you tease, who you look out for, who gets on your nerves a bit). An ordinary person, not a type.`
- Parse it in run.mjs:208–211, append ` What you're like: ${like[n]}` to briefFor at run.mjs:41 (the agent only, not the rewrite pass), and log it in the cast row.
- **Check:** GEN_ONLY on 5 briefs and read the lines for caricature. Then add generated lines to the T5, U1 and T3 casts and replay their notification and refresh turns ×5 with `replay.mjs turns`. Compare the group post rate, the question share, and the share of posts that are neither logistics nor Day news (by eye).
- **Abort if** the 1:1 post rate rises more than 10 points (round 16 over-attentiveness came back).
- ITERATIONS: this is not a want or a reason (round 12), and not a typing card (the caricature lesson is for typing style). Watch for caricature anyway.

**3. Let the Day generator schedule the next look and settle shared plans (fixes 3).**
- In dayAsk (prompts.mjs:13), after "say whether they did it (usually yes) and the concrete result.", insert: `If something arranged in the chat that involves ${n} (meeting up, a call, an event) was due by now, say whether ${n} was there and how it went, and if ${n} is there right now, say so.`
- At the end of dayAsk, add a third part: `Then a line starting "Next:": the day and time (like Sat 17:10) when ${n} would next have the phone in hand with a moment to spare, given their day, their sleeping hours and anything arranged in the chat.`
- In refresh (run.mjs:235), require `Next` alongside day and small, so the existing twice() retry covers it. Then set the next look from it in place of LOOK_FACTOR (run.mjs:20–21).
- **Check:** replay.mjs refresh ×5 on T4 rows 39 and 44, the T1 Saturday rows, and 20 random rows. Count looks scheduled within an hour before an agreed time, and draw an hour histogram of Next (the 06–07h share should drop). Read the regenerated 18:40 Aoi Day.
- ITERATIONS: Next sets a time only; the agent never sees a reason, so the round 12 hidden director doesn't come back.

**4. Stop reactions replacing replies.**
- At run.mjs:201, delete `${REACT ? ' and how often you react to a message with an emoji instead of replying' : ''}`.
- **Check:** replay 100 group notification turns ×5 with the clause cut out of the logged texts line. Compare REACT rate and post rate.
- **Keep the clause if REACT rises.** Round 16's replay showed it cut reactions from 35% to 16%, so this can go either way. The live jump came in round 17 together with "answer questions only".

**5. Re-check wording.**
- At run.mjs:153, change the closing line to: `(Your message isn't sent yet; nobody has seen it. SEND sends it, PASS deletes it, or type what you send instead.)`
- **Check:** re-issue the 20 logged re-check turns from p10 ×5 and count answers that comment on the draft itself.

**6. Step-back baseline (diagnostic only).**
- Write a tiny one-off script: one Haiku call per p10 cast row (cast, setting and topic in) that writes the whole chat with timestamps.
- Judge its windows blind against the multi-agent windows on the same casts.
- If it scores as well, the agent machinery isn't buying realism and you should rethink. If worse, the architecture is justified and items 2–3 are the way forward.

**Order:** item 1 first. Then items 2 and 3, each checked separately, followed by one paired batch. Items 4 and 5 can share the next batch.

Files: /home/user/world/experiments/ai-convo/open-chat/run.mjs, /home/user/world/experiments/ai-convo/open-chat/prompts.mjs, /home/user/world/experiments/ai-convo/open-chat/eval-prep.mjs, /home/user/world/experiments/ai-convo/open-chat/runs/2026-11-23T03-58-06-083Z/log.jsonl (the Aoi rows 39–47), /tmp/claude-0/-home-user-world/f8895907-66f8-5315-a40a-9b9125a9ca28/scratchpad/p10/eval/runs.tsv

I read run.mjs, the README and all 6 pilot transcripts in full, plus agent inputs from the logs (`user` fields) for the clearest tells. I edited and ran nothing.

## 1. Blind-judge scores

| Run | Score | What gives it away |
|---|---|---|
| T1 friends | 3 | Every message is 30–60 words, starts with "Hiya"/"Morning" and names people. Apology and status loops ("Sorry for the faff", "I'll say by lunchtime"). Turns into Tom in hospital. Everyone looks at exactly 23:00–23:08. |
| T2 studio | 2.5 | The topic is lost: the Friday deadline becomes "who covers the pub quiz" (the setting said that was the last thing they talked about). "Tom: Hey Sam" name prefix. Thanks chorus. Sam posts three paragraphs at 06:01–06:02. Calf injury, then the quiz is missed. |
| T3 siblings | 3 | The first 20 messages are decent. Then Dad goes to A&E and it becomes a 40-message logistics log ("I'll message as soon as…" ×15). Maya reacts 👍 to almost everything. "Maya here." |
| T4 dating | 2 | Polite interview with mirrored "Ha, …" openers. Running bits get reused ("horizontal" 7×, the scissors). Tom replies to his own life events as if Maya had sent them ("Nice one on the port side"), twice. Endless goodnights. No flirting and no date gets made. |
| T5 six friends | 3.5 | The best opening (short, the chair-holding-a-guitar banter). Then a booking-slips loop (Maya three times, then Priya). Sam's crush never surfaces. The chat dies. |
| T6 accounts | 1 | Raw tool-call markup posted to the chat twice (`<invoke name="bash">… ls /tmp/open-chat-…`). Jo answers herself ("Ouch, Jo"). Three people give 999 safety advice. Tom misses his deadline 7 times. "I don't want to guess figures." |

## 2. Remaining tells and root causes

1. **Register: long, punctuated, complete sentences; names in 77–93% of messages; every message thanks or acknowledges** (median 23–43 words). Haiku's assistant default. Nothing in the prompt says what texting looks like, and every person writes in the same voice.
2. **Life events read as chat messages.** "Since you last looked: …" comes right before the chat with no marker saying it isn't on the screen (`run.mjs:107`). At a look with nothing new, the agent answers the events: T4 Tom twice, T6 "Ouch, Jo".
3. **Events push toward disaster and misery.** The refresh (`:182`) gets the previous events as an anchor and is asked "how things stand now", so injuries get worse each time (Jo's ankle → urgent care → 111 → splint), and illness and floods spread to everyone. The rest is solitary vignettes (cold tea, rain, slept badly) with nothing worth texting about. That is why 92–132 PASSes per run follow 70–123 events, and why T1 is silent from Mon 14:33 to Thu.
4. **Promise, miss, apologise loops.** The refresh is told "Leave the chat out" (`:182`), so things people promised in the chat never get done off-screen. Agents also don't believe they can act or know things: Tom "can't attach from my phone" and won't state figures. That is Haiku's honesty norm: it doesn't have the character's facts.
5. **Tool-call leak.** The CLI's SDK identity and environment note (with the cwd) plus pressure to produce data Tom doesn't have made him try to run bash. Root: the agent doesn't know it already knows its own work.
6. **Assistant safety mode** (999 advice ×3). Medical drama comes from the events generator (3), which triggers harm-avoidance.
7. **Clock artefacts.** `since[n]` starts at START for everyone (`:178`) and `nextLook` is exactly since+4h (`:17`), so everyone looks at 23:00, then 05:31 / 09:31 / 13:31 / 17:31 in lockstep. Generated sleep times end on round wake times (05:30, 06:30). 8–25 posts per run fall on :00/:01/:30/:31.
8. **Everyone answers everything in groups.** In T5, all five replied within 6 minutes. Nothing tells them that most group messages get no reply from most people.
9. **Topic leaks or gets hijacked.** The opener copies TOPIC wording ("I know nobody's said when they're free yet"). The setting's "last talked about" line takes the topic over (T2). In a work chat, colleagues don't share facts about the shared job.
10. **Secrets and romance have no drive.** Nobody wants anything from the other people (T5 crush unused; T4 never asks for a date).
11. **Repetition across messages** (catchphrases, "Sorry to hear", the same promise restated). Each reply is written without a check against the last few.
12. **Small ones:** "Tom:" prefix, "Maya here.", repeating the timestamp ("Sun 23:00 and I've just…"), stale goodbye loops. The README says REFRESH is 6 h; the code has 4 (`:177`).

## 3. Ranked plan

**P1. Per-person texting styles** (new file `styles.mjs`; impact: very high; cost: about 500 cached tokens per system prompt)
- Hard-code 14 written style cards. Assign them without repeats (`NAMES.forEach`, `:46`) and log them in the first row.
- Append to `briefFor` (`:35`): ` How you text: ${STYLE[n].card} Some texts you've sent before (other chats): ${STYLE[n].ex.join(' / ')}`.
- Each card has a `react` propensity (0–1), used in P5's note.
- Example cards (write about 12 more along these lines, covering formal, emoji-heavy, one-word replier, voice-note-ish rambler, dry, and mum-style full stops):
  - A: "all lowercase, almost no punctuation, 2–8 words, often 2–3 messages in a row, typos left in, 'lol' 'ngl' 'tbf', no emoji." Ex: "wait what" / "nah im knackered tbh" / "omg the dog" / "can do sat after 3 i think" / "lol".
  - B: "proper capitals and full stops, short, dry, rarely asks questions, never uses exclamation marks, reacts 👍 instead of answering." Ex: "Fine by me." / "Can't Thursday." / "That's grim." / "Booked."
  - C: "chatty, exclamation marks, 1–3 emoji (😂🙈❤️), sometimes a longer message when excited, calls people 'hun'." Ex: "NO WAY 😂😂" / "ahh love that for you" / "ok I'm in!! what time".
- In work briefs (any BRIEF containing "work"), append: "At work you're a bit tidier but still brief."

**P2. Rewrite pass before posting** (new `polish()`, called in `checkin` at `:121` before `reply`, and in `recheck` at `:134`; impact: very high; cost: 1 stateless Haiku call per posted reply, about 1.5k tokens)
- Prompt via `gen`-style argv:
  > "Rewrite this draft as ${n} would actually type it on their phone. Their style: ${card}. Their past texts: ${ex}. The last messages in the chat: ${last 12 lines}. Draft: ${draft}. Rules: keep only what ${n} really needs to say. Cut thanks, acknowledgements, sympathy formulas, restated plans or promises, 'I'll let you know/message when…', names (unless picking out one person in a group), greetings and sign-offs. Don't reuse a phrase, joke or opener from the last messages. Shorter is almost always right. Split into separate texts on blank lines if they'd send several. If nothing is left worth sending, reply DROP. Reply with only the texts."
- DROP → treat as PASS. Post the polished text.
- Write the polished text back to memory: needs P8, or a recheck-style fork that shows "(you sent:) …". Without that, session memory holds the draft.
- This also removes tool markup, "Tom:" prefixes and "Maya here".

**P3. Fix the events block** (`:107`, `:182`; impact: high; cost: none)
- User turn: `(${now}…)\n\n[Not on your phone. Only you know this: your own day since you last looked. Nobody in the chat has seen it.]\n${news}\n\n[The chat on your screen:]\n${chat}`.
- Generator text replaces "Leave the chat out…":
  > "Mostly ordinary, varied things, many of them neutral, good or funny; a setback at most now and then. No illness, injury, accident or emergency unless the situation calls for one. Don't continue or worsen earlier problems: they can simply be over. If ${n} said in the chat they would do something by now, say whether they did it (usually yes) and the concrete result (time booked, file finished, figures found). Include one small thing ${n} saw, heard, thought or wants to ask that they might feel like sending these people, or nothing if there isn't one. Don't say what ${n} posted or will post."
- This fixes self-address, misery, loops and dead days at once.

**P4. Agents know and can act** (append to `briefFor` and `NOTE`, `:23`/`:35`; impact: high on T6/T2-type runs)
> " You know everything about your own life, work and plans in full detail: when you'd know a figure, name, time or file, just use it, making up what the real person would simply know. Anything you can do on your phone (book online, check a rota, send a file) you can just do. To send a file, put [file: name.ext] on its own line."

**P5. Direct texting norms** (in `NOTE`, `:23`; impact: high; cost: none)
> " This is texting. Messages are short and often fragments. You don't reply to every message: in a group, if others have already answered or you'd only agree, thank or sympathise, send nothing or react. You don't restate plans, repeat promises or announce what you'll do next. You don't use people's names much. A sorry is 'ugh sorry'. You never give advice like a leaflet. You never write your own name before a message. Chats just stop; no need for a goodbye. You react to messages ${react>0.5?'often':'rarely'}."
- This holds even with P2 off.

**P6. De-lockstep the clock** (impact: medium on timing tells; cost: none)
- `:178`: `since = …[n, new Date(+START - Math.random()*REFRESH_HOURS*36e5)]`.
- `:17`: `+since[n] + rf([0.6, 1.8]) * REFRESH_HOURS*60*MIN`.
- `awake()` (`:82`): add a per-agent, per-day jitter of rf([-25, 40]) minutes to the wake time (design parameter).
- `:177`: set REFRESH_HOURS to 6, or fix the README.

**P7. Wants, topic and secrets** (generator `:169`; impact: medium-high for romance, secrets and the opener)
- Ask for an extra line per person, "`<name> wants:` one thing they want from these people this week (a date, a favour, to get closer to someone, to avoid someone)". Add it to the brief as "What you want right now:".
- For a secret-holder, the want must relate to the secret without saying it.
- TOPIC line (`:35`): "Something on your mind (put it your own way, not in these words): …".
- Setting instruction: "If the topic concerns something they share (a client, a parent), include the facts they all know about it. What they last talked about must be unrelated small talk."

**P8. Stateless turns (A/B arm)** (`turn`, `:69`; impact: medium; cost: probably lower than now, T1 used 3.0M input tokens)
- Drop `--resume`. Each check-in = system prompt (brief + style) plus a user turn with the last 30 chat messages (own ones marked "(you)", polished versions) and a 3-line "your recent days" from the events.
- This removes the build-up of polished assistant history, keeps P2 consistent, and stops the goodbye loops.
- Keep the forked sessions as the control arm.

**P9. Re-check:** keep it, but run P2 on the re-check answer too. Low impact.

**P10. Cut wasted calls** (impact: about −40% cost)
- With P3's shareable item, generate events only at unprompted looks and at most every REFRESH. Don't generate them at notification check-ins: `:101` currently refreshes at any check-in after 4 h.

**P11. Evaluation**
- Add blind windows of real group chats to anchor the scale. They must come from real, sourced and licensed text, per the data rule; nothing written to look real.
- Track the run stats alongside judge scores: messages per run, named rate, median words, PASS/event ratio, posts on :00/:30.

**Expected result:**
- P3, P4, P6 and P7 remove the structural tells: self-address, disasters, loops, tool leaks, lockstep timing, dead days.
- P1, P2 and P5 remove the register tells that every judge names.
- My estimate: about 6–7/10 from P1–P7. 8 most likely needs P2 tuned on real failure cases (iterate the rewrite prompt against flagged windows) and P8 if the A/B wins.
- Added cost: about 1 cheap Haiku call per posted message, more than offset by P10.

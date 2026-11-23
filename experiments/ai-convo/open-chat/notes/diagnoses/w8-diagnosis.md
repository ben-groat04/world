# W8 diagnosis (cold read of the W6 vs W7 paired batch)

## Evidence and scope

What I read:
- `HANDOFF.md`, `ITERATIONS.md`, `README.md`, `/home/user/world/CLAUDE.md`, `notes/diagnoses/w7-diagnosis.md`.
- `writer.mjs` (W7) in full, and the judge split in `eval-prep.mjs`.
- `eval/w7-batch/`: README, tally, `key.tsv`, `scores.tsv`, all 28 judge reports (216 per-window comments matched to labels), the cast rows of all 30 W7 chats, and about 15 transcripts in full (W7-R11, R21-R23, R31, R41A, R42, R61-R63, R72B, R73, R81, all six W7-S chats).

The counts below come from throwaway scripts over the log rows (posted messages, Claude answers left out). Each check in the plan says how to measure its item again. n is small (30 chats per arm), so only large differences are signals.

## Where W7 stands

- Score / p_real: W6 7.03 / 68, W7 7.23 / 69. That is within noise.
- p_real by scenario (W7): the 1:1 chats are high (R6 "just dumped" 83, R2 "My brother." 77). Group logistics and the topic briefs are low (R4 wedding 63, R7 dog walkers 62, S2 Tube 62, S1 Castle 68).
- The words judges used most, across both arms: tidy, neat or orderly (40 of 216 comments); staged, generated, templated or formulaic (35); a persona tic or quirk (22); a repeated or echoed line (25). Two more rose in W7: callbacks or resolved threads (W6 2, W7 11) and schedule or status announcements (W6 3, W7 11).

## Problems, evidence, root causes

### 1. The judging puts two windows of the same brief in front of one judge, and judges score the duplication

**Evidence**
- Every one of the 28 judges got two (one got three) windows of the same brief. These came from different seeds or arms. 48 such pairs in all.
- `PAIR=1` keeps only the two arms' versions of one cast apart.
- All 5 explicit "templated" detections of the batch come from this. All 5 are in topic briefs, where the user's question repeats from seed to seed:
  - "Same Brixton last-tube scenario as file 2f0786, which suggests a template" (c4f48c, W6-S22A, p_real 20).
  - "near-identical Edinburgh castle premise to file 528719, with the same Ross" (92ffaf, p_real 45, and its twin 528719, p_real 50).
  - "reuses the same Brixton question as 0669a8" (9ea0b9, p_real 30).
- A user of the app sees one chat, so this effect isn't one the product has. It lowers the S scores in both arms and adds noise to every comparison.

**Root cause:** `eval-prep.mjs` keys the judge split by cast (`label.split('-').slice(1)`, e.g. `R11`), not by brief (`R1`).

### 2. The `texts` line still tells the writer what each person talks about, and nearly everyone gets the same middling volume

**Evidence**
- 73 of the 108 W7 texts lines carry a purpose clause. W7's own check counted only "to" and "about" and missed this. Some examples, each with what it produced in the chat:

  | Person | texts line | What the chat shows |
  |---|---|---|
  | Dimitris (R73) | "mostly to share a quick note about the weather or the dogs" | "Rain is expected from about four this afternoon. I would take the walks earlier.", "Wind is picking up. Take a coat for the evening walk.", "Clear this afternoon. Cold tonight." The judges called these "stiff, formal weather reports" and "repetitive weather and fog announcements". |
  | Liam (R31) | "mostly about money or society payments, and not much otherwise" | Every message is about the subs sheet. A judge: "Liam's accounting messages … read like they belong to another chat". |
  | Paola, Hugo (R11) | "usually when a packing problem or a shift handoff needs passing along", "mostly only when something about a shipment or shift needs saying" | A chat that is all route numbers ("every message stays on topic", p_real 25). |

  Others: "mostly when something musical comes up" (Anita, R52), "mostly to chase copy and photos" (R3), "mostly to pass on a reminder or to thank someone" (R4).
- Frequency collapses to one value: "now and then" in 67 of 108 lines, "often" in 26, rarely in 12.
- Sender shares in groups are flat:
  - In the 5-6 person groups the top three senders hold 62-69% of messages (R41 0.63, R42 0.62, R52 0.69), and every member speaks every day.
  - The writer's own `BIGGROUP` sentence ("most messages come from two or three people") is not met.
  - Judges: "every person narrating their own hobby and daily life in rounds (run, brunch, gym, choir) … filler to establish personas" (R52A); "very orderly interleaving" (W6-S21A).

**Root cause**
- Any field the model writes about a person's chat behaviour comes back as a role, and the writer performs it. That is the W6/W7 finding about `is like` and `knows`, and it still holds for `texts`.
- Asked for a frequency, the model gives its mode ("now and then"). That is the same mode effect the project already fixed for names, work, place and openers by picking in code.

### 3. The style line is applied to every message, and its "plain" form makes the stiff speaker

**Evidence**
- A level word does not set a rate. People whose style says little still put emoji in most of their messages:
  - Lerato, "Light emoji use and few abbreviations": emoji in 86% of her messages.
  - Kate, "some emoji and few abbreviations": 83%.
  - Sara, "Light use of emoji": 76%.
  - Heba, "Frequent emoji": 93%.
- 12 of 106 W7 people (with 5 or more messages) have emoji in at least 60% of their messages (W6 17 of 103).
- Judges: "Diana's emoji on every line is a bit stylized" (R42B); "the emoji use is uniform" (R53B); "Samir's repeated '🙂 haha'" (W6).
- The negative form makes the formal register:
  - Dimitris's style is "Almost none, with plain full sentences" ("I am here already. … I do not know the number.").
  - People whose style says "no abbreviations / full sentences / plain" write capital-start messages of over 12 words with no contraction in 18.5% of their messages. The rest write them in 11%.
  - Judges: "Dimitris's formal style", "stiff, formal" (R73A), and "Serkan's formality" in W6.
- The model-written lines collapse: 14 of 30 casts have two or more people with the same style line (R42: four people "a little emoji, no abbreviations").

**Root cause**
- Any typing descriptor is read as a person-constant register and applied per message. Three wordings (W5 "most use few", W6 tokens, W7 levels) moved the symptom between "formal" and "tic" without removing it.
- The line was kept in W4 only because without it everyone wrote lowercase (W4 item 3). Capitals have been applied by code from the `capitals` field since W5, so that reason no longer holds.

### 4. Each day is written as one schedule: one message per free slot, each explaining the slot

**Evidence**
- Messages that report the sender's own status are 8.9% of W7 messages (W6 6.6%). That covers going to sleep or bed, just woke or up, on break, service done, off shift, lunch, class done, home, on my way. The extreme is W7-R81, at 17 of 52 messages:
  - Galih: "Service done. 12 dec good", "Service done. Back room seats 30 …", "Service done. Ok room …"
  - Fitri: "on break. 2 cake places …", "break 🫠 sat rush already …", "on break again 😭 cake order by mon", "off shift. …", "home. feet dead 😭🫠"
  - Ayu: "Going to sleep soon" on three nights, plus "Lunch.", "Class done."
- In the same chat, Thursday has 14 messages at 14 different times with almost no exchange within minutes. Each message sits in its own sender's free moment. Judges:
  - "Almost every message announces the sender's schedule ('service done', 'on break', 'sleeping soon'), which reads as formulaic" (41b250, p_real 35).
  - "Everyone's sleep or shift status is stated neatly" (2f0786).
  - "the day's schedule is neatly spread out" (a7ddfb, 38).
  - "repeated 'out with friends, it's loud' lines feel like persona tics" (95edf7, 27/40).
  - "the repeated late-shift and library details are slightly heavy" (a7ddfb).
- Across the 60 chats, the share of gaps of 2 minutes or less correlates with p_real at r = +0.34. That is the largest correlation of the simple measures I tried. The share of status messages correlates at -0.12. Mean words per message correlates at -0.34, and group size and emoji share each at -0.28.
- The same mechanism produces co-presence errors. With the day written as a schedule, a visit is written into the chat:
  - R63: Njoroge, at Nyambura's door: "Here. Smells good". Nyambura: "Sit. Don't touch the pot". Then, while they are together, "Better than the walls" (two judges: "ambiguous", "unclear").
  - R62: Fionn arrives at Orla's flat at 21:01. Orla then texts him "Still up?" at 23:48, and he texts her "Up. Ur still asleep ya" from her couch.
- It also produces the tidy set-up and pay-off. Each thread is a scheduled item that gets its slot later:
  - R11's blue dolly: "loose wheel" (Mon 21:48), "found the blue dolly" (23:50), "Maintenance fixed the wheel" (Tue 17:05). Judges: "set up and paid off too neatly".
  - R31B: "every thread closed by a callback" (p_real 45/55).
  - R41A, the tasting swap: Yolanda can't go, Sibongile "already out that side", "you're an angel" ("tidy and over-neat", 30).
- And it produces day-to-day replays. Day 2 copies day 1's beats:
  - R72: "Friends at the bar, too loud to think 😂" (Sat), then "Out with friends, it's loud 😂" (Sun).
  - R22: "Just woke up. U still up?" twice.
  - R11: "Up." and "Signed" each shift.
- And time slips inside a long write: "is it still 17" asked at 19:12 (R11A, 25); Eleanor "up at 5" and then "off today" (S21B, 30).

**Root cause**
- Each call writes a whole day ("through Saturday and Saturday night … Write as many messages as these people would really send in this time"). In front of the writer is every person's routine: the life line's "how your days usually go", sleep hours, and BACKGROUND's "you know what happens in them". So the writer does what a planner does with a day: it gives each person a turn in each of their free slots and explains the slot in the message.
- W7 removed "what you already know about each other" from the setting. With nothing saying the others already know each other's routines, the writer has people tell them, which fits the rise from 6.6% to 8.9%.
- In real texting a chat comes alive when someone has a reason to send something. Whoever is on their phone replies within minutes, then it goes quiet. Nobody needs to explain why they are free.
- The unit of writing, a day, is the cause. W2-W5 wording against tidiness and status messages did not move it.

### 5. Topic briefs open by pasting the user's question

**Evidence**
- In the topic briefs, the first message's share of topic words is 0.85, 0.31, 0.71, 0.92, 0.55 and 0.62 (W7-S11 to S23).
- Some openers are the question verbatim: "What time does the last tube leave brixton on a sat night" (S21) and "Is edinburgh castle open on mondays in winter? And how much are tickets" (S11).
- The @claude message then repeats it a third time (S12 asks the same question three times in two minutes).

**Root cause:** for a topic brief, casting writes no opener options (`castPrompt` drops the line when there is a topic). The writer's opening is "X has this on their mind: <the user's words>", and copying is the easiest move. Plain briefs got code-picked openers in W7 and vary 3 of 3. Topic briefs did not get them.

### 6. @claude narrates its search, and one "Source:" line remains

**Evidence**
- About its method:
  - "I didn't open the timetable pages to confirm that, so it comes from search snippets." (S21)
  - "I checked the sources about the Brixton Windmill on that street, so I'm assuming the gig venue is on the same road." (S22)
- One answer still ends "Source: https://www.TfL.gov.uk/cdn/…pdf" (S23; W7 item 7 measured 0 on a smaller set).
- Every figure is hedged twice ("I couldn't pin down the adult price. The official table shows £23.50 … but I couldn't confirm its date").
- Judges: "Claude's reply is sensible but a bit hedgy", "the bot is partly wrong or unsure", "cites a strange third-party site and an odd TfL PDF link. It reads as constructed" (2f0786, 30).

**Root cause**
- `ORACLE_SYS` makes the method the subject: "open the pages … instead of going on search snippets", "Say plainly when you could not confirm something", "State only what the pages you found say". At effort low, Sonnet does not always open pages, and then it confesses this.
- "At most one bare URL" does not exclude a label in front of it.

### Looked at and not changed

- Work and names: the top occupation is 5 of 108 (pharmacist, graphic designer) and the top name 3 of 108. W6's variety targets are met.
- Places and language: R23 Bologna is written in Italian, R11 Mexico City in English with "oye". The judges took both as natural.
- Claude unable to see `[link: …]` or `[photo: …]` (S11): judges scored those answers 8-9 ("honest").
- Silent days and AI-agent casts: the user's rule (no constraint either way).

## Implementation plan (W8)

Rules for the coder:
- Edit `writer.mjs`. Keep W7 as `writer-w7.mjs`. Tag the log `writer: 'w8'`. Put check scripts in `w8-checks/`.
- Every item runs ahead of the story clock as now. The @claude cut-and-resume keeps its shape (item 7 says how it fits the new unit).
- The writer prompt gets shorter: `BIGGROUP`, the style clause, the typing-habits sentence and two `TEXTING` sentences go.
- Build in this order. Items 1-6 are small; item 7 changes the writing unit and has its own gate.

### Item 1. Judge split by brief (`eval-prep.mjs`)

**Change**
- The `taken` key becomes the brief: `f.label.split('-')[1].slice(0, -1)` (`W7-R11` → `R1`), whenever `PAIR` is set. A judge then gets at most one window of any brief, across seeds and arms.
- `N` becomes at least `COPIES` × the largest number of windows that share a brief, so the filter can always place a file.
- Update the comment.

**Check:** rerun the prep on `eval/w7-batch/list.txt` into the scratchpad (no judging). Judges holding two windows of one brief: 0 (now 28 of 28).

### Item 2. Chat volume picked in code; no model-written `texts` line

**Change**
- In `castPrompt`, delete the `"<name> texts:"` line.
- In `parseCast` (or right after it), for a chat of 3 or more people, shuffle the names. The first gets `"${n} texts in this chat a lot."` and each of the others gets one drawn from `"${n} texts in this chat now and then."` and `"${n} texts in this chat only now and again."` (equal odds). This is a design choice, like `PLACES`.
- In a 1:1 chat there is no texts line.
- `block()` prints `p.texts` when present.
- Delete `BIGGROUP`, `FULL` and `BIG`, and the `full` logic in `block()`. They only gated style and the volume sentence.
- Old casts in list mode keep their old line (it is read from the row).

**Check**
- 30 casts (`--gen --days 0`, the 10 W7-batch briefs × 3 seeds): texts lines with a purpose clause, 0 by construction. Confirm no `texts:` line in the raw casting replies.
- Chats (the plain briefs, 1 seed, 2 days): in groups of 3+, the "a lot" person is the top sender in at least 2 of 3 chats, and the mean share of "only now and again" people is below 1/N.
- By eye on 3 group chats: no person whose messages are all about one subject because of their role.

### Item 3. No style line

**Change**
- Delete the `"<name> style:"` line from `castPrompt`, the `style` field from `parseCast`'s cast row, and the `How X types…` clause from `block()`. `parseCast`'s "every field defined" test must not require style.
- Delete BACKGROUND's sentence "A person's typing habits show in some messages, not all; most messages are plain."
- `capitals` stays: code applies it as now.
- With no line, how a person types follows from who they are (age, place, life), which the writer already has.

**Check (the item 2 chats)**
- People (5 or more messages) with emoji in at least 60% of their messages: at most 2 (W7 12 of 106).
- Share of messages with any emoji: report it (W7 20%, W6 24%, W5 8%).
- People with emoji in 0% and people at 30% or more: both groups non-empty across the set. Voices still differ; this is W4's abort line, restated now that capitals are code.
- Capital-start messages over 12 words with no contraction, per person: no person over 30% of their messages. Report the overall share (W7 11-18%).
- Abort line: if the batch has no person at 30% or more (everyone writes alike), restore the W7 style line and report.

### Item 4. Background says what the others know; life without the daily routine

**Change**
- `BACKGROUND` becomes:

  > This is background you know as the writer. The others know about each other's lives what people who know each other this way would, so nobody tells them what they already know. Their days are ordinary; now and then something from someone's day comes up, unplanned.

  This drops "and you know what happens in them" and the typing sentence (item 3).
- In `castPrompt`'s life line, "who you live with and how your days usually go" becomes "and who you live with". Sleep hours stay on their own line.

**Check (the item 2 chats)**
- Status-message share (regex in `w8-checks/status.mjs`: going to sleep/bed, sleeping soon, night all, just woke/woke up, a bare "up" or "morning", on break, a bare "break", service done, off shift, a bare "lunch", class done, on site, between jobs, just off, a bare "home"/got home, shift done/over, at work, on shift, leaving for, on my way): below W6's 6.6% (W7 8.9%).
- No person with the same status opener on 3 or more days.

### Item 5. Topic briefs get opener options too

**Change**
- In `castPrompt`, always write the opener line. With a topic, it reads:

  > Last, one line starting "<first> opens with:", four different things, each a short phrase starting with a verb (what is sent, not just the verb) and separated by " | ", that <first> might send <the group / the other> to start on this.

- `parseCast` requires 2 or more options in both cases.
- `promptFor`'s opening, with a topic, becomes `${first} has this on their mind: ${c.topic} ${first} picks up the phone to ${c.opener}.` The topic stays in the prompt, because the @claude ask needs it.

**Check (S1, S2, and two new fact topics × 3 seeds, `--oracle`, 1 day)**
- 3 distinct openers per brief.
- Topic-word share of the first message: median below 0.5 (W7 about 0.67), none at or above 0.9.
- At least 1 @claude ask per chat still.

### Item 6. @claude: the answer is the fact, not the search

**Change**
- In `ORACLE_SYS`, replace "Check facts with web search, and open the pages you rely on instead of going on search snippets. Say plainly when you could not confirm something. State only what the pages you found say, never from memory." with:

  > Look it up with web search and read the pages you rely on. Say what they say, never from memory, and not how you searched; if they don't settle it, say in a few words what is unclear.

- In the user turn tail, "if you point to a source, at most one bare URL" becomes "if you point to a source, at most one bare URL, with no label".
- The oracle runs at effort `medium` instead of `low`. This is a design parameter. The answer's stamp already follows the real call time, so a slower call only stamps the answer a little later.

**Check (`--oracle`, F1-F5 plus the item 5 topics, 1 seed, 2 days)**
- Answers with a "Source" label: 0.
- Answers matching `snippet|search result|I searched|I checked the sources|didn't open|couldn't open`: 0 (W7 2 of 10).
- At most 1 URL per answer, and median words under 80.
- When nothing is found, the answer still says it couldn't find it (check by eye).

### Item 7. The writing unit is the next stretch of the chat, not a day

**Change**

Each writer call writes one stretch: from the next time anyone sends something until the chat goes quiet. The day frame (04:00 bounds, `calLine`, the 12 h week-jump reject) stays, because it anchors weekdays and ends the run.

1. Span lines in `promptFor` replace the three current ones. `LAST`, `NIGHT` and `stampOf(to)` are computed as now.
   - First call of the chat:

     > Write the first stretch of this chat: ${first}'s first message at ${stampOf(from)}, and the messages that follow while people are on their phones, until the chat goes quiet.

   - Later call:

     > Write the next stretch of this chat: the next time anyone sends something after the last message above (minutes or many hours later; a message after midnight on ${LAST} night is headed ${NIGHT}), and the messages that follow while people are on their phones, until the chat goes quiet. If nobody would send anything before ${stampOf(to)}, reply only (quiet).

   - Resume after Claude's answer:

     > Continue this stretch of the chat from ${stampOf(from)} until it goes quiet.

2. `TEXTING`: delete "Quiet stretches of hours are normal." and "Write as many messages as these people would really send in this time." Add "People who are together talk in person, not in the chat."
3. In `chunk()`, a reply matching `^\W*\(?quiet\)?\W*$` returns `{ dm: [], quiet: true }` before `parse`. Every stretch has min 1. The 12 h reject past `to` is unchanged.
4. `writeDay(c, secrets, all, from, to, label, dayStart, emit)` loops stretches:
   - Call `chunk` from the last message (or `from`).
   - On quiet, or when the stretch's last stamp is at or past `to`, the day ends.
   - Otherwise `emit(stretch)` and loop.
   - An @claude mention inside a stretch cuts it as now: emit up to the question, post the answer, resume with the resume span.
   - `emit` is the main loop's `ms => { all.push(...ms); flush(false); sink?.play(ms); }`, so the viewer gets each stretch as soon as it is written. Generation runs ahead of the clock as before, and `play`'s chain waits on story time.
   - `MAX_ASKS` stays per day.
   - Add `MAX_STRETCHES = 16` per day: a design bound against a runaway loop. Log it if it is ever hit.
5. Keep `chunkEnds` and the main loop's `from = all.at(-1).at`. A stretch that runs past 04:00 moves the next day's start, as now.
6. Log `stretches` and `quiet` counts per day in the run row.

**Check**
- `w8-checks/stretch.mjs` on the item 2 chats, rebuilt with items 1-7:
  - Share of gaps of 2 minutes or less (W7 0.32): report it, and expect higher.
  - Median messages per stretch, and the median story span of a stretch. **Abort line:** if the median stretch spans more than 3 h, the writer is still writing days; revert item 7.
  - Stretches and calls per day, format retries and stamp rejects (no higher per call than W7), and quiet replies.
- Status share: the item 4 regex, below 6.6%.
- Co-presence, by eye, on the R6 ("just dumped") and R2 casts × 3: no message between two people the chat has put in the same place (W7: R62, R63).
- Live:
  - `--live` with a fact-topic spec and oracle at `--speed 60`: turns are released on the clock, the @claude question is answered and the stretch resumes, and `run.json` reaches done.
  - Report the longest real wait between released turns that are under 5 story minutes apart. A wait means a stretch was still being written.
  - Also run `live-spec/r1.json` to done.
- **Gate** (one small paired judged check, decides item 7 only):
  - Cast the 10 W7-batch briefs once with W8 casting (`--gen --days 0`, 1 seed).
  - Run `w8-checks/writer-day.mjs` (a copy of writer.mjs after items 2-6, before item 7) and `writer.mjs` in list mode on those casts, 2 days, with the same start times.
  - Judge with `judge.mjs`, 2 per window, `PAIR=1` (the item 1 split).
  - Keep item 7 unless its p_real is behind by more than 5 points. If it is behind, revert to `writer-day.mjs`.
  - Report p_real, then score, by window.

## Then: the paired batch

- **Briefs:** fresh ones (not N, O, K, F, P, Q, R or S). Include two minimal ones, one topic that implies a place, two @claude fact topics, and one 1:1 that involves meeting up.
  - 3 seeds, 2 days.
  - At least one start between 22:00 and 23:59.
- **Arms:** W7 (`writer-w7.mjs --gen`) against W8 (`writer.mjs --gen`). Each arm uses its own casting, with a shared brief, seed and start.
- **Judging:** `judge.mjs`, 2 per window, `PAIR=1` with the item 1 split. Report p_real first, then score, by window and by scenario.
- **Metrics on both arms:**
  - status share
  - share of gaps of 2 minutes or less
  - top-sender share in groups
  - people at 60% emoji or more
  - long formal messages by person
  - texts purpose clauses (W7 only)
  - first-message topic-word share
  - Claude answers with a Source label or method talk
  - messages per day
- **Live:** one run from the Start form at normal speed, with an @claude question answered mid-chat.

## What this plan does not do

- No wording against jokes, tidiness, callbacks or status messages as such. Those are attacked through what causes them:
  - the role fields (items 2 and 3)
  - the routine in the background (item 4)
  - the day as the writing unit (item 7)
- No volume rule. Volume is per person and drawn in code, and the writer decides when the chat comes alive.
- No rewrite pass, no per-person agents. Nothing is changed after it is released.

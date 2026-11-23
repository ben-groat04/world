# W5 diagnosis (cold read of the W4 final fresh batch, plus the user's live Riemann run)

Evidence: the 24 chats in `writer-runs/2026-11-23T06-54-59-684Z/` (8 briefs x 3 seeds, oracle off), their judge reports in `eval/w4/final/`, the live run `writer-runs/2026-11-23T07-03-43-834Z/live/` (housemates), the W4 @claude check runs (`06-47-17-457Z/F1..F5`), and the user's live run `writer-runs/2026-11-23T07-13-38-260Z/live/` (spec `live-spec/r1.json`). The counts are crude regex counts over 1741 messages. The scratch scripts are in this session's scratchpad. They are short, and item 0 says what each one should measure.

The user's observation on the live run, in their words: "the run is just making shit up why is it not discussing truthfully, it even has the oracle."

## 0. The score is not measuring the goal
- `judge.mjs` asks for "Score each file from 0 to 10" and names no criterion. Four of the 12 judges said what they were scoring, and it was not realism:
  - j4: "how clear, cooperative and warm it is"
  - j7: "clear, considerate communication, warmth"
  - j8: "natural, warm and functional"
  - j12: "how pleasant and healthy the communication is ... with a deduction for friction"
- So realistic awkward chats get docked. The exes chats got 5-6 for "Paolo's terse replies and the lingering feelings" and "Dan's clipped, anxious replies". The couple window 9a6eaa got a 5 because "it ends on a cold 'Fine. Night.'"
- `eval-prep.mjs` already writes `judge-detect.txt` ("how likely, 0-100, is it that this chat is between real people texting?"), and the tally already reads a third column. But `judge.mjs` never sends that question, so `scores.tsv` has 2 columns in all 94 rows. The 7.12 is a mix of realism and niceness.

## Problems, with evidence and root causes

**1. The user's live run makes things up (situation "Agents of the same AI model", topic "Discuss the solution of the Riemann Hypothesis", oracle on).**
- What happened:
  - The cast is two human maths friends in Osaka (Kenta, a software engineer; Mio, a teacher). The situation was dropped.
  - The setting invents a world event: "A preprint claiming a proof has been circulating online this week".
  - The writer then invents its details over three days: a 40-page preprint "from a small institute", "lemma 4.7", "a 2019 paper from a group in germany", the author's tweets, "arxiv has a v2 from last night. 41 pages", "a Sobolev embedding".
  - Nobody asks @claude once (0 asks in 170 lines).
- Root causes:
  - (a) `castPrompt` hard-codes humans. It says "These N people", "a first name that fits the place, culture and age", an occupation and a life, plus a `PLACES` city drawn in code. So any situation that isn't ordinary people is overwritten.
  - (b) The casting call is told it writes "background details about characters for a story" (`GENSYS`). Nothing says the setting must not invent real-world facts. A topic that presupposes something false ("the solution") gets resolved by inventing a fictional preprint. The writer then treats that preprint as given.
  - (c) The writer's `ASK` covers only lookup facts ("a timetable, opening hours, a price, a rule"). It says nothing about claims about the world in general: research, news, history, science. So the characters state invented specifics freely.
  - (d) `askClaude` gets only the question text, not the chat. Claude cannot answer anything that depends on the conversation. The writer also writes @claude questions as fully specified search prompts ("I need the exact deadline and whether it runs from...", "Say which bits you couldn't find"), not as people type.
  - (e) Claude's answers are long and use markdown: tables, bold, source lists (F1-F5), even though ORACLE_SYS says "Keep answers short". It was never told it is posting into a chat.

**2. A fixed register pair. Every 1:1 is "one lowercase, one full sentences with proper capitals".**
- In the cast style lines, 9 of 9 two-person casts pair a lowercase typer with "full sentences / proper capitals and punctuation". "Full sentences" appears in 22 of 24 casts.
- The capitalised person is the stiff or quipping one:
  - Camila: "Oi, Thiago. Obrigada por falar."
  - Omar: "Fine. Night."
  - Sohini: "Thank you, Debojit."
  - Yusuf: "Sorry, that's the most boring message I've ever sent."
  - Jonas (live): "It's full and it's making a point." and "I am innocent and the coffee machine is my witness."
  - Mio (Riemann): "Standard is doing a lot of work in that sentence."
- The capital-minus-lowercase word gap is 3.6. Judges named the same speakers: "Krit's dry replies", "Dev gives short replies ('Good.')", "Arnab's ... formal phrasing feel staged".
- **Root cause:** the writer reads "capitals and full stops" as a register (Haiku's own prose voice), not as keyboard mechanics. The casting call writes everyone's style together, so it contrasts them as a set.
- W4 item 3 showed both halves. With the line removed, the formal speaker went, but nearly everyone typed lowercase (capital starts 39% to 9%), and that tripped the abort. Capitalisation is something the phone does to the letters. Moving it there removes the register link and keeps the casing difference.

**3. Every day is a full episode that closes at bedtime.**
- 0 of 72 story days are silent, including the exes, the debtor and creditor, and the couple.
- Per-day counts are flat within each chat: 35/27/39, 37/36/35, 23/18/11.
- 54% of days end on a night or bed line within the last two messages. 7.6% of all messages mention night, bed or sleep. "morning" openers appear every day.
- Examples:
  - K6-K63: "Vou dormir." / "boa noite cami" / "Boa noite, Thiago.", then "bom dia. vc ja ta no trampo". A debtor and creditor small-talking daily.
  - K4-K43: "Fine. Night.", then "Night." on two nights running.
- **Root cause:** the span line asks each call to write a day "from whenever the first of them picks up the phone until the last stops for the night". That presupposes the chat is active every day and that its day has a close. `parse()` also rejects a later day with fewer than 2 messages, so a silent day is impossible.

**4. The opening situation stays the standing frame on every day.**
- `promptFor` puts `c.situation` ("Friends arguing about a film.") at the top of every day's prompt.
- K1-K11 is still arguing about the lamp on day 3 (film words 16/35, 10/27, 10/39; "lamp" 21 times across 3 days; last line "Going to bed. Still think it's a cop out").
- K1-K13 day 3 ends "Bed. Dan, I'm still right about the ending."
- Judges: "the argument loops a little", "somewhat repetitive".
- **Root cause:** a situation that is an event ("arguing about a film", "planning a trip", "owes money") is restated as what the chat is about every day. The Setting already holds the relationship.

**5. People text each other while they are together.**
- K5-K51: at the pub together, Nadia texts the group "Drinking a spritz. Kirsty is judging my spritz", and Kirsty replies in the chat. Stephen "lives with" Kirsty ("Stephen is snoring"), yet "He's on the sofa four miles away".
- K2-K21: Ryota, on shift in the same kitchen, texts "who has the grill knife. its not on the magnet" and Yuki answers.
- K2-K23 at close: "closed. davide go home".
- Live housemates: Jonas texts "Back." at 21:02, then texts the bin question to Lena, who is home in the same flat, at 23:02.
- **Root cause:** the writer's only output channel is messages. To show an evening at the pub or a shift, it has to write it as messages. The "lives with ... do not text each other" clause and TEXTING's "people they are with in person they talk to there" are rules with no outlet, and they cover only homes.

**6. Status broadcasting from the life line, and chat-aware lines.**
- Routine updates recur every day in the same words:
  - Chloe: marking and spellings, all three days.
  - Dan's "best lunch" ranking.
  - "home." / "Leaving for shift" / "on site" / "in the van till 5".
  - Bea: "Leaving for shift now" on two nights.
- 12 lines comment on the chat itself:
  - "you're doing the thing where you say ha and leave" (twice)
  - "That's a very honest thing to say to a group chat."
  - "I'm typing at you, which is different."
  - "ok let's not decide the leaving time in a chat"
  - "You will not get an answer in this chat."
- **Root causes:**
  - The life line is a fixed daily routine and the writer's only per-person material, so the routine becomes the day's messages.
  - The 120-word TEXTING block is all about texting norms, and it primes characters who are aware of texting.
  - Item 5's missing offline channel adds to the status lines: "home." is how the writer marks a move.

**7. Running gags and callbacks remain.**
- Examples: the lamp; "Mr Hunter would..." (4 times); "the lad on site" (4 times, across days); the burrata (judge-named); "homework", the "sunburn" closing line; the wood burner, chimney and stove (6 times).
- Questions are answered within 2 h 95% of the time. Same sender twice running is 13%.
- Crude motif count: 3.7 chat-born motifs per run, 1.5 reaching back 2 or more days. So limiting history would cut little and would cost plan continuity. Don't do it.
- Three rounds of wording, the delete pass (lost 6.58 vs 7.49) and Sonnet (no better) have not moved this.
- The carriers are mostly the capitalised speaker (item 2), the daily-episode frame (item 3), the standing situation (item 4) and the lack of an offline channel (item 5). This plan fixes those causes and measures the gag rate. It adds no new anti-joke wording, which has failed three times.

**8. A whole day rejected for one ordering slip.**
- The one reject in the batch (K5-K52) has "Tue 21:02, Riju" followed by "Tue 20:15, Ishita".
- `dated()` reads the backwards stamp as a week later, and `chunk()` throws away the whole day and regenerates it. Live, that costs a full call of latency.
- **Root cause:** a backward step within the same weekday is the writer interleaving threads. It is not a week jump.

## Implementation plan (in order; every item works chunk by chunk ahead of the story clock and leaves @claude cut-and-resume intact)

**Item 0. Judge on the goal.** In `judge.mjs`, append `judge-detect.txt` (when present) to the ask, after the score ask. Parse a third number per file:
- The SCORES lines become `<id> <score> <p_real>`.
- Write `id\tscore\tp_real` rows.

Report p_real as the primary number from now on, and keep the score for continuity.
- **Check:** re-judge `eval/w4/final` once with the new judge.mjs (94 files, same folders). All rows have 3 columns. Report mean p_real per brief. That gives W5 its baseline (same casts, so W5 vs W4 can be paired).

**Item 1. Casting keeps the situation's nature and invents no world facts** (`castPrompt`, `GENSYS`).
- `GENSYS`: replace "for a story" with "You write short background details about the participants of a simulated chat."
- In `castPrompt`:
  - Replace "These ${N} people" with "These ${N} participants".
  - Add after the first paragraph: "Cast them as what the situation says they are (people, unless it says otherwise)."
  - Make the place sentence conditional in wording: "If they are people and the situation doesn't say where they live, they live in ...".
  - In the Setting line, add: "Do not invent public facts or events (news, publications, research results, records); only what these participants would really know, true in the real world."
  - Names: "a name that fits who they are" (keep the uniqueness check; let the name regex allow digits, e.g. `[\p{L}\p{M}\d-]`).
- **Check** (`--gen`, the r1 spec as a brief plus "Agents of the same AI model." without a topic, plus 2 of the 8 K briefs):
  - The r1 cast is AI agents, not humans in a city.
  - No invented publication or event in any setting, by eye.
  - The K casts still get a PLACES city.

**Item 2. Truthful talk about the world, and Claude with context** (`ASK`, `askClaude`, `ORACLE_SYS`).
- `ASK` becomes:

  ```
  Anyone can ask Claude, an AI assistant in this chat that reads it and searches the web, by starting a message with "@claude"; stop right after such a message. What anyone says about the real world (news, research, timetables, prices, rules, history) is true or plainly unsure; when the chat needs such a fact that they would not know offhand, someone asks Claude, and nobody states it until Claude has posted it.
  ```

  This replaces the old ASK. It stays one item, not a new rule.
- `askClaude(q, recent)`: send the last 30 messages of `[...so_far, ...day]` as a transcript, then `The message to you: <q>`.
- `ORACLE_SYS`: say it is posting in a text chat between these people, plain text without markdown, a few sentences, sources as a short mention.
- Without `ORACLE`, the truthfulness half still belongs in the writer prompt. Put "What anyone says about the real world is true or plainly unsure." into TEXTING unconditionally, and leave only the Claude half in `ASK`.
- **Check:**
  - The r1 spec live (speed high) and the 5 F briefs of the W4 @claude check.
  - Ask rate (target at least 1 per chat that needs facts).
  - By eye, invented specifics about the real world (target 0 in r1).
  - Claude's answers: markdown lines 0, median under 80 words.
  - @claude questions read as typed in the chat (by eye, against the F1-F5 logged questions).
  - Cut-and-resume still resumes.

**Item 3. Casing done by the keyboard, in code** (`castPrompt`, `parseCast`, `block`, parse step).
- Casting:
  - The style line becomes: "<name> style: one plain sentence on emoji and abbreviations only; most people use few."
  - Add a line "<name> capitals: yes or no, whether <name>'s messages start with a capital letter".
- `block()` never mentions capitals or full stops (the style line now can't).
- After `parse()`, for people with `capitals: yes` (old casts without the field: unchanged):
  - Upper-case the first letter of the message and the first letter after `. `, `! ` and `? `.
  - Turn a standalone `i` into `I`.
- Leave every other character as the writer wrote it.
- This runs per message before release, so it works live and on resumed days.
- Remove TEXTING's now-dead clause "someone who types with capitals and full stops talks as plainly as the rest".
- **Check** (8 briefs, 1 seed):
  - Capital-minus-lowercase word gap under 2 (was 3.6).
  - Stiff formal speaker in 2 or fewer of 8 chats by eye.
  - Capitalised message share between 20% and 80% (W4 item 3's failure was 9%).
  - Abort if every cast says yes or every cast says no.

**Item 4. Days are not episodes** (`promptFor` span lines, `parse`, `writeDay`).
- First day: "Write the messages in the order they were sent, starting with ${first}'s first message at ${stamp}, through tonight (a message after midnight is headed ${nx})."
- Later days: "Continue the chat from after the last message above, in the order the messages were sent, through ${weekday} (a message after midnight is headed ${nx}). Some days nobody texts: then reply only (no messages)."
- Resume: "Continue the chat from ${stamp}, through ${weekday}."
- Keep "The next day is written separately."
- `parse()`: a reply that is only `(no messages)` returns `[]` for a later day, so the min is 0 on later days and stays 5 on the first.
- `writeDay` returns an empty day as `{dm: []}`. The loop then must not take `from` from an empty `r.dm` (it already uses `all.at(-1).at`). The live sink plays nothing for that day.
- **Check** (8 briefs):
  - Silent days above 0 overall, and 0 silent first days.
  - Days ending on a night or bed line below 25% (was 54%).
  - Night/bed mentions below 4% (was 7.6%).
  - Messages per 24 h, abort under 8.
  - No new rejects.

**Item 5. The situation is the opening, not the frame** (`promptFor`).
- First day as now.
- On later days (`so_far.length`), the first line becomes ``These people are in a ${chat}: <names>.`` followed by the Setting. Drop the `c.situation` sentence and the "They are friends." fallback.
- **Check:**
  - K1 day-3 film-word share (was 25-30%) falls.
  - The K2 kitchen chats still read as work chats by eye (the Setting says they work together).

**Item 6. An offline channel** (`promptFor`, `parse`, `transcript`, `block`, TEXTING).
- Add one sentence: "Between messages you may put a line in square brackets for what happens off the phone, e.g. "[19:30-22:00 Ross, Kirsty and Nadia at the King's Arms]"; nobody sees these lines, and people who are together talk there, not in the chat."
- Delete the `lives with ... do not text each other` clause in `block()` (keep "lives with X" as a fact) and the TEXTING clause "people they are with in person they talk to there".
- `parse()`:
  - A line that is only `[...]` is not message text. Keep it as `{note, after: <index>}` on the chunk.
  - It is never emitted to the live sink or the eval transcript.
  - Log it as `{note, at}`.
  - `transcript()` for the writer's own `so_far` includes the notes in place, so later days and resumes know who was where.
- **Check** (8 briefs plus the housemates spec live):
  - No bracket text in any released turn or transcript.
  - Rejects not up.
  - By eye, count message exchanges between people while together. Was: K5-K51 pub, K2-K21/K2-K23 shift, live housemates. Target 0-1 in 8.
  - `w4-checks/cohab.mjs` below 24%.
  - "home."/"leaving" status lines are counted (above).

**Item 7. Trim TEXTING after items 3, 4 and 6.** Remove the clauses those items make dead: the capitals clause, the co-presence clause, and "Nobody texts while asleep" (the span and sleep hours carry it). Don't add new ones.
- **Check:** chat-aware lines (regex in item 6 of the evidence: "group chat|this chat|in a chat|typing|doing the thing") below 4 in 24 chats (was 12).

**Item 8. Ordering slip is not a week jump** (`dated`).
- If a stamp is earlier than the previous message's and on the same weekday, set it to the previous message's time instead of adding 7 days.
- A real week jump (a different weekday) still goes to the stamp check.
- **Check:** re-parse `rejects.txt` of the final batch. The K5-K52 reject parses, in order, with no week-later stamps. Then a fresh 8-brief run: rejects at or under the W4 level.

**Then:** a paired fresh batch, W4 vs W5 on the same 24 casts. Recast W4 casts with item 1 and 3 fields where needed; the W5 arm casts for itself if that isn't possible, and the report says so. Judge with item 0, report p_real and score. Keep each item's check numbers in ITERATIONS. Measure the gag and callback rate (motifs per run, now 3.7) and "?" answered (now 95%) on the batch. These are not targeted by a new rule; they are expected to move through items 2-6.

Against ITERATIONS:
- Item 3 does not reword the style line (W2 item 1 failed). It takes casing away from the model, which answers W4 item 3's abort.
- Item 6 gives the writer an outlet instead of a rule (the "lives with" rule left 24% cohab replies, and none of the shift or pub cases were covered).
- Item 4 removes a presupposition instead of adding a "not every day" rule.
- No rewrite pass, no delete pass, no per-person agents.

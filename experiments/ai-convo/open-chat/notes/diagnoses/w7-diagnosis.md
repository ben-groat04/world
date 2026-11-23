# W7 diagnosis (cold read of the W5 vs W6 paired batch)

## Evidence and scope

What I read:
- The 60 chats in `eval/w6-batch/chats/` (W5 and W6, plain and oracle), with their cast rows.
- All 28 judge reports in `eval/w6-batch/cut/judges/`, plus `scores.tsv`, `key.tsv` and `tally.txt`.
- `writer.mjs` (W6) and the casting prompts in `writer-w5.mjs`.

The counts below come from throwaway scripts over the log rows (posted messages, Claude answers left out). Each check says how to measure its item again.

## Where W6 stands

- Score / p_real: W5 7.44 / 78, W6 7.31 / 79. That is within noise.
- Windows that score 5-6 while p_real stays at 80-90 are mostly short B windows. Judges call them "thin" or "little content".
- The W6 windows with the lowest p_real are P62A (25), P81A (30), P61A (48), P41B (50), Q11B (52) and P72A (55).
- Five of those six trace to two W6 casting regressions (problems 1 and 2). The sixth, P72A, is problem 3.

## Problems, evidence, root causes

### 1. The style line became a list of signature tokens, and the writer stamps them on every message

**Evidence**
- W6's style prompt asks for "the emoji and abbreviations <name> uses". The casts answer with token inventories, often matched to the person's job:
  - Kevin, an electrician: "🔧 and 'ok'"
  - Ben, a chef: "🍽️ and 'ok'"
  - Jakob, a hotel manager: "🏨"
  - Martin, a pilot: "✈️ and 'cheers'"
  - Tom, a photographer: "📸"
  - Samir, a barista: "☕"
  - Adam, in Seattle: "🍺 and 'mate'"
- The writer puts the tokens on nearly every message:
  - P62 Kevin: "ok 🔧 will check 22nd", "ok 🔧 check the fuse box too", "ok 🔧 15–17 is fine", "ok 🔧 i'll look anyway". Even Jonas writes "fuse box is fine apparently 🔧 no that's kevin's".
  - P61 Adam: "lmao samir the school trip 🍺", "beast mate 🍺", "legend craig 🍺", "fair 🍺".
  - P61 Tom: "[photo: headshots, 40 of 42 done] 📸".
- Tokens also go in where they make no sense:
  - P13 Katerina: "Will check pls", "Parent meetings till 18:00 pls". Her 🎵 is in 6 of her 8 messages.
  - P81 Lan: "dc who typed 40kg", "dc the boxes r labelled", "dc type 400kg again".
- Counts per person (people with 5 or more messages):

  | | W5 | W6 |
  |---|---|---|
  | Messages carrying any emoji | 8% | 24% |
  | Mean share of a person's messages carrying their single most used emoji | 0.03 | 0.17 |
  | People with one emoji in at least 40% of their messages | 0 of 103 | 15 of 106 |
  | People with a token from their style line in at least half their messages | 5 of 30 with tokens | 32 of 81 |

- Judges:
  - "Each person has a fixed emoji tic (📅, 🔧, 😂/xD), which feels artificial" (9f7652, P62A, p_real 25)
  - "the stray 📸 and 🍺 emojis feel mechanical" (a3e9bc, P61A, 48)
  - "Naz's ✨ in nearly every message" (255f50, d15f37)
  - "emoji and a photo or joke in nearly every turn" (879303, P72A)
  - "Bogdan starts several messages with 'ok.'" (cf4519, Q11B)
- The formal speaker also persists where the style line is negative:
  - Serkan's style is "writes full words without abbreviations". A judge: "Serkan's formality" (d15f37).

**Root cause**
- The prompt asks for named tokens, and a named token is a signature for the writer to show. "Some messages, not all" does not hold against a concrete glyph.
- Writing everyone in one call makes the casting differentiate people by giving each a distinct token, and the job sits right beside it.
- W5's wording ("one plain sentence ... on emoji and abbreviations only") named few tokens, and W5 shows no tics.

### 2. W6 casting bug: `work` is split only on commas, so some people get all four jobs

**Evidence**
- In P41, P62 and P81 (14 of 111 people), call 1 separated the work options with ";". `parsePeople` splits on ",", so the whole list became one entry. Two examples:
  - "motorbike delivery driver; restaurant cook; warehouse stock clerk; taxi driver on weekends"
  - "undergraduate student …; part-time barista; tutor …; campus charity club member"
- Call 2 then wrote lives holding all four jobs. Lan has lectures, a barista shift and tutoring. Việt drives a taxi, delivers by motorbike and cooks.
- In P62, Jonas's line reads "software developer; project manager; architect; sales manager".
- Judges caught the result:
  - "Lan says she has a barista shift and later 'tutoring', Việt does a taxi shift and a bike" (47926c, P81A, p_real 30/90)
  - "the taxi, bike and 'heading to bank' details don't quite fit together"
- These three casts hold three of the five lowest-p_real W6 windows (P62A 25, P81A 30, P41B 50).

**Root cause:** `part()` in `parsePeople` splits on `,` only. The W6 check missed it because it counted occupation words, not entries.

### 3. "knows" lines carry character traits and "texts" lines carry a role, and the writer performs both

**Evidence**
- W6 removed `is:` and `is like:`. The traits moved into "knows: … who each of the others is to you and what you know about them":
  - P62: "Hannah as the sharpest joker", "Clara as the one who corrects everyone's spelling", "Jakob as the easygoing one", "You can't stand bad coffee, which everyone in the group knows", "you tease him about his suits".
  - P13: "Manolis … who writes long, formal messages", "Rena … who always thanks people", "Stelios … keeps quiet but is very reliable".
  - P72: Lakshmi "is patient, funny, and always has a story about her students".
  - P61: "the accountant who always sorts the bill", "the loudest in group chats".
- A crude trait-word regex (the one who, always, joker, organised, tease, can't stand, …) hits 50 of 111 W6 knows lines (W5: 67).
- The chats perform every line:
  - P62: Clara corrects "Lüneburger Heide with the umlaut", then "It's not the suit's fault". Hannah gets "Not the instant stuff 😂".
  - P13: Manolis writes "It is spelled as I spell it on my own letters", "Looks correct. I have changed nothing." Rena writes "Thank you all", "Thank you Manolis". Stelios writes "Good", "Fine by me", "I'll be there early as usual".
  - P72: Lakshmi tells a "Ravi from 3B" anecdote every day.
- Judges:
  - "Manolis is formal and stubborn about the Rachmaninov spelling" (6513be)
  - "each person has a stable quirk" (d15f37)
  - "the kid anecdotes feel slightly generated", "every beat lands" (879303)
  - "formulaic" (9f7652)
- 77 of 111 W6 "texts" lines give a purpose as well as a frequency:
  - "mostly to confirm meetings or share deadlines"
  - "usually to thank people or confirm plans"
  - "usually links or jokes"

  That is the "each one keeps to a single role" tell from W5.
- The Setting line's "what you already know about each other" adds more of the same: "you know each other's jobs, partners and habits well enough to tease each other" (P62).

**Root cause:** the same one-call differentiation W6 removed from `is like`. Any field that asks what someone is like to the others gets a trait, and the writer shows it in each message.

### 4. The drawn place ignores the topic

**Evidence**
- In all six Q casts in both arms, the code's drawn place overrode a topic that sits in a specific place.
  - W6: friends in Bucharest, Porto and Cairo plan "a weekend walk" up Cat Bells. Siblings in Glasgow, Medellín and Bogotá plan their mum's birthday at the Eden Project.
  - W5: Seoul, Osaka, Auckland, Oslo and Zurich.
- The writer then works the absurd plot through:
  - Q11: "Could we do something near Bucharest instead? Snagov or something?"
  - Q23: "Cornwall is in england right. Thats a flight, not a weekend", followed by a whole passport-renewal thread.
- Any user who types a topic naming a place hits this.

**Root cause:** `placeLine` says "if the situation doesn't already say where they live". The topic is not consulted, and the place is fixed in code before the model has seen what the situation and topic imply.

### 5. Openers converge per situation, and nearly all are a coordination task

**Evidence**
- Opener lines across the three seeds of each brief:
  - P7: "Send … a photo of the puppy asleep on" her new bed / his shoes / your bed. All three chats open with "[photo: puppy asleep on …]".
  - P8: "Ask who can cover Saturday's sort shift", three times.
  - P2: "Ask whether he/she has eaten", three times.
  - P6: a dates poll twice, and the third is "who's still free for the dates".
  - P3: "who's climbing Thursday/Saturday".
- 22 of 24 plain openers are a request to arrange something. The chat then runs as that task's resolution. Judges:
  - "everyone neatly reporting progress, which reads a bit synthetic" (255f50)
  - "very orderly … airtight timeline" (d15f37)
  - "tidy and the cooperation is smooth" (cc5b7f)
  - "the fuse-box detail echoes file 4d2a70" (cross-chat sameness)

**Root cause:** the same mode effect W6 fixed for names and work. One requested pick gives the model's most likely opener.

### 6. Whole story days go missing, because the span line names the wrong day

**Evidence**
- In W6 there are two gaps over 18 hours; W5 has none.
- **P63** starts Fri 22:20.
  - `chunkEnds` pushes the first chunk's end to Sun 04:00, because Sat 04:00 is under 6 hours away.
  - The span still says "through tonight (a message after midnight is headed Sat)".
  - The writer wrote Friday night only. Saturday never exists: Sat 00:31 jumps to Sun 11:08.
- **P73**: day 1 ends at Mon 01:05.
  - Day 2's span is "from after the last message above … through Mon (a message after midnight is headed Tue)".
  - The writer continued Sunday night with a 3 a.m. puppy wake-up and headed it "Tue 03:22".
  - Monday has no messages. Judge: "The jump from Monday 01:05 to Tuesday 03:22 with nothing in between is slightly odd" (9da0ab).
- Anything the writer stamps after the chunk end (up to 12 hours) is silently dropped by `chunk()`. In P73 that probably discarded a Tuesday morning that the next call then wrote again. Nothing is logged, so this cannot be confirmed.
- This is part of why some later days are thin (P73: 16, 5, 4 messages).

**Root cause**
- The span names the weekday of `dayStart` with a generic "after midnight" clause. It never names the night the chunk actually ends on.
  - When the first chunk spans two dates, "tonight" is wrong.
  - When a later chunk starts after midnight, "after midnight is headed Tue" reads as applying to the current night.
- Dropping stamps past `to` throws away text the writer meant.

### 7. @claude answers still end with a "Sources:" list line

**Evidence**
- 8 of 14 W6 answers carry a "Sources: https://…" or "Source: …" line, which is not how a text message reads.
- Length is fine (51-80 words).
- There is one "usually takes 2 to 4 hours" (Q12), but it comes from a page it found.

**Root cause:** `ORACLE_SYS` tells Sonnet to follow the search tool's cite-sources reminder ("so follow it without remarking on it"). It does, as a citation line. The user turn's "at most one bare URL" loses to it. The W6 check named this as the probable cause and left it in.

### 8. Family members get names from different families

**Evidence:** P21, "My dad.": the daughter is Kagiso and the father Pieter. The code draws each person's name independently from that person's own eight.

**Root cause:** call 1 offers names per person, with nothing tying a family's names together.

### Looked at and not changed

- **Thin later windows.** B windows of 8-13 messages score 5-6 on quality, but their p_real stays at 80-93. Two causes have roots in this report:
  - the lost days (problem 6)
  - chats built around one opener task that is done by day 2 (problem 5)

  The user has said not to force volume either way, so nothing else is aimed at it.
- **People texting while together** (P41: "At table 4 already. Naz, is the plug still working?"). No judge flagged it, and it appears once in the chats I read.
- **Characters policing guessing** ("I'd check the official site rather than guess", "Pls dont guess"). It is the ASK sentence showing through. It is rare (a few lines), and W4 showed that without the ASK sentence the characters invent facts. Problem 4's fix removes the long-distance plots that produced most of these lines.

## Implementation plan (W7)

Rules for the coder:
- Edit `writer.mjs`. Keep W6 as `writer-w6.mjs`. Tag the log `writer: 'w7'`.
- Every item is in casting, prompt wording or chunk parsing. Each one runs ahead of the story clock as now, and the @claude cut-and-resume is untouched.
- Net prompt text stays about even: the style, knows, texts and setting lines get shorter, and the place and opener lines change form.
- Put the check scripts in `w7-checks/`.

### Item 1. Split list fields on commas and semicolons (`parsePeople`)

**Change**
- In `part()`, split on `/[,;]/` instead of `','`.
- Then reject (as a missing line, so the call retries) any person whose picked `work` still contains `;` or ` | `.

**Check**
- Unit: feed `parsePeople` the P62 call 1 shape (`| work: a; b; c; d`). It returns one of a, b, c, d.
- Over a 26-cast `--gen --days 0` run (the 10 batch briefs plus U1-U3, 2 seeds): 0 `work` fields contain `;`, and 0 life lines name more than two jobs (by eye on the flagged ones).

### Item 2. Place: decided once, in call 1, from situation and topic

**Change**
- `peoplePrompt`:
  - Replace the `placeLine` paragraph with: `First, one line "Place: " and where they live: the place the situation or topic says or implies, or else ${place}.` (`place` is the code's draw, as now.)
  - Keep "If they are people …" in the wording: `If they are people, first one line …`. An AI cast answers "Place: none".
- `parsePeople`: read the `Place:` line (required).
- `castPrompt`: use `they live in ${placeFromCall1}` (omit the line when it is "none").
- Log `place` in the cast row.

**Check**
- `--gen --days 0` on Q1 and Q2, 3 seeds each:
  - Q1: at least 5 of 6 casts live in the UK.
  - Q2: at least 5 of 6 live in the UK.
- The 20 plain casts of item 1's run still use the drawn place in at least 18 (minimal briefs must keep the variety).
- The r1 AI-agent spec: "Place: none", or no city in the setting.

### Item 3. Style: how much, not which

**Change**
- Call 2's style line becomes:

  > "<name> style:" in a few plain words, how much <name> uses emoji and texting abbreviations, without naming any, or "none".

- `block()` is unchanged: "How X types, when it shows: …" is printed only when the style is not none.

**Check A (casting)**
- On item 1's 26 casts: style lines containing an emoji character or a quoted token: 0.
- Style lines with "full words", "no abbreviations", "complete", "proper" or "formal": 0.

**Check B (chats)**
- `--gen`, the 8 P briefs plus Q1 and Q2, 1 seed, 2 days.
- People (5 or more messages) with one emoji in at least 40% of their messages: 0 (W6 batch 15 of 106, W5 0 of 103).
- Report the share of messages with any emoji (W5 8%, W6 24%), with no target.
- By eye: no misplaced tokens ("… pls" at the end of a statement, "dc" as a filler).
- No speaker a judge would call formal: count capital-start messages over 15 words that contain no contraction, per person, against the W6 batch.

### Item 4. knows = the relation, texts = how often, Setting = no "what you know about each other"

**Change**
- knows line becomes:

  > "<name> knows:" in the second person ('You ...'), who each of the others is to you and how you know them, a short sentence each.

  ("and what you know about them" goes.)
- texts line becomes:

  > "<name> texts:" one plain sentence, in the second person, on how often you message in this chat without being asked anything (how often, not what about), as follows from your life and the group. Use frequency words ("now and then", "mostly") rather than "always".

- Setting: delete "and what you … already know about each other".

**Check (item 1's 26 casts)**
- Trait regex over knows lines (`the one who|always|never|joker|organi[sz]ed|easygoing|tease|funny|dry|quiet|loud|can't stand|known for|reliable|formal`): at most 5 of about 90 (W6 50 of 111).
- texts lines with a purpose clause (`(mostly|usually|especially|often) (to|when|with|about)|, (to|when)`): at most 5 (W6 77 of 111).
- Item 3's chats, by eye: count the chats where one person shows the same trait in most of their messages (the chaser, the corrector, the thanker, the anecdote teller). Do the same on the W6 batch chats of the same briefs.

### Item 5. Opener options picked in code

**Change**
- Call 2's last line becomes:

  > one line starting "<first> opens with:", four different things, each starting with a verb and separated by " | ", that <first> might pick up the phone to send <the group / the other>, fitting the situation.

- `parseCast`: split on `|`, drop empties, and require at least 2 entries.
- `c.opener = pick(options)`. Log `openers` (all of them) in the cast row.
- `promptFor` is unchanged.

**Check**
- `--gen --days 0`, the 8 P briefs, 3 seeds:
  - Distinct openers per brief: 3 of 3 for at least 7 of 8 briefs (W6: P7, P8 and P2 at 1).
  - Report the share of openers that ask the group to arrange something (W6: 22 of 24), with no target.

### Item 6. Spans name the day and night they end on; overrun is kept, not dropped

**Change**
- In `promptFor`, compute from `to` (the chunk end, always 04:00):
  - `LAST = DAYN[weekday(to − 24 h)]`
  - `NIGHT = WD[weekday(to)]`
- Spans:
  - First chunk: `… starting with ${first}'s first message at ${stampOf(from)}, through ${LAST === DAYN[weekday(from)] ? 'tonight' : `tomorrow, ${LAST}, and ${LAST} night`} (a message after midnight on ${LAST} night is headed ${NIGHT}, e.g. "${NIGHT} 00:40"). The next day is written separately.`
  - Later chunk: `Continue the chat from after the last message above, in the order the messages were sent, through ${LAST} and ${LAST} night (a message after midnight on ${LAST} night is headed ${NIGHT}). The next day is written separately.`
  - Resume: `Continue the chat from ${stampOf(from)}, through ${LAST} and ${LAST} night (a message after midnight on ${LAST} night is headed ${NIGHT}). …`
- `calLine(dayStart)` stays.
- In `chunk()`, return every message up to the existing `limit + 12 h` reject bound instead of filtering to `<= limit`.
  - The next day already starts from `all.at(-1).at`, so overrun simply moves its start.
  - The 12-hour reject (week jumps) is unchanged.

**Check**
- Unit: print the span for these cases:
  - start Fri 22:20, end Sun 04:00: names "tomorrow, Saturday, and Saturday night … headed Sun"
  - start Sat 01:00, end Sun 04:00: "tonight … headed Sun"
  - a later chunk from Mon 01:05, end Tue 04:00: "through Monday and Monday night … headed Tue"
- List mode on the W6-P63 and W6-P73 casts (their start times), 3 runs each:
  - 0 gaps over 18 h.
  - Monday in P73 and Saturday in P63 have messages.
- Batch: gaps over 18 h at 0 (W6 2), and format and stamp rejects no higher than W6's.

### Item 7. @claude: no citation line

**Change**
- In `ORACLE_SYS`, replace the last sentence with:

  > The search tool ends its results with a reminder to cite sources: in this chat that means at most the one bare URL the request allows, never a "Sources" line.

- The user-turn tail stays.

**Check**
- `--oracle`, Q1 and Q2 plus F1-F5, 1 seed, 2 days.
- 0 answers with a line starting `Source` (W6 8 of 14).
- At most 1 URL per answer, and median length under 80 words.
- The answers still say when nothing was found.
- Live: one `--live` spec with oracle and a fact topic. The ask cuts, the answer is released in story time, and the day resumes.

### Item 8. One family, one naming culture

**Change:** in call 1, "eight different first names that would fit them" becomes "eight different first names that would fit them (in a family, names that fit the same family)".

**Check:** by eye on item 1's casts for "My dad.", "Me and my sister." and U3 "Cousins.", 2 seeds: no family whose names read as from different families.

## Then: the paired batch

- **Briefs:** fresh ones (not N, O, K, F, P or Q).
  - Include two minimal ones, one topic that implies a place, and two with @claude on and a topic needing a fact.
  - 3 seeds, 2 days.
- **Arms:** W6 (`writer-w6.mjs --gen`) against W7 (`writer.mjs --gen`).
  - Each arm uses its own casting (the casting changes), with shared briefs, seeds and explicit start times, as in `eval/w6-batch`.
  - Include at least one start between 22:00 and 23:59.
- **Judging:** `judge.mjs`, 2 judges per window, PAIR=1. Report p_real first, then score, by window A and B and by scenario.
- **Metrics on both arms:**
  - per-person top-emoji share and people at 40% or more
  - trait-regex hits in knows lines, and purpose clauses in texts lines
  - work fields with `;`
  - casts whose place contradicts a place-bound topic
  - distinct openers per brief
  - gaps over 18 h
  - messages per day (day 1 and later days)
  - "Source" lines in Claude answers
- **Live:** one run from the Start form (or `--live` with a spec) at normal speed. Turns are released on the clock and an @claude question is answered mid-chat.

## What this plan does not do

- No new wording against jokes, tidiness, status reports or silence (those failed in W2-W5, and the user asked for no arbitrary constraints).
- No volume rule.
- No rewrite pass and no per-person agents.
- The polish and tidiness tells are attacked through their causes in the cast:
  - the trait fields (items 3 and 4)
  - opener mode collapse (item 5)
  - lost days (item 6)
  - place-absurd plots (item 2)

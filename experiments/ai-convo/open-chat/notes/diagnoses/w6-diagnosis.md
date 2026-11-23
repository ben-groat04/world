# W6 diagnosis (cold read of the W5 paired batch)

## Evidence and scope

I read the 59 runs of the W5 paired batch:
- W5 plain `writer-runs/2026-11-23T07-41-06-261Z`, W5 oracle `-305Z`.
- W4 on the same casts `07-45-08-718Z` and `07-50-27-895Z`.
- The 29 judge reports in `eval/w5/cut/judges/`, `scores.tsv`, `key.tsv` and `tally.txt`.

The counts below are crude regex or eye counts over these runs, made with throwaway scripts. Item checks say what to measure.

The user's observations since the W5 plan, in their words:
- "I don't really want silence here it's supposed to show conversations"
- then "No need to force no silence as well. Same as them speaking like friends, this is not an issue. Generally don't make arbitrary constraints please."

So the silent-day allowance comes out (HANDOFF already says so). Nothing replaces it: no minimum message count and no "every day is active" rule.

## Where W5 stands

| | Score | p_real |
|---|---|---|
| W5 overall | 6.97 | 73 |
| W4 overall | 7.11 | 70 |
| W5 window A | 7.23 | 73 |
| W4 window A | 7.03 | 67 |
| W5 window B | 6.69 | 73 |
| W4 window B | 7.20 | 74 |

W5 helped the opening windows (A). It lost on the later days (B).

The judges mostly say "likely real". What keeps a window at 6-7 rather than 8+ falls into five groups:
- **Polish.** "jokes land almost too well", "quotable lines", "too polished and callback-heavy", "every exchange lands" (j4, j7, j12, j18, j21, j23).
- **Tidiness.** "every message advances the plan", "every loose end closed", "too cooperative", "tidy and linear" (j3, j4, j11, j19, j22).
- **One fixed role or register per person.** "Tomek's very formal, long messages", "Hendra's formal register", "Meera's formal, precise tone", "Mihai's wording is somewhat stiff", "each one keeps to a single role" (j4, j5, j16, j18, j22, j26, j28).
- **Sameness across files.** Same "Mon 07:40" opener, the names Dana/Marcus/Priya, the "Forty essays on…" line, a word-for-word opening question, the internet bill "on the 28th", "Monday 07:40 opener, away match, oranges" (j17, j18, j20, j22, j23).
- **Thinness** in short later windows ("thin", "bland": j2, j5, j9, j21, j23).

## Problems, with evidence and root causes

### 1. Later days are thin, and the writer keeps a diary of everyone's day

**Evidence**
- Messages per day, plain briefs, same casts:

  | | W4 | W5 |
  |---|---|---|
  | Day 1 | 17.4 | 15.5 |
  | Later days | 19.3 | 13.5 |

  B windows are 6.69 vs 7.20.
- 196 offline notes in 30 W5 chats. Most of them are a person's daily routine, restated every day:
  - "[07:00-15:30 Tom teaching grade 10 at a school on Commercial Drive]" on all three days of N41.
  - "[08:00-17:30 Wen at the firm in Xinyi]" three times in N22.
- In N11, day 3 is two messages between five notes ("[07:40-12:40 Mathis on the morning repairs at the shop, Camille at the pharmacy]" … "Yeah. December").
- The visible messages turn into status reports that track those notes:
  - "Home. Did the transfer go through", "Be 20 min", "Eating now" (N11)
  - "Back from a run", "Out of Lysaker. Reading tonight", "Marking now, back at twelve", "Asleep. Don't text unless someone has died" (N62)
  - "Just off." (N41)
- The notes also failed their own W5 target: the couple F3 still had 54% evening quick replies.

**Root causes**
- (a) "Some days nobody texts: then reply only (no messages)." This invites the writer to wind later days down.
- (b) The note channel is a second output that the writer fills with each person's schedule. That turns a chat into a narrated day: the writer walks through each person's timeline, writes the notes, and the messages become the moves between them. It also writes person by person rather than in time order (see 2).

### 2. Identical timestamps from the W5 ordering clamp

**Evidence**
- N22, window e5bbe6: Kevin 21:14, then "[19:10 Lin home…]", then Lin, Wen, Lin and Yen all at 21:14. Four messages share one minute.
- Two judges named it: j18 ("four messages share the exact timestamp 21:14 … may be synthetic", p_real 45) and j23.

**Root cause:** `dated()` (W5 item 8) replaces a backward stamp with the previous message's time. That throws away the writer's own time for the message. The writer had gone back to narrate Lin's evening (see 1b) and stamped her messages 19:1x. Those were the intended times.

### 3. A cast is designed as a contrasting ensemble, and each person performs their trait in every message

**Evidence**
- `is:` lines carry character labels, and they are printed in the writer's header line:
  - "the sound engineer and the joker of the group", "the quiet software developer", "the blunt one", "the enthusiast", "the quiet one", "the joker who keeps the group lively"
- `is like:` lines (110 people in 30 casts) pair the same two types in almost every cast:
  - organised (19), direct (15) and "settle things quickly" (10) on one side
  - easygoing (20) and "forgets / scattered" on the other
  - plus dry (15), warm (21) and quick (20)
- This pairing gives the same plot every time: the organiser chases and the easygoing one forgets.
  - "You said that last month" (N11)
  - Aisha's "I need a yes from everyone", three times (N41)
  - "Tobias, you could have asked me first" (N62)
- The "dry" people produce the quotable lines judges flag:
  - Tomek: "I tested it six times with the dog watching. He was unimpressed."
  - Tomek: "Keep the money for the bike lock you will now need."
  - Priya: "It's a hostage situation"
  - Mateo: "It gets worse before it's clear what it's doing. Then it's clear what it's doing and it's worse."
- The style line still sets register, even though casing is now done in code. Every formal speaker judges named has a negative style line:
  - Tomek: "no emoji and no abbreviations, and you write in complete sentences"
  - Hendra: "no emoji and no abbreviations"
  - Meera: "write words out in full"
  - Mihai: "no emoji and no abbreviations"
  - Raj: "no emoji and no abbreviations"
- The W4 arm on the same casts has the same speakers (a53f08, 2b9af8 are W4-N53). So the cause is the cast, not W5's writer code.

**Root cause**
- One casting call writes everyone together, so it differentiates them as a set, by role and temperament.
- The writer reads each line as a trait to show, and shows it in nearly every message.
- A style line that says what someone does *not* do reads to the writer as "formal person".
- The temperament line has been in since W1 in three wordings. Its humour and opinions have been the top tell since W2. Re-wording it has not worked.

### 4. Every cast comes out of the same few names, jobs and start times

**Evidence**
- Names:
  - Priya in 5 of 30 casts, Hannah in 3 and Marcus in 3.
  - "Dana, Marcus, Priya" is the whole cast of N51, and three of O23's four.
  - Tomek with Ola twice, plus Marta, Mateo, Eleni, Sofia, Lucie and Tomas twice each.
- Jobs, across about 110 people:
  - Pharmacist or pharmacy: 15 people, in Warsaw, Taipei, Toulouse, Kladno and elsewhere.
  - Teacher: 11, the rest of the top three in step.
- Teachers' marking becomes the same quip. "Forty essays on …" appears in 3 chats across both arms and different casts (3655a5, 359b07, a04e84; j23 caught it).
- Every chat's first message is at Mon 07:40 or 07:45, because every brief starts at the moment the batch was launched (j17, j22). The cast's opener says "tonight", so a morning start opens with "Morning all!" on an evening errand.

**Root cause**
- Asking Haiku for one pick gives its mode. PLACES already showed this for places (Porto 11 of 46), and drawing in code fixed it there.
- The start time is the launch time for all of them. In the live app each chat starts at its own "now", so this one is a batch artifact, but it is what the judges see.

### 5. The topic is pasted in as the first message

**Evidence**
- O2 chats open with the topic word for word in 5 of 6 (both arms): "Which restaurants near Oxford Circus in London have a private room for ten?"
- j18 gave those windows p_real 25 and 15 ("the opening question is word-for-word the same … points to a template").

**Root cause:** the prompt says "`first` has this on their mind and starts the chat with it: `topic`".

### 6. The writer does not know the date

**Evidence**
- Characters plan by date all the time: "Sunday 6 December", "the 14th", "15 Jan", "Family Day long weekend (13-15)", "Feb 26".
- j3 and j6 caught "the 15th is a Thursday" for January 2027 (it is a Friday).

**Root cause:** the writer only sees "Mon 07:40" headers. It has no date, month or year, so it works out weekdays for dates as best it can. The calendar is a fact the code has, and the characters would have it on their phones.

### 7. @claude: the chat becomes a run of questions to Claude, and Claude sometimes answers from memory

**Evidence**
- Asks per chat over 3 days:
  - O22: 9, four of them about one restaurant ("Les 110 de Taillevent").
  - O11: 7, most about the same works notice.
  - O12: 9.
- Judges: "heavy with Claude's repeated answers" (j16), "loops on the same question" (j17), "circular" (j26).
- Questions are typed as search specs: "exact time pls", "We need the actual time, not a guess", "…a minimum spend under £2,000…".
- Characters report off-screen lookups as facts: "Chiara read the listing as Sunday 10 to 9". The writer names venues itself: "Lowe & Crane on Bold Street".
- Claude answered once without searching: "I didn't search for this, so this is general knowledge rather than checked … Many cafés close around 4 to 5pm". That breaks the data rule and the "sourced answer or couldn't find it" design.
- Format of the answers:
  - 15 of 32 carry markdown links ("Sources: [Northern](https://…)").
  - 22 of 32 end with a "Sources:" line.
  - `w5-checks/metrics.mjs` counted 0 markdown because its regex misses `](`.

**Root cause**
- `ASK` makes Claude the only route to any real-world fact ("nobody states it until Claude has posted it"). It gives the characters no way to go on when Claude can't find it, so they ask again, more precisely. That is how the search-spec questions arise.
- `ORACLE_SYS` doesn't say that facts must come from the search.
- The user turn asks for "sources as a brief mention", which Sonnet renders as a "Sources:" list of markdown links.

### 8. Things are "sent" that never appear in the chat

**Evidence**
- 27 messages talk about sending a photo, screenshot or link that is never in the chat:
  - "Sent the 34.10 too. Sorry for being a pain about it. Screenshot" (the photo is the word "Screenshot")
  - "I'll send the cabin link"
  - "Up. Sending the screenshot now, the sunday column is tiny"
- Claude then answers "Luca's Maps link and the name never reached me" (O12).
- Only 1 message in about 3300 is a photo.

**Root cause:** the message format has text and reactions only, so the writer can only *describe* sending something.

### Looked at and not changed
- **One-off clock slips** ("it's not even 11" at 23:47; "a run before it gets dark" at 09:30). Each is one case in 118 windows, and judges call them human slips. Item 3's date line gives the writer the full clock, and nothing more is aimed at them.
- **Real books recurring in book clubs** (Stoner, Middlemarch). This comes from three seeds of one brief. Fixing it would be tuning to the test brief.
- **Invented local facts without @claude** ("road work near Porteau finished in the summer"). The existing TEXTING sentence covers this. I add no new wording, and the batch check counts it.

## Implementation plan (W6)

Rules for the coder:
- Edit `writer.mjs` and keep W5 as `writer-w5.mjs`.
- Every item works chunk by chunk ahead of the story clock and keeps @claude cut-and-resume.
- The net change to agent-facing prompt text is about even: two sentences and two cast lines are removed, two sentences are added.
- Tag the log `writer: 'w6'`.
- Fix `w5-checks/metrics.mjs`'s markdown regex to include `](` and `^Sources?:` before using it as a baseline.

### Item 1. Remove the silent-day allowance and the offline-note channel

**Changes**
- `promptFor`, later-day span: delete "Some days nobody texts: then reply only (no messages)."
- Format paragraph: delete the sentence "Between messages you may put a line of its own (no header) in square brackets … not in the chat."
- `parse`:
  - Delete the `(no messages)` branch, `NOTE`, `noteLines`, and the `notes` / `before` handling.
  - Later days keep min 0 as now, so an empty or unparseable reply is retried as any bad reply is.
- `transcript`: drop the `notes` parameter.
- `flush`: drop the note rows.
- `block`: keep "lives with X" as a fact.

**Check** (list mode, W6 code on 8 W5 casts, one per N brief, against the W5 chats of those casts)
- Messages per later day go up from 13.5. Report day 1 and later days separately.
- No message text contains a whole-line `[...]` other than item 7's media lines.
- Format rejects no higher than W5's (about 1 in 30 calls).
- By eye, status-only messages ("Home.", "Back.", "Just off", "Out of X") are fewer than in the W5 chats of the same casts. Count them with a regex for whole messages under 5 words starting home|back|off|out of|leaving|on my way|asleep.

### Item 2. Read stamps as written: sort, don't clamp (`dated`)

**Changes**
- Compute each message's time from its weekday and time as now: `day0 + ((wd - day0wd + 7) % 7)` days. Drop the `last` / clamp / `while (t < last)` logic.
- A stamp earlier than the chunk start `t0` becomes `t0`. That is a header slip before the span: rare, and it must never land before already released messages.
- Then stable-sort the chunk by time.
- A different weekday that lands too far ahead is still caught by the existing `limit + 12 h` check.
- `writeDay` looks for `@claude` after the sort, so the cut-and-resume still cuts at the first question in time.

**Check**
- Unit run on a synthetic chunk shaped like N22's (Kevin 21:14; then Lin 19:12, Wen 19:15, Lin 19:16, Yen 19:20): output is in time order, with Lin's question before Kevin's 21:14 and no repeated minute.
- Re-parse `rejects.txt` of the W5 batch: every block that was rejected as "out of order" now parses with no stamp beyond `to`.
- Batch: same-minute consecutive messages from different senders no higher than W4's 1.7%, and no run of 3 or more.

### Item 3. Give the writer and Claude the date (`promptFor`, `askClaude`)

**Changes**
- Add `calLine(at)`, which returns:
  > Today is Monday 23 November 2026. The next Mondays: 30 Nov, 7 Dec, 14 Dec, 21 Dec, 28 Dec, 4 Jan, 11 Jan, 18 Jan, 25 Jan, 1 Feb, 8 Feb, 15 Feb.

  It is computed with UTC dates from the chunk's `dayStart`: 12 Mondays, year shown once.
- Put it on its own line directly before the span line in `promptFor`.
- Start `askClaude`'s user turn with the same "Today is …" sentence (without the Mondays).

**Check**
- A regex over a batch for "<weekday> <day> <month>" and "<day>(st|nd|rd|th)? is a <weekday>" (and the reverse), checked with `Date`. Mismatches: 0 (or report n). Run the same regex on the W5 batch first for the baseline.
- Prompt size grows by about 40 tokens.

### Item 4. Casting in two calls: who they are and their names and work first, picked in code; no type labels, no temperament line, style only when there is one

**Changes**
- Draw the place once per cast and use it in both calls.
- **Call 1** (new `peoplePrompt(N, brief, topic, secretText, place)`, `GENSYS`):
  - Start with the existing first two paragraphs of `castPrompt` and the place paragraph: situation, topic, secret, "Cast them as what the situation says they are …", roles, "written from one participant's side … Person 1".
  - Then:

    > Reply with only one line per participant, in order: "Person k: " then what they are, in a few words: age, gender and what they are in this situation, e.g. "58, woman, Tom's mum" (no character traits); then " | names: " and eight different first names that would fit them; then " | work: " and four different things that could fill their days (an occupation, study, retired …) that fit the situation and their age, or the one the situation gives them.

  - Parse each line. In code, pick a random name per person that is not taken by an earlier person (case-insensitive) and a random work entry. Retry the call if a line is missing or the names run out.
- **Call 2** (`castPrompt`, now given the people):
  - Open with "These N participants are in a chat: Marta (41, woman, the neighbour on the second floor), …", using the call 1 `who` lines, then the situation and topic, with `Person k` mapped to names in topic and secret.
  - Delete the "Person k name:" lines, the `is:` line and the `is like:` line (and `likeSpec`).
  - Life line: "… your circumstances: for a person where you live, that you work as / are <work>, who you live with and how your days usually go …". The rest of the line is unchanged.
  - Style line becomes:

    > "<name> style:" the emoji and abbreviations <name> uses, in a few words, or "none".

  - Opener line: delete "tonight".
  - Keep the Setting, knows, lives with, sleeps, texts and capitals lines as they are.
- **`parseCast`**:
  - Take `names` and `who` from call 1. `like` goes.
  - Validate as now, minus `like`.
- **`block()`**:
  - Drop the `like` text.
  - Print "How X types, when it shows: …" only when the style is not `none` (`/^\W*none\b/i`). FULL / BIG then apply to the style line only.
- Lists mode on old casts still works: `like` is shown if present. The like-line test below needs that.

**Check A, casting** (`--gen` with `--days 0`)
- Briefs: W5's 10 briefs plus the held-out U1-U3 ("You're housemates.", "Old school friends who live in different cities now.", "Cousins."), 2 seeds, so 26 casts.
- Targets:

  | Measure | Was | Target |
  |---|---|---|
  | Most frequent first name | Priya, 5 of 30 | 2 or fewer |
  | Pairs of casts sharing 2 or more names | Dana/Marcus | 0 |
  | Top occupation word share among people | pharmac*, 15 of 110 | 6% or less |
  | `who` lines with joker, quiet one, blunt, funny, dry, organised, easygoing, enthusiast | many | 0 |
  | Style lines reaching the writer with full, complete, sentence, no abbrev, no emoji, proper | 5+ | 0 |
  | Casting failures | | 1 or fewer |

- Report the median added casting time per cast: it is part of the live start delay.

**Check B, the temperament line, paired and judged** (the one risky removal)
- On the 8 W5 casts of item 1, run W6 list mode twice: block with the cast's `like` line, and without it. Same casts, same start, same code otherwise.
- Judge with `judge.mjs`, 2 judges per window and PAIR=1.
- Keep the removal unless the with-like arm is ahead by 0.5 or more on score *and* 5 or more on p_real.
- By eye, count chats where one person's every message shows the same trait ("the joker", "the chaser", "the formal one") in each arm.

### Item 5. Openings: the topic in the person's own words, and varied start times in batch runs

**Changes**
- `promptFor`: "`first` has this on their mind: `topic`". Drop "and starts the chat with it". The span already says the chat starts with `first`'s first message.
- `--gen` with no `start` in the brief, and not `--live`: draw the start in code. Pick a day 0-6 days from today and a random 5-minute slot from 07:00 to 22:55 (a design parameter). Log it in the head row.
- `--live` keeps the form's start or `nowLocal()`. Batch arms that share casts already share the first message's time through list mode.

**Check**
- `--gen` on the two O briefs, 3 seeds. No first message repeats 70% or more of the topic's words (was 5 of 6 verbatim).
- First-message stamps across a 26-cast `--gen` run: at least 20 distinct.
- No opener that mentions tonight or night is sent before 12:00.

### Item 6. @claude: no question loops, typed questions, sourced answers in chat form

**Changes**
- `ASK` becomes (one item, replacing the current one):

  > Anyone can ask Claude, an AI assistant in this chat that reads it and searches the web, by putting "@claude" in a message, written like any other message; stop right after such a message. Nobody states a fact about the real world (news, research, timetables, prices, opening hours, rules, history) that they would not know offhand unless Claude has posted it; if Claude couldn't find it, they get by without it.

- `ORACLE_SYS`: after "Say plainly when you could not confirm something." add:

  > State only what the pages you found say, never from memory.

- `askClaude` user turn tail:

  > Answer as a text message: two or three short sentences (under 60 words), plain text with no lists, bold, headings or markdown links; if you point to a source, at most one bare URL.

**Check**
- F1-F5 plus O1/O2, `--oracle`, 1 seed, 2 days. Compare with the W5 O chats (6.3 asks per chat).
- Targets:
  - Asks per chat go down.
  - By eye, 0 re-asks of a question Claude already said it couldn't find.
  - 0 questions with search-spec phrasing ("exact", "not a guess", lists of constraints), by eye against the W5 list above.
  - 0 characters reporting a looked-up figure or opening hours that Claude never posted.
  - 0 answers with `](`, `**`, list lines or a "Sources:" line.
  - 0 answers saying "general knowledge", "usually" or "typically" without a found page, by eye.
- Live: run `live-spec/r1.json` once at a high speed. @claude cut-and-resume still resumes, and the answer is released in story time.

### Item 7. Things people send are messages

**Changes**
- Format paragraph in `promptFor`: add one sentence where the note sentence was:

  > Something sent that isn't text (a photo, screenshot, voice note, link or file) is a message of its own, like "[photo: the bill]" or "[link: the cabin listing]".

- `parse` needs no change: it is message text.
- `eval-prep.mjs` judge-note: add "A line like [photo: …] stands for a photo, link or file sent in the chat." This is the same kind of plain format fact as the reactions line.
- The viewer shows the text as it is.

**Check** (item 1's 8-cast run)
- Bracket media messages per chat are above 0.
- Messages saying "sent", "sending" or "here's" a photo, screenshot or link with no media message within 3 messages after: below the W5 count on the same casts (was most of 27 in 30 chats).
- O briefs: 0 Claude answers saying a link or photo "didn't come through" when no media message exists.

## Then: the paired batch

- **Briefs:** fresh ones, not N/O/K/F. Include two minimal ones, and one with a topic needing a fact with @claude on. 3 seeds, 2 days.
- **Casts and arms:** W6 casting. The W5 arm is `writer-w5.mjs` in list mode on the W6 casts. W5's block will show style "none" for some people and no `like` line. Say so in the report: W6 casting is part of the arm, as in W5.
- **Judging:** `judge.mjs`, 2 judges per window, PAIR=1. Report p_real first, then score, by window A and B and by scenario.
- **Metrics on both arms:**
  - messages per day (day 1 and later days)
  - same-minute runs
  - most frequent name and occupation
  - "?" answered within 2 h (W5 batch: about 95%)
  - asks per oracle chat, and markdown in answers
- **Live:** one live run from the Start form (or `--live` with a spec) at normal speed. Turns are released on the clock and an @claude question is answered mid-chat.

## What this plan does not do

- No rewrite or delete pass.
- No per-person agents.
- No new anti-joke, anti-tidiness or anti-status wording; those failed three times.
- No message minimums and no silence rule. Polish and tidiness are attacked through their causes in the cast (item 4) and the diary channel (item 1). Item 4 check B is the measure for the polish and tidiness tell.

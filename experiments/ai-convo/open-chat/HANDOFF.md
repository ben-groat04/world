# Handoff: open-chat

Start here when picking this up in a new session. Then read `ITERATIONS.md` (every round, what failed, process lessons) and `README.md` (how to run things).

## Goal
Simulated text chats, group or 1:1, that blind judges can't tell from real people texting. The target is 8/10, for any situation a user types in, and users often give only a minimal one. Haiku writes the characters, because it's cheap. Don't overfit to the test scenarios.

## User's rules and preferences
- It is a LIVE chat app: the chat plays out in story time in the viewer as it is generated, started from the Start form, and @claude must be able to answer a character mid-chat. Every change must work in that setting (generated a little ahead, released message by message). No after-the-fact rewrites of whole chats. Keep the work tied to the running app, not to offline transcripts.
- Characters must handle touchy topics (contested opinions, drugs, sex, model internals) the way real people in the situation would; sanitising, softening into both-sides answers, safety-messaging characters, deflecting or steering to logistics are issues to fix (user, 2026-11-27). Tell every cold read this.
- Rounds are slow, so each round fixes everything the cold read finds: no "not now" or "not core" lists. Tell every cold read this.
- `/home/user/world/CLAUDE.md`: real-world facts (stats, prices, rates) must never be guessed; source them or leave them out. Design choices and example text are fine. Fix root causes, not symptoms.
- The orchestrating session doesn't steer. Diagnosis is an Opus cold read, coding is done by Sonnet agents, and blind judges are Sonnet with a neutral prompt.
  - Don't give judges or the cold read priorities or specific questions. Pass the user's observations on neutrally, labelled as theirs.
- Workflow: runs → Opus cold read → Sonnet coder → cheap checks → runs. Don't launch runs or change code between those steps on a hunch.
- Keep agent-facing prompts lean. Don't pile rules onto them, or follow-up notes onto a running coder.
- Run things in the background, keep replies responsive, and give short progress updates.
- No real-chat anchors for now: compare versions against each other.
- Opus only for hard thinking (cold reads). Coders are Sonnet; characters are Haiku.
- Don't add arbitrary constraints. Silent days (neither allowed nor banned) and AI-agent casts talking like friends are not issues; W5's silent-day allowance is to come out.
- Background coders run with `isolation: "worktree"` and push to the branch from there, so their unfinished edits never sit in the main checkout (the stop hook flags those).
- Commit and push to branch `ccr-982e4403-t5vbsu` often (a stop hook asks for this).

## Models: which for what
| Job | Model | Notes |
|---|---|---|
| Cold read (diagnosis, plans) | Opus | Only Opus job ("Opus only for hard thinking"). Read only; writes its report to notes/diagnoses/. |
| Coding (implementing a plan, cheap checks) | Sonnet | Agent tool with model sonnet. |
| Blind judges | Sonnet | Neutral prompt from README "Judging"; about 1-2 judges per window, many windows. |
| Writer and casting (the chats themselves) | Haiku | `writer.mjs` default, effort medium. Sonnet as writer tested no better (7.06 vs 7.05), so stay on Haiku. |
| @claude inside chats | Sonnet | With web search; sourced answer or "couldn't find it". |
| Multi-agent characters (run.mjs, retired) | Haiku | Opus characters were ruled out as too expensive. |

## Where things stand (2026-11-27)
- **W11 judged against W10** (`eval/w11-batch/`): 7.82 / p_real 80 (W11) vs 7.53 / 77; minimal briefs 8.25 / 84 (first class above 8), business briefs 7.38 / 76 (unchanged). W11 is the current writer. Next: Opus cold read of the W11 batch, focused where the business briefs fall short, to notes/diagnoses/w12-diagnosis.md.
- **W11 built and cheap-checked (not judged); W10 vs W11 batch built and cut, not judged** (`eval/w11-batch/`; `writer.mjs` is W11, W10 kept as `writer-w10.mjs`; plan `notes/diagnoses/w11-diagnosis.md`, check numbers under W11 in ITERATIONS.md): items 1-4 in (per-day code draw of whose own day may come up, Setting business shared, 8-week calendar, default places where people text in English; chats stay English even when the brief names a non-English place, as the user decided). Checks: people reporting their own day per chat-day 1.40 vs W10 1.47 (target half: NOT met), minimal casts with own-job business 0 (was 6 of 15), weekday-date mismatches 2 of 24 W11 references (target 0: not met, counts small), 30 of 30 casts in English-speaking places, 6 of 6 non-English-brief chats in English, messages per chat equal (58.3 vs 58.0). Batch: 10 fresh briefs (5 minimal) x 3 seeds, 60 chats, 120 windows in `cut/` with `classes.json`, 30 judge folders. Next: `node judge.mjs eval/w11-batch/cut`, then `node eval-prep.mjs --tally eval/w11-batch/cut eval/w11-batch/cut/scores.tsv`. Item 1's draw did not reduce own-day reports, so the cold read of the batch should look at why.
- **W10 judged against W9** (`eval/w10-batch/`): 7.56 / p_real 78 (W10) vs 7.47 / 77 (W9), judge-centred equal. W10 is the current writer (keeps the @claude parse fix, fewer sign-offs, no invented couples). Plateau at about 7.5 / p_real 77 since W7. Next: Opus cold read of the W10 batch, to notes/diagnoses/w11-diagnosis.md.
- **W10 built and cheap-checked (not judged); W9 vs W10 batch built and cut, not judged** (`eval/w10-batch/`; `writer.mjs` is W10, W9 kept as `writer-w9.mjs`; plan `notes/diagnoses/w10-diagnosis.md`, check numbers under W10 in ITERATIONS.md): shared current business in the Setting (12 of 12 minimal casts name one; running bits not shown fewer than W9 at this n), no sleep line (sleep-word regex 0.9 per chat vs W9 2.7), lives-with for real households only (needed one more clause in the knows line, 0 of 30 casts with non-household pairs), parse stops at the `@claude` message and attaches a reaction-only block to the previous message (the four V22/V23 rejects parse; a live fact run reaches done). Batch: 10 fresh briefs (5 minimal no-shared-business, 5 with business) x 3 seeds, 60 chats, 120 windows in `cut/` with `classes.json` so the tally splits by class. Next: `node judge.mjs eval/w10-batch/cut`, then `node eval-prep.mjs --tally eval/w10-batch/cut eval/w10-batch/cut/scores.tsv`.
- **W9 judged against W7** (`eval/w9-batch/`): 7.59 / p_real 77 (W9) vs 7.39 / 75 (W7); judge-centred p_real +0.8 vs -0.8. W9 is the current writer. Next: Opus cold read of the W9 batch, to notes/diagnoses/w10-diagnosis.md.
- **W9 built and cheap-checked (not judged); W7 vs W9 batch built and cut, not judged** (`writer.mjs`; W8 kept as `writer-w8.mjs`; plan `notes/diagnoses/w9-diagnosis.md`, numbers under W9 in ITERATIONS.md): day unit back, emoji kept or dropped per message in code, one-sentence life line and relation-only knows, co-presence wording, eight work options, judge-centred tally, judge scale restored (0 obviously not real people to 10 indistinguishable). Checks: 61 messages per chat, emoji 11% (target 15-25%: low), people at one emoji in 40%+ 2 of 36, trait words in knows 0 of 108, top occupation 4.6% (target 4%), co-presence 0 of 3. The batch is `eval/w9-batch/` (60 chats, 119 windows in `cut/`, 30 judge folders): next is `node judge.mjs eval/w9-batch/cut`, then the tally (which now prints judge-centred p_real).
- **W8 judged against W7** (`eval/w8-batch/`): 6.94 / p_real 64 (W8) vs 7.16 / 72 (W7). W8 is not better (lower p_real, mostly in later windows). Writer rounds have plateaued at about 7 since W2. Next: Opus cold read of the W8 batch (stepping back on the plateau), to notes/diagnoses/w9-diagnosis.md.
- **W8 built and cheap-checked (not judged)** (`writer.mjs`; W7 kept as `writer-w7.mjs`; numbers under W8 in ITERATIONS.md): stretch writing unit released live stretch by stretch, code-drawn volume, topic openers, leaner @claude (opens pages with the fetch tool: 3 of 5 asks fetched, answers cite real pages), judge split by brief. Open: the style line had to be restored (no line gave no emoji at all, the line gives 8-9 of 30 people at 60% emoji), the median stretch spans 4.3 h (the plan's abort line says 3 h and revert item 7), the item 7 gate and the W7 vs W8 batch were not run.
- **W7 built, cheap-checked, and judged against W6** (`eval/w7-batch/`, results under W7 in ITERATIONS.md): 10 fresh briefs x 3 seeds, each arm its own casting, same briefs, seeds and starts. Score 7.03 (W6) vs 7.23 (W7), p_real 68 vs 69, n=106/118: within noise (window A 6.80/63 vs 7.15/67, B 7.33/74 vs 7.31/70). W7 chats are longer (63.6 vs 46.7 messages) and more reach a judged second window (29 vs 23 of 30). W7 is not shown to be better on the judges' scores; the cold read of these chats is the next step. Cheap checks (`writer.mjs`; W6 is `writer-w6.mjs`): all eight items of `notes/diagnoses/w7-diagnosis.md`. Met: no `;` work fields, place follows topic (Q1, Q2 6 of 6), openers distinct (8 of 8 briefs), no gaps over 18 h, no Sources lines. Not met: people with one emoji in 40% or more of messages (2 of 29, W6 11 of 88, W5 0), trait words in knows lines (22 of 141 vs W6 45%).- **W6 built, and judged against W5** (`eval/w6-batch/`, results under W6 in ITERATIONS.md): 10 fresh briefs x 3 seeds, each arm with its own casting (the casting changed), same briefs, seeds and start times. Score 7.44 (W5) vs 7.31 (W6), p_real 78 vs 79, n=110/108: within noise (window A 7.67/78 vs 7.55/79, B 7.16/78 vs 7.02/79). W6 chats are about 25% shorter (42 vs 57 messages). W6 is not shown to be better on the judges' scores; the cold read of these chats is the next step. (Scores are comparable only within a batch.)
- **W5 judged** (`eval/w5/`, results under W5 in ITERATIONS.md): paired W4 vs W5 on fresh briefs, 3 seeds, shared casts: score 7.11 (W4) vs 6.97 (W5), p_real 70 vs 73, n=114/118; within noise. W4 re-judged on the current judge: 6.69, p_real 58.
- **Multi-agent simulation** (`run.mjs`, rounds 1-19): stateless Haiku characters see a phone screen, with a generated cast, life updates and a Haiku polish pass.
  - Judged scores plateaued at about 5-6/10 over rounds 15-18.
  - The round 19 changes (personality line, the Day schedules the next look, etc.) are built and cheap-checked, but haven't been through a batch.
- **One-call baseline** (`baseline.mjs`): one Haiku call writes the whole chat from the same cast. It scored the same as multi-agent (5.6 vs 5.4) on round 18's casts.
  - So the main effort moved to a **single writer**.
- **W1 built and checked** (`writer.mjs`, plan in `notes/diagnoses/w1-diagnosis.md`): no example texts (pasted lines 25% → 1%), people block as background, texting rules, floating volume, secrets (no leaks in 9 casts, but owners never raise them either), one call per story day. Names 23% → 12% and sign-offs 11% → 6% (both missed targets of 10% and 4%); about 28% fewer messages; lowercase habit markers rose. Chats in `writer-runs/`, checks in `w1-checks/`.
- **W1 blind judging done**: W1 6.1 vs one-call 5.4 on the same casts (best so far). Reports and scores in `eval/w1/judges.md` and `eval/w1/scores.tsv`.

## First thing in the new session
W4 is finished and committed. 1) Republish viewer/index.html in the new account (capabilities comments + db) and run one live writer chat from the Start form using README "Starting a run with the writer" (`node writer.mjs --live spec.json --out <dir>`; write RUN/TURN/DONE files to live_runs/live_turns). It has only been smoke-tested locally. 2) Then an Opus cold read of the W4 fresh batch (stiff formal speaker and tidy callbacks remain; sleep-hour messages rose after the midnight fix), with the live-chat constraint and no 'not now' list.

## Next steps
1. (Done: W1 judged 6.1.)
2. (Done: W2 built in `writer.mjs`, W1 kept as `writer-w1.mjs`; checks under W2 in ITERATIONS.md.) Paired batch W1 / W2 / W2-medium on held-out briefs is built at `eval/w2/` (judges j1-j53, 3 per file). Judged: W1 6.7, W2 6.7, W2-medium 6.9 (within noise; best level yet). W3 built (writer.mjs; W2 kept as writer-w2.mjs, run with --effort medium). Paired batch W2M vs W3 judging set at eval/w3/ (judges j1-j22, 2 per window). Judged: W3 6.84 vs W2M 6.62 (keep W3). W4 (plan in notes/diagnoses/w4-diagnosis.md) is built and cheap-checked (numbers under W4 in ITERATIONS.md): the midnight header and a second chunk-start cause are fixed (rejects 1 in 71 calls, was 18 in 74; every chat complete); the writer runs in the live app (`writer.mjs --live`, command in README 'Starting a run with the writer'; not yet published or tried against the real page by the session that owns it); @claude cut-and-resume works (5/5 briefs ask, after one added sentence); dropping the style line aborted (everyone lowercase), the delete-only pass lost its blind check (6.58 vs 7.49) and Sonnet as writer is no better (7.06 vs Haiku 7.05), so none of those three are in the writer; big-group sheets, a code-drawn place, and a 'lives with' line are in (weakly checked). The final fresh batch scores 7.12. Next: a cold read of the W4 chats, then the cold read's plan.
3. Done in W4: @claude cut-and-resume, the writer in the live app (day N+1 is written while day N plays, messages released on the story clock; the owning session mirrors them to `live_runs`/`live_turns`). Left: publishing and trying it against the page.
4. Use paired comparisons on shared casts, with 3 seeds per scenario and fresh briefs each round. Six windows can only show differences of about 1.8 points or more.

## Files
- `notes/diagnoses/`: every Opus cold read, which are the plans each round implemented.
- `notes/judging/`: judge reports, scores, keys and run lists per batch:
  - p4 = round 12
  - p7 = round 15
  - p8 = round 16
  - p9 = round 17
  - p10 = round 18
  - baseline-vs-r18 = one-call vs multi-agent
- `notes/scenarios/sc.sh`: the six tuning scenarios (T1-T6). Run it from the project folder: `bash notes/scenarios/sc.sh T3 [ENV=...]`.
  - The unseen briefs used each round were U1 "You're housemates." (4 people), U2 "Old school friends who live in different cities now." (2 people) and U3 "Cousins." (5 people), each with DAYS=3.
  - The held-out set, never used for tuning: friends arguing about a film, restaurant kitchen staff, siblings clearing a grandparent's flat, a couple planning a first trip, an 8-person open chat, a friend who owes money. Shuffle names and who opens.
- `runs/`: multi-agent runs. Each has `transcript.txt` and `log.jsonl`; the user turn each agent saw is in the log.
- `baselines/`: one-call chats. `writer-runs/`: single-writer chats.

## Moving to a new account
- **The viewer artifact won't carry over.** The live viewer (`viewer/index.html`, was published at https://claude.ai/artifact/SFk1AueBg7k9g7SSqu7uqb) belonged to the old account; the current copy is https://claude.ai/artifact/RcFGQ7wSmx3ivRNsGtb98y (published 2026-11-23, comments + db; the two runs.json runs with U+FFFD in their text, runs/2026-11-22T19-41-00-120Z and 21-33-33-051Z, were left out of the first publish because the publish tool refuses that character; since then every run before 2026-11-23 07:12 UTC is out of the viewer at the user's request, so it starts empty), and so does its database (`live_runs`, `live_turns`) and comment-driven Start button.
  - In the new account, publish `viewer/index.html` as a new artifact with capabilities `{comments: {}, db: {}}`, and follow README "Viewer" to wire up Start and live writes.
  - The Start form sends `START RUN` with situation, topic, people, secrets, model and oracle.
- **The `claude` CLI must be logged in** in the new environment: run.mjs, baseline.mjs and writer.mjs call `claude -p` with Haiku, and Sonnet for @claude.
- **The scratchpad (`/tmp/...`) won't exist.** Everything needed is in this folder.

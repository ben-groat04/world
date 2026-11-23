# Handoff: open-chat

Start here when picking this up in a new session. Then read `ITERATIONS.md` (every round, what failed, process lessons) and `README.md` (how to run things).

## Goal
Simulated text chats, group or 1:1, that blind judges can't tell from real people texting. The target is 8/10, for any situation a user types in, and users often give only a minimal one. Haiku writes the characters, because it's cheap. Don't overfit to the test scenarios.

## User's rules and preferences
- It is a LIVE chat app: the chat plays out in story time in the viewer as it is generated, started from the Start form, and @claude must be able to answer a character mid-chat. Every change must work in that setting (generated a little ahead, released message by message). No after-the-fact rewrites of whole chats. Keep the work tied to the running app, not to offline transcripts.
- Rounds are slow, so each round fixes everything the cold read finds: no "not now" or "not core" lists. Tell every cold read this.
- `/home/user/world/CLAUDE.md`: real-world facts (stats, prices, rates) must never be guessed; source them or leave them out. Design choices and example text are fine. Fix root causes, not symptoms.
- The orchestrating session doesn't steer. Diagnosis is an Opus cold read, coding is done by Sonnet agents, and blind judges are Sonnet with a neutral prompt.
  - Don't give judges or the cold read priorities or specific questions. Pass the user's observations on neutrally, labelled as theirs.
- Workflow: runs → Opus cold read → Sonnet coder → cheap checks → runs. Don't launch runs or change code between those steps on a hunch.
- Keep agent-facing prompts lean. Don't pile rules onto them, or follow-up notes onto a running coder.
- Run things in the background, keep replies responsive, and give short progress updates.
- No real-chat anchors for now: compare versions against each other.
- Opus only for hard thinking (cold reads). Coders are Sonnet; characters are Haiku.
- Commit and push to branch `ccr-982e4403-t5vbsu` often (a stop hook asks for this).

## Where things stand (2026-11-23)
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
- **The viewer artifact won't carry over.** The live viewer (`viewer/index.html`, published at https://claude.ai/artifact/SFk1AueBg7k9g7SSqu7uqb) belongs to the old account, and so does its database (`live_runs`, `live_turns`) and comment-driven Start button.
  - In the new account, publish `viewer/index.html` as a new artifact with capabilities `{comments: {}, db: {}}`, and follow README "Viewer" to wire up Start and live writes.
  - The Start form sends `START RUN` with situation, topic, people, secrets, model and oracle.
- **The `claude` CLI must be logged in** in the new environment: run.mjs, baseline.mjs and writer.mjs call `claude -p` with Haiku, and Sonnet for @claude.
- **The scratchpad (`/tmp/...`) won't exist.** Everything needed is in this folder.

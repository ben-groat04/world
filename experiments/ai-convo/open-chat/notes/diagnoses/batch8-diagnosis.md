## Cold-read diagnosis: open-chat batch 8

What I read: all of `run.mjs`, README.md, the batch 8 tally, scorecard and judge reports, and batches 6 and 7. I also read the transcripts and logs of runs T41-LOW, T11-DEF, T21-LOW, T51-LOW, T61-DEF and T62-DEF, plus one full agent session file (`/tmp/open-chat-EIzcGg/projects/*/4ee56c62…jsonl`). I changed nothing.

### Root causes, most important first

**1. Once a reply chain ends, the chat is dead.**
- The scorecard shows `passNone` at 0.98–0.99: an agent shown "Nothing new since you last looked" almost always answers PASS.
- So every message comes from a reply chain, and when a chain closes nothing restarts it. All 36 runs ended on `date`, with a mean of 26 messages against a limit of 80.
- Examples:
  - T41-LOW goes silent at Mon 08:02 and stays silent until Wed 19:00.
  - T51-LOW's last message is Sun 19:20.
  - T61-DEF posted nothing at all: Maya passed on "(nothing yet)" even with the topic in her prompt. The header says Maya opens at START (`run.mjs:3`), but she is free to PASS.
- Why the model does this: it has nothing new to say. Its world only changes through the daily refresh, and that refresh is broken (cause 2).
- It also can't act off the chat (check the schedule, call its brother). So the honest in-character move is to stay quiet, or to post another "still a maybe" status report.

**2. The daily refresh freezes the world** (`run.mjs:169`).
- The generator is told "It is a new day" with no date or weekday. It sees only the person's own posts, gets "Yesterday: <yesterday's text>" as an anchor, and is told "(some done, some slipping, as fits)".
- The result is near-copies of yesterday:
  - T11-DEF: Tom's line on Mon, Tue and Wed is essentially the same text ("client changed the tile order again… hoping to get the tiles sorted before eight").
  - T11-DEF: Jo has "parents' evenings start tonight" every day.
  - T41-LOW: Tom is on "the first of three twelve-hour shifts" three days running.
- Because the generator never sees what others wrote, it contradicts the chat. In T11-DEF, Sam's line says "Tom confirmed Sunday", which never happened.
- The refresh also runs once, at the morning check-in. A check-in at 18:00 still sees a morning snapshot ("hoping to… before eight"), so there is nothing to report.
- "Some slipping" is a behavioural nudge. Combined with the frozen world, it produces the promise/miss/confess loops judges flag in every batch ("still a maybe until I've checked", "I'll confirm tonight" ×5).

**3. People who supposedly know each other share no common ground.**
- Each agent knows only its own life (`briefFor`, `run.mjs:33`). The brief says "matched… and have been texting since", yet the first turn shows "(nothing yet)".
- So every opening is introductions:
  - "Hey! Sorry for the slow reply" in an empty chat (T41).
  - Everyone announces their job and week on cue (T11, T51), which judges flagged as "each announcing their job/shift detail".
  - The 1:1 turns into a getting-to-know-you interview.
- Real texting is terse because context is shared. Here the model has to explain, so it writes full, expository sentences.

**4. The assistant turn structure.**
- Each check-in is a user turn of "New messages:", and the agent's own past messages exist only as its assistant turns. The model treats each batch as a request:
  - It answers every sender in turn (Maya at 19:17: "Priya, … Jo, …").
  - It acknowledges and thanks.
  - It recaps the plan.
  - It addresses people by name: 81% of messages name another participant.
- It never sees its own run of "Talk later, Tom." / "Later, Maya." as one screen, so goodbye loops reach a `byeRun` of 10 (T41).
- Each new message also gets its own fork, where answering a goodbye with PASS reads as rude to an assistant.
- What surrounds the brief reinforces this:
  - "You are a Claude agent…" opens the system prompt.
  - NOTE is written as relay instructions to an AI.
  - Every turn adds reminders for model identity, "15000000 tokens left", and curl/untrusted-file advice. I saw all three in the session file.

**5. The re-check pushes rewrites that add echo.**
- `draftDrop` is 0 in both arms and `draftChg` is 0.57–0.75. Shown messages that crossed with its draft, the model never drops the draft. It rewrites it, usually adding acknowledgement and recap ("Since you've split it, I'll take…", "both still open is clear").
- The three-way menu at `run.mjs:122` turns a glance at the phone into an editing task.

**6. Stale reaction choruses.**
- REACT goes on "the latest message from someone else" even at a check-in where nothing is new (`run.mjs:103`).
- So agents react to last night's message at their morning check-in. In T51, four people reacted 😴/❤️ to a 19:20 message between 06:06 and 07:02.

**7. The scenarios can't reach their own payoff.**
- START is Sunday 19:00 and DAYS=3, so every run ends Wednesday 19:00. The "Friday" deadlines in T2 and T6 never arrive.

### Fixes, ranked

1. **Fix the refresh inputs** (`run.mjs:169`). Emergent; within both rules.
   - Pass the weekday, date and time.
   - Pass everyone's messages since the last refresh, not just the person's own (`mine` at `:168` → the whole convo slice).
   - Remove "(some done, some slipping, as fits)" and ask instead: "how the things ${n} said they'd do went, and what has happened since".
   - Say "Yesterday" is background and ask what is different today.
   - Expected impact: high. It removes frozen lines, contradictions and stall loops at their source.

2. **Advance life by elapsed time, not by calendar day.** Emergent; the gap is a design parameter, not data.
   - Replace the per-day refresh key (`lineDay`, `:92`, `:165`) with "if at least X hours have passed since the last refresh".
   - Put the result in the check-in user turn: `(Tom's phone, Mon 12:40.) Since you last looked: <events>`. Today it sits in the system prompt as a morning snapshot.
   - This is the root-cause fix for `passNone` ≈ 1: people get something to text about, threads resolve ("tiles finally picked, I'm in Sat"), and chats restart.
   - Expected impact: highest. Liveness on day 2–3 is where window B loses points (B 3.2–3.3 vs A 3.7–3.9).

3. **Common ground in the setting.** Emergent: it states the situation, not behaviour.
   - In the generator prompt (`:157`), have the Setting also say what everyone knows about each other (jobs, where each lives). Put the full SETTING in every prompt, which it already is.
   - When the brief implies history, add one shared sentence on what they last talked about.
   - Expected impact: medium-high on exposition, job announcements, the "sorry for the slow reply" opener and interview-style flirting. It should also shorten messages without telling the model to.

4. **Show the phone screen.** Emergent, but experimental.
   - Put the last N chat messages, the agent's own included, in each check-in user turn, marked "(you)".
   - Arm B: stateless calls, so the model's polished assistant history isn't its main context.
   - Expected impact: medium on goodbye loops, round-robin acknowledgements and echo. Run it as an A/B.

5. **Re-check** (`:122`).
   - Try `(Your message isn't sent yet. SEND sends it, PASS deletes it, or type what you send instead.)`.
   - Better: A/B against re-check off, since it has never dropped a draft and its rewrites add recap.
   - Low-medium impact.

6. **Reactions** (`:103`).
   - Only allow a reaction to a message first shown at this check-in (`to >= seen[n]` before the update).
   - This is a root-cause fix: the turn offers to react to "the latest message" when it shows no message. Low impact.

7. **Scenarios** (`r8/sc.sh`).
   - Set START or DAYS so the topic's own timeline fits inside the run. These are design parameters.

**Register.** Full punctuation, no typos or fragments, and names everywhere are Haiku's defaults. Fixes 3 and 4 should reduce them indirectly. Fixing them directly would mean a behaviour instruction, which the user has rejected before. If one is ever added, flag it as hard-coded.

**Already hard-coded in the code — flag these:**
- "(some done, some slipping…)" (`:169`): remove it.
- `FORM`'s "varied, specific… rather than stock ones" (`:146`). It is defensible as an anti-repetition steer, but it is also the likely source of the over-specific details judges flag (postcodes, named cafés, flapjacks from Stokes Croft).

**Minor: sleep times.** Night-shift characters sleep and wake on the day-worker window (`:16`, `:79`).

### Is the evaluation misleading?
Yes, in five ways:

1. **There is no human anchor.** Every file is AI-written, and nothing was ever scored against real chats. So 3.6/10, and the 8/10 target, can't be read: we don't know what a real group chat scores under this judge. Mix in blind windows of real, sourced, licensed chats. Per the data rule, they must be real; never write "human-like" ones.
2. **The judge prompt assumes a giveaway** ("…and say what gives it away"). Ask for a score and reasons, and say that some files are real.
3. **Window problems** (`eval-prep.mjs`):
   - When a chat dies, A and B overlap. In T41-LOW, A is messages 1–25 and B is 17–29, so the same text is judged twice.
   - Runs that die early drop out: DEF-T61 has 0 messages and DEF-T62 has 3. So "T6 DEF 2.50 vs LOW 4.25" rests on one run.
   - Window length varies from 8 to 25 messages, and judges say shorter windows read more human.
   - Fix: equal-length windows that don't overlap, and report the number of dead runs as its own outcome.
4. **The arm difference is noise.** 3.64 vs 3.49 for effort low vs default means effort is not the lever. Batch 7's pairwise tally had about 30 of 37 picks going to the second file whichever arm was shown first, so it is unusable.
5. **The strongest signal is in the scorecard, not the judges.** Judges see 25-message windows and never the two days of silence. `passNone`, `end`, `byeRun` and messages per run are the numbers to track for fixes 1 and 2.

All the evidence is in `/home/user/world/experiments/ai-convo/open-chat/runs/2026-11-22T20-54-*` (`log.jsonl`, `transcript.txt`) and in the session files under each run's `config_dir`.

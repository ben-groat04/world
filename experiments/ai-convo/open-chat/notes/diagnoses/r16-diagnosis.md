## Round 16 cold read: what still gives the chats away, and what to change

I read only: no edits, no runs. I read ITERATIONS, run.mjs, prompts.mjs, README, all 18 transcripts (stateless first), judges.md and scores.tsv. I also went through log.jsonl rows (user turn, raw reply, polished text, cast). My throwaway analysis scripts are in /tmp/claude-0/-home-user-world/f8895907-66f8-5315-a40a-9b9125a9ca28/scratchpad/cr/.

### What gives them away, with root causes

**1. Echoing the last message and confirming settled things.** Almost every judge named this. Examples: "Next tin's on Eilidh, noted", "Confirmed, 9 it is", "Nine, then", "Biscuits with your mum, parking with your dad", "Ross on tin duty" passed round five people.
- The echo is already in the agent's raw reply. Haiku opens by handing back the other person's words, then adds its own bit.
- Polish does not remove it. Word overlap with the previous message is the same in raw and in the final text (stateless 0.13 vs 0.13). Polish's "Reply DROP **only** if…" fires on 2–4% of replies. It let "Confirmed, 9 it is 👍" through and only swapped the emoji.
- Spontaneous looks with nothing new, where the Day's "Small thing" (the shareable item at the start of the Day) says "nothing", turn into re-confirmations ("sunday's locked, i'm in", "Morning!! Cake's on track", "Nan's 9:30, so 8:45 still works"). Polish should drop these and doesn't.

**2. In 1:1 chats every message gets an answer, so banter never stops.** Over-attentive questions and the parking/biscuits loop (T4, scored 3–4) come from this.
- On notification looks, stateless 1:1 agents post 82% of the time and pass 6%. In groups it is 33% post and 24% pass.
- In the dating run, 31–38% of messages contain a question.
- Cause: the agent note (prompts.mjs:6) says "When someone asks you something **or says something to you**, you answer it." In a 1:1 chat, everything is said to you. The README describes the intent as "a question put to you gets answered"; the extra clause goes beyond that.

**3. Long, tidy "writes like a document" characters** (Oliver, Rhys, Nadia, Thomas, Tariq/Priya).
- The cast gives someone in nearly every group "full sentences, proper punctuation, a few sentences long".
- That description reaches the agent too: `How you text: ${how[n]}` at run.mjs:41. So the agent writes long, polished prose (Oliver averages 23 words a message), and polish, told to change "as few words as needed", keeps it.
- So the voice is applied twice, which is the round 12 lesson. Round 13 meant voice to be applied once, in polish.

**4. The opener cue is broken for casts without a topic** (a bug).
- run.mjs:129/135 builds "(You've opened the chat to Dan messages Hannah to ask whether…..)" and "(…to Sending a poll…..)". The cast's "opens with" line comes out in third person or as a gerund, with a doubled full stop.
- Stateless openers passed 2 of 9: T5, and U2, where the reunion topic never came up and the chat began the next morning. The topic cue (`topicCue`) went 54/54 in round 13.

**5. Smaller things I saw, not ranked:**
- A stateless agent answered her own question once (Hannah, Thu 12:55).
- Raw replies sometimes narrate in the third person ("Hannah would just reply briefly…"): 5 of 26 in SL-U2. Polish strips them; nothing leaked.
- Posts lag the plan: "in car with nan, heading now" at 09:28 for a 09:30 appointment.
- The Day repeated the same sentence across refreshes (U2, the train booking).
- Reactions are moderate (0–13 messages with reactions per 25-message window), so they are no longer the main tell.

### Can the memory arm go? Yes.
- On A windows only (to remove the window confound): stateless 5.86 (n=14) vs memory 4.27 (n=15).
- Round 15 gave 5.2 vs 4.9. That is two rounds in a row.
- Memory runs reached the 80-message limit 3 times, and those B windows are the loops judges scored 2–4.
- Caveat: the arms had different casts (no `LINES_FROM`), so the comparison is not seed-matched. But nothing argues for keeping the memory code, and the fix rule says not to keep machinery.

### Ranked plan

**1. Polish cuts echo openings and drops replies that add nothing** (prompts.mjs:11).
- Replace: "Cut thanks, sympathy formulas, greetings, sign-offs, anything that only repeats what is already in the chat, and names…"
- With: "Cut thanks, sympathy formulas, greetings, sign-offs, an opening that repeats words of the message it answers, anything else that only repeats what is already in the chat, and names…"
- And replace "Reply DROP only if the whole draft just thanks, agrees with, or repeats what is already in the chat." with "Reply DROP if nothing is left after these cuts."
- Not a re-try of round 14: that was a "restates a plan" rule. This one targets the echo opening only, and the "keep a decision, yes/no, offer, time" clause stays.
- **Check:** `replay.mjs polish` on all 18 runs.
  - Count finals whose words overlap the previous other person's message by ≥40% (now 9% stateless, 10% memory).
  - Measure the DROP rate, and read every new DROP: none may lose an answer to a direct question or a new fact.
  - Added words must not go up.

**2. The note asks for answers to questions only** (prompts.mjs:6).
- Replace: "When someone asks you something or says something to you, you answer it."
- With: "When someone asks you something, you answer it."
- **Check:** `replay.mjs turns --kind notif --n 5` on SL-T4, SL-U2, SF-T4 and SF-U2, plus 3 group runs.
  - Post rate on turns whose latest message from someone else contains "?" must stay where it is.
  - 1:1 post rate (82% now) and the share of posts containing "?" should fall.
- Watch for round 11's silence: abort if the group look post rate falls below the current 25%.

**3. Voice once: the agent gets how often its person posts and reacts, not how they type.**
- In the cast prompt (run.mjs:216), split `"<name> texts:"` into two fields:
  - `"<name> texts:"`, with only "how often you message it without being asked anything, how often you react…". This goes to the agent via run.mjs:41.
  - A new `"<name> style:"`, with "capitals, punctuation, emoji, message length, abbreviations, as follows from…". This goes to polish only.
- Parse `style` in run.mjs:222–225. At run.mjs:87, polish uses `style` (falling back to `texts` for old cast rows).
- **Check:** replay SL-T4, SL-U1 and SL-U3 turns with "How you text" cut to its frequency sentence.
  - Raw word count per person (Oliver 23, Nadia 18, Maureen 25 now) should drop.
  - Post rate should stay within ±5 points.
  - Then a polish replay to confirm the final style survives.

**4. Fix the opener cue** (run.mjs:129).
- Replace `reason = TOPIC ? topicCue(TOPIC) : opener || …` with `reason = topicCue(TOPIC || opener)`. `opener` always exists when there is no topic; parseCast requires it.
- **Check:** replay the 18 opener turns ×5 with the new cue (replay has to build the cue from the logged `reason`). Target 90/90 posted, each about the opener's subject.

**5. Remove the memory arm.**
- Delete the `STATELESS` branches: run.mjs:51–52, 74 (`--resume`), 76–83 (`amend`), 124 (`kept`/`back`), 138 (`keep`/`hush`), 140, 154, 169, 171. Also the README's `STATELESS=0` and Memory paragraphs, and `replay.mjs session`.
- **Check:** `grep -n STATELESS` returns nothing. One smoke run (U1 brief) produces the same log row fields and screen shape as today's default.

Order: 4 and 5 are mechanical and can go together. Then 1, 2 and 3 one at a time, each checked before a batch, as the process lessons say. None of these re-tries a failed item: the joke-specific rule, wants/reasons, skipping "nothing" looks and the plan-restating rule all stay out. None undoes an earlier fix: the topic cue, Day-first ordering, clock last and counts-only reactions are all kept.

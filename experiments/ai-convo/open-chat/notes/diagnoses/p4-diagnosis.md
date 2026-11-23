## Why these read as non-human (root causes, with evidence)

**1. A hidden director keeps pushing agendas. This causes the re-asks, the logistics overload and the tidy plots.** It is the judges' most-cited tell after the tics: "repeats the same point", "re-asks settled questions", "everything resolves on cue".
- Every person gets a permanent `wants` line in their system prompt, and it is always a plan. SF-T51 has 6 people, so 6 parallel scheduling threads: table, removalist, ride, roast, shift cover, trivia. Nothing ever marks a want as done.
- Each refresh writes a `Reason`, and its prompt suggests "chasing something left open". The generator sees only the chat **since that person's last refresh** (`convo.filter(m => m.at > from)`). So it tells people to ask things that were settled earlier. Examples:
  - Maya, Mon 11:11: "Ask Tom to help carry the table and settle a time". Tom had said yes, Sat 10, at Sun 20:22.
  - Tom (T4): "Chase the Saturday walk", after it was fixed twice.
  - Tom's swim invite was posted 4 times, and Sam's roster question 4 times.
- The turn then ends "(You've opened the chat to X)", which all but forces a post on X.
- The TOPIC also stays in the opener's system prompt for the whole run.
- In the 14 runs, 8 to 14 of each run's reasons were chases or confirmations.

**2. Fixed caricature style cards, stamped twice.** These are the tics every judge named: "... . 🙂", "um ... so yeah", "Hmm..."/"Ok...", "hun ❤️", formal-mum.
- Each card's examples nearly all carry the marker.
- The card goes into the agent's prompt **and** into polish, so it is applied twice. Polish visibly adds markers. Maya's raw "Sat night or Sun after 4 works for me... 🙂" became "...works for me... . 🙂". Sam's raw "um sat night works" became "so yeah sat night works for me yeah".
- Trailing-dots ("Seventies") came up in 6 of 14 runs.

**3. Styles are drawn at random, not from the person or group.** The registers clash, and judges flagged "formal next to casual" in most files:
- a 30-something night nurse who texts like a 70-year-old;
- formal-mum among high-school friends;
- "hun ❤️" in an accounts team;
- voice-to-text for a primary teacher.

**4. World generation does not map roles onto names.** U1 ("parent and adult child") came out as "you're the parent of Maya and Tom". Both got lives as young adults, and Maya, the supposed parent, asks Tom to cover her rent.
- Both people get the identical brief sentence.
- Names are fixed English ones (Tom in Mendoza).
- T4 (2-person dating chat) got a want about "the four of you" and an opener for "the group".

**5. Reactions are pushed.** NOTE says don't agree or thank, "(react instead)", and cards say "often", so most agreements become 👍. Others' reactions are shown as lines, so emoji get copied: judges saw 🥲 and 🙌 "waves". SL-T51 had 33 reactions to 60 posts.

**6. Names on every message.** 50-70% of posts in group runs name someone ("Tom, ...", "@Maya", "Jo" sent as its own message). The polish rule even keeps names "when picking out one person in a group".

**7. Lowercase and abbreviations (the user's two observations): they come from the cards, not chance.**
- **Lowercase.**
  - Seven of the 14 cards make lowercase likely (lowercase-fragments, emoji-heavy, one-word, abbreviations, banter, trailing-dots, voice-to-text).
  - The raw drafts are already lowercase. Polish adds a little: trailing-dots Maya 9 raw, 11 posted, out of 13.
  - Lowercase posts were 44-85% in 9 of 14 runs.
  - The voice-to-text card is wrong on its face: dictation inserts capitals.
  - My understanding is that phone keyboards capitalise automatically by default. That makes all-lowercase a habit some people have, not the norm. I have not checked a source, so check before writing any rate into a prompt.
- **Abbreviations.** The abbreviations card says "abbreviates everything... writes like it costs money". U1 Tom used 0.62 slang/abbreviation tokens per post. Other cards add "lol/ngl/tbf".

**8. Occupation drift leads to 4am group texts.** "Choose varied... rather than stock" mostly yields shift workers: night nurse twice, night kitchen, a 4am bus driver, a dawn canal tech. Up to 8 posts per run fall before 06:00, and judges flagged them. Lives are also built around the job, so people mention work in every message.

**9. The measuring stick has no anchor.** No real chats were judged alongside. B windows start mid-story, and judges count references to earlier messages against the run. Real windows would be hit the same way.

STATELESS and kept sessions score about the same, so memory is not the bottleneck.

## Plan, ranked by expected gain

**0. Anchor the metric first.** Add a REAL arm to every judging batch. `eval-prep.mjs` already accepts real files. Use consented chats of your own or a licensed public corpus; this is data, so it must be sourced.
- Report sim vs REAL, not an absolute score. 8/10 is meaningless without knowing what real chats score under the same judges.
- Cheap check: 3 judges on 4 REAL windows alone.

**1. Remove the director.**
- Delete `wants`: the generator field, `briefFor` and the refresh mention.
- TOPIC goes only into the opener's first turn, not the system prompt.
- Refresh produces only `Day` and `Small thing`. Drop `Reason`, the "(You've opened the chat to ...)" line and every "chase" wording.
- An unprompted look happens when the life event has something shareable. The agent sees the full screen and decides; unanswered questions are visible to it.
- If a reason is kept for the opener only, the generator must get the whole chat.
- Cheap check: `replay.mjs turns` on the logged re-ask turns (Maya ute Mon 11:12, Tom swim Mon 05:52 and Tue 04:08, Sam roster Mon 15:54, Tom T4 Tue 16:24), with the reason and want removed, N=5. Expect mostly PASS or other content.
- Then one MESSAGES=40 run, counting already-answered asks by hand.

**2. One casting call that builds a coherent cast.** It replaces the setting and line prompt and works from any brief, however minimal. Per person it gives:
- a name that fits the place, culture and age (drop the fixed NAMES; keep index-based keys internally);
- age, gender, and an explicit role mapped from the brief ("Maya = the parent, 58");
- relation to each other person; where they live; occupation (asked to fit the brief, not to be unusual); this week's life, with the job as one part only;
- usual sleep hours;
- **how they text, in this chat with these people**: 1-2 plain sentences covering capitalisation, punctuation, emoji, length and abbreviation habits, derived from age, role and the group, with frequency words ("now and then");
- 6 example texts written for this chat, at least half plain.

Also:
- Ask for one shared register where the group shares a cohort, such as old friends or a team. Family groups can differ.
- Remove `styles.mjs` as a source, or keep it only as optional inspiration in the casting prompt.
- Personalise the situation sentence per person.

Cheap check: `GEN_ONLY=1` on about 12 briefs, including minimal ones ("me and my mum", "neighbours' WhatsApp", "five-a-side team", "my ex"), plus U1 and T4. Read them: every role in the brief maps to exactly one name, names fit the place, and no group has three clashing registers. Count night-shift lives over 20 gens.

**3. Apply voice once.**
- The agent writes content: NOTE plus the cast, and its own texting description without the examples.
- Polish is the sole voice step. Give it the description, the examples, and **this person's last 4 posted messages**. Tell it the habits show in some texts, not every one, and not to start or end the way their recent texts did.
- Remove the "(react instead)" nudge from NOTE. Remove "names unless picking out one person" and replace it with "no names or @ unless it would be unclear who is meant".

Cheap check: `replay.mjs polish` on these 14 runs. Per person, measure the share of posts carrying their most frequent marker (ending "...", "um", "🙂", "x", "!!", leading lowercase, abbreviation tokens per post) and the vocative rate, against the current polish. Expect a big drop with the facts kept.

**4. Make reactions incidental.**
- Drop the per-card frequency sentence and "react instead".
- Keep REACT as a capability, and allow a reaction only on a message that a reaction answers (confirmation, news). The user is fine with several 👍 on a receipt-type message.
- Don't show others' emoji choice as a template line. Count them only ("👍 2").

Cheap check: `replay.mjs turns --kind notif`. Compare the REACT rate and emoji diversity, and confirm it is not every agreement.

**5. Sleep and timing sanity.** Once item 2 stops the shift-worker drift, the 04:00 posts should mostly disappear.
- If early risers remain, give the agent the plain fact in its header: "(It's 04:08; the others are probably asleep.)" This is design, not data.

Cheap check: count pre-06:00 posts in the next batch, alongside the GEN_ONLY night-shift count from item 2.

**6. Re-judge.** Run a batch of 6 scenarios plus 3 unseen minimal briefs (written by someone else), with the REAL arm. Judge with the same neutral prompt, compare against REAL, and read the reports for any new dominant tell.
- Expected order of gain: items 1 and 3 remove most named tells, item 2 the register clashes and role bugs, item 4 the reaction waves.

The prompts get leaner overall: `wants`, `Reason`, the chase wording, the frequency sentences and the duplicate card all go. The casting call grows by about one paragraph.

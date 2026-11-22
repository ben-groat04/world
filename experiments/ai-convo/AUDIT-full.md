# Full audit: ai-convo (Opus, 22 Nov 2026)

**Scope.** I read everything in `experiments/ai-convo/`: the v1 hand-run flatshare (`transcript.md`, `personas/`, `private/`, `director.md`, `rules*.md`, `clock.js`, `where.json`), run 3 (`run3/`), the legacy engines (`sim-workflow.js`, `social-sim-iterate.js`, `engine-v2.js`, `attributes*.mjs/json`, `r2*.json`), the current engine (`engine-v3.js`, all 458 lines), `workflow/`, `build.cjs`, `save.cjs`, `test-v3.cjs`, the sampler, `AUDIT.md`, the round-1 audit, and every saved run under `rounds/`.

**What I ran:**
- `node test-v3.cjs`, which passed (ALL OK).
- `node sampler/test.mjs`, which passed (ALL RULES HOLD).
- A check that `workflow/dist/sim.js` matches its build (it does).
- Log analyses over `log.jsonl` and `calls.jsonl`.
- A small harness that runs the engine's own `resolve()`.

Line numbers below refer to `engine-v3.js` as it stands at commit f59a7c2.

The user's brief was: "a few personalities ... interact as agents ... in person or in a group chat or both. Make it realistic. Output logs of everything so we can audit after."

---

## 1. Summary

| | verdict |
|---|---|
| Logging / auditability | **Strong.** Every model call is stored with its prompt and result, along with the event log, journals, world decisions with reasons, and the hard facts. This is the best part of the project. |
| Architecture | **Sound direction.** Each person is a separate agent with its own journal. Code keeps the facts, and a "world" role voices the background with reasons. People and shifts are sampled from census data. |
| Realism of the latest run (`check-cafe2`, 3 sim-hours) | **5/10.** It has real texture: a regular's toastie, a mate planning Saturday, lunch with mum, a shift-swap text. But a topology bug makes the owner believe her cook is missing for 90 minutes, a tea round runs to the 40-line cap, and players narrate phone calls and customers that the world never produced. |
| Realism of `check-cafe` (the run before) | **3/10.** Every customer was blocked, because the café floor was staff-only. |
| Round 1 (older engine, 5 runs) | 2.5/10 overall, per `rounds/r1/audit.md`. Most of its root causes are now fixed in code (see §6). |
| The brief's "group chat" | **Not delivered by the current engine.** No group chat exists unless a player creates one (line 131). The last three runs contain no group chat at all. |
| Coverage | The current engine has been run only on the café setting, for 3 hours, with an all-White cast. Stereotyping and the flatshare, street, friends and family settings are **untested since the fixes**. |
| Cost | 1.03M tokens for 3 sim-hours with 4 people (`check-cafe2`). 135 of the 177 sim calls were single conversation lines. |

The engine has three **confirmed bugs** (§2) and five **mechanisms that drive most of the remaining unrealism** (§3). Four are code-owned facts; the rest have AI-first fixes.

---

## 2. Confirmed engine bugs (code must own; cheap to fix)

### B1. The schema cuts every public place off from its own back rooms (the cause of the "missing cook" farce)
- **Code.** Line 90 tells the world builder `building: ... empty for public`. Reachability needs the same non-empty building in three places: call-over (line 254), `talk_to` (line 370) and arrival notices (via `here`).
- **Result.** In `check-cafe2` the world has `The café` (public, building "") and `Café kitchen` (building "café"). They are in different buildings, so they are out of earshot of each other.
- **Evidence.** Stephen walks into the kitchen at 10:30 (`memories.txt`).
  - From 10:40 Claire "glances at the door" for Stephen through a 63-minute scene. She leaves him a voicemail, which is only narrated (B3), and texts him at 11:43.
  - She then narrates ringing his wife at home. Stephen's text at 12:00 ("i'm in the kitchen, been here since half ten") ends it.
  - When Stephen tries to reach Claire, the engine replies `Claire Doherty isn't around here` (calls.jsonl #177, Wed 12:30). The kitchen and the counter are a few metres apart.
- **Regression.** The previous run (`check-cafe`) gave the café floor and kitchen the same building, but made the floor `shared` with a staff-only access list. Every customer was then `BLOCKED (Gordon Pryce cannot be at Café front of house)` (9 blocks in `world-decisions.txt`). Commit d043ad4 fixed access by pushing the floor to `public`, and that brought in the empty building.
- **Fix.** Let a public place carry a building, and remove "empty for public" from line 90. Access and building are independent facts: one says who may enter, the other says what is within earshot.

### B2. A direct message can silently go to a group chat (latent privacy leak)
- **Code.** `send()` (line 334) looks up a matching group chat **before** a person. `resolve()` (lines 31-33) accepts a unique *substring* match.
- **Harness result** (the engine's own `resolve`): `resolve('Junior', ['group: Hayley, Junior, Yousif'])` returns the group.
- **Result.** Any persona that DMs someone by first name, while it shares exactly one group with that person, posts the private message to the whole group. Group names are built from first names (line 336), so this is the normal case.
- **Exposure so far.** The saved v3 runs show no actual misroute, because only one smoke run had an auto-named group. The test suite does not cover this.
- **Fix.** Resolve a person first. Match a group only on an exact name, or on an explicit "group" marker.

### B3. Background people who are physically present cannot be included in a conversation or called over
- **Code, three places:**
  - The call-over target resolves only against simulated `NAMES` (line 253).
  - A player-started scene pulls in only simulated people at the place (line 376).
  - Arrival auto-join is for players only (lines 289-290).
- **Evidence.** In `check-cafe2` Tanya Pearce, a background colleague, is `present` at the café until 13:58. In the 11:43 scene Claire and Chloe shout for her four times, and the engine logs `— (no answer from Tanya Pearce)`.
- **Same cause.** The world role placed a "lunch customer" at 11:55, but that customer is not in the scene. So Chloe says "Morning, what can I get you?" **five times** to nobody (calls #123, #128...). The players then invent the rest of the customers.
- **Fix.** Include `atPlace(pl)` contacts in call-over resolution and in scene membership. Their lines already go through the world voice (line 232).

### Smaller code defects
- **Names "said aloud" are learned by substring, by everyone** (line 213).
  - "Al" matches "all", "Tom" matches "tomorrow", "Ann" matches "announce".
  - The name is learned even by people who left the scene before it was said (`ps` includes people who have left).
  - Fix: match whole words, and only among people still present at that line.
- **A phone callee sees the caller's opening words before deciding to pick up.** World-initiated calls start with the caller's opening line (lines 410 and 414), and the "RINGING" prompt shows it (line 234). This biases the decision to answer.
- **A gist can attach to the wrong conversation.** If the ref the model returns does not match, it is attached to the first open conversation (line 348).
- **Wrong-order plan steps can create a 20-23 hour step.** A plan whose `until` is up to an hour earlier than the previous step's end becomes a ~23-hour step, capped at 20h (lines 272-274). The ">23h = slip" guard only catches exact repeats.
- **Silent place substitution.** A step to a place the person cannot access silently stays where they are (line 274), and the person is not told.
- **Role conflict for the character writer.** The writer is sent as `kind 'persona'` (line 72). The `persona` agent's system prompt (`.claude/agents/persona.md`) says "You play one realistic person", while the prompt says "you are not playing a person".
- **Losing speakers vanish from the log.** When several people want to speak, one is picked at random (line 247). The losers' lines exist only in `calls.jsonl`, not in the log or transcript. That is acceptable, but should be documented.

---

## 3. Mechanisms behind the remaining unrealism (ranked by impact across runs)

### M1. Conversations cannot touch the outside world, so players narrate it (high impact; AI-first fix)
- **Code.** `SAY` (lines 219-222) has only `say`, `do`, `to`, `minutes`, `call_over` and `leave`. While in a scene, a person cannot text, ring, check an app or run an errand. Nothing in `do` is checked by the world.
- **Evidence (`check-cafe2`):**
  - Claire "rings" Stephen, "leaves a voicemail", then "rings his home number" and talks to his wife. All of it is in `do`/`say`. No call event exists, Stephen gets no missed call, and no wife was ever voiced.
  - Chloe tells Claire about Megan's pizza vote but cannot reply to Megan until the 63-minute scene ends.
  - The "lunch rush" (table numbers, a ham-and-cheese order, "it's mental out here") is invented by the players. The world placed one customer.
- **AI-first fix.** Give `SAY` the same outward actions a turn has (`messages`, `call`, `action`), and route them through `send`, `intend` and the world role exactly as turns do. Then add one instruction: what you do to anyone not present has to go through those fields. The world role, not code, decides what a narrated outside action produces.

### M2. Talk ends only when everyone falls silent in the same round, so scenes hit the cap (high impact; AI-first fix)
- **Code.** After an unaddressed line, every other person is asked (line 263). The scene ends only if all of them pass (lines 249-251 and 264). LLM speakers rarely all pass at once, and co-workers in one room never stop being "in conversation".
- **Evidence.**
  - `check-cafe2`: 2 of 7 scenes hit the 40-line cap, at 63 and 47 minutes. One was a tea round ("Tanya, orange, got it. Not stewing it, promise").
  - `smoke-v3` and `smoke-v3b`: one capped scene each, at 30 lines, plus 111-, 118- and 100-minute kitchen scenes.
  - While a scene runs, each participant's plan is suspended (line 283). The world cannot approach them: "goes to talk to Claire (not possible: they are not free there)" appears three times.
- **AI-first fix.** Give each person a clear option: being in the room is not being in the conversation. Add a third outcome to `SAY`, such as "go back to what I was doing (still here)". It should remove the person from the scene without making them leave the place, so they can be addressed again. The scene then ends naturally once those still in it stop. Code keeps the 40-line backstop.

### M3. Places are single earshot zones, and arriving joins you to any conversation (medium; code fact plus AI judgment)
- **Code.** Walking into a place with an active scene auto-joins it (lines 289-290). A player-started scene drafts every simulated person at that place (line 376). The world's `speak` does the same (line 410).
- **Effect.** This is fine for a kitchen. In a café floor, a park, a high street or "the street" (the street setting), strangers walking past are pulled into each other's chats. It shows little in saved runs, because the café cast are all colleagues, but the mock street runs exercise it.
- **Fix.** Code keeps `building` and `place`. Whether an arriving person joins should be that person's call: give them a turn and show them the live conversation, rather than appending "comes in".

### M4. Background people have no persistent schedule (medium; AI-first)
- **Evidence.** Tanya is re-placed at every step, with contradictory spans:
  - "until 10:30 ... until her shift ends"
  - then "10:37 until 11:37"
  - then "10:39 until 10:59"
  - then "11:43 until 13:58"
- "A regular customer" (a contact created at 10:16) and "Mr Hollis" (created at 11:43) are the same man under two identities.
- Helen, the assistant manager, is pinned to the café but never appears.
- **Cause.** `CONTACT.at` holds only the latest placement (line 405), and each `[step]` item is decided independently. New people are deduplicated only by exact name (line 398).
- **AI-first fix.** Show the world role, in each call, the background people it has already placed with their stated spans, so it keeps to what it said. Let the world builder give background staff their working hours once, at generation, as a judgment. Code then stores those hours as calendar facts, like sampler shifts.

### M5. No group chat exists unless a player invents one (medium for the brief)
- **Code.** "group chats exist once someone starts one" (line 131).
- **Evidence.** Chloe says "I've got his number off the group chat" (`check-cafe2`, 10:40 scene). No group exists, and she does not have Stephen's number, so her text fails: `Your message to "Stephen Marsh" could not be sent`.
- **Why it matters.** Flatmates, café staff and friend groups nearly always already have one, and the brief asked for group chat. Even the first run had one ("Alder Rd Flat B 🏠").
- **AI-first fix.** The world builder declares the existing groups (members and name) as setting judgment, and code creates them as facts. Also show the phone book in scene prompts (it currently appears only in `turnPrompt`, line 329), so people know whose number they have.

### M6. Look-up turns are unconditional and expensive, and the audit brief misdescribes them (cost/process)
- **Code.** Every `next_look_minutes` tick triggers a full turn, whether or not anything is new (line 278).
- **The brief disagrees.** `AUDIT.md` says a person gets a turn "when they glance at their phone **and something is new**". That is wrong for this code, the same class of error round 1 flagged in the old brief.
- **Evidence.** In `check-cafe2`, 6 of the 10 look-only turns saw nothing new. That is cheap next to the scenes (135 of 177 calls are scene lines, at about 4-6k prompt characters each, because the persona header and journal are re-sent every line).
- **What to do.** Correct the brief. On cost: 1.03M tokens for 3 hours works out to roughly 40M tokens for five 24-hour runs. M2 is the main lever, since shorter scenes mean far fewer calls.

---

## 4. Stereotyping

- **v1 (hand-written personas).** Magda and Kuba speak "broken English" Polish caricature in every line: "Is winter. Everything costs." "Landlord is a thief." "Is good, thanks." "Is hot. Careful." Run 3 repeats this through Magda. The persona brief asked for "slightly non-native", and the model turned it into a dropped "it" in every sentence.
- **smoke-v3b (writer saw ethnicity).** Junior Edwards (Black Caribbean, UK-born, 55):
  - cooks scotch bonnet stew with dumplings;
  - puts on Gregory Isaacs;
  - asks Hayley to hunt charity shops for "old soul or reggae".
- **Round 1.** The world builder gave every foreign-born contact a language-mixing note, and Imran's mum says "beta" and asks for coriander (`rounds/r1/audit.md`).
- **Current engine.** The writer is blind to identity (lines 52-56), which addresses the generation step. However, **the persona header at play time still shows name, sex, birthplace and religion** (lines 156-157), and so does the world builder (line 100). The engine's own comment (line 53) records that "an accent from a name alone" happened. So identity can re-enter at runtime.
- **Not yet testable.** The only post-fix runs have an all-White British/Irish cast, so there is **no evidence yet** either way. A diverse-cast run of the current engine is needed before any claim that stereotyping is fixed.
- **Milder patterns in `check-cafe2`:**
  - "love" is now down to Claire 5/40 lines and Tracey 3/7. Round 1 had Julie at 22/22.
  - Mean line length is 17 words, against 55 in round 1.
  - The young woman makes the tea round and apologises ("Sorry, sorry!", "Sorry Claire!"). That fits her low-conscientiousness temperament draw, so I treat it as one-off model behaviour rather than an engine cause.
- **Names.** The current namer offers three sets and the seed picks one (lines 66-78). The sets in `check-cafe2` (Gallagher, Doherty, Novak) are sensible for a "White Other (incl. Irish, Eastern European)" owner. The prototype collapse seen in round 1 (Jack, Chloe, Hannah, Whitfield repeating) may persist: Chloe, Megan, Callum, Hannah Doyle and Tracey all reappear in `check-cafe2`, with Hannah Doyle as an exact repeat from round 1. Track this across seeds.

---

## 5. Data and sampler

- **The sampler is careful.** Sources are in `data.json`, and gaps are listed under `unspecified` and `design`. Its tests pass.
- **The friends setting is far off its own targets** (`node sampler/test.mjs`). The skew most likely comes from the friend-matching rule ("shares an attribute", age window), which acts as an unflagged selection effect.

  | | 65+ | White British | retired | own outright |
  |---|---|---|---|---|
  | friends sample | 33.4% | 66.1% (age 25+) | 33.6% | 31.2% |
  | inner-city target | 11.0% | 34.2% | 21.6% | 13.8% |

  Flag it under `unspecified`, or condition the anchor on the inner-city profile. Street, by contrast, tracks its targets well.
- **Smaller oddities.**
  - `check-cafe2`: a 22-year-old with parents of 65 and 67.
  - Round 1: retired couples aged 52 and 54, and Wei owning a house after 3 years in the UK. That audit listed these with suggested sources, and they are still open.
- **Money is not tracked** (by design, `AUDIT.md`), but the user's original scenario was about a bill split. Run 3 shows the cost: Tom has "~£40 until payday", pays £103 on Friday, and notes "about £77 left". Balances are hard facts. If money matters to a setting, code should hold the balances and the model should decide what to do with them.

---

## 6. Round-1 root causes: status in the current code

| r1 cause | status |
|---|---|
| 1. ids vs names | Fixed: the namer runs first and the world builder sees names (lines 69-80, 100). |
| 2. no turn at step boundaries | Fixed (line 292), plus look-ups (line 278). |
| 3. background people pinned and passive | Mostly fixed: the world role decides presence, speech and contact per step (lines 291, 390-393). Persistence is still weak (M4), and present background people are excluded from scenes (B3). |
| 4. clock inflation | Improved: the question is now "minutes until anyone speaks again", and the overrun is shown (lines 220, 233-234). Still present through M2. |
| 5. caricature tics, round-robin turns | Improved (line 62 writer rule; addressed-speaker logic, lines 261-263). |
| 6. names blind to ethnicity | Fixed: the namer sees ethnicity. |
| 7. duplicate contacts | Fixed (`contact_map`, lines 95, 122-126). New world-invented people still duplicate (M4). |
| 8. private rooms public | Fixed (line 109). This in turn exposed B1. |
| 9. truncated threads | Fixed (whole window, line 166). |
| 10. know levels | Fixed (by sight / by name / numbers, lines 89, 115-116). |

---

## 7. Logs, docs and repository hygiene

- **Logs.** These meet the user's "logs of everything" goal well:
  - `calls.jsonl` holds every prompt and result;
  - `world-decisions.txt` gives a reason for every background decision;
  - `memories.txt` shows why each turn happened.

  Two gaps: losing simultaneous speakers (line 247) and narrated outside actions (M1) are not flagged anywhere, so an auditor cannot tell a real call from a narrated one without reading `log.jsonl`.
- **`README.md` is stale.** It describes only the v1 four-flatmate set-up and never mentions engine-v3, the sampler, `rounds/` or `AUDIT.md`. Anyone opening the folder is misled.
- **The root folder mixes three generations.**
  - The v1 live-mode leftovers: `transcript.md`, `where.json`, `clock.txt` (stuck at "Fri 09:31"), `rules2.md`.
  - Legacy engines nothing references: `sim-workflow.js`, `social-sim-iterate.js`, `engine-v2.js`, `attributes*.{mjs,json}`, `r2*.json`, `r2c*.json`.
  - The current engine.

  `attributes.mjs` depends on `sim/population` elsewhere in the repo. Moving v1 and v2 into `legacy/` would make the current pipeline legible.
- **Stale references.** `rounds/r1/audit.md` refers to `audit-v3.js` and `audit-args.cjs`, which no longer exist, and its line numbers are for an older engine.
- **Isolation.** v1 agents had shell access and were merely *asked* not to read `private/*.md`. The current agents have `tools: []` (`.claude/agents/*.md`), which is real isolation. Good.
- **Tests.** `test-v3.cjs` is a solid mock harness covering schemas, journal visibility, errands and slow-talk overlap. It cannot catch B1 to B3, which need world-shaped fixtures:
  - a public place with a back room;
  - a DM to a first name while a group chat exists;
  - a call-over of a present contact.

  Add these three cases.

---

## 8. What works (keep it)
- **Separate agents.** One agent per person, with a verbatim first-hand journal and self-written gists and day summaries. Knowledge flows correctly: Callum mentions Jordan's swap request at 12:13, one minute after the text arrives (call #147), because NEW journal entries reach scene prompts.
- **Hard facts in code, judgment in models.** The world role must give a reason for every decision.
- **Hard-fact rules enforced.** Contacts cannot text people whose number they lack (line 401). Access is enforced, and failed sends are reported back to the sender.
- **Sourced data only.** Census-sampled people and shifts, with an explicit refusal to guess figures (events without a source are dropped, line 139).
- **Small, believable moments.** Lily's lost reading book, Mr Hollis's toastie, Megan's Saturday vote, and Callum's eggs on toast with his mum. That last scene is the most realistic in the project: short lines, nods and silence.

---

## 9. Recommended next steps (in order)
1. **Fix B1, B2 and B3** (code facts, about 10 lines in total), and add the three test fixtures.
2. **M1:** give `SAY` outward actions (messages, call, errand) that go through the existing pipes.
3. **M2:** add a "back to what I was doing, still here" outcome so co-presence stops being conversation.
4. **M5:** have the world builder declare existing group chats; show the phone book in scenes.
5. **M4:** show the world role its earlier placements; let the builder give background staff their hours once.
6. **Correct `AUDIT.md`** on look-ups; update `README.md`; move v1/v2 into `legacy/`.
7. **Then run a diverse-cast flatshare and a street run** with the current engine. Re-audit stereotyping, and confirm the brief's group chat plus in-person mix actually appears.

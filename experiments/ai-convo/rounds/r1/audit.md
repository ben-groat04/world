# Audit round 1 (engine-v3, seed 1101)

Brief: `audit-v3.js` (per-run read with a novelist's eye, then a cross-run comparison, with an AI-first check on every issue). I applied it to the five saved runs. I checked every cause against `log.jsonl`, `calls.jsonl` and `engine-v3.js`; line numbers refer to `engine-v3.js`.

## Scores

| run | window | sim calls | scenes | messages | score | one line |
|---|---|---|---|---|---|---|
| cafe | Tue 06:00-18:00 | 7 | 0 | 0 | **1/10** | The owner and the cook share the café for seven hours and say nothing. Each sees the other as a "stranger". There are no customers. The transcript is empty. |
| family | Sat 08:00-20:00 | 153 | 8 | 25 | **5/10** | A believable Saturday shape (breakfast, kickabout, butcher, soup lunch, shepherd's pie), but it is wall-to-wall talk with verbal tics, a 160-minute lunch and no friction. |
| flatshare | Fri 16:00-Sat 04:00 | 65 | 3 | 0 | **4/10** | A plausible kitchen hour, then everyone is in bed by 23:00 on a Friday. Nobody texts anyone. Daniel gets one turn in 12 hours. |
| friends | Thu 18:00-Fri 06:00 | 9 | 0 | 6 | **1/10** | The four friends cannot reach each other: nobody has anyone's number. Three of the four make one decision all evening. |
| street | Sun 10:00-22:00 | 14 | 1 | 3 | **2/10** | The neighbours never meet. Imran plans to ring his mum and never does. Joby turns up two hours late for his shift with no consequence. |

Across runs: **2.5/10**. Family scores highest because it is the only setting where everyone is simulated and shares one building, so the defects below matter least there.

---

## Root causes, ranked by impact

### 1. The engine ignores half of the world builder's output: it uses ids, the engine reads names (all 5 runs; code must own)
**Evidence.** In every run the world builder wrote `know_each_other`, `workplace`, `contacts[].linked_to` and `contact_names[].person` using sampler ids (`["p5","p8","p15","p18"]`, `{"person":"p8","place":"Café kitchen"}`). Place `access` lists use names, which is why the bug is easy to miss. The engine resolves all of these against `NAMES` only (lines 97, 104, 108, 113, 123), so every id is silently dropped:
- **Nobody knows anyone outside their own household.** Café: Gary walks into the kitchen at 17:00 and sees "stranger (M, 20s)", his own cook of years, then goes home. Friends: `PHONE: people none`, so no group chat and no call is possible. The household links in family and flatshare survive only because they come from the sampler (line 113, second half).
- **Every shift is placed "elsewhere"** (`calendar.json` in all runs). `watchOcc` skips places that are "elsewhere" (line 274), so no "not at work" check ever fires. Joby's shift is Sun 09:00-17:00; he plans "walk to work 10:30-11:00, shift 11:00" and nothing notices.
- **World-named contacts are unlinked** (`linked: []` for Dennis, Maureen, Callum, Farah...). The person-level contacts fall back to their relation labels (line 108), so the transcripts show `best mate → Jack`, `close friend and fellow teacher → Aisha`, `Mum → Imran`. The models then invent names that contradict the world: Jack calls his mate "Dan", while the world named him "Callum". Contact lists also double up (Gary has both "Karen Whitfield" and "wife").

**Cause.** Line 87 lists people as `${p.name || p.attributes.id}`, which is the id, because names do not exist yet. The prompt then asks the builder to name them and to "refer to the people by the names you give" in the same call. The builder refers to them by the keys it was shown.

**Fix: code must own this.** The id-to-name mapping is a hard fact the engine already holds (`GIVEN`, line 90). Read ids wherever the builder names people: one mapping applied inside `resolve`, or a single pass over `W` after line 92. Do not add a prompt rule asking the model to try harder. The ids are what we showed it.

### 2. People only get to decide again when news arrives or their plan runs out (cafe, friends, street, flatshare)
**Evidence.** Turns per person: Sharon 1, Daniel 1, Marco 1, Matthew 1, Chloe Walker 1, Joby 1, Xiaoyu 1, Gary 2, Jack Thornton 2. Two promises are broken by the engine, not by the characters:
- Aisha texts "ill ring you after 9". Her plan is "marking until 21:00, then chilling". Her last turn is at 19:08, so she never rings.
- Imran's plan step "17:30-19:00: ring Mum, eat" starts with no turn. His last turn is at 14:15, so he never rings, after telling his mum "Ring you after the news."

**Cause.** `startStep` gives a turn at a step boundary only if `s.ping` is set, meaning something new is waiting (line 266). Plans may run 16-20 hours (lines 249-252), so one plan can cover the whole window. A plan step cannot hold "ring X": `action` goes to the world role as an errand, and `call` means *now*. The audit brief's HOW text says people get a turn "between activities". That is true only when news is waiting, so the brief misdescribes the engine to the auditing model.

**AI-first fix.** Give the person a turn at the start of each step of their own plan, news or not. The person's model decides, and "keep_plan" is a cheap answer. Code only schedules it. The person already chooses the step lengths, so the person controls how often they reconsider. The cost is well inside the backstop (cafe used 7 of 360). This also covers the "elsewhere" black hole: Jack's 13:00-17:30 pub afternoon happens entirely offstage, with no phone and no turn, and he then invents "wandered about with the lads".

### 3. Background people have no presence and no initiative, and household members are pinned to the person's bedroom (all runs)
**Evidence.**
- Gary's turn at 06:00 shows `HERE: Karen Whitfield, Callum Whitfield`: his 23-year-old son lives in his parents' bedroom. Jack Thornton's three housemates live in Jack's bedroom, and Ellie's four live in hers.
- Gary works the till 09:20-17:00 with no customer, no supplier, no regular and not one turn. Maureen is pinned to "Café front", but arriving there wakes nobody.
- Sharon never speaks to her husband or daughter all day. Matthew "baths Oliver", Aisha "cooks a massive dinner with Yusuf" and Matteo runs a house of four, all without a line.
- Joby's plan says "walk to work, chat to anyone on the street" while Doreen and Tony are pinned to that street. Nothing happens.
- No contact ever gets in touch first: every inbound message in all five runs is a reply.

**Cause.**
- Household members are added as contacts placed at `homeOf(person)`, the first private room the person can enter (lines 101, 106), and they never move.
- Contacts with a `place` are present there 24/7 (line 280).
- Arrival wakes a person only for simulated people (lines 267-268).
- Background characters speak only when a person addresses them (lines 220, 343).
- Outside contacts act only through `A.events`, and none were supplied (lines 124-128, 273). The world role is told "never start new storylines" (line 360).

Most of what real people say in 12 hours is to the people they live with, work with or keep in touch with. The engine models that only when those people happen to be simulated.

**AI-first fix.** Code owns where background people live (their home building's shared rooms, not the person's bedroom) and who belongs where. The judgment goes to the world role, which already voices background characters:
- When a person starts a step at a place, the world role decides who of the background is around, given the time and what the person is doing (a regular at 10:00, a delivery at 11:00, Darren in the living room).
- The world role also decides whether one of them says something. If so, a scene starts with that character as the starter, as phone calls already do (line 376).
- In the same call it decides whether any of the person's contacts would get in touch now. It needs each contact's `about` and thread in view.

This is character judgment, the same kind a persona uses when it decides to text. It is not a base rate. **Decision for the user:** confirm that ordinary contact by background characters is not an "event rate" under the data rule. If it is, this gap can only be filled from sourced rates.

### 4. Conversations inflate the clock and hold people hostage (family, flatshare)
**Evidence.** Breakfast takes 112 minutes for 26 lines. Lunch (tinned soup and a scone) takes 160 minutes for 16 lines. Laying the table and serving a pie takes 110 minutes. Per-line `minutes` are mostly 2-5, with 10, 20, 25 and 45 also appearing (calls.jsonl). Andrew planned to leave at 09:00 and left at 10:25. He says the match is "the three o'clock one" and lunch ends at 15:10.

**Cause.** `SAY.minutes` asks for "talk and action together" (line 208). Each line packs an action ("heats the soup, ladles it into bowls"), and the minutes are summed one after another (line 226). Plan steps are suspended for anyone in a scene (line 258).

**AI-first fix.** The judgment stays with the speaker; ask a different question. Ask "how long until anyone speaks again", meaning the talk plus any silence, with actions running alongside rather than adding time. Also show the speaker their overrun as a fact: "your plan had you at the Park from 09:00". Code keeps the clock. Do not cap the minutes.

### 5. Dialogue turns into caricature: signature words, mini-speeches and round-robin turns (family, flatshare)
**Evidence.**
- Julie says "love" in 22 of her 22 lines, at 55 words per line on average.
- Jack says "honestly" in 24 of 27 lines.
- Chloe says "sorry" in 9 of 15 lines.
- Almost every line asks a question, gives an instruction and adds a stage direction.
- Four people workshop one crossword clue for ten lines. "Who's playing?" is asked three times in one evening.

**Cause.**
- The writer is told "no catchphrases" (line 63) but writes word lists anyway ("you say 'love' and 'bless him' naturally"; "lots of 'mate', 'honestly' and 'to be fair'").
- The persona head is resent with every line, so each quirk is re-applied every line.
- The next speaker is whoever spoke least recently and is not done (lines 238-241). This forces everyone to speak in rotation, and nobody can sit out a conversation while staying in the room.

**AI-first fix.**
- The writer describes rhythm and register without quotable words. A quirk should be something the character does sometimes, not on every line.
- The line prompt tells people that most turns in real talk are a few words, and that listening counts as a turn.
- The next speaker is whoever the last line addressed. If nobody was addressed, each person present chooses whether to speak, rather than being drafted by recency.

### 6. Names are chosen blind to ethnicity, and they collapse to prototypes (all runs; detail under Naming)
**Cause.** `shown()` strips ethnicity from the world builder's prompt (lines 58, 87). The sampler's own note says the opposite: "the simulation's world builder names everyone from the full attributes". With only birthplace and religion to go on:
- UK-born minority people get default White British names (Jack Thornton, Daniel Whitaker).
- Birthplace alone picks the wrong community (Joby Mathew).

**AI-first fix.** Show the namer ethnicity. Naming is world building, and players still never see ethnicity. Prototype collapse is covered below.

### 7. The writer is blind to the setting's other people, so it invents contacts that duplicate them (all runs)
**Evidence.**
- Jack's contact "café owner" duplicates Gary. Ellie has a separate "Café manager" and "Coworker on the same shifts". Sharon has a "café colleague".
- Claire's contact "housemate" is "the 33-year-old housemate... he". The 33-year-old housemate is Hannah, a woman.
- Imran's profile says he "knows everyone's name on the street"; he knows nobody.
- Julie's sister is named Karen by the world, while Sophie's aunt (Mum's sister) is named Susan. These are the same person with two names.
- Imran's sister is "Kerry", a name the blind writer put inside the relation field.

**AI-first fix.** The world builder sees everyone. Have it map each writer contact to a simulated person, to a shared background character, or to a new person ("same as"). Code applies the mapping.

### 8. Bedrooms of non-simulated people become public places (cafe, friends, street; code must own)
**Evidence.** Jack Thornton plans "relax @Shared house A - Megan's bedroom", his housemate's room. Every café worker is offered other households' bedrooms in `PLACES`.

**Cause.** Access lists are filtered to simulated names (line 97), so `access: []` reads as "anyone" (line 100).

**Fix.** Access is a hard fact. A place the builder restricted stays restricted even when its occupants are background people.

### 9. Contact threads are cut to their last five lines (family; code must own)
**Evidence.** Jack writes "you're on, see you at 11" (the kickabout was agreed at 11). The mate replies "11?? we said 4 mate".

**Cause.** Threads keep 8 entries, and the world role is shown 5 of them (lines 150, 220, 362). One-message-per-item resolution then turns three texts into a flurry of replies.

**Fix.** Code owns the record: show the contact the whole thread for the window, which is short.

### 10. "Who knows whom" has no level between total stranger and saved number (street; AI-first)
Neighbours of years see each other as "stranger (M, 40s)" (Matteo at the park). The builder should state how well people know each other (by sight, by name, numbers saved), since that is setting judgment. Code keeps the result as a fact.

### Separating one-off model behaviour from engine causes
- Mild stereotyping by the world voice from names alone. Imran's mum says "beta", asks for coriander and onions, and asks "are you eating properly?". The builder gives every foreign-born contact a language-mixing note ("mixes English with family language", "speaks mostly Mandarin", "mixes Italian and English") and gives Doreen "a local accent".
- The writer reproduces one trope across parallel calls: "mum asks if you're eating properly" appears in 6 of 20 profiles.
- The writer's blindness to sex leaks through household relation labels ("husband", "son"). Julie's voice is a stock fussing mum, while Andrew cooking dinner is a counterweight.
- Continuity slips: Chloe eats Hannah's egg pasta, then Claire asks "is that the pesto one?". Sophie claims she hid a flapjack she was never seen to hide.
- Profiles act as scripts. Every listed interest or worry turns up on schedule: Marco's "tide tables", Andrew's crossword and gutters, Julie's knee and Christmas cards, Wei's boiler. This is the HEAD's "small current concerns" read as an agenda. A milder framing ("background, not today's agenda") is worth a try.

---

## Per-run notes

### cafe (1/10)
**What a real Tuesday holds.**
- Jack is in at 08:00 doing prep and the breakfast fry-ups. Gary arrives at 09:30, and they talk about the soup, the grinder and the butter price.
- The lunch rush comes with Maureen at her table, and Dennis makes a delivery that is short on something.
- Gary texts Ellie about Thursday and asks Sharon to swap. Sharon spends her day off texting her sister and Angela.
- Ellie goes to college. Karen texts Gary about tea. At 16:30 Jack goes home on the bus, texting Liam.

**What happened.** Seven persona calls. Gary's only turns are at 06:00 and 17:00. Jack and Gary never share a room: front and kitchen are separate places, and arrival wakes people only in the same room. When Gary finally walks into the kitchen at 17:00, the cook is a stranger and leaves. Sharon makes one decision at 06:00 that runs to 22:30.

**Causes:** 1, 2, 3, 8. **Breakers:** a café with no customers; "stranger (M, 20s)"; a 23-year-old son living in his parents' bedroom.

### family (5/10)
**What rings true:** Jack fixes the kickabout and pub by text, Andrew buys a pound of lean mince, Julie gets cheddar for the scones, and Sophie's "today's about average" is well judged.

**What a real Saturday holds that is missing:** someone in a mood, a row about the bathroom, Jack's assignment ignored, Julie's sister ringing. The pub at 16:00 happens offstage with no phone.

**Problems:** Julie's "love" in every line; a 112-minute breakfast and a 160-minute lunch; four people on one crossword clue; total harmony despite Sophie's "defensive when people fuss" meeting Julie's constant fussing; the contact shown as "best mate", called "Dan" by Jack and named "Callum" by the world.

**Causes:** 4, 5, 1 (names), 2 (the afternoon offstage).

### flatshare (4/10)
**What rings true:** the yellow-sticker shop, the fridge-raid carbonara, cookies under foil for Daniel, and Claire's early weekend start.

**What a real Friday 16:00-04:00 holds:**
- At 22, Chloe is likely out, or messaging course friends about going out.
- Hannah texts a friend or goes to the pub.
- A housemate group chat ("anyone need anything from the shop?").
- Daniel comes in at 23:45, eats the cookies, and maybe wakes someone or chats with whoever is still up.

**What happened:** zero messages in 12 hours, everyone in bed by 23:00, and Daniel with one decision. He came home to an empty kitchen and went to bed.

**Causes:** 2, 3 (no contact initiative), 5 (Chloe's "sorry").

### friends (1/10)
**What a real Thursday evening holds:**
- The group chat lights up about the "weekend get-together" from Matthew's own profile.
- Aisha rings Farah after 9.
- Marco shares a link.
- Chloe replies "will reply properly later".

**What happened:** the friends have no numbers for each other (cause 1), so only Aisha and one contact exchange texts. Aisha's promised call dies at the 21:00 step boundary (cause 2). Matthew, Marco and Chloe make one decision each.

### street (2/10)
**What a real Sunday on an inner-city street holds:**
- Joby says hello at the gate on his way to work and stops for twenty minutes.
- Wei puts the bins out or knocks about a parcel.
- Matteo and Imran nod at each other in the park.
- Imran rings his mum in the evening.

**What happened:** one 9-minute bedroom chat. Matteo sees "stranger (M, 40s)" in the park and walks on (cause 10). Joby starts his shift two hours late unnoticed (cause 1). Imran never rings his mum (cause 2).

---

## Sampler and naming: what is implausible

**Naming** (cause 6, plus prototype collapse):
- **Jack Thornton**: Other Asian, England-born, Christian.
- **Daniel Whitaker** (and his mum "Julie Whitaker"): Black African, England-born.

  Both are default White British names, because the namer never saw ethnicity.
- **Joby Mathew**: Pakistani, Christian. Joby Mathew is a Kerala Christian name, so birthplace "Southern Asia" plus Christian picked the wrong community.
- **Marco Conti**: Black African, born in the EU. The name is wholly Italian. It is possible, but it was chosen on birthplace alone.
- **Prototype collapse across runs, all with one seed:**
  - Identical full names in two runs: "Hannah Doyle" (cafe housemate and friends contact).
  - The surname "Whitfield" in three runs (cafe, family, street contact).
  - First names repeating across runs: Jack ×2, Chloe ×3, Hannah ×3, Callum ×3, Julie ×3, Karen ×2, Tracey ×3, Megan ×2.
  - Italian surnames from the top of the list: Rossi, Ferrari, Conti, Bianchi, Moretti.
  - "Wei Zhang".

  Model naming has no randomness. AI-first option: the namer proposes a few fitting names per person and code picks one with the seeded `rnd`. The model keeps the judgment of what fits, and code adds only the variance.
- The writer's contacts can smuggle names past the blindness ("Sister Kerry" for a Pakistani-born Muslim's sister). Ask the writer for relations only, or let the builder rename.

**Sampler:**
1. **The café rota is incoherent.**
   - Shifts are drawn independently per person (`SET.cafe`, `mkShifts`).
   - Tuesday: the cook starts at 08:00 but nobody is front of house until 09:30.
   - Saturday: only the cook works, and the owner is off.
   - Thursday: all four work.

   Who covers which day is a rota, a design or judgment question, not data. Either the sampler builds the rota against a café opening-hours design parameter, or the world builder (which sees all staff and their sampled hours) assigns days.
2. **Sharers' ages are drawn independently** (`build('shared')`):
   - An 18-year-old student lives with housemates aged 35, 44, 46 and 59 in an owner-occupied house.
   - A 23-year-old cook lives with housemates aged 20, 35 and 54.

   Age clustering among sharers is unsourced. Independence is itself an unflagged assumption. List it under `unspecified` or find a source (EHS sharer tables).
3. **Both Whitfield parents are "retired" at 52 and 54**, in a household of four adults with no earner. Activity is drawn per person from the 50-64 Census band, applied uniformly within the band, so early retirement is overstated at the bottom of the band. Activity is also independent between partners. Flag both.
4. **Wei** has been in the UK 3 years, earns £24k as an administrator, and owns a 3-bed with a mortgage. Tenure is not conditioned on years in the UK or on income; a source may exist (Census tenure by year of arrival).
5. **Pay for the self-employed.** Marco is a self-employed consultant, and Gary is the café owner on £24.87/h with "paid_hours". ASHE employee pay is applied to the self-employed. This is already listed as unspecified, but the profiles present the figures as fact.

---

## The audit workflow itself (user requirement: the audit should always consider an AI-first solution)
- `audit-v3.js` meets the requirement. `AI_FIRST` is in both the per-run and the comparison prompts. Every issue has an `ai_first` field, and the comparison adds `code_must_own`.
- **The `HOW` text misdescribes the engine** ("they get a turn... between activities"; code does this only when news is waiting). An auditor that trusts it will miss cause 2. Correct it.
- **The audit cannot see the facts that reveal cause 1.**
  - `audit-args.cjs` sends no world-builder structure: no know-whom, workplaces, contact links, places or access.
  - It sends no per-person turn counts.
  - An LLM auditor sees only "stranger (M, 20s)" and an empty transcript.

  Add `world.know_each_other`, `places`, `contacts`, `calendar` places and `stats.byFor` to each run's arguments. These are facts, not judgment, so code should pass them.

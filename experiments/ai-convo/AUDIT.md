# Audit brief (engine v3)

Give this file to an Opus agent together with the round folder, `rounds/<round>/`. There is one subfolder per run. The agent writes `rounds/<round>/audit.md`.

## Files in each run folder
- `transcript.md`: everything said and done, in time order. This includes background presence (`.` lines).
- `memories.txt`: each person's turns: why they got the turn, where they were, what they chose to remember, and their plan.
- `world-decisions.txt`: every world-role decision, with the item it answered and its reason.
- `world.json`: the hard facts.
  - `people`: attributes, temperament, profile, speech and contacts.
  - `names`: the namer's sets and the one picked.
  - `places`: name, building and access.
  - `workplace`
  - `contacts`: who is linked to whom, home building and usual place.
  - `knows_at_start` and `knows_at_end`: who knows whom by name, by sight, and with numbers saved.
- `run.json`: the args, and stats including turns per person (`stats.turns`) and calls by who (`stats.byFor`).
- `calendar.json`: sampled shifts placed at workplaces, plus anything people arranged.
- `log.jsonl`, `calls.jsonl`, `heads.json`: every event, and every model call with its prompt and result. Persona prompts are stored as a head key plus a body.
- `engine-v3.js` (in the experiment folder) is the code. Cite line numbers.

## How the engine works (check this against the code rather than trusting it)
- **People.** People and households come from a census-based sampler, with no names.
  - A namer sees the full attributes and offers three complete sets of names; the seed picks one.
  - A character writer, blind to name, sex, ethnicity, birthplace and religion, writes each profile, speech and texting style, and the relations of each person's contacts.
  - A world builder (no ethnicity) writes:
    - places, with buildings (earshot) and access (who may enter);
    - workplaces and the group chats people already have;
    - shared background people, with usual places and hours;
    - how well people know each other.

    It also maps the writer's contacts onto real people.
- **Turns.** Each person plans their own next hours as steps. For each step they choose how many minutes until they would next look up. A person gets a full turn:
  - at every look-up, whether or not anything is new;
  - at the start of every step, and on waking;
  - when they walk into a room where someone is, or where a conversation is going on;
  - after every conversation.

  News (texts, results, people arriving) waits in their journal, marked NEW, until that turn.
- **Memory.** Every call shows the person their own journal, verbatim. They condense each conversation and each day in their own words when it ends.
- **The world role.**
  - Whenever someone starts a step, it decides who of the background is around, whether one of them starts talking, and whether any contact gets in touch. It is shown where it already placed people.
  - It also resolves errands, texts to contacts and sourced events, each with a reason.
- **Conversations.**
  - They run inside the clock, line by line, between the people who started them. Others in the room are told a conversation is going on, and join only if they choose to talk to someone in it.
  - A person can say something, stay quiet, step back to what they were doing while staying in the room, call someone over, or leave.
  - A person can also text, ring or run an errand from inside the conversation; those go through the same pipes as in a turn.
  - The person spoken to answers; otherwise anyone may speak. When several want to speak at once, one gets in, and the others are logged as `unheard`. The talk ends when nobody speaks.
- **Data.** Shifts come from the sampler, and event rates only from cited sources. Money is not tracked.

## What to do
1. **Read each run as a sceptical reader from that setting.** First imagine what a real stretch like this would contain for these people, then compare. Score each run 1-10.
2. **Look for stereotyping**, both in how people are written and in how others treat them, including in names.
3. **For every problem, find the mechanism that produces it** and check it against the logs and the code. Cite the evidence, and keep causes separate from symptoms and from one-off model behaviour.
4. **For every cause, consider first whether an AI-first fix would solve it.** That means giving the judgment to a person's or role's model, with the facts it needs in view, rather than adding code rules or machinery. Code should own only hard facts: the clock, places, who knows whom, sourced data and logs. Say which, and why.
5. **Never propose guessed real-world figures.** A rate or statistic needs a source, or it stays unspecified.
6. **Then compare the runs.** Rank engine causes by how much they hurt realism across runs, and note what works. Give an overall score.

# open-chat

Claude agents (Haiku by default) chatting freely, with almost no instructions. Everything for it lives in this folder. It needs Node 22+ and the `claude` CLI, signed in. No API key is needed.

## Run a conversation
From this folder:

```
node run.mjs                          # 4 people (Maya, Tom, Jo, Sam), open chat, up to 120 messages
TOPIC="..." node run.mjs              # Maya has this on her mind and opens with it
PEOPLE=6 node run.mjs                 # 2-8 people (then Priya, Dan, Ellie, Kofi)
MODEL=sonnet node run.mjs             # default haiku
ORACLE=1 node run.mjs                 # agents can write "@claude ..." to ask Claude, which searches the web and reads pages (ORACLE_MODEL, default sonnet); the answer goes only to the asker, as "(Claude replied to you:)" at their next check-in
REACT=0 node run.mjs                   # reactions are on by default (agents reply "REACT 👍" to put an emoji on the latest message from someone else; no notification); 0 turns them off
PRIVATE=0 node run.mjs                  # private lines are on by default: a shared setting (where everyone lives, how they know each other, what everyone already knows about each other and, if the brief implies earlier contact, what they last talked about) plus one generated line per person about their life this week ("What's going on with you at the moment: ...") and their usual sleeping hours, made in one call at the start (secret-holders get one too; it does not restate the secret) and fixed as the person's identity (where they live, their occupation); then, whenever at least 6 in-story hours have passed since a person's last refresh, what has happened to them since is generated and shown at their next check-in as "Since you last looked: ...". PRIVATE=0 turns it off
EFFORT=default node run.mjs              # omit the --effort flag (default is low) to compare
GEN_ONLY=1 node run.mjs                  # only generate the setting and lines, write the run folder, exit
LINES_FROM=runs/<folder> node run.mjs    # reuse that run's setting and day-0 lines (arms of one seed share a world)
SECRETS='{"Tom":"..."}' node run.mjs  # a private line for chosen people ("Only you know this, at least at first: ...")
START=2026-12-01T19:00 node run.mjs   # in-story start time (default 19:00 today)
DAYS=2 node run.mjs                   # in-story days before the run ends (default 3)
node run.mjs 60 "custom brief"        # message limit, brief override
```

Each run writes `runs/<timestamp>/transcript.txt`, plus `log.jsonl`, which has a row per posted message, per PASS and per reaction (`react`, `to`), plus oracle rows and the end row. Runs take a few minutes, so run them in the background.

### How it works
- **The agents:** each one is a saved `claude -p` session with `--system-prompt` set to "You are <name>." plus the brief. They get no tools (with `WebFetch` they kept trying to look things up and then explained they couldn't), a temp working folder and a fresh config folder. That keeps Claude Code's coding prompt, CLAUDE.md and account details out. The CLI still adds a short environment note, and the system prompt tells them to ignore it. That line is left out of the logs. Calls use `--effort low` (`EFFORT=<level>` overrides it, `EFFORT=default` omits the flag) and `--system-prompt-snapshot off` (hard-coded design settings; the CLI otherwise keeps a session's first system prompt on every resume, so in earlier runs the daily private-line refresh never reached the agents), and replies are capped at 4000 tokens. A turn where the CLI injected its "Output token limit hit" continuation is a failed turn: not posted, logged `{failed: 'continuation'}`, a PASS for scheduling. `CLAUDE_CODE_DISABLE_ATTACHMENTS=1` drops the CLI's per-turn "<total_tokens>…tokens left" reminder; the CLI's SDK identity line, the model-identity line, the date and the environment note's curl/untrusted-file advice cannot be turned off (the first is chosen by the CLI when run non-interactively, the rest are hard-coded in it). Each run keeps its temp config folder, and the first log row `{config_dir}` names it (the CLI's session files show what the models saw).
- **Clock:** there are no turns and no rounds. Each agent has its own next check-in time, and the loop takes the earliest pending event (a check-in, a message finishing being typed, an `@claude` answer arriving) and moves the in-story clock to it. At a check-in the agent sees its phone, the time and when it last looked ("(Jo's phone, Wed 17:03. You last looked Wed 12:10.)"), any "Since you last looked: ..." life events, then the phone screen: the 6 messages before the new ones, a "(new)" line, and what is new, with its own messages marked "(you)" (the whole chat on its first look). Its reply is posted when finished: check-in time + time to read the new messages (238 words/min, Brysbaert 2019, non-fiction) + time to type it. Each agent's phone typing speed is drawn once from a normal with mean 36.17 and SD 13.22 words/min (Palin et al., MobileHCI 2019; a copy-typing task), floored at 10 (a design choice). A reply with blank lines becomes several messages, each posted after its own typing time (a part ending with `:`, a list, or a lone `---` stays joined with its neighbouring part). Messages that arrive while someone types are seen at their next check-in, so replies can cross, and anyone can post twice in a row.
- **Check-ins:** whenever a message posts (Claude's answers too), an agent with nothing unread gets one check-in after a log-normal delay (median 6.15 min, a quarter within 60 s; Pielot et al., CHI 2014) drawn at the first unread message; later messages don't reschedule it. An agent mid-reply is notified once it has posted, if something is unread. Claude's private answer also counts as unread for the asker.
- **Seeing messages while typing:** just before a reply's first message posts, if others posted since the check-in, the agent is forked once more and shown the phone screen with them, followed by its unsent draft under a header like the others ("— Tom (you, not sent yet)"), and answers `SEND` (post the draft unchanged), `PASS` (send nothing) or a message to send instead (the prompt ends: "Your message isn't sent yet. SEND sends it, PASS deletes it, or type what you send instead."). The separate menu is kept: without `SEND` an unchanged draft would have to be retyped. Every draft is re-checked when something crossed; spotting that a crossed message is not a reply to the same thing would need another model call, so it isn't done. That answer replaces the draft; a changed one is typed again, a `SEND` posts on schedule. The re-check fork becomes the agent's session. The log row has `draft` and `recheck`; a dropped draft is a PASS row with `draft`. Spontaneous check-ins with nothing new (so someone can open a new conversation the next day) come 30 to 600 minutes after a PASS or a finished reply (unsourced design parameter). Agents don't check in while asleep: the sleep window differs a little per agent (around 22:30-24:00 to 06:00-08:00, unsourced, TODO: source), and a check-in inside it moves to the agent's wake time. Maya opens at the start time; the others first look within the first two hours.
- **Reactions:** on by default (`REACT=0` turns them off): a reply of `REACT` and an emoji attaches to the latest message from someone else, notifies nobody and counts as a PASS. It only counts if that message was first shown at this check-in; a `REACT` with nothing new is logged as a PASS. Others see "(Tom reacted 👍 to your 19:42 message)".
- **Private lines:** one call writes a shared setting and a line per person (agreeing with the setting); the line is the person's fixed day-0 identity, and whenever at least `REFRESH_HOURS` (6, a design parameter) of in-story time have passed since a person's last refresh, one call generates what has happened to them since (no topic or secrets): from the identity, the weekday, date and time, the previous events as background, and everyone's messages since then, asking how the things the person said they'd do went and what is different now. The result opens that check-in's user turn as "Since you last looked: ..." (log row `private_lines: {name: events}`, `day`, `at`), not the system prompt. The generator also gives each person's usual sleeping hours (a night worker sleeps by day); older runs loaded with `LINES_FROM` have none and keep drawn ones. If the generator misses a line, it retries once, then the run fails. `LINES_FROM=<run folder>` loads the setting and day-0 lines from an earlier run's first `private_lines` row so arms of one seed share a world; `GEN_ONLY=1` only generates and exits.
- **Attachments:** a reply line `[file: name.ext]`, `[photo]`, `[photo: what it shows]` or `[link: what it is]` posts as its own attachment message (no real files; log row `attachment: true`).
- **Memory:** every check-in forks the agent's session (`--resume <id> --fork-session`) and the fork is always kept. Nothing is discarded: a PASS stays in its history as "looked and stayed quiet", and every other reply is posted. So no agent remembers saying something nobody saw, and none loses what it read. Older runs differ: before 2026-11-22 17:40 each agent was one long-lived process, and until the event-driven clock unposted replies were thrown away with their forks.
- **Ending:** at `MESSAGES` posted messages (Claude's private answers do not count; replies already being typed still post, no new check-ins start), or when the in-story clock passes the start plus `DAYS` days (default 3). The last row of `log.jsonl` is `{end: 'limit'|'date', at}`.
- **Header comments:** the top of `run.mjs` explains the details.

## Viewer (claude.ai Artifact)
- **`node viewer/build.mjs`** writes `viewer/runs.json`. That holds every run since 2026-11-22 16:37 (`SINCE` in build.mjs; earlier ones were tests).
- **`viewer/index.html`** plays the runs back. Publish it with the Artifact tool:
  - `file_path`: `viewer/index.html`
  - `files`: `{"runs.json": "<absolute path>/viewer/runs.json"}`
  - `capabilities`: `{"comments": {}, "db": {}}`
  - Don't republish after a run: the run reaches the page through the database (below), and a republish reloads every open view back to the top. Republish only when the page itself changes. That publish also folds the database runs into `runs.json`.

### Operating it from a Claude session (the session that publishes the page)
1. **Start requests.** The page's Start button sends this session a comment that begins `START RUN`, with lines `model:`, `people:`, `messages:`, `oracle: yes|no`, `topic: <text or (none)>` and `secrets: <JSON>`. To act on one:
   - Run `run.mjs` in the background with the matching env vars: `MODEL`, `PEOPLE`, `MESSAGES`, `ORACLE=1`, `TOPIC`, `SECRETS`.
   - Reply in the comment thread, then resolve it when the run ends.
2. **Database runs.** The page shows each new run, live and after it ends, from the artifact's database:
   - collection `live_runs`: doc id `<runId>`, run meta plus `status: running|done`
   - collection `live_turns`: doc id `<runId>-<4-digit i>`, fields `{run, i, who, text, at, clock?, oracle?}`

   A run that is also in the published `runs.json` is shown from there.

   While a run goes, watch its `log.jsonl` with a Monitor that checks every second and prints a line whenever the posted count grows, and also when the run process exits. Act on each event straight away, so messages reach the page a few seconds after they are posted (events that pile up while a write is in flight go out together in the next batch). On each event:
   - Run `node viewer/live.mjs <runId> <outDir>`. It writes `run.json` plus one `turn-XXXX.json` for each turn not yet sent, and prints the new turn files.
   - Write them with one `ArtifactData` batch: `set` `live_runs/<runId>` from `run.json`, and `set` each turn into `live_turns`. If a doc already exists, pin the write to its `version`.

   When the run ends, do the same with `done` as the third argument, then rebuild `runs.json` and commit it.

The artifact and its database belong to whoever publishes it. A new account publishes its own copy, and only that session receives its Start requests.

## Judging (eval-prep.mjs)
`node eval-prep.mjs <list> <out dir> [real-text files...]` cuts blind windows of exactly 25 posted messages: A = the run's first 25, B = its last 25 (only if the run has at least 50, so they never overlap). Runs with fewer messages are not padded: `<out>/runs.tsv` records each run's status (dead = 0 messages, short = under 25, A-only, full) and `--tally` prints those counts per arm separately from the scores. Real chat files given after the out dir (blocks `--- Sun 19:41`, first 25 used) are mixed in blind as arm REAL, window `real`.

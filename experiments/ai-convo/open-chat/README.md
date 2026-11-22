# open-chat

Claude agents (Haiku by default) chatting freely, with almost no instructions. Everything for it lives in this folder. It needs Node 22+ and the `claude` CLI, signed in. No API key is needed.

## Run a conversation
From this folder:

```
node run.mjs                          # 4 people (Maya, Tom, Jo, Sam), open chat, up to 120 messages
TOPIC="..." node run.mjs              # Maya has this on her mind and opens with it
PEOPLE=6 node run.mjs                 # 2-8 people (then Priya, Dan, Ellie, Kofi)
MODEL=sonnet node run.mjs             # default haiku
ORACLE=1 node run.mjs                 # agents can write "@claude ..." to ask Claude, which searches the web and reads pages (ORACLE_MODEL, default sonnet)
SECRETS='{"Tom":"..."}' node run.mjs  # a private line for chosen people ("Only you know this, at least at first: ...")
START=2026-12-01T19:00 node run.mjs   # in-story start time (default 19:00 today)
DAYS=2 node run.mjs                   # in-story days before the run ends (default 3)
node run.mjs 60 "custom brief"        # message limit, brief override
```

Each run writes `runs/<timestamp>/transcript.txt`, plus `log.jsonl`, which has a row per posted message and per PASS, plus oracle rows and the end row. Runs take a few minutes, so run them in the background.

### How it works
- **The agents:** each one is a saved `claude -p` session with `--system-prompt` set to "You are <name>." plus the brief. They get one tool, `WebFetch` (so they can open links, like the Claude they ask), a temp working folder and a fresh config folder. That keeps Claude Code's coding prompt, CLAUDE.md and account details out. The CLI still adds a short environment note, and the system prompt tells them to ignore it. That line is left out of the logs.
- **Clock:** there are no turns and no rounds. Each agent has its own next check-in time, and the loop takes the earliest pending event (a check-in, a message finishing being typed, an `@claude` answer arriving) and moves the in-story clock to it. At a check-in the agent sees the time and everything new since it last looked (or the whole chat on its first look). Its reply is posted when finished: check-in time + time to read the new messages (238 words/min, Brysbaert 2019, non-fiction) + time to type it. Each agent's phone typing speed is drawn once from a normal with mean 36.17 and SD 13.22 words/min (Palin et al., MobileHCI 2019; a copy-typing task), floored at 10 (a design choice). A reply with blank lines becomes several messages, each posted after its own typing time. Messages that arrive while someone types are seen at their next check-in, so replies can cross, and anyone can post twice in a row.
- **Check-ins:** whenever a message posts (Claude's answers too), every other agent who is not mid-reply gets a check-in after a log-normal delay (median 6.15 min, a quarter within 60 s; Pielot et al., CHI 2014). An earlier pending check-in is kept, not stacked. An agent mid-reply is notified once it has posted. Spontaneous check-ins with nothing new (so someone can open a new conversation the next day) come 30 to 600 minutes after a PASS or a finished reply (unsourced design parameter). Agents don't check in while asleep: the sleep window differs a little per agent (around 22:30-24:00 to 06:00-08:00, unsourced, TODO: source), and a check-in inside it moves to the agent's wake time. Maya opens at the start time; the others first look within the first two hours.
- **Memory:** every check-in forks the agent's session (`--resume <id> --fork-session`) and the fork is always kept. Nothing is discarded: a PASS stays in its history as "looked and stayed quiet", and every other reply is posted. So no agent remembers saying something nobody saw, and none loses what it read. Older runs differ: before 2026-11-22 17:40 each agent was one long-lived process, and until the event-driven clock unposted replies were thrown away with their forks.
- **Ending:** at `MESSAGES` posted messages (Claude answers count; replies already being typed still post, no new check-ins start), or when the in-story clock passes the start plus `DAYS` days (default 3). The last row of `log.jsonl` is `{end: 'limit'|'date', at}`.
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

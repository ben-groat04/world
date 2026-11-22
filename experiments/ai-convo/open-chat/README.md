# open-chat

Claude agents (Haiku by default) chatting freely, with almost no instructions. Everything for it lives in this folder. It needs Node 22+ and the `claude` CLI, signed in. No API key is needed.

## Run a conversation
From this folder:

```
node run.mjs                          # 4 people (Maya, Tom, Jo, Sam), open chat, up to 120 messages
TOPIC="..." node run.mjs              # Maya has this on her mind and opens with it
PEOPLE=6 node run.mjs                 # 2-8 people (then Priya, Dan, Ellie, Kofi)
MODEL=sonnet node run.mjs             # default haiku
ORACLE=1 node run.mjs                 # agents can write "@oracle ..." to have something looked up (web search)
SECRETS='{"Tom":"..."}' node run.mjs  # a private line for chosen people ("Only you know this, at least at first: ...")
START=2026-12-01T19:00 node run.mjs   # in-story start time (default 19:00 today)
node run.mjs 60 "custom brief"        # message limit, brief override
```

Each run writes `runs/<timestamp>/transcript.txt`, plus `log.jsonl`, which holds every reply, including unsent replies and passes. Runs take a few minutes, so run them in the background.

### How it works
- **The agents:** each one is a long-lived `claude -p` process with `--system-prompt` set to the brief. They get no tools, a temp working folder and a fresh config folder. That keeps Claude Code's coding prompt, CLAUDE.md and account details out. The CLI still adds a short environment note, and the system prompt tells them to ignore it. That line is left out of the logs.
- **Taking turns:** after each message, everyone else is asked at once whether to reply. If the last message names someone who wants to reply, that person is posted. Otherwise a random person who wants to reply is posted.
- **Passing and ending:** an agent can reply `PASS`. When everyone passes, the in-story clock jumps to the next evening. If everyone passes again, the run ends.
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

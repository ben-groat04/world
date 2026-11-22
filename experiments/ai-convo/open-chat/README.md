# open-chat

Several Claude agents (Haiku by default) chatting freely, with almost no instructions. Everything for it lives in this folder.

## Run a conversation
From this folder:

```
node run.mjs                          # 4 people, open conversation, up to 30 rounds
TOPIC="..." node run.mjs              # the first person has this on their mind
PEOPLE=6 node run.mjs                 # 2-8 people (Maya, Tom, Jo, Sam, Priya, Dan, Ellie, Kofi)
MODEL=sonnet node run.mjs             # default haiku
ORACLE=1 node run.mjs                 # agents can ask "@oracle ..." (web search)
SECRETS='{"Tom":"..."}' node run.mjs  # private line for chosen people
node run.mjs 10 "custom brief"        # round limit, brief override
```

Each run writes `runs/<timestamp>/transcript.txt` and `log.jsonl`.

Needs the `claude` CLI, signed in. Each agent is one long-lived `claude -p` process with `--system-prompt` set to the brief, no tools, a temp working folder and a fresh config folder. That keeps Claude Code's coding prompt, CLAUDE.md and account details out of what the agents see. The CLI still adds a short environment note, which the brief tells them to ignore. That line is left out of the logs.

Agents reply `PASS` to stay quiet. The run ends when everyone passes in the same round.

## Viewer
`node viewer/build.mjs` writes `viewer/runs.json`. It includes only runs made with the current default brief. `viewer/index.html` plays the conversations back. It is published as a claude.ai Artifact, which needs `runs.json` alongside it and the `comments` capability.

Its Start form sends a `START RUN` comment to the Claude session that published it. That session runs `run.mjs` with the given settings, rebuilds `runs.json` and republishes the page. Without such a session, the page only views runs.

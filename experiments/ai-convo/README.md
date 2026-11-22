# ai-convo

This is a social simulation. A few sampled people live their lives as separate AI agents, in person and by text (direct messages and group chats), and every step is logged for audit.

## Current pipeline (engine v3)
- **`sampler/`**: census-based people, households and shifts for five settings: `flatshare`, `family`, `cafe`, `street` and `friends`.
  - Call it as `sample(setting, n, seed)`.
  - Sources are in `data.json` (`sources`, `design`, `unspecified`). Run the tests with `node sampler/test.mjs`.
- **`engine-v3.js`**: the simulation, written as plain JavaScript `simulate(args, host)` with no runtime specifics.
  - **Code keeps the hard facts:** the clock, places and access, who knows whom, the calendar, sourced events, each person's verbatim journal, and the logs.
  - **Models make the judgments:**
    - one agent per person, for turns and conversation lines;
    - a namer, a character writer (blind to identity) and a world builder;
    - a world role for the background and for consequences, with a reason for each decision.
- **`workflow/sim.js`**: a thin Workflow-tool wrapper. `node build.cjs` writes `workflow/dist/sim.js`, which is the file to launch.
- **`save.cjs`**: `node save.cjs <workflow output> <round>` writes `rounds/<round>/<label>/`. The files are described in `AUDIT.md`.
- **`AUDIT.md`**: the brief for the Opus agent that audits a round folder.
- **`test-v3.cjs`**: an offline mock run of `workflow/dist/sim.js` across all settings, with invariant checks. Run it with `node test-v3.cjs`.

## Rounds
`rounds/<round>/<label>/` holds saved runs, and `rounds/<round>/audit.md` holds the audit of that round. `AUDIT-full.md` is a whole-project audit.

## Legacy
- `legacy/v1/`: the first hand-run flatshare.
- `legacy/v2/`: earlier engines and attribute files.

Nothing in the current pipeline uses them.

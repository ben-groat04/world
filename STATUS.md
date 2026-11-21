# Status (paused 2026-11-21)

## Done
- Design: SPEC.md (original), CONTRACT.md, SETTING.md, EMERGENCE.md, ROADMAP.md (master plan + addendum), CALIBRATION.md
- Calibration: sim/data/calibration.js — single UK inner-city composite (95 wards, 16 cities, Census 2021)
- Wave 0 kernel (sim/kernel/**): agenda scheduler, rngFor sub-streams, events w/ cause, commands/replay,
  snapshot/fork, plugin + pack loader, indices; `npm run check` green. ~3,000-3,600 ticks/s on legacy systems.
- Legacy medieval world still runs (sim/systems/*, ui/*) — `node tools/report.js --seed 1 --years 2`; index.html
- W1-A: content/larkfield/** pack + sim/map/** street-graph generator (preview: content/larkfield/preview.html?seed=3)
- W1-G: sim/text/** text engine + content/larkfield/text/** grammars, sim/sifter/** arcs, tools/variety.js
  (gap: grammar pools too small -> repetition; event names guessed, verify vs real registry)
- UI: worker-based app, speed tiers, dock panels, mobile, portraits (ui/**)

## In progress when paused (partial files on disk; resume by relaunching with "continue from disk state")
- W1-H population + pre-history + routine plugin + createLarkfieldWorld (sim/population/**, sim/systems/routine/**,
  sim/larkfield.js, tools/report-larkfield.js, ui/worker.js ?pack=larkfield) — early stage
- W1-B goals/planner/self-model/groups (sim/goals/**, drives.js, goal-templates.js) — early stage

## Next
- W1-C housing/labour/money, W1-D life course/health, W1-E social/comms, W1-F UI for Larkfield
- Then Wave 2 (institutions, off-map city, crime/civic, player + god mode, fork lab, online life), Wave 3 polish
- Orchestration rules: Sonnet agents only; max 2 concurrent agents (user wants usage to climb slowly);
  direct Agent tool rather than Workflow (workflows cap at 2 on this 4-CPU box anyway); poll progress every 5 min.

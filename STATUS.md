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

## Since resume (Larkfield only; medieval world deleted)
- Population/pre-history/routine, goals/planner/groups, housing/labour/money, life/health, social/comms,
  crime/civic, business/high-street — all live in sim/larkfield.js.
- UI: Larkfield-only app (map, Watch/People/Town/God tabs, mobile-first), player mode (newcomer/take-over,
  here-and-now actions, dating, onboarding), god mode (presets + consequences tracker).
- Live private build: https://claude.ai/artifact/UUPZPrk3GWap8RBiwnnqGx (rebuild: esbuild ui/app.js + ui/worker.js
  into scratchpad/pub, concat CSS, republish).
- Principles: PRINCIPLES.md (emergence over fudging; evidence-grounded fixes; forced-vs-emergent reporting).
- Open issues: ISSUES.md. Calibration method: docs/CALIBRATION-METHOD.md.
- Orchestration rules: Sonnet agents only; max 2 concurrent; poll every 10 min with substantive metrics.

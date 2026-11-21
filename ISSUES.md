# Realism issues log (orchestrator review) — fix in the owning package
## Routine / population (W1-H) — from persona traces, seed 1
- Weekends empty: sampled people never leave home on Saturday, incl. extraverts (E0.9). Need weekend outings:
  shopping, visiting family/friends (often off-map), sport, worship, pub/café, nights out OFF-MAP for young segments.
- Screen/gaming over-represented across ages; a 52yo professional gaming much of Saturday; doctor gaming all night
  without sleep. Leisure mix must follow time-use data by age/sex/segment and personality.
- Duplicate meals (cook dinner -> takeaway -> cook dinner again). One evening meal; takeaway replaces cooking.
- Ethnicity x religion sampled near-independently (Indian + Muslim too common). Sample jointly (Census cross-tab or
  conditional shares).
- Off-map ties never visited / no off-map leisure despite ~30% ties off-map.
- Students 4% of adults vs ~10% calibration; employed 64% vs 55%; 0-14 share 20% vs 25%; sleep ~464 vs ~536 min.
## Material (W1-C) — open
- Employed share ~70% vs ~55% target (population generator: too few students/inactive/carers/long-term sick).
- Private rent burden (excl. sharers) 26-31% vs 30-45%; income gini 0.27-0.30 vs 0.30-0.45 (pay dispersion too narrow).
- Snapshot-resume with goals loaded untested; npm run check timed out — check runtime budget.
- Total perf with goals+material ~9-10k ticks/s (target >= 10-12k).
- Seed 1, 1y (21:45 poll): unemployment 10% of active (target ~6%); population fell 557 -> 533 in a year (check
  arrivals vs departures balance); students 4% vs 10%, home/family 3% vs 7%.
## Life/health (W1-D) — open
- (Deprioritised by user: bit-exact determinism not required.) Only ensure save/load restores state sensibly.
- Perf: routine + goals dominate CPU; whole world 7-9k ticks/s. Profile/optimise routine wake + goals weekly scans.
- Housing lacks moveTogether/leaveHome/separate commands (life uses fallbacks) — unify.
- npm run check grep gate fails on sim/goals/selftest.js (Date.now).
- TFR noisy at n~550 (1.0 vs 1.7 across seeds); dementia 65+ 3-11% by seed; no care homes; tests/life missing.
- Newcomers don't regrow ties -> loneliness only relatively calibrated (social package should fix).
## Cleanup (next free slot)
- Delete legacy medieval world: sim/systems/{economy,social,romance,family,health,crime,politics,culture,migration}.js,
  sim/brain.js/actions.js/needs.js/map.js/person.js medieval paths, sim/data medieval content, tools/report.js legacy
  default (make --pack larkfield the default), legacy tests/gates. Keep anything Larkfield imports.
- Relax internal gates: exact determinism/contract tests are optional; keep a fast sanity check instead.

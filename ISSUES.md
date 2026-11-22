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
## Social / comms (W1-E)
- Snapshot-resume: whole-world stateHash after resume diverges from a straight run even with `social:false` (goals/others; checked seed 2, 50+30 days). Social state itself round-trips exactly at the restore point (tests/social).
- Social conversations are sampled (~35-40/day at pop 550) and everything else (contacts, decay) is expected-value accounting; message volume is modelled, not individually simulated. Perf cost ~2.7+0.8 ms/day (see report-social).
## Social/comms (W1-E) — orchestrator review
- Forum replies not matched to post context ("anyone tried the new place?" -> "ring 101 for a crime number").
- Viral posts 21/yr in a 550-person neighbourhood: far too many (should be ~0-1/yr).
- Loneliness flagged 28% of 16-24 and 26% of 65+ (shape right, level too high; ONS 'often/always' ~7% overall,
  ~10% young). Zero-confidant share 2% vs 8-15%. Online-formed ties 4% vs ~11%. Friendship-fade counter broken.
- Odd text: "Dinner at ours tomorrow, 11am". Base 'daily' feed grammar repetitive.
## UI review (orchestrator, screenshot)
- Money inconsistency in inspector: "Monthly income £2,425" vs "net £16,884/yr" for a retiree — one figure wrong (check money.budget vs pop income fields).
- "Retired · retired" duplicated label.
- Map feels static: most people indoors shown only as number badges; consider showing people at windows/doors, gatherings outside pubs/shops, kids playing, more visible street life at Scene speed.
- Kernel daily weather still on old 4x28 seasons (UI remaps) — move weather onto the real calendar.
- tools/ui-test.html stale — delete.

---
## Status after cleanup / calibration pass (latest)
FIXED: legacy medieval world deleted (systems, brain/actions/needs/map/names, legacy tests/tools); report.js defaults to Larkfield; quick `npm run check`;
selftest Date.now; outcome-forcing replaced (loneliness threshold, ASFR renormalisation + band multipliers, forced-notice stay-put chance, goal-move 80% gate;
see docs/CALIBRATION-METHOD.md); duplicate meals; weekend over-packing (outings capped 2 weekday / 3 weekend); viral posts 21/yr -> ~1/yr; 'Dinner ... 11am'
text; forum 'crime number' reply to unrelated posts; population stable over 10y (ratio 0.99-1.03 on seeds 1-3); unemployment converges to ~5-7%; TFR ~1.2-1.3; lonely overall ~6-8%.
REMAINING: perf ~6.5-7.5k ticks/s (target 15k NOT met; cost is spread: routine buildPlan ~23%, wakes ~10/person-day, goals scan/override ~17%, social hourly ~10%);
students 2% vs 10% and employed 64-69% vs 55% (day-1 tables + student turnover; needs a university-intake mechanism); loneliness by age shape wrong
(65+ 24-33% vs ~7%, held-out); friendship-fade counter reads 0; online-formed ties 4% vs 11%; night-shift workers do not always sleep after a shift;
forum replies are tone-pooled, not context matched; housing moveTogether/leaveHome/separate still use life's fallbacks; ethnicity x religion joint sampling not changed;
tests: goals/material/social determinism tests partly stale (3 pre-existing failures: goals world kinds, snapshot-resume determinism, home-unit listing).
## UX / clutter (next free slot) — user priority
- Mobile-first information hierarchy: glanceable essentials, progressive disclosure, collapsible cards ordered by
  relevance, fewer tabs, map decluttering (labels/badges only when zoomed/relevant), notable-only notifications.
## Player/god (W2-D) review
- Newcomer applied for a job and was immediately hired as a senior manager — implausible (qualification/experience,
  competition, interview lag). Labour hiring for player must use the same mechanisms as NPCs.
- Heatwave effects barely cause-linked (tracker shows ~1 event): health/routine/social should respond (heat illness
  in elderly, parks busy, sleep worse, tempers) with causes.
- Player conversations often neutral — talk outcomes need clearer, felt consequences.
- Housing arrivals: export a proper makePerson so player creation uses the real generator (exact age).
- NPCs never ask the player anything naturally (0 requests in 60 days for a taken-over resident); earlier cards were
  injected. NPC goals should target the player like any other tie (favours, invites, borrowing, dates).


---
## Status after round 3 (activity / life course / loneliness / housing commands)
FIXED: day-1 activity by age (+ bug: students without a job became 'unemployed'); one graduation mechanism with course lengths and September ends; student lets and end-of-tenancy for graduates;
night-shift workers sleep after the shift; friendship-fade counter (now ~4/100/yr); forum replies keyed to post topic (`feedreply.<topic>.<tone>`); housing.moveTogether / leaveHome / separate implemented
in housing and life's fallbacks removed; money.budget() returns household AND personal figures (inspector mismatch was household income next to personal net); kernel weather on the real calendar;
goals test (cause coverage now measured on goal.* events); ethnicity x religion documented as joint + household-correlated for arrivals; parents-alive uses cohort survival.
REMAINING / FOR OTHERS:
- UI (ui/host.js `weatherInfo`): delete the legacy 4x28 remap, `w.weather` is now real-calendar ({type,temp,regime}); inspector should show `budget.personNetMonth` next to household `budget.income`.
- Student share: day-1 ~12-13% (census 9.8%), settles ~2-4% after 2-3 y. The map has few student-let units (7 of 259), 16-17s and local 18-year-olds who go to university are only ~4/yr in a 550-person
  neighbourhood, and young adults leave faster than they arrive; a real university area would need more student housing (purpose-built blocks) in the map generator.
- Employed share drifts up to ~65% (students leave, arrivals are working-age); retired/ageing mix keeps it from falling.
- Loneliness (held-out): the age profile improved once double counting was removed, but overall prevalence is dominated by newcomers (arrivals have ~1/3 of settled residents' ties); coordinate with the social/newcomer work, then re-fit `loneThr`.
- Perf 5-8k ticks/s (target 15k) unchanged.
## Experience pass (UX agent)
- Month-start clumping remains in housing (moves/notices/rent letters), money (cost pressure, debt) and health (mental-health episodes): spread by household/person day like labour now is. Feed folds batches into a summary line meanwhile.
- Colleagues do not invite a new hire (workplaces are off-map); gossip about the player is only in Me > reputation.
- Forum replies are tone-pooled rather than topic-matched.
## Orchestrator review of realism round 2
- Students settle at ~3% (vs 10%) because the only source of students is day 1: missing mechanism = annual autumn
  inflow of new students (18-19yo arriving for university into flatshares/student lets, plus local 16-18 staying on),
  and student lets turning over each summer. Ground in HESA/ONS student migration patterns.
- Young (16-24) loneliness 20-27% vs ~10%: newcomers have 1/3 of settled ties — ties at uni/work/flatmates should
  form quickly for young arrivals (freshers, colleagues, flatmates); check evidence on how fast newcomers build ties.
- LONE_THRESHOLD refitted to overall prevalence: borderline — it is a measurement scale constant; keep, but report
  loneliness as tuned-target; held-out = age profile.
- TFR fell to 0.83-1.31 (target ~1.45): find mechanistic cause (partnership formation timing? housing space gate too
  strict? couples leaving before births?).
- Employed 64-67% vs 55% persists over 10y.
## Experience pass review
- Forced: heat-day park trip (20-35% sent) — replace with routine/goal choice responding to heat (evidence on park use).
- Event clumping on the 1st of month (housing moves, money, mental-health) — stagger per person.
- Storyline headline repetition ("split up, fell out over money, fell out") — dedupe beat phrasing.
- Colleagues don't invite new hires.

## Realism round 3 (students, newcomer ties, TFR, employment) - status
- FIXED students: found two real bugs + one missing mechanism. (1) `labour.initPerson` turned every arriving working student into 'employed' (startJob ran before the
  'still a student' test), (2) arriving students were dropped mid-course at a random point and graduated within months, (3) no academic-year cycle. Now: arrivals start a
  new course (first-years 18-20 3y/20% 4y; 21+ mostly 1y taught postgraduates), student houses re-let rooms to the next cohort Aug-Oct (+ small January intake),
  student lets are marketed for September and follow their tenants (unit becomes/stops being a student let), graduates stay in the city 46.5% (HESA graduate mobility) else
  leave when the tenancy ends (Sep-Nov). Students settle ~9.5% (was 3%).
- FIXED newcomer loneliness: contexts that form ties (study, work, shared flat, clubs; `social/context.js`), rate falls as support layers fill. Newcomers now take ~1-2 years to
  integrate (lonely peak in months 3-12). Settled residents had ~0% lonely (day-1 networks are too stable: no tail) so `LONE_THRESHOLD` 1.0 -> 0.75 (measurement constant, refit to overall ~7%).
  Open: young (16-24) still 12-20% vs ONS ~10% (the +0.25 need for <25 is large); settled-resident loneliness has no tail (bereavement/illness drive it only via ties lost).
- TFR: measured wrongly (births / women alive at END x 30; swung 0.7-1.7 with drift) -> now period TFR from woman-year exposure. Mechanism fixes: conception hazard used the live-birth
  rate then 11% miscarried (-11%); ASFR is by age at birth but hazard was by age at conception (shifted births a band older; now age+0.75). Bands 30+ now ~0.95-1.1 x ASFR.
  Still ~1.2: 20-29 band births are 0.4-0.75 x ASFR because only ~25% of women 20-29 are in a cohabiting/married union (student-heavy). Partnership formation in the 20s is the open lever.
- Employed 58-60% (was 64-67%): the excess was students->employed drain. Home/family return-to-work was a flat 2%/month (now 1.2%, x0.6 child <11, x0.35 Pakistani/Bangladeshi: ethnicity-facts-figures 2021 51% of
  women inactive). Remaining 4 pts above 55%: retired share 12% (input age structure), arrivals more employed than day-1 residents (selection by segment tilt).

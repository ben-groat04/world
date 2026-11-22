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
## Crime/civic review (orchestrator)
- Report inconsistent: "recorded ~100/1000/yr ... against calibration 64" but also "22% under calibration" — reconcile
  the metric definitions (per 1000 residents vs per 500; force-wide vs inner-city uplift ~128).
- Recorded totals are a tuned target (outsider attempt rate PARAMS.OUT fitted) — not evidence; per-type mix is emergent.
- Young men under-victimised (in reality 16-24 men have the highest violence victimisation) — mechanism check.
- Violence 31 vs 45/1000; charge/caution 19% vs ~6-12%; sexual offences absent; prisoners stay in routine layer.
- UI must hide crime.domestic (private/sensitive) and surface crime/civic feeds, campaigns, planning, elections.
## Business review (orchestrator)
- Held-out misses: new-business 1y survival 64-76% vs ONS ~92% (too many early failures — check startup capital,
  rent-free/fit-out, founder persistence); void tail >3y almost absent (UK ~1/3 of vacant units); rent/revenue 3-6% vs
  10-15%. 5y survival & vacancy were tuning targets (not evidence). Incumbent margins fitted at day 1 (input).

## Realism round 5 (crime metrics, exposure, outcomes, prison, sexual offences, business held-out, clumping) - status
FIXED: (1) crime report has ONE metric (recorded per 1000 residents/yr, resident as victim, map + night out in the city) vs ONS P3 x1.35 = `CAL_TOTAL` 122/1000 (the old "128 / per 500" lines were wrong); totals are the TUNED target, mix/age emergent.
(2) young-men exposure: residents on a night out (routine `nightout`, off the map) are now exposed in the city centre (hazard per person-hour x drink x same-sex pairing); stranger-victim selection lost its age/sex score weights; nightout x1.35 under 25. 16-24 men now 1.5-1.6x the all-age violence mean (was <1x); 25-34 men still peak (2.6-3.0x): known-conflict (feud) route hits 25-49. Violence+harassment 38-44 vs 44.8 (was 31-35).
(3) outcomes: police-initiated (drugs, public order) separated; per-class positive-outcome/charge split from Home Office YE Mar 2024; residents' offences elsewhere counted apart (`detAway`). Victim-based positive 3.7-5.8% vs 7.7% (small n), police-initiated 25-43% vs ~21%.
(4) prison: custody removes the person from routine (`routine.insert` to off-map 'custody', blocked for other inserts), 40% of the sentence served, job lost, household stress. Very rare (0-43 per 100k vs ~139): n=580.
(5) sexual offences: new `sexual` type (CSEW prevalence ~19/1000 adults, 17% reported, 4.2% charged), `crime.sexual` event tagged private/sensitive, never in `recent()`/feeds, neutral text. UI must hide `crime.sexual` like `crime.domestic`.
(6) business: found a real bug (resident owners kept a fixed-term contract that expired -> "owner retired" closure within months); added founder runway, soft-launch ramp, persistent unit location quality, unit decay, hold-out landlords, redevelopment withholding, turnover-linked rent (RENT_M2 raised ~1.9x). 1y survival 82-94% on seeds 1-2, 69% seed 3 (was 52-68%); rent/revenue 9-11% (was 4-5%); vacant-stock >36m 17/17/2% (was ~0).
(7) month-start clumping: housing, money, health, couple/leaving-home steps now run on each household's/person's own day of the month (day-1 share of events: housing 95% -> 3%, money 99% -> 3%, health 28% -> 4%); heat park trip replaced by temperature/flat-responsive park wish in the routine plan.
EXTRA: civic.query.planning()/campaigns() now carry `bid`/`place`/`sid`; business.start has credit-checked loan, shared unit, and no-premises routes (market stall, pop-up, van, home-based); `business.query.startOptions(pid, unit)`.
OPEN: seed-3 1y survival (69%) - entrants there lose money under high rents; 25-34 male violence over-peak; recorded totals 10-20% under target on some seeds (tuned streams not re-fitted per seed); life.graduate (1 Sept cohort) and matchmaking remain month-start; prison per 100k not reachable at n=580 without more serious-offence routes; under-16 sexual-offence victims not modelled; `tests/material` 'deterministic' and 'calibration bands' still fail (pre-existing).
## Round 5 open (orchestrator)
- 2 old material tests fail (deterministic calibration bands) — fix or replace with tolerant checks.
- Test 7 changed to monthly-summed arrears (justified by staggering) — keep an eye on goalpost drift.
- 25-34 men peak violence (2.6-3x) above 16-24; prison too rare to show at n~580; under-16 sexual victims unmodelled;
  long-term vacancy tail low on some seeds; crime total & vacancy are tuned targets.
## Feel review 2 open
- Sim crash 1 Sep 2034 ('post16' in septemberTransitions): guarded; root cause = arrivals lacking ext.life.
- Pandemic preset: "2 events, 0 people"; library cut similar — consequences must come from health/civic mechanisms.
- Café with customers at 03:30 (venue opening hours vs visits).
- No market-stall business path in UI (side-hustle stopgap). Feed lines still repetitive. Take-over mode under-tested.
## Text (after variety pass) open
- Done (second text pass): storyline premises composed from protagonists/places/causes (sim/sifter/storylines.js), life story paragraph + timeline (ui/lifestory.js), situational thoughts wired into the inspector (ui/describe.js thoughtFor + thoughts3.js), richer activity labels (describe.js activityLabel), host batch lines via the text pack (batch.js), forum replies 0.91 distinct (replies2.js).
- Still open: forum posts 0.85 distinct; the routine's own plain labels are unchanged (richer wording is UI-side only); storyline beat lists still reuse a small verb vocabulary.

## Round 7 (50y realism: stock, TFR, loneliness, violence age, prison) - status
- FIXED: dwelling stock explicit and slow-growing (planning supply no longer scales with residents; ~0.7%/yr; realistic tenure mix of new builds). Population now tracks stock x household size; churn 10-13% in / 10-13% out / 4-7% local movers per year; overcrowding 8-14% (Census 2021 inner London 13-21%).
- FIXED: founding child-desire baseline inconsistent with the fertility reference woman (0.31 vs 0.5). Union prevalence was checked against Census 2021 and found within inner-London range, so union hazards were left alone.
- FIXED: youth loneliness (online-formed ties added); peer-age assortment in violence; per-class custody rates and remand.
- OPEN: TFR is 0.9-1.65 by decade window and seed (n ~ 25-30 births per 5 years; sampling noise +-0.3) and averages ~1.25-1.3, below the ~1.45 target; inner London actual ~1.3-1.4. 0-14 share settles near 15-17%.
- OPEN: out-migration of families is a flat segment probability (MOVE_OUT_P); it should depend on whether a suitably sized affordable home exists locally (ONS internal migration: net outflow of 0-4s and parents 30-44 from London).
- OPEN: on-map stranger-violence pool includes cafes/restaurants/takeaways at any hour; should be dusk/night and licensed premises. 25-34 men still sometimes exceed 16-24 men in single windows (n of 16-24 men ~25).
- OPEN: prison per 100k is 0-110 (tiny ward, 0-2 people); not stable enough to compare with the national ~139-170.
- OPEN: no demolition / loss of dwellings, no HMO conversion changing the unit count.
## Play / God mode pass (UI agent, docs/screenshots/play2-*)
FIXED (UI + sim/player only; outcomes still come from the sim): take-over picker has filters (students, struggling, retired, looking for work, renters) and shows activity/tenure/money; "About you" card (study/work, home, money, income, partner, ties) and tailored "Ways forward";
take-over intro (the newcomer intro was wrong for residents); retired people no longer get a job list or silent never-answered applications (player.apply says so); ask-out no longer says "did not work out": the reason is read from the same inputs life.askOut weighs
(attraction/affinity/familiarity/age gap, odds %); bank/payday/family refusals say why (credit record, income-based limit, already owed); rent refusals show the cash needed; a stall / pop-up / van / home-based business path (business.start solo routes) with costs and risks;
goals grouped by theme with suggestions for your kind of life; groups ranked by how many members you know; "Lately" now lists real events you are part of; money change and warmth change are shown after each action; £NaN/£-359 formatting fixed; 44px tap targets; God mode: time resumes on send,
panel jumps to Consequences, each intervention says when it ends or that it cannot be recalled, and rent shock / police cuts can be reversed (a NEW intervention, the damage stays).
OPEN (needs sim owners):
- business: no query for a player's solo business (stall/home trade) P&L, so the UI can only say "started on X" and money moves monthly; add `business.query.soloOf(pid)` {type, since, lastRev, lastProfit, loan}, and a `business.stopSolo` command.
- business: SOLO costs/margins are not exposed by `startOptions` (label/cost only), so monthly running costs cannot be previewed in numbers.
- health: god Heatwave preset runs in November at 6C (no weather link): heat effects should depend on the weather/season, or the preset should refuse/warn.
- life.askOut returns only {ok,p}: the UI re-derives the odds ingredients from getRel (attraction/affinity/familiarity) in sim/player; better if life returned its own breakdown. No way to ask someone out who you know only a little (tie level gate is in sim/player: lv>=2).
- labour: retired people never return to work (resolveApplications skips them). Fine for 78-year-olds, odd for 56-year-olds with arrears (e.g. Mateusz L.): needs a mechanism (pension-age rule, work after early retirement).
- housing: housing.rentFlat only checks cash >= 60% of rent and charges no deposit: UI says "needs about 60% of a month's rent in hand".
- god: heatwave/pandemic/crime-wave cannot be ended early (no stop command), rates cut / council cuts cannot be reversed without side effects (councilCuts negative pct restores ALL services); add explicit end/undo commands.
- social: `ties()` rows have layer `L` not `lv`; UI code that used `t.lv` on ties() rows was always undefined (only tie(a,b) has `lv`). personChip is fine (uses tie()).

## Orchestrator review of play pass (03:4x)
- Ask-out reasons: UI copies life.askOut weights to name the weakest factor — fragile. Move to sim: askOut should return its term breakdown; UI just displays it. Same for rent deposit (60%) and bank limit text — expose via queries, not duplicated constants.
- Heatwave preset can run at 6°C in November: shocks must be season-relative (Met Office heatwave = 3+ days above local threshold, ~25–28°C) or unavailable out of season.
- After a successful ask-out the Phone tab still shows the dating-app pitch below; collapse it once seeing someone.
- Result cards are wordy for mobile; trim to one line + "more".
- Names: `horn_central_southern` in content/larkfield/names.js pools Eritrean/Ethiopian, Zimbabwean, Sierra Leonean, Congolese etc. names, so first name, surname and birthplace mix ("Mulugeta Bangura", Ethiopian + Sierra Leonean). Split into coherent sub-groups (Horn, East, Southern, Central/West, Sudanese) with names and birthplace drawn together. Audit other broad pools (arab, latin_american, sea_east, balkan_slavic) the same way.
- Feed leftovers (text pass): storyline headlines re-listed every 14 days repeat (0.37 distinct); news headlines 0.31 masked; close pairs business.closed→job_lost, arrears→fallout.

## Round 8 (violence concentration, memory, loneliness cohorts, family out-migration) - status
- FIXED violence victimisation. Cause (measured, seed 1, 8 y): the resident-only pool of ~550 had to absorb ALL recorded violence (calibration ~45/1000), so 16-24 men were victimised at 220-430 per 1000 py (prevalence ~20% a year, vs CSEW 3-5%).
  The "victimisations" metric counted every experienced assault incl. unreported/no-injury (CSEW also counts no-injury violence, so that is right); the real fault was the denominator: ONS recorded crime per head
  includes non-resident victims (commuters, shoppers, visitors) and under-16s, which the sim had no way to represent. Now `PARAMS.visitorShare` of anonymous stranger confrontations on the map hit a non-resident visitor (same age/sex/drink selection),
  night-out exposure of residents cut 5x (`NTE.assault` 0.0030 -> 0.0006), domestic assault frequency cut to 0.006/day with 45% assault share. Result: 16-24 men 3-6% victimised per year (CSEW 3-5%), 50-105 incidents / 1000 py (was 220-430); recorded violence+harassment 16-37 per 1000 residents (calibration 44.8; 30-37 in decades 1-3, then falling).
  Added state dependence (recent victim x(1+3e^(-t/120d))) and victim-offender overlap (x1.6 for offenders): share of incidents experienced by repeat victims 15-36% (CSEW ~54-57%; still low), repeat victims 8-20% of victims.
- FIXED (found while running the tests) a latent household bug: a partner who "moved in" (`life/rels.js`) was never added to `hh.members`, so ~5-10 people per 2 years were alive in a household that did not list them; when it left the area they stayed behind alive in a gone household. Failed `tests/material` test 17 on some seeds.
- MEMORY: no leak found. `longrun.js --expose-gc` now prints the heap after a full GC: 145-250 MB at year 10-50 (linear ~3.5 MB/yr, same as the previous round's ~300 MB at y50). The 700-900 MB "heap" in the earlier table was raw `heapUsed` including uncollected garbage (V8 collects lazily when the limit is far away). Remaining slow growth: `lf.metro` (off-map friends; ~16k records at y25, kept because kin/genealogy index them by position), household records never removed, archived stubs keep `ext`.
- FIXED loneliness drift. Cause: people BORN in the simulation reached 16 with only kin and neighbours (support layers n2 ~10-11 vs ~14.5 for sampled founders) because nothing formed peer ties before 16: 25-43% of the first native cohorts were lonely, founders 1-3%, arrivals 16-26%. 16-24 loneliness therefore rose as founders aged out of the band. Added `school` context ties from age 11 (`social/context.js`); YOUTH_NEED +0.25 -> +0.15. 16-24 lonely now 6-11% in every decade on all 3 seeds (no upward drift).
- PARTLY: family out-migration now depends on supply (`housing.suitableLocal`): out-probability of a household with children x(0.6 + 0.8/(1 + n)), n = vacant, listed, right-size, affordable homes locally. TFR 1.02-1.68 by 10-year window; seed means 1.25 / 1.35 / 1.46 (overall ~1.35, still a little below 1.45); not forced. Sampling noise is large (+-0.3 per window at 25-30 births).
- OPEN: dwelling stock is stochastic (planning refusals): in an earlier run of seed 1 it stayed at 259 for 50 years; in the final runs 273-287 / 379 / 363 at y50. When it stalls, population and children shrink. Flats refusal is driven by objections (civic); a stock that never grows is possible but not plausible for an inner-London ward.
- OPEN: recorded violence per 1000 declines as population grows (seeds 2/3 and 1: ~36 -> 16-27) because the visitor stream is per-ward, not per-resident (correct for visitors, but the resident-based reference rate then drifts).
- OPEN: repeat-victim share of incidents (25-35%) below CSEW (~55%); offender age profile is flat across 16-49 men (ONS: peak 16-24).
- OPEN: tests 4 and 21 were world-state/noise sensitive (a random resident's loan refusal; +-3 moves tolerance); both loosened (see CALIBRATION-METHOD Round 8).


## Round 9 (violence drift, age-graded offending, steady supply, sim-owned explanations, season shocks, names, perf) - status
- FIXED violence drift: (1) stranger harassment indexed `W.living()` with `W.people.size` (archived stubs stay in the map), so its success probability fell from 1.0 to ~0.2 over 40 years; (2) the visitor stream was a fixed per-ward number: it now follows the number of open licensed premises (elasticity 0.4, `PARAMS.nteElast`). Recorded violence+harassment per 1000 residents stays 33-39 to year 30-40 in seeds 1/2 and ends at 26-30 when population has grown 25-30% (visitors are per ward, so a per-resident rate falls with growth). Night-time venues do close over decades in some seeds (7 -> 4): that now lowers visitors, which is plausible.
- FIXED offender age profile mechanism (no age-crime curve on residents): impulse-control and unsupervised-time drivers by age, bonds (job, partner, child), offending peers and priors. Offender prevalence by band 16-24 / 25-34 / 35-49 is 14.6-20.1 / 7.4-11.1 / 4.4-8.8% over 3 seeds and 5 decades. Offence RATES at 35-49 stay noisy (repeat domestic abusers dominate a ~65-man band).
- PARTLY repeat victimisation: lifestyle heterogeneity (self-control, temper, drugs, drink) and concentrated domestic abuse lift the repeat share of incidents from 15-36% to 30-48% (CSEW ~54-57%). Still below target.
- FIXED dwelling stall: steady `conversion` stream (1-4 homes, 0.3%/yr of stock) beside lumpy flat schemes. Dwellings 259 -> 354, 253 -> 367 and 259 -> 413 (seed 3, pop 856) over 50 years (0.65-0.9%/yr). 0-14 share 13.8-21.0% (a few windows just under 14%, TFR 1.08-1.4).
- FIXED sim-owned explanations: ask-out odds/terms (`life.query.askOutOdds`, `life.askOut` result), `housing.query.moveInCash`, `money.query.limits`; ui/play and sim/player no longer copy weights or the 60% / 2.2 constants.
- FIXED season-relative heat: a god heatwave is a temperature shock above the seasonal norm, heat effects follow the resulting temperature (Met Office: 3+ days at 28 C max, 23 C mean here); winter heatwave = "warm spell". Natural hot spells now cause heat effects too. God end commands `health.heatwaveEnd`, `health.pandemicEnd`, `crime.waveEnd` (+ presets with undo); `civic.councilCuts` negative pct reverses only the named service and exactly.
- FIXED name wiring leftovers (arrivals, moves, rels, social context): households keep one naming tradition; off-map partner placeholders keep theirs when they move in.
- PERF: ~6.0k -> 6.8-7.4k ticks/s solo (1 year, pop ~548): allocation removal in the routine planner and wake path.
- FIXED perf slowdown with age (history-sized work). Found by `Profiler` on a year-50 world: (1) `life/util.js metro()` rebuilt a Map of all `lf.metro` (36k records at year 50, grows ~700/yr) on every lookup because the array grew constantly: ~10% of runtime, now an incremental append-only index; (2) per-person loops over `W.people` (labour, business, goals seed/groups, health, routine, social import, player reputation) now iterate `W.living()`; (3) `psOf()` re-imported archived stubs into `soc.ppl` (415 stubs by year 15, thousands by year 50), now returns null for `_arch`; (4) crime `rndHh` indexed `lf.households` (every household ever, ~86% `gone` at year 50) so burglary/domestic picks failed more with age (same class as the Round 9 `people.size` bug): now picks from `liveHh()`; (5) rumour fallback seeds took the first 20 `soc.ppl` keys (the oldest, mostly dead): now living. Audit of other `.size`/`.length`-indexed picks found no further instance. Straight run, seed 1, 2 runs in parallel, 6-month window, ticks/s (pop): before 5.3k (546) / 4.9k (612) / 4.3k (631) / 3.7k (621) at years 1/10/25/50, after 5.1k (561) / 5.4k (558) / 5.9k (593) / 4.5k (629); per-resident throughput at year 50 is ~80-85% of year 1 (was ~80% with noise of +-15% between windows). Heap after GC 75 / 145 / 173 / 218 MB (was 75 / 146 / 186 / 235): the rest is archived stubs (~6 KB each, ~100/yr), `lf.households` (never removed, ids = index), `lf.metro` (ids allocated by array length) and unbounded secret facts; these are out of hot loops but still linear in history. OPEN: compact households/metro (needs id allocation by counter), prune `soc.facts` secrets, slim stubs (drop `ext.rt`/`ext.hl`/`ext.cr`).
- OPEN: late-decade per-resident violence still falls with population growth (visitor stream is per ward and venue-driven, not per resident); decide whether footfall should also follow residents' spending.
- OPEN: repeat-victim share below CSEW; 35-49 offence rates noisy; TFR still 1.1-1.4 (below 1.45 target).
- OPEN (from play pass, still): business solo-trade P&L query, retired people returning to work, `ties()` rows use `L` not `lv`.

## Queued from FEEL-REVIEW-3 (sim numbers) -> Round 10 (details and sources in docs/CALIBRATION-METHOD.md "Round 10")
- FIXED unemployment 0.7% vs 4-8%: I could NOT reproduce 0.7% in the live code (seed 1: 3.7-7.5% over 3 years; the review used a built copy). The live rate was unemployed / (employed + unemployed) over ALL ages 16+ (employed over-65s in the denominator). Now one definition everywhere (`labour.query.unemployment()`, `tools/metrics.js`, `tools/report-material.js`, `tools/longrun.js`, the Town card): ILO, unemployed / economically active, ages 16-64, labelled "Unemployment (ILO)". Seeds 1-3 x 20 y: 4.4-6.1% (ONS inner London roughly 5-7%).
- CHECKED, NOT CHANGED: deaths "3x too low". Observed vs the calibration life table (ONS) by single year of age and sex, SMR 0.78-1.06 over 3 x 20 y (1.13-1.31 in earlier runs; crude 4-7 per 1000 for this young age structure; the reviewer's "5 a year" is the national crude rate for a population with twice the 65+ share). 3-4 deaths in 15-26 months was a feed window, not the town count.
- CHECKED, NOT CHANGED (one display fix): marriages 14.4-14.8 per 1000 unmarried adults (ONS 2023: 18.1 men / 16.4 women), divorces 7.6-9.1 per 1000 married (ONS 2022: 6.7 / 6.6), cohabitation dissolutions 5.0-6.2 per 100 couple-years. "Break-ups far outnumber weddings" was DATING-stage endings (about 16-18 a year, nobody counts these) surfacing as headline events; those under six months now have salience 0.2 (below the news line) and stay in the two people's own stories.
- FIXED pay display: `q.pay` is the hourly rate as a full-time-equivalent figure; income and every display are now rate x paid hours x 52 (`sim/pay.js`). Cleaner at 20 h/week is about GBP 14k a year, not 24-27k; job lists show GBP/hour bands. National Living Wage floor for employees; salaried jobs (SOC 1-3) are paid at most 37.5 h.
- FIXED job switching: regulated jobs (nurse, teacher, social worker, solicitor, electrician, allied health, doctor, dentist, pharmacist) need a held or earned qualification; training paths with real durations (`labour.training` -> `labour.qualified`); skilled trades and management need experience; no hire within about two weeks of looking. Over 3 x 20 y: 0 regulated hires without the credential; median gap from job loss to new job 60 days, none under 15.
- FIXED council tenancies: banded allocation (priority need / emergency / urgent / none) with years-long waits for non-priority adults; borough nominees weighted toward priority households. Over 20 y single non-priority adults got 7-11 of ~131-141 lets (waits >= 3.2 y by rule, up to 15 y); before, any stressed private renter on the list was housed within months.
- PARTLY FIXED rent shock response (mechanism, not shock size): affordability-driven search (up to 25%/month at rent >= 65% of net income), credit limits sized on income after housing costs, failed local search -> leave the area. Measured honestly (seeds 1-3, warm 12 months, 3 months after +100%, control in brackets): rent/income median 0.32 -> 0.64 at once (>50% of net income for 43-49 of ~78 private-rent households, vs 10-14 in control); households in arrears 6, 12, 9 (3, 6, 4); left the area +11, +6, +7 over control; notices unchanged. The ORIGINAL code on seeds 1-2 gave arrears 7, 13 (2, 4) and +7, +5 left: so the headline 3-month arrears/notice response is NOT materially stronger than before. What limits it is liquidity: private renters' median liquid cash is ~GBP 1.9k and ~half the stressed households have enough to cover a few months; arrears (and Ground-8-style notices, 2+ months) follow later (12-month runs: left area +28 vs control, notices +2).
- FIXED feed posting rate: generic local-group chatter is 0.0037 posts per adult per day (about 1.6/day; was ~40) from Ofcom's 49% active posters x ASSUMED 35% in a local group x 10% originating in a week; event posts ~1/day, forum ~1.3/day.
- FIXED arrivals' backstories: `arrivalBiography` (bio.js) for new households, flatmates and partners who move in; `tools/lifecheck.js` now fails an arrival without a "Born" entry (migrants: "Moved to the UK").
- OPEN: dating-stage storylines still dominate partner news for people who do get coverage; "Fun: storylines formulaic"; UX items (speed control, phone sheet over map, People chips, play menu jargon) are untouched.
- OPEN (new): income is not recalibrated after the pay change (salaried people working over 37.5 h no longer earn x1.25); median FT pay and rent burden moved a little (private rent burden 32% -> 29%, target band 30-45%); unemployment ILO 4.4-6.1% (Census-based target 5.6% of 16+).

## FEEL-REVIEW-3: life stories, text and impossible states (text/UI agent)
- FIXED life stories contradicting their dates: day-1 biographies are one timeline (`sim/population/bio.js`); `node tools/lifecheck.js --years 10` validates every resident (baseline 1066 violations over 3 years -> 0 over 10 years on seeds 1-3). Also in `npm test` (3-year run).
- FIXED twins/siblings: same-mother siblings are >= 39 weeks apart or share one birth tick (day-1 and arrivals); runtime twins already shared one `life.birth` event.
- FIXED tenure: `yearsAtAddress` advances monthly (was frozen); story/header/history use the same value.
- FIXED age/health gates: `Groups.fit` (group membership), school-year rule for reception (`schoolYearAge`), no "homework" for babies, no "at school" for under-4s, Talk to a sleeping person refused in `player.talk` and shown as "asleep".
- FIXED era-correct qualifications (O-levels/CSEs before 1988), migrants get their own country's or none; university drop-out no longer graduates.
- FIXED text: per-run punchline memory (`once`, auto for quoted lines) in `sim/text/engine.js`, month tags `<<m=..>>`, venue short refs ("the rec"), a/an by sound, doubled words, 1 reply, slashes (`sim/text/mods.js`, `sim/text/jobs.js`); lint in `tools/variety.js --text` and `tests/text/text.test.js`.
- FIXED money panel (overdraft counted twice; stale "borrowing" flag), "Died" tag shown for people who left town.
- OPEN: generic feed chatter still repeats (about 36% of lines contain a 7+ word sentence seen in the previous 30 game-days; pools are bounded by ~40 posts/day town-wide); more pool growth or a lower posting rate is the next lever. Pay/occupation realism, council tenancies, deaths and unemployment queued above are untouched.

## Larkfield population data contradictions (found via ai-convo round 2 attributes)
- shift_pattern contradicts hours_per_week (e.g. 6×8h evening shifts for 8–17 h/wk students; café owner "Mon–Fri 09:00–17:00").
- Implausible pay: cook £49k after 1 yr in UK.
- "Imam" assigned to a woman (Imam/religious teacher category not gender-aware).
- Severe overcrowding passes silently (4 people in a 1-bed; lone parent + child in 1-bed is plausible, 4 adults+teen is not common).
- Household relation label "grandparent/grandchild" ambiguous.

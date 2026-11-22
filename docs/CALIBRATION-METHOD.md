# Calibration method (no fudging)

Rule: day-1 composition is an INPUT (sampled from census-derived tables). Everything after day 1 must emerge from mechanisms. We tune only
mechanistic parameters (hazards, decay rates, probabilities), each with a real-world meaning, and never clamp, resample or quota an outcome.

## Inputs (not tuned against outcomes)
Age/sex structure, tenure, household types, segments, ethnicity x religion, qualifications, occupation mix (SOC), income bands, activity tables per
segment (`content/larkfield/segments.js`), national age-specific fertility rates (ASFR, `calibration.fertility`), period life table qx
(`calibration.mortality`), pay/benefit/tax rules, rents and house prices. Source: `sim/data/calibration.js`.

## Audit of outcome-forcing (what was found, what was done)
| where | was | now |
|---|---|---|
| health/mental.js loneliness | threshold re-fitted monthly to the 93rd percentile (7% lonely by construction) | score = social plugin's contact-based loneliness (need for company vs support received via real contact, tie quality, household) + isolating circumstances; FIXED reporting threshold `LONE_THRESHOLD`; prevalence and age profile emerge |
| life/fert.js births | ASFR renormalised per age band (`k = n/sum`) x hand-set band multipliers 1.05-1.45 x 1.12 | conception hazard = ASFR(age) x circumstance weight / `FERT_REF` (a fixed reference woman); weights: partnership state, parity, spacing, desire, housing space, money stress, health. TFR emerges (validation) |
| health/mortality.js | life table x frailty renormalised within age/sex bands | KEPT as input baseline hazard (documented: life expectancy is input-driven, not validation). Frailty now also includes loneliness and income deprivation, so who dies and longevity inequality emerge. Band renormalisation remains: it redistributes risk, it does not change the age-sex hazard |
| housing/index.js forced notices | households "stayed put" 14%/55% of the time so evictions happened | every noticed household searches; it is evicted when notice (+2 months extension if actively searching) runs out without a move. Evictions emerge from vacancies, rent ceilings (42% of net), savings and destination rules |
| housing/index.js goal-driven moves | 80% silently dropped when "stable" | a stable household acts on a move wish unless anchored (social tenancy, school-age child, >6 yrs roots) |
| population activity (labour) | none after day 1; unemployment/students emerge from hiring, contract end, graduation, discouragement | unchanged. Day-1 fallback: no occupation found => 'unemployed' (input artefact, converges within ~1 year) |
| money/index.js `visitor_sales`/`owner_draw` | balancing flow keeps on-map businesses solvent | kept: represents trade with visitors/the metropolis (an external boundary flow), not an outcome share |

## Tunable mechanistic parameters
Overridable through `world.settings.tune` (used by `tools/tune.js`) where marked *.
| name | meaning | range |
|---|---|---|
| `fertRef`* (`FERT_REF`) | circumstance weight of the reference woman whose conception hazard equals the national ASFR | 0.1-0.4 |
| `loneThr`* (`LONE_THRESHOLD`) | loneliness score above which someone would answer "often/always lonely" (survey measurement threshold) | 0.3-0.6 |
| housing `moveScale` | multiplier on segment annual move probability (tenure churn) | 0.7-1.3 |
| housing notice hazard `0.0035`/month | landlord notice rate (sale, family use, re-let at higher rent) | 0.002-0.006 |
| re-let multiplier / void months | time units sit empty between tenancies | 1-3 months |
| labour: search success, fixed-term contract length (6-18 months), discouragement 3%/month after 12 months | hiring and attrition | per-month probabilities 0.01-0.3 |
| life: partnership formation/dissolution hazards, divorce/marriage/dating, leaving-home 0.3%/month | life-course events | see `sim/systems/life/*.js` |
| health: incidence per age band, stress decay 0.88/month, treatment/recovery rates | illness / mental-health episodes | see `sim/systems/health/*.js` |
| social: contact gain `GAIN`, tie decay `KEEP[]`, triadic closure 0.4 | tie growth and fade | see `sim/systems/social/ties.js` |

## Tuning targets (loss in `tools/metrics.js` TARGETS)
population ratio ~1.0 over 5 years, employed share ~55%, student ~10%, home/family ~7%, unemployment ~6%, TFR ~1.45 (illustrative), lonely ~7%
(day-1 / early years). Search: `node tools/tune.js --seeds 1,2,3 --years 4 --trials 8 --param fertRef=0.12:0.35 --param loneThr=0.3:0.6`.

## Held-out validation (NEVER tuned; reported separately)
Age profile of moves (`moveLog`), loneliness by age (young/old, `lonelyYoung`/`lonelyOld`), share of ties off-map, divorce timing/duration,
age at first birth, TFR shape by age (ASFR), tenure transitions, evictions per year, rent burden, income gini, causes of death mix, zero-confidant share.
Report them with `node tools/report.js --years 1 --life-years 10`.

## Round 3 changes (day-1 activity, life course, loneliness, instrumentation)
| area | change | grounding |
|---|---|---|
| day-1 activity (`sim/population/activity.js`) | activity drawn by AGE band (inner-city ward table) x bounded segment tilt, instead of the segment head distribution for everyone. Bug fixed: a day-1 student without a part-time job was converted to 'unemployed' (this alone removed most students and inflated unemployment). Also used for arrivals (`housing/arrivals.js`) | ONS Census 2021 TS066 by age; DfE 16-18 participation: ~92% of 16-17s in education/training, 66% of 18s (2023) |
| education life course | one graduation mechanism: courses have a length (3 y, 20% 4 y, set at entry), graduation each September, 4%/yr drop-out; day-1 students start at a uniform point in their course; labour no longer graduates on an age hazard (was 18%/month from 21.5) | HESA/DfE: ~33% of 18-year-olds in HE, 3-year first degrees |
| student housing | units let to students stay student lets (`unit.studentLet`, non-students mostly cannot take them; arrival weight `STUDENT_LET_STICKY`); a student household with nobody studying gives notice at ~10%/month (end of AST) | letting-agent behaviour; HMO licensing |
| loneliness (held-out) | removed double counting: partner (0.3) and household (0.14/person) were added on top of tie supply that already contains them; removed fixed living-alone (0.5) and age>=75 (0.25) isolation constants; the unsupported +0.1 need over 78 removed; `LONE_THRESHOLD` re-fitted 0.42 -> 1.0 to the overall ~7% target because removing the double counted partner/household terms shifted every score up | Victor et al. 2005/ONS 2018: age effect vanishes after widowhood/health/contact; Age UK/ELSA: widowed ~5x as likely 'often lonely'; Carstensen socioemotional selectivity |
| parents alive | Gompertz cohort survival replaces a linear formula (66-year-olds: mother alive ~23%, father ~6%, was 56%/39%) | UK period life tables |
| ethnicity x religion | documented as joint: religion | ethnic group (RM031 shape) | sub-origin override | household correlation (now also for arrivals) | ONS Census 2021 RM031, RM083 |
| night shift | bed time = shift end + commute + 30 min (was 'no bed time', so nobody slept after a shift until the next wake) | NIOSH/CDC: night workers sleep in the morning after the shift |
| weather | kernel daily weather = monthly UK climate Markov chain (regime persistence, wet-day scaling to the monthly rainDays) on the real calendar | Met Office Manchester-like monthly means |
| instrumentation | `fades` counts friend/colleague/neighbour ties with >= 4 contacts that lapse (the old test almost never held, reading 0) | - |
| money query | `budget()` returns household income plus the person's own take-home; the inspector mixed household income with personal annual net | - |

Hand-tuned mechanism constants added this round (all labelled in code): student-let stickiness 40, student notice hazard 0.10/month, course length 3 y (20% 4 y), drop-out 4%/yr,
`LONE_THRESHOLD` 1.0 (measurement threshold, fitted to overall ~7%), parent Gompertz parameters, share of day-1 student units that are student lets 0.8.
Held-out reporting unchanged: loneliness by age (lonelyYoung / lonelyOld), off-map tie share, zero-confidants, divorce, rent burden, gini.
Open: loneliness is dominated by newcomers (recent arrivals hold ~1/3 of the ties of settled residents); the social/newcomer work should fix that before `loneThr` is re-fitted.
Day-1 age structure (input): children per family 1.9->2.1 mean (KID_COUNT), crowding allowed (2 children/bedroom + 1), children's ages bounded by the parent's age (old code raised the parent's age, over-producing 30-44s), under-66 solo households skew 45-64. 10-seed mean now 0-14 23% / 15-29 24% / 30-44 26% / 45-64 18% / 65+ 9.5% vs 25/26/24/21/10 (was 19/24/28.5/19/10).

## Experience-pass mechanisms (hand-set constants, none tuned to a target; all are behavioural parameters)
- Newcomer welcome (social/encounters.js): residents <120 days get +1-2 neighbour attempts/week, need 1 sighting not 2, x2.2 first-words odds (Kasarda & Janowitz 1974: length of residence drives local bonds); a neighbour introduces themselves with p = 0.3 x (0.3 + A + E) x (E_guest + 0.5) per meeting; 70% then plant a "pop round" goal; 5%/meeting a known neighbour asks a small favour of a newcomer.
- Player hiring (player/index.js): interview lag uniform 5-21 days; competition odds = 1/(1 + 0.12 x same-SOC jobseekers); management roles from feeder roles only (x0.03 without, x0.35 same-SOC) via labour LADDER; qualification gate and base 0.4 odds are the NPC ones.
- Heat (consequences/index.js): illness/day = 0.007 x vulnerability (age 85+ 1.0, 75+ 0.7, 65+ 0.35, <5 0.35, x1.4 per condition up to 3, x1.3 alone, x1.4 top floor) x (0.5 + severity); sleep stress 0.02-0.05 for 35% (+30% top floor); home row p = 0.004 x (0.5+N) x (0.5+severity); 20-35% head to a park in the evening. Sources in file header (UKHSA 2022, PHE Heatwave Plan, CCC 2022, Anderson 2001).
- Money rows: p = 0.3 + 0.4 N that a couple/housemates row within 1-9 days of a >=8% rent rise or arrears (Conger 1990). Rent shock now emits one housing.rent_rise per household (cause = shock) and goal pressure rules listen to Larkfield event names.
- Labour monthly review now runs on person-day (id mod 30); on-map vacancy filling 3 rounds/month at 0.15 (was 0.45 once).

## Round 4 (student cycle, newcomer ties, TFR measurement, activity flows)
| area | change | grounding | status |
|---|---|---|---|
| student intake | arrivals start a new course; student rooms/lets re-let Aug-Oct; lets follow tenants | UK academic year; HESA | mechanism |
| graduate stay | `gradStay` 0.465 per graduate | HESA graduate mobility (46.5% stay in region) | hand-set constant from data |
| course length | first-years 18-20: 3y (20% 4y); 21+: 70% 1y taught | HESA entrants | hand-set |
| context ties (`social/context.js`) | study 1.2, shared flat 0.5, work 0.6, club 0.3 new ties/quarter x (0.5+E) x age factor x (1 - support layer fill/13) | first-year cohort: 4.2 course friends by year end (Springer 2020); work/neighbourhood supply friends (Kalmijn, Mollenhorst - recalled) | hand-set rates; saturate at Dunbar 5/15 |
| `LONE_THRESHOLD` | 1.0 -> 0.75 | measurement threshold, refit to overall ~7% (tuned target) | held-out: age profile (young ONS 16-29 9.7%, 70+ 3.7%) |
| TFR | metric = period TFR from woman-year exposure; conception hazard = ASFR/(1-0.11) at age+0.75 | NHS/RCOG miscarriage ~1 in 8; ASFR by age at birth | TFR is HELD-OUT (not tuned) |
| home/family return | 1.2%/month x0.6 child<11 x0.35 Pakistani/Bangladeshi | ethnicity-facts-figures 2021; ONS Families & labour market | hand-set |
Not tuned: employed share (target 55%), student share, TFR (held-out), loneliness age profile (held-out). Only `LONE_THRESHOLD` was refit (overall loneliness).

## Business (high street lifecycle, `sim/systems/business`)
Evidence used (cited in code): ONS Business Demography (1y survival ~92-93%, 5y ~39-40%, accommodation & food ~33%); Local Data Company / BRC vacancy 11-14% (London ~7-10%), ~1/3 of vacant units empty 3y+ (Property Week/LDC);
PwC/LDC openings & closures (net growth: coffee shops, barbers/beauty/nail, vape shops, convenience, discounters, gyms; net decline: banks, betting, pubs); Sage/Toast/ATO cafe benchmarks (COGS ~30%, staff 30-38%, rent 10-15%, net 2-8%);
UK commercial leases (5-yearly upward-only rent reviews, 10y terms); UK Start Up Loans (<=25k, 6%); small business rate relief (100% under RV 12k, taper to 15k, multiplier 49.9p); BBPA/CAMRA (pub closures ~1/day nationally; pubs as anti-loneliness infrastructure).
- **Inputs**: day-1 venue set (map), owner occupations from slot fills, category spending shares (ONS Family Spending proportions, rounded), RENT_M2 (sets rent ~8-12% of day-1 turnover), cost shares, SBRR, loan terms, lease/review cycle.
- **Day-1 input, not an outcome**: each incumbent's off-map catchment (`k`) is sized over three observation months so it starts near a typical margin (mean 7%, sd 5%): an established business exists because it is viable. After that nothing is clamped.
- **Tuned (mechanism parameters)**: SIGMA_Q (idiosyncratic persistent demand quality), MATCH_RATE (entrants per vacant unit-month), loss-tolerance rules (insolvency after >=4 loss months beyond reserve+overdraft; owner gives up after 8+ months). Tuned to the 5-year survival and vacancy band only.
- **Held-out (reported, never tuned)**: 1-year survival, void-duration tail, closure rate of incumbents, mix change, owner-type mix, rent/revenue.

## Round 5 (crime, business held-out, clumping)
**Crime metric (single definition):** recorded offences per 1000 residents per year with a resident as victim (offence on the map or on a night out in the city). Reference = ONS police-recorded crime (P3) urban-force rate x1.35 inner-city factor (input); sum `CAL_TOTAL` 122.4/1000 incl. sexual 3.4 x1.35 (ONS YE Mar 2025). **Tuned target:** the total, via outsider-stream params `PARAMS.OUT` and `PARAMS.NTE` (OUT.damage 100->72, shoplift 90->85, burglary 18->20, NTE.assault 0.0030/person-hour at peak). **Emergent/held-out:** type mix, age-sex victimisation profile (CSEW: 16-24 men highest), repeat victimisation, outcomes, prison, sexual reporting.
| mechanism | grounding | status |
|---|---|---|
| night-time-economy exposure of residents off the map | ONS/CSEW (~1/5 of violence in/around pubs and clubs; stranger violence victims ~2:1 male), nightout x1.35 under 25 | NTE base tuned with the total; `sexPair` 0.47 and `drinkRisk` 0.6 hand-set |
| outcomes by class | Home Office Crime outcomes YE Mar 2024: victim-based 5.5% charged + 2.2% OOC; non-victim 11% + 10%; sexual 4.2%; theft 5.8%; burglary 4.3%; drugs 19+36%; public order 7+9% | `det`/`chg` inputs; aggregate held-out |
| prison | custody off the map, 40% served (SDS40), sentences ~70% 1-9 m / ~30% 1-5 y | rare; held-out per 100k vs ~139 (prisonstudies, Oct 2025) |
| sexual offences | CSEW YE Mar 2025: 3.0% women / 0.7% men; ~1 in 6 report; recorded 3.4/1000 | stream weights tuned to prevalence; recorded/reporting/sex ratio held-out |
**Business additions (hand-set, each from guidance):** founder runway median 5 months of fixed costs (lognormal sd 0.5; resident founders half), soft-launch ramp 60%->100% off-map sales over 8 months, rent-free 4/6 months, give-up needs reserve exhausted in year 1, persistent location quality `qual`, unit condition decay 1.2%/month after 6 empty months (raises fit-out, lowers match), 30% hold-out landlords (0.3%/month concession), 8% of units withheld for redevelopment 2-6 y, rent review/ask >= 0.9 x 11% of turnover, `RENT_M2` 240 -> 460 (rent was 3-6% of turnover). `MATCH_RATE` 0.05 -> 0.075 retuned to vacancy (tuning target). Bug fixed: owner contract. Low-capital routes: SOLO costs GBP 600-9000, loan approval 0.6 (credit-checked). **Held-out (never tuned):** 1y survival, vacant-stock tail (unit-months in units empty >36m), rent/revenue.
**Clumping:** `slotDay(id, dom)` = (id % 28)+1; housing units/households, money households, health people, couple/leaving-home steps processed on their own day of month (rate unchanged: once per calendar month). Heat: park wish x(1+0.15 per C above 20, max 10) x1.25 flats x0.6 age 75+, evening window when >=24 C; god heatwave = +7 C.

## Round 6 (long-run stability, 50-year runs)
`node tools/longrun.js --seed N --years 50 --step 10` prints a decade table (pop, median age, % 65+, % <15, births, deaths, cumulative arrivals/departures/moves, households, unemployment, rent index, vacancy, groups, heap MB, ticks/s, stored people).
| mechanism / constant | grounding | status |
|---|---|---|
| macro anchoring: rent growth 1.4 + 0.9 cpi (mean 3.9%), house prices 3.9 + ... (was rent 3.0 + 0.7 cpi = 5.0%, hpi 2.8%) against wages 4.2% | ONS PIPR / AWE / HPI: private rents track or lag earnings, house prices track earnings with a slowly rising ratio; unanchored 0.8 pt/yr rent-over-wage drift compounds to +50% rent burden in 50y | hand-set means, inputs not targets |
| archive of the departed (`sim/kernel/archive.js`): dead after 1y, emigrants after 7y (boomerang window is 6y) lose relationships/ties/social+goals state; living people drop relationships to them | engineering (unbounded growth), no behaviour change inside the windows | constants are windows, not rates |
| `liveHh`: loops over live households only | engineering | none |
| group split hazard 20%/yr while cohesion < 0.28 (was 25% per meeting) | schisms exist but are rare; the old rate multiplied faith groups 3 -> 51 in 25y | tuned |
| wave contagion along close ties + workmates (0.35 per ill contact, cap 6) | transmission settings household / work / social (SAGE, ONS Covid Infection Survey) | tuned |
Open: TFR/child share (u15 falls 22% -> 12-14%, births ~5/1000 young-adult union formation), ageing +8 pts 65+ over 50y.

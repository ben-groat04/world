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

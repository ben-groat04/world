# ROADMAP: Larkfield, the master plan

> **Orchestrator note (supersedes text below):** the reference place is a single general **UK city inner-urban profile** (composite of English core cities outside London, Census 2021) in `sim/data/calibration.js` / CALIBRATION.md. Any specific numbers quoted below that came from the earlier Hackney draft are superseded by the profile values — always read targets from the calibration file.

Status: drives all work after the stock-take. Supersedes SPEC.md (medieval). Complements SETTING.md (flavour, to be corrected by CALIBRATION.md), EMERGENCE.md (goals/groups design; this roadmap adopts it and constrains it), CONTRACT.md/ARCHITECTURE.md (to be rewritten by Wave 0).

Ground truth at time of writing: sim/ is ~11.4k LOC of a competent medieval-village simulator (utility-AI over 16 actions, 9 big systems). Larkfield and the whole EMERGENCE layer exist only as docs. `sim/data/calibration.js` and CALIBRATION.md HAVE now landed (now a single general UK-city inner-urban profile, Census 2021, every block has `source` + `confidence`). Baseline report: ~2.3k ticks/s at pop 222; 22 PASS / 2 WARN / 3 FAIL. The only `Math.random` hits are in ui/ (godmode.js, inspector.js), not sim/ (verified; still gate it, see 5.2).

---

## 1. Vision (5 bullets)

1. **A typical UK inner-city neighbourhood (~500 residents, ~205 households) that is believable because it is mostly ordinary.** Calibrated to one real place and census year (CALIBRATION.md), driven by pressure fields (housing, money, time, health, ties), dominated by habit and routine. Drama is a rare tail, never a quota.
2. **People who want things and believe things.** Every resident has drives, goals, a shallow planner, a bounded belief store and a small *causal self-model* (a theory of how the world works for people like them, sometimes wrong). Surprise comes from goal conflicts across 500 people under shared scarce resources, not from event templates.
3. **Everything is a structured, caused event.** One append-only event DAG replaces chronicle strings. Stories, biographies, "why did she do that?", arcs, metrics, replays, and diffs between worlds all read it. If something cannot be traced to a cause chain, it is a bug.
4. **Three ways to be in the world, one command language.** Watch (follow-cam, storylines, recaps, lifetime time-lapse), Play (be one resident, acting through the same verbs as NPCs), God/Policy-lab (interventions as replayable commands, forked A/B worlds with divergence reports). Mobile-first UI.
5. **Cheap, local, reproducible, fast.** Zero LLM calls at runtime; fully seeded; save/branch/replay; one lifetime ~1 real hour at default speed, minutes at max; runs in a Web Worker and headless Node. Dependencies: none.

Non-goals: realism of things nobody can see; hand-scripted storylines; a drama quota; ethnicity as a causal driver; porting medieval content.

---

## 2. Core pillars and chosen mechanisms

Conflicts between proposals are resolved here. "Cut" means do not build in Waves 0-3.

### P1. Event DAG (foundation, built once)
`Event {id, t, type, actors[], objects[], place, tags[], cause[], salience, payload}`. Compact storage (typed arrays + string table, payload only when needed); per-person and per-place indices; text rendered only at display time via per-flavour templates (`content/larkfield/text/`). Every intervention/command is a root event. `cause[]` points at event ids and goal/plan ids. Decision traces (ring buffer of ~16 per T0/T1 person; stores the score array already computed, no string building) are linked from `action` events. This single pillar is what the user's acceptance test ("judge plausibility by reading") and the metrics both stand on.

### P2. Pressure fields + habit (the realism spine)
- **Housing**: Unit{building, beds, tenure(social|private|owner|mortgage|shared-own), rent, landlordId, leaseEnd, condition}; Landlord{type: council|housing-assoc|small|corporate, holdings}. Tenure mix from calibration (social 40 / private 32 / owner 25 / shared 3), NOT UK-generic. Sitting-tenant lock-in, rent vs local demand index, section-21-style no-fault eviction, landlord sells block, arrears path, social-housing waiting list with points, overcrowding, sharers, boomerang return to parents. Council/housing-assoc are institutions with budgets.
- **Labour**: Firm/Job/Vacancy; SOC-like occupation mix per calibration (64% SOC 1-3, 20% self-employed, ~1.5% main-income app gig); search/referral via weak ties (about half of jobs); firm birth/death hazard by age and sector; part-time-low-hours as the poverty mechanism; remote fraction; benefits; redundancy; scarring.
- **Money**: double-entry ledger (every transfer has a source and sink; sum of accounts + off-map == constant per day; free invariant). Concave utility of money, debt with interest/arrears, bills, a *scarcity* state (shortens planning horizon, raises discounting; implemented as planner lookahead 2 -> 1 and discount factor shift).
- **Time/attention/energy**: a daily time budget per person calibrated to ONS time-use (`calibration.timeUse`), with fatigue and social-battery as conserved-per-day quantities (cheap: 3 floats). Favours owed and trust are a bounded ledger per tie. These conservation laws create unscripted trade-offs.
- **Habit layer**: each person has a weekly schedule skeleton (work/school/sleep/shop/gym/pub/worship/family) with persistent *specifics*: usual commute route and mode, usual seat/order, the 08:12 bus, a neighbour they nod to for years, a recurring irritation. Most of the day is habit; deviations are the signal. Variety is capped, not maximised.

### P3. Motivation stack (the emergence engine)
Adopt EMERGENCE.md (drives, goal grammar, shallow HTN planner, groups/projects, arcs) with these constraints and additions:
- Brain.js utility AI is retained as the **routine layer** (sleep, eat, commute, work blocks). The planner sits above it and *pushes intents and schedule edits*; it does not micro-manage ticks.
- Content = **affordances** exposed by systems: `affordances(person, ctx) -> [{verb, preconds, effects, cost, tier-resolver}]`. Systems never script outcomes; they expose moves (apply_for_job, sign_lease, ask_out, borrow, invite, report_noise, organise_petition, start_group, post, move_out, call_in_sick, help_neighbour...).
- ~25 verbs at launch (not 60). Rare behaviours (blackmail, sublet_secretly, fraud) exist but have per-person propensities near zero by construction (drawn from heavy-tailed traits), so they stay rare. Realism critique accepted: no universal "interesting people".
- **Bold bet 1a, causal self-models.** Each person holds ~8-12 learned *belief-weights* (e.g. "effort pays", "landlords exploit", "council helps", "people can be trusted", "I'm unlucky", "city is dangerous") updated by biased credit assignment from their own event history and peers (weights nudged by outcomes attributed to self/other/luck per personality). These modulate goal choice and planner method preference. One mechanism yields ambition, learned helplessness, distrust, superstition and ideology; it is transmitted socially (peers, parents) and drifts across cohorts. Cost: 12 floats/person, updated on salient events only.
- **Bold bet 1b, evolving goal templates (bounded).** Goal templates are a grammar of primitives. Once per sim-year, a person with high openness and a recent unmet need may *compose* a new template from two existing methods (e.g. "repair" + "gather neighbours" -> repair cafe). Templates carry fitness (success x adoption); successful ones are imitated through ties; failed ones die. Hard caps: <=1 invention per ~3 people per decade, template pool <=200, every invention logged as an event. Defaults for new worlds come from a seeded base library so day 1 is not empty.
- Regrets/life reviews: cut as an inner-narrative driver (realism critique). Keep only a light "abandoned goal" record used for biography text and a slow value drift; career change and reconciliation must be driven by constraints (money, kids, housing), not narrative.
- Goal completion rates are NOT a target (no empirical band). Reported as an observation only.

### P4. Information, beliefs and communication
- **Beliefs**: `Map<propKey,{val,conf,src,t,hops}>`, cap ~48 per person, evicted by salience; only about people above a familiarity threshold, plus places/firms/landlords. Truth lives in the event log and relationship tables; decisions read beliefs. Rumour engine from social.js is the transport, rewritten onto propositions, with mutation per hop weighted by teller affect (exaggerate/omit/swap). Content mix is mostly benign (moving out, new baby, shop closing, rent hike), scandal as a tail.
- **Channels** with different reach/decay/fidelity: in-person, phone call, group chat, public feed, local forum. Online posts fan out event-driven with capped fan-out (never an O(N) per-tick scan). Screenshots are high fidelity and permanent. Ghosting, pile-ons and dating-app matches are moves over these channels.
- **Speech acts (bold bet 2)**: conversation outputs carry a `stance` and may be *misheard/ambiguous/sarcastic* with seeded probability dependent on channel (text is more ambiguous than voice); utterances are stored as quotable propositions so they can be "quoted back later in an argument". Implemented as a field on the belief write, not a language model.
- **Language engine**: one context-free-grammar templater with slots, tags, weights, per-person idiolect (fillers, punctuation, emoji rate, formality), and n-gram dedup. Renders posts, texts, barks, headlines, chronicle prose, obituaries. All strings live in `content/*/text/`; no inline strings in systems (kills the 95 medieval-string debt).
- **Network model**: Dunbar-ish layers as order-of-magnitude (about 5/15/50/150, not hard caps), tie strength decays without contact, triadic closure, foci (places/groups) as tie-formation sites, homophily, kin. Calibrated to survey stats (62% chat to neighbours monthly in London; 7% chronically lonely; 32% trust neighbours), not Dunbar alone.

### P5. Institutions and business lifecycle
`Org {kind, roles, members, resources(ledger account), rules, leader, history, owner buildings}`. Kinds: employer, landlord company, housing association, council ward, school, GP surgery, pub/cafe/shop, faith/community org, club, tenants' association, parent chat group, volunteer group. They persist beyond individuals (succession), open/rename/pivot/close, hire/lay off, hold meetings/elections, split/merge, decay without volunteers. Buildings and units become mutable (change of use). Group formation comes from goals + events (burglary -> watch group; sale of block -> tenants' association; closed pub -> campaign), never from a lookup table. Closures emit JobLost events which become `get_job` goals. Off-map city supplies chain stores, big landlords, employers.

### P6. Off-map Metropolis (T3)
One aggregate model of ~100k people plus a macro vector {interest rate, house price index, unemployment, inflation, energy, epidemic level, national mood}, a regime-switching process with per-seed draws. Exposes: vacancy/wage pool, housing demand pressure, arrivals/departures sampled *on demand* as named individuals (age/ethnic/class profile from calibration; chain migration via ties; names conditioned on origin from data), services (hospital/A&E, police, court, university, rail), news feed. Couples to rents, mortgages, layoffs, migration, epidemic hazard. Shocks hit renters, gig workers and the young unevenly through mechanisms, not labels.

### P7. Life course, health, mental health
- Demography per calibration: TFR per UK-city profile, mean maternal age ~31, 51% births outside marriage, crude birth ~6-7/yr, ~2 deaths/yr per 500, 33% one-person households, 60% never-married adults, 15.5% moved last year. Births gated by partnership x housing x income x readiness *calibrated jointly* (check completed parity AND age at first birth together; both failed today).
- Partnership: cohabitation, serial partnerships, same-sex couples, dating apps (~11% overall, ~22% of 30-39s; friends/work/chance dominate), assortative mating, divorce hazard.
- Health: chronic-condition latent liabilities with age-onset hazards (CVD, T2D, cancer, dementia, COPD, depression/anxiety, alcohol/drug dependence, MSK, accidents) with a social gradient; stress-vulnerability model for mental health; addiction as a loop; services with wait times. Mortality Gompertz-shaped to `calibration` life table.
- Cohort traits (tech use, attitudes) and parent-to-child transmission of values/drive weights with noise.

### P8. Fidelity model (LOD) and pre-history, the scale bet
Replaces the "T2 statistical people" idea (risk of hollow pop-in) with **spectator-driven fidelity and lazy lives**:
- **T0 Focus** (~30-60): followed/selected/played person, their closest ties, people in visible open arcs, camera-visible people. Full per-encounter belief updates, conversation, detailed schedule and decision traces.
- **T1 Resident** (~450): everyone else in Larkfield. Event-driven agenda (see 3.2), venue-session resolution of encounters, full goals/finances/health at day/week granularity.
- **T3 Off-map**: aggregate (above).
- **Lazy lives (T-L)**: people *not yet needed* (the other ~5,000 of the wider borough, past residents, ancestors, off-map arrivals) are **not simulated**; they are materialised on demand from seed + a sparse anchor-event record (birth, schooling, jobs, partners, moves) with constraint checks against the event log, so clicking any person (or a newcomer's backstory) yields a consistent lifetime at constant cost. Promotion = materialise, then run as T1.
- **Pre-history spin-up**: at world creation, simulate ~40-60 years headlessly (T1 only, coarse tick) from a seeded founding state so day 1 already has depth: lineages, feuds that faded, a closed pub with a story, a "world bible" (street history, local legends, who owns what and why), then hand over at year 0. Pre-history is cached by (seed, content-version) in the snapshot store.
- **Spectator-model fidelity**: a tiny seeded bandit tracks what the viewer follows/lingers on and raises the fidelity budget there (T0 admission, recap priority). It affects *only* compute allocation and display ranking, never sim outcomes (outcome-neutrality is a tested invariant: same event log with the bandit on or off, except decision traces/detail).

### P9. Viewing, playing, god-mode, policy lab
- **Watch**: "Meet the street" onboarding (5 residents drawn by diversity, shown honestly; world not built for drama); follow-cam with a thought line rendered from the decision trace; Mind tab (goals, worries, beliefs incl. wrong ones with an omniscient toggle for dramatic irony); Routine view (daily schedule/time-use, so the mundane is visible); Storylines feed (arc sifter output, ranked, with a "quiet week" state when nothing qualifies); "Previously on Larkfield" recap on return/speed-change; Lifetime time-lapse with life-timeline strip and obituary card; overlays (rent stress, loneliness, who-knows-what rumour spread, group membership); lit windows by occupancy, weather, season palette; ambient audio (optional, muted on mobile).
- **Play**: one resident; same affordance API as NPCs. Autopilot via the normal brain; sim slows/pauses at *decision moments* (a request, a salience spike on you). Choices are generated from relationship state + beliefs (stance chips, not a dialogue tree). "Ripple" panel after actions showing who noticed and who now believes what; delayed consequences surface as "someone found out".
- **God mode / Policy lab (bold bet 3, centre of the product)**: interventions are typed, replayable commands including declarative policy edits (rent cap, minimum wage, school catchment change, new tram stop, landlord sells block, close/open a business, plant a goal/rumour, lottery, heatwave, epidemic wave, tweak macro). Any intervention can be run as an **experiment**: snapshot, fork N seeds (default 8-20) in a worker pool, run N sim-years headless, show effect estimates with confidence intervals for key metrics plus the top divergent stories and a cause tree ("rent cap -> landlord sells -> tenants' group -> ...").
- **Counterfactual curator (replaces the "tension-budget drama manager")**: no in-sim nudging. Optional, display-side, offline-from-the-run: from a snapshot, fork a few seeded branches and *offer* the viewer the branch with the most novel-yet-plausible arc ("show me what might have happened"). Forks are labelled as counterfactuals, never silently substituted. The sim itself has no drama quota.

### P10. Quality of imagination vs quality of data
- **Calibrate trajectories and texture, not only marginals**: life-course sequence analysis (typical job/partner/housing state sequences), time-use diaries, "ordinary-day entropy" caps, person-years with no major event (clear majority).
- **Infrastructure texture** (Wave 3, cheap): bus bunching, queueing at the chemist, broken lift, parking pressure, litter, noise complaints from simple propagation, weather microclimate. These produce the low-grade, plot-free irritations people actually live with.
- **Build-time evolutionary search** (Wave 3): offline novelty-search + plausibility-constraint tuning of drive weights/move propensities against the metrics harness (laptop overnight). Ships frozen parameter files; nothing evolves at runtime.
- **Independent critic** (Wave 3): a discriminator that tries to tell sim life-histories from real panel sequences using only the stylised marginals and transition matrices we can cite; ship gate = it cannot beat chance by more than a set margin. Documented honestly as limited by available public data.

### Explicit cuts and deferrals
- Cut: soft drama manager/tension budget; "arcs per year" and "% of residents with an arc" as success targets; regret-driven midlife swerves; moral-dilemma generators; belief-falsity target bands (tuning knobs only); quirk seeds for everyone (only a minority get a *specific*, usually mundane, trait: a hobby, an allotment, a dog, a long-running irritation); fixed-calendar festivals as drama sources; 16-action player command; T2 statistical agents; generic "UK-like" bands.
- Deferred to Wave 3: norms/reputation drift, objects/places with provenance (only inheritance targets and a handful of tracked heirloom/borrowed objects first), memes/artefacts, platform-as-agent (gig algorithm), full procedural audio, share strings/almanac.

---

## 3. Architecture decisions

### 3.1 Repository layout (target)
```
sim/
  kernel/      clock, scheduler, rng, ids, events, commands, snapshot, lod, util, registry  (OWNER: Kernel)
  model/       schemas + factories: person, household, unit, org, job, relationship, belief (OWNER: Kernel for schemas; fields added via PR)
  goals/       drives, goals, planner, affordance registry, self-model, templates      (OWNER: Goals)
  systems/<x>/ one plugin per folder: housing, labour, money, health, life (family+romance), social (beliefs, channels, network), comms, civic, city (Metropolis), orgs
  index.js     createWorld(contentPack, seed, opts)
content/
  larkfield/   data only: calibration.js (moved/aliased from sim/data), names/, jobs/, buildings/, venues/, text/ (grammar), calendar.js, drives.js, goal-templates.js
  hollowmere/  archived medieval pack (proves the pack boundary; not maintained)
ui/            app shell (existing) + new views
tools/         report.js, check.js, determinism.js, perf.js, variety.js, labs (policy lab runner)
tests/         contract tests, golden hashes
docs/          per-system README (events in/out, affordances, state schema)
```
`sim/data/calibration.js` stays at its path until Wave 1 content pack moves it with a re-export shim so nothing breaks.

### 3.2 Scheduling (event-driven, not ticked)
- Base resolution stays 10-minute ticks for time arithmetic, but **people are not ticked**. Each T0/T1 person has `activity {id, endTick, place}` and sits in a timing wheel (bucketed by tick, ties broken by ascending person id). They run decision code only when: activity ends; an interrupt fires (need threshold, scheduled analytically from decay rates, not polled; message arrival; encounter at a venue; command; macro shock); or an observer promotes them. Target 8-15 decisions per person-day vs 144.
- Movement is a pure function `pos(route, startTick, speed)`; route = hierarchical path on a street/node graph with LRU-bounded cache. Renderer interpolates. **Encounters are resolved per venue-session** (who is in venue V in [t0,t1]), a bounded seeded multi-party roll yields at most K encounters per session with relationship deltas and gossip hops; no spatial scans per tick.
- World clocks: `onHour`, `onDay`, `onWeek`, `onMonth`, `onYear`. Systems register handlers; slow variables (health, wealth, tie decay, norms) run weekly/monthly on staggered buckets (person id mod N).
- No `world.living()` full scans in hot paths. Maintained indices: by venue, household, employer, org, tier, life stage, "needs attention". Systems keep incremental aggregates (counts, sums, histogram-bin Gini) so UI/report reads are O(1).
- Real calendar: 365 days, 12 months, weekdays/weekends, bank holidays, school terms and half-terms, sunrise/sunset by month, weather from a seeded regime model.

### 3.3 State layout and perf rules
- Hot per-person fields (needs, mood, energy, wealth, location node, activity id, wake tick, tier, household id, job id) in struct-of-arrays typed arrays keyed by dense slot id; cold data (biography, relationships, beliefs, traits, self-model) in objects behind the same slot. Dead/emigrated free their slot; record remains in an archive store.
- Relationships: sparse per-person map, ~150 cap with decay eviction. Beliefs capped ~48. Decision traces ring-buffered, scores stored as numbers, no string work at write time. Events are compact records; text at render time.
- Pools for encounter/event scratch objects. Snapshot = JSON of system states + typed arrays as transferables. UI receives **delta snapshots**: T0 + on-screen people at full detail, others as position/colour/activity only (< 200 KB/frame budget).

### 3.4 Determinism
- One root seed; **per-system and per-entity sub-streams** derived by hashing `(worldSeed, streamName, tickOrDayOrPersonId)`. Adding a roll in one system must not change another's stream. LOD materialisation, curator forks and the spectator bandit have their own streams. 
- Ban `Math.random`, `Date.now`, `performance.now` (except in tools/perf), unordered iteration affecting outcomes, and `Map` iteration over mutation-prone collections without sorting in `sim/` and `content/` (grep gate + ESLint-free script in `tools/check.js`). UI may use randomness but never feed it into sim.
- Daily world hash (cheap FNV over key aggregates + random sample of person fields) asserts determinism; snapshot-resume equals straight-through; command-log replay equals original.

### 3.5 Content packs
`content/<pack>/` is data validated against `sim/kernel/schema.js`: names (origin-conditioned), jobs/occupations, building archetypes, venue templates, unit-type mixes, drive weights, goal templates, text grammars, calendar, calibration constants. The sim reads *only* pack data for anything setting-specific. A pack declares `contractVersion`. Hollowmere becomes `content/hollowmere/` best-effort (not maintained) as proof.

### 3.6 Interfaces between packages (frozen in Wave 0; publish stubs day 1)
All in `sim/kernel/`; all JSDoc-typed in `sim/kernel/types.js`.

1. **Event bus** `world.emit(type, {actors, objects, place, tags, cause, salience, payload}) -> eventId`; `world.on(type, handler)` (handlers run after the emitting step, never re-entrantly; order by registration id); `world.events.query({actor, place, type, since, cause})`. Event types are registered in `sim/kernel/event-types.js` with a payload schema and a template key; unknown types throw in dev/test.
2. **Plugin interface** (`sim/systems/<x>/index.js` default export):
   ```
   { name, version, deps:[...],
     init(world, pack), 
     clocks: { hour?, day?, week?, month?, year? },
     on: { EventType: handler },
     affordances(person, ctx) -> Affordance[],       // pure, read-only
     query: { name: fn },                            // read-only API for other systems
     serialize(), deserialize(state, version), migrate(from) }
   ```
   A system never reads or writes another system's state; it calls `world.sys.<other>.query.*` or reacts to events. Violations fail the contract test (state objects are frozen proxies in test mode).
3. **Affordance** `{id, verb, actor, target?, preconds:[Pred], effects:[Effect], cost:{time,money,energy,social}, resolver:{full(world,act), statistical?}, tags}`; `Effect`s are declarative (emit event, ledger transfer, rel delta, belief write, state set via owning system's `apply` command). Cross-system state changes go through `world.cmd(name, args)` which the owning system implements.
4. **Commands** `world.queueCommand({tick, actor|'god'|'player', name, args})`; all player/god/policy actions go through here and are appended to the **command log**; replay = seed + pack id/version + command log.
5. **Snapshot** `world.snapshot() -> {v, tick, systems:{name:{v,state}}, arrays:{...}}`, `World.restore(snap, pack)`. `world.fork(seedSalt?)`.
6. **Ledger** `world.ledger.transfer(from, to, amount, reason, causeEvent)`; accounts for people, households, orgs, council, Metropolis. Only `systems/money` (Ledger owner) writes it; others call transfer.
7. **Person API** (`sim/model/person.js`): read accessors + `world.people.byId`, `world.index.*`. Fields added to a person record must be declared in the schema with owner system; writes only by the owning system or through commands.
8. **Text** `world.text.render(eventOrKey, ctx)`; grammar data in packs. No string literals with names/pronouns in systems.

### 3.7 Rules for parallel agents
- Only the Kernel package edits `sim/kernel/` and `sim/model/` schema files; others request changes via PR with a failing contract test.
- Each package owns its directory exclusively within a wave (tables below). Shared helper needs go to Kernel's `util`.
- No cross-system state access; no new `world.xxx` ad hoc state objects; no strings in systems.
- Every PR passes `npm run check` (determinism, contract, perf gate, grep gate, 5-seed quick report). Never leave the build broken; replacements land only when merged green. The old medieval systems keep running until the replacing system is green; then the old file is deleted in the same PR.
- Each system folder has README.md: events in/out, affordances, state schema, calibration anchors, known simplifications.
- Coordinate with the in-flight perf/UI refactor agents: Wave 0's Kernel package *absorbs* whatever scheduler/index work they land rather than redoing it; before Wave 0 starts, agree who owns `world.js` tick loop and spatial grid.

---

## 4. Build waves

Sizing convention: S = ~1-2 agent-days, M = ~3-5, L = ~1-2 weeks. Perf budgets are for pop 500 headless on one core unless stated; "tick" means one 10-minute sim step on average over a sim-day.

### Wave 0, Foundation (must land first; small, one owner)

#### W0-K: Kernel, harness and interface freeze (size M, then incremental)
- **Owns**: `sim/kernel/**`, `sim/model/**` (schemas only), `sim/index.js`, `tools/check.js`, `tools/determinism.js`, `tools/perf.js`, `tests/**`, `CONTRACT.md`, `ARCHITECTURE.md` (rewrite).
- **Depends on**: agreement with the perf-refactor agent on tick loop ownership.
- **Spec**:
  1. Sub-stream RNG (`rngFor(name, ...keys)`), dense ids, slot allocator, archive store.
  2. Event bus + event type registry + per-person/place/type indices + causal query; chronicle.js becomes a *renderer* with an adapter so old systems' `chron()` calls emit generic events (type `legacy.chron`) until replaced (so UI keeps working during migration).
  3. Scheduler: timing wheel + interrupt queue + world clocks; adapter that keeps the old per-tick brain running until Goals/Routine land (feature flag `sched.mode = 'legacy'|'agenda'`).
  4. Command queue + command log + replay.
  5. Snapshot/restore/fork with per-system registration; migration hook; daily hash.
  6. Plugin loader enforcing the interface (3.6), frozen-proxy contract test mode.
  7. Content-pack loader + schema validator; Larkfield pack skeleton directory with the UK-city calibration profile re-exported.
  8. Maintained indices API (`world.index.byVenue/byHousehold/byOrg/byTier/needsAttention`).
  9. Stubs: `affordances`, `ledger`, `text`, `lod` so other packages can code against them on day 1.
  10. `npm run check`: determinism (same seed twice, per-day hashes for 3 sim-years; snapshot at year 1 then resume == straight-through; replay == original), perf gate, grep gate (Math.random/Date.now in sim/, content/), contract tests, 5-seed quick report, schema validation.
- **Acceptance**: all gates run green on the *existing* medieval world through adapters; headless 5-seed run completes; old UI still loads; 3-year pop-222 run >= 2x current speed after scheduler agenda mode is enabled for the legacy brain (or documented blocker).
- **Perf budget**: kernel overhead <= 5% of tick at pop 500; event emit <= 1 microsecond-class amortised (no string formatting); snapshot of 500 people < 50 ms.
- **Diversity metrics**: n/a (provides event log with `cause` coverage counter).

### Wave 1, Parallel packages (all start after W0-K stubs; E and F may use mock content)

All Wave 1 packages are independent in files and talk only through the frozen interfaces.

#### W1-A: Larkfield world: map, calendar, content pack (size L)
- **Owns**: `content/larkfield/**` (except `text/` grammars owned by W1-G), `sim/systems/city/map*` / `sim/map/**` (new street-graph generator replaces `sim/map.js`), `sim/time.js` replacement (calendar), `sim/names*.js` -> `content/larkfield/names/`.
- **Depends**: W0-K schemas.
- **Spec**:
  - Street/node graph (not 120x90 free tiles): ~6-8 streets, a high street, one park/green, a canal or railway line edge, station/bus stop(s) as off-map links, a primary school, a GP surgery, ~6-10 shops/cafes/pubs/takeaways, a gym, a launderette, a community hall, a place of worship or two, a small business park/workshops, council block(s), purpose-built flats (60% per calibration), terraces (14%), converted houses (15%). Multi-storey, multi-unit buildings with Unit records; interiors abstract (room-count and "inside" tag; people inside are not on the grid).
  - Venue templates with opening hours, capacity, session type (for venue-session encounters), and event slots.
  - Calendar: real 365/12/weekday, bank holidays, school terms, seasons by month, sunrise/sunset table; replaces the 112-day year.
  - Names: origin-conditioned generator from data (ethnicity mix from calibration: White 53 / Black 21 / Asian 10 / Mixed 7 / Other 9; religion mix; born-in-UK 60%), no hardcoded medieval names.
  - Seeded **founding state generator**: age pyramid (0-14 17.9, 15-24 12.7, 25-39 33.6, 40-64 27.8, 65+ 7.9), household composition (33% one-person, 12% sharers, 15.5% lone parent, 13% cohabiting, 20% married...), tenure mix, occupations, kin links, cars (65% none), pets. Outputs a `FoundingState` consumed by the pre-history runner. Must be exact to calibration within sampling tolerance (chi-square p > 0.01 across 20 seeds).
  - Move `sim/data/calibration.js` to `content/larkfield/calibration.js` with re-export shim.
  - Delete `sim/map.js` BUILDING_TYPES/JOBS tables once the world loads on the new map.
- **Acceptance**: world loads in the existing renderer (with tile-art stand-ins) and headless; founding-state distributions match calibration (report section "Founding"); every person has a home unit or is flagged homeless; every unit has a tenure, an owner/landlord; calendar tests (leap years, bank holidays, terms); name diversity plausible with no duplicate full names above 2%.
- **Perf**: map+founding generation < 1.5 s; path queries on the street graph < 50 microseconds amortised with cache; memory cache bounded.
- **Diversity**: founding-state variety across seeds (different building mixes and household layouts; Jaccard of household-composition sets < 0.5 pairwise).

#### W1-B: Goals, planner, drives, self-model (size L)
- **Owns**: `sim/goals/**`, `content/larkfield/drives.js`, `content/larkfield/goal-templates.js`, `sim/brain.js`, `sim/actions.js`, `sim/needs.js` (rewritten into `sim/goals/routine.js`).
- **Depends**: W0-K (scheduler, affordance registry, events); mock affordances until systems land.
- **Spec**:
  - ~10 drives (security/money, housing stability, belonging, intimacy, status/achievement, autonomy, health, meaning/care for others, novelty, rest) with per-person weights from personality/values/cohort + slow-moving state. Drive pressure computed lazily from ledger/housing/health queries on events, not polled.
  - Goal grammar per EMERGENCE.md: `want(state predicate) by deadline, stakes, source drive`. ~40 base goal templates (get_job, change_job, move_out, find_flat, win_back, ask_out, start_family, get_fit, make_friends, support_parent, avoid_X, organise_petition, start_business, repay_debt...).
  - Shallow HTN planner (depth <= 3, branching <= 4, lookahead 1-2 under scarcity) over affordances; plan steps have preconditions checked against *beliefs* (W1-E) not truth; plan failures emit events; replan with backoff.
  - Routine layer: habit schedule skeleton with persisted specifics (route, seat, order, regular slot); habit strength grows with repetition; deviations require pressure.
  - Self-model (12 belief-weights) with biased credit assignment (self/other/luck attribution by personality); transmission by parents/peers; affects goal choice weights and method preference.
  - Goal-template invention (bounded, logged) and social imitation with fitness.
  - Decision traces (ring of 16) holding top-3 alternatives, dominant drives, goal id.
  - Scarcity: stressed people plan shorter, discount more (parameters in `content`).
  - Player-compatible: `getChoices(person)` returns ranked affordance instances with reason strings by template key.
- **Acceptance**: with mock affordances: goals are created/pursued/completed/abandoned with logged causes; planner never selects an affordance whose preconditions fail under the actor's beliefs; per-person day schedule matches time-use bands (sleep 8h56 +- 30 min, free time 3h44 +- 40 min, unpaid housework 2h38 +- 30 min, travel 61 min +- 15) over 20 seeds; most-frequent-5-activities share of person-hours is >= survey share (variety *capped*, not maximised); person-years with no goal change > 6 months at least 40% (mundane life is allowed).
- **Perf**: planner invoked only on goal events: <= 1.5 plans per person-day amortised; total goal layer <= 15% of tick at pop 500; decision trace write <= 200 ns.
- **Diversity**: distinct plan signatures per lifetime; goal-template invention counts (bounded); self-model dispersion between persons (std of weights > 0.15) and correlation with life outcomes (ablation: zero out self-model and confirm outcome dispersion falls).

#### W1-C: Material life: housing, labour, money (size L)
- **Owns**: `sim/systems/housing/**`, `sim/systems/labour/**`, `sim/systems/money/**` (ledger implementation, owns `world.ledger`), replaces `sim/systems/economy.js`, deletes agrarian code.
- **Depends**: W0-K; W1-A founding state and unit schema (can code against schema stubs).
- **Spec**: as P2 Housing/Labour/Money. Rent setting from demand index and condition with tenure lock-in; monthly rent/mortgage/bills; arrears -> notice -> eviction/court (via off-map court service) -> homelessness/sofa-surf/boomerang; landlord sells; refurbishment; social waiting list with points; council tax and benefits taper; wage and hours distributions (full-time median ~GBP 49.5k, part-time median ~GBP 11.8k per calibration); job search/application/referral through ties; firm hazards by age and sector; redundancy; self-employment (20%), app-gig (~1.5% main, ~3% incl. side); remote fraction; debt and interest; credit. Exposes ~12 affordances (apply, accept_offer, quit, negotiate, sign_lease, give_notice, move_out, borrow, repay, claim_benefit, take_gig_shift, cut_spending).
- **Acceptance (calibration)**: tenure split within 3 pp of the UK-city profile; private rent-burden median 30-45% of income (per profile); unemployment 4.5-7%; income Gini 0.30-0.45; wealth Gini 0.55-0.70; moves/yr 12-17% of residents with 20-34s peaking ~30%; evictions/yr in 0-3% of private renters; overcrowding rate documented vs census; money invariant holds every day for 10 years (exact); no person without a home unit unless flagged; ablation: remove rent shocks -> eviction/mobility counts fall; remove referral ties -> job-finding speed drops.
- **Perf**: monthly ledger/bills batch < 5 ms at pop 500; no per-tick work except through events; wage/rent aggregates via incremental histograms.
- **Diversity**: counts of distinct cause chains reaching `Evicted`, `JobLost`, `MovedOut` (>= 5 distinct upstream cause-type paths each over 20 sim-years x 5 seeds); firm lifecycle variety (open/close/rename).

#### W1-D: Life course, health, mental health (size L)
- **Owns**: `sim/systems/life/**` (family + romance + fertility + partnership + leaving home), `sim/systems/health/**`; replaces `family.js`, `romance.js`, `health.js`.
- **Depends**: W0-K; coarse W1-C queries (income, housing) via query API (stubs).
- **Spec**: P7. Partnership formation (friends/work/chance/app channels), cohabitation, marriage (20/1000 unmarried men, 18/1000 women), divorce (~6.7/1000 married), same-sex couples, lone parenthood, step/blended households; fertility with joint calibration; leaving-home and boomerang; death with Gompertz life table; chronic conditions, depression/anxiety with stress load and buffers; addiction loop; GP/A&E off-map via city service waiting times; bereavement and widowhood effects on loneliness and money; inheritance (reuse code) via ledger + Unit transfer commands; cohort and value transmission. Expose affordances: ask_out, move_in_together, propose, break_up, try_for_baby, seek_care, call_in_sick, care_for, attend_funeral, join_support_group.
- **Acceptance (calibration)**, aggregated over >= 10 seeds x 20 years: TFR 1.1-1.6, mean maternal age 29.5-32.5, childlessness documented, births 5-9/yr per 500, deaths 1.5-3.5/yr per 500, e0 M ~79 / F ~83 (+- 2 with small-N caveat reported as pooled), infant mortality < 0.5%, 40% adults in a couple +- 5, 60% never married +- 7, divorce hazard within band, one-person households 28-38%, depression 8-15%/yr, alcohol misuse 4-9%; deprivation gradient in life expectancy >= 4 yrs; ablations (turn off housing stress -> births timing shifts; turn off isolation -> loneliness-health link weakens). The 3 existing FAILs (first birth age, completed fertility, wealth Gini) must pass in the new frame.
- **Perf**: daily health hazard checks by staggered bucket; <= 3% of tick.
- **Diversity**: >= 5 distinct partnership-sequence types per 100 lives; cause-of-death distribution entropy within bounds; "person-years with no major life event" fraction >= 55%.

#### W1-E: Social physics: network, beliefs, channels, moves (size L)
- **Owns**: `sim/systems/social/**` (relationships update rules, network, beliefs, rumours, channels, speech acts, moves), `sim/systems/comms/**` (phone, chat, feed, forum, dating app), replaces `social.js`.
- **Depends**: W0-K (events/affordances); W1-A venues; W1-G text engine (stub).
- **Spec**: P4. Venue-session encounter resolver, tie formation at foci, decay, triadic closure, kin; belief store + transmission with mutation, "don't tell X", lies and detection; channels with fan-out caps and per-channel fidelity; ~20 social moves (greet, chat, invite, favour_ask, lend, apologise, confront, gossip, ghost, break_ties, introduce, comfort, complain_to_landlord, report_noise, join_group, post, comment, DM...) with volition from personality/relationship/beliefs and reason strings; reciprocity ledger; trust and reputation as per-observer beliefs aggregated on read; speech-act ambiguity/mishearing; loneliness metric.
- **Acceptance (calibration)**: share chatting to neighbours monthly 58-66% (London 62%); trust neighbours 28-36%; chronically lonely 5-9% (16-24s higher); close-confidant count mean 3-4 with zero-confidants 8-15%; clustering coefficient 0.1-0.3; degree heavy-tailed; non-kin active-tie churn ~50% / 7 yrs; pub weekly ~14%, never ~11%, non-drinkers ~20%; online-formed ties 11% overall; belief accuracy decays with hop count (reported, not banded); no decision reads ground truth (code audit via contract test); content mix: >= 85% of rumour propositions benign.
- **Perf**: beliefs cap 48, relationships cap 150; encounter sessions <= 10% of tick at pop 500; feed fan-out <= 50 per post; no O(N) per-tick loops (verified by counter in test mode).
- **Diversity**: distinct move types used (no move > 15% of moves); false-belief-driven actions nonzero and < 20% of notable events (observation); rumour mutation rate reported.

#### W1-F: Presentation: UI shell, events renderer, follow/inspect/onboarding, mobile (size L)
- **Owns**: `ui/**` (except new `ui/play/**` and `ui/lab/**` reserved for Wave 2), `index.html`, `style.css`, `tools/portrait-gallery.html`.
- **Depends**: W0-K events API and snapshot-delta format; develops against the legacy medieval world as test data (events + traces are world-agnostic).
- **Spec**: Event-template renderer in the UI worker boundary; delta snapshot protocol; mobile layout (map top ~55%, bottom sheet tabs Feed/Person/Town/God), pinch zoom, 44px hit targets; follow-cam with thought line from decision trace; Person sheet with Mind tab (omniscient toggle), Routine view, life timeline; "Meet the street" onboarding (5 residents, honest selection rationale); recap cards "Previously on Larkfield"; overlay toggles (rent stress, loneliness, rumour spread, groups) using per-system query APIs; lit windows, weather, season palette; portrait expression variants driven by mood; save/load (IndexedDB) on visibilitychange; speed control redesigned (pause, 1 lifetime/hr default, x10, max) + lifetime time-lapse mode with obituary card; PNG export of cards. Never display ground-truth to a character's Mind tab unless omniscient on.
- **Acceptance**: Playwright-style headless smoke (mobile viewport 390x844): loads, follows a person, opens sheet, switches speed; snapshot size < 200 KB/frame; first meaningful paint < 2 s; 60 fps target at 500 people on mid phone (documented); a11y basics (labels, contrast); every action in follow-cam has a renderable thought line (100%).
- **Perf**: render <= 8 ms/frame desktop; worker->UI message <= 200 KB; UI never blocks sim.

#### W1-G: Text engine, arc sifter, metrics and reports (size L)
- **Owns**: `sim/kernel/text/**` *as a Kernel-delegated subfolder owned by G*, `content/larkfield/text/**`, `sim/sifter/**`, `tools/plausibility.js`, `tools/report.js`, `tools/variety.js`, `tools/feel/**`.
- **Depends**: W0-K events; calibration file.
- **Spec**:
  - Grammar engine (CFG + slots + tags + weights; per-person idiolect; n-gram dedup; type-token and repetition measures). Moves *all* inline strings out of existing systems as they are replaced (a codemod `tools/strings-audit.js` lists remaining inline strings per file).
  - **Story sifter**: declarative pattern DSL over the event DAG and belief writes. Initial ~20 patterns: Courtship, Breakup, Eviction chain, Job loss-and-recovery, Business open-to-close, Feud-and-reconciliation, Secret-kept-then-revealed, Newcomer-integration, Isolation-and-rescue, Neighbourhood campaign, Intergenerational support, Migration out-and-return, Debt spiral, Windfall, Friendship across divides, Bereavement arc... Output: ranked arcs with protagonists, phase, causal-chain summary, `quiet` flag when below threshold.
  - **Report sections** (see 5.1) including calibration-vs-model tables with pooled multi-seed stats and ablation hooks.
  - Variety/divergence tools and the "Larkfield Gazette" generator (10 sampled arcs + 10 sampled ordinary days).
  - Blind "feel" pack generator (5.4).
- **Acceptance**: sifter runs on 10 sim-years x 500 pop in < 2 s; each pattern has unit fixtures; report prints a green/amber/red table; a flat/boring world is detected (Gazette quiet-week test) and a drama-saturated world is flagged *too eventful*.
- **Perf**: sifter incremental (consumes events as emitted; windowed), < 3% of tick if run live.
- **Diversity**: implements metrics in 5.3.

(Seven Wave 1 packages = Kernel work continues in parallel as W0-K maintenance; W1-F can be split F1 UI / F2 Gazette if needed.)

### Wave 2, Integration and depth (after Wave 1 packages are green individually; each owns separate dirs)

#### W2-A: Institutions, groups, business lifecycle (size L)
- **Owns**: `sim/systems/orgs/**` (also owns groups/clubs/campaigns/tenants' assoc; absorbs `culture.js` clubs).
- **Depends**: W1-B, W1-C, W1-E.
- **Spec**: P5. Org lifecycle and roles; group formation from goals/events with purposes and recurring behaviour; traditions (3+ repeats with same participants become named, e.g. quiz night); council ward as a budgeted institution (bins, potholes, planning applications, consultation); school (catchment, ratings moving house demand), GP surgery capacity; faith/community orgs; volunteer decay; venue "cool/hype" cycle feeding closure risk; Sale-of-block and refurb flows using housing commands.
- **Acceptance**: groups formed/yr by cause; lifespan distribution; share outliving founder 30-60%; volunteering 16% formal monthly / 24% informal (calibration); business survival curve (~80% year-1 survival for cafes/pubs lower); closures emit JobLost and downstream goals; no group is created by a lookup table (audit).
- **Perf**: org updates weekly staggered; <= 3% of tick.

#### W2-B: Metropolis, macro and migration (size M)
- **Owns**: `sim/systems/metropolis/**`, replaces `migration.js`; services (hospital, police, court, rail, university).
- **Spec**: P6; regime-switching macro with per-seed draws; shocks (recession, cost-of-living crunch, epidemic wave, housing boom); on-demand arrivals from lazy-life generator with origin-conditioned names; service waiting times.
- **Acceptance**: arrivals 24% arrived 10+ yrs ago maintained; net migration plausible; shock response tests (layoffs spike then recover; rents lag); across seeds different decades (JS divergence of macro paths above threshold) with stable core stats.

#### W2-C: Crime, civic order, politics re-skin (size M)
- **Owns**: `sim/systems/civic/**`; replaces `crime.js`, `politics.js`.
- **Spec**: crime as mostly theft (phones, bikes, shoplifting, burglary), non-injury violence, harassment, drugs, fraud (online) per calibration rates; police and courts off-map with response times; victimisation affects beliefs/behaviour (avoid street); neighbourhood watch emerges via groups; politics = ward election, parties as groups, planning disputes, consultation; no mayor.
- **Acceptance**: ~63 recorded offences/yr per 500 (+-40% pooled); ~half theft; homicide ~0 over a decade; residential burglary ~14/1000 households; ablation: remove CCTV/watch group lowers burglary only if causal path modelled; no demographic label feeds offence propensity directly (audit).

#### W2-D: Player mode and god-mode commands (size M)
- **Owns**: `ui/play/**`, `ui/godmode.js` (rewrite), `sim/kernel/commands/builtin/**` (typed commands catalogue, owned here), `sim/play/**`.
- **Depends**: W1-B affordance API, W1-F UI.
- **Spec**: P9 play and god commands; decision-moment pausing; stance chips; ripple panel; command palette (Economy, Social, Place/Events, Life, Policy); long-press context actions on mobile; every command is replayable and a root event.
- **Acceptance**: replay of a 1-year session reproduces day hashes; every command has an undo-as-fork ("branch before this"); player can complete: take a job, sign a lease, make a friend, start a group, lose a job, move out; symmetric consequences (NPC reacts via same code path); no command bypasses preconditions unless flagged `god`.

#### W2-E: Fork lab, experiments, spectator fidelity (size M)
- **Owns**: `tools/lab/**`, `ui/lab/**`, `sim/lod/**` (T0/T1 admission, spectator bandit, lazy-life materialiser, pre-history runner).
- **Depends**: W0-K snapshot/fork, W1-A founding state, W1-G metrics.
- **Spec**: `lab.run(baseSnapshot, commandSet, {seeds, years, metrics})` in a worker pool, effect estimates + CIs, top divergent stories (sifter diff), cause tree; pre-history spin-up and world-bible generator (street history, legends, lineages) cached by (seed, content version); lazy-life materialiser with constraint checks; spectator bandit (outcome-neutral).
- **Acceptance**: same fork twice gives identical diff; lab run of 8 seeds x 5 years on a laptop in < 10 min; pre-history of 50 years < 30 s per seed; materialised person's record never contradicts the event log (consistency test over 1000 materialisations); bandit on/off yields identical event log (excluding display-only events).
- **Perf**: pre-history coarse tick >= 20k person-days/s; materialisation < 20 ms.

#### W2-F: Comms and online life depth (size M)
- Folded into W1-E first pass; Wave 2 adds dating-app dynamics, remote-work/gig platforms as non-human agents (pricing/matching), echo-chamber knob, pile-on dynamics, fraud. **Owns** `sim/systems/platforms/**`. Acceptance: online-formed ties ~11% overall (~22% of 30-39s), post reach heavy-tailed, correlation screen time vs loneliness reported against survey, gig main-income share 1-2%.

(Wave 2 = 6 packages, E and F may merge. Integration milestone: "30-year headless run, 500 pop, 5 seeds, all report sections green or amber with reasons".)

### Wave 3, Texture, polish and rigour (parallel, optional order)

- **W3-A Infrastructure texture** (`sim/systems/infra/**`): bus bunching, queues, broken lifts, litter, parking pressure, noise propagation, weather microclimate; each yields small mundane events/complaints with no plot quota.
- **W3-B Norms, reputation, heirloom objects** (`sim/systems/norms/**`, `sim/systems/objects/**`): per-group norm vectors (about 12 axes), violations, graduated enforcement; a few tracked objects with provenance (borrowed bike, ring). Rare by design.
- **W3-C Culture surface** (`sim/systems/culture/**`): memes/slang/fashions as replicators, artefacts and taste (heavy-tailed popularity; labelled design parameters, not validated).
- **W3-D Build-time search** (`tools/evolve/**`): novelty search + plausibility constraints over drive weights, move propensities; outputs frozen JSON; never runs at runtime.
- **W3-E Independent critic** (`tools/critic/**`): discriminator over life-sequence features vs panel-derived references; ship gate.
- **W3-F Audio and polish** (`ui/audio/**`): procedural WebAudio beds + stingers; share strings (seed + command log), almanac of discovered phenomena; daily-seed.
- **W3-G Perf pass** (`sim/kernel/**` by Kernel): typed-array SoA migration of remaining hot fields; target 10k+ ticks/s at pop 500.

Each Wave 3 package ships with acceptance = a visible narratable consequence *and* a metric that stays within caps (they must not raise arc density above the over-eventful alarm).

---

## 5. Validation and test harness plan

### 5.1 `tools/report.js` sections (all multi-seed; mean, sd, pass-rate)
1. **Founding**: pyramid, household types, tenure, ethnicity, religion, occupations, cars vs calibration (chi-square).
2. **Demography (20y)**: TFR, ASFR, mean maternal age, childlessness, births/deaths per 500, age-specific mortality, e0, infant mortality, partnership stats, household sizes, pyramid stability, moves by age.
3. **Housing/labour/money**: tenure drift, rent burden, evictions, overcrowding, unemployment, occupation mix, income/wealth Gini, benefit take-up, firm survival, money invariant.
4. **Social**: neighbour chat %, trust, loneliness, confidants, clustering, degree distribution, assortativity, tie churn, pub habits, online ties.
5. **Health/crime**: prevalence bands, gradient, recorded offences by type, homicide.
6. **Time-use**: average day by age/sex/weekday vs ONS (minutes per category), ordinary-day entropy.
7. **Emergence** (5.3).
8. **Perf**: ticks/s, per-system time split, p99 tick, heap, snapshot size, cache sizes.
9. **Determinism**: hash checks, snapshot-resume, replay.
10. **Gazette**: 10 sampled arcs, 10 sampled ordinary days, 5 sampled full life histories (rendered through templates).

### 5.2 Gates (`npm run check`, blocking for PRs)
- Determinism (3 sim-years, 2 runs, snapshot-resume, replay); grep gate (Math.random/Date.now/new Date in sim/ and content/); contract tests (each plugin loads alone with stub bus; unknown event types fail; frozen-proxy cross-state access fails; schema validation of packs); invariants (money conserved, every person housed or flagged, kinship graph consistent, population non-negative, no NaN in typed arrays); perf gate (pop 500, 2 sim-years, >= 5k ticks/s in Wave 1, >= 10k ticks/s by end of Wave 3; p99 per-tick ceiling; heap cap; no per-person cache growth); 5-seed quick report with bands.
- Plausibility bands are **pooled over seeds and years** (500 people means rare-event noise is large; never tune to one seed). Bands derive from `calibration.js` blocks and carry `confidence` (measured/derived/estimate); estimate-level bands warn, never fail.
- **Out-of-sample**: calibrate fertility, tenure and mobility; *test* household size, age at first birth, overcrowding, social-rent share of moves. Any package whose tuned fact passes while its untuned neighbour fails is flagged "painted on".
- **Ablations** (`tools/ablate.js`): switch off one pressure (rent shocks, isolation->health, referral ties, scarcity planning horizon, habit) and verify the target fact moves in the expected direction.

### 5.3 Emergence and variety metrics (observed and bounded, not maximised)
- Cross-seed divergence: Jensen-Shannon on event-type histograms and arc-signature histograms at year 10; trajectories (population, Gini, groups) diverge but macro stats stay in band.
- Within-seed: arc-type entropy; distinct arc signatures per 1000 events; text n-gram repetition rate; fraction of events with a cause parent; median causal-chain depth of top arcs (target >= 3); share of arcs crossing >= 3 systems.
- **Too-eventful alarm**: person-years with no major life event >= 55%; arcs/yr per 100 residents under an upper cap; quiet-week fraction in the feed >= 40%; moves like blackmail/fraud < 0.5% of moves.
- Perturbation sensitivity: change one agent's trait at t0, measure divergence time (should be years, not days or never).
- Boredom check: longest stretch of a sampled life with no goal change and no habit change (bounded below *and* above).
- Belief health: false-belief share reported (tuning knob, no band), secret half-life, mutation share.
- Specificity: fraction of events with a stored reason trace (>= 90%) and a named place or object (>= 70%).
- Discovery curve over 5 simulated lifetimes: new arc *sub*-types still appearing after lifetime 3 (not flat).
- Fairness audit: ethnicity, religion and gender are never read by outcome mechanisms except through enumerated channels (homophily in tie formation, network access, wealth, location); a static check lists reads of those fields.

### 5.4 Cheap "feel" review procedure (human, 20 minutes per build)
1. Generate the Gazette for 3 seeds at year 10 and year 40.
2. **Blind panel**: `tools/feel/blind.js` emits 12 anonymised life summaries (8 sim, 4 hand-written from real panel-style vignettes); reviewer marks "real/sim" and "would I believe this?"; track accuracy over builds (goal: near chance on mundane lives, no more than 70% on eventful ones).
3. Follow three random residents for a sim-month in the UI; check each thought line makes sense and none references unknown facts; mark "odd" moments in a text file the sifter can later check against.
4. Read one 20-year chronicle of a street: is it mostly quiet with a few strong stories? Are there repeated phrases? Is any thing impossible (stereotype clusters, a night-shift nurse saving to leave appearing three times)?
5. Policy-lab sanity: run "double rent" and "new tram stop" and confirm plausible directions and that the divergence report is legible.
6. Record verdict in `docs/feel-log.md` (date, seed, build hash, 3 bullet impressions).

---

## 6. Current code to delete or rewrite

### Keep (and extend)
`sim/rng.js` (extend to sub-streams), `sim/world.js` skeleton (tick loop moves into kernel scheduler; spatial grid replaced by venue index + street graph), `sim/path.js` (hierarchical + bounded cache; port to street graph), `sim/person.js` data model (move to `sim/model`, add schema/owners, self-model, beliefs), `ui/portrait.js`, `ui/render.js` shell, `ui/worker.js`/`main.js` snapshot plumbing (switch to delta snapshots), `ui/inspector.js`/`panels.js` (rewire), `social.js` rumour core, `romance.js` courtship skeleton, `family.js` inheritance, `crime.js` trial skeleton (as reference code, ported into new systems then deleted).

### Rewrite (new package replaces file; delete in the same PR)
| Current | Replaced by | When |
|---|---|---|
| `sim/map.js` | `sim/map/` street graph + `content/larkfield/buildings` | W1-A |
| `sim/time.js` (112-day year, rest day) | real calendar | W1-A |
| `sim/names.js` | `content/larkfield/names` | W1-A |
| `sim/brain.js`, `sim/actions.js`, `sim/needs.js` | `sim/goals/` (routine + planner) | W1-B |
| `sim/chronicle.js` | event bus + renderer + sifter | W0-K / W1-G |
| `sim/systems/economy.js` | housing, labour, money | W1-C |
| `sim/systems/family.js`, `romance.js`, `health.js` | `systems/life`, `systems/health` | W1-D |
| `sim/systems/social.js` | `systems/social`, `systems/comms` | W1-E |
| `sim/systems/culture.js` | `systems/orgs` (clubs, events), W3 culture | W2-A / W3-C |
| `sim/systems/politics.js`, `crime.js` | `systems/civic` | W2-C |
| `sim/systems/migration.js` | `systems/metropolis` | W2-B |
| `tools/plausibility.js` (hard-coded medieval bands) | calibration-driven multi-seed bands | W1-G |
| `ui/godmode.js` | command palette + lab | W2-D / W2-E |
| `ui` fixed 16-action player command | affordance API | W2-D |

### Delete outright (no port)
Crowns/grain/harvest/parish alms code; temple, christening, medieval festivals, midwinter/midsummer lists; "bloody flux", croup and the pre-modern disease table; mayor election, watch/jail medieval justice text; per-system copies of `nm/he/his/chron/has` helpers (replaced by `world.text` + util); ~95 inline medieval strings in `sim/*.js` and `ui/*.js`; ad hoc `world.social/culture/economy` state objects (replaced by plugin state with serialize); UI use of `Math.random` for sim-visible choices (godmode datalist ID, random person pick must use a seeded pick via command).
Archive anything of value under `content/hollowmere/` (best-effort, unmaintained) only if it costs nothing; otherwise rely on git history.

### Sequence safeguards
Never delete the old system until its replacement is green on `npm run check` and the UI renders it; adapters keep the build running during migration. The report must run at every merge.

---

## 7. Timeline sketch (parallel agent weeks)
- Week 0-1: W0-K (stubs day 1, full in ~1 week). Meanwhile W1-A/B/E/G start against stubs.
- Weeks 1-4: Wave 1. Weekly integration run of the 5-seed report on a branch that swaps in whichever packages are green.
- Weeks 4-7: Wave 2. First "full Larkfield" milestone: 30-year, 500-pop, 5-seed headless pass; first playable mobile build; first policy-lab run.
- Weeks 7+: Wave 3 in any order, gated by the "too-eventful" and fairness audits.
- Review checkpoints: after W0-K (contract freeze review), after Wave 1 (feel review 1; decide if self-models/template invention earn their cost via ablation), after Wave 2 (feel review 2; user judges plausibility from Gazette + follow-cam).

## 8. Biggest risks and mitigations
1. **Kernel slippage blocks everyone**: freeze stubs day 1; adapters keep the old world alive; packages develop against mocks.
2. **Events/beliefs/moves blow the perf budget**: hard caps, event-driven only, per-system time split in every report, perf gate in `check`.
3. **Realism as a hidden dashboard**: every mechanism must emit one narratable visible consequence; ablations prove causality; UI Routine view makes the mundane visible.
4. **Too much plot**: no drama quota anywhere; "too-eventful" alarm and quiet-week feed state; rare moves rare by propensity; featured residents chosen honestly.
5. **Bold bets underperform** (self-models, template invention, lazy lives): each has a flag and ablation test; fall back to fixed templates / T1-only without breaking contracts.
6. **Stereotype leakage**: fairness audit; ethnicity enters only through enumerated channels; occupations drawn from the joint distribution of age/sex/education/place.
7. **Calibration drift**: single reference place and year (UK-city inner-urban composite, Census 2021); estimate-level numbers warn not fail; records flagged "design parameter" when no benchmark exists.

---

## Addendum (orchestrator): heterogeneity, off-map social life, persona checks
Applies to all Wave 1+ packages. Averages describe a neighbourhood, not a life.
1. **Lifestyle segments.** Population is generated as distinct segments (e.g. long-term older residents, families
   incl. lone parents, students, young sharers/early-career professionals, settled professionals, shift workers,
   recent arrivals), each with its own routines, time use, mobility, money pressures and *social geography*.
   Segment shares come from calibration; plausibility is checked per segment as well as in aggregate.
2. **The off-map city is a social space, not just a job sink.** Many residents' most important ties (work friends,
   university friends, family elsewhere, partners met via apps) live off-map in the Metropolis, maintained by
   messages and periodic meetups/nights out elsewhere. Local ties are often weak for some segments and strong for
   others (long-term residents, parents at the school gate, religious communities, shop owners).
3. **Churn as a life stage.** For mobile segments the neighbourhood is a 1-3 year chapter; flatmates rotate,
   people leave for partners, jobs or space. Arrivals and departures are stories, not noise.
4. **Persona plausibility reviews.** In addition to statistical bands, the report includes per-segment "a typical
   day / week / year" traces for sampled individuals, reviewed for whether such a life looks right.
   Do not tailor to any single real person; aim for breadth across segments.

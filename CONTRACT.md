# Kernel contract 1.0 (Wave 0, frozen: extend, never rename; versioned by `CONTRACT_VERSION` in sim/kernel/types.js)
Full signatures: sim/kernel/types.js (JSDoc) and ARCHITECTURE.md (kernel table). Summary of what packages may rely on:
1. **Events**: `world.emit('domain.verb', {actors, objects, place, tags, cause, salience, payload}) -> id`; register types with `world.registerEventType(type, {payload:{field:'number'|'string'|'boolean'|'object'|'any'}, template})` (new-style types MUST be registered; tests run with `strictEvents`). `world.on(type, fn(ev, world))` fires after the emitting step, never inside emit. `world.events.query({actor, place, type, since, until, cause, minSalience, limit})` (newest first), `world.events.chain(id)`. Payloads hold data only; text is rendered at read time by `world.text.render(ev)`.
2. **Plugin** (`sim/systems/<x>/index.js` default export): `{name, version, deps, init(world, pack), clocks:{hour,day,week,month,year}, on:{Type:fn}, events:{emits,listens}, affordances(person, ctx), query:{...}, commands:{name:fn(world,args,cmd)}, serialize/deserialize(state,version)/migrate(from,state)}`. Pass via `new World({plugins:[...], pack})`. Never touch another system's state: use `world.sys.<other>.query.fn()` (read-only; frozen in `contractMode`) or events/commands.
3. **Commands**: all player/god/policy actions: `world.queueCommand({tick?, actor:'god'|'player'|'policy'|id, name, args})` (args JSON-able). Logged in `world.commands.log`; replay = seed + pack + log. Cross-system writes: `world.cmd(name,args)` to the owning system's command.
4. **Snapshot**: `world.snapshot()` (JSON-able), `World.restore(snap, pack)`, `world.fork(salt?)`. Plugin state travels through `serialize/deserialize`. Anything not in `world.stateKeys`/plugin state/kernel services is derived and must be rebuildable (`afterLoad`).
5. **RNG**: never `Math.random`. `world.rng` (legacy shared), `world.rngFor('name')` persistent stream per system, `world.rngFor('name', day, id)` stateless derived stream (use for per-entity/per-day rolls; adding a roll elsewhere never shifts it).
6. **Ledger**: `world.ledger.transfer(from, to, amount, reason, causeEvent)`; accounts: person id, `'b:<id>'`, `'council'`, `'metropolis'`, `'void'`; conserved (`ledger.total()`).
7. **Indices**: `world.index.byVenue/byHousehold/byEmployer/byOrg/byTier/byStage/needsAttention/counts()`; no `world.living()` scans in per-tick code.
8. **Scheduling**: do not poll; set `p.currentAction` only through `world.startAction/endAction` (or call `world.sched.plan(p)` after); schedule slow work with plugin `clocks`. `sched.mode='agenda'` is the default.
9. **Person fields**: declare new top-level person keys with `declareField(name,{owner})` (sim/model); only the owner writes them.
10. **Packs**: `content/<id>/index.js` default export validated by `validatePack` (required: id, version, contractVersion (major must match), calibration, names, jobs, buildings); add section schemas with `registerSection`.
11. **Text/LOD/Affordances**: stubs with stable API (`world.text`, `world.lod`, `world.afford`); real engines attach via `setEngine` / providers.
12. **Gates**: `npm run check` must pass before handing work back.

---
# Legacy medieval contract (still valid for sim/systems/*)
Everything here is the minimum shared vocabulary. Extend freely with NEW fields; never rename these.

## Time
- 1 tick = 10 game minutes. TICKS_PER_DAY=144. DAYS_PER_SEASON=28, 4 seasons, DAYS_PER_YEAR=112.
- `world.tick` (int). `world.time = {minute,hour,day(0..111 day-of-year),dayOfSeason,season(0..3),year,weekday(0..6), totalDays}`.
- Ages: `world.ageOf(p)` -> years (float), from `p.birthTick`. Life expectancy target ~65-75. A real year
  of human life maps 1:1 to a game year (112 days), so biology runs on game years.
- Default UI speed target: one 70-year lifetime ≈ 1 real hour (≈ 50 s per game-year).

## World API (sim/world.js)
- `world.rng` (seeded; methods next(), int(a,b) inclusive, float(a,b), pick(arr), weighted(arr, weightFn|weights), chance(p), gauss(mean,sd), shuffle(arr)).
- `world.people: Map<id, Person>` (includes dead; use `world.living()` -> array of alive people, cached per tick).
- `world.buildings: Map<id, Building>`; `world.buildingsOfType(type)` -> array.
- `world.on(type, fn)`, `world.emit(type, payload)`.
- `world.chronicle.add({type, importance(1-5), text, people:[ids], buildingId?})` (tick auto-filled).
- `world.addMemory(person, {type, text, otherIds:[], weight(-1..1 emotional valence), importance 1-5})`.
- `world.addPerson(person)`, `world.killPerson(person, cause)` (sets alive=false, deathTick, emits 'death').
- `world.createPerson(opts)` -> Person (factory in person.js; opts may pass parents for genetics, age, sex, lastName...).
- `world.peopleAt(buildingId)` -> alive people currently inside; `world.peopleNear(x,y,r)` -> alive people near tile.
- `world.getRel(a, b)` -> relationship object of a toward b (created lazily); `world.relScore(a,b)` -> -1..1 summary.
- `world.formatDate(tick)` -> "Spring 12, Year 3".
- `world.stats` object systems may write counters into (e.g. world.stats.births++).
- `world.settings` (tunables) and `world.player` (null for now; future player-controlled character id).
- `world.intervene(kind, params)` future god-mode hook: systems register handlers via `world.registerIntervention(kind, fn)`.

## Person (sim/person.js)
id, firstName, lastName, sex ('M'|'F'), birthTick, alive, deathTick, causeOfDeath,
x, y (float tile coords), path, locationId (building id or null when outdoors), homeId, workId, job (string id, e.g. 'farmer','baker','smith','tavernkeeper','merchant','doctor','teacher','priest','guard','miller','tailor','carpenter','innkeeper','laborer','mayor','student','child','retired','unemployed'),
genes {height, build, skinTone, hairColor, eyeColor, looks, intellect, vitality, fertility} (all 0..1),
personality {openness, conscientiousness, extraversion, agreeableness, neuroticism} (0..1),
traits: string[] (e.g. 'gossip','pious','ambitious','romantic','hothead','kind','greedy','drunkard','lazy','shy','charming','jealous','honest','thief'),
skills: {[name]: 0..1}, needs {hunger, energy, social, fun, hygiene, comfort, purpose} (0..1, 1 = fully satisfied),
mood (-1..1), moodlets: [{id, label, value, untilTick}] (sum feeds mood), health (0..1), illness (null|{name, severity, contagious, sinceTick}),
money (number, coins), inventory {food, goods...}, reputation (-1..1),
relationships: Map<otherId, Rel>, family {fatherId, motherId, spouseId, childrenIds:[], exSpouseIds:[]},
romance {partnerId, status: null|'dating'|'engaged'|'married', sinceTick},
memories: [{tick, type, text, otherIds, weight, importance}], rumors: [{id, aboutId, kind, text, truth, heardFrom, tick}],
currentAction {id, label, targetId, untilTick}, thought (string), pregnant (null|{fatherId, dueTick}), jailedUntil (tick|0).
Rel = {familiarity 0..1, affinity -1..1, attraction 0..1, trust 0..1, respect -1..1, lastTick, tags:[] e.g. 'friend','rival','enemy','ex','crush','family','coworker'}.

## Building
id, type, name, x, y, w, h, door {x,y}, ownerId, residents [ids], employees [ids], capacity, inventory {}, funds, condition (0..1).
Types: house, farm, bakery, smithy, tavern, market, clinic, school, temple, townhall, jail, mill, inn, tailor, carpenter, park, cemetery, well, square.

## Actions (utility AI)
Action def: `{ id, label, where(world,p) -> buildingId|null|{x,y}, score(world,p) -> number (>=0), duration(world,p) -> ticks, onStart?(world,p), onTick?(world,p), onEnd?(world,p), thought?(world,p)->string, interruptible?:bool }`.
Systems export `actions: [...]` merged into the global list. Systems may also export
`scoreModifiers: [(world, p, action, score) -> score]` applied in order after base scoring.
Brain picks via softmax over top scores (personality-temperature) so behaviour is varied, not robotic.

## System module
`export default { name, init(world), onTick(world), onHour(world), onDay(world), onSeason(world), onYear(world), actions:[], scoreModifiers:[] }` — all optional except name.
Registered in sim/systems/index.js (array). Order: economy, social, romance, family, health, crime, politics, culture, migration.

## Engine events (emit names)
'tick','hour','day','season','year', 'actionStart' {person, action}, 'actionEnd' {person, action},
'arrive' {person, buildingId}, 'encounter' {a, b, buildingId} (emitted by social), 'birth' {child, mother, father},
'death' {person, cause}, 'marriage' {a,b}, 'divorce' {a,b}, 'crime' {...}, 'jobChange' {person, oldJob, newJob},
'moveHome' {person, homeId}, 'election' {...}, 'rumor' {...}, 'intervention' {kind, params}.

Payload convention (see ARCHITECTURE.md for the full table): persons are Person OBJECTS under role names (`{person}`, `{a,b}`, `{child,mother,father}`, `{perpetrator,victim}`), buildings are `buildingId`; only the high-volume 'encounter'/'conversation' events carry person ids.

## Quality bar
Realism first: results must look plausible to a demographer/historian of a pre-industrial market town
(age pyramid, marriage ages ~18-30, ~3-5 children per woman over life with some infant/child mortality,
life expectancy ~65-75 for adults, a few crimes a year, wealth inequality gini 0.3-0.5, most people employed).
Headless report output must be COMPACT (< 80 lines) to keep testing cheap.

# Hollowmere engine architecture (Phase 1)
Binding vocabulary lives in CONTRACT.md; this documents what the engine actually does. All sim code is DOM-free ES modules, deterministic (use `world.rng` / `world.rngFor('name')`, never Math.random).

## Time (sim/time.js)
1 tick = 10 min; 144 ticks/day; 28-day seasons; 112-day year; tick 0 = Spring 1, Year 1, 06:00. Every 7th day (`weekday===6`) is the rest day.
`world.time` = {tick, hour, minute, hourFloat, day(=dayOfYear 0..111), dayOfYear, dayOfSeason(1..28), season(0..3), seasonName, year(1-based), weekday, restDay, totalDays(=dayAbs)}.
Helpers: `formatDate(tick)` "Spring 12, Year 3", `formatTime`, `ticksUntilHour(tick,h)`, `world.ageOf(p)` (float years). Backstory ticks may be negative.

## Map (sim/map.js)
120x90 `map.tiles` (Uint8Array, `T.GRASS/ROAD/WATER/BRIDGE/TREE/FIELD/PLAZA/BUILDING/PARK/GRAVE/FOUNTAIN`), `map.cost` (0 = blocked), `map.bAt[idx]` building id or -1, `map.comp` connectivity labels, `map.center`.
Exports `BUILDING_TYPES` (jobs per building, public `hours`), `JOBS` {wage, skill, shift:[start,end], service}, `isOpen(b, hourFloat)`.
Building: {id,type,name,x,y,w,h,door{x,y} (walkable tile OUTSIDE the building on the road/plaza), doorSide, open (park/cemetery/square: people stay visible, `spots` = walkable tile idx), ownerId, residents[], employees[], jobs[] (job titles = capacity per slot), inventory{}, funds, condition, capacity, hours, zone, occupants:Set<Person> (runtime)}.
Types: house farm bakery smithy tavern market clinic school temple townhall jail mill inn tailor carpenter park cemetery square (the plaza; id = `map.squareId`). ~86 houses, 8 farms, 2 each of bakery/smithy/tavern/market/tailor/carpenter. Empty houses (no residents) = vacancies.
`world.addBuilding(b)` registers a new one (call `renderer`-side nothing; it redraws every frame).

## Pathing (sim/path.js)
`world.path.cached(startTileIdx, goalTileIdx)` -> Int32Array of tile idx (excl. start, incl. goal) or null; shared, never mutate. Tile idx = y*W+x. People walk 4-6 tiles/tick (cost-weighted: roads fastest).

## Person (sim/person.js) -- fields per CONTRACT plus
`locationId` (building id or null=outdoors), `inside` (true inside closed building => not drawn), `path/pathIdx`, `seg/segTick` (UI interpolation trail, only if `world.recordTrails`), `speed`, `schedule{wake,bed,offDay}`, `needRate`, `moodletSum`, `lastMeal` (tick), `workedTicks` (ticks worked today; reset after systems' onDay), `starve` (ticks with hunger<0.04, never reset by engine), `cooldown{actionId:untilTick}`, `thought`, `lastAction`, `bubble {text, until}` (UI draws speech bubble), `ext{}` (free namespace for systems), `interests`, `values{tradition,wealth,family,freedom,community,piety}`, `family.siblingIds`, `maidenName` (wives), `homemaker` flag.
Jobs: `p.job` is always a string: 'child'(<6), 'student'(6-15), 'retired', 'unemployed', or a job title from JOBS (`p.workId` set). Engine does NOT change jobs/hire/age-transition: the economy system must (update `p.job`, `p.workId`, `building.employees`; the brain reads `JOBS[p.job].shift` live).
`world.createPerson(opts)` {sex, age, firstName, lastName, mother, father | parents:[mother,father], homeId, birthTick, money, genes, personality} -> Person (id assigned, NOT yet added). Use `birthTick: world.tick` for newborns. `world.addPerson(p)` inserts (links parents' childrenIds + parent rels, places inside home).
Relationships: `world.getRel(a,b)` (persons or ids, lazily created) `{familiarity,affinity,attraction,trust,respect,lastTick,tags[]}`; `world.relScore(a,b)`.

## World API (sim/world.js)
`new World({seed, population, houses, systems, settings})`. Fields: rng, tick, time, weather{type,temp}, map, buildings, people (Map, includes dead), stats, settings{prices{food,tavernMeal,drink}}, town{name,treasury}, chronicle, brain, actions(Map), path, player.
Methods: `step()`, `run(n)`, `living()`, `buildingsOfType(t)`, `building(id)`, `person(id)`, `nameOf(p)`, `isOpen(b)`, `rngFor(name)`, `on/off/emit`, `log(text,{type,importance,people})`, `addMemory(p,{type,text,otherIds,weight,importance,tick?})`, `addMoodlet(p,{id,label,value,untilTick})` (expire hourly), `addPerson`, `killPerson(p,cause)` (removes from employees/residents/occupants, emits 'death'), `registerAction`, `registerSystem`, `registerIntervention(kind,fn)`/`intervene(kind,params)`, `formatDate`, `nearestBuilding(type,x,y,filter)`.
Spatial: `world.peopleAt(buildingId)` = alive people inside/at the building (also `b.occupants` Set); `world.peopleNear(x,y,r)` = alive people OUTDOORS (incl. in open places like park/square) within r tiles, via 8x8-tile bucket grid. Combine both for encounters.
Step order per tick: day-start housekeeping -> all people (needs, walk/act/decide) -> events+systems `onTick` -> (hour) `'hour'`+`onHour` -> (day) `'day'`+`onDay` -> season/year.

## Systems
`export default {name, init(world), onTick, onHour, onDay, onSeason, onYear, actions:[], scoreModifiers:[]}`; listed in sim/systems/index.js. init runs after population exists.
The engine provides NO wages, production, aging deaths, births, hiring or market restocking: those belong to economy/health/family. Shopping treats `market.inventory.food === undefined` as unlimited stock; otherwise it decrements it (economy should keep it stocked). Food is per-person `p.inventory.food` (housemates share: eating takes own food, else a housemate's); shopping buys for the household at `settings.prices.food`.

## Actions & brain (sim/actions.js, sim/brain.js)
Def: `{id, label, score(world,p)->number (<=0 = unavailable), where?(world,p)->buildingId|{x,y}|null, duration(world,p,b,ca)->ticks, onStart?(w,p,b,ca) (return false to refuse -> 12-tick cooldown), onTick?(w,p,b,ca), onEnd?(w,p,b,ca), thought?(w,p,b,ca)->string, interruptible?, perTick?:{need:delta} (applied each tick while acting), decay?:{need:multiplier}, minAge?, maxAge?, stickiness?}`. Duration is evaluated on arrival; `ca` is the p.currentAction record `{id,label,targetId,untilTick,status(0 walking,1 doing),startTick,why,data,forced,thought}`. Built-in actions (score uses `world.brain.ctx`: h, rest, shift, shiftEnd, workDay, inWin(sleep window), wake/bed, mealAgo, age; core actions set `ctx.target/why/data` instead of `where`): sleep, eat_home, eat_tavern, work, school, shop, socialize, relax_park, tavern, pray, wander, relax_home, chores, bathe, visit_friend, idle.
Decision: all candidates scored (>0), then each `scoreModifiers` fn `(world,p,def,score)->newScore` (return a number to replace) is applied, current action gets +stickiness (8), softmax over scores (temperature 2-6 by conscientiousness) picks. Add modifiers via `sys.scoreModifiers` or `world.brain.addModifier(fn)`. `world.brain.explain(p)` -> sorted [{id,score,target,why}] for UI. Interruptible actions are re-evaluated every ~12 ticks.
Forcing: `world.startAction(p, id, target(buildingId|{x,y}|null), why, {duration, thought, data, forced})` / `world.forceAction(p,id,target,{duration,thought,why})` (forced = never interrupted) / `world.cancelAction(p)`. Returns false if unreachable. Register custom ids via a system's `actions` (e.g. 'jailed', 'funeral', 'festival') then force them.
Thought: auto-built "Heading to X (label) — why" / "Label at X — why" unless `def.thought` or `opts.thought`.

## Events (world.on)
'tick','hour','day','season','year' (payload world), 'actionStart'/'actionEnd' {person, action:ca}, 'arrive' {person, buildingId}, 'death' {person,cause}, 'chronicle' (entry), 'buildingAdded' {building}, 'intervention' {kind,params}. Systems add 'birth','marriage','encounter', etc.

## Chronicle (sim/chronicle.js)
`world.chronicle.add({type, importance 1-5, text, people:[ids], buildingId?, tick?})` -> entry {id,tick,type,importance,text,people,buildingId}; `.recent(n,minImp)` newest-first; `.query({sinceTick,untilTick,type,minImportance,person,limit})`; `.biography(id)` -> [{tick,date,text,source,importance}] oldest-first merging memories+entries; `.biographyText(id)`; `.digest(since,until,limit,minImp)`; `.format(entry)`.

## UI (index.html, ui/main.js, ui/render.js)
`ui/main.js` exports `ui` (also `window.hollowmere`): `{world, renderer, speedIndex, selected, selectedBuilding, select(id), selectBuilding(id), setSpeed(i), onSelect(fn), onFrame(fn(world,now)), onTick(fn(world)), renderInspector (assign to override the minimal inspector)}`. Mount points: `#inspector`, `#sidebar-extra`, `#feed-list`, `#topbar-extra`. Speeds 0,3,15,60,300 ticks/s, max (12ms/frame budget). `?seed=N&pop=N`. Renderer: `posOf(p,alpha,out)` interpolated position, `toWorld/toScreen`, `cam`. Static building styling by type (ROOF table in render.js).

## Tools
`node tools/headless.js --seed 1 --years 2 [--hist] [--chronicle] [--wages]` (`--wages` injects a throwaway wage stub when no economy exists; `--hist` prints action-by-hour histogram). Engine-only cost ~2.4 s per game year at 222 people.

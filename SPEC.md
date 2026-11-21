# Hollowmere — a living town simulation

Goal: a simulated town of a few hundred people that is as **realistic** as we can make it while being
**fun to watch and poke at**. Each person is an autonomous agent with a body, a mind, a history and
relationships. Emergent stories (romances, feuds, scandals, businesses rising and failing, elections,
epidemics, family dynasties) should arise from systems, not scripts.

## Hard constraints
- Plain modern JavaScript (ES modules), **zero runtime dependencies, no build step** for development.
- Runs in the browser (`index.html`, served by `python3 -m http.server`) AND headless in Node
  (`node tools/headless.js --seed 1 --years 30`) using the exact same `sim/` code. `sim/` must never touch
  the DOM or `window`.
- Fully deterministic given a seed (use `sim/rng.js` only — never `Math.random` in `sim/`).
- Performance: 300 people at max speed should simulate >= 1 game-year per ~10s in Node. Population can
  grow to ~800; keep per-tick work roughly O(n) (spatial bucketing for encounters, no O(n²) per tick).
- No external APIs required. (Optional, later: browser-side Claude dialogue with a user-provided key.)

## Layout
```
index.html, style.css
sim/            pure simulation (no DOM)
  rng.js        seeded PRNG: rng.next(), int(a,b), pick(arr), weighted(items, w), chance(p), gauss(m,s)
  world.js      World class: time, map, people, buildings, systems registry, event bus, chronicle
  time.js       calendar: 1 tick = 10 game minutes; 24h days; 4 seasons x 28 days = 1 year (112 days)
  map.js        procedural town map gen (tile grid ~120x90): roads, river, fields, forest, plots, buildings
  path.js       A* / flow-field pathfinding on the tile grid, cached
  names.js      name generation (given/family names, town names, business names)
  person.js     Person data model + factory (initial population gen with families & histories)
  needs.js      needs decay & satisfaction
  actions.js    action definitions (utility AI): eat, sleep, work, socialize, shop, pray, drink, play, ...
  brain.js      decision making: score actions by needs, personality, schedule, mood, relationships
  systems/      each file exports a system object (see "System contract")
    social.js       encounters, conversations, relationships, gossip, reputation
    romance.js      attraction, dating, marriage, affairs, breakups, divorce
    family.js       pregnancy, birth, genetics/inheritance of traits, parenting, households
    health.js       aging, illness, contagious disease outbreaks, injury, death, grief, funerals
    economy.js      jobs, production, market prices, wages, businesses, money, housing, poverty
    crime.js        theft, assault, the watch, trials, jail, reputation impact
    politics.js     council/mayor elections, campaigns, policies (tax, festival budget, watch funding)
    culture.js      festivals, religion/temple, clubs, traditions, seasonal events, weather events
    migration.js    newcomers arriving, people leaving town
  chronicle.js  turns events into narrative text (newspaper headlines, biographies)
tools/headless.js   run N years, print stats + notable chronicle lines
ui/             browser-only
  main.js       boot, sim loop (speed controls), wire UI
  render.js     canvas map renderer: tiles, buildings, people (with emotes/speech bubbles), day/night, weather
  inspector.js  person panel: portrait, needs, mood, personality, skills, relationships, thoughts, life story
  panels.js     chronicle/newspaper feed, stats dashboard (charts), family tree, social graph, building view
  portrait.js   procedural face portraits (canvas) from genes
```

## Core data model (sketch — engine author finalizes, others extend via namespaced fields)
- `world`: `{ seed, rng, tick, time:{day,hour,minute,season,year}, map, people: Map<id,Person>,
  buildings: Map<id,Building>, systems: [], events (bus), chronicle, stats, weather, town:{name,...} }`
- `Person`: `id, firstName, lastName, sex, birthTick, alive, x, y (tile coords, float for smooth movement),
  path, homeId, workId, job, genes {height, build, skinTone, hairColor, eyeColor, looks, intellect,
  health baseline, ...}, personality {openness, conscientiousness, extraversion, agreeableness, neuroticism}
  (0..1), values/interests, skills {farming, cooking, smithing, medicine, teaching, trade, charisma, ...},
  needs {hunger, energy, social, fun, hygiene, comfort, purpose} (0..1, 1 = satisfied), mood (-1..1),
  emotions (recent stressors/boosts list with decay), health (0..1), money, inventory,
  relationships: Map<id, {familiarity, affinity(-1..1), attraction, trust, respect, romance:status, history:[]}>,
  family {parents, children, spouseId, siblings}, memories [{tick, type, text, otherIds, weight}],
  knownRumors, currentAction, thought (string shown in UI), traits (tags like 'gossip','drunkard','pious','ambitious')`
- `Building`: `id, type (house, farm, bakery, smithy, tavern, market, clinic, school, temple, townhall,
  jail, mill, inn, tailor, carpenter, park, cemetery...), x, y, w, h, door {x,y}, ownerId, residents,
  employees, inventory, capacity, funds`.

## System contract
```js
export default {
  name: 'social',
  init(world) {},              // once after world gen
  onTick(world) {},            // every tick (keep cheap!)
  onHour(world) {}, onDay(world) {}, onSeason(world) {}, onYear(world) {},
  actions: [],                 // optional extra action defs merged into brain's action list
}
```
Systems communicate through `world.emit(type, payload)` / `world.on(type, fn)` and direct reads of
person fields. Notable things go to `world.chronicle.add({tick, type, importance 1-5, text, people:[ids]})`.
Each person's important life events go to `person.memories` (and become their biography).

## Feel / realism goals
- Daily rhythm: wake, breakfast, commute, work, lunch, evening at tavern/park/home, sleep. Weekends/rest
  days, festivals. Children go to school, the elderly retire.
- Personality really matters: extraverts seek company, neurotic people spiral after bad events, agreeable
  people comfort the grieving, conscientious people save money, low-conscientiousness + desperate people
  may steal. Values clash -> arguments -> feuds.
- Relationships have memory and asymmetry (A may love B who barely knows A).
- Gossip: people share rumors about others (affairs, crimes, scandals), which changes reputation; rumors
  mutate/distort slightly as they spread.
- Visible inner life: every person has a current `thought` explaining what they are doing and why
  ("Heading to the Gilded Goose — needs to unwind after the argument with Mara").
- Long-run: multi-generation dynasties, inherited wealth & traits, family feuds lasting generations.
- The headless run of 50 years should yield a stable-but-dynamic population (no extinction, no explosion)
  and a chronicle full of varied, readable stories.

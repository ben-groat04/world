# Larkfield architecture

Larkfield is the only world: an agent-based simulation of a UK inner-city neighbourhood (~550 people, 10-minute ticks, real UK calendar).
Plain JS ES modules, no dependencies, DOM-free (the UI in `ui/` talks to the sim through `ui/host.js` / `ui/worker.js`).
Outcomes must emerge from mechanisms; see `docs/CALIBRATION-METHOD.md` for what is input, what is tuned, what is held out.

## Entry point
`sim/larkfield.js`: `createLarkfieldWorld(seed, opts)` = kernel `World` + Larkfield pack (`content/larkfield`) + street-graph map + generated population + plugins
(routine, goals, labour, housing, money, life, health, social, comms). `world.snapshot()` / `restoreLarkfieldWorld(snap)` save and resume
(state is restored sensibly; not bit-exact determinism).

## Kernel (`sim/world.js`, `sim/kernel/*`)
- `World`: time (`sim/time.js`, calendar from the pack), map, people/buildings, spatial grid, event bus, command bus, ledger, plugin loader, chronicle.
  Hooks: plugin `clocks` (hour/day/week/month/year), `world.on(event)`, `world.queueCommand` / `world.cmd`.
- `kernel/scheduler.js`: timing wheel of people. Nobody is polled per tick; each person wakes at `p.wake` (set by the routine plugin).
- `kernel/events.js`, `event-types.js`: `world.emit('domain.verb', {actors, place, cause, salience, payload})`; causal queries (`world.events.query/chain`).
- `kernel/ledger.js`: double-entry money (`world.ledger.transfer`, `invariant()`); `indices.js` (byVenue/byHousehold/...), `plugin.js`, `schema.js`/`pack.js` (pack validation).
- `sim/snapshot.js`, `sim/chronicle.js`, `sim/path.js`, `sim/person.js` (person record + `createPerson`), `sim/rng.js`.

## Plugins (`sim/systems/*`, `sim/goals`)
| plugin | job |
|---|---|
| routine | habit layer: day plans from calendar + segment time-use; outings, work, school, meals, sleep; `p.thought` |
| goals (`sim/goals`) | goals, groups, projects, opportunities; overrides plan slots when a step/outing is due |
| labour | jobs, hiring, contracts, unemployment, retirement, graduation |
| housing | units, tenancy, rent, notices/evictions, moves, arrivals and departures |
| money | household budgets, macro prices, benefits, tax, debt; owns the ledger |
| life | partnerships, births, leaving home, kin, informal care |
| health | chronic/acute illness, mental health, loneliness flag, mortality, bereavement |
| social, comms | ties, encounters, rumours/beliefs/norms; phones, group chats, forum, feed |
Cross-plugin access only through `world.sys.<name>.query.*` and `world.cmd(...)`. Population generation: `sim/population/*` (day-1 input).

## Content (`content/larkfield`)
Pack: calibration, segments, archetypes, venues, jobs, names, goal templates, text (`text/`), calendar, drives. `sim/data/calibration.js` holds census-derived inputs.

## Tools
- `node tools/report.js [--seed 1] [--years 1] [--life-years N] [--personas a,b,c]` full report (population, material, life, social, personas, perf).
- `node tools/perf.js [--years 1] [--prof]` ticks/s. `node tools/check.js` (npm run check): < 30 s sanity (boot, 1 year, NaN, money invariant, loose bands, snapshot resume).
- `node tools/tune.js` multi-seed search over mechanistic parameters; `tools/metrics.js` metrics and targets.
- Tests: `npm test` (`tests/*/*.test.js`; slow, a few minutes). `node sim/goals/selftest.js`.

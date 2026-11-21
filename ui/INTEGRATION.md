# Mounting the Hollowmere UI modules

Files: `ui/worker.js` (data layer + Web Worker), `ui/inspector.js`, `ui/panels.js`, `ui/godmode.js`, `ui/ui.css`.
All panels talk to a **Store** (`store.state`, `store.on(topic, fn)`, `store.select(id)`, `store.setSpeed(tier)`, `store.intervene(kind, params)`,
`store.jumpToNextEvent(minImp)`, `store.playerCommand({type:'setPlayer'|'action'|'cancel', ...})`). Two backends produce a Store:

* `createWorkerSource(url, {seed, population})`: sim runs in a Web Worker (preferred; UI never blocks, ~25 snapshots/s).
  Positions arrive in `store.state.people` (Float32Array, 6 floats/person: id,x,y,flags,mood*100,age; flags 1=inside,2=female,4=child,8=sick,16=walking) and `store.on('frame', ...)`.
* `createLocalSource(world, {drive:false})`: observe the integrator's existing main-thread `World` (no worker). Pass `{drive:true}` to let it also step the world per `store.setSpeed(tierId)` (tiers: pause, scene, life, x5, x20, max; export `TIERS`).

## index.html
```html
<link rel="stylesheet" href="ui/ui.css">
<!-- replace the #inspector / #sidebar-extra / #feed markup with a single mount point: -->
<aside id="sidebar"></aside>     <!-- desktop: ~400px right column. phones: dock becomes a fixed bottom sheet itself -->
```
On phones `.hm-dock` is `position:fixed` (bottom sheet, 3 detents: peek/half/full), so the `#sidebar` column should collapse
(`@media (max-width:760px){ #layout{grid-template-columns:1fr} }`) and must not be `display:none` or have a CSS `transform`.
`#map-wrap` must be `position:relative` (the time-lapse overlay is absolutely positioned inside it).

## ui/main.js (worker variant; the renderer then draws from `store.state.people` instead of the local world)
```js
import { createWorkerSource, TIERS } from './worker.js';
import { mountDock, mountTimelapse } from './panels.js';

const store = createWorkerSource(new URL('./worker.js', import.meta.url), { seed, population: pop });
const dock = mountDock(document.getElementById('sidebar'), store, {
  onBuilding: (id) => ui.selectBuilding(id),      // optional: clicking a building name
  initial: 'gazette',                             // or 'person'
});
const tl = mountTimelapse(document.getElementById('map-wrap'), store);   // auto-shows at 'max' speed, has a "Show map" button
// speed buttons -> store.setSpeed('pause'|'scene'|'life'|'x5'|'x20'|'max'); reflect with store.on('speed', id => ...)
// clock -> store.on('time', t => { t.date, t.clock, t.seasonName, t.pop, t.weather })
// map click -> store.select(personId); two-way: store.on('select', id => renderer.selectedId = id)
// follow camera: store.on('follow', ...) / store.state.following + id in store.state.people
```

## Main-thread variant (keeps the current `ui.world` loop, no worker)
```js
import { createLocalSource } from './worker.js';
import { mountDock, mountTimelapse } from './panels.js';
const store = createLocalSource(world);                    // observer; your loop keeps calling world.step()
mountDock(document.getElementById('sidebar'), store, { onBuilding: (id) => ui.selectBuilding(id) });
mountTimelapse(document.getElementById('map-wrap'), store, { auto: false });   // auto:false: you call tl.show()/hide() at max speed
ui.onSelect((pid) => store.select(pid));                   // map click -> inspector
store.on('select', (pid) => { if (pid !== ui.selected) ui.select(pid); });   // clicking a name in the UI -> map selection
// speed: store.state.speed is only informational in this variant; call store.setSpeed(...) from your buttons if you want the Skip/jump
// button to work: the 'jump' command sets tier 'max' on the host, so also honour store.on('speed', ...) in your loop.
```
(The `jumpToNextEvent` button in God mode relies on the host running the sim; with the observer variant use `createLocalSource(world,{drive:true})` and drop your own stepping.)

## Individual mounts
`mountInspector(el, store, opts)`, `mountGazette`, `mountStats`, `mountDirectory`, `mountGraves`, `mountGodmode` (godmode.js) each return `{destroy()}`.
`tools/ui-test.html` is a complete working example (worker or `?local=1`).

## Contract assumptions
Reads: `world.people/buildings/chronicle(entries, biography)/time/weather/town/stats(births, deaths, optional crimes)/brain.explain/_interventions (fn.description)`,
`world.forceAction`, `world.player`. Emits nothing. Interventions are discovered via `world._interventions` + `fn.description` (as the systems set it).

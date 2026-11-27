// Writes briefs-<arm>-<plain|oracle>.json for both arms (W10, W11): the same briefs, seeds and story start times (drawn once here, fixed generator), and classes.json (brief class for the tally split).
// Run from this folder: node make-briefs.mjs
// Class "minimal" = a brief that gives the people nothing to do together (no shared business); "business" = the situation names a shared task or topic. Briefs are fresh (none used in earlier batches or checks).
import fs from 'node:fs';
const minimal = [['M1', 2, 'My cousin.'], ['M2', 4, 'People from my book club.'], ['M3', 2, 'My oldest friend.'], ['M4', 4, 'Friends from uni.'], ['M5', 2, 'Two old neighbours.']];
const business = [['B1', 5, 'Organising a school fundraiser.'], ['B2', 4, 'Friends planning a camping trip.'], ['B3', 3, 'Colleagues at a bakery.']];
const oracle = [['V1', 3, 'Friends deciding what to do on Sunday.', 'What time does the Science Museum in London close, and is entry free?'], ['V2', 3, 'A family sorting out a flight.', 'How long is the flight from Dublin to Edinburgh?']];
// design choice: start = day 0-6 after 2026-12-07, 07:00-22:55 in 5-minute steps (what the writer's own random start does)
let s = 20261207; const rnd = () => (s = (s * 1664525 + 1013904223) % 4294967296) / 4294967296;
const start = () => { const d = new Date(Date.UTC(2026, 11, 7 + Math.floor(rnd() * 7))), m = 7 * 60 + 5 * Math.floor(rnd() * 192); return d.toISOString().slice(0, 10) + 'T' + String(Math.floor(m / 60)).padStart(2, '0') + ':' + String(m % 60).padStart(2, '0'); };
const all = [...minimal, ...business, ...oracle], starts = {}; for (const [sc] of all) for (const k of [1, 2, 3]) starts[sc + k] = start();
const mk = (arm, list) => list.flatMap(([sc, people, brief, topic]) => [1, 2, 3].map(k => ({ label: `${arm}-${sc}${k}`, people, brief, ...(topic && { topic }), start: starts[sc + k] })));
for (const arm of ['W10', 'W11']) { fs.writeFileSync(`${import.meta.dirname}/briefs-${arm}-plain.json`, JSON.stringify(mk(arm, [...minimal, ...business]), null, 1)); fs.writeFileSync(`${import.meta.dirname}/briefs-${arm}-oracle.json`, JSON.stringify(mk(arm, oracle), null, 1)); }
fs.writeFileSync(`${import.meta.dirname}/classes.json`, JSON.stringify(Object.fromEntries([...minimal.map(m => [m[0], 'minimal']), ...[...business, ...oracle].map(m => [m[0], 'business'])])));

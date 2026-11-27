// Writes briefs-<arm>-<plain|oracle>.json for both arms (W9, W10): the same briefs, seeds and story start times (drawn once here, fixed generator), and classes.json (brief class for the tally split).
// Run from this folder: node make-briefs.mjs
// Class "minimal" = a brief that gives the people nothing to do together (no shared business); "business" = the situation names a shared task or topic.
import fs from 'node:fs';
const minimal = [['M1', 2, 'My mum.'], ['M2', 4, 'People I used to play football with.'], ['M3', 2, 'An ex who is still a friend.'], ['M4', 4, 'Friends from different parts of my life.'], ['M5', 2, 'Two people who met on holiday.']];
const business = [['B1', 4, 'Planning a surprise party for a friend.'], ['B2', 5, 'Volunteers at a food bank.'], ['B3', 4, 'Colleagues covering shifts at a vet clinic.']];
const oracle = [['V1', 3, 'Friends deciding where to go on Saturday.', 'What time does the Tate Modern close on a Friday, and is entry free?'], ['V2', 4, 'Colleagues sorting out a train to a conference.', 'What time is the first train from Leeds to London King\'s Cross on a Sunday?']];
// design choice: start = day 0-6 after 2026-11-30, 07:00-22:55 in 5-minute steps (what the writer's own random start does)
let s = 20261130; const rnd = () => (s = (s * 1664525 + 1013904223) % 4294967296) / 4294967296;
const start = () => { const d = new Date(Date.UTC(2026, 10, 30 + Math.floor(rnd() * 7))), m = 7 * 60 + 5 * Math.floor(rnd() * 192); return d.toISOString().slice(0, 10) + 'T' + String(Math.floor(m / 60)).padStart(2, '0') + ':' + String(m % 60).padStart(2, '0'); };
const all = [...minimal, ...business, ...oracle], starts = {}; for (const [sc] of all) for (const k of [1, 2, 3]) starts[sc + k] = start();
const mk = (arm, list) => list.flatMap(([sc, people, brief, topic]) => [1, 2, 3].map(k => ({ label: `${arm}-${sc}${k}`, people, brief, ...(topic && { topic }), start: starts[sc + k] })));
for (const arm of ['W9', 'W10']) { fs.writeFileSync(`briefs-${arm}-plain.json`, JSON.stringify(mk(arm, [...minimal, ...business]), null, 1)); fs.writeFileSync(`briefs-${arm}-oracle.json`, JSON.stringify(mk(arm, oracle), null, 1)); }
fs.writeFileSync('classes.json', JSON.stringify(Object.fromEntries([...minimal.map(m => [m[0], 'minimal']), ...[...business, ...oracle].map(m => [m[0], 'business'])])));

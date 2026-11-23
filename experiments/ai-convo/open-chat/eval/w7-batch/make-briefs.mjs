// Writes briefs-<arm>-<plain|oracle>.json for both arms (W6, W7): the same briefs, seeds and story start times (drawn once here, fixed generator).
// Run from this folder: node make-briefs.mjs
import fs from 'node:fs';
const plain = [['R1', 3, 'Night shift at a warehouse.'], ['R2', 2, 'My brother.'], ['R3', 5, 'Allotment society.'], ['R4', 6, 'Group chat for a wedding party.'], ['R5', 5, 'Teachers at a primary school.'], ['R6', 2, 'Two friends, one of them just got dumped.'], ['R7', 3, 'Dog walkers at the park.'], ['R8', 4, 'Friends planning a surprise party for someone.']];
const oracle = [['S1', 2, 'A couple planning a weekend in Edinburgh.', 'Is Edinburgh Castle open on Mondays in winter, and how much is a ticket?'], ['S2', 4, 'Friends going to a gig.', 'What time does the last Tube leave Brixton on a Saturday night?']];
// design choice: start = day 0-6 after 2026-11-23, 07:00-22:55 in 5-minute steps (what the writer's own random start does)
let s = 987654; const rnd = () => (s = (s * 1664525 + 1013904223) % 4294967296) / 4294967296;
const start = () => { const d = new Date(Date.UTC(2026, 10, 23 + Math.floor(rnd() * 7))), m = 7 * 60 + 5 * Math.floor(rnd() * 192); return d.toISOString().slice(0, 10) + 'T' + String(Math.floor(m / 60)).padStart(2, '0') + ':' + String(m % 60).padStart(2, '0'); };
const starts = {}; for (const [sc] of [...plain, ...oracle]) for (const k of [1, 2, 3]) starts[sc + k] = start();
const mk = (arm, list) => list.flatMap(([sc, people, brief, topic]) => [1, 2, 3].map(k => ({ label: `${arm}-${sc}${k}`, people, brief, ...(topic && { topic }), start: starts[sc + k] })));
for (const arm of ['W6', 'W7']) { fs.writeFileSync(`briefs-${arm}-plain.json`, JSON.stringify(mk(arm, plain), null, 1)); fs.writeFileSync(`briefs-${arm}-oracle.json`, JSON.stringify(mk(arm, oracle), null, 1)); }

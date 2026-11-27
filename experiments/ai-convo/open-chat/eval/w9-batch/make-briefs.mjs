// Writes briefs-<arm>-<plain|oracle>.json for both arms (W7, W9): the same briefs, seeds and story start times (drawn once here, fixed generator).
// Run from this folder: node make-briefs.mjs
import fs from 'node:fs';
const plain = [['Z1', 3, 'Old university housemates.'], ['Z2', 2, 'My aunt.'], ['Z3', 5, 'Parkrun regulars.'], ['Z4', 6, 'Staff at a small cafe.'], ['Z5', 4, 'Parents running a school fundraiser.'], ['Z6', 2, 'Two colleagues who share a lift to work.'], ['Z7', 3, 'Siblings sorting out their mum\'s birthday.'], ['Z8', 5, 'Community garden volunteers.']];
const oracle = [['V1', 3, 'Friends planning a night out in Glasgow.', 'What time does the last train from Glasgow Central to Edinburgh leave on a Saturday?'], ['V2', 4, 'A family planning a visit to the Eden Project.', 'How much is an adult day ticket at the Eden Project, and is it open in December?']];
// design choice: start = day 0-6 after 2026-11-28, 07:00-22:55 in 5-minute steps (what the writer's own random start does)
let s = 987654; const rnd = () => (s = (s * 1664525 + 1013904223) % 4294967296) / 4294967296;
const start = () => { const d = new Date(Date.UTC(2026, 10, 28 + Math.floor(rnd() * 7))), m = 7 * 60 + 5 * Math.floor(rnd() * 192); return d.toISOString().slice(0, 10) + 'T' + String(Math.floor(m / 60)).padStart(2, '0') + ':' + String(m % 60).padStart(2, '0'); };
const starts = {}; for (const [sc] of [...plain, ...oracle]) for (const k of [1, 2, 3]) starts[sc + k] = start();
// two starts forced into 22:00-23:59
starts.Z11 = '2026-11-30T22:40'; starts.V22 = '2026-12-02T23:15';
const mk = (arm, list) => list.flatMap(([sc, people, brief, topic]) => [1, 2, 3].map(k => ({ label: `${arm}-${sc}${k}`, people, brief, ...(topic && { topic }), start: starts[sc + k] })));
for (const arm of ['W7', 'W9']) { fs.writeFileSync(`briefs-${arm}-plain.json`, JSON.stringify(mk(arm, plain), null, 1)); fs.writeFileSync(`briefs-${arm}-oracle.json`, JSON.stringify(mk(arm, oracle), null, 1)); }

// Writes briefs-<arm>-<plain|oracle>.json for both arms (W7, W8): the same briefs, seeds and story start times (drawn once here, fixed generator).
// Run from this folder: node make-briefs.mjs
import fs from 'node:fs';
const plain = [['X1', 3, 'Bandmates.'], ['X2', 2, 'My old flatmate.'], ['X3', 5, 'Cycling club ride organisers.'], ['X4', 6, 'Colleagues at a small architecture office.'], ['X5', 4, 'Parents of kids on a swimming team.'], ['X6', 2, 'Two friends trying to meet up this weekend.'], ['X7', 3, 'Market stall holders.'], ['X8', 5, 'A fantasy football league.']];
const oracle = [['Y1', 2, 'A couple planning a trip to Lisbon.', 'What is the cheapest way to get from Lisbon airport to the city centre, and how long does it take?'], ['Y2', 4, 'Friends going to a football match.', 'What is the bag size limit at the Emirates Stadium?']];
// design choice: start = day 0-6 after 2026-11-23, 07:00-22:55 in 5-minute steps (what the writer's own random start does)
let s = 424242; const rnd = () => (s = (s * 1664525 + 1013904223) % 4294967296) / 4294967296;
const start = () => { const d = new Date(Date.UTC(2026, 10, 23 + Math.floor(rnd() * 7))), m = 7 * 60 + 5 * Math.floor(rnd() * 192); return d.toISOString().slice(0, 10) + 'T' + String(Math.floor(m / 60)).padStart(2, '0') + ':' + String(m % 60).padStart(2, '0'); };
const starts = {}; for (const [sc] of [...plain, ...oracle]) for (const k of [1, 2, 3]) starts[sc + k] = start();
// two starts forced into 22:00-23:59 (the plan asks for at least one)
starts.X11 = '2026-11-25T22:40'; starts.Y22 = '2026-11-27T23:15';
const mk = (arm, list) => list.flatMap(([sc, people, brief, topic]) => [1, 2, 3].map(k => ({ label: `${arm}-${sc}${k}`, people, brief, ...(topic && { topic }), start: starts[sc + k] })));
for (const arm of ['W7', 'W8']) { fs.writeFileSync(`briefs-${arm}-plain.json`, JSON.stringify(mk(arm, plain), null, 1)); fs.writeFileSync(`briefs-${arm}-oracle.json`, JSON.stringify(mk(arm, oracle), null, 1)); }

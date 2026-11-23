// Writes briefs-<arm>-<plain|oracle>.json for both arms: the same briefs, seeds and story start times (drawn once here, fixed generator).
// Run from this folder: node make-briefs.mjs
import fs from 'node:fs';
const plain = [['P1', 5, 'Choir.'], ['P2', 2, 'My dad.'], ['P3', 3, 'Climbing gym regulars.'], ['P4', 4, 'Students on a group project.'], ['P5', 5, 'Staff at a small accountancy firm.'], ['P6', 6, 'Friends organising a stag weekend.'], ['P7', 2, 'Two friends, one of them just got a puppy.'], ['P8', 4, 'Volunteers at a food bank.']];
const oracle = [['Q1', 3, 'Friends planning a weekend walk.', 'Is the Cat Bells walk in the Lake District open all year, and how long does the main route take?'], ['Q2', 3, 'Siblings planning a birthday outing for their mum.', 'What are the opening hours of the Eden Project in Cornwall in December?']];
// design choice: start = day 0-6 after 2026-11-23, 07:00-22:55 in 5-minute steps (what W6's own random start does)
let s = 12345; const rnd = () => (s = (s * 1664525 + 1013904223) % 4294967296) / 4294967296;
const start = () => { const d = new Date(Date.UTC(2026, 10, 23 + Math.floor(rnd() * 7))), m = 7 * 60 + 5 * Math.floor(rnd() * 192); return d.toISOString().slice(0, 10) + 'T' + String(Math.floor(m / 60)).padStart(2, '0') + ':' + String(m % 60).padStart(2, '0'); };
const starts = {}; for (const [sc] of [...plain, ...oracle]) for (const k of [1, 2, 3]) starts[sc + k] = start();
const mk = (arm, list) => list.flatMap(([sc, people, brief, topic]) => [1, 2, 3].map(k => ({ label: `${arm}-${sc}${k}`, people, brief, ...(topic && { topic }), start: starts[sc + k] })));
for (const arm of ['W5', 'W6']) { fs.writeFileSync(`briefs-${arm}-plain.json`, JSON.stringify(mk(arm, plain), null, 1)); fs.writeFileSync(`briefs-${arm}-oracle.json`, JSON.stringify(mk(arm, oracle), null, 1)); }

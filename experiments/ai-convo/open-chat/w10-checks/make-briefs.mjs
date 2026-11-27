// node w10-checks/make-briefs.mjs  writes the W10 cheap-check brief sets (same briefs and starts for the W9 and W10 arms).
import fs from 'node:fs'; const d = import.meta.dirname;
let s = 424242; const rnd = () => (s = (s * 1664525 + 1013904223) % 4294967296) / 4294967296;
const start = () => { const t = new Date(Date.UTC(2026, 10, 30 + Math.floor(rnd() * 7))), m = 7 * 60 + 5 * Math.floor(rnd() * 192); return t.toISOString().slice(0, 10) + 'T' + String(Math.floor(m / 60)).padStart(2, '0') + ':' + String(m % 60).padStart(2, '0'); };
const minimal = [[2, 'My brother.'], [3, 'Neighbours.'], [2, 'Two people who used to work together.'], [2, 'My sister.'], [4, 'The people on my street.'], [2, 'My best friend from school.']];
const plain = [[4, 'Dog walkers at the park.'], [3, 'Old colleagues.'], [2, 'My dad.'], [6, 'Choir members.'], [3, 'Housemates.'], [4, 'Friends from a language class.'], [2, 'Brothers.'], [4, 'Allotment neighbours.']];
const mk = (pre, list, seeds) => list.flatMap(([people, brief], i) => Array.from({ length: seeds }, (_, k) => ({ label: `${pre}-${i + 1}${k + 1}`, people, brief, days: 2, start: start() })));
const m = mk('X', minimal, 2), p = mk('Y', plain, 1);
for (const arm of ['W9', 'W10']) { fs.writeFileSync(`${d}/briefs-minimal-${arm}.json`, JSON.stringify(m.map(b => ({ ...b, label: `${arm}-${b.label}` })))); fs.writeFileSync(`${d}/briefs-plain-${arm}.json`, JSON.stringify(p.map(b => ({ ...b, label: `${arm}-${b.label}` })))); }
fs.writeFileSync(`${d}/briefs-casting.json`, JSON.stringify(JSON.parse(fs.readFileSync(d + '/../w9-checks/briefs-casting.json', 'utf8')).map(b => ({ ...b, label: b.label.replace('W9-', 'W10-') }))));

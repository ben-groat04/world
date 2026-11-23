// node w7-checks/make-briefs.mjs: writes w7-checks/briefs-casting.json (casts for items 1-5, 8; run with --gen --days 0)
// P1-P8 and Q1-Q2 are the W6 batch briefs (3 seeds), U1-U3 the old scenarios (2 seeds), plus two family briefs (2 seeds).
import fs from 'node:fs'; import path from 'node:path';
const P = [['P1', 5, 'Choir.'], ['P2', 2, 'My dad.'], ['P3', 3, 'Climbing gym regulars.'], ['P4', 4, 'Students on a group project.'], ['P5', 5, 'Staff at a small accountancy firm.'], ['P6', 6, 'Friends organising a stag weekend.'], ['P7', 2, 'Two friends, one of them just got a puppy.'], ['P8', 4, 'Volunteers at a food bank.']];
const Q = [['Q1', 3, 'Friends planning a weekend walk.', 'Is the Cat Bells walk in the Lake District open all year, and how long does the main route take?'], ['Q2', 3, 'Siblings planning a birthday outing for their mum.', 'What are the opening hours of the Eden Project in Cornwall in December?']];
const U = [['U1', 4, "You're housemates."], ['U2', 2, 'Old school friends who live in different cities now.'], ['U3', 5, 'Cousins.'], ['F1', 2, 'Me and my sister.'], ['F2', 2, 'My dad.']];
const mk = (list, n) => list.flatMap(([sc, people, brief, topic]) => Array.from({ length: n }, (_, k) => ({ label: `W7-${sc}${k + 1}`, people, brief, ...(topic && { topic }) })));
fs.writeFileSync(path.join(import.meta.dirname, 'briefs-casting.json'), JSON.stringify([...mk(P, 3), ...mk(Q, 3), ...mk(U, 2)]));

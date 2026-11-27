// node w9-checks/make-briefs.mjs  writes briefs-casting.json (the W8-checks casting set: the 10 W7-batch briefs x 3 seeds, --gen --days 0), briefs-plain.json (8 fresh plain briefs, 1 seed, 2 days), briefs-meet.json (the X6 brief x 3 seeds, 2 days).
import fs from 'node:fs'; const d = import.meta.dirname;
const casting = JSON.parse(fs.readFileSync(d + '/../w8-checks/briefs-casting.json', 'utf8')).map(b => ({ ...b, label: b.label.replace('W8-', 'W9-') }));
const plain = [[3, 'Neighbours on the same landing.'], [2, 'My cousin.'], [5, 'Book club.'], [6, 'Rugby club committee.'], [4, 'People who share a taxi to work.'], [2, 'Two friends, one is moving abroad.'], [3, 'The kids\' football lift rota.'], [5, 'Group project for a course.']];
fs.writeFileSync(d + '/briefs-casting.json', JSON.stringify(casting));
fs.writeFileSync(d + '/briefs-plain.json', JSON.stringify(plain.map(([people, brief], i) => ({ label: `W9-P${i + 1}`, people, brief, days: 2 }))));
fs.writeFileSync(d + '/briefs-meet.json', JSON.stringify([1, 2, 3].map(s => ({ label: `W9-M${s}`, people: 2, brief: 'Two friends trying to meet up this weekend.', days: 2 }))));

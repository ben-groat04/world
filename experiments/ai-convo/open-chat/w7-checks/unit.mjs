// W7 unit checks: node w7-checks/unit.mjs
// writer.mjs runs on import, so the pieces under test are cut out of its source by marker and evaluated with stubs.
import fs from 'node:fs'; import path from 'node:path';
const src = fs.readFileSync(path.join(import.meta.dirname, '..', 'writer.mjs'), 'utf8');
const cut = (a, b) => { const i = src.indexOf(a), j = src.indexOf(b, i); if (i < 0 || j < 0) throw new Error('marker ' + a); return src.slice(i, j); };
const mk = body => new Function('fs', 'path', 'ENV_NOTE', 'hhmm', 'ORACLE', body);
// item 1 and 2: parsePeople
const pp = new Function('pick', cut('function parsePeople', '\nconst castPrompt') + '\nreturn parsePeople;')(a => a[0]);
const call1 = 'Place: Leeds, England\nPerson 1: 34, man, the father | names: Pieter, Jan | work: software developer; project manager; architect; sales manager\nPerson 2: 30, woman, the daughter | names: Anna | work: nurse, teacher';
const r = pp(call1, 2); console.log('parsePeople', JSON.stringify(r));
console.log('work is a single entry, no ";":', r.people[0].work === 'software developer' && !r.people.some(p => p.work.includes(';')));
console.log('no Place line gives null:', pp(call1.split('\n').slice(1).join('\n'), 2) === null, '| Place: none ->', JSON.stringify(pp('Place: none.\nPerson 1: AI | names: Ava | work: assistant', 1)?.place));
// item 6: spans
const body = cut("const WD = ['Sun'", "// baseline.mjs's parse/dated") + '\nreturn promptFor;';
const promptFor = mk(body.replace(/^.*\bimport\b.*$/m, ''))(fs, path, '', () => '', false);
const c = { names: ['A', 'B'], cast: { A: { who: 'x' }, B: { who: 'y' } }, topic: null, opener: 'say hi', situation: 's', setting: 's', private_lines: {}, sleep: {} };
const span = (so_far, from, to, resume) => { const t = promptFor({ ...c, cast: {}, names: [] }, null, so_far, from, to, resume, so_far.length ? '2026-11-23T04:00' : from.slice(0, 10) + 'T00:00'); return (t.match(/\n((?:Write the messages|Continue the chat)[^\n]*)\n/) || [])[1]; };
const day = at => new Date(at + ':00Z'), fri = '2026-11-27T22:20', sunEnd = '2026-11-29T04:00', satStart = '2026-11-28T01:00', monLater = '2026-11-23T01:05';
console.log('Fri 22:20 -> Sun 04:00:', span([], fri, sunEnd));
console.log('Sat 01:00 -> Sun 04:00:', span([], satStart, sunEnd));
console.log('later chunk from Mon 01:05, end Tue 04:00:', span([{ at: monLater, who: 'A', text: 't', reacts: [] }], monLater, '2026-11-24T04:00'));
console.log('resume Sat 02:00 in chunk ending Sun 04:00:', span([{ at: satStart, who: 'A', text: 't', reacts: [] }], '2026-11-28T02:00', sunEnd, true));

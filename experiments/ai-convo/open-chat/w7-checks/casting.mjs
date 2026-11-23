// W7 casting checks: node w7-checks/casting.mjs <list file>   (labels like W7-P12: scenario P1, seed 2)
import fs from 'node:fs'; import path from 'node:path';
const src = fs.readFileSync(path.join(import.meta.dirname, '..', 'writer.mjs'), 'utf8'), PLACES = new Function(`return ${src.match(/const PLACES = (\[.*?\]);/)[1]}`)();
const rows = fs.readFileSync(process.argv[2], 'utf8').split('\n').filter(Boolean).map(l => { const [label, d] = l.split(' '); return { label, sc: label.match(/-(\w+?)\d$/)[1], c: fs.readFileSync(d + '/log.jsonl', 'utf8').split('\n').filter(Boolean).map(x => JSON.parse(x)).find(r => r.cast) }; });
const TRAIT = /the one who|always|never|joker|organi[sz]ed|easygoing|tease|funny|dry|quiet|loud|can't stand|known for|reliable|formal/i, PURPOSE = /(mostly|usually|especially|often) (to|when|with|about)|, (to|when)/i, STYLEBAD = /full words|no abbreviations|complete|proper|formal/i, EMOJI = /\p{Extended_Pictographic}|["'“‘][^"'”’]{1,12}["'”’]/u;
const ppl = rows.flatMap(r => r.c.names.map(n => ({ ...r, n, p: r.c.cast[n] })));
const f = (name, xs) => console.log(`${name}: ${xs.length}${xs.length ? '  ' + JSON.stringify(xs.slice(0, 8)) : ''}`);
console.log({ casts: rows.length, people: ppl.length });
f('work fields with ";" or "|"', ppl.filter(x => /[;|]/.test(x.p.work)).map(x => x.p.work));
f('life lines mentioning 3+ jobs (flag, check by eye)', ppl.filter(x => (x.c.private_lines[x.n].match(/\b(shifts?|lectures?|tutoring|delivering|driving|cooking|studying)\b/gi) || []).length >= 3).map(x => `${x.label} ${x.n}: ${x.c.private_lines[x.n].slice(0, 160)}`));
f('style lines with an emoji or quoted token', ppl.filter(x => EMOJI.test(x.p.style)).map(x => x.p.style));
f('style lines with full words/no abbreviations/complete/proper/formal', ppl.filter(x => STYLEBAD.test(x.p.style)).map(x => x.p.style));
console.log('style none:', ppl.filter(x => /^\W*none\b/i.test(x.p.style)).length, 'of', ppl.length, '| sample', ppl.slice(0, 6).map(x => x.p.style));
f(`knows lines with a trait word (of ${ppl.length})`, ppl.filter(x => TRAIT.test(x.p.knows)).map(x => x.p.knows));
f('texts lines with a purpose clause', ppl.filter(x => PURPOSE.test(x.p.texts)).map(x => x.p.texts));
const cl = sc => rows.filter(r => sc.includes(r.sc)); const placeOf = r => r.c.place;
const plain = rows.filter(r => /^P/.test(r.sc)), inList = plain.filter(r => PLACES.includes(placeOf(r)));
console.log(`plain casts (P) with the drawn-list place: ${inList.length} of ${plain.length}; distinct places ${new Set(plain.map(placeOf)).size}`);
for (const sc of ['Q1', 'Q2']) console.log(sc, 'places:', cl([sc]).map(placeOf));
console.log('U/F places:', rows.filter(r => /^[UF]/.test(r.sc)).map(r => `${r.label}: ${placeOf(r)}`).join('; '));
const by = {}; for (const r of rows.filter(r => /^P/.test(r.sc))) (by[r.sc] ??= []).push(r);
let full = 0, arrange = 0, tot = 0; const ARR = /\b(ask|organi[sz]e|arrange|plan|propose|suggest|check|confirm|see who|find out|poll)\b/i;
for (const [sc, rs] of Object.entries(by)) { const op = rs.map(r => r.c.opener), d = new Set(op).size; if (d === rs.length) full++; tot += rs.length; arrange += op.filter(o => ARR.test(o)).length; console.log(sc, `${d}/${rs.length} distinct`, op); }
console.log(`briefs with all-distinct openers: ${full} of ${Object.keys(by).length}; openers whose chosen line matches the arrange regex: ${arrange} of ${tot}; options per cast: ${rows.filter(r => r.c.openers?.length).map(r => r.c.openers.length).join(',')}`);
console.log('family names:'); for (const r of rows.filter(r => /^(P2|F1|F2|U3)$/.test(r.sc))) console.log(' ', r.label, r.c.names.join(', '), '|', r.c.place);

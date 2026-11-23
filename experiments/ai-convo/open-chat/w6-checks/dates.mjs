// weekday/date agreement: node w6-checks/dates.mjs <list>...  Counts "<weekday> <day> <month>" and "<day>(st|nd|rd|th)? is a <weekday>" mentions and checks them with Date (year of the chat's first message, or the next one if the date is already past by more than 2 months).
import fs from 'node:fs';
const DN = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'], MN = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'];
let n = 0, bad = 0; const ex = [];
for (const lf of process.argv.slice(2)) for (const l of fs.readFileSync(lf, 'utf8').split('\n').filter(Boolean)) { const rows = fs.readFileSync(l.split(' ')[1] + '/log.jsonl', 'utf8').split('\n').filter(Boolean).map(x => JSON.parse(x)); const ms = rows.filter(r => r.posted === true && r.text && !r.oracle), y0 = +ms[0].at.slice(0, 4), m0 = +ms[0].at.slice(5, 7) - 1;
  const chk = (wd, d, mon, t) => { const mi = MN.indexOf(mon.slice(0, 3).toLowerCase()); if (mi < 0) return; n++; const y = y0 + (mi < m0 - 2 ? 1 : 0); if (new Date(Date.UTC(y, mi, +d)).getUTCDay() !== DN.indexOf(wd.slice(0, 3).toLowerCase())) { bad++; ex.push(t.slice(0, 80)); } };
  for (const m of ms) { for (const x of m.text.matchAll(/\b(Mon|Tues?|Wed(?:nes)?|Thu(?:rs)?|Fri|Sat(?:ur)?|Sun)(?:day)?,?\s+(?:the\s+)?(\d{1,2})(?:st|nd|rd|th)?(?:\s+of)?\s+([A-Z][a-z]{2,8})/g)) chk(x[1], x[2], x[3], m.text);
    for (const x of m.text.matchAll(/\b(Mon|Tues?|Wed(?:nes)?|Thu(?:rs)?|Fri|Sat(?:ur)?|Sun)(?:day)?,?\s+([A-Z][a-z]{2,8})\s+(\d{1,2})\b/g)) chk(x[1], x[3], x[2], m.text); } }
console.log({ checked: n, mismatches: bad, ex });

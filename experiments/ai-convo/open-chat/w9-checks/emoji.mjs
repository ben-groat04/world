// node w9-checks/emoji.mjs <list file or runs folder>...: people (5+ messages) by share of messages with an emoji (>=40%, >=60%, 0%, >=30%), empty messages, and the emoji share of messages.
import fs from 'node:fs'; import path from 'node:path';
const EM = /\p{Extended_Pictographic}/u, dirsOf = a => fs.statSync(a).isFile() ? fs.readFileSync(a, 'utf8').split('\n').filter(Boolean).map(l => l.split(' ')[1]) : fs.readdirSync(a).map(x => path.join(a, x)).filter(x => fs.existsSync(path.join(x, 'log.jsonl')));
let p = 0, p40 = 0, p60 = 0, p0 = 0, p30 = 0, empty = 0, n = 0, e = 0;
for (const a of process.argv.slice(2)) for (const d of dirsOf(a)) { const hum = fs.readFileSync(path.join(d, 'log.jsonl'), 'utf8').split('\n').filter(Boolean).map(l => JSON.parse(l)).filter(r => r.posted === true && typeof r.text === 'string' && !r.oracle), by = {};
  for (const m of hum) { n++; if (!m.text.trim()) empty++; if (EM.test(m.text)) e++; (by[m.who] ??= []).push(m); }
  for (const xs of Object.values(by)) if (xs.length >= 5) { p++; const s = xs.filter(m => EM.test(m.text)).length / xs.length; if (s >= .4) p40++; if (s >= .6) p60++; if (s === 0) p0++; if (s >= .3) p30++; } }
console.log(`messages ${n}, emoji ${(100 * e / n).toFixed(1)}%, empty ${empty}; people>=5 msgs ${p}: >=40% ${p40}, >=60% ${p60}, 0% ${p0}, >=30% ${p30}`);

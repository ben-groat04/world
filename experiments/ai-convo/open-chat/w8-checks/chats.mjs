// W8 chat metrics: node w8-checks/chats.mjs <name> <dir-or-list>...   (a list file with "label dir" lines, a folder holding chat folders, or one chat folder). One block of numbers per argument; per-chat detail with DETAIL=1.
import fs from 'node:fs'; import path from 'node:path';
const rowsOf = d => fs.readFileSync(path.join(d, 'log.jsonl'), 'utf8').split('\n').filter(Boolean).map(l => JSON.parse(l));
const dirsOf = a => fs.statSync(a).isFile() ? fs.readFileSync(a, 'utf8').split('\n').filter(Boolean).map(l => l.split(' ')[1]) : fs.existsSync(path.join(a, 'log.jsonl')) ? [a] : fs.readdirSync(a).map(x => path.join(a, x)).filter(x => fs.existsSync(path.join(x, 'log.jsonl')));
const EM = /\p{Extended_Pictographic}/u, T = t => +new Date(t + ':00Z'), med = xs => xs.length ? [...xs].sort((p, q) => p - q)[Math.floor(xs.length / 2)] : '-', mean = xs => xs.length ? (xs.reduce((s, x) => s + x, 0) / xs.length).toFixed(2) : '-';
// status messages (plan item 4): the sender reporting their own state or whereabouts
const STATUS = /\b(going to (sleep|bed)|off to (bed|sleep)|sleeping soon|night all|just woke|woke up|on (a )?break|service done|off shift|class done|on site|between jobs|just off|got home|shift (done|over)|at work|on shift|leaving for|on my way)\b|^\W*(up|morning|break|lunch|home|night|goodnight)\W*$/i;
const STOP = new Set('what with that this have from your does they them will when where which about there their would could should much many open'.split(' '));
const tot = { chats: 0, msgs: 0, days: 0, emoji: 0, status: 0, gaps: 0, pairs: 0, formal: 0, p5: 0, p60: 0, p0: 0, p30: 0, formalMax: 0, formalP30: 0, pieces: [], span: [], group: 0, topLot: 0, rarely: [], answers: [], first: [], stretches: 0, calls: 0, quiet: 0, rejects: 0, openers: [], statusRepeat: 0 };
for (const d of dirsOf(process.argv[3] ?? process.argv[2])) {
  const rows = rowsOf(d), head = rows[0], c = rows[1], ms = rows.filter(r => r.posted === true && r.text), hum = ms.filter(r => !r.oracle), N = c.names.length; tot.chats++; tot.msgs += hum.length; tot.days += head.days ?? 0;
  tot.stretches += head.stretches ?? 0; tot.quiet += head.quiet ?? 0; tot.rejects += head.rejects ?? 0; tot.calls += (head.usage ?? []).length;
  tot.emoji += hum.filter(x => EM.test(x.text)).length; tot.status += hum.filter(x => STATUS.test(x.text)).length;
  for (let i = 1; i < hum.length; i++) { tot.pairs++; if (T(hum[i].at) - T(hum[i - 1].at) <= 2 * 6e4) tot.gaps++; }
  const long = x => /^\p{Lu}/u.test(x.text) && x.text.split(/\s+/).length > 12 && !/['’]/.test(x.text); tot.formal += hum.filter(long).length;
  const by = {}; for (const x of hum) (by[x.who] ??= []).push(x);
  for (const [w, xs] of Object.entries(by)) if (xs.length >= 5) { tot.p5++; const e = xs.filter(x => EM.test(x.text)).length / xs.length, f = xs.filter(long).length / xs.length; if (e >= .6) tot.p60++; if (e === 0) tot.p0++; if (e >= .3) tot.p30++; tot.formalMax = Math.max(tot.formalMax, f); if (f > .3) tot.formalP30++; }
  if (N >= 3) { tot.group++; const cnt = Object.fromEntries(c.names.map(n => [n, (by[n] ?? []).length])), top = Object.entries(cnt).sort((a, b) => b[1] - a[1])[0][0], lot = c.names.find(n => /a lot/.test(c.cast[n].texts ?? ''));
    if (lot && top === lot) tot.topLot++; for (const n of c.names) if (/only now and again/.test(c.cast[n].texts ?? '')) tot.rarely.push(cnt[n] / hum.length); }
  const pieces = {}; for (const x of hum) if (x.stretch) (pieces[x.stretch] ??= []).push(x); for (const p of Object.values(pieces)) { tot.pieces.push(p.length); tot.span.push((T(p.at(-1).at) - T(p[0].at)) / 6e4); }
  const days = {}; for (const x of hum) ((days[x.who] ??= {})[x.at.slice(0, 10)] ??= []).push(x.text.split(/\s+/).slice(0, 2).join(' ').toLowerCase()); // same two-word opener on 2+ days, for a status message
  for (const [w, dd] of Object.entries(days)) { const openers = Object.values(dd).map(v => v.find(o => STATUS.test(o))).filter(Boolean); if (new Set(openers).size < openers.length) tot.statusRepeat++; }
  const o = c.openers ?? []; if (c.topic && hum[0]) { const tw = [...new Set(c.topic.toLowerCase().match(/[a-z]{4,}/g).filter(w => !STOP.has(w)))], fw = new Set(hum[0].text.toLowerCase().match(/[a-z]{4,}/g) ?? []); tot.first.push(tw.filter(w => fw.has(w)).length / tw.length); }
  if (c.topic) tot.openers.push(hum[0]?.text.slice(0, 70));
  for (const x of ms.filter(r => r.oracle)) tot.answers.push({ words: x.text.split(/\s+/).length, urls: (x.text.match(/https?:\/\/\S+/g) || []).length, source: /\bsources?\s*:/i.test(x.text), method: /snippet|search result|I searched|I checked the sources|didn't open|couldn't open/i.test(x.text), text: x.text });
  if (process.env.DETAIL) console.log(path.basename(d), `msgs ${hum.length} stretches ${head.stretches} quiet ${head.quiet} rejects ${head.rejects} answers ${ms.length - hum.length}`);
}
const pc = (a, b) => (100 * a / Math.max(1, b)).toFixed(1) + '%', A = tot.answers;
console.log(`${process.argv[2]}: chats ${tot.chats}, msgs ${tot.msgs} (${(tot.msgs / Math.max(1, tot.days)).toFixed(0)} per day per chat sum), emoji share ${pc(tot.emoji, tot.msgs)}, status share ${pc(tot.status, tot.msgs)}, gaps<=2min ${pc(tot.gaps, tot.pairs)}`);
console.log(`  people>=5 msgs ${tot.p5}: emoji>=60% ${tot.p60}, emoji 0% ${tot.p0}, emoji>=30% ${tot.p30}; long formal share ${pc(tot.formal, tot.msgs)}, max per person ${(100 * tot.formalMax).toFixed(0)}%, people over 30% ${tot.formalP30}; same status opener on 2 days: ${tot.statusRepeat} people`);
console.log(`  groups ${tot.group}: "a lot" person top sender in ${tot.topLot}; mean share of "only now and again" people ${mean(tot.rarely)}`);
console.log(`  stretch pieces ${tot.pieces.length} (median msgs ${med(tot.pieces)}, median span ${med(tot.span).toFixed ? med(tot.span).toFixed(0) : '-'} min), stretches ${tot.stretches}, quiet ${tot.quiet}, calls ${tot.calls}, stamp rejects ${tot.rejects}`);
if (tot.first.length) console.log(`  topic-word share of first message: median ${med(tot.first).toFixed(2)}, max ${Math.max(...tot.first).toFixed(2)}; first messages: ${tot.openers.join(' || ')}`);
if (A.length) console.log(`  @claude answers ${A.length}: Source label ${A.filter(a => a.source).length}, method talk ${A.filter(a => a.method).length}, >1 URL ${A.filter(a => a.urls > 1).length}, with a URL ${A.filter(a => a.urls).length}, median words ${med(A.map(a => a.words))}`);
if (process.env.ANSWERS) for (const a of A) console.log('  > ' + a.text.replace(/\n/g, ' '));

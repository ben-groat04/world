// W3 checks. node w3-checks/metrics.mjs <list>... : pooled over all runs in the lists: night (00-06) share, messages in the sender's sleep hours, at 04:0x, first-evening count (start to 04:00) per run, thinking share of calls, <=4-word share, capital-start minus lowercase-start mean words, cast-sheet words recurring (4+ messages, 2+ senders, 2+ days), calls.
import fs from 'node:fs';
const rows = d => fs.readFileSync(d + '/log.jsonl', 'utf8').split('\n').filter(Boolean).map(l => JSON.parse(l));
const T = { runs: 0, n: 0, night: 0, sleep: 0, h04: 0, eve: 0, calls: 0, think: 0, short: 0, capN: 0, capW: 0, lowN: 0, lowW: 0, recur: 0, perDay: 0, days: 0 };
const stop = new Set('that this with have from they them what when were been will your about there their would could just like know into than then also some more over very much only back still even want need make going think because after before'.split(' '));
for (const f of process.argv.slice(2)) for (const l of fs.readFileSync(f, 'utf8').split('\n').filter(x => x.trim())) {
  const [label, dir] = l.trim().split(/\s+/), r = rows(dir), c = r.find(x => x.cast), m = r.filter(x => x.posted === true && x.text); T.runs++;
  for (const u of r[0].usage ?? []) { T.calls++; if ((u.output_tokens_details?.thinking_tokens ?? 0) > 0) T.think++; }
  const start = +new Date(m[0].at + ':00Z'), d4 = new Date(start); d4.setUTCHours(4, 0, 0, 0); let e4 = +d4; while (e4 <= start) e4 += 864e5;
  T.perDay += m.length / ((+new Date(m.at(-1).at + ':00Z') - start) / 864e5); T.days++;
  const cast = new Set([c.setting, ...c.names.flatMap(n => [c.cast[n].knows, c.private_lines[n], c.cast[n].like])].join(' ').toLowerCase().match(/\p{L}{5,}/gu).filter(w => !stop.has(w)));
  const hits = {};
  for (const x of m) { T.n++; const h = +x.at.slice(11, 13), hf = h + +x.at.slice(14, 16) / 60, ms = +new Date(x.at + ':00Z');
    if (h < 6) T.night++; if (x.at.slice(11, 13) === '04') T.h04++; if (ms < e4) T.eve++;
    const [s, e] = c.sleep?.[x.who] ?? [23, 7]; if (s > e ? (hf >= s || hf < e) : (hf >= s && hf < e)) T.sleep++;
    const w = x.text.split(/\s+/).filter(Boolean).length; if (w <= 4) T.short++; if (/^\p{Lu}/u.test(x.text)) { T.capN++; T.capW += w; } else if (/^\p{Ll}/u.test(x.text)) { T.lowN++; T.lowW += w; }
    for (const word of new Set(x.text.toLowerCase().match(/\p{L}{5,}/gu) ?? [])) if (cast.has(word)) { const o = hits[word] ??= { n: 0, who: new Set(), day: new Set() }; o.n++; o.who.add(x.who); o.day.add(x.at.slice(0, 10)); } }
  T.recur += Object.values(hits).filter(o => o.n >= 4 && o.who.size >= 2 && o.day.size >= 2).length;
}
const pc = (a, b) => (100 * a / b).toFixed(1) + '%', R = T.runs;
console.log(`runs ${R}, msgs ${T.n}, per 24h ${(T.perDay / T.days).toFixed(1)}\n00-06h ${pc(T.night, T.n)}; in sender sleep hours ${pc(T.sleep, T.n)}; at 04:0x ${T.h04}\nfirst evening (start to 04:00) per run ${(T.eve / R).toFixed(1)}\nthinking in ${T.think}/${T.calls} calls = ${pc(T.think, T.calls)}\n<=4 words ${pc(T.short, T.n)}; capital-start mean words ${(T.capW / T.capN).toFixed(1)} (${T.capN}), lowercase ${(T.lowW / T.lowN).toFixed(1)} (${T.lowN}), gap ${(T.capW / T.capN - T.lowW / T.lowN).toFixed(1)}\ncast words recurring (4+ msgs, 2+ senders, 2+ days) per run ${(T.recur / R).toFixed(1)}`);

// W7 chat metrics: node w7-checks/chats.mjs <label> <dir-or-list>...   (a list file with "label dir" lines, or a folder holding chat folders, or one chat folder). Prints one line of numbers per argument.
import fs from 'node:fs'; import path from 'node:path';
const rowsOf = d => fs.readFileSync(path.join(d, 'log.jsonl'), 'utf8').split('\n').filter(Boolean).map(l => JSON.parse(l));
const dirsOf = a => fs.statSync(a).isFile() ? fs.readFileSync(a, 'utf8').split('\n').filter(Boolean).map(l => l.split(' ')[1]) : fs.existsSync(path.join(a, 'log.jsonl')) ? [a] : fs.readdirSync(a).map(x => path.join(a, x)).filter(x => fs.existsSync(path.join(x, 'log.jsonl')));
const EM = /\p{Extended_Pictographic}️?/gu, T = t => +new Date(t + ':00Z');
function chunkEnds(startAt) { const t0 = T(startAt), d = new Date(t0); d.setUTCHours(4, 0, 0, 0); let t = +d; while (t <= t0) t += 864e5; if (t - t0 < 6 * 36e5) t += 864e5; return [t, t + 864e5, t + 2 * 864e5]; }
const out = {};
for (const a of process.argv.slice(2)) {
  const m = { chats: 0, msgs: 0, withEmoji: 0, people5: 0, tic40: 0, formal: 0, gaps18: 0, d1: [], d2: [], d3: [], answers: 0, srcLines: 0, urls: [], words: [], notFound: 0 };
  for (const d of dirsOf(a)) { const rows = rowsOf(d), ms = rows.filter(r => r.posted === true && r.text), head = rows[0]; m.chats++;
    const [e1, e2, e3] = chunkEnds(head.start || ms[0].at), day = x => T(x.at) < e1 ? 'd1' : T(x.at) < e2 ? 'd2' : 'd3';
    const hum = ms.filter(r => !r.oracle); m.msgs += hum.length; for (const k of ['d1', 'd2', 'd3']) m[k].push(hum.filter(x => day(x) === k).length);
    for (let i = 1; i < ms.length; i++) if (T(ms[i].at) - T(ms[i - 1].at) > 18 * 36e5) m.gaps18++;
    const by = {}; for (const x of hum) (by[x.who] ??= []).push(x); m.withEmoji += hum.filter(x => /\p{Extended_Pictographic}/u.test(x.text)).length;
    for (const [w, xs] of Object.entries(by)) { if (xs.length >= 5) { m.people5++; const cnt = {}; for (const x of xs) for (const e of new Set(x.text.match(EM) || [])) cnt[e] = (cnt[e] || 0) + 1; if (Math.max(0, ...Object.values(cnt)) / xs.length >= 0.4) m.tic40++; } }
    m.formal += hum.filter(x => /^\p{Lu}/u.test(x.text) && x.text.split(/\s+/).length > 15 && !/['’]/.test(x.text)).length;
    for (const x of ms.filter(r => r.oracle)) { m.answers++; if (/^\s*sources?\b/im.test(x.text)) m.srcLines++; m.urls.push((x.text.match(/https?:\/\/\S+/g) || []).length); m.words.push(x.text.split(/\s+/).length); if (/couldn't|could not|can't find|not find|unable|no luck/i.test(x.text)) m.notFound++; } }
  const mean = xs => xs.length ? (xs.reduce((s, x) => s + x, 0) / xs.length).toFixed(1) : '-', med = xs => xs.length ? [...xs].sort((p, q) => p - q)[Math.floor(xs.length / 2)] : '-';
  console.log(`${a.split('/').slice(-2).join('/')}: chats ${m.chats}, msgs ${m.msgs} (per day ${mean(m.d1)} / ${mean(m.d2)} / ${mean(m.d3)}), with emoji ${(100 * m.withEmoji / Math.max(1, m.msgs)).toFixed(0)}%, people>=5msgs ${m.people5}, one emoji in >=40% ${m.tic40}, formal-looking long msgs ${m.formal}, gaps>18h ${m.gaps18}${m.answers ? `, Claude answers ${m.answers}: Source lines ${m.srcLines}, URLs max ${Math.max(...m.urls)}, median words ${med(m.words)}, said-not-found ${m.notFound}` : ''}`);
}

// Big-group check: node w4-checks/big.mjs <list>... : for chats of 5+ people: top-3 sender share, and per sender with 4+ messages the share of messages carrying their most frequent habit marker (ends in an emoji, laugh word, "!", " x", "..."; or capital start), pooled for the first 3 people (cast order) and for the rest; plus the share of messages answered by a different sender within 5 min.
import fs from 'node:fs';
const rows = d => fs.readFileSync(d + '/log.jsonl', 'utf8').split('\n').filter(Boolean).map(l => JSON.parse(l));
const MK = { emoji: t => /\p{Extended_Pictographic}️?\s*$/u.test(t), laugh: t => /\b(lol|haha+|jaja+|kkk+|lmao|hehe)\b/i.test(t), bang: t => /!\s*$/.test(t), x: t => /\bx+\s*$/i.test(t), dots: t => /\.\.\.\s*$/.test(t), cap: t => /^\p{Lu}/u.test(t) };
const S = { top3: [], majorM: [], minorM: [], quick: [] };
for (const f of process.argv.slice(2)) for (const l of fs.readFileSync(f, 'utf8').split('\n').filter(x => x.trim())) {
  const [label, dir] = l.trim().split(/\s+/), r = rows(dir), c = r.find(x => x.cast), m = r.filter(x => x.posted === true && x.text && !x.oracle); if (c.names.length < 5) continue;
  const cnt = {}; for (const x of m) cnt[x.who] = (cnt[x.who] ?? 0) + 1; S.top3.push(Object.values(cnt).sort((a, b) => b - a).slice(0, 3).reduce((a, b) => a + b, 0) / m.length);
  for (const [i, n] of c.names.entries()) { const mine = m.filter(x => x.who === n); if (mine.length < 4) continue; const top = Math.max(...Object.values(MK).map(fn => mine.filter(x => fn(x.text)).length / mine.length)); (i < 3 ? S.majorM : S.minorM).push(top); }
  m.forEach((x, i) => { const nx = m[i + 1]; if (nx) S.quick.push(nx.who !== x.who && +new Date(nx.at + ':00Z') - +new Date(x.at + ':00Z') <= 5 * 6e4 ? 1 : 0); });
}
const mean = a => a.length ? (a.reduce((x, y) => x + y, 0) / a.length).toFixed(2) : '-';
console.log(`chats ${S.top3.length}; top-3 sender share ${mean(S.top3)}; top habit-marker share: first 3 people ${mean(S.majorM)} (n=${S.majorM.length}), the rest ${mean(S.minorM)} (n=${S.minorM.length}); replied by another within 5 min ${mean(S.quick)}`);

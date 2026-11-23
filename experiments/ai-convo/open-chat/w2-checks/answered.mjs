// W2 item 5 check. node w2-checks/answered.mjs <list> [...] : per arm, share of messages containing "?" that get a message from someone else within 2 h (the next message by another sender), and messages per 24 h (from first to last message).
import fs from 'node:fs';
const arms = {};
for (const f of process.argv.slice(2)) for (const l of fs.readFileSync(f, 'utf8').split('\n').filter(x => x.trim())) {
  const [label, dir] = l.trim().split(/\s+/), m = fs.readFileSync(dir + '/log.jsonl', 'utf8').split('\n').filter(Boolean).map(x => JSON.parse(x)).filter(x => x.posted === true && x.text), arm = label.split('-')[0], a = arms[arm] ??= { q: 0, ans: 0, per: [], runs: 0 }; a.runs++;
  const T = x => +new Date(x.at + ':00Z'); a.per.push(m.length / ((T(m.at(-1)) - T(m[0])) / 864e5));
  m.forEach((x, i) => { if (!x.text.includes('?')) return; a.q++; const nx = m.slice(i + 1).find(y => y.who !== x.who); if (nx && T(nx) - T(x) <= 2 * 36e5) a.ans++; });
}
for (const [arm, a] of Object.entries(arms)) console.log(`${arm}: ${a.runs} runs; "?" messages ${a.q}, answered within 2h by someone else ${a.ans} = ${(100 * a.ans / a.q).toFixed(0)}%; messages per 24h mean ${(a.per.reduce((x, y) => x + y, 0) / a.per.length).toFixed(1)}`);

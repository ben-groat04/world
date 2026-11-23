// Co-presence check: node w4-checks/cohab.mjs <list>... : for casts where two people live together (a life line says "live(s)/share(s) ... with <other>", or the setting says they share a flat/home), the evening (18:00-23:59) messages one of them sends within 15 min of the other's message, per such pair-chat, and the share of the pair's evening messages. Prints per chat and pooled.
import fs from 'node:fs';
const rows = d => fs.readFileSync(d + '/log.jsonl', 'utf8').split('\n').filter(Boolean).map(l => JSON.parse(l));
let P = 0, E = 0, X = 0, chats = 0, all = 0;
for (const f of process.argv.slice(2)) for (const l of fs.readFileSync(f, 'utf8').split('\n').filter(x => x.trim())) {
  const [label, dir] = l.trim().split(/\s+/), r = rows(dir), c = r.find(x => x.cast), m = r.filter(x => x.posted === true && x.text && !x.oracle); all++;
  const pairs = []; for (const a of c.names) for (const b of c.names) if (a < b) { const re = (x, y) => new RegExp(`(?:live|lives|living|share|shares|sharing|shared|flatmate|housemate|roommate)[^.]*\\b${y}\\b|\\b${y}\\b[^.]*(?:live together|share a (?:flat|house|home|apartment))`, 'i').test(c.private_lines[x]); if (re(a, b) || re(b, a) || (c.names.length === 2 && /(share|live together|same (flat|house|apartment|home))/i.test(c.setting + c.private_lines[a]))) pairs.push([a, b]); }
  if (!pairs.length) continue; chats++; let pe = 0, px = 0;
  for (const [a, b] of pairs) m.forEach((x, i) => { const h = +x.at.slice(11, 13); if (h < 18 || ![a, b].includes(x.who)) return; pe++; const p = m[i - 1]; if (p && p.who !== x.who && [a, b].includes(p.who) && +new Date(x.at + ':00Z') - +new Date(p.at + ':00Z') <= 15 * 6e4) px++; });
  E += pe; X += px; console.log(`${label}\t${pairs.map(p => p.join('+')).join(',')}\tevening msgs ${pe}\tquick replies ${px}`);
}
console.log(`chats with a cohabiting pair ${chats}/${all}; pooled evening msgs ${E}, quick replies ${X} (${(100 * X / E).toFixed(0)}%)`);

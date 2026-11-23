// W6 cheap metrics: node w6-checks/metrics.mjs <list file> [list file ...]  (lines "<label> <folder with log.jsonl>")
import fs from 'node:fs';
const rows = d => fs.readFileSync(d + '/log.jsonl', 'utf8').split('\n').filter(Boolean).map(l => JSON.parse(l));
const T = { chats: 0, msgs: 0, d1: 0, d1n: 0, later: 0, laterN: 0, bracketLine: 0, media: 0, sentNoMedia: 0, status: 0, sameMin: 0, run3: 0, asks: 0, md: 0, srcLine: 0, qWords: 0, rejectLogs: 0 };
const STATUS = /^(home|back|off|out of|leaving|on my way|asleep)\b/i, SENT = /\b(sent|sending|here'?s|attached)\b.*\b(photo|screenshot|link|pic|picture)\b|\b(photo|screenshot|link)\b.*\b(sent|sending)\b/i, MEDIA = /^\[(photo|link|screenshot|voice|file|video)[^\]]*\]$/i;
for (const lf of process.argv.slice(2)) for (const l of fs.readFileSync(lf, 'utf8').split('\n').filter(Boolean)) {
  const [, d] = l.split(' '), r = rows(d), ms = r.filter(x => x.posted === true && x.text && !x.oracle); T.chats++; T.msgs += ms.length;
  const dayKey = m => { const t = new Date(m.at + ':00Z'); t.setUTCHours(t.getUTCHours() - 4); return t.toISOString().slice(0, 10); }, keys = [...new Set(ms.map(dayKey))].sort();
  keys.forEach((k, i) => { const n = ms.filter(m => dayKey(m) === k).length; if (i === 0) { T.d1 += n; T.d1n++; } else { T.later += n; T.laterN++; } });
  ms.forEach((m, i) => { const t = m.text.trim(); if (/^\[.*\]$/.test(t)) { if (MEDIA.test(t)) T.media++; else T.bracketLine++; }
    if (t.split(/\s+/).length < 5 && STATUS.test(t)) T.status++;
    if (SENT.test(t) && !ms.slice(i, i + 4).some(x => MEDIA.test(x.text.trim()))) T.sentNoMedia++;
    if (i && ms[i - 1].at === m.at && ms[i - 1].who !== m.who) { T.sameMin++; if (i > 1 && ms[i - 2].at === m.at) T.run3++; } });
  for (const x of r.filter(x => x.oracle)) { T.asks++; if (/\]\(|\*\*|^\s*[-*] |^Sources?:/im.test(x.text)) T.md++; }
}
console.log(T, 'perDay1', (T.d1 / T.d1n).toFixed(1), 'perLaterDay', (T.later / T.laterN).toFixed(1), 'status/chat', (T.status / T.chats).toFixed(1), 'sameMin%', (T.sameMin / T.msgs * 100).toFixed(1));

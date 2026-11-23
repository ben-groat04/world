// oracle/opening check: node w6-checks/oracle.mjs <list> [list...]; prints asks per chat, answer format, first-message overlap with the topic, night openers before noon
import fs from 'node:fs';
let chats = 0, asks = 0, md = 0, general = 0; const ov = [], night = [];
for (const lf of process.argv.slice(2)) for (const l of fs.readFileSync(lf, 'utf8').split('\n').filter(Boolean)) { const d = l.split(' ')[1], r = fs.readFileSync(d + '/log.jsonl', 'utf8').split('\n').filter(Boolean).map(x => JSON.parse(x)), c = r.find(x => x.cast), ms = r.filter(x => x.posted === true && x.text); chats++;
  for (const x of ms.filter(x => x.oracle)) { asks++; if (/\]\(|\*\*|^\s*[-*] |^Sources?:|https?:\/\/.*https?:\/\//im.test(x.text)) md++; if (/general knowledge|usually|typically/i.test(x.text)) general++; }
  if (c.topic) { const tw = new Set(c.topic.toLowerCase().match(/[a-z']+/g)), fw = ms[0].text.toLowerCase().match(/[a-z']+/g) ?? [], o = fw.filter(w => tw.has(w)).length / fw.length; ov.push(+o.toFixed(2)); }
  if (/\b(tonight|night)\b/i.test(ms[0].text) && +ms[0].at.slice(11, 13) < 12) night.push(ms[0].at + ' ' + ms[0].text.slice(0, 50)); }
console.log({ chats, asks, perChat: (asks / chats).toFixed(1), answersWithMarkdownOrSources: md, generalKnowledgeWords: general, firstMsgTopicWordShare: ov, nightOpenersBeforeNoon: night });

// node save.cjs <workflow output file> <round>  -> writes rounds/<round>/<label>/..., prints audit summary
const fs = require('fs'); const o = JSON.parse(fs.readFileSync(process.argv[2], 'utf8')); let r = o.result; if (typeof r === 'string') r = JSON.parse(r);
const d = `rounds/${process.argv[3]}/${r.label}`; fs.mkdirSync(d, { recursive: true });
fs.writeFileSync(`${d}/people.json`, JSON.stringify(r.world, null, 1)); fs.writeFileSync(`${d}/events.txt`, r.events.join('\n') + '\n');
for (const it of r.iterations) {
  fs.writeFileSync(`${d}/transcript.md`, it.transcript + '\n'); fs.writeFileSync(`${d}/memories.txt`, it.memories + '\n');
  fs.writeFileSync(`${d}/audit.json`, JSON.stringify({ rules: it.rules, decisions: it.decisions, final: it.final, audit: it.audit }, null, 1));
  const a = it.audit || {}; console.log(`${r.label}: score ${a.score} | ${it.decisions} decisions | ${it.transcript.split('\n').length} transcript lines`);
  console.log(' verdict:', a.verdict); console.log(' mechanism:', (a.mechanism_issues || []).map((x) => '\n  - ' + x).join('')); console.log(' rules:', JSON.stringify(a.extra_rules));
}
console.log(' tokens:', o.totalTokens, 'agents:', o.agentCount);

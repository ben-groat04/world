// node save.cjs <workflow output file> <round>  -> writes rounds/<round>/<label>/..., prints audit summary
// Top level holds the last iteration's files; every iteration is also written to it<k>/.
//   world.json      generated personas + world mechanics (places, chats, calendar template, background characters, event types, money)
//   events.txt      base-rate events rolled from the seed
//   calls.jsonl     every model call: phase, label, who it was for, prompt (persona prompts as head key + body), result
//   heads.json      static prompt headers (rules + persona + shared background) referenced by calls.jsonl `head`
//   log.jsonl       every simulation event: messages, scenes, payments, money, calls, events, outcomes, calendar adds, state check-ins
//   calendar.json   every calendar occurrence (routines, arranged items, follow-ups)
//   transcript.md, memories.txt, audit.json, final.json
const fs = require('fs'), path = require('path')
const o = JSON.parse(fs.readFileSync(process.argv[2], 'utf8')); let r = o.result; if (typeof r === 'string') r = JSON.parse(r)
const d = path.join(__dirname, 'rounds', String(process.argv[3]), r.label); fs.mkdirSync(d, { recursive: true })
const jsonl = (xs) => (xs || []).map((x) => JSON.stringify(x)).join('\n') + '\n'
const W = (dir, f, s) => fs.writeFileSync(path.join(dir, f), s)
W(d, 'world.json', JSON.stringify(r.world, null, 1)); W(d, 'people.json', JSON.stringify(r.world, null, 1))
W(d, 'events.txt', (r.events || []).join('\n') + '\n')
W(d, 'calls.jsonl', jsonl(r.calls)); W(d, 'heads.json', JSON.stringify(r.heads || {}, null, 1))
W(d, 'run.json', JSON.stringify({ label: r.label, seed: r.seed, window: r.window, totalTokens: o.totalTokens, agentCount: o.agentCount, calls: (r.calls || []).length }, null, 1))
for (const it of r.iterations) {
  const sub = path.join(d, `it${it.it}`); fs.mkdirSync(sub, { recursive: true })
  for (const dir of [sub, d]) {
    W(dir, 'transcript.md', it.transcript + '\n'); W(dir, 'memories.txt', it.memories + '\n')
    W(dir, 'log.jsonl', jsonl(it.log)); W(dir, 'calendar.json', JSON.stringify(it.calendar || [], null, 1)); W(dir, 'final.json', JSON.stringify(it.final, null, 1))
    W(dir, 'audit.json', JSON.stringify({ it: it.it, seed: it.seed, rules: it.rules, decisions: it.decisions, calls: it.calls, budget: it.budget, stoppedAt: it.stoppedAt, coveredTo: it.coveredTo, audit: it.audit }, null, 1))
  }
  W(sub, 'calls.jsonl', jsonl((r.calls || []).filter((c) => c.phase === 'Generate' || String(c.label || '').includes(` r${it.it}`) || String(c.head || '').startsWith(`r${it.it}:`))))
  const a = it.audit || {}; console.log(`${r.label} it${it.it}: score ${a.score} | ${it.decisions} decisions | ${it.calls}/${it.budget} calls | covered to ${it.coveredTo} | ${it.transcript.split('\n').length} transcript lines`)
  console.log(' verdict:', a.verdict); console.log(' mechanism:', (a.mechanism_issues || []).map((x) => '\n  - ' + x).join(''))
  console.log(' proposed:', (a.proposed_mechanisms || []).map((x) => '\n  - ' + x).join('')); console.log(' rules:', JSON.stringify(a.extra_rules))
}
console.log(' tokens:', o.totalTokens, 'agents:', o.agentCount, '| written to', d)

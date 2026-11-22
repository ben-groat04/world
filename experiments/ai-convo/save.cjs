// node save.cjs <workflow output file> <round>  -> writes rounds/<round>/<label>/ and prints a summary (engine v3 output)
//   run.json            label, seed, args, window, tokens, call stats incl. turns per person
//   world.json          people (attributes, temperament, profile, contacts) + hard facts: names (sets, picked), places/access, workplace, contacts (links, home, usual place), knows_at_start/end
//   events.txt          base-rate events rolled from the seed
//   transcript.md       everything said and done, in time order (messages, calls, scenes, events, outcomes)
//   memories.txt        each person's turns: why they acted then, where, what they did, what they chose to remember (conversation gists, day summaries) and plan
//   world-decisions.txt every world-role decision with the item it answered and its one-line reason
//   log.jsonl           every simulation event, machine-readable (incl. turns with what each person saw, moves)
//   calls.jsonl         every model call in order: sim time, who for, why, agent, prompt (persona prompts as head key + body), result
//   heads.json          static persona headers referenced by calls.jsonl `head`
//   calendar.json, final.json   (audit: an Opus agent reads rounds/<round>/ with AUDIT.md)
const fs = require('fs'), path = require('path')
const o = JSON.parse(fs.readFileSync(process.argv[2], 'utf8')); let r = o.result ?? o; if (typeof r === 'string') r = JSON.parse(r)
if (r.version !== 3) throw new Error('not engine-v3 output')
const d = path.join(__dirname, 'rounds', String(process.argv[3] || 'misc'), String(r.label || 'run')); fs.mkdirSync(d, { recursive: true })
const jsonl = (xs) => (xs || []).map((x) => JSON.stringify(x)).join('\n') + '\n'
const W = (f, s) => fs.writeFileSync(path.join(d, f), s)
W('run.json', JSON.stringify({ label: r.label, seed: r.seed, args: r.args, window: r.window, totalTokens: o.totalTokens, agentCount: o.agentCount, stats: r.stats }, null, 1))
W('world.json', JSON.stringify(r.world, null, 1)); W('events.txt', (r.events || []).join('\n') + '\n')
W('transcript.md', r.transcript + '\n'); W('memories.txt', r.memories + '\n'); W('world-decisions.txt', (r.worldLog || '') + '\n')
W('log.jsonl', jsonl(r.log)); W('calls.jsonl', jsonl(r.calls)); W('heads.json', JSON.stringify(r.heads || {}, null, 1))
W('calendar.json', JSON.stringify(r.calendar || [], null, 1)); W('final.json', JSON.stringify(r.final, null, 1))
const s = r.stats || {}
console.log(`${r.label}: ${r.window.from} → ${r.window.to} | ${s.simCalls} sim calls (${s.sceneLines} scene lines, ${s.failed} failed) of backstop ${s.maxCalls}${s.stoppedAt ? ' | STOPPED at ' + s.stoppedAt : ''} | role agent ${s.roleAgent} | tokens ${o.totalTokens ?? '?'}`)
console.log(' calls by who:', JSON.stringify(s.byFor), '| turns:', JSON.stringify(s.turns))
console.log(' written to', d)

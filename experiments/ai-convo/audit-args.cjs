// node audit-args.cjs <round> [label ...] > audit-args.json   -> args for audit-v3.js from rounds/<round>/<label>/ (saved by save.cjs)
// node audit-args.cjs --save <workflow output file> <round>  -> writes each run's audit into rounds/<round>/<label>/audit.json and the comparison into rounds/<round>/audit-compare.json
const fs = require('fs'), path = require('path')
const rd = (d, f) => { try { return fs.readFileSync(path.join(d, f), 'utf8') } catch { return '' } }
if (process.argv[2] === '--save') {
  const o = JSON.parse(fs.readFileSync(process.argv[3], 'utf8')); let r = o.result ?? o; if (typeof r === 'string') r = JSON.parse(r)
  const base = path.join(__dirname, 'rounds', process.argv[4])
  for (const [label, a] of Object.entries(r.reports || {})) { fs.mkdirSync(path.join(base, label), { recursive: true }); fs.writeFileSync(path.join(base, label, 'audit.json'), JSON.stringify(a, null, 1)); console.log(`${label}: ${a?.score ?? '?'}/10 ${a?.verdict || ''}`) }
  fs.writeFileSync(path.join(base, 'audit-compare.json'), JSON.stringify(r.compare, null, 1))
  console.log(`across runs: ${r.compare?.score ?? '?'}/10 ${r.compare?.verdict || ''}`); for (const x of r.compare?.recurring || []) console.log(` - ${x.issue} [${x.runs.join(', ')}]\n   cause: ${x.cause}\n   ai-first: ${x.ai_first}`)
} else {
  const base = path.join(__dirname, 'rounds', process.argv[2]), want = process.argv.slice(3)
  const labels = (want.length ? want : fs.readdirSync(base).filter((l) => fs.existsSync(path.join(base, l, 'run.json'))))
  const runs = labels.map((l) => { const d = path.join(base, l), run = JSON.parse(rd(d, 'run.json')), w = JSON.parse(rd(d, 'world.json'))
    return { label: run.label, setting: w.setting, window: run.window, stats: run.stats, background: w.background,
      people: w.people.map((p) => ({ name: p.name, attributes: p.attributes, temperament: p.temperament, profile: p.profile, speech: p.speech, texting: p.texting })),
      calendar: JSON.parse(rd(d, 'calendar.json') || '[]'), events: rd(d, 'events.txt').split('\n').filter(Boolean), transcript: rd(d, 'transcript.md'), memories: rd(d, 'memories.txt'), worldLog: rd(d, 'world-decisions.txt') } })
  process.stdout.write(JSON.stringify({ runs }))
}

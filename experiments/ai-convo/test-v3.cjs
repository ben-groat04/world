// Mock test for engine-v3.js: runs the workflow script in node with a fake agent() and checks invariants.
//   node test-v3.cjs            (all attributes-*.json plus the smoke args)
// The fake agent returns schema-valid, varied answers (seeded), occasionally null, so every path runs. It cannot judge realism; it checks
// that the engine gives each agent what it needs (its own journal, errand results, earlier conversations) and keeps facts straight.
const fs = require('fs'), path = require('path')
const SRC = fs.readFileSync(path.join(__dirname, 'engine-v3.js'), 'utf8')
const body = SRC.replace(/^export const meta = /m, 'const meta = ')
if (/Math\.random|Date\.now|new Date\(\)/.test(body)) throw new Error('script uses non-deterministic APIs')
const AsyncFn = Object.getPrototypeOf(async function () {}).constructor
const run = new AsyncFn('agent', 'parallel', 'pipeline', 'log', 'phase', 'args', body)

function checkSchema(s, p = '$') {
  if (s.type === 'object') { for (const r of s.required || []) if (!(r in (s.properties || {}))) throw new Error(`${p}: required ${r} not in properties`); for (const [k, v] of Object.entries(s.properties || {})) checkSchema(v, p + '.' + k) }
  if (s.type === 'array') checkSchema(s.items, p + '[]')
}
function valid(v, s, p = '$') {
  if (v == null) throw new Error(`${p}: null`)
  if (s.type === 'object') { if (typeof v !== 'object' || Array.isArray(v)) throw new Error(`${p}: not object`); for (const r of s.required || []) if (!(r in v)) throw new Error(`${p}: missing ${r}`); for (const [k, x] of Object.entries(v)) { if (!s.properties[k]) throw new Error(`${p}: unknown ${k}`); valid(x, s.properties[k], p + '.' + k) } }
  else if (s.type === 'array') { if (!Array.isArray(v)) throw new Error(`${p}: not array`); if (s.maxItems != null && v.length > s.maxItems) throw new Error(`${p}: too many`); v.forEach((x, i) => valid(x, s.items, `${p}[${i}]`)) }
  else if (s.type === 'string') { if (typeof v !== 'string') throw new Error(`${p}: not string`); if (s.enum && !s.enum.includes(v)) throw new Error(`${p}: not in enum`) }
  else if (s.type === 'integer') { if (!Number.isInteger(v)) throw new Error(`${p}: not integer`) }
  else if (s.type === 'number') { if (typeof v !== 'number') throw new Error(`${p}: not number`) }
  else if (s.type === 'boolean') { if (typeof v !== 'boolean') throw new Error(`${p}: not boolean`) }
}

function mock(attrs, opts = {}) {
  let k = opts.seed || 7
  const r = () => { k = (k * 1103515245 + 12345) % 2147483648; return k / 2147483648 }
  const pick = (a) => a[Math.floor(r() * a.length)]
  const names = attrs.map((a) => a.name)
  const hh = (m) => `${String(Math.floor(m / 60) % 24).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`
  const nowOf = (p) => { const x = p.match(/IT IS (?:NOW )?\w{3} (\d\d):(\d\d)/); return x ? +x[1] * 60 + +x[2] : 600 }
  const seen = { calls: 0, kinds: {}, agentTypes: {}, concurrent: 0, maxConcurrent: 0 }
  async function agent(prompt, o) {
    seen.calls++; seen.agentTypes[o.agentType] = (seen.agentTypes[o.agentType] || 0) + 1
    if (opts.noSim && o.agentType === 'sim') throw new Error('Unknown agent type: sim')
    checkSchema(o.schema)
    seen.concurrent++; seen.maxConcurrent = Math.max(seen.maxConcurrent, seen.concurrent)
    await new Promise((res) => setTimeout(res, 1)); seen.concurrent--
    const out = answer(prompt, o)
    if (out === null) return null
    valid(out, o.schema)
    return out
  }
  function answer(prompt, o) {
    const s = o.schema.properties
    const kind = s.profile ? 'person' : s.places ? 'world' : s.decisions ? 'resolve' : s.come ? 'hear' : s.say ? 'say' : s.keep_plan ? 'turn' : s.imagined ? 'audit' : '?'
    seen.kinds[kind] = (seen.kinds[kind] || 0) + 1
    if (kind !== 'person' && kind !== 'world' && r() < (opts.nullRate ?? 0.04)) return null
    if (kind === 'person') { const nm = (prompt.match(/"name":"([^"]+)"/) || [])[1] || 'Anon'
      return { name: nm, profile: `${nm} is ordinary.`, speech: 'plain', texting: 'short', contacts: [{ name: `Mum of ${nm.split(' ')[0]}`, relation: 'mother', about: 'texts in full sentences' }, { name: 'Linda', relation: 'partner', about: 'quiet', lives_with_you: true }], memory: 'Week ahead.' } }
    if (kind === 'world') {
      const a0 = attrs[0], shiftTimes = JSON.stringify(a0).match(/(\d\d:\d\d)-(\d\d:\d\d)/)
      return { background: 'They share a place.', common_knowledge: ['Bins go out Thursday'],
        households: opts.strangers ? [] : [names],
        places: [...names.map((n) => ({ name: `${n.split(' ')[0]}'s room`, kind: 'private', building: 'Home', access: [n] })), { name: 'Kitchen', kind: 'shared', building: 'Home', access: opts.strangers ? [] : names }, { name: 'Work', kind: 'public', building: '', access: [] }, { name: 'Supermarket', kind: 'public', building: '', access: [] }],
        calendar: [...(shiftTimes ? [{ what: 'shift', who: [names[0]], days: ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'], start: shiftTimes[1], end: shiftTimes[2], place: 'Work', source: 'shift_pattern' }] : []),
          { what: 'invented gym class', who: [names[1]], days: ['Fri', 'Sat'], start: '18:17', end: '19:43', place: 'Work', source: 'made up' }],
        contacts: [{ name: 'Priya at Larch Lettings', role: 'letting agent', about: 'brisk', linked_to: names }, { name: 'Dev', role: 'shopkeeper', about: 'friendly', linked_to: [], place: 'Supermarket' }] } }
    if (kind === 'turn') {
      const me = names.find((n) => prompt.includes(`YOU: ${n}.`)), now = nowOf(prompt)
      const others = names.filter((n) => n !== me), places = (prompt.match(/PLACES: (.*)/) || [])[1].split(' | ')
      const first = prompt.includes('the simulation starts'), x = r()
      const errandDone = /DONE:|outcome/.test(prompt)
      const plan = first || x < 0.35 ? [{ until: hh(now + 20 + Math.floor(r() * 40)), place: pick(places), doing: 'pottering', phone_minutes: pick([0, 5, 30]) },
        { until: hh(now + 120), place: 'Supermarket', doing: 'shopping', phone_minutes: 10, action: errandDone && r() < 0.5 ? '' : 'buy food for dinner' },
        { until: hh(now + 220), place: 'Kitchen', doing: 'cooking', phone_minutes: 30 },
        ...(r() < 0.4 ? [{ until: hh(now + 600), place: pick(places), doing: 'sleep', asleep: true, phone_minutes: 0 }] : [])] : []
      return { memory: r() < 0.3 ? '' : `Had a day.`, keep_plan: plan.length === 0, plan,
        talk_to: r() < 0.25 ? pick([...others, 'Dev', 'Nobody', 'stranger']) : '', call: r() < 0.1 ? pick([...others, 'Mum', 'Ghostbusters']) : '',
        messages: r() < 0.3 ? [{ to: pick([...others, others.join(', '), 'Priya', 'nobody']), text: `msg ${me.split(' ')[0]} ${hh(now)}` }] : [],
        pay: r() < 0.05 ? [{ to: pick(others), amount: pick([5, -3]), note: 'tea' }] : [],
        arrange: r() < 0.05 ? [{ what: 'coffee', day: pick(['Sat', 'Sun']), time: pick(['10:00', '25:99']), minutes: 60, place: '' }] : [] }
    }
    if (kind === 'say') { const n = ((prompt.split('THIS CONVERSATION SO FAR')[1] || prompt.split('SO FAR')[1] || '').match(/\n[^\n(]+: "/g) || []).length
      if (/RINGING|phone is ringing/.test(prompt) && r() < 0.3) return { say: '', do: '', minutes: 0, leave: true, done: true }
      const absent = names.filter((m) => !prompt.includes(m) || /ONLY THESE PEOPLE ARE HERE: (.*)/.exec(prompt)?.[1]?.includes(m) === false)
      const end = r() < 0.15 * n
      return { say: r() < 0.1 ? '' : `line ${n} #${seen.calls}?`, do: r() < 0.3 ? 'shrugs' : '', minutes: pick([0, 1, 2, 5]), call_over: !prompt.includes('ON THE PHONE') && r() < 0.15 ? pick(names) : '', leave: end && r() < 0.5, done: end } }
    if (kind === 'hear') return { come: r() < 0.6, say: r() < 0.5 ? 'coming' : '', do: '' }
    if (kind === 'resolve') { const lines = prompt.split('\n').filter((l) => /^\d+\. \[/.test(l))
      return { decisions: lines.flatMap((l, i) => { if (r() < 0.08) return []; const who = names.find((m) => l.includes(m)) || names[0]
        const kd = /\[action\]/.test(l) ? pick(['result', 'result', 'none']) : pick(['result', 'text', 'call', 'none'])
        return [{ item: i + 1, kind: kd, who, from: pick(['Priya at Larch Lettings', 'Dev', `Mum of ${who.split(' ')[0]}`, 'Unknown']), text: `outcome ${i + 1} for ${who.split(' ')[0]}`, delay_minutes: pick([0, 5, 60]), reason: 'because' }] }) } }
    if (kind === 'audit') return { imagined: ['a'], missing_texture: [], stereotyping: [], breakers: [], mechanism_issues: [], score: 6, verdict: 'ok' }
    throw new Error('unknown call ' + JSON.stringify(Object.keys(s)))
  }
  return { agent, seen }
}

async function test(file, extra = {}) {
  const raw = JSON.parse(fs.readFileSync(path.join(__dirname, file), 'utf8')), attrs = raw.attributes || raw
  const { agent, seen } = mock(attrs, extra)
  const parallel = async (th) => { const out = []; for (let i = 0; i < th.length; i += 2) out.push(...(await Promise.all(th.slice(i, i + 2).map((f) => f().catch(() => null))))); return out }
  const logs = []
  const base = raw.attributes ? { ...raw } : { setting: 'test setting', dateNote: 'Friday in mid-November 2026', startDow: 4, startHour: 16, hours: 30, seed: 301, attributes: attrs }
  const args = { ...base, label: 't', ...(extra.hours ? { hours: extra.hours } : {}), ...(extra.seed ? { seed: extra.seed } : {}), ...(extra.roleAgent ? { roleAgent: extra.roleAgent } : {}), ...(extra.maxCalls ? { maxCalls: extra.maxCalls } : {}), ...(extra.audit === false ? { audit: false } : {}), ...(extra.noAttr ? { attributes: undefined } : {}),
    events: [{ text: 'A parcel arrives for you', who: 'each', p_per_day: 0.9, hours: [9, 20], source: 'test fixture' }, { text: 'unsourced thing', who: 'each', p_per_day: 1 }] }
  const out = await run(agent, parallel, null, (m) => logs.push(m), () => {}, args)
  const fail = (m) => { const e = new Error(`${file} ${JSON.stringify(extra)}: ${m}`); e.out = out; throw e }
  const names = out.world.people.map((p) => p.name), L = out.log
  const personaCalls = out.calls.filter((c) => c.head && names.includes(c.for)), full = (c) => out.heads[c.head] + '\n\n' + c.prompt
  // basic facts
  for (const e of L) if (!Number.isFinite(e.t)) fail('bad t ' + JSON.stringify(e))
  for (const c of out.calls) { if (c.head && !out.heads[c.head]) fail('missing head'); if (c.i !== out.calls.indexOf(c)) fail('call order') }
  for (const c of out.calls.filter((c) => c.for === 'generator')) if (c.result == null) fail('generation failed: ' + c.label + ' ' + (c.error || ''))
  // no guessed data: unsourced calendar and events dropped; no money anywhere in persona prompts
  if (out.calendar.some((o) => o.what === 'invented gym class')) fail('unsourced calendar item kept')
  if (out.events.some((e) => e.includes('unsourced thing'))) fail('unsourced event kept')
  if (personaCalls.some((c) => /BALANCE|£/.test(full(c)))) fail('money shown to a persona')
  // ethnicity is never shown to character models (writer or player)
  const eth = [...new Set(attrs.map((a) => a.ethnicity).filter(Boolean))]
  for (const c of out.calls.filter((c) => c.for !== 'auditor')) { const t = full(c).replace(/^undefined\n\n/, ''); if (/ethnicity/i.test(t) || eth.some((e) => t.includes(`"${e}"`) || t.includes(`: ${e};`))) fail('ethnicity shown in ' + c.label) }
  // date rule present
  if (!Object.values(out.heads).every((h) => h.includes("this year's TV"))) fail('date rule missing')
  // errands: sent to the world once, at the step's place, and the result stays in view afterwards
  const worldPrompts = out.calls.filter((c) => c.for === 'world').map((c) => c.prompt).join('\n')
  const errands = worldPrompts.split('\n').filter((l) => /^\d+\. \[action\]/.test(l)).map((l) => l.replace(/^\d+\. /, ''))
  const skipped = L.filter((e) => e.kind === 'errand skipped').length
  if (new Set(errands).size !== errands.length) fail('an errand was sent to the world twice: ' + errands.find((e, i) => errands.indexOf(e) !== i))
  for (const e of errands) if (!/ at Supermarket, /.test(e)) fail('errand resolved away from its place: ' + e)
  for (const res of L.filter((e) => e.kind === 'result')) {
    const later = personaCalls.filter((c) => c.for === res.who && c.why !== 'scene line' && c.why !== 'called over' && /IT IS NOW/.test(c.prompt)).filter((c) => { const m = c.prompt.match(/IT IS NOW \w{3} (\d\d):(\d\d)/); return m })
    const idx = out.calls.findIndex((c) => c.for === 'world' && false)
    const after = later.filter((c) => { const tl = L.find((e) => e.kind === 'turn' && e.who === res.who && e.t > res.t && e.t - res.t < 300); return tl })
    const nextTurn = L.slice(L.indexOf(res)).find((e) => e.kind === 'turn' && e.who === res.who && e.t - res.t < 300 && !e.failed)
    if (nextTurn && !nextTurn.seen.some((x) => x.includes(res.text))) fail(`result not shown at next turn: ${res.who} ${res.text}`)
  }
  // own messages are in the sender's later turn prompts (no repeating yourself blind)
  for (const m of L.filter((e) => (e.kind === 'chat' || e.kind === 'dm') && names.includes(e.from))) {
    const nxt = out.calls.find((c) => c.for === m.from && c.why !== 'scene line' && c.why !== 'called over' && c.i > 0 && c.t && /IT IS NOW/.test(c.prompt) && c.prompt.includes(`IT IS NOW ${fmtT(m.t + 1, out)}`) )
    const later = personaCalls.filter((c) => c.for === m.from && /IT IS NOW/.test(c.prompt) && toMin(c.prompt, out) > m.t && toMin(c.prompt, out) - m.t < 240)
    for (const c of later) if (!c.prompt.includes(m.text)) fail(`own message missing from later prompt: ${m.from}: ${m.text}`)
  }
  // scenes: only people present speak; a called-over person really moves in; the next scene sees the previous one
  for (const e of L.filter((e) => e.kind === 'scene' || e.kind === 'call')) {
    for (const l of e.lines) if (l.name !== '—' && !e.present.includes(l.name)) fail(`line by someone not present: ${l.name} @${e.where}`)
    if (!e.failed) for (let i = 1; i < e.lines.length; i++) if (e.lines[i].name === e.lines[i - 1].name && e.lines[i].name !== '—') fail('same speaker twice')
  }
  for (const mv of L.filter((e) => e.kind === 'move' && /called over/.test(e.doing))) if (!L.some((s) => s.kind === 'scene' && s.present.includes(mv.who) && s.where === mv.to)) fail('called-over person not in scene')
  const scenes = L.filter((e) => e.kind === 'scene' && e.lines.some((l) => l.say))
  for (let i = 1; i < scenes.length; i++) { const prev = scenes.slice(0, i).reverse().find((s) => s.t > scenes[i].t - 300 && s.lines.some((l) => l.say)); if (!prev) continue
    const both = scenes[i].present.filter((n) => prev.present.includes(n) && names.includes(n))
    const lastLine = prev.lines.filter((l) => l.say).slice(-1)[0]
    const opener = scenes[i].lines.find((l) => l.say)?.say
    for (const n of both) for (const c of personaCalls.filter((c) => c.for === n && c.why === 'scene line' && opener && c.prompt.split('THIS CONVERSATION SO FAR')[1]?.includes(opener))) if (!c.prompt.includes(lastLine.say)) fail(`scene at ${scenes[i].t} lost the earlier conversation for ${n}`) }
  // after every conversation each participant gets a turn
  for (const e of L.filter((e) => e.kind === 'scene' && e.ended !== 'not answered')) for (const n of e.present.filter((x) => names.includes(x))) if (e.t + e.minutes < out.window.hours * 60 - 5 && !L.some((t) => t.kind === 'turn' && t.who === n && t.t >= e.t && t.t <= e.t + e.minutes + 10)) fail(`no turn after conversation for ${n}`)
  JSON.stringify(out)
  const kinds = L.reduce((m, e) => (m[e.kind] = (m[e.kind] || 0) + 1, m), {})
  console.log(`${file} ${JSON.stringify(extra)}: ${seen.calls} calls ${JSON.stringify(seen.kinds)} types ${JSON.stringify(seen.agentTypes)} maxConc ${seen.maxConcurrent} | log ${JSON.stringify(kinds)} | errands ${errands.length} (dup skipped ${skipped}) | dropped ${out.world.dropped.length}`)
  if (extra.show) { console.log(out.transcript.slice(0, 1800)); const c = personaCalls.filter((c) => /IT IS NOW/.test(c.prompt)).slice(-1)[0]; console.log('--- a late turn prompt ---\n' + c.prompt); const sc = personaCalls.filter((c) => c.why === 'scene line').slice(-1)[0]; if (sc) console.log('--- a scene prompt ---\n' + sc.prompt) }
  return out
}
// minutes since start for a prompt's "IT IS [NOW] Ddd HH:MM", given the run's window start
function toMin(prompt, out) { const m = prompt.match(/IT IS (?:NOW )?(\w{3}) (\d\d):(\d\d)/); if (!m) return -1; const D = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']
  const [d0, h0] = [out.window.from.slice(0, 3), +out.window.from.slice(4, 6) * 60 + +out.window.from.slice(7, 9)]; let dd = (D.indexOf(m[1]) - D.indexOf(d0) + 7) % 7; return dd * 1440 + (+m[2] * 60 + +m[3]) - h0 }
function fmtT() { return '' }

if (process.env.PEEK) module.exports = { test }
else (async () => {
  const files = fs.readdirSync(__dirname).filter((f) => /^attributes-.*\.json$/.test(f))
  for (const f of files) for (const seed of [1, 2, 3]) await test(f, { seed })
  await test('smoke-v3-args.json', { show: true })
  await test('smoke-v3-args.json', { roleAgent: 'sim', noSim: true, hours: 6 })
  await test(files[0], { nullRate: 0.5, hours: 12 })
  await test(files[0], { maxCalls: 15 })
  await test('attributes-street.json', { strangers: true, hours: 24, seed: 4 })
  await test(files[0], { hours: 168, seed: 9, audit: false })
  try { await test(files[0], { noAttr: true }); throw new Error('ran without attributes') } catch (e) { if (!/required/.test(e.message)) throw e; console.log('no attributes -> refused: ok') }
  console.log('ALL OK')
})().catch((e) => { console.error(e); process.exit(1) })

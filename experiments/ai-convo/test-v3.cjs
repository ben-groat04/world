// Mock test for engine-v3.js: runs the workflow script in node with a fake agent() and checks invariants.
//   node test-v3.cjs   (the five sampler/sample-*.json files, plus fresh samples drawn from sampler/index.mjs)
// The fake agent returns schema-valid, varied answers (seeded), occasionally null, so every path runs. It cannot judge realism; it checks
// that the engine gives each agent what it needs (its own journal, errand results, earlier conversations) and keeps facts straight.
const fs = require('fs'), path = require('path')
const SRC = fs.readFileSync(path.join(__dirname, 'engine-v3.js'), 'utf8')
const body = SRC.replace(/^export const meta = /m, 'const meta = ')
if (/Math\.random|Date\.now|new Date\(\)/.test(body)) throw new Error('script uses non-deterministic APIs')
const AsyncFn = Object.getPrototypeOf(async function () {}).constructor
const run = new AsyncFn('agent', 'parallel', 'pipeline', 'log', 'phase', 'args', body)
const SETTINGS = { flatshare: 'a rented shared flat in an English city', family: 'a family home in England', cafe: 'an independent café in an English town and the homes of the people who work there',
  street: 'one residential street in an English inner-city area', friends: 'a group of friends in an English city, each in their own home' }
const DOW = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']

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
  else if (s.type === 'boolean') { if (typeof v !== 'boolean') throw new Error(`${p}: not boolean`) }
}

function mock(people, opts = {}) {
  let k = opts.seed || 7
  const r = () => { k = (k * 1103515245 + 12345) % 2147483648; return k / 2147483648 }
  const pick = (a) => a[Math.floor(r() * a.length)]
  const names = people.map((a) => a.name)
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
    if (kind === 'person') return { profile: 'You are ordinary.', speech: 'plain', texting: 'short', contacts: [{ relation: 'friend', about: 'texts in full sentences' }, { relation: 'sister', about: 'quiet' }] }
    if (kind === 'world') {
      return { background: 'An ordinary place.', common_knowledge: ['Bins go out Thursday'], know_each_other: opts.strangers ? [] : [names.slice(0, 2)],
        places: [...names.map((n) => ({ name: `${n.split(' ')[0]}'s room`, kind: 'private', building: opts.strangers ? n : 'Home', access: [n] })), { name: 'Kitchen', kind: 'shared', building: 'Home', access: opts.strangers ? [names[0]] : names }, { name: 'Work', kind: 'public', building: '', access: [] }, { name: 'Supermarket', kind: 'public', building: '', access: [] }],
        workplace: names.map((n) => ({ person: n, place: 'Work' })),
        contacts: [{ name: 'Priya at Larch Lettings', role: 'letting agent', about: 'brisk', linked_to: names }, { name: 'Dev', role: 'shopkeeper', about: 'friendly', linked_to: [], place: 'Supermarket' }],
        contact_names: names.flatMap((n) => [{ person: n, relation: 'friend', name: 'Sam' }, { person: n, relation: 'sister', name: `Jo ${n.split(' ')[0]}` }])}
    }
    if (kind === 'turn') {
      const me = names.find((n) => prompt.includes(`YOU: ${n}.`)), now = nowOf(prompt)
      const others = names.filter((n) => n !== me), places = (prompt.match(/PLACES: (.*)/) || [])[1].split(' | ')
      const first = prompt.includes('the simulation starts'), x = r()
      const plan = first || x < 0.35 ? [{ until: hh(now + 20 + Math.floor(r() * 40)), place: pick(places), doing: 'pottering', phone_minutes: pick([0, 5, 30]) },
        { until: hh(now + 120), place: 'Supermarket', doing: 'shopping', phone_minutes: 10, action: r() < 0.6 ? 'buy food for dinner' : '' },
        { until: hh(now + 220), place: pick(places), doing: 'cooking', phone_minutes: 30 },
        ...(r() < 0.4 ? [{ until: hh(now + 600), place: pick(places), doing: 'sleep', asleep: true, phone_minutes: 0 }] : [])] : []
      const out = { keep_plan: plan.length === 0, plan,
        talk_to: r() < 0.3 ? pick([...others, 'Dev', 'Nobody', 'stranger']) : '', call: r() < 0.12 ? pick([...others, 'Sam', 'Ghostbusters']) : '',
        messages: r() < 0.3 ? [{ to: pick([...others, others.join(', '), 'Priya', 'nobody']), text: `msg ${me.split(' ')[0]} ${hh(now)} ${Math.floor(r() * 1e6)}` }] : [],
        arrange: r() < 0.05 ? [{ what: 'coffee', day: pick(['Sat', 'Sun']), time: pick(['10:00', '25:99']), minutes: 60, place: '' }] : [] }
      if (s.gists) out.gists = (o.schema.properties.gists.description.match(/refs?: (.*)/)?.[1] || '').split(', ').filter(Boolean).map((ref) => ({ ref, gist: `gist of ${ref} by ${me.split(' ')[0]}` }))
      if (s.day) out.day = `my day, says ${me.split(' ')[0]}`
      return out
    }
    if (kind === 'say') { const n = ((prompt.split('SO FAR')[1] || '').match(/\n[^\n(]+: "/g) || []).length
      if (/RINGING|phone is ringing/.test(prompt) && r() < 0.3) return { say: '', do: '', to: '', minutes: 0, leave: true, done: true }
      const end = r() < 0.15 * n, here = (/(?:ONLY THESE PEOPLE ARE HERE|ON THE LINE): ([^.]*)/.exec(prompt)?.[1] || '').split(', ').map((x) => x.replace(/ \(.*/, ''))
      return { say: r() < 0.1 ? '' : `line ${n} #${seen.calls}`, do: r() < 0.3 ? 'shrugs' : '', to: pick([...here, 'everyone', '']), minutes: pick([0, 1, 2, 5]), call_over: !prompt.includes('ON THE PHONE') && r() < 0.15 ? pick(names) : '', leave: end && r() < 0.5, done: end } }
    if (kind === 'hear') return { come: r() < 0.6, say: r() < 0.5 ? 'coming' : '' }
    if (kind === 'resolve') { const lines = prompt.split('\n').filter((l) => /^\d+\. \[/.test(l))
      return { decisions: lines.flatMap((l, i) => { if (r() < 0.08) return []; const who = names.find((m) => l.includes(m)) || names[0]
        const kd = /\[action\]/.test(l) ? pick(['result', 'result', 'none']) : pick(['result', 'text', 'call', 'none'])
        return [{ item: i + 1, kind: kd, who, from: pick(['Priya at Larch Lettings', 'Dev', 'Sam', 'Unknown']), text: `outcome ${i + 1} for ${who.split(' ')[0]} ${Math.floor(r() * 1e6)}`, delay_minutes: pick([0, 5, 60]), reason: 'because' }] }) } }
    if (kind === 'audit') return { imagined: ['a'], missing_texture: [], stereotyping: [], breakers: [], mechanism_issues: [{ issue: 'x', evidence: 'y', ai_first: 'z' }], score: 6, verdict: 'ok' }
    throw new Error('unknown call ' + JSON.stringify(Object.keys(s)))
  }
  return { agent, seen }
}

async function test(label, smp, extra = {}) {
  const people = smp.people, { agent, seen } = mock(people, extra)
  const parallel = async (th) => { const out = []; for (let i = 0; i < th.length; i += 2) out.push(...(await Promise.all(th.slice(i, i + 2).map((f) => f().catch(() => null))))); return out }
  const logs = []
  const args = { label: 't', setting: SETTINGS[smp.setting], sample: extra.noSample ? undefined : smp, dateNote: 'mid-November 2026', startDow: extra.startDow ?? 4, startHour: 16, hours: extra.hours || 30, seed: extra.seed || 301,
    ...(extra.roleAgent ? { roleAgent: extra.roleAgent } : {}), ...(extra.maxCalls ? { maxCalls: extra.maxCalls } : {}), ...(extra.audit === false ? { audit: false } : {}),
    events: [{ text: 'A parcel arrives for you', who: 'each', p_per_day: 0.9, hours: [9, 20], source: 'test fixture' }, { text: 'unsourced thing', who: 'each', p_per_day: 1 }] }
  const out = await run(agent, parallel, null, (m) => logs.push(m), () => {}, args)
  const fail = (m) => { const e = new Error(`${label} ${JSON.stringify(extra)}: ${m}`); e.out = out; throw e }
  const names = out.world.people.map((p) => p.name), L = out.log
  const personaCalls = out.calls.filter((c) => c.head && names.includes(c.for)), full = (c) => (c.head ? out.heads[c.head] + '\n\n' : '') + c.prompt
  for (const e of L) if (!Number.isFinite(e.t)) fail('bad t ' + JSON.stringify(e))
  for (const c of out.calls) { if (c.head && !out.heads[c.head]) fail('missing head'); if (c.i !== out.calls.indexOf(c)) fail('call order') }
  for (const c of out.calls.filter((c) => c.for === 'generator')) if (c.result == null) fail('generation failed: ' + c.label + ' ' + (c.error || ''))
  // the character writer sees no identity: no names (own or household), sex, ethnicity, birthplace or religion
  for (const c of out.calls.filter((c) => c.label.startsWith('write person'))) { const p = c.prompt
    for (const a of people) for (const v of [a.name, ...(a.household?.members || []).map((m) => m.name), ...(a.children || []).map((m) => m.name)]) if (p.includes(v)) fail(`writer saw a name: ${v}`)
    if (/"(sex|ethnicity|birthplace|religion|years_in_uk)"/.test(p)) fail('writer saw an identity field: ' + p.match(/"(sex|ethnicity|birthplace|religion|years_in_uk)"/)[1]) }
  // ethnicity never reaches a character model
  const eth = [...new Set(people.map((a) => a.ethnicity).filter(Boolean))]
  for (const c of out.calls.filter((c) => c.for !== 'auditor')) { const t = full(c); if (/ethnicity/i.test(t) || eth.some((e) => t.includes(`"${e}"`) || t.includes(`: ${e};`))) fail('ethnicity shown in ' + c.label) }
  // no guessed data: calendar is exactly the sampled shifts in the window (plus things people arranged); unsourced events dropped; no money
  const shifts = out.calendar.filter((o) => o.by === 'sampler')
  for (const o of shifts) { const a = people.find((p) => p.name === o.who[0]), sh = a.shifts.find((s) => s.day === o.at.slice(0, 3) && s.start === o.at.slice(4)); if (!sh) fail('calendar item not from a sampled shift: ' + JSON.stringify(o)) }
  const want = people.reduce((k, a) => k + (a.shifts || []).length, 0); if (want && !shifts.length && (extra.hours || 30) >= 168) fail('sampled shifts missing from calendar')
  if (out.calendar.some((o) => o.by !== 'sampler' && !names.includes(o.by))) fail('calendar item from nowhere')
  if (out.events.some((e) => e.includes('unsourced thing'))) fail('unsourced event kept')
  if (personaCalls.some((c) => /BALANCE|£/.test(full(c)))) fail('guessed money shown to a persona')
  if (!Object.values(out.heads).every((h) => h.includes("this year's TV"))) fail('date rule missing')
  // households from the sampler: members who are simulated know each other; others are contacts at home
  for (const a of people) for (const m of a.household?.members || []) if (!names.includes(m.name) && !out.world.contacts.some((c) => c.name === m.name && c.linked.includes(a.name))) fail(`household member not a contact: ${m.name}`)
  // errands: each step's errand goes to the world exactly once, at the step's place
  const errands = out.calls.filter((c) => c.for === 'world').flatMap((c) => c.prompt.split('\n').filter((l) => /^\d+\. \[action\]/.test(l)).map((l) => l.replace(/^\d+\. /, '')))
  if (new Set(errands).size !== errands.length) fail('an errand was sent twice: ' + errands.find((e, i) => errands.indexOf(e) !== i))
  for (const e of errands) if (!/ at Supermarket, /.test(e)) fail('errand resolved away from its place: ' + e)
  for (const res of L.filter((e) => e.kind === 'result')) {
    const nextTurn = L.slice(L.indexOf(res)).find((e) => e.kind === 'turn' && e.who === res.who && !e.failed)
    if (nextTurn && !nextTurn.seen.some((x) => x.includes(res.text))) fail(`result not shown at next turn: ${res.who} ${res.text}`) }
  // own messages appear in the sender's later prompts the same day
  for (const m of L.filter((e) => (e.kind === 'chat' || e.kind === 'dm') && names.includes(e.from))) {
    const later = personaCalls.filter((c) => c.for === m.from && c.i > out.calls.findIndex((x) => x.for === m.from && x.prompt.includes(`IT IS NOW ${fmtOf(out, m.t)}`)) && /IT IS NOW/.test(c.prompt) && toMin(c.prompt, out) > m.t && toMin(c.prompt, out) - m.t < 240 && Math.floor((16 * 60 + toMin(c.prompt, out)) / 1440) === Math.floor((16 * 60 + m.t) / 1440))
    for (const c of later) if (!c.prompt.includes(m.text)) fail(`own message missing from later prompt: ${m.from}: ${m.text}`) }
  // conversations: only those present speak; the addressed person (or someone else) answers, never the speaker twice
  for (const e of L.filter((e) => e.kind === 'scene' || e.kind === 'call')) {
    for (const l of e.lines) if (l.name !== '—' && !e.present.includes(l.name)) fail(`line by someone not present: ${l.name} @${e.where}`)
    if (!e.failed) for (let i = 1; i < e.lines.length; i++) if (e.lines[i].name === e.lines[i - 1].name && e.lines[i].name !== '—' && e.lines[i].do !== 'comes in' && e.lines[i - 1].do !== 'comes in') fail('same speaker twice') }
  for (const mv of L.filter((e) => e.kind === 'move' && /called over/.test(e.doing))) if (!L.some((s) => s.kind === 'scene' && s.present.includes(mv.who) && s.where === mv.to)) fail('called-over person not in scene')
  // the world keeps moving during a conversation: a scene's people do not move elsewhere while in it, and no one bounces A->B->A in the same minute
  for (const e of L.filter((e) => e.kind === 'scene')) for (const n of e.present.filter((x) => names.includes(x))) {
    const t1 = e.t + e.minutes, mv = L.filter((m) => m.kind === 'move' && m.who === n && m.t > e.t && m.t < t1 - 1 && m.to !== e.where && !/to talk to|called over/.test(m.doing))
    const left = L.some((x) => x.kind === 'scene' && x === e) && e.lines.some((l) => l.name === n && false)
    if (mv.length && !left && !e.lines.some((l, i) => l.name === n)) continue // joined late: fine
    if (mv.length && !mv.every((m) => L.some((t) => t.kind === 'turn' && t.who === n && t.t <= m.t && t.t > e.t))) fail(`${n} moved by plan during a conversation at ${e.where} ${e.t}: ${mv[0].to} @${mv[0].t}`) }
  const moves = L.filter((e) => e.kind === 'move')
  for (let i = 1; i < moves.length; i++) { const a = moves[i - 1], b = moves.slice(i).find((m) => m.who === a.who); if (b && b.t === a.t && b.to === a.from && !L.slice(L.indexOf(a), L.indexOf(b)).some((e) => e.kind === 'turn' && e.who === a.who)) fail(`${a.who} bounced ${a.from}->${a.to}->${b.to} at ${a.t}`) }
  // turns of people not in a conversation still happen while it runs (time does not freeze)
  const longScenes = L.filter((e) => e.kind === 'scene' && e.minutes >= 30)
  const outside = longScenes.filter((e) => L.some((t) => t.kind === 'turn' && !e.present.includes(t.who) && t.t > e.t && t.t < e.t + e.minutes))
  // after every conversation each participant gets a turn, and that turn condenses it
  for (const e of L.filter((e) => e.kind === 'scene' && e.ended !== 'not answered')) for (const n of e.present.filter((x) => names.includes(x))) {
    if (e.t + e.minutes < out.window.hours * 60 - 5 && !L.some((t) => t.kind === 'turn' && t.who === n && t.t >= e.t && t.t <= e.t + e.minutes + 40)) fail(`no turn after conversation for ${n} @${e.t}`) }
  for (const n of names) { const j = out.final[n].journal, lastTurn = L.filter((e) => e.kind === 'turn' && e.who === n && !e.failed).slice(-1)[0]
    const ungisted = out.calls.filter((c) => c.for === n && c.result && c.prompt.includes('YOUR JOURNAL')).length && j.filter((x) => /\[ref /.test(x) && !/gist of/.test(x))
    for (const x of ungisted || []) { const t = toMinFmt(out, x); if (lastTurn && t < lastTurn.t - 1 && !L.some((e) => e.kind === 'turn' && e.who === n && e.failed && e.t > t)) fail(`conversation never condensed by ${n}: ${x.slice(0, 80)}`) } }
  // a later scene shows a person their earlier conversation (verbatim if latest, else their gist)
  for (const c of personaCalls.filter((c) => c.why === 'scene line')) { const refs = (c.prompt.match(/\[ref [^\]]+\]/g) || []); if (refs.length && !/: "|gist of/.test(c.prompt.split('YOUR PLAN')[0])) fail('earlier conversation missing from scene prompt') }
  JSON.stringify(out)
  const kinds = L.reduce((m, e) => (m[e.kind] = (m[e.kind] || 0) + 1, m), {})
  console.log(`${label} ${JSON.stringify(extra)}: ${seen.calls} calls ${JSON.stringify(seen.kinds)} maxConc ${seen.maxConcurrent} | log ${JSON.stringify(kinds)} | shifts ${shifts.length} | errands ${errands.length} | long scenes with outside turns ${outside.length}/${longScenes.length} | contacts ${out.world.contacts.length}`)
  if (extra.show) { console.log(out.transcript.slice(0, 1500)); const c = personaCalls.filter((c) => /IT IS NOW/.test(c.prompt)).slice(-1)[0]; console.log('--- a late turn prompt ---\n' + full(c)); const w = out.calls.find((c) => c.label.startsWith('write person')); console.log('--- writer prompt ---\n' + w.prompt) }
  return out
}
function toMin(prompt, out) { const m = prompt.match(/IT IS (?:NOW )?(\w{3}) (\d\d):(\d\d)/); return m ? rel(out, m[1], +m[2] * 60 + +m[3]) : -1 }
function toMinFmt(out, s) { const m = s.match(/^(\w{3}) (\d\d):(\d\d)/); return m ? rel(out, m[1], +m[2] * 60 + +m[3]) : -1 }
function rel(out, d, mins) { const d0 = out.window.from.slice(0, 3), h0 = +out.window.from.slice(4, 6) * 60 + +out.window.from.slice(7, 9); const dd = (DOW.indexOf(d) - DOW.indexOf(d0) + 7) % 7; return dd * 1440 + mins - h0 }
function fmtOf(out, t) { const h = 16 * 60 + t, r = h % 1440, d = Math.floor(h / 1440); return `${DOW[(DOW.indexOf(out.window.from.slice(0, 3)) + d) % 7]} ${String(Math.floor(r / 60)).padStart(2, '0')}:${String(r % 60).padStart(2, '0')}` }

if (process.env.PEEK) module.exports = { test }
else (async () => {
  const fixtures = Object.keys(SETTINGS).map((s) => [s, JSON.parse(fs.readFileSync(path.join(__dirname, 'sampler', `sample-${s}.json`), 'utf8'))])
  for (const [s, smp] of fixtures) for (const seed of [1, 2, 3]) await test(s, smp, { seed })
  const { sample } = await import(path.join(__dirname, 'sampler', 'index.mjs'))
  for (const [s, n] of [['flatshare', 4], ['family', 0], ['cafe', 5], ['street', 6], ['friends', 5]]) await test(`fresh ${s}`, sample(s, n, 'test-' + s), { seed: 5 })
  await test('flatshare', fixtures[0][1], { show: true, seed: 4 })
  await test('cafe', fixtures[2][1], { roleAgent: 'sim', noSim: true, hours: 6 })
  await test('family', fixtures[1][1], { nullRate: 0.5, hours: 12 })
  await test('friends', fixtures[4][1], { maxCalls: 15 })
  await test('street', fixtures[3][1], { strangers: true, hours: 24, seed: 4 })
  await test('cafe', fixtures[2][1], { hours: 168, seed: 9, audit: false, startDow: 0 })
  try { await test('flatshare', fixtures[0][1], { noSample: true }); throw new Error('ran without people') } catch (e) { if (!/required/.test(e.message)) throw e; console.log('no people -> refused: ok') }
  console.log('ALL OK')
})().catch((e) => { console.error(e.message, e.stack.split('\n').slice(1, 4).join('\n')); process.exit(1) })

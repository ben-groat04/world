// Mock test for engine-v3.js: runs the workflow script in node with a fake agent() and checks invariants.
//   node test-v3.cjs [attributes-file.json ...]     (defaults to all attributes-*.json)
// The fake agent returns schema-valid, varied answers (seeded), occasionally null or garbage, so every path runs.
const fs = require('fs'), path = require('path')
const SRC = fs.readFileSync(path.join(__dirname, 'engine-v3.js'), 'utf8')
const body = SRC.replace(/^export const meta = /m, 'const meta = ')
if (/Math\.random|Date\.now|new Date\(\)/.test(body)) throw new Error('script uses non-deterministic APIs')
const AsyncFn = Object.getPrototypeOf(async function () {}).constructor
const run = new AsyncFn('agent', 'parallel', 'pipeline', 'log', 'phase', 'args', body)

// --- tiny JSON-schema checker (the subset the engine uses) ---
function checkSchema(s, p = '$') {
  if (s.type === 'object') { for (const r of s.required || []) if (!(r in (s.properties || {}))) throw new Error(`${p}: required ${r} not in properties`); for (const [k, v] of Object.entries(s.properties || {})) checkSchema(v, p + '.' + k) }
  if (s.type === 'array') checkSchema(s.items, p + '[]')
}
function valid(v, s, p = '$') {
  if (v == null) throw new Error(`${p}: null`)
  if (s.type === 'object') { if (typeof v !== 'object' || Array.isArray(v)) throw new Error(`${p}: not object`); for (const r of s.required || []) if (!(r in v)) throw new Error(`${p}: missing ${r}`); for (const [k, x] of Object.entries(v)) if (s.properties[k]) valid(x, s.properties[k], p + '.' + k) }
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
  let world = null
  const seen = { calls: 0, kinds: {}, agentTypes: {}, concurrent: 0, maxConcurrent: 0 }
  async function agent(prompt, o) {
    seen.calls++; seen.agentTypes[o.agentType] = (seen.agentTypes[o.agentType] || 0) + 1
    if (opts.noSim && o.agentType === 'sim') throw new Error('Unknown agent type: sim')
    checkSchema(o.schema)
    seen.concurrent++; seen.maxConcurrent = Math.max(seen.maxConcurrent, seen.concurrent)
    await new Promise((res) => setTimeout(res, 1))
    seen.concurrent--
    const out = answer(prompt, o)
    if (out === null) return null
    valid(out, o.schema)
    return out
  }
  function answer(prompt, o) {
    const s = o.schema.properties
    const kind = s.profile ? 'person' : s.places ? 'world' : s.decisions ? 'resolve' : s.say ? 'say' : s.memory ? 'turn' : s.imagined ? 'audit' : s.people ? 'sample' : '?'
    seen.kinds[kind] = (seen.kinds[kind] || 0) + 1
    if (kind !== 'person' && kind !== 'world' && r() < (opts.nullRate ?? 0.04)) return null // dead agent
    if (kind === 'sample') return { people: [1, 2, 3].map((i) => ({ name: `Sam${i} Test`, age: 30 + i, sex: 'x', ethnicity: 'x', birthplace: 'x', occupation: 'x', household: 'x', relationship_status: 'x', health: 'x' })) }
    if (kind === 'person') { const nm = (prompt.match(/"name":"([^"]+)"/) || [])[1] || 'Anon'
      return { name: nm, profile: `${nm} is ordinary.`, speech: 'plain', texting: 'short, lowercase', contacts: [{ name: `Mum of ${nm.split(' ')[0]}`, relation: 'mother', about: 'texts in full sentences' }, { name: 'Priya Shah', relation: 'friend', about: 'chatty' }, { name: 'Linda', relation: 'partner', about: 'quiet', lives_with_you: true }], memory: `Week ahead. Need to sort the gas bill.` } }
    if (kind === 'world') {
      world = { currency: '£', background: 'They share a place.', common_knowledge: ['Bins go out Thursday'],
        places: [...names.map((n) => ({ name: `${n.split(' ')[0]}'s room`, kind: 'private', building: 'Home', access: [n] })), { name: 'Kitchen', kind: 'shared', building: 'Home', access: names }, { name: 'Work', kind: 'public', building: '', access: [] }, { name: 'Corner shop', kind: 'public', building: '', access: [] }],
        starts: names.map((n, i) => ({ name: i === 0 ? n.split(' ')[0].toLowerCase() : n, place: i % 2 ? 'Kitchen' : `${n.split(' ')[0]}'s room`, doing: 'tea', balance: i === 2 ? 3 : 250, ...(opts.strangers ? { knows: i ? [names[0]] : [], has_number: [] } : { knows: names, has_number: names }) })),
        chats: opts.strangers ? [] : [{ name: 'House', members: names }, { name: 'Ghost', members: ['Nobody'] }],
        calendar: [{ what: 'shift', who: [names[0]], days: ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'], start: '17:00', end: '23:00', place: 'Work' }, { what: 'night shift', who: [names[1]], days: ['Fri', 'Sat'], start: '22:00', end: '06:00', place: 'Wrk' }, { what: 'bad', who: ['Zed'], days: ['Mon'], start: 'xx', end: '', place: '' }],
        contacts: [{ name: 'Priya at Larch Lettings', role: 'letting agent', about: 'brisk', linked_to: names }, { name: 'Dev', role: 'shop owner', about: 'friendly', linked_to: [], place: 'Corner shop' }, { name: 'Boss', role: 'manager', about: 'curt', linked_to: [names[0]], place: 'Work' }],
        events: [{ text: 'A parcel arrives for you', who: names, p_per_day: 0.9, hours: [9, 20] }, { text: 'Your mum gets in touch', who: [names[0]], p_per_day: 0.9, from: `Mum of ${names[0].split(' ')[0]}` }, { text: 'Power cut', who: names, shared: true, p_per_day: 0.5, money: -0 }, { text: 'bad', who: ['Nobody'], p_per_day: 1 }],
        money: [{ who: names[1], amount: 1450.5, what: 'pay', day: 0, time: '12:00' }, { who: names[2], amount: -600, what: 'rent', day: 0, time: '09:00' }, { who: 'Ghost', amount: 5, what: 'x', day: 0, time: '09:00' }] }
      return world }
    if (kind === 'turn') {
      const me = names.find((n) => prompt.startsWith('RULES') && prompt.includes(`YOU: ${n}.`)), now = nowOf(prompt)
      const others = names.filter((n) => n !== me), places = (prompt.match(/PLACES: (.*)/) || [])[1].split(' | ')
      const x = r()
      const plan = x < 0.3 ? [] : [{ until: hh(now + 30 + Math.floor(r() * 90)), place: pick(places), doing: 'pottering 😀', phone_minutes: pick([0, 5, 30, 60]) }, { until: hh(now + 200), place: 'Kitchen', doing: 'cooking' }, ...(r() < 0.4 ? [{ until: hh(now + 600), place: pick(places), doing: 'sleep', asleep: true, phone_minutes: 0 }] : []), ...(r() < 0.1 ? [{ until: 'garbage', place: 'Mars', doing: 'x' }] : [])]
      return { memory: r() < 0.1 ? '' : `At ${hh(now)} I was thinking about ${pick(others)}.`, keep_plan: x < 0.3, plan,
        talk_to: r() < 0.25 ? pick([...others, 'Dev', 'Nobody']) : '', call: r() < 0.12 ? pick([...others, 'Priya', 'Mum', 'Ghostbusters']) : '',
        messages: r() < 0.3 ? [{ to: pick(['House', 'Priya', ...others, 'nobody', 'Dev']), text: `msg at ${hh(now)}` }] : [],
        pay: r() < 0.1 ? [{ to: pick([...others, 'Dev']), amount: pick([5, 9999, -3]), note: 'tea' }] : [],
        do: r() < 0.2 ? [{ what: 'check bank app', max_spend: 0 }] : [],
        arrange: r() < 0.1 ? [{ what: 'coffee', day: pick(['Sat', 'Sun', 'Mon']), time: pick(['10:00', '25:99']), minutes: 60, place: pick(['Corner shop', '']) }] : [] }
    }
    if (kind === 'say') { const lines = (prompt.split('SO FAR')[1] || '').split('\n').filter((l) => /^\S.*: "|\(/.test(l)).length
      if (prompt.includes('RINGING') || prompt.includes('phone is ringing')) if (r() < 0.3) return { say: '', do: '', leave: true, done: true }
      const end = r() < 0.15 * lines
      return { say: r() < 0.1 ? '' : `line ${lines} 👍?`, do: r() < 0.3 ? 'shrugs' : '', leave: end && r() < 0.5, done: end, replan: r() < 0.2 } }
    if (kind === 'resolve') { const n = (prompt.match(/^\d+\. \[/gm) || []).length
      const ds = []; for (let i = 1; i <= n; i++) { if (r() < 0.1) continue
        const who = (prompt.match(new RegExp(`^${i}\\. \\[[^\\]]+\\] (?:.*? (?:with|texted|rang) )?([A-Z][a-z]+(?: [A-Z][a-z]+)?)`, 'm')) || [])[1] || names[0]
        const kd = pick(['result', 'text', 'call', 'none'])
        ds.push({ item: i, kind: kd, who: names.find((m) => prompt.split('\n').find((l) => l.startsWith(i + '.'))?.includes(m)) || who, from: pick(['Priya at Larch Lettings', 'Dev', 'Boss', `Mum of ${names[0].split(' ')[0]}`, 'Unknown']), text: `outcome ${i}`, cost: pick([0, 0, 4.5, 99999]), delay_minutes: pick([0, 5, 60, 3000]), reason: 'because' }) }
      return { decisions: ds } }
    if (kind === 'audit') return { imagined: ['a'], missing_texture: [], stereotyping: [], breakers: [], mechanism_issues: [], score: 6, verdict: 'ok' }
    throw new Error('unknown call ' + JSON.stringify(Object.keys(s)))
  }
  return { agent, seen }
}

async function test(file, extra = {}) {
  const raw = JSON.parse(fs.readFileSync(path.join(__dirname, file), 'utf8')), attrs = raw.attributes || raw
  const { agent, seen } = mock(attrs, extra)
  const parallel = async (th) => { const out = []; for (let i = 0; i < th.length; i += 2) out.push(...(await Promise.all(th.slice(i, i + 2).map((f) => f().catch(() => null))))); return out } // max 2 concurrent, like the real runtime
  const logs = []
  const args = raw.attributes ? { ...raw, label: 't', ...(extra.roleAgent ? { roleAgent: extra.roleAgent } : {}), ...(extra.seed ? { seed: extra.seed } : {}) } : { label: 't', setting: 'test setting', startDow: 4, startHour: 16, hours: extra.hours || 30, seed: extra.seed || 301, attributes: extra.noAttr ? undefined : attrs, n: 3, roleAgent: extra.roleAgent, audit: extra.audit, maxCalls: extra.maxCalls }
  const out = await run(agent, parallel, null, (m) => logs.push(m), () => {}, args)
  const fail = (m) => { throw new Error(`${file} ${JSON.stringify(extra)}: ${m}`) }
  // invariants
  const names = out.world.people.map((p) => p.name)
  for (const e of out.log) { if (!Number.isFinite(e.t)) fail('bad t ' + JSON.stringify(e)); if (e.t > out.window.hours * 60 + 60 * 24) fail('t way past end') }
  for (const n of names) if (!Number.isFinite(out.final[n].money)) fail('money NaN')
  for (const c of out.calls.filter((c) => c.for === 'generator')) if (c.result == null) fail('generation call failed: ' + c.label + ' ' + (c.error || ''))
  if (!extra.noAttr && Object.keys(out.world.contacts).length < names.length) fail('personal contacts missing')
  for (const c of out.calls) { if (c.head && !out.heads[c.head]) fail('missing head'); if (c.i !== out.calls.indexOf(c)) fail('call order') }
  // privacy: a person's balance and bank lines appear only in their own prompts
  for (const c of out.calls.filter((c) => c.head && names.includes(c.for))) {
    const bank = (c.prompt.match(/Bank: [^\n]*/g) || []); for (const b of bank) if (/received from (\S+ \S+)/.test(b) && b.includes(`received from ${c.for}`)) fail('sees own outgoing as received?')
    for (const other of names.filter((m) => m !== c.for)) if (c.prompt.includes(`YOU: ${other}.`)) fail('wrong head')
  }
  for (const e of out.log.filter((e) => e.kind === 'scene' || e.kind === 'call')) { if (!e.failed) for (let i = 1; i < e.lines.length; i++) if (e.lines[i].name === e.lines[i - 1].name) fail('same speaker twice'); if (e.lines.length > 30) fail('cap exceeded') }
  for (const t of out.log.filter((e) => e.kind === 'turn' && !e.failed)) if (!t.why.length) fail('turn without reason')
  const turns = out.log.filter((e) => e.kind === 'turn')
  const kinds = out.log.reduce((m, e) => (m[e.kind] = (m[e.kind] || 0) + 1, m), {})
  JSON.stringify(out) // serialisable
  console.log(`${file} ${JSON.stringify(extra)}: ${seen.calls} agent calls ${JSON.stringify(seen.kinds)} types ${JSON.stringify(seen.agentTypes)} maxConc ${seen.maxConcurrent} | log ${JSON.stringify(kinds)} | turns/person ${names.map((n) => turns.filter((t) => t.who === n).length).join(',')} | stats ${JSON.stringify({ ...out.stats, byFor: undefined })}`)
  if (extra.show) { console.log(out.transcript.slice(0, 2500)); console.log(out.memories.slice(0, 2000)); console.log(out.worldLog.slice(0, 1500)); console.log(logs.join('\n')) }
  return out
}

if (process.env.PEEK) module.exports = { test }
else (async () => {
  const files = process.argv.slice(2).length ? process.argv.slice(2) : fs.readdirSync(__dirname).filter((f) => /^attributes-.*\.json$/.test(f))
  for (const f of files) for (const seed of [1, 2, 3]) await test(f, { seed })
  await test('smoke-v3-args.json', { show: true })                       // the exact smoke-run args
  await test('smoke-v3-args.json', { roleAgent: 'sim', seed: 8 })
  await test(files[0], { roleAgent: 'sim', noSim: true, hours: 6 })   // custom role agent missing -> falls back to persona
  await test(files[0], { nullRate: 0.5, hours: 12 })                    // half of all calls die
  await test(files[0], { maxCalls: 15 })                                // backstop
  await test(files[0], { noAttr: true, hours: 6, audit: false })        // no attributes given
  const st = await test('attributes-street.json', { strangers: true, hours: 24, seed: 4 })   // neighbours who don't all know each other
  const names = st.world.people.map((p) => p.name)
  for (const c of st.calls.filter((c) => c.head && c.for === names[0] && /IT IS NOW/.test(c.prompt))) for (const m of names.slice(1)) if (new RegExp(`PHONE: people [^\\n]*${m}`).test(c.prompt) && !st.log.some((e) => (e.kind === 'dm' && e.from === m && e.to === names[0]) || (e.kind === 'call' && e.present.includes(m) && e.present.includes(names[0])))) throw new Error('number leaked')
  console.log('strangers: e.g.', (st.calls.find((c) => /stranger \(/.test(c.prompt))?.prompt.match(/HERE: [^\n]*/) || ['(no stranger seen)'])[0])
  await test(files[0], { hours: 168, seed: 9 })                         // a week
  console.log('ALL OK')
})().catch((e) => { console.error(e); process.exit(1) })

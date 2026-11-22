export const meta = {
  name: 'social-sim-v3',
  description: 'Social simulation: one agent per person plans its own time, decides whether to talk and when to stop, and rewrites its own memory; code keeps clock, places, money, calendar, who-knows-what, seeded events and full logs; a world role resolves consequences and logs its reasons',
  phases: [{ title: 'Generate' }, { title: 'Simulate' }, { title: 'Audit', model: 'opus' }],
}
// args: { label, setting, dateNote?, startDow (0=Mon), startHour, hours, seed, attributes: [{...}] | sample: {...}, n?, rules?: [str], audit?: bool, maxCalls?, roleAgent?: 'persona'|'sim' }
// Division of labour: the model makes every judgment (what to do and when, whether to talk, when to stop, what to remember, how the outside world responds).
// Code only keeps hard facts (clock, places, money, calendar, who has seen what, seeded base-rate events) and logs everything.
const A = args || {}
const HOURS = A.hours || 24, START_H = A.startHour ?? 8, START_DOW = A.startDow ?? 0, END = HOURS * 60
const OUT = 'elsewhere'
const MAX_LINES = 30 // runaway backstop only; people end conversations themselves (logged as ended 'cap' if ever hit)

// ---------- helpers ----------
let seed = (A.seed >>> 0) || 1
const rnd = () => { seed = (seed + 0x6D2B79F5) >>> 0; let t = seed; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296 }
const clamp = (x, lo, hi) => Math.min(hi, Math.max(lo, Number.isFinite(Number(x)) ? Number(x) : lo))
const DOW = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']
const dayOf = (m) => Math.floor((START_H * 60 + m) / 1440)
const NDAYS = dayOf(END - 1) + 1
const hm = (s) => { const x = String(s || '').match(/(\d{1,2}):(\d{2})/); return x && +x[1] <= 24 && +x[2] < 60 ? (+x[1] % 24) * 60 + +x[2] : NaN }
const atDay = (d, s) => d * 1440 + hm(s) - START_H * 60
const after = (s, t) => { const m = hm(s); if (Number.isNaN(m)) return NaN; let x = atDay(dayOf(t), s); while (x <= t) x += 1440; return x } // next time the clock shows s, strictly after t
const fmt = (m) => { const h = START_H * 60 + Math.round(m), r = ((h % 1440) + 1440) % 1440, d = Math.floor(h / 1440); return `${DOW[(START_DOW + d) % 7]} ${String(Math.floor(r / 60)).padStart(2, '0')}:${String(r % 60).padStart(2, '0')}${d >= 7 ? ' +' + Math.floor(d / 7) + 'wk' : ''}` }
const noEmoji = (s) => String(s || '').replace(/[\p{Extended_Pictographic}\u{FE0F}\u{200D}]/gu, '').replace(/\s{2,}/g, ' ').trim()
const list = (xs) => xs.length ? xs.map((x) => '- ' + x).join('\n') : '(none)'
const first = (n) => String(n).split(' ')[0].toLowerCase()
const str = { type: 'string' }, int = { type: 'integer' }, bool = { type: 'boolean' }, arr = (items, x = {}) => ({ type: 'array', items, ...x })
const obj = (props, req = Object.keys(props)) => ({ type: 'object', required: req, properties: props })
// fuzzy name match: exact, case-insensitive, then a unique prefix/containment match ("Priya" -> "Priya at Larch Lettings")
const resolve = (name, pool) => { const q = String(name || '').trim().toLowerCase(); if (!q) return ''
  const hit = pool.find((p) => p.toLowerCase() === q); if (hit) return hit
  const part = pool.filter((p) => p.toLowerCase().startsWith(q) || q.startsWith(p.toLowerCase()) || p.toLowerCase().includes(q)); return part.length === 1 ? part[0] : '' }

// ---------- every model call is logged in order: who it was for, why, sim time, prompt, result ----------
const CALLS = [], HEADS = {}
let clock = 0, ROLE_AT = A.roleAgent || 'persona' // 'persona' is the known-cheap no-tool agent; 'sim' (.claude/agents/sim.md) once it is loaded
const roleOf = (r) => `THIS CALL: you are not playing a person. You are the simulation's ${r}.\n`
async function call(kind, prompt, schema, o) {
  const at = kind === 'persona' ? 'persona' : ROLE_AT
  const rec = { i: CALLS.length, t: fmt(clock), phase: o.phase || 'Simulate', label: o.label, for: o.for, agent: at, model: o.model || '', head: o.head || '', why: o.why || '', prompt, result: null }
  CALLS.push(rec)
  const opts = { agentType: at, schema, label: o.label, phase: rec.phase, ...(o.model ? { model: o.model } : {}), ...(o.effort ? { effort: o.effort } : {}) }
  const full = (o.head ? HEADS[o.head] + '\n\n' : '') + prompt
  let r = null
  try { r = await agent(full, opts) } catch (e) { rec.error = String(e?.message || e).slice(0, 300) }
  if (r == null && at !== 'persona') { // custom role agent missing (agent files load at session start): use persona for the rest of the run
    ROLE_AT = 'persona'; rec.fallback = 'persona'; log(`role agent "${at}" unavailable; using persona for role calls`)
    try { r = await agent(full, { ...opts, agentType: 'persona' }) } catch (e) { rec.error = String(e?.message || e).slice(0, 300) }
  }
  rec.result = r ?? null
  return r
}

// ---------- 1. generate: each person written separately from their own attributes; then the world's mechanics ----------
phase('Generate')
const pull = (x) => Array.isArray(x) ? x : x && typeof x === 'object' ? [x.people, x.persons, x.sample, x.attributes].find(Array.isArray) : null
let ATTR = pull(A.attributes) || pull(A.sample)
const SETTING = A.setting || A.sample?.setting || A.sample?.description || 'an ordinary neighbourhood'
const clean = (a) => { const o = { ...a }; for (const k of Object.keys(o)) if (k.startsWith('_') || o[k] == null || (Array.isArray(o[k]) && !o[k].length)) delete o[k]; return o }
if (!ATTR?.length) {
  log('WARNING: no attributes given; the model will sample them, which drifts toward stereotype. Pass census-sampled attributes.')
  const g = await call('role', `${roleOf('population sampler')}Sample ${A.n || 3} people for: ${SETTING}. Draw each attribute from real distributions for this place, independently of the others: the commonest outcomes are the most likely.`,
    obj({ people: arr(obj({ name: str, age: int, sex: str, ethnicity: str, birthplace: str, occupation: str, household: str, relationship_status: str, health: str })) }), { phase: 'Generate', label: 'sample attributes', for: 'generator' })
  ATTR = g?.people || []
}
ATTR = ATTR.map(clean)
if (!ATTR.length) throw new Error('no people')
// temperament is drawn by code, independently of demographics, so the model cannot pick it from age/sex/ethnicity/religion
const TRAITS = ['openness', 'conscientiousness', 'extraversion', 'agreeableness', 'emotional stability']
const level = () => { const x = rnd(); return x < 0.25 ? 'low' : x < 0.75 ? 'average' : 'high' }
const TEMPER = ATTR.map(() => TRAITS.map((t) => `${t} ${level()}`).join(', '))
const PERSON = obj({ name: str, profile: { type: 'string', description: '4-6 sentences: who they are now, temperament (as given), a couple of ordinary interests, current small concerns, relationships' },
  speech: { type: 'string', description: 'how they talk out loud: register, pace, habits; regional speech only if where they grew up implies it' },
  texting: { type: 'string', description: 'how they type messages: length, case, punctuation, emoji or none, reply speed' },
  contacts: arr(obj({ name: str, relation: str, about: { type: 'string', description: 'one line incl. how they talk/text' }, lives_with_you: bool }, ['name', 'relation', 'about']), { maxItems: 6, description: 'people in their life outside this group: family, partner, close friends, boss. Full first names.' }),
  memory: { type: 'string', description: 'first person, under 80 words: what is on their mind as the simulation starts. Ordinary.' } })
const gen = await parallel(ATTR.map((a, i) => () => call('persona', `${roleOf('character writer')}Write one person for a social simulation set in: ${SETTING}. It starts ${fmt(0)}${A.dateNote ? ' (' + A.dateNote + ')' : ''}.
ATTRIBUTES (sampled from census data; fixed facts): ${JSON.stringify(a)}
TEMPERAMENT (fixed, drawn independently of everything else): ${TEMPER[i]}
Add only what a playable person needs. Choose interests, tastes, speech and concerns the way you would for anyone with this temperament, job, age and household; never because of ethnicity, birthplace, religion or sex. Names you add follow base rates for the person's birth year and birthplace. Ordinary life: no secrets, crises or plot hooks.`,
  PERSON, { phase: 'Generate', label: `write ${a.name || 'person ' + (i + 1)}`, for: 'generator' })))
const PEOPLE = ATTR.map((a, i) => { const g = gen[i] || {}; return { name: a.name || g.name || `Person ${i + 1}`, attributes: a, temperament: TEMPER[i], profile: g.profile || '', speech: g.speech || '', texting: g.texting || '', contacts: g.contacts || [], memory: g.memory || '' } })
const NAMES = PEOPLE.map((p) => p.name), P = Object.fromEntries(PEOPLE.map((p) => [p.name, p]))

const WORLD = obj({ currency: { type: 'string', description: 'symbol used here, e.g. £' }, background: { type: 'string', description: '3-5 sentences of shared ordinary context' },
  common_knowledge: arr(str, { maxItems: 10, description: 'what everyone here knows: how long/how well they know each other, norms, who pays what, rotas, opening hours' }),
  places: arr(obj({ name: str, kind: { type: 'string', enum: ['private', 'shared', 'public'] }, building: { type: 'string', description: 'places with the same label are rooms of one building; empty for public' }, access: arr(str, { description: 'names who may normally go in; empty = anyone' }) }),
    { description: "each person's own room or home, shared rooms, workplaces, and the few public places they'd use" }),
  starts: arr(obj({ name: str, place: str, doing: str, balance: { type: 'number', description: 'current account balance, realistic for their income and the point in the month' },
    knows: arr(str, { description: 'which of the other people they know by name' }), has_number: arr(str, { description: 'which of the other people they have a phone number for' }) }, ['name', 'place', 'doing', 'balance', 'knows', 'has_number'])),
  chats: arr(obj({ name: str, members: arr(str) }), { description: 'group chats that would realistically exist among these people' }),
  calendar: arr(obj({ what: str, who: arr(str), days: arr({ type: 'string', enum: DOW }), start: { type: 'string', description: 'HH:MM' }, end: { type: 'string', description: 'HH:MM' }, place: str }),
    { description: 'recurring commitments this week: shifts, school, classes, regular calls, bin night; from their attributes' }),
  contacts: arr(obj({ name: str, role: str, about: { type: 'string', description: '1 line incl. how they talk/text' }, linked_to: arr(str, { description: 'who has their number; empty = a business anyone can contact' }), place: { type: 'string', description: 'place where they can be met in person, or empty' } }, ['name', 'role', 'about', 'linked_to']),
    { description: 'shared background characters: landlord or agent, employers/managers, coworkers not simulated, school, local businesses' }),
  events: arr(obj({ text: { type: 'string', description: 'concrete, second person' }, who: arr(str), shared: { type: 'boolean', description: 'one roll for all listed (e.g. a power cut) vs rolled per person' },
    p_per_day: { type: 'number', description: 'honest real-world base rate per day; most well under 0.1' }, hours: arr(int, { description: '[from, to] clock hours' }), money: { type: 'number', description: 'signed effect, if any' },
    from: { type: 'string', description: 'a contact who gets in touch, if this is someone getting in touch' } }, ['text', 'who', 'p_per_day']),
    { description: 'base-rate outside events: deliveries, post, faults, illness, transport delays, relatives or work getting in touch. Generic to their circumstances; not drawn from their current concerns.' }),
  money: arr(obj({ who: str, amount: { type: 'number', description: 'signed: + pay in, - rent/bills out' }, what: str, day: { type: 'integer', description: `day index 0..${NDAYS - 1}` }, time: str }), { description: 'pay, benefits, rent, bills and direct debits that fall in this window' }) })
const W = await call('role', `${roleOf('world builder')}Supply the ordinary structure real life would have for these people. No plot.
SETTING: ${SETTING}
WINDOW: ${fmt(0)} for ${HOURS} hours (day 0 = ${DOW[START_DOW]}). ${A.dateNote || ''}
PEOPLE:\n${PEOPLE.map((p) => `${p.name}: ${JSON.stringify(p.attributes)}\n  ${p.profile}\n  Their own contacts: ${p.contacts.map((c) => `${c.name} (${c.relation})`).join(', ') || 'none'}`).join('\n')}
Use only these names for the people. Their own contacts already exist; add only shared ones.`, WORLD, { phase: 'Generate', label: 'build world', for: 'generator' })
if (!W) throw new Error('world generation returned nothing')

// ---------- normalise the world into hard facts ----------
const CUR = W.currency || ''
const money = (x) => `${x < 0 ? '-' : ''}${CUR}${Math.abs(x).toFixed(2)}`
const PLACES = [...(W.places || []).filter((p) => p.name && p.name !== OUT).map((p) => ({ name: p.name, kind: p.kind || 'public', building: p.building || '', access: (p.access || []).filter((n) => NAMES.includes(n)) })), { name: OUT, kind: 'public', building: '', access: [] }]
const PLACE = Object.fromEntries(PLACES.map((p) => [p.name, p]))
const placeOf = (name) => resolve(name, PLACES.map((p) => p.name))
const canGo = (n, pl) => !PLACE[pl].access.length || PLACE[pl].access.includes(n)
const CONTACT = {}
for (const c of W.contacts || []) if (c.name && !NAMES.includes(c.name)) { const x = CONTACT[c.name] ||= { name: c.name, role: c.role, about: c.about || '', linked: [], place: '' }; x.linked.push(...(c.linked_to || []).filter((n) => NAMES.includes(n))); x.public = !(c.linked_to || []).length; x.place = placeOf(c.place) && c.place ? placeOf(c.place) : x.place }
for (const p of PEOPLE) for (const c of p.contacts) if (c.name && !NAMES.includes(c.name)) { // a person's own people; same first name in two lives = two people
  const key = CONTACT[c.name] && !CONTACT[c.name].linked.includes(p.name) ? `${c.name} (${p.name.split(' ')[0]}'s ${c.relation})` : c.name
  const x = CONTACT[key] ||= { name: key, role: `${p.name}'s ${c.relation}`, about: c.about || '', linked: [], place: '' }; x.linked.push(p.name); c.key = key; if (c.lives_with_you) x.home = p.name }
const contactsOf = (n) => Object.values(CONTACT).filter((c) => c.public || c.linked.includes(n)).map((c) => c.name)
const CHATS = (W.chats || []).map((c) => ({ name: c.name, members: (c.members || []).map((m) => resolve(m, NAMES)).filter(Boolean) })).filter((c) => c.name && c.members.length > 1)
const startOf = (n) => (W.starts || []).find((x) => resolve(x.name, NAMES) === n) || {}
const START = Object.fromEntries(NAMES.map((n) => { const s = startOf(n); const home = PLACES.find((p) => p.kind === 'private' && p.access.includes(n))?.name || OUT
  return [n, { place: placeOf(s.place) || home, doing: s.doing || 'at home', balance: Number.isFinite(Number(s.balance)) ? Number(s.balance) : 300 }] }))
// who knows whom (by name) and who has whose number: facts code keeps; group-chat members have each other's numbers
for (const c of Object.values(CONTACT)) if (c.home && !c.place) c.place = PLACES.find((p) => p.kind === 'private' && p.access.includes(c.home))?.name || '' // lives with them: met at their home
const KNOW = {}, NUM = {}
for (const n of NAMES) { const s = startOf(n), mates = CHATS.filter((c) => c.members.includes(n)).flatMap((c) => c.members)
  NUM[n] = new Set(Array.isArray(s.has_number) ? [...s.has_number.map((m) => resolve(m, NAMES)), ...mates] : NAMES)
  KNOW[n] = new Set(Array.isArray(s.knows) ? [...s.knows.map((m) => resolve(m, NAMES)), ...NUM[n]] : NAMES) }
const desc = (m) => { const a = P[m].attributes; return [a.sex, Number.isFinite(+a.age) ? `${Math.floor(a.age / 10) * 10}s` : ''].filter(Boolean).join(', ') || 'someone' }
const label = (v, m) => !NAMES.includes(m) || v === m || KNOW[v].has(m) ? m : `stranger (${desc(m)})`
const CAL = [] // occurrences {what, who, place, t0, t1, by}
const addOcc = (what, who, place, t0, t1, by) => { if (t1 > 0 && t0 < END && !Number.isNaN(t0)) CAL.push({ what, who, place: placeOf(place) || OUT, t0, t1, by }) }
for (const c of W.calendar || []) for (let d = 0; d < NDAYS; d++) if ((c.days || []).includes(DOW[(START_DOW + d) % 7])) {
  const t0 = atDay(d, c.start); let t1 = atDay(d, c.end); if (Number.isNaN(t1) || t1 <= t0) t1 = (Number.isNaN(t1) ? t0 + 60 : t1 + 1440)
  addOcc(c.what, (c.who || []).map((n) => resolve(n, NAMES)).filter(Boolean), c.place, t0, t1, 'routine') }
const EVENTS = [] // rolled once from the seed
for (let d = 0; d < NDAYS; d++) for (const e of W.events || []) {
  const who = (e.who || []).map((n) => resolve(n, NAMES)).filter(Boolean); if (!who.length || !e.text) continue
  for (const g of e.shared ? [who] : who.map((n) => [n])) {
    if (rnd() >= clamp(e.p_per_day, 0, 1)) continue
    const [h0, h1] = Array.isArray(e.hours) && e.hours.length === 2 ? e.hours.map(Number) : [8, 21]
    const t = atDay(d, '00:00') + Math.floor((h0 + rnd() * Math.max(0, h1 - h0)) * 60)
    if (t >= 0 && t < END) EVENTS.push({ t, who: g, text: e.text, money: Number(e.money) || 0, from: CONTACT[e.from] ? e.from : resolve(e.from, Object.keys(CONTACT)) })
  } }
EVENTS.sort((a, b) => a.t - b.t)
const FLOWS = (W.money || []).map((m) => ({ ...m, who: resolve(m.who, NAMES), amount: Number(m.amount) || 0, t: atDay(clamp(m.day, 0, NDAYS - 1), m.time || '09:00') })).filter((m) => m.who && m.amount && m.t >= 0 && m.t < END)
const world = { setting: SETTING, currency: CUR, background: W.background, common_knowledge: W.common_knowledge || [], people: PEOPLE.map((p) => ({ ...p, start: START[p.name] })), places: PLACES, chats: CHATS, calendar_template: W.calendar || [], contacts: Object.values(CONTACT), event_types: W.events || [], money: FLOWS }
log(`${A.label}: ${NAMES.join(', ')} · ${PLACES.length} places · ${CAL.length} calendar slots · ${EVENTS.length} events rolled · ${Object.keys(CONTACT).length} contacts`)

// ---------- 2. simulate ----------
phase('Simulate')
const RULES = ['You are one real person, not an assistant. You know only what you have seen, been told, or is common knowledge here.',
  'Do things for your own reasons. Nobody is directing a story; most of life is routine.',
  'Talk the way you talk and text the way you text. Speech is spoken words only.',
  'Money is real: you can only spend what you have.',
  'Silence, short replies and doing nothing are normal. No speeches, therapy-speak or tidy resolutions.', ...(A.rules || [])]
const facts = (a) => Object.entries(a).filter(([k]) => k !== 'name').map(([k, v]) => `${k}: ${typeof v === 'object' ? JSON.stringify(v) : v}`).join('; ')
for (const p of PEOPLE) HEADS[p.name] = `RULES:\n${list(RULES)}\n\nYOU: ${p.name}. ${facts(p.attributes)}\nTemperament: ${p.temperament}\n${p.profile}\nPeople in your life: ${p.contacts.map((c) => `${c.name} (${c.relation})`).join(', ') || 'none named'}\nHOW YOU SPEAK: ${p.speech}\nHOW YOU TEXT: ${p.texting}\n\nWHERE YOU LIVE: ${W.background || ''}\nEVERYONE HERE KNOWS:\n${list(W.common_knowledge || [])}`

const L = [] // the full event log; every entry has t and kind
const S = Object.fromEntries(NAMES.map((n) => [n, { place: START[n].place, doing: START[n].doing, asleep: false, phone: 30, plan: [], pv: 0, next: 0, why: ['the simulation starts'], inbox: [], ping: false, memory: P[n].memory, money: START[n].balance, last: -1, turns: 0 }]))
const Q = []; let qs = 0
const at = (t, run) => { Q.push({ t, run, s: qs++ }); Q.sort((a, b) => a.t - b.t || a.s - b.s) }
const pendingWorld = [], pendingCalls = [], threads = {} // threads[contact]: recent exchanges with that contact (code-kept facts the world role sees)
const thread = (c, line) => { (threads[c] ||= []).push(line); threads[c] = threads[c].slice(-8) }
const MAX_CALLS = A.maxCalls || Math.round(60 + NAMES.length * 120 * HOURS / 24) // runaway backstop only, never pacing: nothing is rationed below it
let simCalls = 0, stopped = null
const ask = (kind, prompt, schema, o) => { simCalls++; return call(kind, prompt, schema, o) }

const wake = (n, t, why) => { const s = S[n]; s.why.push(why); s.next = Math.min(s.next, Math.max(t, s.last + 3)) }
// news reaches a person when they would look: at their own chosen phone-check rhythm, between activities, or when they wake
function notify(n, t, text, urgent = true) {
  const s = S[n]; s.inbox.push(`${fmt(t)} ${text}`); if (s.inbox.length > 16) s.inbox.splice(0, s.inbox.length - 15, `(${s.inbox.length - 15} older items)`)
  if (!urgent) return
  s.ping = true; if (s.asleep || !s.phone) return
  wake(n, t + Math.floor(rnd() * s.phone), `looked at your phone (${text.slice(0, 50)})`)
}
const here = (n, pl = S[n].place) => NAMES.filter((m) => m !== n && S[m].place === pl && pl !== OUT)
const step = (n) => S[n].plan.find((p) => p.t0 <= clock && clock < p.t1)

function setPlan(n, steps, now) {
  const s = S[n], v = ++s.pv; s.plan = []; let t = now
  for (const st of (steps || []).slice(0, 8)) {
    let t1 = after(st.until, t); if (Number.isNaN(t1) || t1 - t > 23 * 60) continue; t1 = Math.min(t1, now + 20 * 60) // >23h means a time just past: a slip, not a plan
    const pl = placeOf(st.place) || s.place
    s.plan.push({ t0: t, t1, place: canGo(n, pl) ? pl : s.place, doing: noEmoji(st.doing) || 'carrying on', asleep: !!st.asleep, phone: clamp(st.phone_minutes ?? 30, 0, 240) }); t = t1
    if (t >= now + 20 * 60) break }
  if (!s.plan.length || s.plan[s.plan.length - 1].t1 < now + 10) s.plan.push({ t0: t, t1: Math.max(t, now) + 60, place: s.place, doing: s.doing || 'carrying on', asleep: s.asleep, phone: s.phone, auto: true })
  s.plan.forEach((st, i) => at(st.t0, () => s.pv === v && startStep(n, st, i)))
  const end = s.plan[s.plan.length - 1].t1; at(end, () => s.pv === v && wake(n, end, 'your plan ran out'))
}
function startStep(n, st, i) {
  const s = S[n], was = { place: s.place, asleep: s.asleep }
  Object.assign(s, { place: st.place, doing: st.doing, asleep: st.asleep, phone: st.phone })
  if (was.place !== s.place) L.push({ t: clock, kind: 'move', who: n, from: was.place, to: s.place, doing: s.doing })
  if (s.asleep) return
  if (s.ping && (was.asleep || i > 0)) wake(n, clock, was.asleep ? 'you woke up' : 'between things, you checked your phone')
  const others = here(n).filter((m) => !S[m].asleep)
  if (was.place !== s.place && others.length) { wake(n, clock, `you came into ${s.place}: ${others.join(', ')} here`); for (const m of others) notify(m, clock, `${label(m, n)} came into ${s.place}.`, false) }
}

// ---------- outside world: seeded events, money flows, calendar ----------
for (const e of EVENTS) at(e.t, (t) => { for (const n of e.who) {
  if (e.money) { S[n].money += e.money; L.push({ t, kind: 'money', who: n, amount: e.money, what: e.text }) }
  if (e.from) pendingWorld.push({ kind: 'gets in touch', from: e.from, who: n, text: e.text })
  else { L.push({ t, kind: 'event', who: n, text: e.text }); notify(n, t, e.text) } } })
for (const m of FLOWS) at(m.t, (t) => { S[m.who].money += m.amount; L.push({ t, kind: 'money', who: m.who, amount: m.amount, what: m.what }); notify(m.who, t, `Bank: ${m.amount >= 0 ? 'in' : 'out'} ${money(Math.abs(m.amount))} ${m.what}. Balance ${money(S[m.who].money)}.`, false) })
const watchOcc = (o) => { if (o.place !== OUT && o.t0 + 15 < END && o.t0 + 15 >= 0) at(o.t0 + 15, (t) => { for (const n of o.who) if (S[n].place !== o.place) { L.push({ t, kind: 'missed', who: n, what: o.what, place: o.place }); pendingWorld.push({ kind: 'not there', who: n, text: `${n} is not at ${o.place} for "${o.what}" (due ${fmt(o.t0)}); they are at ${S[n].place}` }) } }) }
CAL.forEach(watchOcc)

// ---------- prompts ----------
const calView = (n, now) => CAL.filter((o) => o.who.includes(n) && o.t1 > now && o.t0 < now + 1440).sort((a, b) => a.t0 - b.t0).map((o) => `${fmt(o.t0)}-${fmt(o.t1).slice(4)} ${o.what}${o.place !== OUT ? ' @' + o.place : ''}${o.who.length > 1 ? ' (with ' + o.who.filter((x) => x !== n).join(', ') + ')' : ''}`)
const planView = (n, now) => S[n].plan.filter((p) => p.t1 > now && !p.auto).map((p) => `until ${fmt(p.t1)}: ${p.doing} @${p.place}${p.asleep ? ' (asleep)' : ''}`)
const TURN = obj({ memory: { type: 'string', description: 'REWRITE your memory, first person, max 120 words: what you would actually remember: people, promises, plans, what is on your mind. Drop the rest.' },
  keep_plan: { type: 'boolean', description: 'true if your current plan still stands (then plan may be empty)' },
  plan: arr(obj({ until: { type: 'string', description: 'HH:MM clock time this step lasts until' }, place: str, doing: { type: 'string', description: 'a few words' }, asleep: bool, phone_minutes: { type: 'integer', description: 'how often you would glance at your phone during this (0 = not at all)' } }, ['until', 'place', 'doing']), { maxItems: 8, description: 'your next few hours (up to ~16h) as consecutive steps, sleep included' }),
  talk_to: { type: 'string', description: 'someone here or in the same building you go and speak to now; else empty' },
  call: { type: 'string', description: 'ring someone now; else empty' },
  messages: arr(obj({ to: { type: 'string', description: 'group chat, person or contact' }, text: str }), { maxItems: 3 }),
  pay: arr(obj({ to: str, amount: { type: 'number' }, note: str }, ['to', 'amount']), { maxItems: 2 }),
  do: arr(obj({ what: { type: 'string', description: 'something you do that has an outcome: buy, order, book, check an app, look something up' }, max_spend: { type: 'number' } }, ['what']), { maxItems: 2 }),
  arrange: arr(obj({ what: str, day: { type: 'string', enum: DOW }, time: { type: 'string', description: 'HH:MM' }, minutes: int, place: str }, ['what', 'day', 'time']), { maxItems: 2, description: 'something agreed or booked: goes in YOUR calendar' }) }, ['memory', 'keep_plan'])
const atPlace = (pl) => pl === OUT ? [] : Object.values(CONTACT).filter((c) => c.place === pl).map((c) => c.name)
const hereView = (n, ppl, pl) => [...ppl.map((m) => `${label(n, m)} (${S[m].asleep ? 'asleep' : S[m].doing})`), ...atPlace(pl).map((c) => `${c} (${CONTACT[c].role})`)].join(', ') || 'nobody'
const phoneBook = (n) => NAMES.filter((m) => m !== n && NUM[n].has(m))
const turnPrompt = (n, now) => { const s = S[n], st = step(n), others = here(n)
  return `IT IS NOW ${fmt(now)}. WHY NOW: ${[...new Set(s.why)].join('; ')}.
YOUR MEMORY (you wrote this):\n${s.memory || '(empty)'}
WHERE YOU ARE: ${s.place}, ${s.doing}${s.asleep ? ' (asleep until now)' : ''}. HERE: ${hereView(n, others, s.place)}.
YOUR PLAN (as you left it):\n${list(planView(n, now))}${st?.auto ? '\n(you had no plan for now)' : ''}
CALENDAR (next 24h):\n${list(calView(n, now))}
NEW SINCE ${s.last < 0 ? 'THE START' : fmt(s.last)}:\n${list(s.inbox)}
BALANCE: ${money(s.money)}
PLACES: ${PLACES.filter((p) => canGo(n, p.name)).map((p) => p.name).join(' | ')}
PHONE: people ${phoneBook(n).join(', ') || 'none'}; contacts ${contactsOf(n).join(', ') || 'none'}; groups ${CHATS.filter((c) => c.members.includes(n)).map((c) => c.name).join(', ') || 'none'}.
What do you do now? Most moments change little.` }

// ---------- turns ----------
function send(from, to, text, t) {
  text = String(text || '').trim(); if (!text) return
  const chat = CHATS.find((c) => c.name === resolve(to, CHATS.filter((c) => c.members.includes(from)).map((c) => c.name)))
  const p = resolve(to, phoneBook(from)), c = resolve(to, contactsOf(from))
  if (chat) { L.push({ t, kind: 'chat', to: chat.name, from, text }); for (const m of chat.members) if (m !== from) notify(m, t, `[${chat.name}] ${from}: ${text}`) }
  else if (p) { L.push({ t, kind: 'dm', from, to: p, text }); NUM[p].add(from); KNOW[p].add(from); notify(p, t, `${from} texted: ${text}`) }
  else if (c) { L.push({ t, kind: 'dm', from, to: c, text }); if (!CONTACT[c].linked.includes(from)) CONTACT[c].linked.push(from); thread(c, `${fmt(t)} ${from} → ${c}: ${text}`); pendingWorld.push({ kind: 'message', who: from, from: c, text: `${from} texted ${c}: "${text}"` }) }
  else notify(from, t, `Your message to "${to}" could not be sent (no such number or group).`, false)
}
function applyTurn(n, r, now, intents) {
  const s = S[n], why = [...new Set(s.why)]; s.last = now; s.next = Infinity; s.why = []; s.turns++
  if (!r) { L.push({ t: now, kind: 'turn', who: n, why, failed: true }); s.why = why; s.next = now + 30; return } // keep their news for the retry
  const seen = s.inbox; s.inbox = []; s.ping = false
  if (String(r.memory || '').trim()) s.memory = String(r.memory).trim().slice(0, 1200)
  const live = s.plan.some((p) => p.t1 > now && !p.auto)
  if (!(r.keep_plan && live) || (r.plan || []).length) setPlan(n, r.plan, now)
  for (const m of r.messages || []) send(n, m.to, m.text, now)
  for (const p of r.pay || []) { const amt = Math.round(Number(p.amount) * 100) / 100, to = resolve(p.to, phoneBook(n)) || resolve(p.to, here(n).filter((m) => KNOW[n].has(m))) || resolve(p.to, contactsOf(n)) || String(p.to || 'someone')
    if (!(amt > 0)) continue
    if (amt > s.money) { notify(n, now, `Payment of ${money(amt)} to ${to} failed: not enough in your account.`, false); continue }
    s.money -= amt; if (NAMES.includes(to)) { S[to].money += amt; notify(to, now, `Bank: ${money(amt)} received from ${n}${p.note ? ' (' + p.note + ')' : ''}.`, false) }
    L.push({ t: now, kind: 'pay', from: n, to, amount: amt, note: p.note || '' }) }
  for (const a of r.do || []) if (String(a.what || '').trim()) pendingWorld.push({ kind: 'action', who: n, text: `${n} (at ${s.place}, balance ${money(s.money)}${a.max_spend ? ', will spend up to ' + money(a.max_spend) : ''}): ${a.what}` })
  for (const a of r.arrange || []) { if (!DOW.includes(a.day)) continue
    let d = dayOf(now); while (DOW[(START_DOW + d) % 7] !== a.day) d++; let t0 = atDay(d, a.time); if (Number.isNaN(t0)) continue; if (t0 < now) t0 += 7 * 1440
    if (t0 < END) { addOcc(a.what, [n], a.place, t0, t0 + clamp(a.minutes || 60, 5, 720), n); const o = CAL[CAL.length - 1]; L.push({ t: now, kind: 'calendar', who: n, what: o.what, at: o.t0, place: o.place }); watchOcc(o) } }
  if (r.talk_to) intents.push({ kind: 'talk', from: n, to: r.talk_to })
  if (r.call) intents.push({ kind: 'call', from: n, to: r.call })
  L.push({ t: now, kind: 'turn', who: n, why, seen, place: s.place, doing: s.doing, memory: s.memory, plan: planView(n, now), kept: !!r.keep_plan, talk_to: r.talk_to || '', call: r.call || '', messages: (r.messages || []).length, do: (r.do || []).map((a) => a.what) })
}

// ---------- scenes: whoever is in it speaks through their own agent; they end it themselves ----------
const SAY = obj({ say: { type: 'string', description: 'words said out loud, or empty' }, do: { type: 'string', description: 'brief action, or empty' },
  leave: { type: 'boolean', description: 'you walk off / hang up after this' }, done: { type: 'boolean', description: 'you are happy for this to stop here' },
  replan: { type: 'boolean', description: 'this conversation changes what you are going to do next' } }, ['say', 'do', 'leave', 'done'])
const sceneText = (lines, v) => lines.map((l) => { const nm = v ? label(v, l.name) : l.name; return l.say ? `${nm}: "${l.say}"${l.do ? ' (' + l.do + ')' : ''}` : `${nm} (${l.do || 'says nothing'})` }).join('\n')
const threadOf = (c, ppl) => (threads[c] || []).filter((x) => ppl.some((p) => x.includes(p))).slice(-5)
async function scene(t, where, phone, people, starter, opening) {
  const lines = [], left = new Set(), done = {}, replan = new Set(); let failed = 0, mins = 0, ended = 'cap', speaker = starter
  if (opening) { lines.push({ name: starter, say: noEmoji(opening), do: '' }); mins += 0.3; speaker = people.find((x) => x !== starter) }
  while (lines.length < MAX_LINES) {
    const others = people.filter((x) => x !== speaker && !left.has(x)), ringing = phone && speaker !== starter && !lines.some((l) => l.name === speaker)
    const soFar = ringing ? '(nothing yet: the phone is ringing)' : sceneText(lines, NAMES.includes(speaker) && speaker) || '(nothing yet: you start)'
    let r
    if (CONTACT[speaker]) { const c = CONTACT[speaker]
      r = await ask('role', `${roleOf('world, voicing one background character')}${c.name} (${c.role}): ${c.about}\nTheir recent contact with these people:\n${list(threadOf(c.name, others))}\nSetting: ${SETTING}. It is ${fmt(t + mins)}. ${phone ? `On the phone with ${others.join(', ')}.` : `At ${where} with ${others.join(', ')}.`}${ringing ? ` ${c.name}'s phone is ringing (${starter}); they may not pick up (leave=true, say nothing).` : ''}\nSO FAR:\n${soFar}\nWhat does ${c.name} say or do? Brief and ordinary.`, SAY, { label: `${A.label} ${c.name} @${where}`, for: c.name, why: 'scene line' })
    } else {
      r = await ask('persona', `YOUR MEMORY:\n${S[speaker].memory || '(empty)'}\nYOUR PLAN: ${planView(speaker, t + mins).slice(0, 2).join(' / ') || '(none)'}\n\nIT IS ${fmt(t + mins)}. ${phone ? `You are ON THE PHONE with ${others.map((m) => label(speaker, m)).join(', ')} (you are at ${S[speaker].place}).` : `You are at ${where}.`}${phone ? '' : ` PRESENT: ${others.map((m) => `${label(speaker, m)} (${NAMES.includes(m) ? S[m].doing : CONTACT[m].role})`).join(', ')}.`}${ringing ? `\nYOUR PHONE IS RINGING: ${NUM[speaker].has(starter) || CONTACT[starter] ? starter : 'a number you do not have saved'}. Answer (say something) or let it ring (leave=true, say nothing).` : ''}
SO FAR${mins >= 1 ? ` (${Math.round(mins)} min in)` : ''}:\n${soFar}
Your turn. You can say nothing, carry on with what you were doing, or ${phone ? 'hang up' : 'leave'}. Most conversations are short.`, SAY, { label: `${A.label} ${speaker} @${where}`, for: speaker, head: speaker, why: 'scene line' })
    }
    if (ringing && (!r || (r.leave && !String(r.say || '').trim()))) { ended = 'not answered'; left.add(speaker); lines.length = 0; break }
    const say = noEmoji(r?.say), act = noEmoji(r?.do)
    if (!r) failed++
    if (r) { lines.push({ name: speaker, say, do: act }); mins += 0.15 + (say.split(/\s+/).filter(Boolean).length / 150) }
    done[speaker] = !r || !!r.done || !!r.leave
    if (r?.leave) left.add(speaker)
    if (r?.replan && NAMES.includes(speaker)) replan.add(speaker)
    const live = people.filter((x) => !left.has(x)); if (live.length < 2) { ended = phone ? 'hung up' : 'walked off'; break }
    const named = !r ? [] : live.filter((x) => x !== speaker && (say.toLowerCase().includes(first(x)) || (live.length === 2 && say.trim().endsWith('?'))))
    const order = live.filter((x) => x !== speaker).sort((a, b) => lines.map((l) => l.name).lastIndexOf(a) - lines.map((l) => l.name).lastIndexOf(b))
    const nxt = named[0] || order.find((x) => !done[x])
    if (!nxt) { ended = 'talk ran out'; break }
    speaker = nxt
  }
  const end = t + Math.ceil(mins)
  L.push({ t, kind: phone ? 'call' : 'scene', where, present: people, lines, minutes: Math.ceil(mins), ended, answered: ended !== 'not answered', ...(failed ? { failed } : {}) })
  const ps = people.filter((x) => NAMES.includes(x))
  for (const m of ps) if (lines.some((l) => l.say.toLowerCase().includes(first(m)))) for (const v of ps) KNOW[v].add(m)
  if (phone && ps.length === 2) for (const v of ps) NUM[v].add(ps.find((x) => x !== v))
  for (const n of ps) { notify(n, end, ended === 'not answered' && n === starter ? `You rang; no answer.` : ended === 'not answered' ? `Missed call from ${starter}.` : `${phone ? 'Call' : 'Conversation at ' + where} with ${people.filter((x) => x !== n).map((m) => label(n, m)).join(', ')}:\n${sceneText(lines, n)}`, false); if (replan.has(n)) wake(n, end, 'after the conversation') }
  for (const c of people.filter((x) => CONTACT[x])) { thread(c, `${fmt(t)} ${phone ? 'call' : 'met'} with ${people.filter((x) => x !== c).join(', ')}: ${ended === 'not answered' ? '(not answered)' : lines.map((l) => `${l.name}: ${l.say || '(' + l.do + ')'}`).join(' / ').slice(0, 600)}`)
    if (ended === 'not answered' && NAMES.includes(starter)) pendingWorld.push({ kind: 'missed call', who: starter, from: c, text: `${starter} rang ${c}; ${c} did not pick up` }) }
  return end
}
async function intent(x, now) {
  const s = S[x.from]
  if (x.kind === 'call') {
    const p = resolve(x.to, phoneBook(x.from)), c = p ? '' : resolve(x.to, contactsOf(x.from))
    if (!p && !c) { notify(x.from, now, `You can't ring "${x.to}": no number for them.`, false); return now }
    if (p && S[p].asleep) { L.push({ t: now, kind: 'call', where: 'phone', present: [x.from, p], lines: [], ended: 'asleep, not answered', answered: false }); NUM[p].add(x.from); notify(p, now, `Missed call from ${x.from}.`); notify(x.from, now, `You rang ${p}; no answer.`, false); return now }
    if (c && !CONTACT[c].linked.includes(x.from)) CONTACT[c].linked.push(x.from)
    return scene(now, `phone: ${x.from} → ${p || c}`, true, [x.from, p || c], x.from)
  }
  const reach = NAMES.filter((m) => m !== x.from), byLabel = Object.fromEntries(reach.map((m) => [label(x.from, m), m]))
  const p = byLabel[resolve(x.to, Object.keys(byLabel))] || '', c = p ? '' : resolve(x.to, atPlace(s.place))
  if (c) return scene(now, s.place, false, [x.from, c], x.from)
  const sameBuilding = p && (S[p].place === s.place || (PLACE[s.place].building && PLACE[s.place].building === PLACE[S[p].place].building))
  if (!p || !sameBuilding || S[p].place === OUT || (!KNOW[x.from].has(p) && S[p].place !== s.place)) { notify(x.from, now, `${x.to} isn't around here.`, false); return now }
  if (S[p].asleep) { notify(x.from, now, `${label(x.from, p)} seems to be asleep.`, false); return now }
  const pl = S[p].place, ppl = [x.from, ...NAMES.filter((m) => m !== x.from && S[m].place === pl && !S[m].asleep)]
  return scene(now, pl, false, ppl, x.from) // a visit: the initiator's own plan resumes afterwards
}

// ---------- the world role: consequences only, each with a reason ----------
const RESOLVE = obj({ decisions: arr(obj({ item: int, kind: { type: 'string', enum: ['result', 'text', 'call', 'none'] }, who: { type: 'string', description: 'the simulated person affected' },
  from: { type: 'string', description: 'for text/call: the contact who sends it' }, text: { type: 'string', description: 'result: what they see or what happens, second person. text/call: the words, in that contact\'s voice' },
  cost: { type: 'number', description: 'charged to who now; 0 if free' }, delay_minutes: int, reason: { type: 'string', description: 'one line: why this outcome' } }, ['item', 'kind', 'who', 'text', 'reason'])) })
async function resolveWorld(now) {
  if (!pendingWorld.length) return
  const items = pendingWorld.splice(0), cs = [...new Set(items.map((x) => x.from).filter(Boolean))]
  const r = await ask('role', `${roleOf('world: shops, services, apps, workplaces and background characters')}You only work out the consequences of what the people did and of the listed events. Never start new storylines or add drama. Ordinary outcomes, with the everyday friction real life has (engaged, sold out, slow reply, no reply). Every decision gets a one-line reason. Use realistic delays.
SETTING: ${SETTING}. NOW: ${fmt(now)}. Currency: ${CUR}.
${cs.length ? `CONTACTS:\n${cs.map((c) => `${c} (${CONTACT[c]?.role}): ${CONTACT[c]?.about}\n  recent: ${(threads[c] || []).slice(-5).join(' | ') || 'nothing'}`).join('\n')}\n` : ''}ITEMS:\n${items.map((x, i) => `${i + 1}. [${x.kind}] ${x.kind === 'gets in touch' ? `${x.from} gets in touch with ${x.who} about: ${x.text} (write what ${x.from} actually sends or says)` : x.text}`).join('\n')}
One or more decisions per item (kind none if nothing comes of it).`, RESOLVE, { label: `${A.label} world ${fmt(now)}`, for: 'world', why: items.map((x) => x.kind).join(', ') })
  const got = new Set()
  for (const d of r?.decisions || []) {
    const it = items[(d.item | 0) - 1], who = resolve(d.who, NAMES) || it?.who; if (!who) continue; got.add(it)
    const t = now + clamp(d.delay_minutes || 0, 0, 2880), from = resolve(d.from, Object.keys(CONTACT)) || it?.from
    L.push({ t: now, kind: 'world', item: it?.text || '', decision: d.kind, who, from: from || '', text: d.text, cost: Number(d.cost) || 0, at: t, reason: d.reason })
    if (d.kind === 'none') continue
    if (d.kind !== 'result' && !(from && CONTACT[from].linked.includes(who))) { L[L.length - 1].blocked = `${from || '(no contact)'} has no number for ${who}`; continue }
    if (d.kind === 'result') { const cost = Math.max(0, Number(d.cost) || 0), ok = cost <= S[who].money; if (ok) S[who].money -= cost
      const text = ok ? d.text + (cost ? ` (${money(cost)})` : '') : `Card declined (${money(cost)} needed).`
      if (ok && cost) L.push({ t: now, kind: 'pay', from: who, to: '(outside)', amount: cost, note: d.text })
      if (t < END) at(t, (tt) => { L.push({ t: tt, kind: 'result', who, text }); notify(who, tt, text) }) }
    else if (t < END) at(t, (tt) => { thread(from, `${fmt(tt)} ${from} → ${who}: ${d.text}`)
      if (d.kind === 'text') { L.push({ t: tt, kind: 'dm', from, to: who, text: d.text }); notify(who, tt, `${from} texted: ${d.text}`) }
      else if (S[who].asleep) { L.push({ t: tt, kind: 'call', where: `phone: ${from} → ${who}`, present: [from, who], lines: [], ended: 'asleep, not answered', answered: false }); notify(who, tt, `Missed call from ${from}.`) }
      else pendingCalls.push({ t: tt, from, to: who, opening: d.text }) })
  }
  for (const it of items) if (!got.has(it)) L.push({ t: now, kind: 'world', item: it.text, decision: 'unresolved', who: it.who, reason: r ? 'no decision returned' : 'world call failed' })
}

// ---------- main loop: jump to the next thing that happens; quiet time costs nothing ----------
while (true) {
  const tNext = Math.min(...NAMES.map((n) => S[n].next), Q.length ? Q[0].t : Infinity)
  if (tNext >= END) break
  clock = Math.max(clock, tNext)
  while (Q.length && Q[0].t <= clock) Q.shift().run(clock)
  if (simCalls >= MAX_CALLS) { stopped = clock; log(`${A.label}: safety stop at ${MAX_CALLS} calls, ${fmt(clock)}`); L.push({ t: clock, kind: 'stopped', reason: `maxCalls ${MAX_CALLS}` }); break }
  const due = NAMES.filter((n) => S[n].next <= clock)
  const res = await parallel(due.map((n) => () => ask('persona', turnPrompt(n, clock), TURN, { label: `${A.label} ${n} ${fmt(clock)}`, for: n, head: n, why: [...new Set(S[n].why)].join('; ') })))
  const intents = []
  due.forEach((n, k) => applyTurn(n, res[k], clock, intents))
  let endT = clock, met = new Set()
  for (const c of pendingCalls.splice(0)) endT = Math.max(endT, await scene(Math.max(clock, c.t), `phone: ${c.from} → ${c.to}`, true, [c.from, c.to], c.from, c.opening))
  for (const x of intents) { const key = [x.from, resolve(x.to, NAMES) || x.to].sort().join('|'); if (met.has(key)) continue; met.add(key); endT = Math.max(endT, await intent(x, clock)) }
  await resolveWorld(clock)
  clock = Math.max(clock, endT) // conversations take time
}

// ---------- rendering ----------
const render = (L) => L.filter((e) => !['turn', 'move', 'world'].includes(e.kind)).map((e) =>
  e.kind === 'chat' ? `[${fmt(e.t)}] (${e.to}) ${e.from}: ${e.text}` :
  e.kind === 'dm' ? `[${fmt(e.t)}] ${e.from} → ${e.to}: ${e.text}` :
  e.kind === 'pay' ? `[${fmt(e.t)}] ${e.from} paid ${e.to} ${money(e.amount)}${e.note ? ' (' + e.note + ')' : ''}` :
  e.kind === 'money' ? `[${fmt(e.t)}] ${e.who}: ${e.amount >= 0 ? '+' : ''}${money(e.amount)} ${e.what}` :
  e.kind === 'event' ? `[${fmt(e.t)}] * ${e.who}: ${e.text}` :
  e.kind === 'result' ? `[${fmt(e.t)}] ~ ${e.who}: ${e.text}` :
  e.kind === 'missed' ? `[${fmt(e.t)}] ! ${e.who} not at ${e.place} for ${e.what}` :
  e.kind === 'calendar' ? `[${fmt(e.t)}] + ${e.who} put in calendar: ${e.what} at ${fmt(e.at)}` :
  e.kind === 'stopped' ? `[${fmt(e.t)}] (simulation stopped: ${e.reason})` :
  `--- ${e.where}, ${fmt(e.t)}, ${e.minutes ?? 0} min (${e.present.join(', ')}) · ${e.ended} ---\n${sceneText(e.lines) || '(no conversation)'}`).join('\n')
const timelines = (L) => NAMES.map((n) => `## ${n}\n` + L.filter((e) => e.who === n && (e.kind === 'turn' || e.kind === 'move')).map((e) => e.kind === 'move' ? `${fmt(e.t)}   -> ${e.to} (${e.doing})` :
  e.failed ? `${fmt(e.t)} TURN FAILED (${e.why.join('; ')})` : `${fmt(e.t)} [${e.why.join('; ')}] @${e.place}: ${e.doing}${e.kept ? ' (kept plan)' : ''}${e.talk_to ? ' | talk to ' + e.talk_to : ''}${e.call ? ' | ring ' + e.call : ''}${e.do.length ? ' | do: ' + e.do.join('; ') : ''}\n   memory: ${e.memory.replace(/\s+/g, ' ')}\n   plan: ${e.plan.join(' / ') || '-'}`).join('\n')).join('\n\n')
const worldLog = (L) => L.filter((e) => e.kind === 'world').map((e) => `[${fmt(e.t)}] ${e.decision}${e.blocked ? ' BLOCKED (' + e.blocked + ')' : ''}${e.decision !== 'none' && e.decision !== 'unresolved' ? ` (at ${fmt(e.at)})` : ''} ${e.from ? e.from + ' → ' : ''}${e.who}: ${e.text || ''}\n   item: ${e.item}\n   reason: ${e.reason}`).join('\n')
const transcript = render(L), memories = timelines(L)
const final = Object.fromEntries(NAMES.map((n) => [n, { money: Math.round(S[n].money * 100) / 100, place: S[n].place, doing: S[n].doing, memory: S[n].memory, turns: S[n].turns, unseen: S[n].inbox }]))
const stats = { calls: CALLS.length, simCalls, maxCalls: MAX_CALLS, byFor: CALLS.reduce((m, c) => (m[c.for] = (m[c.for] || 0) + 1, m), {}), sceneLines: CALLS.filter((c) => c.why === 'scene line').length, promptChars: CALLS.reduce((k, c) => k + c.prompt.length, 0), failed: CALLS.filter((c) => c.result == null).length, roleAgent: ROLE_AT, stoppedAt: stopped == null ? null : fmt(stopped) }
log(`${A.label}: ${stats.simCalls} sim calls (${stats.sceneLines} scene lines), ${L.filter((e) => e.kind === 'scene').length} scenes, ${L.filter((e) => e.kind === 'call').length} calls, ${L.filter((e) => e.kind === 'chat' || e.kind === 'dm').length} messages${stopped != null ? ', stopped early' : ''}`)

// ---------- 3. audit (optional; it never feeds back into the run) ----------
let audit = null
if (A.audit !== false) {
  phase('Audit')
  const cap = (s, k) => s.length <= k ? s : s.slice(0, k / 2) + `\n[... ${s.length - k} chars omitted ...]\n` + s.slice(-k / 2)
  audit = await call('role', `${roleOf('auditor')}Audit this social simulation for realism with a novelist's eye, as a sceptical reader from this setting.
SETTING: ${SETTING}. WINDOW: ${fmt(0)} to ${fmt(END)}${stopped != null ? ` (stopped early at ${fmt(stopped)})` : ''}.
PEOPLE (attributes from census sampling; temperament drawn at random; prose by a model):\n${PEOPLE.map((p) => `${p.name} | ${JSON.stringify(p.attributes)} | ${p.temperament}\n  ${p.profile}\n  speech: ${p.speech} | texting: ${p.texting}`).join('\n')}
WORLD: ${W.background}\nCalendar: ${(W.calendar || []).map((c) => `${c.what} (${(c.who || []).join(', ')}; ${(c.days || []).join('/')} ${c.start}-${c.end})`).join(' | ')}\nEvents that fired: ${EVENTS.map((e) => `${fmt(e.t)} ${e.who.join('+')}: ${e.text}`).join(' | ') || 'none'}
HOW IT WORKS: each person plans their own next hours and chooses how often they glance at their phone; they get a turn when their plan runs out, when they glance and something is new, between activities, on waking, or on walking into a room with someone in it. They decide whether to talk; conversations end when they stop. Each rewrites their own memory every turn. A world role resolves actions, replies from background characters and seeded events, logging a reason for each.
TRANSCRIPT:\n${cap(transcript, 90000) || '(nothing)'}
TIMELINES (turns, why, memory, plan):\n${cap(memories, 40000)}
WORLD DECISIONS:\n${cap(worldLog(L), 15000) || '(none)'}
First imagine what a real stretch like this would contain for these people; then compare. Check for stereotyping, including in how others treat them. Point to mechanism causes, not just symptoms.`,
    obj({ imagined: arr(str), missing_texture: arr(str), stereotyping: arr(obj({ who: str, quote: str, why: str })), breakers: arr(obj({ quote: str, why: str })), mechanism_issues: arr(str), score: { type: 'integer', description: '1-10 realism' }, verdict: str }),
    { phase: 'Audit', label: `${A.label} audit`, for: 'auditor', model: 'opus', effort: 'high' })
  log(`${A.label}: audit score ${audit?.score ?? '?'} · ${String(audit?.verdict || '').slice(0, 140)}`)
}
return { version: 3, label: A.label, seed: A.seed, args: { ...A, attributes: undefined, sample: undefined }, window: { from: fmt(0), to: fmt(END), hours: HOURS }, world, events: EVENTS.map((e) => `${fmt(e.t)} ${e.who.join('+')}${e.from ? ' (from ' + e.from + ')' : ''}: ${e.text}`),
  log: L, transcript, memories, worldLog: worldLog(L), calendar: CAL.map((o) => ({ ...o, at: fmt(o.t0), until: fmt(o.t1) })), final, stats, audit, calls: CALLS, heads: HEADS }

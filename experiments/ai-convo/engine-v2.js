export const meta = {
  name: 'social-sim-v2',
  description: 'Setting-agnostic social simulation: census-sampled people, generated world mechanics (places, calendar, background characters, base-rate events, money), persona agents, creative Opus audit, rule revision',
  phases: [{ title: 'Generate' }, { title: 'Simulate' }, { title: 'Audit', model: 'opus' }],
}
// args: { label, setting, dateNote, startDow (0=Mon), startHour, hours, seed, maxIters, maxCalls?, attributes?: [{...}], n? }
const A = args || {}
const HOURS = A.hours || 72, START_H = A.startHour ?? 7, START_DOW = A.startDow ?? 0, END = HOURS * 60
const MAX_CALLS = A.maxCalls || (A.maxDecisions ? A.maxDecisions * 2 : 260) // persona calls per simulate run (decisions + scene turns + world)
const COOLDOWN = 180 // minutes before the same pair meets incidentally in the same place again
const OUT = 'out (elsewhere)'

// ---------- helpers ----------
let seed = (A.seed >>> 0) || 1
const rnd = () => { seed = (seed + 0x6D2B79F5) >>> 0; let t = seed; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296 }
const pick = (a) => a[Math.floor(rnd() * a.length)]
const shuffle = (a) => { a = [...a]; for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(rnd() * (i + 1)); [a[i], a[j]] = [a[j], a[i]] } return a }
const clamp = (x, lo, hi) => Math.min(hi, Math.max(lo, Number(x) || lo))
const DOW = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']
const dayOf = (m) => Math.floor((START_H * 60 + m) / 1440)
const NDAYS = dayOf(END - 1) + 1
const hm = (s) => { const [h, mm] = String(s || '0:0').split(':').map(Number); return (h || 0) * 60 + (mm || 0) }
const atDay = (d, s) => d * 1440 + hm(s) - START_H * 60 // sim minute of clock time s on day index d
const fmt = (m) => { const h = START_H * 60 + m, r = ((h % 1440) + 1440) % 1440; return `${DOW[(START_DOW + Math.floor(h / 1440)) % 7]} ${String(Math.floor(r / 60)).padStart(2, '0')}:${String(r % 60).padStart(2, '0')}` }
const noEmoji = (s) => String(s || '').replace(/[\p{Extended_Pictographic}\u{FE0F}\u{200D}\u{1F3FB}-\u{1F3FF}]/gu, '').replace(/\s{2,}/g, ' ').trim()
const words = (s) => new Set(String(s).toLowerCase().match(/[a-z]{4,}/g) || [])
const similar = (a, b) => { const x = words(a), y = words(b); if (!x.size || !y.size) return false; let k = 0; for (const w of x) if (y.has(w)) k++; return k / Math.min(x.size, y.size) >= 0.6 }
const list = (xs, f = (x) => x) => xs.length ? xs.map((x) => '- ' + f(x)).join('\n') : '(none)'
const P = { agentType: 'persona' }
const str = { type: 'string' }, arr = (items, extra = {}) => ({ type: 'array', items, ...extra })

// ---------- 1. generate (once): personas from fixed attributes, then the world's mechanics ----------
phase('Generate')
const ATTR = Array.isArray(A.attributes) && A.attributes.length ? A.attributes : null
const N = ATTR ? ATTR.length : A.n
if (!ATTR) log('WARNING: no args.attributes given; the model will sample attributes itself, which tends towards stereotype. Pass census-sampled attributes.')
const PEOPLE_SCHEMA = { type: 'object', required: ['people'], properties: { people: arr({ type: 'object', required: ['name', 'facts', 'persona', 'speech', 'texting', 'dependants'], properties: {
  name: str,
  facts: { type: 'string', description: 'one line restating the attributes this persona is built on' },
  persona: { type: 'string', description: '4-6 sentences: the person as they are now: temperament, a couple of ordinary interests, current small concerns, relationships. Consistent with the attributes; nothing stereotype-derived.' },
  speech: { type: 'string', description: 'how they talk out loud: register, pace, verbal habits; regional speech only if where they grew up implies it. Spoken words only, never emoji or text-speak.' },
  texting: { type: 'string', description: 'how they type messages: length, case, punctuation, emoji or none, voice notes, reply speed' },
  dependants: arr({ type: 'object', required: ['name', 'relation'], properties: { name: str, relation: str } }, { description: 'named people/pets in their life outside this group (partner, children, parents, pets). Names unique across everyone.' }),
} }, { minItems: N, maxItems: N }) } }
const gp = await agent(`Write personas for a social simulation. Setting: ${A.setting}. Start: ${fmt(0)} (${A.dateNote || ''}).
${ATTR ? `Each person's attributes were sampled from UK census distributions. They are FIXED FACTS. One persona per entry, same order:\n${ATTR.map((a, i) => `${i + 1}. ${JSON.stringify(a)}`).join('\n')}` : `Make ${N} people. Sample age, sex, ethnicity, birthplace, occupation, income, household type and health from real UK distributions for this setting, independently of each other: the commonest outcomes are the most likely ones (most people in most UK places are White British; occupations follow the local mix, not group stereotypes).`}
Rules:
- Add only what a playable person needs. Never choose a job, side job, food, religiosity, family structure, accent trope, work ethic or temperament because of someone's ethnicity, birthplace, religion, sex or age. Draw temperament and interests the way you would for anyone.
- Missing attributes (e.g. name) follow base rates for that person's birth year and birthplace. No two people share a first name; dependants' and pets' names are unique across everyone.
- Ordinary lives: no planted secrets, crises or plot hooks.`, { ...P, phase: 'Generate', label: 'generate personas', schema: PEOPLE_SCHEMA })
const NAMES = gp.people.map((p) => p.name)
gp.people.forEach((p, i) => { p.attributes = ATTR ? ATTR[i] : p.facts })

const WORLD_SCHEMA = { type: 'object', required: ['background', 'common_knowledge', 'places', 'starts', 'chats', 'calendar', 'npcs', 'events', 'money'], properties: {
  background: { type: 'string', description: '3-5 sentences of shared, ordinary context' },
  common_knowledge: arr(str, { maxItems: 10, description: 'facts everyone here knows: how long people have known each other and how well, norms, who pays what, household arrangements, opening hours, rotas' }),
  places: arr({ type: 'object', required: ['name', 'kind', 'building', 'access', 'encounter', 'npcs', 'npc_chance'], properties: {
    name: str, kind: { type: 'string', enum: ['private', 'shared', 'public'], description: 'private = a home or own room; shared = a room shared by a household/staff; public = street, shop, park, venue' },
    building: { type: 'string', description: 'places with the same building label are within earshot of each other (rooms of one house); empty for outdoor/public' },
    access: arr(str, { description: 'names who may normally be there; empty = anyone' }),
    encounter: { type: 'number', description: '0-1 chance that two people there at the same time actually interact (small kitchen ~0.8, busy street ~0.15)' },
    npcs: arr(str, { description: 'background characters who may be met here' }), npc_chance: { type: 'number', description: '0-1 chance per visit of meeting one of them' },
  } }, { description: 'every home or private room is its own place, separate from shared and public spaces' }),
  starts: arr({ type: 'object', required: ['name', 'home', 'start_place', 'start_doing', 'balance', 'first_check_minutes'], properties: {
    name: str, home: { type: 'string', description: 'their own private place' }, start_place: str, start_doing: str,
    balance: { type: 'number', description: 'current account balance in £, realistic for their income and the point in the month' }, first_check_minutes: { type: 'integer' } } }),
  chats: arr({ type: 'object', required: ['name', 'members'], properties: { name: str, members: arr(str) } }, { description: 'group chats that would realistically exist' }),
  calendar: arr({ type: 'object', required: ['what', 'who', 'days', 'start', 'end', 'place', 'kind'], properties: {
    what: str, who: arr(str), responsible: { type: 'string', description: 'who has to make it happen (e.g. collect, open up), or empty' },
    days: arr({ type: 'string', enum: DOW }), start: { type: 'string', description: 'HH:MM' }, end: { type: 'string', description: 'HH:MM' },
    place: { type: 'string', description: `a place name, or "${OUT}"` },
    kind: { type: 'string', enum: ['work', 'commitment', 'household'], description: 'work = shifts, school, college: the person is there for the duration' },
  } }, { description: 'everyone\'s recurring routines and commitments this week, including ones in their personas (work shifts, school runs, classes, regular calls, collections, bin night)' }),
  npcs: arr({ type: 'object', required: ['name', 'role', 'linked_to', 'persona', 'answers'], properties: {
    name: str, role: str, linked_to: arr(str, { description: 'who has their number; empty = a public business anyone can contact' }),
    persona: { type: 'string', description: '1-2 sentences incl. how they talk and text' }, answers: { type: 'number', description: '0-1 chance they pick up a call' } } },
  { description: 'background characters: family elsewhere, friends, landlord/agent, employer, school or GP staff, regular customers, tradespeople, local businesses' }),
  events: arr({ type: 'object', required: ['text', 'who', 'scope', 'p_per_day', 'when'], properties: {
    text: { type: 'string', description: 'concrete, second person: who, what, how much' }, who: arr(str), scope: { type: 'string', enum: ['household', 'each'], description: 'household = one roll that affects all listed; each = rolled per person' },
    p_per_day: { type: 'number', description: 'real-world base rate per day (most well under 0.1)' },
    when: { type: 'string', enum: ['work_start', 'work_end', 'at_home', 'any'], description: 'work_* only fires on days the person has a work item' },
    hours: arr({ type: 'integer' }, { description: '[from, to] clock hours for at_home/any' }), delay_minutes: { type: 'integer', description: 'for work_* events: how much later the start/end becomes' },
    money: { type: 'number', description: 'signed £ effect on each person affected, if any' }, from_npc: { type: 'string', description: 'if it is a message from a background character' },
  } }, { description: 'base-rate external and personal events: deliveries, letters, faults, notices, illness, delays, relatives getting in touch. Personal ones must fit the person (how they commute, their job, health).' }),
  money: arr({ type: 'object', required: ['who', 'amount', 'what', 'day', 'time'], properties: {
    who: str, amount: { type: 'number', description: 'signed £: + pay/benefits in, - rent/bills/subscriptions out' }, what: str,
    day: { type: 'integer', description: `day index 0..${NDAYS - 1} of this window` }, time: str } }, { description: 'pay, benefits, rent, bills and direct debits that fall inside this window' }),
} }
const W = await agent(`Build the world mechanics for a social simulation. Do not write a plot; supply ordinary structure that real life would have.
SETTING: ${A.setting}
WINDOW: ${fmt(0)} for ${HOURS} hours (${NDAYS} day indices, day 0 = ${DOW[START_DOW]}). ${A.dateNote || ''}
PEOPLE:\n${gp.people.map((p) => `${p.name} (${p.facts}): ${p.persona} Dependants: ${p.dependants.map((d) => `${d.name} (${d.relation})`).join(', ') || 'none'}`).join('\n')}
Fill in, for THIS setting: places (homes/own rooms separate from shared and public spaces), each person's start, group chats, a shared calendar of routines, background characters, base-rate events with honest probabilities, and money flows in the window. Use only the names above for people.`, { ...P, phase: 'Generate', label: 'generate world', schema: WORLD_SCHEMA })

// ---------- normalise the generated world ----------
const PEOPLE = Object.fromEntries(gp.people.map((p) => [p.name, p]))
const PLACES = [...W.places.filter((p) => p.name && p.name !== OUT), { name: OUT, kind: 'public', building: '', access: [], encounter: 0, npcs: [], npc_chance: 0 }]
const PLACE = Object.fromEntries(PLACES.map((p) => [p.name, { ...p, access: (p.access || []).filter((n) => NAMES.includes(n)), npcs: p.npcs || [] }]))
const NPCS = Object.fromEntries((W.npcs || []).filter((x) => x.name && !NAMES.includes(x.name)).map((x) => [x.name, x]))
const START = Object.fromEntries(NAMES.map((n) => [n, W.starts.find((s) => s.name === n) || {}]))
for (const n of NAMES) { const s = START[n]; if (!PLACE[s.home]) s.home = PLACES.find((p) => p.kind === 'private' && p.access.includes(n))?.name || OUT; if (!PLACE[s.start_place]) s.start_place = s.home; s.balance = Number(s.balance) || 500 }
const CHATS = (W.chats || []).map((c) => ({ name: c.name, members: c.members.filter((m) => NAMES.includes(m)) })).filter((c) => c.members.length > 1)
const CHAT = Object.fromEntries(CHATS.map((c) => [c.name, c]))
const OCC = [] // calendar occurrences {what, who, responsible, kind, place, t0, t1}
for (const c of W.calendar || []) for (let d = 0; d < NDAYS; d++) {
  if (!(c.days || []).includes(DOW[(START_DOW + d) % 7])) continue
  const t0 = atDay(d, c.start); let t1 = atDay(d, c.end); if (t1 <= t0) t1 += 1440
  if (t1 > 0 && t0 < END) OCC.push({ what: c.what, who: (c.who || []).filter((n) => NAMES.includes(n)), responsible: NAMES.includes(c.responsible) ? c.responsible : '', kind: c.kind, place: PLACE[c.place] ? c.place : OUT, t0, t1 })
}
const workOn = (n, d) => OCC.filter((o) => o.kind === 'work' && o.who.includes(n) && dayOf(o.t0) === d)
const EVENTS = [] // rolled once, filtered by schedule
for (let d = 0; d < NDAYS; d++) for (const e of W.events || []) {
  const who = (e.who || []).filter((n) => NAMES.includes(n)); if (!who.length) continue
  for (const g of e.scope === 'household' ? [who] : who.map((n) => [n])) {
    if (rnd() >= clamp(e.p_per_day, 0, 1)) continue
    let t
    if (e.when === 'work_start' || e.when === 'work_end') {
      const w = workOn(g[0], d)[0]; if (!w) continue
      if (e.when === 'work_start') { t = w.t0 - 20; w.t0 += e.delay_minutes || 0 } else { t = w.t1 - 10; w.t1 += e.delay_minutes || 0 }
    } else {
      const [h0, h1] = e.hours?.length === 2 ? e.hours : [8, 21]
      for (let k = 0; k < 4 && t === undefined; k++) { const c = atDay(d, '0:0') + Math.floor((h0 + rnd() * (h1 - h0)) * 60); if (e.when === 'at_home' && g.some((n) => workOn(n, d).some((w) => c >= w.t0 - 30 && c < w.t1 + 30))) continue; t = c }
      if (t === undefined) continue
    }
    if (t >= 0 && t < END) EVENTS.push({ t, who: g, text: e.text, money: Number(e.money) || 0, from: NPCS[e.from_npc] ? e.from_npc : '' })
  }
}
const MONEY = (W.money || []).filter((m) => NAMES.includes(m.who)).map((m) => ({ ...m, t: atDay(clamp(m.day, 0, NDAYS - 1), m.time || '09:00') })).filter((m) => m.t >= 0 && m.t < END)
const world = { setting: A.setting, background: W.background, common_knowledge: W.common_knowledge, people: gp.people.map((p) => ({ ...p, ...START[p.name] })), places: PLACES, chats: CHATS, calendar: W.calendar, npcs: Object.values(NPCS), event_types: W.events, money: MONEY }
log(`${A.label}: ${NAMES.join(', ')} · ${PLACES.length} places · ${OCC.length} calendar slots · ${EVENTS.length} events · ${Object.keys(NPCS).length} background characters`)

// ---------- schemas ----------
const PLACE_NAMES = PLACES.map((p) => p.name)
const DECIDE = { type: 'object', required: ['place', 'doing', 'stay_minutes', 'sleeping', 'changed', 'plans', 'next_check_minutes'], properties: {
  place: { type: 'string', enum: PLACE_NAMES }, doing: { type: 'string', description: 'what you are doing, a few words' },
  stay_minutes: { type: 'integer', minimum: 5, maximum: 720 }, sleeping: { type: 'boolean' },
  talk_to: { type: 'string', description: 'someone here (or where you are going) you deliberately go and speak to; else empty' },
  call: { type: 'string', description: 'ring someone now (a person or a contact); else empty' },
  call_in: { type: 'string', description: 'shout for someone elsewhere in the same building to come to you; else empty' },
  messages: arr({ type: 'object', required: ['to', 'text'], properties: { to: { type: 'string', description: 'group chat name, person or contact' }, text: str } }, { maxItems: 3 }),
  pay: arr({ type: 'object', required: ['to', 'amount'], properties: { to: { type: 'string', description: 'a person here, or anyone outside (family, landlord, a shop)' }, amount: { type: 'number' }, note: str } }),
  actions: arr({ type: 'object', required: ['what'], properties: { what: { type: 'string', description: 'a simple thing you do yourself that has an outcome: book, buy, order, ring a business, check a score/balance/app, look something up' }, max_spend: { type: 'number' } } }, { maxItems: 2 }),
  arrange: arr({ type: 'object', required: ['what', 'day', 'time'], properties: { what: str, day: { type: 'string', enum: DOW }, time: { type: 'string', description: 'HH:MM' }, with: arr(str) } }, { maxItems: 2, description: 'put something agreed or booked into your calendar' }),
  changed: { type: 'string', description: 'one line: what changed or got done since you last checked, or "nothing"' },
  plans: arr(str, { maxItems: 4, description: 'your current intentions, short. Drop what is done or no longer matters.' }),
  next_check_minutes: { type: 'integer', minimum: 10, maximum: 720 },
} }
const SAY = { type: 'object', required: ['speech', 'action', 'leave', 'new'], properties: {
  speech: { type: 'string', description: 'words said out loud, or empty to say nothing. Spoken words only.' },
  action: { type: 'string', description: 'brief physical action, or empty' }, leave: { type: 'boolean', description: 'you walk off / hang up' },
  new: { type: 'boolean', description: 'true only if this adds something not already said' },
  send: arr({ type: 'object', required: ['to', 'text'], properties: { to: str, text: str } }, { maxItems: 1, description: 'a text you send from your phone right now' }),
  call_in: { type: 'string', description: 'shout for someone elsewhere in the building; else empty' },
} }
const NPC_SAY = { type: 'object', required: ['speech', 'action', 'leave'], properties: { speech: str, action: str, leave: { type: 'boolean' } } }
const RESOLVE = { type: 'object', required: ['outcomes', 'replies'], properties: {
  outcomes: arr({ type: 'object', required: ['who', 'text', 'cost'], properties: { who: str, text: { type: 'string', description: 'what actually happened, second person' }, cost: { type: 'number' }, followup_minutes: { type: 'integer' }, followup_text: { type: 'string', description: 'what happens then (delivery arrives, tradesperson turns up, appointment)' } } }),
  replies: arr({ type: 'object', required: ['from', 'to', 'text', 'delay_minutes'], properties: { from: str, to: str, text: str, delay_minutes: { type: 'integer' } } }),
} }
const AUDIT = { type: 'object', required: ['imagined_week', 'missing_texture', 'stereotyping', 'score', 'verdict', 'breakers', 'mechanism_issues', 'proposed_mechanisms', 'extra_rules'], properties: {
  imagined_week: arr(str, { description: 'first, before judging: what a real stretch like this, in this setting with these people, would contain (contacts, errands, frictions, outside interruptions, quiet time, money moments), with rough frequencies' }),
  missing_texture: arr(str, { description: 'what the imagined week has that the run lacks, or the run has that reality would not' }),
  stereotyping: arr({ type: 'object', required: ['who', 'quote', 'why'], properties: { who: str, quote: str, why: str } }, { description: 'persona prose or behaviour that adds a role, trait, food, speech pattern or storyline a stereotype would suggest, beyond the given attributes' }),
  score: { type: 'integer', minimum: 1, maximum: 10, description: 'realism as judged by a skeptical British reader' }, verdict: str,
  breakers: arr({ type: 'object', required: ['quote', 'why'], properties: { quote: str, why: str } }),
  mechanism_issues: arr(str, { description: 'problems caused by how the simulation works (visibility, scheduling, places, money, memory, scene rules, missing affordances)' }),
  proposed_mechanisms: arr(str, { description: 'general, setting-agnostic mechanisms that would let the missing texture emerge without scripting it' }),
  extra_rules: arr(str, { maxItems: 3, description: 'COMPLETE replacement list of extra behavioural rules (max 3, short, general, no plot, no names). Empty preferred.' }),
} }

const BASE_RULES = [
  'You are one real person, not an assistant. You know only what you have seen, been told, or is common knowledge here.',
  'Talk the way your person talks and text the way they text. Speech is spoken words only.',
  'Do things for your own reasons. Nobody tells you what should happen.',
  'Money is real: you can only spend what is in your account.',
  'No therapy-speak, speeches or tidy resolutions. Doing or saying nothing is normal.',
]

// ---------- 2. one simulation run ----------
async function simulate(rules, it) {
  const RULES = rules.map((r) => '- ' + r).join('\n')
  const L = [] // log: chat, dm, pay, call, event, outcome, scene, state
  const cal = OCC.map((o) => ({ ...o }))
  const Q = [] // timed triggers
  const at = (t, run) => { Q.push({ t, run }); Q.sort((a, b) => a.t - b.t) }
  const S = Object.fromEntries(NAMES.map((n) => [n, { place: START[n].start_place, doing: START[n].start_doing || '', until: 0, asleep: false, busy: null, arrived: true,
    next: clamp(START[n].first_check_minutes, 0, 600), money: START[n].balance, seenT: -1, news: [], notes: [], plans: [], scenes: [], buzzed: new Set() }]))
  const cool = {}, pendingNpc = []
  let calls = 0, decisions = 0, clock = 0, stoppedAt = null
  const ask = (prompt, opts) => { calls++; return agent(prompt, { ...P, phase: 'Simulate', ...opts }) }
  const pace = () => clamp((calls / MAX_CALLS + 0.1) / (clock / END + 0.1), 1, 4) // >1 when spending faster than time passes
  const skim = () => calls >= MAX_CALLS
  const notify = (n, t, text) => S[n].news.push(`${fmt(t)} ${text}`)
  const wakeAt = (n, t) => { const s = S[n]; if (s.asleep && t < s.until) return; if (skim() && t > s.next - 60) return; s.next = Math.min(s.next, t) }
  const reply = (n) => S[n].busy ? 30 + rnd() * 60 : 5 + rnd() * 25
  const building = (n) => PLACE[S[n].place]?.building || ''
  const earshot = (n) => NAMES.filter((m) => m !== n && building(m) && building(m) === building(n) && S[m].place !== S[n].place)
  const contacts = (n) => Object.values(NPCS).filter((x) => !x.linked_to?.length || x.linked_to.includes(n))
  const charge = (n, amt) => { if (amt > S[n].money) return false; S[n].money -= amt; return true }

  function send(from, to, text, t) {
    text = String(text || '').trim(); if (!text) return
    if (CHAT[to]?.members.includes(from)) {
      L.push({ t, kind: 'chat', to, from, text })
      for (const m of CHAT[to].members) if (m !== from && rnd() < 0.35 / pace()) wakeAt(m, t + 20 + rnd() * 100)
    } else if (NAMES.includes(to) && to !== from) { L.push({ t, kind: 'dm', to, from, text }); wakeAt(to, t + reply(to)) }
    else if (NPCS[to]) { L.push({ t, kind: 'dm', to, from, text }); pendingNpc.push({ from, to, text }) }
    else notify(from, t, `Your message to "${to}" didn't go anywhere (no such contact or group).`)
  }
  function addCal(o) {
    cal.push(o)
    for (const n of o.who) if (o.t0 - 30 > clock) at(o.t0 - 30, (t) => { notify(n, t, `Coming up: ${o.what} at ${fmt(o.t0)}${o.place !== OUT ? ' (' + o.place + ')' : ''}.`); wakeAt(n, t) })
  }

  // scheduled world: routines, events, money
  for (const o of cal) {
    if (o.kind === 'work') {
      at(Math.max(0, o.t0), () => { for (const n of o.who) { const s = S[n]; s.busy = o; s.asleep = false; s.arrived = s.place !== o.place; s.place = o.place; s.doing = o.what; s.until = o.t1; s.next = Math.max(s.next, o.t0 + 60 + rnd() * 60) } })
      at(o.t1, (t) => { for (const n of o.who) if (S[n].busy === o) { S[n].busy = null; S[n].next = Math.min(S[n].next, t) } })
    } else if (o.responsible && o.t0 - 30 >= 0) at(o.t0 - 30, (t) => { notify(o.responsible, t, `You're responsible: ${o.what} at ${fmt(o.t0)}.`); wakeAt(o.responsible, t) })
  }
  for (const e of EVENTS) at(e.t, (t) => { for (const n of e.who) {
    if (e.from) L.push({ t, kind: 'dm', from: e.from, to: n, text: e.text }); else { notify(n, t, e.text); L.push({ t, kind: 'event', who: n, text: e.text }) }
    if (e.money) S[n].money += e.money
    wakeAt(n, t + reply(n))
  } })
  for (const m of MONEY) at(m.t, (t) => { S[m.who].money += m.amount; notify(m.who, t, `${m.amount >= 0 ? 'In' : 'Out'}: £${Math.abs(m.amount).toFixed(2)} ${m.what}. Balance £${S[m.who].money.toFixed(2)}${S[m.who].money < 0 ? ' (overdrawn)' : ''}.`); L.push({ t, kind: 'money', who: m.who, amount: m.amount, what: m.what }) })

  // ----- prompt pieces -----
  const calView = (n, now) => cal.filter((o) => o.who.includes(n) && o.t1 > now && o.t0 < now + 1440).sort((a, b) => a.t0 - b.t0)
    .map((o) => `${fmt(o.t0)}-${fmt(o.t1).slice(4)} ${o.what}${o.place !== OUT ? ' @' + o.place : ''}${o.responsible === n ? ' (YOU are responsible)' : o.responsible ? ` (${o.responsible} is responsible)` : ''}${o.who.length > 1 ? ' with ' + o.who.filter((x) => x !== n).join(', ') : ''}`)
  const msgView = (n, now, k = 14) => L.filter((e) => (e.kind === 'chat' && CHAT[e.to].members.includes(n)) || (e.kind === 'dm' && (e.to === n || e.from === n))).slice(-k)
    .map((e) => `${e.t > S[n].seenT && e.from !== n ? 'NEW ' : ''}[${fmt(e.t)}] ${e.kind === 'chat' ? e.to : 'DM ' + e.from + '→' + e.to} · ${e.from}: ${e.text}`).join('\n')
  const planView = (n, now) => S[n].plans.map((p) => p.text + (now - p.since > 1440 ? ` (on your list since ${fmt(p.since)}: do it, drop it, or let it go)` : ''))
  const sceneView = (sc) => `${sc.where} ${fmt(sc.t)} (${sc.present.join(', ')}): ` + (sc.lines.slice(-6).map((l) => l.speech ? `${l.name}: "${l.speech}"` : `${l.name} (${l.action})`).join(' / ') || 'nothing said')
  const who = (n) => `YOU: ${PEOPLE[n].name}. ${PEOPLE[n].persona}\nPeople in your life: ${PEOPLE[n].dependants.map((d) => `${d.name} (${d.relation})`).join(', ') || 'none named'}\nHOW YOU SPEAK: ${PEOPLE[n].speech}\nHOW YOU TEXT: ${PEOPLE[n].texting}`
  const shared = `SHARED BACKGROUND: ${W.background}\nCOMMON KNOWLEDGE:\n${list(W.common_knowledge || [])}`
  const whereView = (n) => { const s = S[n], here = NAMES.filter((m) => m !== n && S[m].place === s.place && s.place !== OUT)
    return `WHERE YOU ARE (fact): ${s.place}${s.doing ? ', ' + s.doing : ''}${s.asleep ? ' (you have been asleep)' : ''}.${s.busy ? ` At ${s.busy.what} until ${fmt(s.busy.t1)}.` : ''}
HERE WITH YOU: ${here.map((m) => `${m} (${S[m].asleep ? 'asleep' : S[m].doing})`).join(', ') || 'nobody'}${earshot(n).length ? `\nELSEWHERE IN THE BUILDING: ${earshot(n).map((m) => `${m} @${S[m].place}`).join(', ')}` : ''}` }

  const decidePrompt = (n, now) => { const s = S[n]; return `RULES:\n${RULES}\n\n${who(n)}\n\n${shared}\n\nIT IS NOW ${fmt(now)}.
${whereView(n)}
YOUR CALENDAR (next 24h):\n${list(calView(n, now))}
YOUR OWN PLAN (as you left it):\n${list(planView(n, now))}
RECENTLY YOU:\n${list(s.notes)}
NEW SINCE YOU LAST CHECKED:\n${list(s.news)}
MESSAGES (groups: ${CHATS.filter((c) => c.members.includes(n)).map((c) => c.name).join(', ') || 'none'}):\n${msgView(n, now) || '(none)'}
BALANCE: £${s.money.toFixed(2)}
RECENT IN-PERSON:\n${list(s.scenes.slice(-2), sceneView)}
YOUR PHONE is on you: you can text, ring, pay or check things, as you normally would. Contacts beyond this group: ${contacts(n).map((x) => `${x.name} (${x.role})`).join(', ') || 'none'}.
What do you do now? Most check-ins change little.` }

  // ----- decisions -----
  function applyDecision(n, r, now, acts, intents) {
    const s = S[n]; decisions++; s.seenT = now; s.news = []
    if (!r) { s.next = now + 60; return }
    let place = PLACE[r.place] ? r.place : s.place
    if (PLACE[place].access.length && !PLACE[place].access.includes(n)) { notify(n, now, `You can't just go into ${place}.`); place = s.place }
    if (s.busy && place !== s.busy.place) s.busy = null
    s.arrived = place !== s.place; s.place = place; s.doing = noEmoji(r.doing); s.asleep = !!r.sleeping; s.until = now + clamp(r.stay_minutes, 5, 720)
    if (r.changed && !/^nothing/i.test(r.changed.trim())) s.notes = [...s.notes, `${fmt(now)} ${r.changed}`].slice(-8)
    const old = s.plans; s.plans = []
    for (const text of (r.plans || []).slice(0, 4)) { if (!text.trim()) continue; const prev = old.find((p) => similar(p.text, text)); s.plans.push({ text, since: prev ? prev.since : now }) }
    for (const p of s.plans.filter((p) => now - p.since > 2880)) s.notes.push(`${fmt(now)} never got round to: ${p.text}`) // stale intentions fade
    s.plans = s.plans.filter((p) => now - p.since <= 2880)
    L.push({ t: now, kind: 'state', who: n, place, doing: s.doing, changed: r.changed, plans: s.plans.map((p) => p.text), asleep: s.asleep })
    for (const m of r.messages || []) send(n, m.to, m.text, now)
    for (const p of r.pay || []) {
      const amt = Math.round(Number(p.amount) * 100) / 100; if (!(amt > 0) || p.to === n) continue
      if (!charge(n, amt)) { notify(n, now, `Payment of £${amt} to ${p.to} failed: not enough in your account.`); continue }
      if (NAMES.includes(p.to)) { S[p.to].money += amt; notify(p.to, now, `£${amt} received from ${n}${p.note ? ' (' + p.note + ')' : ''}.`) }
      L.push({ t: now, kind: 'pay', from: n, to: p.to, amount: amt, note: p.note || '' })
    }
    for (const a of r.actions || []) if (a.what?.trim()) acts.push({ who: n, what: a.what, max: a.max_spend || 0 })
    for (const a of r.arrange || []) {
      let d = dayOf(now); while (DOW[(START_DOW + d) % 7] !== a.day) d++
      let t0 = atDay(d, a.time); if (t0 < now) t0 += 7 * 1440
      if (t0 < END) addCal({ what: a.what, who: [n, ...(a.with || []).filter((x) => NAMES.includes(x) && x !== n)], responsible: n, kind: 'commitment', place: OUT, t0, t1: t0 + 60 })
    }
    if (NAMES.includes(r.talk_to)) intents.talk.push([n, r.talk_to])
    if (r.call && (NAMES.includes(r.call) || NPCS[r.call])) intents.call.push([n, r.call])
    if (NAMES.includes(r.call_in)) intents.callIn.push([n, r.call_in])
    const gap = s.asleep ? s.until - now : clamp(r.next_check_minutes, s.busy ? 45 : 10, 720) * pace()
    s.next = now + Math.max(skim() ? 240 : 10, Math.round(gap))
  }

  // ----- the rest of the world: solo actions and background characters' replies, one cheap call per tick -----
  async function resolveWorld(now, acts) {
    const msgs = pendingNpc.splice(0)
    if (!acts.length && !msgs.length) return
    const npcsInvolved = [...new Set(msgs.map((m) => m.to))].map((k) => NPCS[k])
    const r = await ask(`You play the rest of the world around a social simulation: shops, services, apps, websites, background characters. Setting: ${A.setting}. It is ${fmt(now)}.
${npcsInvolved.length ? `BACKGROUND CHARACTERS:\n${npcsInvolved.map((x) => `${x.name} (${x.role}): ${x.persona}`).join('\n')}\n` : ''}${acts.length ? `SOLO ACTIONS to resolve (one outcome each, who = the person):\n${acts.map((a) => `${a.who} (balance £${S[a.who].money.toFixed(0)}${a.max ? ', will spend up to £' + a.max : ''}): ${a.what}`).join('\n')}\n` : ''}${msgs.length ? `MESSAGES TO BACKGROUND CHARACTERS (reply as they would, in their style, after a realistic delay; skip any they would ignore):\n${msgs.map((m) => `${m.from} → ${m.to}: ${m.text}`).join('\n')}\n` : ''}
Be ordinary and realistic: things are sometimes engaged, out of stock, dearer than hoped or booked for later. Give real-looking results for checks. Costs in £ (0 if free). Use followup_minutes for anything booked or delivered later.`, { label: `${A.label} r${it} world ${fmt(now)}`, schema: RESOLVE })
    if (!r) return
    for (const o of r.outcomes || []) {
      if (!NAMES.includes(o.who)) continue
      const cost = Math.max(0, Number(o.cost) || 0), ok = charge(o.who, cost)
      const text = ok ? o.text + (cost ? ` (£${cost.toFixed(2)})` : '') : `Card declined (£${cost.toFixed(2)} needed): couldn't complete it.`
      notify(o.who, now, text); L.push({ t: now, kind: 'outcome', who: o.who, text })
      if (ok && o.followup_minutes > 0 && o.followup_text && now + o.followup_minutes < END) {
        const t1 = now + o.followup_minutes
        addCal({ what: o.followup_text, who: [o.who], responsible: '', kind: 'commitment', place: OUT, t0: t1, t1: t1 + 30 })
        at(t1, (t) => { notify(o.who, t, o.followup_text); L.push({ t, kind: 'event', who: o.who, text: o.followup_text }); wakeAt(o.who, t) })
      }
    }
    for (const m of r.replies || []) if (NPCS[m.from] && NAMES.includes(m.to)) at(now + clamp(m.delay_minutes, 1, 1440), (t) => { L.push({ t, kind: 'dm', from: m.from, to: m.to, text: m.text }); wakeAt(m.to, t + reply(m.to)) })
  }

  // ----- scenes: participants are the truth; no forced round-robin; end when talk dies -----
  const addressed = (n, lines) => lines.some((l) => l.speech && l.speech.toLowerCase().includes(n.split(' ')[0].toLowerCase()))
  function callIn(from, target, t) {
    const ok = earshot(from).includes(target) && !S[target].asleep && !S[target].busy && rnd() < 0.85
    if (!ok) { notify(from, t, `You called for ${target}; no response.`); return false }
    S[target].place = S[from].place; S[target].doing = `came when ${from} called`; S[target].arrived = true; return true
  }
  async function runScene(sc) { // sc: {t, where, phone, present, npc, starter}
    const here = [...sc.present], npcs = sc.npc ? [sc.npc] : [], lines = [], quiet = {}
    let stale = 0, round = 0
    const maxRounds = skim() || pace() > 1.5 ? 3 : 6
    const people = () => [...here, ...npcs]
    while (people().length >= 2 && round < maxRounds && stale < 2) {
      round++; let fresh = false
      const order = round === 1 && sc.starter ? [sc.starter, ...shuffle(people().filter((x) => x !== sc.starter))] : shuffle(people())
      for (const n of order) {
        const isNpc = !NAMES.includes(n)
        if (!(isNpc ? npcs : here).includes(n) || people().length < 2) continue
        if ((quiet[n] || 0) >= 2 && !addressed(n, lines.slice(-3))) continue // gone quiet: carries on with what they're doing
        const others = people().filter((x) => x !== n)
        const soFar = lines.map((l) => l.speech ? `${l.name}: "${l.speech}"${l.action ? ' (' + l.action + ')' : ''}` : `${l.name} (${l.action})`).join('\n') || '(you have just come across each other)'
        let r
        if (isNpc) {
          const x = NPCS[n]
          r = await ask(`You are ${x.name}, ${x.role}. ${x.persona}\nSetting: ${A.setting}. It is ${fmt(sc.t)}. ${sc.phone ? 'On the phone with' : 'At ' + sc.where + ' with'}: ${others.join(', ')}.\nSo far:\n${soFar}\nWhat do you say or do? Be brief and ordinary. Spoken words only. Leave/hang up when you would.`, { label: `${A.label} r${it} ${n} @${sc.where}`, schema: NPC_SAY })
        } else {
          const s = S[n], unread = L.filter((e) => e.kind === 'dm' && e.to === n || e.kind === 'chat' && CHAT[e.to].members.includes(n) && e.from !== n).filter((e) => e.t > s.seenT && !s.buzzed.has(e))
          const noticed = unread.filter(() => rnd() < 0.5); noticed.forEach((e) => s.buzzed.add(e))
          r = await ask(`RULES:\n${RULES}\n\n${who(n)}\n\n${shared}\nYOUR PLAN: ${planView(n, sc.t).join('; ') || '(none)'}\nRECENTLY YOU: ${s.notes.slice(-3).join(' | ') || '(nothing)'}

IT IS ${fmt(sc.t)}. ${sc.phone ? `You are ON THE PHONE with ${others.join(', ')}. You are physically at ${s.place}.` : `You are at ${sc.where}.`}
PRESENT (exactly these people, nobody else): ${sc.phone ? others.join(', ') : others.map((m) => `${m} (${NAMES.includes(m) ? S[m].doing : NPCS[m].role})`).join(', ')}${!sc.phone && earshot(n).length ? `\nELSEWHERE IN THE BUILDING (not here, can be called in): ${earshot(n).join(', ')}` : ''}
${noticed.length ? `YOUR PHONE BUZZES: ${noticed.map((e) => `${e.kind === 'chat' ? e.to + ' · ' : ''}${e.from}: ${e.text}`).join(' / ')}\n` : ''}SO FAR:\n${soFar}
Say something, carry on with what you were doing (empty speech), or leave. Most encounters are brief; you don't have to keep it going or be helpful.`, { label: `${A.label} r${it} ${n} @${sc.where}`, schema: SAY })
        }
        if (!r) { quiet[n] = (quiet[n] || 0) + 1; continue }
        const speech = noEmoji(r.speech), action = noEmoji(r.action)
        if (speech) { lines.push({ name: n, speech, action }); quiet[n] = 0; if (r.new !== false) fresh = true }
        else { quiet[n] = (quiet[n] || 0) + 1; if (action && quiet[n] === 1) lines.push({ name: n, speech: '', action }) }
        if (!isNpc) {
          for (const m of r.send || []) send(n, m.to, m.text, sc.t)
          if (!sc.phone && NAMES.includes(r.call_in) && !here.includes(r.call_in) && callIn(n, r.call_in, sc.t)) { here.push(r.call_in); fresh = true }
        }
        if (r.leave) { if (isNpc) npcs.splice(npcs.indexOf(n), 1); else { here.splice(here.indexOf(n), 1); if (!sc.phone) S[n].next = Math.min(S[n].next, sc.t + 5) } }
      }
      stale = fresh ? 0 : stale + 1
    }
    const all = [...new Set([...sc.present, ...lines.map((l) => l.name)])]
    const rec = { t: sc.t, kind: 'scene', where: sc.where, phone: !!sc.phone, present: all, lines }
    L.push(rec)
    for (const n of all) if (NAMES.includes(n)) S[n].scenes.push(rec)
    for (const a of all) for (const b of all) if (a < b) cool[`${sc.where}|${a}|${b}`] = sc.t
  }
  const cooled = (where, a, b, t) => t - (cool[`${where}|${[a, b].sort().join('|')}`] ?? -1e9) < COOLDOWN

  async function encounters(now, intents) {
    for (const [from, to] of intents.callIn) if (callIn(from, to, now)) intents.talk.push([from, to])
    for (const [from, to] of intents.call) { // phone calls: a 2-person scene if answered
      const p = NAMES.includes(to) ? (S[to].asleep ? 0.05 : S[to].busy ? 0.35 : 0.75) : clamp(NPCS[to].answers ?? 0.7, 0, 1)
      if (rnd() >= p) {
        notify(from, now, `You rang ${to}; no answer.`); L.push({ t: now, kind: 'call', from, to, answered: false })
        if (NAMES.includes(to)) { notify(to, now, `Missed call from ${from}.`); wakeAt(to, now + reply(to)) }
        continue
      }
      await runScene({ t: now, where: `phone: ${from} → ${to}`, phone: true, present: NAMES.includes(to) ? [from, to] : [from], npc: NPCS[to] ? to : '', starter: from })
    }
    for (const pl of PLACES) {
      if (pl.name === OUT) continue
      const here = NAMES.filter((n) => S[n].place === pl.name && !S[n].asleep)
      const wanted = intents.talk.find(([a, b]) => here.includes(a) && here.includes(b))
      const npc = pl.npcs.filter((x) => NPCS[x]).length && here.some((n) => S[n].arrived || S[n].busy) && rnd() < clamp(pl.npc_chance, 0, 1) ? pick(pl.npcs.filter((x) => NPCS[x])) : ''
      let go = !!wanted
      if (!go && here.length >= 2) go = here.some((a) => S[a].arrived && here.some((b) => b !== a && !cooled(pl.name, a, b, now))) && rnd() < clamp(pl.encounter, 0, 1)
      if (!go && npc && here.length >= 1) go = true
      if (!go || (skim() && !wanted)) continue
      await runScene({ t: now, where: pl.name, present: here, npc, starter: wanted ? wanted[0] : pick(here.filter((n) => S[n].arrived).concat(here)) })
    }
    for (const n of NAMES) S[n].arrived = false
  }

  // ----- main loop: jump to the next thing that happens; quiet stretches cost nothing -----
  while (true) {
    const tNext = Math.min(...NAMES.map((n) => S[n].next), Q.length ? Q[0].t : Infinity)
    if (tNext >= END) break
    clock = Math.max(clock, tNext)
    while (Q.length && Q[0].t <= clock) Q.shift().run(Q[0].t)
    if (calls >= MAX_CALLS * 1.3) { stoppedAt = clock; log(`${A.label} r${it}: call budget exhausted at ${fmt(clock)}; rest of window not simulated`); break }
    const due = NAMES.filter((n) => S[n].next <= clock + 10)
    if (!due.length) continue
    const res = await parallel(due.map((n) => () => ask(decidePrompt(n, clock), { label: `${A.label} r${it} ${n} ${fmt(clock)}`, schema: DECIDE })))
    const acts = [], intents = { talk: [], call: [], callIn: [] }
    due.forEach((n, k) => applyDecision(n, res[k], clock, acts, intents))
    await resolveWorld(clock, acts)
    await encounters(clock, intents)
  }
  return { log: L, calls, decisions, stoppedAt, final: Object.fromEntries(NAMES.map((n) => [n, { money: Math.round(S[n].money * 100) / 100, place: S[n].place, plans: S[n].plans.map((p) => p.text), notes: S[n].notes }])) }
}

// ---------- rendering ----------
const render = (L) => L.filter((e) => e.kind !== 'state').map((e) =>
  e.kind === 'chat' ? `[${fmt(e.t)}] (${e.to}) ${e.from}: ${e.text}` :
  e.kind === 'dm' ? `[${fmt(e.t)}] DM ${e.from}→${e.to}: ${e.text}` :
  e.kind === 'pay' ? `[${fmt(e.t)}] £${e.amount} ${e.from}→${e.to}${e.note ? ' (' + e.note + ')' : ''}` :
  e.kind === 'money' ? `[${fmt(e.t)}] ${e.who}: ${e.amount >= 0 ? '+' : '-'}£${Math.abs(e.amount)} ${e.what}` :
  e.kind === 'call' ? `[${fmt(e.t)}] ${e.from} rang ${e.to}: no answer` :
  e.kind === 'event' ? `[${fmt(e.t)}] * ${e.who}: ${e.text}` :
  e.kind === 'outcome' ? `[${fmt(e.t)}] ~ ${e.who}: ${e.text}` :
  `--- ${e.where}, ${fmt(e.t)} (${e.present.join(', ')}) ---\n` + (e.lines.map((l) => l.speech ? `${l.name}: "${l.speech}"${l.action ? ' (' + l.action + ')' : ''}` : `${l.name} (${l.action})`).join('\n') || '(nothing said)')).join('\n')
const timelines = (L) => NAMES.map((n) => `## ${n}\n` + L.filter((e) => e.kind === 'state' && e.who === n).slice(-40)
  .map((e) => `${fmt(e.t)} @${e.place}${e.asleep ? ' (asleep)' : ''}: ${e.doing}${e.changed && !/^nothing/i.test(e.changed) ? ' | did: ' + e.changed : ''}${e.plans.length ? ' | plans: ' + e.plans.join('; ') : ''}`).join('\n')).join('\n\n')

// ---------- 3. iterate: simulate → audit → revise rules ----------
let rules = [...BASE_RULES]
const iterations = []
for (let it = 1; it <= (A.maxIters || 1); it++) {
  phase('Simulate')
  const run = await simulate(rules, it)
  const text = render(run.log), mem = timelines(run.log)
  phase('Audit')
  const audit = await agent(`You audit a social simulation for realism, as a skeptical British reader with a novelist's eye.
SETTING: ${A.setting}. WINDOW: ${fmt(0)} to ${fmt(END)}${run.stoppedAt != null ? ` (run stopped early at ${fmt(run.stoppedAt)})` : ''}.
PEOPLE (attributes were sampled from census data; the prose was written by a model):\n${gp.people.map((p) => `${p.name} | attributes: ${JSON.stringify(p.attributes)}\n  persona: ${p.persona}\n  speech: ${p.speech} | texting: ${p.texting}`).join('\n')}
WORLD: ${W.background}\nCommon knowledge: ${(W.common_knowledge || []).join(' | ')}
Calendar: ${(W.calendar || []).map((c) => `${c.what} (${(c.who || []).join(', ')}; ${(c.days || []).join('/')} ${c.start}-${c.end})`).join(' | ')}
Background characters: ${Object.values(NPCS).map((x) => `${x.name} (${x.role})`).join(', ')}
Events that fired: ${EVENTS.map((e) => `${fmt(e.t)} ${e.who.join('+')}: ${e.text}`).join(' | ') || 'none'}
RULES GIVEN TO CHARACTERS:\n${rules.join('\n')}
HOW IT WORKS: people check in when they choose, when messaged or when something happens; quiet stretches are skipped. Scenes happen when people share a place (chance per place), deliberately seek someone out, call in someone in the building, or phone. Anyone may say nothing or leave; scenes end after two rounds with nothing new. A world resolver handles solo actions and background-character replies.
TRANSCRIPT:\n${text || '(nothing happened)'}
EACH PERSON'S TIMELINE (check-ins: place, activity, what got done, plans):\n${mem}

Work in this order:
1. Before judging, imagine what a real stretch like this would contain for these people in this setting: who contacts whom and how often, errands, frictions, outside interruptions, money moments, idle time.
2. Compare the run against that: missing texture, and things reality would not produce.
3. Check for stereotyping: persona prose or behaviour that adds a role, trait, food, speech pattern or storyline a stereotype would suggest beyond the attributes, including in how others treat them.
4. Score, list breakers, then ROOT CAUSES in the mechanism (prefer these to rules). Propose general, setting-agnostic mechanisms that would let the missing texture emerge without scripting it. At most 3 short general extra rules, as a full replacement list; empty is preferred.`, { ...P, model: 'opus', effort: 'high', phase: 'Audit', label: `${A.label} audit r${it}`, schema: AUDIT })
  iterations.push({ it, rules: [...rules], transcript: text, memories: mem, final: run.final, decisions: run.decisions, calls: run.calls, stoppedAt: run.stoppedAt, audit })
  log(`${A.label} r${it}: score ${audit ? audit.score : '?'} · ${run.decisions} decisions / ${run.calls} calls · ${audit ? audit.verdict.slice(0, 120) : ''}`)
  if (!audit || audit.score >= 8) break
  rules = [...BASE_RULES, ...(audit.extra_rules || []).slice(0, 3)]
}
return { label: A.label, world, events: EVENTS.map((e) => `${fmt(e.t)} ${e.who.join('+')}: ${e.text}`), iterations }

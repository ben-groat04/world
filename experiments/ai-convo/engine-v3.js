export const meta = {
  name: 'social-sim-v3',
  description: 'Social simulation: one agent per person plans its own time, decides whether to talk and when to stop, and keeps its own memory; code keeps each person\'s first-hand journal, the clock, places, calendar, who knows whom, sourced events and full logs; a world role resolves consequences and logs its reasons',
  phases: [{ title: 'Generate' }, { title: 'Simulate' }, { title: 'Audit', model: 'opus' }],
}
// args: { label, setting, dateNote, startDow (0=Mon), startHour, hours, seed, attributes: [{...}] | sample: {...}, events?: [{text, who, p_per_day, hours?, from?, source}], rules?: [str], audit?: bool, maxCalls?, roleAgent?: 'persona'|'sim' }
// The model makes every judgment: what to do and when, whether to talk, when to stop, what to remember, how the outside world responds.
// Code keeps hard facts and logs everything. No number the engine relies on is guessed: people come from sampled attributes, calendar times must
// appear verbatim in the attributes or setting, event rates come only from args.events with a cited source. What has no source is left out.
// Continuity: every call for a person shows them their own journal (what they saw, heard, said and did, kept by code, verbatim), so nobody is
// rebuilt from a summary. Their self-written memory is only for what matters beyond the last few hours.
const A = args || {}
const HOURS = A.hours || 24, START_H = A.startHour ?? 8, START_DOW = A.startDow ?? 0, END = HOURS * 60
const OUT = 'elsewhere', MAX_LINES = 30 // runaway backstop only; people end conversations themselves (logged as ended 'cap' if hit)
const DATE = A.dateNote ? ` (${A.dateNote})` : ''

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

// ---------- every model call is logged in order: sim time, who it was for, why, prompt, result ----------
const CALLS = [], HEADS = {}
let clock = 0, ROLE_AT = A.roleAgent || 'persona' // 'persona' is the known-cheap no-tool agent; 'sim' (.claude/agents/sim.md) once loaded
const roleOf = (r) => `THIS CALL: you are not playing a person. You are the simulation's ${r}.\n`
async function call(kind, prompt, schema, o) {
  const at = kind === 'persona' ? 'persona' : ROLE_AT
  const rec = { i: CALLS.length, t: fmt(clock), phase: o.phase || 'Simulate', label: o.label, for: o.for, agent: at, model: o.model || '', head: o.head || '', why: o.why || '', prompt, result: null }
  CALLS.push(rec)
  const opts = { agentType: at, schema, label: o.label, phase: rec.phase, ...(o.model ? { model: o.model } : {}), ...(o.effort ? { effort: o.effort } : {}) }
  const full = (o.head ? HEADS[o.head] + '\n\n' : '') + prompt
  let r = null
  try { r = await agent(full, opts) } catch (e) { rec.error = String(e?.message || e).slice(0, 300) }
  if (r == null && at !== 'persona') { // custom role agent missing (agent files load at session start): persona for the rest of the run
    ROLE_AT = 'persona'; rec.fallback = 'persona'; log(`role agent "${at}" unavailable; using persona for role calls`)
    try { r = await agent(full, { ...opts, agentType: 'persona' }) } catch (e) { rec.error = String(e?.message || e).slice(0, 300) }
  }
  rec.result = r ?? null
  return r
}

// ---------- 1. generate: each person written separately from their own attributes; then the world's structure ----------
phase('Generate')
const pull = (x) => Array.isArray(x) ? x : x && typeof x === 'object' ? [x.people, x.persons, x.sample, x.attributes].find(Array.isArray) : null
const SETTING = A.setting || A.sample?.setting || A.sample?.description || ''
const ATTR = (pull(A.attributes) || pull(A.sample) || []).map((a) => { const o = { ...a }; for (const k of Object.keys(o)) if (k.startsWith('_') || o[k] == null || (Array.isArray(o[k]) && !o[k].length)) delete o[k]; return o })
if (!ATTR.length) throw new Error('args.attributes (or args.sample) is required: people must come from sampled data, never be made up')
// Ethnicity is kept for the audit and the logs but not shown to the models that write or play people: given the label, models perform it
// (smoke-v3: reggae, curry chicken, a catchphrase accent). Birthplace, years in the country and religion stay: they are biography and practice.
const shown = (a) => { const o = { ...a }; delete o.ethnicity; return o }
// temperament is drawn by code, independent of everything else; low/high mean the bottom/top quarter of people, so 1/4 each by definition
const TRAITS = ['openness', 'conscientiousness', 'extraversion', 'agreeableness', 'emotional stability']
const level = () => { const x = rnd(); return x < 0.25 ? 'low' : x < 0.75 ? 'average' : 'high' }
const TEMPER = ATTR.map(() => TRAITS.map((t) => `${t} ${level()}`).join(', '))
const PERSON = obj({ name: str, profile: { type: 'string', description: '4-6 sentences: who they are now and how their temperament shows in daily life (including the awkward parts), a couple of ordinary interests, current small concerns, relationships' },
  speech: { type: 'string', description: 'register, pace, sentence length, how much they talk and how it changes with mood. No catchphrases, no quoted words or phrases. Accent: ordinary for where they grew up.' },
  texting: { type: 'string', description: 'length, case, punctuation, emoji or none, how fast and how reliably they reply. No catchphrases.' },
  contacts: arr(obj({ name: str, relation: str, about: { type: 'string', description: 'one line: who they are to this person, how they talk/text' }, lives_with_you: bool }, ['name', 'relation', 'about']), { maxItems: 6, description: 'people in their life outside this group, consistent with the attributes (children, partner and others named there first). Full first names.' }),
  memory: { type: 'string', description: 'first person, under 80 words: what is on their mind as the simulation starts. Ordinary.' } })
const gen = await parallel(ATTR.map((a, i) => () => call('persona', `${roleOf('character writer')}Write one person for a social simulation set in: ${SETTING}. It starts ${fmt(0)}${DATE}.
ATTRIBUTES (sampled from census data; fixed facts): ${JSON.stringify(shown(a))}
TEMPERAMENT (fixed; drawn at random, independent of everything else; low/high = bottom/top quarter of people): ${TEMPER[i]}
Add only what a playable person needs, and no figures (money, dates, amounts) beyond the attributes. Pick interests, tastes and concerns as you would for a random person of this age, job, household and temperament. Names you add follow base rates for the person's birth year and birthplace. Ordinary life: no secrets, crises or plot hooks.`,
  PERSON, { phase: 'Generate', label: `write ${a.name || 'person ' + (i + 1)}`, for: 'generator' })))
const PEOPLE = ATTR.map((a, i) => { const g = gen[i] || {}; return { name: a.name || g.name || `Person ${i + 1}`, attributes: a, temperament: TEMPER[i], profile: g.profile || '', speech: g.speech || '', texting: g.texting || '', contacts: g.contacts || [], memory: g.memory || '' } })
const NAMES = PEOPLE.map((p) => p.name), P = Object.fromEntries(PEOPLE.map((p) => [p.name, p]))

const WORLD = obj({ background: { type: 'string', description: '2-4 sentences of shared context, only what the setting and attributes say or plainly imply; no figures' },
  common_knowledge: arr(str, { maxItems: 8, description: 'what these people all know, only from the setting and attributes; no invented figures' }),
  households: arr(arr(str), { description: 'groups of these people who live together, only as the setting or attributes state' }),
  places: arr(obj({ name: str, kind: { type: 'string', enum: ['private', 'shared', 'public'] }, building: { type: 'string', description: 'same label = rooms of one building (within earshot); empty for public' }, access: arr(str, { description: 'names who may normally go in; empty = anyone' }) }),
    { description: "each person's own room or home, shared rooms, their workplaces as the attributes describe them, and a few generic public places (e.g. 'supermarket', 'corner shop'); no brand names" }),
  calendar: arr(obj({ what: str, who: arr(str), days: arr({ type: 'string', enum: DOW }), start: { type: 'string', description: 'HH:MM' }, end: { type: 'string', description: 'HH:MM' }, place: str, source: { type: 'string', description: 'the exact attribute or setting text these days and times are copied from' } }),
    { description: 'ONLY commitments whose days and times are stated in the attributes or setting. If times are not stated, or alternatives are given without saying which applies this week, leave it out.' }),
  contacts: arr(obj({ name: str, role: str, about: { type: 'string', description: '1 line incl. how they talk/text' }, linked_to: arr(str, { description: 'who deals with them' }), place: { type: 'string', description: 'place where they can be met in person, or empty' } }, ['name', 'role', 'about', 'linked_to']),
    { description: 'shared background characters the attributes imply (e.g. landlord or letting agent for renters, a manager for employees)' }) })
const W = await call('role', `${roleOf('world builder')}Supply the structure these people's lives already have. No plot, and never guess data: no numbers, times or facts that the setting or attributes do not give.
SETTING: ${SETTING}
WINDOW: ${fmt(0)} for ${HOURS} hours (day 0 = ${DOW[START_DOW]})${DATE}.
PEOPLE:\n${PEOPLE.map((p) => `${p.name}: ${JSON.stringify(shown(p.attributes))}\n  Their own contacts: ${p.contacts.map((c) => `${c.name} (${c.relation})`).join(', ') || 'none'}`).join('\n')}
Use only these names for the people. Their own contacts already exist; add only shared ones.`, WORLD, { phase: 'Generate', label: 'build world', for: 'generator' })
if (!W) throw new Error('world generation returned nothing')

// ---------- normalise into hard facts ----------
const PLACES = [...(W.places || []).filter((p) => p.name && p.name !== OUT).map((p) => ({ name: p.name, kind: p.kind || 'public', building: p.building || '', access: (p.access || []).map((n) => resolve(n, NAMES)).filter(Boolean) })), { name: OUT, kind: 'public', building: '', access: [] }]
const PLACE = Object.fromEntries(PLACES.map((p) => [p.name, p]))
const placeOf = (name) => resolve(name, PLACES.map((p) => p.name))
const canGo = (n, pl) => !PLACE[pl].access.length || PLACE[pl].access.includes(n)
const homeOf = (n) => PLACES.find((p) => p.kind === 'private' && p.access.includes(n))?.name || OUT
const CONTACT = {}
for (const c of W.contacts || []) if (c.name && !NAMES.includes(c.name)) { const x = CONTACT[c.name] ||= { name: c.name, role: c.role, about: c.about || '', linked: [], place: '' }; x.linked.push(...(c.linked_to || []).map((n) => resolve(n, NAMES)).filter(Boolean)); x.place = placeOf(c.place) || x.place }
for (const p of PEOPLE) for (const c of p.contacts) if (c.name && !NAMES.includes(c.name)) { // a person's own people; the same first name in two lives is two people
  const key = CONTACT[c.name] && !CONTACT[c.name].linked.includes(p.name) ? `${c.name} (${p.name.split(' ')[0]}'s ${c.relation})` : c.name
  const x = CONTACT[key] ||= { name: key, role: `${p.name}'s ${c.relation}`, about: c.about || '', linked: [], place: '' }; x.linked.push(p.name); if (c.lives_with_you && !x.place) x.place = homeOf(p.name) === OUT ? '' : homeOf(p.name) }
const contactsOf = (n) => Object.values(CONTACT).filter((c) => c.linked.includes(n)).map((c) => c.name)
// who knows whom by name and has whose number: people who live together (as stated) do; everyone else starts as a stranger and learns in play
const KNOW = Object.fromEntries(NAMES.map((n) => [n, new Set()])), NUM = Object.fromEntries(NAMES.map((n) => [n, new Set()]))
const housemates = (W.households || []).map((h) => (h || []).map((m) => resolve(m, NAMES)).filter(Boolean))
for (const p of PEOPLE) housemates.push([p.name, ...((p.attributes.household?.lives_with || []).map((x) => resolve(x?.name || x, NAMES)).filter(Boolean))])
for (const h of housemates) for (const a of h) for (const b of h) if (a !== b) { KNOW[a].add(b); NUM[a].add(b) }
const desc = (m) => { const a = P[m].attributes; return [a.sex, Number.isFinite(+a.age) ? `${Math.floor(a.age / 10) * 10}s` : ''].filter(Boolean).join(', ') || 'someone' }
const label = (v, m) => !NAMES.includes(m) || v === m || KNOW[v].has(m) ? m : `stranger (${desc(m)})`
const CHATS = [] // group chats exist only once someone starts one in play
// calendar: kept only if its times appear verbatim in a listed person's attributes or the setting (no invented routines)
const CAL = [], DROPPED = []
const addOcc = (what, who, place, t0, t1, by) => { if (t1 > 0 && t0 < END && !Number.isNaN(t0)) CAL.push({ what, who, place: placeOf(place) || OUT, t0, t1, by }) }
for (const c of W.calendar || []) { const who = (c.who || []).map((n) => resolve(n, NAMES)).filter(Boolean)
  const text = [SETTING, A.dateNote || '', ...who.map((n) => JSON.stringify(P[n].attributes))].join(' ')
  const ok = who.length && [c.start, c.end].every((x) => { const m = String(x || '').match(/(\d{1,2}):(\d{2})/); return m && (text.includes(`${m[1]}:${m[2]}`) || text.includes(`${m[1].padStart(2, '0')}:${m[2]}`)) })
  if (!ok) { DROPPED.push({ ...c, why: 'times not found in attributes or setting' }); continue }
  for (let d = 0; d < NDAYS; d++) if ((c.days || []).includes(DOW[(START_DOW + d) % 7])) { const t0 = atDay(d, c.start); let t1 = atDay(d, c.end); if (t1 <= t0) t1 += 1440; addOcc(c.what, who, c.place, t0, t1, 'routine') } }
// seeded events: only from args.events, each with a cited source for its rate
const EVENTS = []
for (const e of A.events || []) { if (!e.source || !(Number(e.p_per_day) >= 0)) { DROPPED.push({ ...e, why: 'event without source or rate' }); continue }
  const who = e.who === 'each' || e.who === 'all' ? NAMES : (Array.isArray(e.who) ? e.who : [e.who]).map((n) => resolve(n, NAMES)).filter(Boolean)
  const [h0, h1] = Array.isArray(e.hours) && e.hours.length === 2 ? e.hours.map(Number) : [0, 24]
  for (let d = 0; d < NDAYS; d++) for (const n of who) if (rnd() < clamp(e.p_per_day, 0, 1)) { const t = atDay(d, '00:00') + Math.floor((h0 + rnd() * Math.max(0, h1 - h0)) * 60); if (t >= 0 && t < END) EVENTS.push({ t, who: n, text: e.text, from: resolve(e.from, Object.keys(CONTACT)), source: e.source }) } }
EVENTS.sort((a, b) => a.t - b.t)
const world = { setting: SETTING, background: W.background, common_knowledge: W.common_knowledge || [], households: housemates, people: PEOPLE, places: PLACES, calendar_template: (W.calendar || []).filter((c) => !DROPPED.includes(c)), dropped: DROPPED, contacts: Object.values(CONTACT), events_given: A.events || [] }
log(`${A.label}: ${NAMES.join(', ')} · ${PLACES.length} places · ${CAL.length} calendar slots (${DROPPED.length} unsourced items dropped) · ${EVENTS.length} events · ${Object.keys(CONTACT).length} contacts`)

// ---------- 2. simulate ----------
phase('Simulate')
const RULES = ['You are one real person, not an assistant. You know only what you have seen, been told, or is common knowledge here.',
  'Do things for your own reasons. Nobody is directing a story; most of life is routine.',
  'You are not obliging by default. Your temperament and mood show in what you do: people forget, run late, get irritated, say no, leave messages unanswered, change their minds.',
  'Talk the way you talk and text the way you text, but most of what anyone says is plain: habits show now and then, not in every line. Speech is spoken words only.',
  'Silence, short replies and doing nothing are normal. No speeches, therapy-speak or tidy resolutions.',
  `It is ${fmt(0).slice(0, 3)}${DATE || ''}. You do not know the specifics of this year's TV, sport, charts or news; keep such references general.`, ...(A.rules || [])]
const facts = (a) => Object.entries(shown(a)).filter(([k]) => k !== 'name').map(([k, v]) => `${k}: ${typeof v === 'object' ? JSON.stringify(v) : v}`).join('; ')
for (const p of PEOPLE) HEADS[p.name] = `RULES:\n${list(RULES)}\n\nYOU: ${p.name}. ${facts(p.attributes)}\nTemperament (low/high = bottom/top quarter of people): ${p.temperament}\n${p.profile}\nPeople in your life: ${p.contacts.map((c) => `${c.name} (${c.relation})`).join(', ') || 'none named'}\nHOW YOU SPEAK: ${p.speech}\nHOW YOU TEXT: ${p.texting}\n\nWHERE YOU LIVE: ${W.background || ''}\nEVERYONE HERE KNOWS:\n${list(W.common_knowledge || [])}`

const L = [] // the full event log; every entry has t and kind
const S = Object.fromEntries(NAMES.map((n) => [n, { place: homeOf(n), doing: '', asleep: false, phone: 0, plan: [], pv: 0, next: 0, why: ['the simulation starts: decide where you are and what you are doing'], ping: false, memory: P[n].memory, last: -1, turns: 0 }]))
const Q = []; let qs = 0
const at = (t, run) => { Q.push({ t, run, s: qs++ }); Q.sort((a, b) => a.t - b.t || a.s - b.s) }
const pendingWorld = [], pendingCalls = [], threads = {} // threads[contact]: recent exchanges with that contact (facts the world role sees)
const thread = (c, line) => { (threads[c] ||= []).push(line); threads[c] = threads[c].slice(-8) }
const MAX_CALLS = A.maxCalls || Math.round(60 + NAMES.length * 150 * HOURS / 24) // runaway backstop only, never pacing
let simCalls = 0, stopped = null
const ask = (kind, prompt, schema, o) => { simCalls++; return call(kind, prompt, schema, o) }

// each person's journal: their first-hand experience, verbatim, newest last. Shown back in every call so continuity never rests on a summary.
const J = Object.fromEntries(NAMES.map((n) => [n, []]))
const jot = (n, t, text, seen = true, scene = false) => { J[n].push({ t, text, seen, scene }); if (J[n].length > 400) J[n].shift() }
const wake = (n, t, why) => { const s = S[n]; s.why.push(why); s.next = Math.min(s.next, Math.max(t, s.last + 3)) }
// news reaches a person when they would look: at their own chosen phone-check rhythm, between activities, or when they wake
function notify(n, t, text, urgent = true) {
  jot(n, t, text, false); if (!urgent) return
  const s = S[n]; s.ping = true; if (s.asleep || !s.phone) return
  wake(n, t + Math.floor(rnd() * s.phone), `looked at your phone (${text.slice(0, 50)})`)
}
function journal(n, now, max) {
  const xs = J[n].filter((e) => !e.seen || now - e.t <= 6 * 60), out = []; let size = 0
  for (let i = xs.length - 1; i >= 0; i--) { const e = xs[i], line = `${e.seen ? '' : 'NEW '}${fmt(e.t)} ${e.text}`
    if (size + line.length > max && e.seen && out.length) { out.push('(earlier: see your memory)'); break } out.push(line); size += line.length }
  return out.reverse().join('\n') || '(nothing yet)'
}
const here = (n, pl = S[n].place) => NAMES.filter((m) => m !== n && S[m].place === pl && pl !== OUT)
const moveTo = (n, pl, t, why) => { const s = S[n], from = s.place; if (from === pl) return
  for (const m of here(n, from).filter((m) => !S[m].asleep)) notify(m, t, `${label(m, n)} left ${from}.`, false)
  s.place = pl; L.push({ t, kind: 'move', who: n, from, to: pl, doing: why }); jot(n, t, `you went to ${pl}${why ? ': ' + why : ''}`) }

function setPlan(n, steps, now) {
  const s = S[n], v = ++s.pv; s.plan = []; let t = now
  for (const st of (steps || []).slice(0, 8)) {
    let t1 = after(st.until, t); if (Number.isNaN(t1) || t1 - t > 23 * 60) continue; t1 = Math.min(t1, now + 20 * 60) // >23h = a time just past: a slip, not a plan
    const pl = placeOf(st.place) || s.place
    s.plan.push({ t0: t, t1, place: canGo(n, pl) ? pl : s.place, doing: noEmoji(st.doing) || '', asleep: !!st.asleep, phone: clamp(st.phone_minutes, 0, 240), action: String(st.action || '').trim() }); t = t1
    if (t >= now + 20 * 60) break }
  if (!s.plan.length) s.plan.push({ t0: now, t1: now + 60, place: s.place, doing: s.doing, asleep: s.asleep, phone: s.phone, action: '', auto: true })
  s.plan.forEach((st, i) => at(st.t0, () => s.pv === v && startStep(n, st, i)))
  const end = s.plan[s.plan.length - 1].t1; at(end, () => s.pv === v && wake(n, end, 'your plan ran out'))
}
function startStep(n, st, i) {
  const s = S[n], wasAsleep = s.asleep, moved = s.place !== st.place
  moveTo(n, st.place, clock, st.doing)
  Object.assign(s, { doing: st.doing, asleep: st.asleep, phone: st.phone })
  if (st.action && !st.sent) { st.sent = true; pendingWorld.push({ kind: 'action', who: n, step: st, text: `${n} at ${st.place}, ${fmt(st.t0)}-${fmt(st.t1)}: ${st.action}` }) } // errands happen where and when the person does them
  if (s.asleep) return
  if (s.ping && (wasAsleep || i > 0)) wake(n, clock, wasAsleep ? 'you woke up' : 'between things, you checked your phone')
  const others = here(n).filter((m) => !S[m].asleep)
  if (moved && others.length) { wake(n, clock, `you came into ${s.place}: ${others.map((m) => label(n, m)).join(', ')} here`); for (const m of others) notify(m, clock, `${label(m, n)} came into ${s.place}.`, false) }
}

// ---------- outside world: sourced events, calendar ----------
for (const e of EVENTS) at(e.t, (t) => { if (e.from) pendingWorld.push({ kind: 'gets in touch', from: e.from, who: e.who, text: e.text }); else { L.push({ t, kind: 'event', who: e.who, text: e.text, source: e.source }); notify(e.who, t, e.text) } })
const watchOcc = (o) => { if (o.place !== OUT && o.t0 + 15 < END && o.t0 + 15 >= 0) at(o.t0 + 15, (t) => { for (const n of o.who) if (S[n].place !== o.place) { L.push({ t, kind: 'missed', who: n, what: o.what, place: o.place }); pendingWorld.push({ kind: 'not there', who: n, text: `${n} is not at ${o.place} for "${o.what}" (due ${fmt(o.t0)}); they are at ${S[n].place}` }) } }) }
CAL.forEach(watchOcc)

// ---------- turns ----------
const calView = (n, now) => CAL.filter((o) => o.who.includes(n) && o.t1 > now && o.t0 < now + 1440).sort((a, b) => a.t0 - b.t0).map((o) => `${fmt(o.t0)}-${fmt(o.t1).slice(4)} ${o.what}${o.place !== OUT ? ' @' + o.place : ''}${o.who.length > 1 ? ' (with ' + o.who.filter((x) => x !== n).join(', ') + ')' : ''}`)
const planView = (n, now) => S[n].plan.filter((p) => p.t1 > now && !p.auto).map((p) => `until ${fmt(p.t1)}: ${p.doing} @${p.place}${p.asleep ? ' (asleep)' : ''}${p.action ? ` [errand: ${p.action}${p.result ? ' -> DONE: ' + p.result : p.sent ? ' (under way)' : ''}]` : ''}`)
const atPlace = (pl) => pl === OUT ? [] : Object.values(CONTACT).filter((c) => c.place === pl).map((c) => c.name)
const hereView = (n, pl = S[n].place) => [...here(n, pl).map((m) => `${label(n, m)} (${S[m].asleep ? 'asleep' : S[m].doing})`), ...atPlace(pl).map((c) => `${c} (${CONTACT[c].role})`)].join(', ') || 'nobody'
const phoneBook = (n) => NAMES.filter((m) => m !== n && NUM[n].has(m))
const TURN = obj({ memory: { type: 'string', description: 'your longer-term memory, first person, max 100 words: things that HAVE happened (past tense) or that you must keep in mind beyond today. Plans go in plan; recent detail is already in your journal. Return it unchanged if nothing new matters.' },
  keep_plan: { type: 'boolean', description: 'true if your current plan still stands (then plan may be empty)' },
  plan: arr(obj({ until: { type: 'string', description: 'HH:MM clock time this step lasts until' }, place: str, doing: { type: 'string', description: 'a few words' }, asleep: bool,
    phone_minutes: { type: 'integer', description: 'how often you would glance at your phone during this (0 = not at all)' },
    action: { type: 'string', description: 'an errand done during this step that depends on the outside world (buy, book, order, ask, check an app); it happens when the step starts, at its place. Else empty.' } }, ['until', 'place', 'doing', 'phone_minutes']),
    { maxItems: 8, description: 'your next few hours (up to ~16h) as consecutive steps from now, sleep included' }),
  talk_to: { type: 'string', description: 'someone here or in the same building you go and speak to now; else empty' },
  call: { type: 'string', description: 'ring someone now; else empty' },
  messages: arr(obj({ to: { type: 'string', description: 'a person, contact or group; several names separated by commas start a group' }, text: str }), { maxItems: 3 }),
  pay: arr(obj({ to: str, amount: { type: 'number' }, note: str }, ['to', 'amount']), { maxItems: 2, description: 'a transfer you make now (it is logged and the other person is told)' }),
  arrange: arr(obj({ what: str, day: { type: 'string', enum: DOW }, time: { type: 'string', description: 'HH:MM' }, minutes: int, place: str }, ['what', 'day', 'time']), { maxItems: 2, description: 'something agreed or booked: goes in YOUR calendar' }) }, ['memory', 'keep_plan'])
const turnPrompt = (n, now) => { const s = S[n]
  return `IT IS NOW ${fmt(now)}. WHY NOW: ${[...new Set(s.why)].join('; ')}.
YOUR LONGER-TERM MEMORY (you wrote this):\n${s.memory || '(empty)'}
YOUR JOURNAL, LAST FEW HOURS (what you saw, heard, said and did; NEW = not seen yet):\n${journal(n, now, 4500)}
WHERE YOU ARE: ${s.place}${s.doing ? ', ' + s.doing : ''}${s.asleep ? ' (asleep until now)' : ''}. HERE: ${hereView(n)}.
YOUR PLAN (as you left it):\n${list(planView(n, now))}
CALENDAR (next 24h):\n${list(calView(n, now))}
PLACES: ${PLACES.filter((p) => canGo(n, p.name)).map((p) => p.name).join(' | ')}
PHONE: people ${phoneBook(n).join(', ') || 'none'}; contacts ${contactsOf(n).join(', ') || 'none'}; groups ${CHATS.filter((c) => c.members.includes(n)).map((c) => c.name).join(', ') || 'none'}.
What do you do now? Your journal shows what you have already said and done; don't repeat yourself. Most moments change little.` }

function send(from, to, text, t) {
  text = String(text || '').trim(); if (!text) return
  let chat = CHATS.find((c) => c.name === resolve(to, CHATS.filter((c) => c.members.includes(from)).map((c) => c.name)))
  const names = String(to || '').split(/,| and | & /).map((x) => resolve(x, phoneBook(from))).filter(Boolean)
  if (!chat && names.length > 1) { const members = [from, ...new Set(names)], name = 'group: ' + members.map((m) => m.split(' ')[0]).sort().join(', ')
    chat = CHATS.find((c) => c.name === name) || (CHATS.push({ name, members }), CHATS[CHATS.length - 1]) }
  const p = names.length === 1 ? names[0] : '', c = resolve(to, contactsOf(from))
  if (chat) { L.push({ t, kind: 'chat', to: chat.name, from, text }); jot(from, t, `you → [${chat.name}]: ${text}`); for (const m of chat.members) if (m !== from) notify(m, t, `[${chat.name}] ${from}: ${text}`) }
  else if (p) { L.push({ t, kind: 'dm', from, to: p, text }); jot(from, t, `you → ${p}: ${text}`); NUM[p].add(from); KNOW[p].add(from); notify(p, t, `${from} texted: ${text}`) }
  else if (c) { L.push({ t, kind: 'dm', from, to: c, text }); jot(from, t, `you → ${c}: ${text}`); thread(c, `${fmt(t)} ${from} → ${c}: ${text}`); pendingWorld.push({ kind: 'message', who: from, from: c, text: `${from} texted ${c}: "${text}"` }) }
  else notify(from, t, `Your message to "${to}" could not be sent (no number for them).`, false)
}
function applyTurn(n, r, now, intents) {
  const s = S[n], why = [...new Set(s.why)]; s.last = now; s.next = Infinity; s.why = []; s.turns++
  if (!r) { L.push({ t: now, kind: 'turn', who: n, why, failed: true }); s.why = why; s.next = now + 30; return } // their unseen journal stays NEW for the retry
  const seen = J[n].filter((e) => !e.seen).map((e) => `${fmt(e.t)} ${e.text}`); for (const e of J[n]) e.seen = true; s.ping = false
  if (String(r.memory || '').trim()) s.memory = String(r.memory).trim().slice(0, 1200)
  if (!(r.keep_plan && s.plan.some((p) => p.t1 > now && !p.auto)) || (r.plan || []).length) setPlan(n, r.plan, now)
  for (const m of r.messages || []) send(n, m.to, m.text, now)
  for (const p of r.pay || []) { const amt = Math.round(Number(p.amount) * 100) / 100, to = resolve(p.to, phoneBook(n)) || resolve(p.to, here(n).filter((m) => KNOW[n].has(m))) || resolve(p.to, contactsOf(n)) || String(p.to || 'someone')
    if (!(amt > 0)) continue
    L.push({ t: now, kind: 'pay', from: n, to, amount: amt, note: p.note || '' }); jot(n, now, `you paid ${to} ${amt}${p.note ? ' (' + p.note + ')' : ''}`)
    if (NAMES.includes(to)) notify(to, now, `${n} sent you ${amt}${p.note ? ' (' + p.note + ')' : ''}.`, false) }
  for (const a of r.arrange || []) { if (!DOW.includes(a.day)) continue
    let d = dayOf(now); while (DOW[(START_DOW + d) % 7] !== a.day) d++; let t0 = atDay(d, a.time); if (Number.isNaN(t0)) continue; if (t0 < now) t0 += 7 * 1440
    if (t0 < END) { addOcc(a.what, [n], a.place, t0, t0 + clamp(a.minutes || 60, 5, 720), n); const o = CAL[CAL.length - 1]; L.push({ t: now, kind: 'calendar', who: n, what: o.what, at: o.t0, place: o.place }); jot(n, now, `you put in your calendar: ${o.what} at ${fmt(o.t0)}`); watchOcc(o) } }
  if (r.talk_to) intents.push({ kind: 'talk', from: n, to: r.talk_to })
  if (r.call) intents.push({ kind: 'call', from: n, to: r.call })
  L.push({ t: now, kind: 'turn', who: n, why, seen, place: s.place, doing: s.doing, memory: s.memory, plan: planView(n, now), kept: !!r.keep_plan, talk_to: r.talk_to || '', call: r.call || '', messages: (r.messages || []).length })
}

// ---------- scenes: each person speaks through their own agent, sees their own recent past, and ends it themselves ----------
const SAY = obj({ say: { type: 'string', description: 'words said out loud, or empty' }, do: { type: 'string', description: 'brief action, or empty' },
  minutes: { type: 'integer', description: 'roughly how many minutes this bit takes, talk and action together' },
  call_over: { type: 'string', description: 'someone NOT here whom you call, shout for or knock for now; else empty' },
  leave: { type: 'boolean', description: 'you walk off / hang up after this' }, done: { type: 'boolean', description: 'you would be happy to stop talking now (you can stay in the room)' } }, ['say', 'do', 'minutes', 'leave', 'done'])
const HEAR = obj({ come: { type: 'boolean', description: 'you go to them' }, say: { type: 'string', description: 'anything you call back, or empty' }, do: str }, ['come', 'say', 'do'])
const sceneText = (lines, v) => lines.map((l) => { const nm = v ? label(v, l.name) : l.name; return l.say ? `${nm}: "${l.say}"${l.do ? ' (' + l.do + ')' : ''}` : `${nm} (${l.do || 'says nothing'})` }).join('\n')
const threadOf = (c, ppl) => (threads[c] || []).filter((x) => ppl.some((p) => x.includes(p))).slice(-5)
const personaCtx = (n, now, max) => `YOUR LONGER-TERM MEMORY:\n${S[n].memory || '(empty)'}\nYOUR JOURNAL, LAST FEW HOURS:\n${journal(n, now, max)}\nYOUR PLAN: ${planView(n, now).slice(0, 2).join(' / ') || '(none)'}\n\n`
async function scene(t, where, phone, people, starter, opening) {
  const lines = [], left = new Set(), done = {}; let failed = 0, mins = 0, ended = 'cap', speaker = starter
  if (opening) { lines.push({ name: starter, say: noEmoji(opening), do: '' }); mins += 1; speaker = people.find((x) => x !== starter) }
  while (lines.length < MAX_LINES) {
    const now = t + mins, others = people.filter((x) => x !== speaker && !left.has(x)), ringing = phone && speaker !== starter && !lines.some((l) => l.name === speaker)
    const soFar = (lines.length > 16 ? `(${lines.length - 16} earlier lines)\n` : '') + (sceneText(lines.slice(-16), NAMES.includes(speaker) && speaker) || '(nothing yet: you start)')
    const who = phone ? `ON THE LINE: ${others.map((m) => NAMES.includes(speaker) ? label(speaker, m) : m).join(', ')}.` : `ONLY THESE PEOPLE ARE HERE: ${others.map((m) => `${NAMES.includes(speaker) ? label(speaker, m) : m} (${NAMES.includes(m) ? S[m].doing : CONTACT[m].role})`).join(', ')}. Nobody else is here or arrives unless it shows below; to get someone who isn't here, name them in call_over.`
    let r
    if (CONTACT[speaker]) { const c = CONTACT[speaker]
      r = await ask('role', `${roleOf('world, voicing one background character')}${c.name} (${c.role}): ${c.about}\nTheir recent contact with these people:\n${list(threadOf(c.name, others))}\nSetting: ${SETTING}. It is ${fmt(now)}. ${phone ? 'On the phone.' : `At ${where}.`} ${who}${ringing ? ` ${c.name}'s phone is ringing (${starter}); they may not pick up (leave=true, say nothing).` : ''}\nSO FAR:\n${soFar}\nWhat does ${c.name} say or do? Brief and ordinary. Don't state figures you would have to guess.`, SAY, { label: `${A.label} ${c.name} @${where}`, for: c.name, why: 'scene line' })
    } else {
      r = await ask('persona', `${personaCtx(speaker, now, 2500)}IT IS ${fmt(now)}. ${phone ? `You are ON THE PHONE (you are at ${S[speaker].place}).` : `You are at ${where}.`} ${who}${ringing ? `\nYOUR PHONE IS RINGING: ${NUM[speaker].has(starter) || CONTACT[starter] ? starter : 'a number you do not have saved'}. Answer (say something) or let it ring (leave=true, say nothing).` : ''}
THIS CONVERSATION SO FAR${mins >= 1 ? ` (${Math.round(mins)} min in)` : ''}:\n${soFar}
Your turn. Your journal shows what you have already said and done; don't repeat it. You can say nothing, carry on with what you were doing, or ${phone ? 'hang up' : 'leave'}.`, SAY, { label: `${A.label} ${speaker} @${where}`, for: speaker, head: speaker, why: 'scene line' })
    }
    if (ringing && (!r || (r.leave && !String(r.say || '').trim()))) { ended = 'not answered'; left.add(speaker); lines.length = 0; break }
    if (!r) failed++
    const say = noEmoji(r?.say)
    if (r) { lines.push({ name: speaker, say, do: noEmoji(r.do) }); mins += clamp(r.minutes, 0, 30) || 0.5 }
    done[speaker] = !r || !!r.done || !!r.leave
    if (r?.leave) left.add(speaker)
    if (r?.call_over && !phone) { // someone shouts for, knocks for or fetches a person who isn't here: that person decides
      const x = NAMES.find((m) => m === resolve(r.call_over, NAMES.filter((k) => !people.includes(k) && (!NAMES.includes(speaker) || KNOW[speaker].has(k)))))
      const reach = x && S[x].place !== OUT && PLACE[S[x].place]?.building && PLACE[S[x].place].building === PLACE[where]?.building && !S[x].asleep
      let h = null
      if (reach) h = await ask('persona', `${personaCtx(x, now, 1500)}IT IS ${fmt(now)}. You are at ${S[x].place}${S[x].doing ? ', ' + S[x].doing : ''}. You hear ${label(x, speaker)} calling for you from ${where}${say ? `: "${say}"` : ''}. Do you go? You can also call something back, or ignore it.`, HEAR, { label: `${A.label} ${x} hears ${speaker}`, for: x, head: x, why: 'called over' })
      if (h?.come) { moveTo(x, where, t + mins, 'called over by ' + speaker); S[x].doing = 'with ' + people.filter((m) => !left.has(m)).join(', '); people.push(x); lines.push({ name: x, say: noEmoji(h.say), do: noEmoji(h.do) || 'comes in' }) }
      else if (h && (h.say || '').trim()) lines.push({ name: x, say: noEmoji(h.say), do: `from ${S[x].place}` })
      else lines.push({ name: '—', say: '', do: `no answer from ${r.call_over}` })
    }
    const live = people.filter((x) => !left.has(x)); if (live.length < 2) { ended = phone ? 'hung up' : 'walked off'; break }
    const last = lines[lines.length - 1], named = !r ? [] : live.filter((x) => x !== last?.name && x !== speaker && ((last?.say || '').toLowerCase().includes(first(x)) || (live.length === 2 && (last?.say || '').trim().endsWith('?'))))
    const order = live.filter((x) => x !== speaker && x !== last?.name).sort((a, b) => lines.map((l) => l.name).lastIndexOf(a) - lines.map((l) => l.name).lastIndexOf(b))
    const nxt = named[0] || order.find((x) => !done[x])
    if (!nxt) { ended = 'talk ran out'; break }
    speaker = nxt
  }
  const end = t + Math.ceil(mins), ps = people.filter((x) => NAMES.includes(x))
  L.push({ t, kind: phone ? 'call' : 'scene', where, present: people, lines, minutes: Math.ceil(mins), ended, answered: ended !== 'not answered', ...(failed ? { failed } : {}) })
  for (const m of ps) if (lines.some((l) => l.say.toLowerCase().includes(first(m)))) for (const v of ps) KNOW[v].add(m) // names said aloud are learned
  if (phone && ps.length === 2 && ended !== 'not answered') for (const v of ps) NUM[v].add(ps.find((x) => x !== v))
  for (const n of ps) {
    if (ended === 'not answered') { if (n === starter) { jot(n, end, `you rang ${people.find((x) => x !== n)}; no answer`); wake(n, end, 'no answer') } else notify(n, end, `Missed call from ${label(n, starter)}.`, false); continue }
    for (const e of J[n]) if (e.scene) { const ls = e.text.split('\n'); if (ls.length > 9) e.text = [ls[0], '...', ...ls.slice(-8)].join('\n') } // older conversations keep their ending
    jot(n, end, `${phone ? 'call' : 'conversation at ' + where} (${fmt(t)}-${fmt(end).slice(4)}) with ${people.filter((x) => x !== n).map((m) => label(n, m)).join(', ')}:\n${sceneText(lines, n)}`, true, true)
    wake(n, end, 'after the conversation') }
  for (const c of people.filter((x) => CONTACT[x])) { thread(c, `${fmt(t)} ${phone ? 'call' : 'met'} with ${people.filter((x) => x !== c).join(', ')}: ${ended === 'not answered' ? '(not answered)' : lines.map((l) => `${l.name}: ${l.say || '(' + l.do + ')'}`).join(' / ').slice(0, 600)}`)
    if (ended === 'not answered' && NAMES.includes(starter)) pendingWorld.push({ kind: 'missed call', who: starter, from: c, text: `${starter} rang ${c}; ${c} did not pick up` }) }
  return end
}
async function intent(x, now) {
  const s = S[x.from]
  if (x.kind === 'call') {
    const p = resolve(x.to, phoneBook(x.from)), c = p ? '' : resolve(x.to, contactsOf(x.from))
    if (!p && !c) { notify(x.from, now, `You can't ring "${x.to}": no number for them.`, false); return now }
    if (p && S[p].asleep) { L.push({ t: now, kind: 'call', where: 'phone', present: [x.from, p], lines: [], ended: 'asleep, not answered', answered: false }); NUM[p].add(x.from); notify(p, now, `Missed call from ${x.from}.`); jot(x.from, now, `you rang ${p}; no answer`); return now }
    return scene(now, `phone: ${x.from} → ${p || c}`, true, [x.from, p || c], x.from)
  }
  const byLabel = Object.fromEntries(NAMES.filter((m) => m !== x.from).map((m) => [label(x.from, m), m]))
  const p = byLabel[resolve(x.to, Object.keys(byLabel))] || '', c = p ? '' : resolve(x.to, atPlace(s.place))
  if (c) return scene(now, s.place, false, [x.from, c], x.from)
  const near = p && S[p].place !== OUT && (S[p].place === s.place || (PLACE[s.place].building && PLACE[s.place].building === PLACE[S[p].place].building && KNOW[x.from].has(p)))
  if (!near) { notify(x.from, now, `${x.to} isn't around here.`, false); return now }
  if (S[p].asleep) { notify(x.from, now, `${label(x.from, p)} seems to be asleep.`, false); return now }
  const pl = S[p].place; moveTo(x.from, pl, now, `to talk to ${label(x.from, p)}`)
  return scene(now, pl, false, [x.from, ...NAMES.filter((m) => m !== x.from && S[m].place === pl && !S[m].asleep)], x.from)
}

// ---------- the world role: consequences only, each with a reason ----------
const RESOLVE = obj({ decisions: arr(obj({ item: int, kind: { type: 'string', enum: ['result', 'text', 'call', 'none'] }, who: { type: 'string', description: 'the simulated person affected' },
  from: { type: 'string', description: 'for text/call: the contact who sends it' }, text: { type: 'string', description: "result: what they see or what happens, second person. text/call: the words, in that contact's voice" },
  delay_minutes: int, reason: { type: 'string', description: 'one line: why this outcome' } }, ['item', 'kind', 'who', 'text', 'reason'])) })
async function resolveWorld(now) {
  if (!pendingWorld.length) return
  const items = pendingWorld.splice(0), cs = [...new Set(items.map((x) => x.from).filter(Boolean))]
  const r = await ask('role', `${roleOf('world: shops, services, apps, workplaces and background characters')}You only work out the consequences of what the people did and of the listed events. Never start new storylines or add drama. Outcomes as they ordinarily go, including ordinary snags. Every decision gets a one-line reason. Don't state prices, totals or other figures you would have to guess.
SETTING: ${SETTING}. NOW: ${fmt(now)}${DATE}.
${cs.length ? `CONTACTS:\n${cs.map((c) => `${c} (${CONTACT[c]?.role}): ${CONTACT[c]?.about}\n  recent: ${(threads[c] || []).slice(-5).join(' | ') || 'nothing'}`).join('\n')}\n` : ''}ITEMS:\n${items.map((x, i) => `${i + 1}. [${x.kind}] ${x.kind === 'gets in touch' ? `${x.from} gets in touch with ${x.who} about: ${x.text} (write what ${x.from} actually sends or says)` : x.text}`).join('\n')}
One or more decisions per item (kind none if nothing comes of it). An errand's result arrives while the person is there doing it.`, RESOLVE, { label: `${A.label} world ${fmt(now)}`, for: 'world', why: items.map((x) => x.kind).join(', ') })
  const got = new Set()
  for (const d of r?.decisions || []) {
    const it = items[(d.item | 0) - 1], who = resolve(d.who, NAMES) || it?.who; if (!who) continue; got.add(it)
    const t = now + clamp(d.delay_minutes || 0, 0, 2880), from = resolve(d.from, Object.keys(CONTACT)) || it?.from
    L.push({ t: now, kind: 'world', item: it?.text || '', decision: d.kind, who, from: from || '', text: d.text, at: t, reason: d.reason })
    if (d.kind === 'none') continue
    if (d.kind !== 'result' && !(from && CONTACT[from].linked.includes(who))) { L[L.length - 1].blocked = `${from || '(no contact)'} has no number for ${who}`; continue }
    if (d.kind === 'result') { if (it?.step) it.step.result = d.text; if (t < END) at(t, (tt) => { L.push({ t: tt, kind: 'result', who, text: d.text }); notify(who, tt, d.text) }) }
    else if (t < END) at(t, (tt) => { thread(from, `${fmt(tt)} ${from} → ${who}: ${d.text}`)
      if (d.kind === 'text') { L.push({ t: tt, kind: 'dm', from, to: who, text: d.text }); notify(who, tt, `${from} texted: ${d.text}`) }
      else if (S[who].asleep) { L.push({ t: tt, kind: 'call', where: `phone: ${from} → ${who}`, present: [from, who], lines: [], ended: 'asleep, not answered', answered: false }); notify(who, tt, `Missed call from ${from}.`) }
      else pendingCalls.push({ t: tt, from, to: who, opening: d.text }) })
  }
  for (const it of items) if (!got.has(it)) { L.push({ t: now, kind: 'world', item: it.text, decision: 'unresolved', who: it.who, reason: r ? 'no decision returned' : 'world call failed' }); if (it.step) it.step.result = 'nothing came of it' }
}

// ---------- main loop: jump to the next thing that happens; quiet time costs nothing ----------
while (true) {
  const tNext = Math.min(...NAMES.map((n) => S[n].next), Q.length ? Q[0].t : Infinity)
  if (tNext >= END) break
  clock = Math.max(clock, tNext)
  while (Q.length && Q[0].t <= clock) Q.shift().run(clock)
  if (simCalls >= MAX_CALLS) { stopped = clock; log(`${A.label}: safety stop at ${MAX_CALLS} calls, ${fmt(clock)}`); L.push({ t: clock, kind: 'stopped', reason: `maxCalls ${MAX_CALLS}` }); break }
  await resolveWorld(clock) // errands that just started are resolved before anyone looks again
  const due = NAMES.filter((n) => S[n].next <= clock)
  const res = await parallel(due.map((n) => () => ask('persona', turnPrompt(n, clock), TURN, { label: `${A.label} ${n} ${fmt(clock)}`, for: n, head: n, why: [...new Set(S[n].why)].join('; ') })))
  const intents = []
  due.forEach((n, k) => applyTurn(n, res[k], clock, intents))
  let endT = clock; const met = new Set()
  for (const c of pendingCalls.splice(0)) endT = Math.max(endT, await scene(Math.max(clock, c.t), `phone: ${c.from} → ${c.to}`, true, [c.from, c.to], c.from, c.opening))
  for (const x of intents) { const key = [x.from, resolve(x.to, NAMES) || x.to].sort().join('|'); if (met.has(key)) continue; met.add(key); endT = Math.max(endT, await intent(x, clock)) }
  clock = Math.max(clock, endT) // conversations take time
}

// ---------- rendering ----------
const render = (L) => L.filter((e) => !['turn', 'move', 'world'].includes(e.kind)).map((e) =>
  e.kind === 'chat' ? `[${fmt(e.t)}] (${e.to}) ${e.from}: ${e.text}` :
  e.kind === 'dm' ? `[${fmt(e.t)}] ${e.from} → ${e.to}: ${e.text}` :
  e.kind === 'pay' ? `[${fmt(e.t)}] ${e.from} paid ${e.to} ${e.amount}${e.note ? ' (' + e.note + ')' : ''}` :
  e.kind === 'event' ? `[${fmt(e.t)}] * ${e.who}: ${e.text}` :
  e.kind === 'result' ? `[${fmt(e.t)}] ~ ${e.who}: ${e.text}` :
  e.kind === 'missed' ? `[${fmt(e.t)}] ! ${e.who} not at ${e.place} for ${e.what}` :
  e.kind === 'calendar' ? `[${fmt(e.t)}] + ${e.who} put in calendar: ${e.what} at ${fmt(e.at)}` :
  e.kind === 'stopped' ? `[${fmt(e.t)}] (simulation stopped: ${e.reason})` :
  `--- ${e.where}, ${fmt(e.t)}, ${e.minutes ?? 0} min (${e.present.join(', ')}) · ${e.ended} ---\n${sceneText(e.lines) || '(no conversation)'}`).join('\n')
const timelines = (L) => NAMES.map((n) => `## ${n}\n` + L.filter((e) => e.who === n && (e.kind === 'turn' || e.kind === 'move')).map((e) => e.kind === 'move' ? `${fmt(e.t)}   -> ${e.to} (${e.doing})` :
  e.failed ? `${fmt(e.t)} TURN FAILED (${e.why.join('; ')})` : `${fmt(e.t)} [${e.why.join('; ')}] @${e.place}: ${e.doing}${e.kept ? ' (kept plan)' : ''}${e.talk_to ? ' | talk to ' + e.talk_to : ''}${e.call ? ' | ring ' + e.call : ''}\n   memory: ${e.memory.replace(/\s+/g, ' ')}\n   plan: ${e.plan.join(' / ') || '-'}`).join('\n')).join('\n\n')
const worldLog = (L) => L.filter((e) => e.kind === 'world').map((e) => `[${fmt(e.t)}] ${e.decision}${e.blocked ? ' BLOCKED (' + e.blocked + ')' : ''}${e.decision !== 'none' && e.decision !== 'unresolved' ? ` (at ${fmt(e.at)})` : ''} ${e.from ? e.from + ' → ' : ''}${e.who}: ${e.text || ''}\n   item: ${e.item}\n   reason: ${e.reason}`).join('\n')
const transcript = render(L), memories = timelines(L)
const final = Object.fromEntries(NAMES.map((n) => [n, { place: S[n].place, doing: S[n].doing, memory: S[n].memory, turns: S[n].turns, journal: J[n].map((e) => `${fmt(e.t)} ${e.text}`) }]))
const stats = { calls: CALLS.length, simCalls, maxCalls: MAX_CALLS, byFor: CALLS.reduce((m, c) => (m[c.for] = (m[c.for] || 0) + 1, m), {}), sceneLines: CALLS.filter((c) => c.why === 'scene line').length, promptChars: CALLS.reduce((k, c) => k + c.prompt.length, 0), failed: CALLS.filter((c) => c.result == null).length, roleAgent: ROLE_AT, stoppedAt: stopped == null ? null : fmt(stopped) }
log(`${A.label}: ${stats.simCalls} sim calls (${stats.sceneLines} scene lines), ${L.filter((e) => e.kind === 'scene').length} scenes, ${L.filter((e) => e.kind === 'call').length} calls, ${L.filter((e) => e.kind === 'chat' || e.kind === 'dm').length} messages${stopped != null ? ', stopped early' : ''}`)

// ---------- 3. audit (optional; never feeds back into the run) ----------
let audit = null
if (A.audit !== false) {
  phase('Audit')
  const cap = (s, k) => s.length <= k ? s : s.slice(0, k / 2) + `\n[... ${s.length - k} chars omitted ...]\n` + s.slice(-k / 2)
  audit = await call('role', `${roleOf('auditor')}Audit this social simulation for realism with a novelist's eye, as a sceptical reader from this setting.
SETTING: ${SETTING}. WINDOW: ${fmt(0)} to ${fmt(END)}${DATE}${stopped != null ? ` (stopped early at ${fmt(stopped)})` : ''}.
PEOPLE (attributes from census sampling, incl. ethnicity, which the character models were NOT shown; temperament drawn at random; prose by a model):\n${PEOPLE.map((p) => `${p.name} | ${JSON.stringify(p.attributes)} | ${p.temperament}\n  ${p.profile}\n  speech: ${p.speech} | texting: ${p.texting}`).join('\n')}
WORLD: ${W.background}\nCalendar: ${CAL.map((o) => `${o.what} (${o.who.join(', ')} ${fmt(o.t0)}-${fmt(o.t1).slice(4)})`).join(' | ') || 'none sourced'}\nEvents that fired: ${EVENTS.map((e) => `${fmt(e.t)} ${e.who}: ${e.text}`).join(' | ') || 'none (only sourced rates are used)'}
HOW IT WORKS: each person plans their own next hours (errands are part of a plan step and resolve when the step starts) and chooses how often they glance at their phone; they get a turn when their plan runs out, when they glance and something is new, between activities, on waking, on walking into a room with someone in it, and after every conversation. Every call shows the person their own journal of the last hours verbatim plus a memory note they keep. They decide whether to talk, can call over someone in the building, and end conversations themselves. A world role resolves errands, background characters and sourced events, with a reason for each. Money is not tracked (no sourced balances or prices).
TRANSCRIPT:\n${cap(transcript, 90000) || '(nothing)'}
TIMELINES (turns, why, memory, plan):\n${cap(memories, 40000)}
WORLD DECISIONS:\n${cap(worldLog(L), 15000) || '(none)'}
First imagine what a real stretch like this would contain for these people; then compare. Check for stereotyping, including in how others treat them. Point to mechanism causes, not just symptoms, and check each against the logs.`,
    obj({ imagined: arr(str), missing_texture: arr(str), stereotyping: arr(obj({ who: str, quote: str, why: str })), breakers: arr(obj({ quote: str, why: str })), mechanism_issues: arr(str), score: { type: 'integer', description: '1-10 realism' }, verdict: str }),
    { phase: 'Audit', label: `${A.label} audit`, for: 'auditor', model: 'opus', effort: 'high' })
  log(`${A.label}: audit score ${audit?.score ?? '?'} · ${String(audit?.verdict || '').slice(0, 140)}`)
}
return { version: 3, label: A.label, seed: A.seed, args: { ...A, attributes: undefined, sample: undefined }, window: { from: fmt(0), to: fmt(END), hours: HOURS }, world, events: EVENTS.map((e) => `${fmt(e.t)} ${e.who}${e.from ? ' (from ' + e.from + ')' : ''}: ${e.text} [source: ${e.source}]`),
  log: L, transcript, memories, worldLog: worldLog(L), calendar: CAL.map((o) => ({ ...o, at: fmt(o.t0), until: fmt(o.t1) })), final, stats, audit, calls: CALLS, heads: HEADS }

export const meta = {
  name: 'social-sim-v3',
  description: "Social simulation: one agent per person plans its own time, talks or doesn't, ends conversations itself and condenses its own memories; code keeps each person's first-hand journal, the clock, places, calendar, who knows whom, sourced events and full logs; a world role resolves consequences with reasons",
  phases: [{ title: 'Generate' }, { title: 'Simulate' }, { title: 'Audit', model: 'opus' }],
}
// args: { label, setting (a description), dateNote, startDow (0=Mon), startHour, hours, seed, sample: sampler output {setting, people, ...} | attributes: [...],
//         events?: [{text, who, p_per_day, hours?, from?, source}], rules?: [str], audit?: bool, maxCalls?, roleAgent?: 'persona'|'sim' }
// The model makes every judgment. Code keeps facts and logs everything. No real-world figure is guessed: people, households and shift times
// come from the sampler; event rates only from args.events with a source; anything unsourced is left out, not made up.
// Memory: each person's journal (what they saw, heard, said and did) is kept verbatim by code and shown back in every call. When a
// conversation or a day ends, the person condenses it in their own words while the full record is in front of them.
const A = args || {}
const HOURS = A.hours || 24, START_H = A.startHour ?? 8, START_DOW = A.startDow ?? 0, END = HOURS * 60
const OUT = 'elsewhere', MAX_LINES = 40 // runaway backstop for one conversation (logged as ended 'cap')
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
const str = { type: 'string' }, int = { type: 'integer' }, bool = { type: 'boolean' }, arr = (items, x = {}) => ({ type: 'array', items, ...x })
const obj = (props, req = Object.keys(props)) => ({ type: 'object', required: req, properties: props })
// fuzzy name match: exact, case-insensitive, then a unique prefix/containment match ("Priya" -> "Priya at Larch Lettings")
const resolve = (name, pool) => { const q = String(name || '').trim().toLowerCase(); if (!q) return ''
  const hit = pool.find((p) => p.toLowerCase() === q); if (hit) return hit
  const part = pool.filter((p) => p.toLowerCase().startsWith(q) || q.startsWith(p.toLowerCase()) || p.toLowerCase().includes(q)); return part.length === 1 ? part[0] : '' }

// ---------- every model call is logged in order: sim time, who for, why, prompt, result ----------
const CALLS = [], HEADS = {}
let clock = 0, ROLE_AT = A.roleAgent || 'persona' // 'persona' = known-cheap no-tool agent; 'sim' (.claude/agents/sim.md) once loaded
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

// ---------- 1. generate ----------
phase('Generate')
const SAMPLE = A.sample && !Array.isArray(A.sample) ? A.sample : {}
const SETTING = A.setting || SAMPLE.setting || ''
const CONTEXT = Object.fromEntries(Object.entries(SAMPLE).filter(([k]) => !['people', 'n', 'seed', 'setting'].includes(k))) // e.g. area, ties
const ATTR = (A.attributes || SAMPLE.people || (Array.isArray(A.sample) ? A.sample : [])).map((a) => JSON.parse(JSON.stringify(a, (k, v) => k.startsWith('_') ? undefined : v)))
if (!ATTR.length) throw new Error('args.sample (sampler output) or args.attributes is required: people must come from sampled data, never be made up')
// Anything without a source (interests, tastes, way of talking) is written blind to identity: no name, sex, ethnicity, birthplace or religion.
// Given any identity cue, models fill gaps with stereotype (smoke runs: reggae, jerk seasoning, an accent from a name alone). The writer keeps
// the practical facts of a life (age, work, household, health) and the temperament. Ethnicity is also kept from the players; the audit sees it.
const IDENTITY = new Set(['name', 'sex', 'ethnicity', 'birthplace', 'years_in_uk', 'religion'])
const blind = (a) => JSON.parse(JSON.stringify(a, (k, v) => IDENTITY.has(k) ? undefined : v))
const shown = (a) => JSON.parse(JSON.stringify(a, (k, v) => k === 'ethnicity' ? undefined : v))
// temperament drawn by code, independent of everything; low/high = bottom/top quarter of people, so 1/4 each by definition
const TRAITS = ['openness', 'conscientiousness', 'extraversion', 'agreeableness', 'emotional stability']
const TEMPER = ATTR.map(() => TRAITS.map((t) => { const x = rnd(); return `${t} ${x < 0.25 ? 'low' : x < 0.75 ? 'average' : 'high'}` }).join(', '))
const PERSON = obj({ profile: { type: 'string', description: 'second person ("You ..."), 4-6 sentences: your days, how your temperament shows (including the awkward parts), a couple of interests, small current concerns' },
  speech: { type: 'string', description: 'how you talk: register, pace, sentence length, directness, how much you say, what sets you apart. No accent or dialect, no catchphrases.' },
  texting: { type: 'string', description: 'how you text: length, case, punctuation, emoji or none, how fast and reliably you reply' },
  contacts: arr(obj({ relation: str, about: { type: 'string', description: 'one line: who they are to you, how they talk' } }), { maxItems: 4, description: 'people outside your household you are regularly in touch with (friends, colleagues, family not listed in the facts)' }) })
const gen = await parallel(ATTR.map((a, i) => () => call('persona', `${roleOf('character writer')}Write one person for a social simulation set in: ${SETTING}.
FACTS (sampled from census data): ${JSON.stringify(blind(a))}
TEMPERAMENT (drawn at random; low/high = bottom/top quarter of people): ${TEMPER[i]}
Some identity facts are deliberately withheld. Choose interests and tastes as you would for a random person with this age, work, household, health and temperament. No figures, dates or events beyond the facts. Ordinary life: no secrets, crises or plot hooks.`,
  PERSON, { phase: 'Generate', label: `write person ${i + 1}`, for: 'generator' })))
const PEOPLE = ATTR.map((a, i) => { const g = gen[i] || {}; return { name: a.name || `Person ${i + 1}`, attributes: a, temperament: TEMPER[i], profile: g.profile || '', speech: g.speech || '', texting: g.texting || '', contacts: g.contacts || [] } })
const NAMES = PEOPLE.map((p) => p.name), P = Object.fromEntries(PEOPLE.map((p) => [p.name, p]))
const members = (n) => (P[n].attributes.household?.members || P[n].attributes.household?.lives_with || []).filter((m) => m && m.name)

const WORLD = obj({ background: { type: 'string', description: '2-4 sentences of shared context, only what the setting and facts say or plainly imply; no figures' },
  common_knowledge: arr(str, { maxItems: 8, description: 'what these people all know, only from the setting and facts' }),
  know_each_other: arr(arr(str), { description: 'groups of these people who already know each other by name and have each other\'s numbers, only as the setting or facts state (e.g. housemates, friends, coworkers)' }),
  places: arr(obj({ name: str, kind: { type: 'string', enum: ['private', 'shared', 'public'] }, building: { type: 'string', description: 'same label = one building (within earshot); empty for public' }, access: arr(str, { description: 'names who may normally go in; empty = anyone' }) }),
    { description: "each household's home (a private room per person who has one, plus shared rooms), workplaces as the facts describe them, a few generic public places; no brand names" }),
  workplace: arr(obj({ person: str, place: str }), { description: 'for each person who works: which of the places above' }),
  contacts: arr(obj({ name: str, role: str, about: { type: 'string', description: '1 line incl. how they talk' }, linked_to: arr(str), place: { type: 'string', description: 'where they can be met in person, or empty' } }, ['name', 'role', 'about', 'linked_to']),
    { description: 'shared background characters the facts imply (letting agent for renters, a manager for employees)' }),
  contact_names: arr(obj({ person: str, relation: str, name: str }), { description: 'a first name for each person\'s contacts listed below, following naming patterns for that person\'s background and generation' }) })
const W = await call('role', `${roleOf('world builder')}Supply the structure these lives already have. No plot, and never guess data: nothing the setting or facts do not give.
SETTING: ${SETTING}${Object.keys(CONTEXT).length ? `\nSAMPLE CONTEXT: ${JSON.stringify(CONTEXT)}` : ''}
WINDOW: ${fmt(0)} for ${HOURS} hours${DATE}.
PEOPLE:\n${PEOPLE.map((p) => `${p.name}: ${JSON.stringify(shown(p.attributes))}\n  contacts to name: ${p.contacts.map((c) => c.relation).join('; ') || 'none'}`).join('\n')}
Use only these names for the people.`, WORLD, { phase: 'Generate', label: 'build world', for: 'generator' })
if (!W) throw new Error('world generation returned nothing')

// ---------- normalise into hard facts ----------
const PLACES = [...(W.places || []).filter((p) => p.name && p.name !== OUT).map((p) => ({ name: p.name, kind: p.kind || 'public', building: p.building || '', access: (p.access || []).map((n) => resolve(n, NAMES)).filter(Boolean) })), { name: OUT, kind: 'public', building: '', access: [] }]
const PLACE = Object.fromEntries(PLACES.map((p) => [p.name, p]))
const placeOf = (name) => resolve(name, PLACES.map((p) => p.name))
const canGo = (n, pl) => !PLACE[pl].access.length || PLACE[pl].access.includes(n)
const homeOf = (n) => PLACES.find((p) => p.kind === 'private' && p.access.includes(n))?.name || OUT
const CONTACT = {}
const addContact = (name, role, about, linked, place) => { if (!name || NAMES.includes(name)) return; const x = CONTACT[name] ||= { name, role, about, linked: [], place: '' }; for (const n of linked) if (!x.linked.includes(n)) x.linked.push(n); if (place && !x.place) x.place = place }
for (const c of W.contacts || []) addContact(c.name, c.role, c.about || '', (c.linked_to || []).map((n) => resolve(n, NAMES)).filter(Boolean), placeOf(c.place))
for (const p of PEOPLE) {
  for (const m of members(p.name)) addContact(m.name, `${p.name}'s ${m.relation}`, `${m.age ?? ''} ${m.relation}, lives with ${p.name}`.trim(), [p.name], homeOf(p.name) === OUT ? '' : homeOf(p.name)) // sampled household: at home
  for (const c of p.attributes.children || []) if (c.lives !== 'with me') addContact(c.name, `${p.name}'s child`, `${c.age ?? ''}, lives elsewhere`.trim(), [p.name], '')
  for (const c of p.contacts) { const nm = (W.contact_names || []).find((x) => resolve(x.person, NAMES) === p.name && x.relation === c.relation)?.name || c.relation
    addContact(CONTACT[nm] && !CONTACT[nm].linked.includes(p.name) ? `${nm} (${p.name.split(' ')[0]}'s ${c.relation})` : nm, `${p.name}'s ${c.relation}`, c.about || '', [p.name], '') } }
const contactsOf = (n) => Object.values(CONTACT).filter((c) => c.linked.includes(n)).map((c) => c.name)
// who knows whom (by name, with numbers): sampled households plus groups the setting states; everyone else is a stranger until they learn
const KNOW = Object.fromEntries(NAMES.map((n) => [n, new Set()])), NUM = Object.fromEntries(NAMES.map((n) => [n, new Set()]))
const groups = [...(W.know_each_other || []).map((g) => (g || []).map((m) => resolve(m, NAMES)).filter(Boolean)), ...NAMES.map((n) => [n, ...members(n).map((m) => resolve(m.name, NAMES)).filter(Boolean)])]
for (const g of groups) for (const a of g) for (const b of g) if (a !== b) { KNOW[a].add(b); NUM[a].add(b) }
const desc = (m) => { const a = P[m].attributes; return [a.sex, Number.isFinite(+a.age) ? `${Math.floor(a.age / 10) * 10}s` : ''].filter(Boolean).join(', ') || 'someone' }
const label = (v, m) => !NAMES.includes(m) || v === m || KNOW[v].has(m) ? m : `stranger (${desc(m)})`
const CHATS = [] // group chats exist once someone starts one
// calendar: the sampler's structured shifts, at the workplace the world builder assigned
const CAL = []
const addOcc = (what, who, place, t0, t1, by) => { if (t1 > 0 && t0 < END && !Number.isNaN(t0)) CAL.push({ what, who, place: placeOf(place) || OUT, t0, t1, by }) }
for (const p of PEOPLE) for (const s of Array.isArray(p.attributes.shifts) ? p.attributes.shifts : []) for (let d = 0; d < NDAYS; d++) if (DOW[(START_DOW + d) % 7] === s.day) {
  const t0 = atDay(d, s.start); let t1 = atDay(d, s.end); if (t1 <= t0) t1 += 1440
  addOcc('work', [p.name], (W.workplace || []).find((w) => resolve(w.person, NAMES) === p.name)?.place, t0, t1, 'sampler') }
const EVENTS = [], DROPPED = [] // seeded events only from args.events, each with a cited source for its rate
for (const e of A.events || []) { if (!e.source || !(Number(e.p_per_day) >= 0)) { DROPPED.push({ ...e, why: 'event without source or rate' }); continue }
  const who = e.who === 'each' || e.who === 'all' ? NAMES : (Array.isArray(e.who) ? e.who : [e.who]).map((n) => resolve(n, NAMES)).filter(Boolean)
  const [h0, h1] = Array.isArray(e.hours) && e.hours.length === 2 ? e.hours.map(Number) : [0, 24]
  for (let d = 0; d < NDAYS; d++) for (const n of who) if (rnd() < clamp(e.p_per_day, 0, 1)) { const t = atDay(d, '00:00') + Math.floor((h0 + rnd() * Math.max(0, h1 - h0)) * 60); if (t >= 0 && t < END) EVENTS.push({ t, who: n, text: e.text, from: resolve(e.from, Object.keys(CONTACT)), source: e.source }) } }
EVENTS.sort((a, b) => a.t - b.t)
const world = { setting: SETTING, context: CONTEXT, background: W.background, common_knowledge: W.common_knowledge || [], know_each_other: groups, people: PEOPLE, places: PLACES, contacts: Object.values(CONTACT), dropped: DROPPED, events_given: A.events || [] }
log(`${A.label}: ${NAMES.join(', ')} · ${PLACES.length} places · ${CAL.length} shifts · ${EVENTS.length} events · ${Object.keys(CONTACT).length} contacts`)

// ---------- 2. simulate ----------
phase('Simulate')
const RULES = ['You are one real person, not an assistant. You know only what you have seen, been told, or is common knowledge here.',
  'Do things for your own reasons. Nobody is directing a story; most of life is routine.',
  'You are not obliging by default. Your temperament and mood show in what you do: people forget, run late, get irritated, say no, leave messages unanswered, change their minds.',
  'Talk the way you talk and text the way you text, but most of what anyone says is plain. Speech is spoken words in normal sentence case.',
  'Silence, short replies and doing nothing are normal. No speeches, therapy-speak or tidy resolutions.',
  `It is ${fmt(0).slice(0, 3)}${DATE}. You do not know the specifics of this year's TV, sport, charts or news; keep such references general.`, ...(A.rules || [])]
const facts = (a) => Object.entries(shown(a)).filter(([k]) => k !== 'name').map(([k, v]) => `${k}: ${typeof v === 'object' ? JSON.stringify(v) : v}`).join('; ')
for (const p of PEOPLE) HEADS[p.name] = `RULES:\n${list(RULES)}\n\nYOU: ${p.name}. ${facts(p.attributes)}\nTemperament (low/high = bottom/top quarter of people): ${p.temperament}\n${p.profile}\nHOW YOU SPEAK: ${p.speech}\nHOW YOU TEXT: ${p.texting}\n\nWHERE YOU LIVE: ${W.background || ''}\nEVERYONE HERE KNOWS:\n${list(W.common_knowledge || [])}`

const L = [] // the full event log; every entry has t and kind
const S = Object.fromEntries(NAMES.map((n) => [n, { place: homeOf(n), doing: '', asleep: false, phone: 0, plan: [], pv: 0, next: 0, why: ['the simulation starts: decide where you are and what you are doing'], ping: false, last: -1, turns: 0, days: {} }]))
const Q = []; let qs = 0
const at = (t, run) => { Q.push({ t, run, s: qs++ }); Q.sort((a, b) => a.t - b.t || a.s - b.s) }
const drain = () => { while (Q.length && Q[0].t <= clock) Q.shift().run(clock) }
const pendingWorld = [], threads = {} // threads[contact]: recent exchanges with that contact (facts the world role sees)
const thread = (c, line) => { (threads[c] ||= []).push(line); threads[c] = threads[c].slice(-8) }
const MAX_CALLS = A.maxCalls || Math.round(60 + NAMES.length * 150 * HOURS / 24) // runaway backstop only, never pacing
let simCalls = 0, stopped = null
const ask = (kind, prompt, schema, o) => { simCalls++; return call(kind, prompt, schema, o) }

// the journal: first-hand experience, verbatim; conversations and past days are shown in the person's own condensed words once written
const J = Object.fromEntries(NAMES.map((n) => [n, []]))
const jot = (n, t, text, seen = true, extra = {}) => J[n].push({ t, text, seen, ...extra })
function journal(n, now, max) {
  const s = S[n], scenes = J[n].filter((e) => e.ref), latest = scenes[scenes.length - 1], out = []; let size = 0
  const xs = J[n].filter((e) => !s.days[dayOf(e.t)] || !e.seen)
  for (let i = xs.length - 1; i >= 0; i--) { const e = xs[i]
    const text = e.ref && e !== latest ? `${e.head}: ${e.gist || e.text.split('\n').slice(-6).join(' / ')}` : e.text
    const line = `${e.seen ? '' : 'NEW '}${fmt(e.t)} ${text}`
    if (size + line.length > max && e.seen && out.length) { out.push('(earlier entries not shown)'); break } out.push(line); size += line.length }
  const days = Object.entries(s.days).map(([d, g]) => `${DOW[(START_DOW + +d) % 7]} (your summary): ${g}`)
  return [...days, ...out.reverse()].join('\n') || '(nothing yet)'
}
const wake = (n, t, why) => { const s = S[n]; s.why.push(why); s.next = Math.min(s.next, Math.max(t, s.last + 3)) }
// news reaches a person when they would look: at their own chosen phone-check rhythm, between activities, or on waking
function notify(n, t, text, urgent = true) {
  jot(n, t, text, false); if (!urgent) return
  const s = S[n]; s.ping = true; if (s.asleep || !s.phone) return
  wake(n, t + Math.floor(rnd() * s.phone), `looked at your phone (${text.slice(0, 50)})`)
}
const here = (n, pl = S[n].place) => NAMES.filter((m) => m !== n && S[m].place === pl && pl !== OUT)
const moveTo = (n, pl, t, why) => { const s = S[n], from = s.place; if (from === pl) return
  for (const m of here(n, from).filter((m) => !S[m].asleep)) notify(m, t, `${label(m, n)} left ${from}.`, false)
  s.place = pl; L.push({ t, kind: 'move', who: n, from, to: pl, doing: why }); jot(n, t, `you went to ${pl}${why ? ': ' + why : ''}`) }

// ---------- conversations: live processes in the event loop, one line per event, so the world keeps moving while people talk ----------
const ACTIVE = []; let SID = 0
const sceneOf = (n) => ACTIVE.find((sc) => sc.people.includes(n) && !sc.left.has(n))
const sceneText = (lines, v) => lines.map((l) => { const nm = v ? label(v, l.name) : l.name; return l.say ? `${nm}: "${l.say}"${l.do ? ' (' + l.do + ')' : ''}` : `${nm} (${l.do || 'says nothing'})` }).join('\n')
function startScene(t, where, phone, people, starter, opening) {
  const sc = { id: ++SID, t0: t, t, where, phone, people: [...people], starter, lines: [], left: new Set(), done: {}, next: starter, failed: 0 }
  if (opening) { sc.lines.push({ name: starter, say: noEmoji(opening), do: '' }); sc.t += 1; sc.next = people.find((x) => x !== starter) }
  ACTIVE.push(sc); return sc
}
function release(sc, n, t, ended) { // a person leaves a conversation: it goes into their journal, and they decide what next
  if (!NAMES.includes(n)) return
  if (ended === 'not answered') { if (n === sc.starter) { jot(n, t, `you rang ${sc.people.find((x) => x !== n)}; no answer`); wake(n, t, 'no answer') } else notify(n, t, `Missed call from ${label(n, sc.starter)}.`, false); return }
  const head = `${sc.phone ? 'call' : 'conversation at ' + sc.where} with ${sc.people.filter((x) => x !== n).map((m) => label(n, m)).join(', ')} [ref ${fmt(sc.t0).slice(4)}]`
  jot(n, t, `${head}:\n${sceneText(sc.lines, n)}`, true, { ref: fmt(sc.t0).slice(4), head })
  wake(n, t, 'after the conversation')
}
function endScene(sc, ended) {
  ACTIVE.splice(ACTIVE.indexOf(sc), 1)
  const t = Math.ceil(sc.t), ps = sc.people.filter((x) => NAMES.includes(x))
  if (ended === 'not answered') sc.lines.length = 0
  L.push({ t: sc.t0, kind: sc.phone ? 'call' : 'scene', where: sc.where, present: sc.people, lines: sc.lines, minutes: t - sc.t0, ended, answered: ended !== 'not answered', ...(sc.failed ? { failed: sc.failed } : {}) })
  for (const m of ps) if (sc.lines.some((l) => l.say.toLowerCase().includes(m.split(' ')[0].toLowerCase()))) for (const v of ps) KNOW[v].add(m) // names said aloud are learned
  if (sc.phone && ps.length === 2 && ended !== 'not answered') for (const v of ps) NUM[v].add(ps.find((x) => x !== v))
  for (const n of sc.people) if (!sc.left.has(n)) release(sc, n, t, ended)
  for (const c of sc.people.filter((x) => CONTACT[x])) { thread(c, `${fmt(sc.t0)} ${sc.phone ? 'call' : 'met'} with ${sc.people.filter((x) => x !== c).join(', ')}: ${ended === 'not answered' ? '(not answered)' : sc.lines.map((l) => `${l.name}: ${l.say || '(' + l.do + ')'}`).join(' / ').slice(0, 600)}`)
    if (ended === 'not answered' && NAMES.includes(sc.starter)) pendingWorld.push({ kind: 'missed call', who: sc.starter, from: c, text: `${sc.starter} rang ${c}; ${c} did not pick up` }) }
}
const SAY = obj({ say: { type: 'string', description: 'words said out loud, or empty' }, do: { type: 'string', description: 'brief action, or empty' },
  to: { type: 'string', description: 'who you are speaking to (a name, or "everyone")' }, minutes: { type: 'integer', description: 'roughly how many minutes this bit takes, talk and action together' },
  call_over: { type: 'string', description: 'someone NOT here whom you call, shout or knock for now; else empty' },
  leave: { type: 'boolean', description: 'you walk off / hang up after this' }, done: { type: 'boolean', description: 'you would be happy to stop talking now (you can stay where you are)' } }, ['say', 'do', 'to', 'minutes', 'leave', 'done'])
const HEAR = obj({ come: { type: 'boolean', description: 'you go to them' }, say: { type: 'string', description: 'anything you call back, or empty' } })
const personaCtx = (n, now, max) => `YOUR JOURNAL (what you saw, heard, said and did):\n${journal(n, now, max)}\nYOUR PLAN: ${planView(n, now).slice(0, 2).join(' / ') || '(none)'}\n\n`
async function sceneLine(sc) {
  const speaker = sc.next, now = sc.t, live = () => sc.people.filter((x) => !sc.left.has(x)), others = live().filter((x) => x !== speaker)
  const ringing = sc.phone && speaker !== sc.starter && !sc.lines.some((l) => l.name === speaker), me = NAMES.includes(speaker)
  const soFar = (sc.lines.length > 20 ? `(${sc.lines.length - 20} earlier lines)\n` : '') + (sceneText(sc.lines.slice(-20), me && speaker) || '(nothing yet: you start)')
  const who = sc.phone ? `ON THE LINE: ${others.map((m) => me ? label(speaker, m) : m).join(', ')}.` : `ONLY THESE PEOPLE ARE HERE: ${others.map((m) => `${me ? label(speaker, m) : m} (${NAMES.includes(m) ? S[m].doing : CONTACT[m].role})`).join(', ')}. Nobody else is here unless it shows below.`
  const r = CONTACT[speaker]
    ? await ask('role', `${roleOf('world, voicing one background character')}${speaker} (${CONTACT[speaker].role}): ${CONTACT[speaker].about}\nTheir recent contact with these people:\n${list((threads[speaker] || []).slice(-5))}\nSetting: ${SETTING}. It is ${fmt(now)}. ${sc.phone ? 'On the phone.' : `At ${sc.where}.`} ${who}${ringing ? ` ${speaker}'s phone is ringing (${sc.starter}); they may not pick up (leave=true, say nothing).` : ''}\nSO FAR:\n${soFar}\nWhat does ${speaker} say or do? Brief and ordinary. Don't state figures you would have to guess.`, SAY, { label: `${A.label} ${speaker} @${sc.where}`, for: speaker, why: 'scene line' })
    : await ask('persona', `${personaCtx(speaker, now, 3000)}IT IS ${fmt(now)}. ${sc.phone ? `You are ON THE PHONE (you are at ${S[speaker].place}).` : `You are at ${sc.where}.`} ${who}${ringing ? `\nYOUR PHONE IS RINGING: ${NUM[speaker].has(sc.starter) || CONTACT[sc.starter] ? sc.starter : 'a number you do not have saved'}. Answer (say something) or let it ring (leave=true, say nothing).` : ''}
THIS CONVERSATION SO FAR${now - sc.t0 >= 1 ? ` (${Math.round(now - sc.t0)} min in)` : ''}:\n${soFar}
Your turn. Your journal shows what you have already said and done. You can say nothing, carry on with what you were doing, call someone over, or ${sc.phone ? 'hang up' : 'leave'}.`, SAY, { label: `${A.label} ${speaker} @${sc.where}`, for: speaker, head: speaker, why: 'scene line' })
  if (ringing && (!r || (r.leave && !String(r.say || '').trim()))) return endScene(sc, 'not answered')
  if (r) sc.lines.push({ name: speaker, say: noEmoji(r.say), do: noEmoji(r.do) }); else sc.failed++
  sc.t += Math.max(0.5, clamp(r?.minutes, 0, 30))
  sc.done[speaker] = !r || !!r.done || !!r.leave
  if (r?.leave) { sc.left.add(speaker); release(sc, speaker, Math.ceil(sc.t), 'left') }
  const x = r?.call_over && !sc.phone ? resolve(r.call_over, NAMES.filter((k) => !live().includes(k) && (!me || KNOW[speaker].has(k)))) : ''
  if (r?.call_over && !sc.phone && !resolve(r.call_over, live())) { // the person called for decides for themselves
    const reach = x && !sceneOf(x) && !S[x].asleep && PLACE[S[x].place]?.building && PLACE[S[x].place].building === PLACE[sc.where]?.building
    const h = reach ? await ask('persona', `${personaCtx(x, sc.t, 1500)}IT IS ${fmt(sc.t)}. You are at ${S[x].place}${S[x].doing ? ', ' + S[x].doing : ''}. You hear ${label(x, speaker)} calling for you from ${sc.where}${r.say ? `: "${noEmoji(r.say)}"` : ''}. Do you go? You can also call something back, or ignore it.`, HEAR, { label: `${A.label} ${x} hears ${speaker}`, for: x, head: x, why: 'called over' }) : null
    if (h?.come) { moveTo(x, sc.where, Math.ceil(sc.t), 'called over by ' + speaker); join(sc, x, noEmoji(h.say)) }
    else sc.lines.push(h && String(h.say || '').trim() ? { name: x, say: noEmoji(h.say), do: `from ${S[x].place}` } : { name: '—', say: '', do: `no answer from ${r.call_over}` })
  }
  const l2 = live(); if (l2.length < 2) return endScene(sc, sc.phone ? 'hung up' : 'walked off')
  if (sc.lines.length >= MAX_LINES) return endScene(sc, 'cap')
  const last = sc.lines[sc.lines.length - 1].name, addressed = r && resolve(r.to, l2.filter((m) => m !== speaker && m !== last))
  const order = l2.filter((m) => m !== speaker && m !== last).sort((a, b) => sc.lines.map((l) => l.name).lastIndexOf(a) - sc.lines.map((l) => l.name).lastIndexOf(b))
  sc.next = addressed || order.find((m) => !sc.done[m])
  if (!sc.next) endScene(sc, 'talk ran out')
}
function join(sc, n, say) { sc.people.push(n); sc.done[n] = false; S[n].doing = 'with ' + sc.people.filter((m) => m !== n && !sc.left.has(m)).join(', '); sc.lines.push({ name: n, say: say || '', do: 'comes in' }) }

// ---------- plans: the person's own; code carries them out, and pauses them while the person is in a conversation ----------
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
  if (sceneOf(n)) return // mid-conversation: the plan resumes when they come out of it (syncToPlan)
  const s = S[n], wasAsleep = s.asleep, moved = s.place !== st.place
  moveTo(n, st.place, clock, st.doing)
  Object.assign(s, { doing: st.doing, asleep: st.asleep, phone: st.phone })
  if (st.action && !st.sent) { st.sent = true; pendingWorld.push({ kind: 'action', who: n, step: st, text: `${n} at ${st.place}, ${fmt(clock)}-${fmt(st.t1)}: ${st.action}` }) } // errands happen where and when the step happens
  if (s.asleep) return
  const live = !st.asleep && ACTIVE.find((sc) => !sc.phone && sc.where === s.place)
  if (live) return join(live, n, '') // walked in on a conversation
  if (s.ping && (wasAsleep || i > 0)) wake(n, clock, wasAsleep ? 'you woke up' : 'between things, you checked your phone')
  const others = here(n).filter((m) => !S[m].asleep)
  if (moved && others.length) { wake(n, clock, `you came into ${s.place}: ${others.map((m) => label(n, m)).join(', ')} here`); for (const m of others) notify(m, clock, `${label(m, n)} came into ${s.place}.`, false) }
}
const syncToPlan = (n) => { const i = S[n].plan.findIndex((p) => p.t0 <= clock && clock < p.t1); if (i >= 0) startStep(n, S[n].plan[i], i) }

// ---------- outside world: sourced events, calendar ----------
for (const e of EVENTS) at(e.t, (t) => { if (e.from) pendingWorld.push({ kind: 'gets in touch', from: e.from, who: e.who, text: e.text }); else { L.push({ t, kind: 'event', who: e.who, text: e.text, source: e.source }); notify(e.who, t, e.text) } })
const watchOcc = (o) => { if (o.place !== OUT && o.t0 + 15 < END && o.t0 + 15 >= 0) at(o.t0 + 15, (t) => { for (const n of o.who) if (S[n].place !== o.place) { L.push({ t, kind: 'missed', who: n, what: o.what, place: o.place }); pendingWorld.push({ kind: 'not there', who: n, text: `${n} is not at ${o.place} for "${o.what}" (due ${fmt(o.t0)}); they are at ${S[n].place}` }) } }) }
CAL.forEach(watchOcc)

// ---------- turns ----------
const calView = (n, now) => CAL.filter((o) => o.who.includes(n) && o.t1 > now && o.t0 < now + 1440).sort((a, b) => a.t0 - b.t0).map((o) => `${fmt(o.t0)}-${fmt(o.t1).slice(4)} ${o.what}${o.place !== OUT ? ' @' + o.place : ''}`)
const planView = (n, now) => S[n].plan.filter((p) => p.t1 > now && !p.auto).map((p) => `until ${fmt(p.t1)}: ${p.doing} @${p.place}${p.asleep ? ' (asleep)' : ''}${p.action ? ` [errand: ${p.action}${p.result ? ' -> DONE: ' + p.result : p.sent ? ' (under way)' : ''}]` : ''}`)
const atPlace = (pl) => pl === OUT ? [] : Object.values(CONTACT).filter((c) => c.place === pl).map((c) => c.name)
const hereView = (n, pl = S[n].place) => [...here(n, pl).map((m) => `${label(n, m)} (${S[m].asleep ? 'asleep' : S[m].doing})`), ...atPlace(pl).map((c) => `${c} (${CONTACT[c].role})`)].join(', ') || 'nobody'
const phoneBook = (n) => NAMES.filter((m) => m !== n && NUM[n].has(m))
const TURN = obj({ keep_plan: { type: 'boolean', description: 'true if your current plan still stands (then plan may be empty)' },
  plan: arr(obj({ until: { type: 'string', description: 'HH:MM clock time this step lasts until' }, place: str, doing: { type: 'string', description: 'a few words' }, asleep: bool,
    phone_minutes: { type: 'integer', description: 'how often you would glance at your phone during this (0 = not at all)' },
    action: { type: 'string', description: 'an errand done in this step that depends on the outside world (buy, book, order, ask, check an app); it happens when the step starts, at its place. Else empty.' } }, ['until', 'place', 'doing', 'phone_minutes']),
    { maxItems: 8, description: 'your next few hours (up to ~16h) as consecutive steps from now, sleep included' }),
  talk_to: { type: 'string', description: 'someone here or in the same building you go and speak to NOW; else empty' },
  call: { type: 'string', description: 'ring someone NOW; else empty' },
  messages: arr(obj({ to: { type: 'string', description: 'a person, contact or group; several names separated by commas start a group' }, text: str }), { maxItems: 3, description: 'sent NOW. Anything for later belongs in a plan step.' }),
  arrange: arr(obj({ what: str, day: { type: 'string', enum: DOW }, time: { type: 'string', description: 'HH:MM' }, minutes: int, place: str }, ['what', 'day', 'time']), { maxItems: 2, description: 'something agreed or booked: goes in your calendar' }) }, ['keep_plan'])
const turnSchema = (n, now) => { const open = J[n].filter((e) => e.ref && !e.gist), past = dayOf(now) - 1, needDay = past >= 0 && !S[n].days[past] && J[n].some((e) => dayOf(e.t) === past)
  return !open.length && !needDay ? TURN : obj({ ...TURN.properties,
    ...(open.length ? { gists: arr(obj({ ref: str, gist: { type: 'string', description: 'one or two lines in your own words: what was said, agreed or found out that you would remember' } }), { description: `one per conversation ref: ${open.map((e) => e.ref).join(', ')}` }) } : {}),
    ...(needDay ? { day: { type: 'string', description: `${DOW[(START_DOW + past) % 7]} is over: 2-4 lines in your own words on what happened that you would remember (things that happened, not plans)` } } : {}) }, ['keep_plan', ...(open.length ? ['gists'] : []), ...(needDay ? ['day'] : [])]) }
const turnPrompt = (n, now) => { const s = S[n]
  return `IT IS NOW ${fmt(now)}. WHY NOW: ${[...new Set(s.why)].join('; ')}.
YOUR JOURNAL (what you saw, heard, said and did; NEW = not seen yet):\n${journal(n, now, 6000)}
WHERE YOU ARE: ${s.place}${s.doing ? ', ' + s.doing : ''}${s.asleep ? ' (asleep until now)' : ''}. HERE: ${hereView(n)}.
YOUR PLAN (as you left it):\n${list(planView(n, now))}
CALENDAR (next 24h):\n${list(calView(n, now))}
PLACES: ${PLACES.filter((p) => canGo(n, p.name)).map((p) => p.name).join(' | ')}
PHONE: people ${phoneBook(n).join(', ') || 'none'}; contacts ${contactsOf(n).join(', ') || 'none'}; groups ${CHATS.filter((c) => c.members.includes(n)).map((c) => c.name).join(', ') || 'none'}.
What do you do now? Your journal shows what you have already said and done. Most moments change little.` }

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
function applyTurn(n, r, now) {
  const s = S[n], why = [...new Set(s.why)]; s.last = now; s.next = Infinity; s.why = []; s.turns++
  if (!r) { L.push({ t: now, kind: 'turn', who: n, why, failed: true }); s.why = why; s.next = now + 30; return } // unseen journal stays NEW for the retry
  const seen = J[n].filter((e) => !e.seen).map((e) => `${fmt(e.t)} ${e.text}`); for (const e of J[n]) e.seen = true; s.ping = false
  for (const g of r.gists || []) { const e = J[n].find((e) => e.ref && !e.gist && e.ref === String(g.ref || '').trim()) || J[n].find((e) => e.ref && !e.gist); if (e && g.gist) e.gist = noEmoji(g.gist) }
  if (r.day && dayOf(now) > 0) s.days[dayOf(now) - 1] = noEmoji(r.day)
  if (r.keep_plan && s.plan.some((p) => p.t1 > now && !p.auto) && !(r.plan || []).length) syncToPlan(n); else setPlan(n, r.plan, now)
  for (const m of r.messages || []) send(n, m.to, m.text, now)
  for (const a of r.arrange || []) { if (!DOW.includes(a.day)) continue
    let d = dayOf(now); while (DOW[(START_DOW + d) % 7] !== a.day) d++; let t0 = atDay(d, a.time); if (Number.isNaN(t0)) continue; if (t0 < now) t0 += 7 * 1440
    if (t0 < END) { addOcc(a.what, [n], a.place, t0, t0 + clamp(a.minutes || 60, 5, 720), n); const o = CAL[CAL.length - 1]; L.push({ t: now, kind: 'calendar', who: n, what: o.what, at: o.t0, place: o.place }); jot(n, now, `you put in your calendar: ${o.what} at ${fmt(o.t0)}`); watchOcc(o) } }
  L.push({ t: now, kind: 'turn', who: n, why, seen, place: s.place, doing: s.doing, plan: planView(n, now), kept: !!r.keep_plan, talk_to: r.talk_to || '', call: r.call || '', messages: (r.messages || []).length, gists: (r.gists || []).map((g) => g.gist), day: r.day || '' })
  return [r.call && { kind: 'call', to: r.call }, r.talk_to && { kind: 'talk', to: r.talk_to }].filter(Boolean)
}
function intend(n, x, now) {
  if (sceneOf(n)) return
  const s = S[n]
  if (x.kind === 'call') {
    const p = resolve(x.to, phoneBook(n)), c = p ? '' : resolve(x.to, contactsOf(n))
    if (!p && !c) return notify(n, now, `You can't ring "${x.to}": no number for them.`, false)
    if (p && (S[p].asleep || sceneOf(p))) { L.push({ t: now, kind: 'call', where: `phone: ${n} → ${p}`, present: [n, p], lines: [], ended: S[p].asleep ? 'asleep, not answered' : 'busy, not answered', answered: false }); NUM[p].add(n); notify(p, now, `Missed call from ${n}.`); jot(n, now, `you rang ${p}; no answer`); return }
    return startScene(now, `phone: ${n} → ${p || c}`, true, [n, p || c], n)
  }
  const byLabel = Object.fromEntries(NAMES.filter((m) => m !== n).map((m) => [label(n, m), m]))
  const p = byLabel[resolve(x.to, Object.keys(byLabel))] || '', c = p ? '' : resolve(x.to, atPlace(s.place))
  if (c) return startScene(now, s.place, false, [n, c], n)
  const near = p && S[p].place !== OUT && (S[p].place === s.place || (PLACE[s.place].building && PLACE[s.place].building === PLACE[S[p].place].building && KNOW[n].has(p)))
  if (!near) return notify(n, now, `${x.to} isn't around here.`, false)
  if (S[p].asleep) return notify(n, now, `${label(n, p)} seems to be asleep.`, false)
  const pl = S[p].place; moveTo(n, pl, now, `to talk to ${label(n, p)}`)
  const live = ACTIVE.find((sc) => !sc.phone && sc.where === pl)
  if (live) return join(live, n, '')
  startScene(now, pl, false, [n, ...NAMES.filter((m) => m !== n && S[m].place === pl && !S[m].asleep && !sceneOf(m))], n)
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
  const got = new Set(), finish = (it, text) => { if (it?.step && !it.step.result) it.step.result = text }
  for (const d of r?.decisions || []) {
    const it = items[(d.item | 0) - 1], who = resolve(d.who, NAMES) || it?.who; if (!who) continue; got.add(it)
    const t = now + clamp(d.delay_minutes || 0, 0, 2880), from = resolve(d.from, Object.keys(CONTACT)) || it?.from
    L.push({ t: now, kind: 'world', item: it?.text || '', decision: d.kind, who, from: from || '', text: d.text, at: t, reason: d.reason })
    if (d.kind === 'none') { finish(it, d.text || 'nothing came of it'); continue }
    if (d.kind !== 'result' && !(from && CONTACT[from].linked.includes(who))) { L[L.length - 1].blocked = `${from || '(no contact)'} has no number for ${who}`; continue }
    if (t >= END) continue
    if (d.kind === 'result') at(t, (tt) => { finish(it, d.text); L.push({ t: tt, kind: 'result', who, text: d.text }); notify(who, tt, d.text) })
    else at(t, (tt) => { thread(from, `${fmt(tt)} ${from} → ${who}: ${d.text}`)
      if (d.kind === 'text') { L.push({ t: tt, kind: 'dm', from, to: who, text: d.text }); notify(who, tt, `${from} texted: ${d.text}`) }
      else if (S[who].asleep || sceneOf(who)) { L.push({ t: tt, kind: 'call', where: `phone: ${from} → ${who}`, present: [from, who], lines: [], ended: 'not answered', answered: false }); notify(who, tt, `Missed call from ${from}.`) }
      else startScene(tt, `phone: ${from} → ${who}`, true, [from, who], from, d.text) })
  }
  for (const it of items) if (!got.has(it)) { L.push({ t: now, kind: 'world', item: it.text, decision: 'unresolved', who: it.who, reason: r ? 'no decision returned' : 'world call failed' }); finish(it, 'nothing came of it') }
}

// ---------- main loop: jump to the next thing that happens (a turn, a scheduled event, a line in a conversation); quiet time costs nothing ----------
while (true) {
  const tNext = Math.min(...NAMES.filter((n) => !sceneOf(n)).map((n) => S[n].next), Q.length ? Q[0].t : Infinity, ...ACTIVE.map((sc) => sc.t))
  if (tNext >= END) break
  clock = Math.max(clock, tNext)
  drain(); await resolveWorld(clock); drain() // errands that just started are resolved, and due results delivered, before anyone looks again
  if (simCalls >= MAX_CALLS) { stopped = clock; log(`${A.label}: safety stop at ${MAX_CALLS} calls, ${fmt(clock)}`); L.push({ t: clock, kind: 'stopped', reason: `maxCalls ${MAX_CALLS}` }); break }
  const sc = ACTIVE.find((x) => x.t <= clock)
  if (sc) { await sceneLine(sc); continue }
  const due = NAMES.filter((n) => S[n].next <= clock && !sceneOf(n))
  const res = await parallel(due.map((n) => () => ask('persona', turnPrompt(n, clock), turnSchema(n, clock), { label: `${A.label} ${n} ${fmt(clock)}`, for: n, head: n, why: [...new Set(S[n].why)].join('; ') })))
  const intents = due.map((n, k) => applyTurn(n, res[k], clock) || [])
  due.forEach((n, k) => intents[k].forEach((x) => intend(n, x, clock)))
}
for (const sc of [...ACTIVE]) endScene(sc, 'window ended')

// ---------- rendering ----------
const render = (L) => L.filter((e) => !['turn', 'move', 'world'].includes(e.kind)).sort((a, b) => a.t - b.t).map((e) =>
  e.kind === 'chat' ? `[${fmt(e.t)}] (${e.to}) ${e.from}: ${e.text}` :
  e.kind === 'dm' ? `[${fmt(e.t)}] ${e.from} → ${e.to}: ${e.text}` :
  e.kind === 'event' ? `[${fmt(e.t)}] * ${e.who}: ${e.text}` :
  e.kind === 'result' ? `[${fmt(e.t)}] ~ ${e.who}: ${e.text}` :
  e.kind === 'missed' ? `[${fmt(e.t)}] ! ${e.who} not at ${e.place} for ${e.what}` :
  e.kind === 'calendar' ? `[${fmt(e.t)}] + ${e.who} put in calendar: ${e.what} at ${fmt(e.at)}` :
  e.kind === 'stopped' ? `[${fmt(e.t)}] (simulation stopped: ${e.reason})` :
  `--- ${e.where}, ${fmt(e.t)}, ${e.minutes ?? 0} min (${e.present.join(', ')}) · ${e.ended} ---\n${sceneText(e.lines) || '(no conversation)'}`).join('\n')
const timelines = (L) => NAMES.map((n) => `## ${n}\n` + L.filter((e) => e.who === n && (e.kind === 'turn' || e.kind === 'move')).map((e) => e.kind === 'move' ? `${fmt(e.t)}   -> ${e.to} (${e.doing})` :
  e.failed ? `${fmt(e.t)} TURN FAILED (${e.why.join('; ')})` : `${fmt(e.t)} [${e.why.join('; ')}] @${e.place}: ${e.doing}${e.kept ? ' (kept plan)' : ''}${e.talk_to ? ' | talk to ' + e.talk_to : ''}${e.call ? ' | ring ' + e.call : ''}${e.gists.length ? '\n   remembers: ' + e.gists.join(' | ') : ''}${e.day ? '\n   the day: ' + e.day : ''}\n   plan: ${e.plan.join(' / ') || '-'}`).join('\n')).join('\n\n')
const worldLog = (L) => L.filter((e) => e.kind === 'world').map((e) => `[${fmt(e.t)}] ${e.decision}${e.blocked ? ' BLOCKED (' + e.blocked + ')' : ''}${e.decision !== 'none' && e.decision !== 'unresolved' ? ` (at ${fmt(e.at)})` : ''} ${e.from ? e.from + ' → ' : ''}${e.who}: ${e.text || ''}\n   item: ${e.item}\n   reason: ${e.reason}`).join('\n')
const transcript = render(L), memories = timelines(L)
const final = Object.fromEntries(NAMES.map((n) => [n, { place: S[n].place, doing: S[n].doing, turns: S[n].turns, days: S[n].days, journal: J[n].map((e) => `${fmt(e.t)} ${e.gist ? e.head + ': ' + e.gist : e.text}`) }]))
const stats = { calls: CALLS.length, simCalls, maxCalls: MAX_CALLS, byFor: CALLS.reduce((m, c) => (m[c.for] = (m[c.for] || 0) + 1, m), {}), sceneLines: CALLS.filter((c) => c.why === 'scene line').length, promptChars: CALLS.reduce((k, c) => k + c.prompt.length, 0), failed: CALLS.filter((c) => c.result == null).length, roleAgent: ROLE_AT, stoppedAt: stopped == null ? null : fmt(stopped) }
log(`${A.label}: ${stats.simCalls} sim calls (${stats.sceneLines} scene lines), ${L.filter((e) => e.kind === 'scene').length} scenes, ${L.filter((e) => e.kind === 'call').length} calls, ${L.filter((e) => e.kind === 'chat' || e.kind === 'dm').length} messages${stopped != null ? ', stopped early' : ''}`)

// ---------- 3. audit (optional; never feeds back into the run) ----------
let audit = null
if (A.audit !== false) {
  phase('Audit')
  const cap = (s, k) => s.length <= k ? s : s.slice(0, k / 2) + `\n[... ${s.length - k} chars omitted ...]\n` + s.slice(-k / 2)
  audit = await call('role', `${roleOf('auditor')}Audit this social simulation for realism with a novelist's eye, as a sceptical reader from this setting.
SETTING: ${SETTING}. WINDOW: ${fmt(0)} to ${fmt(END)}${DATE}${stopped != null ? ` (stopped early at ${fmt(stopped)})` : ''}.
PEOPLE (sampled attributes incl. ethnicity; the character writer saw none of name, sex, ethnicity, birthplace, religion; players were not shown ethnicity; temperament drawn at random):\n${PEOPLE.map((p) => `${p.name} | ${JSON.stringify(p.attributes)} | ${p.temperament}\n  ${p.profile}\n  speech: ${p.speech} | texting: ${p.texting}`).join('\n')}
WORLD: ${W.background}\nShifts: ${CAL.filter((o) => o.by === 'sampler').map((o) => `${o.who[0]} ${fmt(o.t0)}-${fmt(o.t1).slice(4)}`).join(' | ') || 'none'}\nEvents that fired: ${EVENTS.map((e) => `${fmt(e.t)} ${e.who}: ${e.text}`).join(' | ') || 'none (only sourced rates are used)'}
HOW IT WORKS: each person plans their own next hours (errands belong to a plan step and resolve when it starts) and chooses how often they glance at their phone; they get a turn when their plan runs out, when they glance and something is new, between activities, on waking, on walking into a room with someone in it, and after every conversation. Every call shows the person their own journal verbatim; they condense each conversation and each day in their own words when it ends. Conversations run inside the clock line by line; people can walk in, be called over, or leave. A world role resolves errands, background characters and sourced events, with a reason for each. Money is not tracked (no sourced balances or prices).
TRANSCRIPT:\n${cap(transcript, 90000) || '(nothing)'}
TIMELINES (turns, why, what they chose to remember, plan):\n${cap(memories, 40000)}
WORLD DECISIONS:\n${cap(worldLog(L), 15000) || '(none)'}
First imagine what a real stretch like this would contain for these people; then compare. Check for stereotyping, including in how others treat them. Point to mechanism causes, not just symptoms, and check each against the logs.`,
    obj({ imagined: arr(str), missing_texture: arr(str), stereotyping: arr(obj({ who: str, quote: str, why: str })), breakers: arr(obj({ quote: str, why: str })), mechanism_issues: arr(str), score: { type: 'integer', description: '1-10 realism' }, verdict: str }),
    { phase: 'Audit', label: `${A.label} audit`, for: 'auditor', model: 'opus', effort: 'high' })
  log(`${A.label}: audit score ${audit?.score ?? '?'} · ${String(audit?.verdict || '').slice(0, 140)}`)
}
return { version: 3, label: A.label, seed: A.seed, args: { ...A, attributes: undefined, sample: undefined }, window: { from: fmt(0), to: fmt(END), hours: HOURS }, world, events: EVENTS.map((e) => `${fmt(e.t)} ${e.who}${e.from ? ' (from ' + e.from + ')' : ''}: ${e.text} [source: ${e.source}]`),
  log: L, transcript, memories, worldLog: worldLog(L), calendar: CAL.map((o) => ({ ...o, at: fmt(o.t0), until: fmt(o.t1) })), final, stats, audit, calls: CALLS, heads: HEADS }

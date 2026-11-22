export const meta = {
  name: 'social-sim-iterate',
  description: 'Generate ordinary people for a realistic UK setting, simulate them as separate persona agents (event-driven), audit realism, revise general rules, repeat',
  phases: [{ title: 'Generate' }, { title: 'Simulate' }, { title: 'Audit' }],
}
const A = args
// ---------- seeded RNG (Math.random is unavailable) ----------
let seed = A.seed >>> 0 || 1
const rnd = () => { seed = (seed + 0x6D2B79F5) >>> 0; let t = seed; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296 }
const DOW = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']
const END = A.hours * 60
const fmt = (m) => { const h = A.startHour * 60 + m, d = Math.floor(h / 1440), r = h % 1440; return `${DOW[(A.startDow + d) % 7]} ${String(Math.floor(r / 60)).padStart(2, '0')}:${String(r % 60).padStart(2, '0')}` }
const P = { agentType: 'persona' }

// ---------- 1. generate people (once) ----------
phase('Generate')
const GEN = { type: 'object', required: ['people', 'places', 'chats', 'background'], properties: {
  background: { type: 'string', description: 'shared facts everyone would know (place, recent shared history), 3-6 sentences, ordinary' },
  places: { type: 'array', items: { type: 'string' }, description: 'shared physical places where they can bump into each other (rooms, venues)' },
  chats: { type: 'array', items: { type: 'object', required: ['name', 'members'], properties: { name: { type: 'string' }, members: { type: 'array', items: { type: 'string' } } } } },
  people: { type: 'array', items: { type: 'object', required: ['name', 'persona', 'routine', 'money', 'start_place', 'first_check_minutes', 'commutes', 'employed'], properties: {
    name: { type: 'string' }, persona: { type: 'string', description: '5-8 sentences: age, background, job/income, household, personality, how they text, what they currently care about. Ordinary, no planted secrets or crises.' },
    routine: { type: 'string', description: 'their usual schedule this week (work hours, regular commitments)' },
    money: { type: 'number', description: 'current bank balance in £, realistic for them' },
    start_place: { type: 'string' }, first_check_minutes: { type: 'integer' }, commutes: { type: 'boolean' }, employed: { type: 'boolean' } } } },
} }
const world = await agent(`Create the people for a realistic social simulation. Setting: ${A.setting}
Start: ${fmt(0)} (${A.dateNote}). Make ${A.n} people.
Draw them from realistic UK base rates for this setting (age, ethnicity, jobs, incomes, household types, relationship status, health). Make them ordinary and varied, not types. Do NOT plant secrets, crises, affairs, debts or plot hooks unless base rates make one genuinely likely for that person. Give normal ongoing life: work, money, relationships, small concerns. Places must include at least one shared place; chats are group chats that would realistically exist (with members). first_check_minutes is when they'd first look at their phone/act after the start.`, { ...P, phase: 'Generate', label: 'generate people', schema: GEN })
const NAMES = world.people.map((p) => p.name)
const PEOPLE = Object.fromEntries(world.people.map((p) => [p.name, p]))
log(`${A.label}: ${NAMES.join(', ')} · places: ${world.places.join(', ')}`)

// ---------- base-rate life events (rolled per person per day) ----------
const EVENTS = [
  { p: 0.007, text: 'You are coming down with a cold: sore throat, tired.' },
  { p: 0.10, need: 'commutes', text: 'Your commute was disrupted today: delays, a cancelled train or bus.' },
  { p: 0.07, need: 'employed', text: 'Work ran late today, about an hour over.' },
  { p: 0.12, text: 'A family member phoned you for a catch-up.' },
  { p: 0.02, text: 'An unexpected expense came up today (around £40-£120).' },
  { p: 0.06, text: 'A friend outside this group messaged suggesting meeting up this week.' },
  { p: 0.04, text: 'You slept badly last night.' },
]
const lifeEvents = []
for (let d = 0; d * 24 < A.hours; d++) for (const n of NAMES) for (const e of EVENTS) {
  if (e.need && !PEOPLE[n][e.need]) continue
  if (rnd() < e.p) lifeEvents.push({ t: d * 1440 + Math.floor((8 + rnd() * 12) * 60) - A.startHour * 60, who: n, text: e.text })
}
const hh = A.householdFault ? (rnd() < 0.003 * A.hours / 24 * 3 ? [{ t: Math.floor(rnd() * END), who: 'all', text: A.householdFault }] : []) : []
const allEvents = [...lifeEvents.filter((e) => e.t >= 0 && e.t < END), ...hh]

// ---------- schemas ----------
const PLACES = [...world.places, 'elsewhere', 'asleep']
const CHATS = world.chats.map((c) => c.name)
const DECIDE = { type: 'object', required: ['place', 'stay_minutes', 'messages', 'memory', 'next_check_minutes'], properties: {
  place: { type: 'string', enum: PLACES }, place_detail: { type: 'string' },
  stay_minutes: { type: 'integer', minimum: 5, maximum: 900 },
  messages: { type: 'array', maxItems: 4, items: { type: 'object', required: ['to', 'text'], properties: { to: { type: 'string', description: `a group chat name (${CHATS.join(' | ')}) or a person's name for a direct message` }, text: { type: 'string' } } } },
  pay: { type: 'array', items: { type: 'object', required: ['to', 'amount'], properties: { to: { type: 'string' }, amount: { type: 'number' }, note: { type: 'string' } } } },
  memory: { type: 'string', description: 'rewrite your running memory (max 80 words): what matters to you right now, what you intend, how you feel. Replace, do not append.' },
  next_check_minutes: { type: 'integer', minimum: 10, maximum: 720 },
} }
const SAY = { type: 'object', required: ['speech', 'action', 'leaves', 'memory'], properties: {
  speech: { type: 'string' }, action: { type: 'string' }, leaves: { type: 'boolean' },
  memory: { type: 'string', description: 'rewrite your running memory (max 80 words)' },
} }
const AUDIT = { type: 'object', required: ['score', 'breakers', 'mechanism_issues', 'extra_rules', 'verdict'], properties: {
  score: { type: 'integer', minimum: 1, maximum: 10, description: 'how realistic, as judged by a skeptical British reader' },
  verdict: { type: 'string' },
  breakers: { type: 'array', items: { type: 'object', required: ['quote', 'why'], properties: { quote: { type: 'string' }, why: { type: 'string' } } } },
  mechanism_issues: { type: 'array', items: { type: 'string' }, description: 'problems caused by how the simulation works (what people can see, scheduling, money, places, turn order, missing affordances) rather than by behaviour. Prefer these.' },
  extra_rules: { type: 'array', maxItems: 3, items: { type: 'string' }, description: 'the COMPLETE replacement list of extra behavioural rules for next run (max 3, short, general, no plot, no names). Keep a previous rule only if still needed. Empty is fine and preferred if behaviour is emergent enough.' },
} }

const BASE_RULES = [
  'You are one real person, not an assistant. Know only what you have seen or been told.',
  'Text and speak like your person really does: length, punctuation, slang, typos, emoji (or none). British register.',
  'Do things for your own reasons. Nobody tells you what should happen.',
  'Money is real: you can only pay what is in your account; your balance is shown to you.',
  'No therapy-speak, no speeches, no tidy resolutions.',
]

// ---------- one simulation run ----------
async function simulate(rules, it) {
  const RULES = rules.map((r) => '- ' + r).join('\n')
  const log2 = [] // {t, kind, ...}
  const st = {}
  for (const n of NAMES) st[n] = { next: Math.max(0, PEOPLE[n].first_check_minutes), place: PEOPLE[n].start_place, until: 0, memory: '(start of week)', money: PEOPLE[n].money, seenScenes: [], notes: [] }
  const visible = (who, now) => log2.filter((e) => e.t <= now && (
    (e.kind === 'chat' && world.chats.find((c) => c.name === e.to)?.members.includes(who)) ||
    (e.kind === 'dm' && (e.to === who || e.from === who)))).slice(-30).map((e) => `[${fmt(e.t)}] ${e.kind === 'chat' ? e.to + ' · ' : 'DM ' + e.from + '→' + e.to + ' · '}${e.from}: ${e.text}`).join('\n')
  const priv = (who, now) => [...allEvents.filter((e) => (e.who === who || e.who === 'all') && e.t <= now).map((e) => `${fmt(e.t)}: ${e.text}`), ...st[who].notes].slice(-8).join('\n')
  const head = (who, now) => `RULES:\n${RULES}\n\nYOU: ${PEOPLE[who].persona}\nYOUR ROUTINE THIS WEEK: ${PEOPLE[who].routine}\nSHARED BACKGROUND: ${world.background}\nYOUR BANK BALANCE: £${st[who].money.toFixed(2)}\nTHINGS THAT HAPPENED TO YOU:\n${priv(who, now) || '(nothing notable)'}\nYOUR MEMORY: ${st[who].memory}\nMESSAGES YOU CAN SEE (group chats you're in, your DMs):\n${visible(who, now) || '(none)'}\nRECENT IN-PERSON MOMENTS: ${st[who].seenScenes.slice(-2).map((s) => `${s.place} ${fmt(s.t)}: ` + s.lines.map((l) => `${l.name}: "${l.speech}"`).join(' / ')).join('\n') || '(none)'}`
  let decisions = 0
  while (decisions < A.maxDecisions) {
    const now = Math.min(...NAMES.map((n) => st[n].next)); if (now >= END) break
    const due = NAMES.filter((n) => st[n].next <= now + 10)
    const res = await parallel(due.map((n) => () => agent(`${head(n, now)}\n\nIT IS NOW ${fmt(now)}. You were last: ${st[n].place}. Where are you now and what do you do? Most of the time people send nothing.`, { ...P, phase: 'Simulate', label: `${A.label} r${it} ${n} ${fmt(now)}`, schema: DECIDE })))
    due.forEach((n, k) => {
      const r = res[k]; decisions++
      if (!r) { st[n].next = now + 60; return }
      st[n].place = r.place; st[n].until = now + r.stay_minutes; st[n].memory = r.memory; st[n].next = now + Math.max(10, r.next_check_minutes)
      log2.push({ t: now, kind: 'state', who: n, place: r.place + (r.place_detail ? ` (${r.place_detail})` : ''), memory: r.memory })
      for (const m of r.messages || []) { if (!m.text?.trim()) continue; if (CHATS.includes(m.to)) log2.push({ t: now, kind: 'chat', to: m.to, from: n, text: m.text.trim() }); else if (NAMES.includes(m.to)) log2.push({ t: now, kind: 'dm', to: m.to, from: n, text: m.text.trim() }) }
      for (const p of r.pay || []) {
        if (!NAMES.includes(p.to) || !(p.amount > 0)) continue
        if (p.amount > st[n].money) { st[n].notes.push(`${fmt(now)}: Your transfer of £${p.amount} to ${p.to} FAILED: insufficient funds.`); log2.push({ t: now, kind: 'pay_failed', from: n, to: p.to, amount: p.amount }) }
        else { st[n].money -= p.amount; st[p.to].money += p.amount; st[p.to].notes.push(`${fmt(now)}: £${p.amount} received from ${n}${p.note ? ' (' + p.note + ')' : ''}.`); log2.push({ t: now, kind: 'pay', from: n, to: p.to, amount: p.amount }) }
      }
    })
    for (const place of world.places) {
      const here0 = NAMES.filter((n) => st[n].place === place && st[n].until > now)
      if (here0.length < 2 || log2.some((e) => e.kind === 'scene' && e.place === place && now - e.t < 120)) continue
      const scene = { t: now, kind: 'scene', place, present: [...here0], lines: [] }
      let here = [...here0], i = 0, quiet = 0
      while (here.length >= 2 && scene.lines.length < 12 && quiet < here.length) {
        const n = here[i % here.length]; i++
        const r = await agent(`${head(n, now)}\n\nIT IS ${fmt(now)}. You are at ${place} with ${here.filter((x) => x !== n).join(', ')}.\nSo far:\n${scene.lines.map((l) => `${l.name}: "${l.speech}"${l.action ? ' (' + l.action + ')' : ''}`).join('\n') || '(you have just noticed each other)'}\nWhat do you say/do next? Empty speech is fine. Leave if you would.`, { ...P, phase: 'Simulate', label: `${A.label} r${it} ${n} @${place}`, schema: SAY })
        if (!r) { quiet++; continue }
        st[n].memory = r.memory
        if (r.speech) { scene.lines.push({ name: n, speech: r.speech, action: r.action }); quiet = 0 } else { if (r.action) scene.lines.push({ name: n, speech: '', action: r.action }); quiet++ }
        if (r.leaves) here = here.filter((x) => x !== n)
      }
      for (const n of here0) st[n].seenScenes.push(scene)
      log2.push(scene)
    }
  }
  return { log: log2, final: Object.fromEntries(NAMES.map((n) => [n, { money: st[n].money, memory: st[n].memory }])), decisions }
}
const render = (log2) => log2.filter((e) => e.kind !== 'state').map((e) =>
  e.kind === 'chat' ? `[${fmt(e.t)}] (${e.to}) ${e.from}: ${e.text}` :
  e.kind === 'dm' ? `[${fmt(e.t)}] DM ${e.from}→${e.to}: ${e.text}` :
  e.kind === 'pay' ? `[${fmt(e.t)}] £${e.amount} ${e.from}→${e.to}` :
  e.kind === 'pay_failed' ? `[${fmt(e.t)}] FAILED £${e.amount} ${e.from}→${e.to}` :
  `--- ${e.place}, ${fmt(e.t)} (${e.present.join(', ')}) ---\n` + e.lines.map((l) => `${l.name}: "${l.speech}"${l.action ? ' (' + l.action + ')' : ''}`).join('\n')).join('\n')

// ---------- iterate: simulate → audit → revise general rules ----------
let rules = [...BASE_RULES]
const iterations = []
for (let it = 1; it <= A.maxIters; it++) {
  phase('Simulate')
  const run = await simulate(rules, it)
  const text = render(run.log)
  const mem = run.log.filter((e) => e.kind === 'state').map((e) => `${fmt(e.t)} ${e.who} @${e.place}: ${e.memory}`).slice(-60).join('\n')
  phase('Audit')
  const audit = await agent(`You are a skeptical British reader auditing a social simulation for realism. Setting: ${A.setting}.
PEOPLE: ${world.people.map((p) => `${p.name}: ${p.persona}`).join('\n')}
LIFE EVENTS (rolled at real-world base rates): ${allEvents.map((e) => `${fmt(e.t)} ${e.who}: ${e.text}`).join(' | ') || 'none'}
RULES USED THIS RUN:\n${rules.join('\n')}
TRANSCRIPT (chats, DMs, payments, in-person):\n${text || '(nothing happened)'}
PRIVATE MEMORY SNAPSHOTS (latest 60):\n${mem}
Judge: would real people in this setting behave, text and talk like this over these days? Too much or too little activity? Repetition? Unrealistic politeness, articulacy, drama, or blandness? Knowledge leaks? Ignored circumstances?
Think hard about ROOT CAUSES. Behaviour must stay emergent: the fix is usually in the mechanism (report it in mechanism_issues), not more rules. Only propose up to 3 short general rules if truly needed, as a full replacement list. Never script plot or outcomes.`, { ...P, model: 'opus', effort: 'high', phase: 'Audit', label: `${A.label} audit r${it}`, schema: AUDIT })
  iterations.push({ it, rules: [...rules], transcript: text, memories: mem, final: run.final, decisions: run.decisions, audit })
  log(`${A.label} r${it}: score ${audit ? audit.score : '?'} · ${run.decisions} decisions · ${audit ? audit.verdict.slice(0, 120) : ''}`)
  if (!audit || audit.score >= 8) break
  rules = [...BASE_RULES, ...(audit.extra_rules || []).slice(0, 3)]
}
return { label: A.label, world, events: allEvents.map((e) => `${fmt(e.t)} ${e.who}: ${e.text}`), iterations }
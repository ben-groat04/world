export const meta = {
  name: 'flatshare-sim',
  description: 'Event-driven simulation of 4 flatmates (Sonnet agents) over a weekend: group chat + in-person scenes, one agent call per decision',
  phases: [{ title: 'Simulate', detail: 'scheduler jumps to the next moment someone acts; one Sonnet call per decision or utterance' }],
}

const A = args
const END = 77 * 60 // Thu 18:00 -> Sun 23:00
const DAYS = ['Thu', 'Fri', 'Sat', 'Sun']
const fmt = (m) => { const h = 18 * 60 + m, d = Math.floor(h / 1440), r = h % 1440; return `${DAYS[d]} ${String(Math.floor(r / 60)).padStart(2, '0')}:${String(r % 60).padStart(2, '0')}` }
const NAMES = ['Dami', 'Tom', 'Magda', 'Raj']
const ROOMS = ['kitchen', 'living room', 'own room', 'bathroom', 'out', 'asleep']

const history = A.history            // text of everything before now
const chat = []                      // {t, name, text}
const scenes = []                    // {t, room, lines:[{name, speech, action}], present:[...]}
const calls = []                     // audit: every decision
const st = {}
for (const n of NAMES) st[n] = { next: A.firstCheck[n], loc: A.startLoc[n], locUntil: 0, thoughts: [...A.thoughts[n]], seenScenes: [] }

const DECIDE = { type: 'object', required: ['location', 'stay_minutes', 'chat', 'thought', 'next_check_minutes'], properties: {
  location: { type: 'string', enum: ROOMS, description: 'where you are from now' },
  location_detail: { type: 'string', description: 'if out: where (e.g. work, church, with the kids)' },
  stay_minutes: { type: 'integer', minimum: 5, maximum: 900 },
  chat: { type: 'array', maxItems: 3, items: { type: 'string' }, description: 'group chat messages you send right now (usually none)' },
  thought: { type: 'string', description: 'one private line: what you think/feel but do not say' },
  next_check_minutes: { type: 'integer', minimum: 10, maximum: 720, description: 'when you would next look at your phone / do something' },
} }
const SAY = { type: 'object', required: ['speech', 'action', 'leaves'], properties: {
  speech: { type: 'string', description: 'what you say now, or empty string to say nothing' },
  action: { type: 'string', description: 'brief action/body language, or empty' },
  leaves: { type: 'boolean', description: 'true if you leave the room after this' },
  thought: { type: 'string' },
} }

const RULES = `You are playing ONE real person, not an assistant. Stay in character; know only what your person knows plus what you have seen. Text like your person really texts (length, punctuation, typos, emoji or none). Real people mostly don't post; silence is normal. Don't resolve things neatly; people deflect, misread, get busy. British register, no therapy-speak, no speeches. Return only the structured output.`

const chatSince = (who) => chat.map((c) => `[${fmt(c.t)}] ${c.name}: ${c.text}`).join('\n') || '(nothing new)'
const scenesFor = (who) => st[who].seenScenes.slice(-3).map((s) => `--- in person, ${s.room}, ${fmt(s.t)} ---\n` + s.lines.map((l) => `${l.name}: "${l.speech}" ${l.action ? '(' + l.action + ')' : ''}`).join('\n')).join('\n\n')
const privEvents = (who, now) => (A.events[who] || []).filter((e) => e.t <= now).map((e) => `${fmt(e.t)}: ${e.text}`).join('\n')

async function decide(who, now) {
  const p = `${RULES}

YOU: ${A.personas[who]}

EVERYTHING BEFORE THIS WEEK'S LIVE PERIOD:
${history}

GROUP CHAT SINCE THEN:
${chatSince(who)}

IN-PERSON MOMENTS YOU WERE PART OF:
${scenesFor(who) || '(none)'}

THINGS THAT HAPPENED TO YOU PRIVATELY:
${privEvents(who, now) || '(none)'}

YOUR RECENT PRIVATE THOUGHTS:
${st[who].thoughts.slice(-8).join('\n')}

IT IS NOW ${fmt(now)}. You were last: ${st[who].loc}. Decide where you are now and what you do. Only send chat messages if your person would right now.`
  const r = await agent(p, { label: `${who} ${fmt(now)}`, phase: 'Simulate', schema: DECIDE, model: 'sonnet', effort: 'low' })
  return r
}

async function runScene(room, now, present) {
  const scene = { t: now, room, lines: [], present: [...present] }
  let quiet = 0, i = 0, here = [...present]
  while (here.length >= 2 && scene.lines.length < 14 && quiet < here.length) {
    const who = here[i % here.length]; i++
    const p = `${RULES}

YOU: ${A.personas[who]}

BACKGROUND (earlier this week):
${history}

GROUP CHAT SINCE THEN:
${chatSince(who)}

THINGS THAT HAPPENED TO YOU PRIVATELY:
${privEvents(who, now) || '(none)'}

YOUR RECENT PRIVATE THOUGHTS:
${st[who].thoughts.slice(-6).join('\n')}

IT IS ${fmt(now)}. You are in the ${room} with ${here.filter((x) => x !== who).join(' and ')}.
Conversation so far in this room:
${scene.lines.map((l) => `${l.name}: "${l.speech}" ${l.action ? '(' + l.action + ')' : ''}`).join('\n') || '(you have just come in / noticed each other)'}

What do you say or do next? Empty speech is fine if you'd say nothing. Leave if you'd leave.`
    const r = await agent(p, { label: `${who} in ${room} ${fmt(now)}`, phase: 'Simulate', schema: SAY, model: 'sonnet', effort: 'low' })
    if (!r) { quiet++; continue }
    calls.push({ kind: 'scene', who, t: fmt(now), room, out: r })
    if (r.thought) st[who].thoughts.push(`${fmt(now)} ${r.thought}`)
    if (r.speech || r.action) { scene.lines.push({ name: who, speech: r.speech, action: r.action }); quiet = r.speech ? 0 : quiet + 1 } else quiet++
    if (r.leaves) { here = here.filter((x) => x !== who); st[who].loc = 'own room' }
  }
  for (const n of present) st[n].seenScenes.push(scene)
  scenes.push(scene)
  log(`${fmt(now)} scene in ${room}: ${present.join(', ')} (${scene.lines.length} lines)`)
}

let decisions = 0
while (decisions < A.maxDecisions) {
  const now = Math.min(...NAMES.map((n) => st[n].next))
  if (now >= END) break
  // everyone due within 10 min acts in parallel (they can't see each other's same-moment choices anyway)
  const due = NAMES.filter((n) => st[n].next <= now + 10)
  const res = await parallel(due.map((n) => () => decide(n, now)))
  due.forEach((n, k) => {
    const r = res[k]; decisions++
    if (!r) { st[n].next = now + 60; return }
    calls.push({ kind: 'decide', who: n, t: fmt(now), out: r })
    st[n].loc = r.location === 'out' && r.location_detail ? `out (${r.location_detail})` : r.location
    st[n].room = r.location; st[n].locUntil = now + r.stay_minutes
    st[n].thoughts.push(`${fmt(now)} ${r.thought}`)
    for (const m of r.chat || []) if (m && m.trim()) chat.push({ t: now, name: n, text: m.trim() })
    st[n].next = now + Math.max(10, r.next_check_minutes)
  })
  // in-person: anyone awake sharing kitchen/living room
  for (const room of ['kitchen', 'living room']) {
    const present = NAMES.filter((n) => st[n].room === room && st[n].locUntil > now)
    if (present.length >= 2 && !scenes.some((s) => s.room === room && now - s.t < 90)) await runScene(room, now, present)
  }
  if (decisions % 10 < due.length) log(`${fmt(now)} · ${decisions} decisions · ${chat.length} chat msgs · ${scenes.length} scenes`)
}

return { chat: chat.map((c) => `[${fmt(c.t)}] ${c.name}: ${c.text}`), scenes: scenes.map((s) => ({ when: fmt(s.t), room: s.room, present: s.present, lines: s.lines })), thoughts: Object.fromEntries(NAMES.map((n) => [n, st[n].thoughts])), calls, decisions }
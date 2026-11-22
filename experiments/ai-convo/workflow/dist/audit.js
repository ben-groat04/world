export const meta = {
  name: 'social-sim-v3-audit',
  description: 'Audits several saved engine-v3 runs for realism: one sceptical read per run, then one comparison across runs; every issue gets a mechanism cause checked against the logs and an AI-first fix considered',
  phases: [{ title: 'Audit runs', model: 'opus' }, { title: 'Compare', model: 'opus' }],
}
// Thin Workflow-tool wrapper. `node build.cjs` writes workflow/dist/audit.js. args: from `node audit-args.cjs <round>`.
// args: { runs: [built by audit-args.cjs from rounds/<round>/<label>/: label, setting, window, people, background, calendar, events, transcript, memories, worldLog, stats] }
// Never feeds back into a run. Read-only over saved outputs. Plain JavaScript with the same host as engine-v3.js; workflow/audit.js runs it.
async function audit(A, host) {
const { parallel, log, phase } = host
const ask = (prompt, schema, label, ph) => host.ask('role', prompt, { schema, label, phase: ph, model: 'opus', effort: 'high' })
const RUNS = A.runs || []
if (!RUNS.length) throw new Error('args.runs is required (node audit-args.cjs <round>)')
const str = { type: 'string' }, arr = (items) => ({ type: 'array', items })
const obj = (props, req = Object.keys(props)) => ({ type: 'object', required: req, properties: props })
const cap = (s, k) => (s = String(s || '')).length <= k ? s : s.slice(0, k / 2) + `\n[... ${s.length - k} chars omitted ...]\n` + s.slice(-k / 2)
const HOW = `HOW THE ENGINE WORKS: people and households come from a census-based sampler; a character writer, blind to name, sex, ethnicity, birthplace and religion, wrote each profile, speech and texting style; temperament is drawn at random; players never see ethnicity. Each person plans their own next hours (errands belong to a plan step and resolve when it starts) and chooses how often they glance at their phone; they get a turn when their plan runs out, when they glance and something is new, between activities, on waking, on walking into a room with someone in it, and after every conversation. Every call shows the person their own journal verbatim; they condense each conversation and each day in their own words when it ends. Conversations run inside the clock line by line; people can walk in, be called over, or leave, and each line names who it is addressed to. A world role resolves errands, background characters and sourced events, with a reason for each. Shifts come from the sampler; event rates only from cited sources; money is not tracked.`
const AI_FIRST = `For every issue, consider first whether an AI-first solution would solve it: give the judgment to a person's or role's model, with the facts it needs in view, rather than adding code rules or machinery. Code should own only hard facts (clock, places, who knows whom, sourced data, logs). Say which, and why.`
const ISSUE = obj({ issue: str, evidence: { type: 'string', description: 'quote or log line that shows it' }, cause: { type: 'string', description: 'the mechanism that produces it, checked against the logs' }, ai_first: { type: 'string', description: 'the AI-first fix (which model call gets the judgment, and what it needs to see), or why code must own it' } })
const RUN = obj({ imagined: arr(str), missing_texture: arr(str), stereotyping: arr(obj({ who: str, quote: str, why: str })), breakers: arr(obj({ quote: str, why: str })), issues: arr(ISSUE), score: { type: 'integer', description: '1-10 realism' }, verdict: str })

phase('Audit runs')
const reports = await parallel(RUNS.map((r) => () => ask(`Audit this social simulation run for realism with a novelist's eye, as a sceptical reader from this setting.
RUN: ${r.label}. SETTING: ${r.setting}. WINDOW: ${r.window?.from} to ${r.window?.to}${r.stats?.stoppedAt ? ` (stopped early at ${r.stats.stoppedAt})` : ''}.
PEOPLE (sampled attributes incl. ethnicity; temperament):\n${(r.people || []).map((p) => `${p.name} | ${JSON.stringify(p.attributes)} | ${p.temperament}\n  ${p.profile}\n  speech: ${p.speech} | texting: ${p.texting}`).join('\n')}
WORLD: ${r.background || ''}\nCALENDAR: ${(r.calendar || []).map((o) => `${o.who.join('+')} ${o.what} ${o.at}-${o.until.slice(4)} (${o.by})`).join(' | ') || 'none'}\nEVENTS THAT FIRED: ${(r.events || []).join(' | ') || 'none'}
${HOW}
TRANSCRIPT:\n${cap(r.transcript, 90000) || '(nothing)'}
TIMELINES (turns, why, what they chose to remember, plan):\n${cap(r.memories, 40000)}
WORLD DECISIONS:\n${cap(r.worldLog, 15000) || '(none)'}
First imagine what a real stretch like this would contain for these people; then compare. Check for stereotyping, including in how others treat them. Point to mechanism causes, not just symptoms, and check each against the logs. ${AI_FIRST}`,
  RUN, `audit ${r.label}`, 'Audit runs')))
RUNS.forEach((r, i) => log(`${r.label}: ${reports[i]?.score ?? '?'}/10 · ${String(reports[i]?.verdict || '').slice(0, 140)}`))

phase('Compare')
const compare = await ask(`You audited ${RUNS.length} runs of the same social simulation engine in different settings. Compare them and find what is wrong with the ENGINE, not with one run.
${HOW}
REPORTS:\n${RUNS.map((r, i) => `## ${r.label} (${r.setting}) score ${reports[i]?.score ?? '?'}\n${JSON.stringify(reports[i] || { failed: true })}`).join('\n\n')}
Group issues that share a cause; rank by how much they hurt realism across runs; say which runs show each. Separate engine causes from one-off model behaviour. ${AI_FIRST}`,
  obj({ recurring: arr(obj({ issue: str, runs: arr(str), cause: str, ai_first: str, code_must_own: { type: 'string', description: 'empty unless a hard fact is involved: which, and why' } })), one_offs: arr(str), strengths: arr(str), score: { type: 'integer', description: '1-10 realism across runs' }, verdict: str }), 'compare runs', 'Compare')
log(`across runs: ${compare?.score ?? '?'}/10 · ${String(compare?.verdict || '').slice(0, 160)}`)
return { version: 3, audited: RUNS.map((r) => r.label), reports: Object.fromEntries(RUNS.map((r, i) => [r.label, reports[i]])), compare }
}

const ask = (kind, prompt, o) => agent(prompt, { agentType: args.roleAgent || 'persona', schema: o.schema, label: o.label, phase: o.phase, ...(o.model ? { model: o.model } : {}), ...(o.effort ? { effort: o.effort } : {}) })
return audit(args, { ask, parallel, log, phase })

// GENERATED by build.cjs from workflow/audit.js; do not edit

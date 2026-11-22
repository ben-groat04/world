export const meta = {
  name: 'social-sim-v3',
  description: "Social simulation: one agent per person plans its own time, talks or doesn't, ends conversations itself and condenses its own memories; code keeps each person's first-hand journal, the clock, places, calendar, who knows whom, sourced events and full logs; a world role resolves consequences with reasons",
  phases: [{ title: 'Generate' }, { title: 'Simulate' }],
}
// Thin Workflow-tool wrapper. Edit here, then `node build.cjs` writes workflow/dist/sim.js (this file with the engine pasted in) to launch.
// args: as engine-v3.js, plus roleAgent?: 'persona' | 'sim' (agent type for role calls; .claude/agents/sim.md loads at session start).
//@include ../engine-v3.js
let roleAgent = args.roleAgent || 'persona'
const ask = async (kind, prompt, o) => {
  const at = kind === 'persona' ? 'persona' : roleAgent
  const opts = { agentType: at, schema: o.schema, label: o.label, phase: o.phase, ...(o.model ? { model: o.model } : {}), ...(o.effort ? { effort: o.effort } : {}) }
  const r = await agent(prompt, opts).catch(() => null)
  if (r != null || at === 'persona') return r
  roleAgent = 'persona'; log(`role agent "${at}" unavailable; using persona for role calls`) // missing agent file: persona for the rest of the run
  return agent(prompt, { ...opts, agentType: 'persona' })
}
const out = await simulate(args, { ask, parallel, log, phase })
return { ...out, stats: { ...out.stats, roleAgent } }

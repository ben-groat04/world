export const meta = {
  name: 'social-sim-v3-audit',
  description: 'Audits several saved engine-v3 runs for realism: one sceptical read per run, then one comparison across runs; every issue gets a mechanism cause checked against the logs and an AI-first fix considered',
  phases: [{ title: 'Audit runs', model: 'opus' }, { title: 'Compare', model: 'opus' }],
}
// Thin Workflow-tool wrapper. `node build.cjs` writes workflow/dist/audit.js. args: from `node audit-args.cjs <round>`.
//@include ../audit-v3.js
const ask = (kind, prompt, o) => agent(prompt, { agentType: args.roleAgent || 'persona', schema: o.schema, label: o.label, phase: o.phase, ...(o.model ? { model: o.model } : {}), ...(o.effort ? { effort: o.effort } : {}) })
return audit(args, { ask, parallel, log, phase })

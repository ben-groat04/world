#!/usr/bin/env node
// Paired batches: casts are generated once (GEN_ONLY), then every arm runs on the same casts (LINES_FROM) with the same START, so a difference between arms is not a difference between worlds. Round 18's cold read: per-window scores have SD ~1.6 across casts, so unpaired arms of 6-9 runs cannot show a difference under ~1.8 points.
//
//   node batch.mjs gen <batch> [--seeds 3] [--scenarios file.json] [--only T1,U2] [--conc 6]
//       One casting call per scenario x seed (run.mjs with GEN_ONLY=1). Writes batches/<batch>/manifest.json: per cast its scenario, seed, START and the cast folder (a new runs/<timestamp>/ with only the cast row).
//   node batch.mjs run <batch> --arm LABEL [--code DIR] [--env K=V ...] [--arm LABEL2 ...] [--only T1,U2] [--seed 1] [--conc 6]
//       Runs every arm on every cast: `node run.mjs` in DIR (default: this folder; point it at a copy of the folder with other code for a code arm) with the scenario's env, START from the manifest, LINES_FROM=<cast folder> and the arm's env. Arms of one cast start together. Appends "LABEL-<scenario><seed> <run folder>" lines to batches/<batch>/list.txt, the list eval-prep.mjs reads (label = arm, scenario, one seed digit).
//   node batch.mjs list <batch>     prints the list file's path and the number of runs in it.
//
// Scenarios: the default set below (T1-T6, U1-U3: the scenarios of rounds 7-18) or a JSON file {"Name": {people, brief?, topic?, days?, messages?, start?: "monday", secrets?: {...}, env?: {...}}}; swap in fresh briefs each round so the arms are not tuned to these nine. A scenario name is letters and digits; the seed is one digit after it (at most 9 seeds), so eval-prep reads "BASE-T31" as arm BASE, scenario T3, seed 1.
// Every run's start time is the manifest's, so paired arms see the same clock; arms that differ in code need their own --code folder (copy this folder, edit the copy; its runs/ folder collects that arm's runs).
import fs from 'node:fs'; import path from 'node:path'; import { spawn } from 'node:child_process';
const here = import.meta.dirname, [mode, batch, ...rest] = process.argv.slice(2);
const SCENARIOS = { // as the sc.sh of earlier rounds (START and DAYS chosen so each topic's own timeline falls inside the run)
  T1: { people: 4, topic: "You want to get everyone together this weekend, but nobody has said when they're free.", start: 'wednesday', days: 5 },
  T2: { people: 4, brief: 'You work together at a small design studio.', topic: 'A client has just moved a deadline up to Friday.', start: 'monday', days: 5 },
  T3: { people: 3, brief: "You're siblings, and your parents still live in the town you grew up in.", topic: "Mum's 60th birthday is next month and nobody has planned anything yet.", days: 3 },
  T4: { people: 2, brief: 'You matched on a dating app last week and have been texting since.', days: 3 },
  T5: { people: 6, secrets: { Sam: "You have a crush on Jo and haven't told anyone." }, days: 3 },
  T6: { people: 4, brief: 'You work together in a small accounts team.', topic: "You need Tom's spreadsheet of supplier invoices before the end of Friday.", start: 'monday', days: 5 },
  U1: { people: 4, brief: "You're housemates.", days: 3 },
  U2: { people: 2, brief: 'Old school friends who live in different cities now.', days: 3 },
  U3: { people: 5, brief: 'Cousins.', days: 3 },
};
const opts = { arms: [], seeds: 3, conc: 6 }; const flags = rest.slice();
for (let i = 0; i < flags.length; i++) {
  const f = flags[i], v = flags[i + 1];
  if (f === '--arm') opts.arms.push({ label: v, env: {}, code: here }), i++;
  else if (f === '--code') opts.arms.at(-1).code = path.resolve(v), i++;
  else if (f === '--env') { const [k, ...val] = v.split('='); opts.arms.at(-1).env[k] = val.join('='); i++; }
  else if (f === '--seeds') opts.seeds = +v, i++;
  else if (f === '--conc') opts.conc = +v, i++;
  else if (f === '--only') opts.only = v.split(','), i++;
  else if (f === '--seed') opts.seed = +v, i++;
  else if (f === '--scenarios') opts.scenarios = JSON.parse(fs.readFileSync(v, 'utf8')), i++;
  else { console.error('unknown argument', f); process.exit(1); }
}
if (!['gen', 'run', 'list'].includes(mode) || !batch) { console.error('usage: node batch.mjs gen|run|list <batch> [options] (see the header)'); process.exit(1); }
const bdir = path.join(here, 'batches', batch), mpath = path.join(bdir, 'manifest.json'), lpath = path.join(bdir, 'list.txt');
const pool = async (jobs, f) => { let i = 0; await Promise.all(Array.from({ length: opts.conc }, async () => { while (i < jobs.length) await f(jobs[i++]); })); };
const wd = day => { const d = new Date(), want = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'].indexOf(day); do d.setDate(d.getDate() + 1); while (d.getDay() !== want); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}T19:00`; }; // the coming <weekday> at 19:00
// One run.mjs call; resolves to the run folder it printed. Stagger starts: a run folder is named by the millisecond.
let last = 0;
async function runMjs(code, env, argv, marker) {
  const wait = Math.max(0, last + 1300 - Date.now()); last = Date.now() + wait; await new Promise(r => setTimeout(r, wait));
  const proc = spawn('node', [path.join(code, 'run.mjs'), ...argv], { cwd: code, env: { ...process.env, ...env }, stdio: ['ignore', 'pipe', 'pipe'] });
  let out = '', err = ''; proc.stdout.on('data', d => out += d); proc.stderr.on('data', d => err += d);
  const status = await new Promise(res => { proc.on('error', () => res(-1)); proc.on('close', res); });
  const dir = out.match(new RegExp(`${marker} (\\S+)\\s*$`, 'm'))?.[1];
  if (status !== 0 || !dir) { console.error(`failed (exit ${status}): ${argv.join(' ')} ${JSON.stringify(env)}\n${err.slice(-500)}`); return null; }
  return path.resolve(code, dir);
}
const baseEnv = (s, start) => ({ PEOPLE: String(s.people), DAYS: String(s.days ?? 3), START: start, ...(s.topic && { TOPIC: s.topic }), ...(s.secrets && { SECRETS: JSON.stringify(s.secrets) }), ...s.env });
const argvOf = s => [String(s.messages ?? 80), ...(s.brief ? [s.brief] : [])];

if (mode === 'gen') {
  const scen = opts.scenarios ?? SCENARIOS, names = (opts.only ?? Object.keys(scen)).filter(k => { if (!scen[k]) { console.error('no such scenario', k); process.exit(1); } if (!/^[A-Za-z0-9]+$/.test(k)) { console.error(`scenario name ${k}: letters and digits only`); process.exit(1); } return true; });
  if (opts.seeds > 9) { console.error('at most 9 seeds (one digit)'); process.exit(1); }
  if (fs.existsSync(mpath)) { console.error(`${mpath} exists: use another batch name`); process.exit(1); }
  const casts = names.flatMap(k => Array.from({ length: opts.seeds }, (_, s) => ({ id: `${k}${s + 1}`, scenario: k, seed: s + 1, start: scen[k].start ? wd(scen[k].start) : null })));
  const today = new Date(new Date().setHours(19, 0, 0, 0)), iso = d => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}T19:00`;
  for (const c of casts) c.start ??= iso(today); // as run.mjs: today 19:00
  await pool(casts, async c => { c.dir = await runMjs(here, { ...baseEnv(scen[c.scenario], c.start), GEN_ONLY: '1' }, argvOf(scen[c.scenario]), 'Saved log.jsonl in'); console.log(`${c.id}: ${c.dir ?? 'FAILED'}`); });
  const failed = casts.filter(c => !c.dir); if (failed.length) console.error('casts that failed (not in the manifest):', failed.map(c => c.id).join(' '));
  fs.mkdirSync(bdir, { recursive: true }); fs.writeFileSync(mpath, JSON.stringify({ scenarios: Object.fromEntries(names.map(k => [k, scen[k]])), casts: casts.filter(c => c.dir) }, null, 1) + '\n');
  console.log(`${casts.length - failed.length} casts in ${mpath}`);
} else if (mode === 'run') {
  if (!opts.arms.length) { console.error('give at least one --arm LABEL'); process.exit(1); }
  const m = JSON.parse(fs.readFileSync(mpath, 'utf8')), casts = m.casts.filter(c => (!opts.only || opts.only.includes(c.scenario)) && (!opts.seed || c.seed === opts.seed));
  for (const a of opts.arms) if (!/^[A-Za-z0-9_]+$/.test(a.label)) { console.error(`arm label ${a.label}: letters, digits and _ only (eval-prep splits labels at "-")`); process.exit(1); }
  const jobs = casts.map(c => opts.arms.map(a => ({ c, a })));  // a cast's arms start together (adjacent jobs), so they see the same hours of the day if the clock matters to the API
  fs.mkdirSync(bdir, { recursive: true });
  await pool(jobs.flat(), async ({ c, a }) => {
    const s = m.scenarios[c.scenario], dir = await runMjs(a.code, { ...baseEnv(s, c.start), ...a.env, LINES_FROM: c.dir }, argvOf(s), 'Done. Saved transcript.txt and log.jsonl in');
    console.log(`${a.label}-${c.id}: ${dir ?? 'FAILED'}`); if (dir) fs.appendFileSync(lpath, `${a.label}-${c.id} ${dir}\n`);
  });
  console.log(`list: ${lpath}`);
} else {
  console.log(lpath, fs.existsSync(lpath) ? fs.readFileSync(lpath, 'utf8').trim().split('\n').length + ' runs' : '(no runs yet)');
}

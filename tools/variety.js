// node tools/variety.js [dump1.json dump2.json ...]   dump = {events, pop, ticksPerYear?, ticksPerDay?}  (events from world.events). With no args: demo on synthetic seeds + generated text.
// Sifts each dump, then prints the variety/emergence section (ROADMAP 5.3): per-run metrics averaged, cross-seed JSD, text repetition.
import fs from 'node:fs';
import { Sifter, PATTERNS } from '../sim/sifter/index.js';
import { TextEngine } from '../sim/text/engine.js';
import pack from '../content/larkfield/text/index.js';
import { varietySection, renderRows } from './report-sections/variety.js';

export function siftRun(events, o = {}) {
  const tpd = o.ticksPerDay || 144; const s = new Sifter({ patterns: PATTERNS, ticksPerDay: tpd });
  for (const e of [...events].sort((a, b) => a.tick - b.tick || a.id - b.id)) s.consume(e);
  s.sweep(Infinity); return { events, arcs: s.arcs, sifter: s, pop: o.pop || 500, ticksPerYear: o.ticksPerYear || tpd * 365, sig: (a) => s.signature(a) };
}
function demoEvents(seed, years = 10, pop = 500) {
  let x = seed * 2654435761 >>> 0; const r = () => ((x = (Math.imul(x, 1664525) + 1013904223) >>> 0) / 4294967296);
  const types = ['life.couple', 'life.breakup', 'work.hired', 'work.fired', 'social.fallout', 'social.reconcile', 'social.friendship', 'money.debt', 'home.rent_rise', 'home.eviction', 'life.move_in', 'life.move_out', 'biz.open', 'biz.close', 'civic.campaign', 'life.birth', 'life.death', 'school.result'];
  const ev = []; const n = years * pop * 3; let last = -1;
  for (let i = 0; i < n; i++) { const t = types[Math.floor(r() ** (1 + seed % 3) * types.length)]; const a = Math.floor(r() * pop); const b = (a + 1 + Math.floor(r() * 12)) % pop; const c = r() < 0.35 && last >= 0; ev.push({ id: i, type: t, tick: Math.floor((i / n) * years * 365 * 144), actors: [a, b], objects: [Math.floor(r() * 120)], place: r() < 0.8 ? Math.floor(r() * 60) : null, tags: [], cause: c ? last : -1, salience: 0.25 + r() * 0.4, payload: r() < 0.92 ? { reason: 'x' } : {} }); last = i; }
  return ev;
}
function demoTexts(seed, n = 400) {
  const eng = new TextEngine(pack, { seed }); const ppl = [{ id: 1, firstName: 'Kayleigh', age: 16, sex: 'F' }, { id: 2, firstName: 'Tomasz', age: 20, sex: 'M', segment: 'student' }, { id: 3, firstName: 'Priya', age: 29, sex: 'F', segment: 'young_sharer' }, { id: 4, firstName: 'Dean', age: 38, sex: 'M', children: [1] }, { id: 5, firstName: 'Margaret', age: 78, sex: 'F' }];
  const out = []; for (let i = 0; i < n; i++) { const a = ppl[i % 5]; out.push(eng.render(i % 3 ? 'post.daily' : 'thought.idle', { a, seed: i, date: { hour: 9, weekday: i % 7 } })); } return out;
}
const args = process.argv.slice(2);
let runs;
if (args.length) runs = args.map((f) => { const d = JSON.parse(fs.readFileSync(f, 'utf8')); return siftRun(d.events, d); });
else { runs = [1, 2, 3].map((sd) => ({ ...siftRun(demoEvents(sd)), texts: demoTexts(sd) })); console.log('(demo: synthetic event logs, 3 seeds; pass dump files for real runs)'); }
const sec = varietySection(runs, runs[0].sig);
console.log(renderRows(sec));
console.log(sec.ok ? 'VARIETY OK' : 'VARIETY: see LOW/HIGH rows');

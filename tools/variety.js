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
function demoTexts(seed, n = 120) {
  const eng = new TextEngine(pack, { seed }); const ppl = [{ id: 1, firstName: 'Kayleigh', age: 16, sex: 'F' }, { id: 2, firstName: 'Tomasz', age: 20, sex: 'M', segment: 'student' }, { id: 3, firstName: 'Priya', age: 29, sex: 'F', segment: 'young_sharer' }, { id: 4, firstName: 'Dean', age: 38, sex: 'M', children: [1] }, { id: 5, firstName: 'Margaret', age: 78, sex: 'F' }];
  const out = []; for (let i = 0; i < n; i++) { const a = ppl[i % 5]; out.push(eng.render(['post.daily', 'thought.idle', 'post.daily', 'msg.hello', 'thought.home', 'msg.flatmate', 'thought.money', 'post.daily'][i % 8], { a: { ...a, mood: ((i * 37) % 100) / 100 }, seed: i, date: { hour: 9, weekday: i % 7 } })); } return out;
}
// ---- live text variety: node tools/variety.js --text [seed=1] [years=3]
// Runs the UI host headless, collects every rendered feed post, forum post/reply, news head/body, storyline beat and person-timeline line, and reports distinct ratio,
// the most repeated templates (names/numbers masked) and exact repeats within a game-month. Target: distinct >= 0.9, no template > 2%, no repeat within a month.
export async function textVariety(seed = 1, years = 3, log = console.log) {
  const { Host } = await import('../ui/host.js'); const { storylines } = await import('../sim/sifter/storylines.js'); void storylines;
  const msgs = []; const h = new Host(seed, (m) => msgs.push(m)); const lines = []; const seenPost = new Set(); const TPD = h.TPD, end = h.w.tick + years * h.TPY; let nextSlow = h.w.tick;
  const flush = () => { for (const m of msgs.splice(0)) {
    if (m.t === 'news') for (const it of m.items) { if (it.kind === 'god') continue; lines.push({ g: 'news.head', tick: it.tick, s: it.head }); if (it.body) lines.push({ g: 'news.body', tick: it.tick, s: it.body }); }
    else if (m.t === 'posts') for (const p of m.posts) if (!seenPost.has(p.id)) { seenPost.add(p.id); lines.push({ g: 'post.' + p.ch, tick: p.t, s: p.text }); for (const r of p.replies || []) lines.push({ g: 'reply', tick: p.t, s: r.text }); } } };
  while (h.w.tick < end) { for (let i = 0; i < TPD && h.w.tick < end; i++) h.w.step(); h.releaseHeld(); if (h.newsOut.length) h.send({ t: 'news', items: h.newsOut.splice(0) }); if (h.w.tick >= nextSlow) { nextSlow += TPD; h.slowFeeds(); } flush(); }
  for (const a of h.sifter.arcs.filter((x) => x.confirmed).slice(0, 400)) for (const b of h.arcView(a).beats) lines.push({ g: 'beat', tick: b.tick, s: b.text });
  const norm = (x) => x.replace(/\b[A-Z][a-z]+( [A-Z][a-z]+)?\b/g, 'N').replace(/\d+/g, '#'), cnt = new Map(), mm = new Set(); let rep = 0;
  for (const l of lines) { const k = norm(l.s); cnt.set(k, (cnt.get(k) || 0) + 1); const m = Math.floor(l.tick / (TPD * 30)) + '|' + l.s; if (mm.has(m)) rep++; mm.add(m); }
  const by = {}; for (const l of lines) (by[l.g] ||= []).push(l.s);
  log(`lines ${lines.length}  distinct ${(new Set(lines.map((l) => l.s)).size / lines.length).toFixed(3)}  exact repeats within a game-month ${rep} (${(rep / lines.length * 100).toFixed(2)}%)`);
  for (const [g, a] of Object.entries(by)) log(`  ${g.padEnd(12)} n=${String(a.length).padStart(6)} distinct ${(new Set(a).size / a.length).toFixed(2)}`);
  log('  top templates:'); for (const [k, n] of [...cnt].sort((a, b) => b[1] - a[1]).slice(0, 8)) log(`   ${(100 * n / lines.length).toFixed(2)}%  ${k.slice(0, 100)}`);
  return { lines, distinct: new Set(lines.map((l) => l.s)).size / lines.length, rep };
}
const args = process.argv.slice(2);
if (args[0] === '--text') { await textVariety(+args[1] || 1, +args[2] || 3); process.exit(0); }
let runs;
if (args.length) runs = args.map((f) => { const d = JSON.parse(fs.readFileSync(f, 'utf8')); return siftRun(d.events, d); });
else { runs = [1, 2, 3].map((sd) => ({ ...siftRun(demoEvents(sd)), texts: demoTexts(sd) })); console.log('(demo: synthetic event logs, 3 seeds; pass dump files for real runs)'); }
const sec = varietySection(runs, runs[0].sig);
console.log(renderRows(sec));
console.log(sec.ok ? 'VARIETY OK' : 'VARIETY: see LOW/HIGH rows');

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
  const { Host } = await import('../ui/host.js'); const { storylines } = await import('../sim/sifter/storylines.js');
  const msgs = []; const h = new Host(seed, (m) => msgs.push(m)); const lines = []; const seenPost = new Set(); const TPD = h.TPD, end = h.w.tick + years * h.TPY; let nextSlow = h.w.tick, nextArc = h.w.tick; const seenArc = new Set();
  const flush = () => { for (const m of msgs.splice(0)) {
    if (m.t === 'news') for (const it of m.items) { if (it.kind === 'god') continue; lines.push({ g: 'news.head', tick: it.tick, s: it.head }); if (it.body) lines.push({ g: 'news.body', tick: it.tick, s: it.body }); }
    else if (m.t === 'posts') for (const p of m.posts) if (!seenPost.has(p.id)) { seenPost.add(p.id); lines.push({ g: 'post.' + p.ch, tick: p.t, s: p.text }); for (const r of p.replies || []) lines.push({ g: 'reply', tick: p.t, s: r.text }); } } };
  while (h.w.tick < end) { for (let i = 0; i < TPD && h.w.tick < end; i++) h.w.step(); h.releaseHeld(); if (h.newsOut.length) h.send({ t: 'news', items: h.newsOut.splice(0) }); if (h.w.tick >= nextSlow) { nextSlow += TPD; h.slowFeeds(); } if (h.w.tick >= nextArc) { nextArc += TPD * 14; for (const a of storylines(h.sifter, h.w, { limit: 12 })) { const k = a.id + ':' + a.beats.length; if (seenArc.has(k)) continue; seenArc.add(k); lines.push({ g: 'story.head', tick: h.w.tick, s: a.headline }); for (const b of a.beats) { const bk = b.tick + '|' + b.text; if (!seenArc.has(bk)) { seenArc.add(bk); lines.push({ g: 'story.beat', tick: b.tick, s: b.text }); } } } } flush(); }
  for (const a of h.sifter.arcs.filter((x) => x.confirmed).slice(0, 400)) for (const b of h.arcView(a).beats) lines.push({ g: 'beat', tick: b.tick, s: b.text });
  // person pages: every resident's life story, summary paragraph, activity and thought as the inspector would show them (sampled every 6th person), so slashes, "an an", unclosed brackets etc. are linted too
  const extra = []; { const tk = h.w.tick; let n = 0; for (const p of h.w.living()) { if (n++ % 6) continue; const d = h.personDetail(p.id); if (!d) continue; for (const l of d.life || []) extra.push({ g: 'person.timeline', tick: tk, s: l.text }); if (d.bio) extra.push({ g: 'person.bio', tick: tk, s: d.bio }); if (d.thought) extra.push({ g: 'person.thought', tick: tk, s: d.thought }); if (d.now && d.now.label) extra.push({ g: 'person.now', tick: tk, s: d.now.label }); } }
  const norm = (x) => x.replace(/\b[A-Z][a-z]+( [A-Z][a-z]+)?\b/g, 'N').replace(/\d+/g, '#'), cnt = new Map(), mm = new Set(); let rep = 0;
  for (const l of lines) { const k = norm(l.s); cnt.set(k, (cnt.get(k) || 0) + 1); const m = Math.floor(l.tick / (TPD * 30)) + '|' + l.s; if (mm.has(m)) rep++; mm.add(m); }
  const by = {}; for (const l of lines) (by[l.g] ||= []).push(l.s);
  log(`lines ${lines.length}  distinct ${(new Set(lines.map((l) => l.s)).size / lines.length).toFixed(3)}  exact repeats within a game-month ${rep} (${(rep / lines.length * 100).toFixed(2)}%)`);
  for (const [g, a] of Object.entries(by)) log(`  ${g.padEnd(12)} n=${String(a.length).padStart(6)} distinct ${(new Set(a).size / a.length).toFixed(2)}  masked-distinct ${(new Set(a.map(norm)).size / a.length).toFixed(2)}`);
  log('  top templates:'); for (const [k, n] of [...cnt].sort((a, b) => b[1] - a[1]).slice(0, 8)) log(`   ${(100 * n / lines.length).toFixed(2)}%  ${k.slice(0, 100)}`);
  const cal = h.w.calendar, hits = lintText(lines.concat(extra), { monthOf: (t) => { try { return cal.dateOf(t).m; } catch { return null; } } }), tics = ticReport(lines, TPD, 6);
  const nHit = Object.values(hits).reduce((a, v) => a + v.length, 0), ticN = tics.reduce((a, t) => a + t.n, 0);
  log(`  lint: ${nHit} glue/grammar/season hits in ${Object.keys(hits).length} rules`); for (const [k, v] of Object.entries(hits)) log(`   ${k.padEnd(28)} ${String(v.length).padStart(4)}  e.g. ${v.slice(0, 2).map((x) => JSON.stringify(String(x).slice(0, 110))).join(' | ')}`);
  const qt = quotedTicReport(lines, TPD, 3), qN = qt.reduce((a, t) => a + t.n, 0);
  log(`  quoted punchlines repeated within 3 game-months, town-wide: ${qN} (${(100 * qN / lines.length).toFixed(2)}% of lines) across ${qt.length} sentences`); for (const t of qt.slice(0, 5)) log(`   x${t.n + 1}  ${t.s.slice(0, 110)}`);
  log(`  tics (>=7-word sentence repeated within 6 game-months, town-wide): ${ticN} repeats (${(100 * ticN / lines.length).toFixed(2)}% of lines) across ${tics.length} sentences`); for (const t of tics.slice(0, 12)) log(`   x${t.n + 1}  ${t.s.slice(0, 110)}`);
  return { lines, distinct: new Set(lines.map((l) => l.s)).size / lines.length, rep, hits, nHit, tics, ticN, ticRate: ticN / lines.length, quotedRate: qN / lines.length };
}

// ---- text lint: glue bugs, grammar slips, seasonal slips and tics in generated text. Each rule: [name, regex-or-fn(line) -> boolean]. Returns {name: [examples]}.
const MONTHS_OF = (tick, TPY) => Math.floor(((tick % TPY) / TPY) * 12); // 0 = Jan (the sim starts mid-year, so this is only used with the calendar when available)
const UNITS = 'days|weeks|months|years|hours|minutes|replies|times|people|posts|comments|likes|messages|neighbours|households|residents|notices|jobs|friends|visits|letters|calls|cars|bins|things|reasons';
export const LINT_RULES = [
  ['doubled word', (s) => /\b(the|a|an|of|to|in|and|for|is|at|on|with|that|was)\s+\1\b/i.test(s) && !/\bhad had\b|\bthat that\b/i.test(s)],
  ['doubled article', (s) => /\b(?:the|a|an) (?:The|A|An)\b/.test(s) || /\bthe the\b/i.test(s)],
  ['missing space', (s) => /[a-z]{3,}(something|someone|somebody|the |a |an )?[.,;:!?][A-Za-z]{2}/.test(s.replace(/\b\w+\.(com|co|org|uk)\b/g, '')) || /\b(wordsthe|wordssomething|wordssomeone|wordsa)\b|[a-z]{4,}(something said|someone said)\b/.test(s)],
  ['1 plural', (s) => new RegExp(`(^|[^\\d.,£/-])1 (${UNITS})\\b`).test(s) && !/\b1 (people|others)\b.*\b(and|or)\b/.test(s) && !/\b1 (in|of) /.test(s)],
  ['0 duration', (s) => /\bfor 0 (days|weeks|months|years|hours)\b/.test(s)],
  ['a/an', (s) => /(?<![\p{L}\p{N}'])a [aeiou]\w+/iu.test(s.replace(/(?<![\p{L}])a (uni|use|usu|user|one|once|unit|union|useful|unique|euro|european|ufo|ubiquitous)\w*/giu, '')) || /(?<![\p{L}\p{N}'])an (?!hour|honest|heir|honou?r|HR\b|MP\b|NHS|MOT|SEN|LED|HGV|HMO|FA\b|X-|IT\b|SOS|RSVP|FAQ|OK\b|[aeiou])[a-z]/iu.test(s)],
  ['slash in prose', (s) => /[A-Za-z]{2,}\/[A-Za-z]{2,}/.test(s.replace(/\b(and\/or|n\/a|yes\/no|a\/c|w\/e|24\/7|s\/he|he\/she|him\/her|his\/her|they\/them)\b/gi, '').replace(/https?:\S+/g, ''))],
  ['unbalanced brackets', (s) => (s.match(/\(/g) || []).length !== (s.match(/\)/g) || []).length],
  ['unbalanced quotes', (s) => ((s.match(/"/g) || []).length % 2) === 1],
  ['"since N days"', (s) => /\bsince \d+ (days|weeks|months|years)\b/i.test(s)],
  ['born in the', (s) => /\bBorn in the (south|north|east|west|midlands)\b/.test(s)],
  ['pulled off a business', (s) => /\b(pulled off|finished|saw) an? (business|venture)\b/i.test(s)],
  ['club at a business name', (s) => /Kutz\b.*\b(meeting|club|league|team|group)\b|\b(meeting|club|league|team|group)\b.*\bat (the )?\w* ?Kutz/i.test(s)],
  ['unfilled slot', (s) => /\{[$\w.|:?-]+\}|#[a-z][\w.:-]*#|\[object|undefined|NaN|\bnull\b/.test(s)],
  ['bells off the hour', (s) => /\bbells?\b.{0,40}\b\d{1,2}[.:]\d\d\b/i.test(s)],
  ['dangling preposition (empty street/venue slot)', (s) => /\b(?:lives?|lived|living|fast|walk(?:ed)?|down|up|along|across|round|around|noise|views?|streets?) (?:on|along|around|near|from|outside|opposite)\s*[.,;!?]/i.test(s) || /\b(?:at|near|outside|opposite|into)\s*[.!?]/i.test(s)],
  ['punctuation', (s) => /\.\.(?!\.)|,,|\s[,.!?;:]|\(\s|\s\)|\b[,.]\s*[,.]/.test(s.replace(/\.\.\./g, ''))],
];
// month-gated phrases (month 0 = Jan): [regex, months it is allowed in]
const SUNSET = [16.6, 17.5, 18.3, 20.0, 21.0, 21.7, 21.5, 20.6, 19.3, 17.9, 16.2, 15.8];
const SEASONAL = [[/\bscarf weather\b/i, [9, 10, 11, 0, 1, 2]], [/\bchristmas (tree|lights)\b/i, [10, 11, 0, 1]], [/\b(clocks (have )?gone back|first heating of the year)\b/i, [9, 10, 11]], [/\bconkers?\b/i, [8, 9, 10]], [/\bsnow\b/i, [10, 11, 0, 1, 2]], [/\bin \d degrees\b/i, [10, 11, 0, 1, 2]], [/\b(sunburn|heatwave|ice lollies)\b/i, [4, 5, 6, 7, 8]], [/\bice cream van\b/i, [3, 4, 5, 6, 7, 8]], [/\bbonfire night\b/i, [9, 10]], [/\bfireworks (again|AGAIN)\b/, [9, 10, 11, 0]]];
// "dark at Npm": only when the sun really has set by then that month (sunset <= N + 0.6, local time)
const darkTooEarly = (s, m) => { const r = /\bdark (?:at|by) (\d)(?::\d\d)?\s?pm\b/i.exec(s); return !!r && SUNSET[m] > +r[1] + 12 + 0.6; };
export function lintText(lines, ctx = {}) {
  const hits = {}, add = (k, l) => { (hits[k] ||= []).push(l.s); };
  const monthOf = ctx.monthOf || (() => null);
  for (const l of lines) {
    if (typeof l.s !== 'string') { add('non-string', { s: String(l.s) }); continue; }
    for (const [name, f] of LINT_RULES) if (f(l.s)) add(name, l);
    const m = monthOf(l.tick); if (m != null) { for (const [re, ok] of SEASONAL) if (re.test(l.s) && !ok.includes(m)) add('season: ' + re.source.slice(0, 24), l); if (darkTooEarly(l.s, m)) add('season: dark before sunset', l); }
  }
  const rec = lines.filter((l) => /Recreation Ground/.test(l.s)).length; if (rec > Math.max(3, lines.length * 0.03)) hits['long park name'] = [`${rec} of ${lines.length} lines spell out 'Recreation Ground'`];
  return hits;
}
/** Quoted punchlines ("It was always the parking"): a quoted sentence of >= 6 words repeated within `months` game-months, town-wide. The engine promises none (each is rate-limited, sim/text/engine.js `once`). */
export function quotedTicReport(lines, TPD, months = 3) {
  const seen = new Map(), out = new Map();
  for (const l of lines) for (const raw of l.s.split(/(?<=[.!?])\s+(?=[A-Z"])/)) {
    if (!/"/.test(raw) || raw.split(/\s+/).length < 6) continue; const s = raw.replace(/[^\w' ]/g, '').trim().toLowerCase(), prev = seen.get(s);
    if (prev != null && l.tick - prev < months * 30 * TPD) { const o = out.get(s) || { s: raw.trim(), n: 0 }; o.n++; out.set(s, o); } seen.set(s, l.tick);
  }
  return [...out.values()].sort((a, b) => b.n - a.n);
}
/** Tics: sentences of >= 7 words that recur within `months` game-months, anywhere in town. Returns [{s, n, minGapMonths}]. */
export function ticReport(lines, TPD, months = 6) {
  const seen = new Map(); const out = new Map();
  for (const l of lines) for (const raw of l.s.split(/(?<=[.!?"])\s+/)) {
    const s = raw.replace(/[^\w' ]/g, '').trim().toLowerCase(); if (s.split(/\s+/).length < 7) continue;
    const prev = seen.get(s); if (prev != null && l.tick - prev < months * 30 * TPD) { const o = out.get(s) || { s: raw.trim(), n: 0 }; o.n++; out.set(s, o); } seen.set(s, l.tick);
  }
  return [...out.values()].sort((a, b) => b.n - a.n);
}
const lines0 = (r) => r.lines.length;
const args = process.argv.slice(2), isMain = process.argv[1] && import.meta.url.endsWith(process.argv[1].split('/').pop());
if (isMain) {
if (args[0] === '--text') { const dump = args.indexOf('--dump') >= 0 ? args[args.indexOf('--dump') + 1] : null; const r = await textVariety(+args[1] || 1, +args[2] || 3); if (dump) fs.writeFileSync(dump, JSON.stringify(r.lines)); const bad = r.nHit > 0 || r.quotedRate > 0.003 || r.rep > lines0(r) * 0.002; /* generic chatter (r.ticRate) is reported, not gated: it is bounded by pool size */ console.log(bad ? 'TEXT VARIETY: FAIL (lint hits, quoted-punchline repeats > 0.3% of lines, or exact repeats within a month > 0.2% of lines)' : 'TEXT VARIETY OK'); process.exit(bad ? 1 : 0); }
let runs;
if (args.length) runs = args.map((f) => { const d = JSON.parse(fs.readFileSync(f, 'utf8')); return siftRun(d.events, d); });
else { runs = [1, 2, 3].map((sd) => ({ ...siftRun(demoEvents(sd)), texts: demoTexts(sd) })); console.log('(demo: synthetic event logs, 3 seeds; pass dump files for real runs)'); }
const sec = varietySection(runs, runs[0].sig);
console.log(renderRows(sec));
console.log(sec.ok ? 'VARIETY OK' : 'VARIETY: see LOW/HIGH rows');
}

// node sim/sifter/selftest.js : synthetic event log with known storylines + noise; asserts detection and perf.
import { Sifter } from './sifter.js';
import { PATTERNS } from './patterns.js';
let id = 0; const D = 144; const log = [];
const E = (type, day, actors, o = {}) => { const e = { id: id++, type, tick: day * D, actors, objects: o.objects || [], place: o.place ?? null, tags: o.tags || [], cause: o.cause ?? -1, salience: o.sal ?? 0.4, payload: o.payload || {} }; log.push(e); return e.id; };
// rivalry (1,2) with truce; romance (3,4); fall then rise (5) => redemption; revenge 6->7 then 7->6; business saga biz 90; flatshare house 70; scandal 8; noise
E('social.fallout', 1, [1, 2]); E('social.insult', 9, [2, 1]); E('crime.antisocial', 20, [1, 2]); E('social.fallout', 40, [2, 1]); E('social.reconcile', 80, [1, 2]);
E('social.friendship', 5, [3, 4]); E('life.couple', 30, [3, 4]); E('life.cohabit', 120, [3, 4]); E('life.marriage', 300, [3, 4]);
const f1 = E('work.fired', 10, [5]); const d1 = E('money.debt', 14, [5], { cause: f1 }); const ev1 = E('home.eviction', 30, [5], { cause: d1, objects: [88] }); E('life.move_out', 31, [5], { cause: ev1 }); E('life.move_in', 50, [5]);
E('work.hired', 400, [5]); E('work.promoted', 520, [5]); E('money.windfall', 640, [5]);
E('crime.theft', 5, [6, 7]); E('crime.vandalism', 60, [7, 6]);
E('biz.open', 2, [9], { objects: [90] }); E('biz.hire', 100, [9], { objects: [90] }); E('money.debt', 250, [9], { objects: [90] }); E('biz.close', 400, [9], { objects: [90] });
for (let i = 0; i < 5; i++) E('home.flatmate_join', 10 + i * 40, [20 + i], { objects: [70] }); E('social.fallout', 260, [20, 21], { objects: [70] });
E('social.secret', 3, [8]); E('social.rumour', 9, [8]); E('social.rumour', 15, [8]); E('social.scandal', 22, [8]);
const sorted = log.sort((a, b) => a.tick - b.tick || a.id - b.id);
const S = new Sifter({ patterns: PATTERNS, ticksPerDay: D });
for (const e of sorted) S.consume(e);
S.sweep(1e9);
const kinds = new Set(S.arcs.filter((a) => a.confirmed).map((a) => a.kind));
const want = ['rivalry', 'romance', 'courtship', 'fall', 'rise', 'redemption', 'revenge', 'business_saga', 'flatshare_saga', 'scandal', 'eviction_chain'];
const missing = want.filter((k) => !kinds.has(k));
for (const a of S.ranked(12, { includeQuiet: true })) console.log(S.summarise(a));
console.log('stats', JSON.stringify(S.stats()));
// perf: 10 sim-years x 500 pop ~ 150k events of mostly noise
const T0 = process.hrtime.bigint(); const P = new Sifter({ patterns: PATTERNS, ticksPerDay: D }); let seed = 1; const r = () => ((seed = (seed * 1664525 + 1013904223) >>> 0) / 4294967296);
const types = ['life.couple', 'work.fired', 'work.hired', 'social.fallout', 'social.friendship', 'money.debt', 'home.rent_rise', 'biz.open', 'life.move_out', 'social.reconcile', 'life.move_in', 'civic.campaign', 'school.result', 'conversation.chat', 'shop.buy', 'work.shift', 'health.diagnosis'];
const N = 150000; let last = -1;
for (let i = 0; i < N; i++) { const t = types[Math.floor(r() * r() * types.length)]; const a = Math.floor(r() * 500), b = Math.floor(r() * 500); P.consume({ id: i, type: t, tick: Math.floor((i / N) * 3650 * D), actors: [a, b], objects: [Math.floor(r() * 200)], place: Math.floor(r() * 60), tags: [], cause: r() < 0.3 && last >= 0 ? last : -1, salience: 0.3, payload: {} }); last = i; }
const ms = Number(process.hrtime.bigint() - T0) / 1e6;
console.log(`perf: ${N} events in ${ms.toFixed(0)}ms (${(ms / N * 1000).toFixed(1)}us/event); arcs ${P.arcs.length}, confirmed ${P.stats().arcs}`);
if (missing.length) { console.log('MISSING', missing.join(',')); process.exit(1); }
if (ms > 2000) { console.log('TOO SLOW'); process.exit(1); }
console.log('sifter selftest ok');

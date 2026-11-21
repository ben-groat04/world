// node sim/sifter/selftest.js : synthetic event log with known storylines + noise; asserts detection and perf.
import { Sifter } from './sifter.js';
import { PATTERNS } from './patterns.js';
let id = 0; const D = 144; const log = [];
const E = (type, day, actors, o = {}) => { const e = { id: id++, type, tick: day * D, actors, objects: o.objects || [], place: o.place ?? null, tags: o.tags || [], cause: o.cause ?? -1, salience: o.sal ?? 0.4, payload: o.payload || {} }; log.push(e); return e.id; };
// Larkfield names. falling_out (1,2) with truce; romance (3,4); job_loss (5) -> hired; newcomer (9); scandal (8); noise
E('social.fallout', 1, [1, 2]); E('social.fallout', 9, [2, 1]); E('civic.complaint', 20, [1, 2]); E('social.fallout', 40, [2, 1]); E('social.reconcile', 80, [1, 2]);
E('life.couple', 30, [3, 4]); E('life.cohabit', 120, [3, 4]); E('life.pregnant', 200, [3, 4]); E('life.birth', 300, [3, 4]);
const f1 = E('labour.job_lost', 10, [5]); const d1 = E('money.arrears', 14, [5], { cause: f1 }); E('money.debt_spiral', 30, [5], { cause: d1 }); E('labour.hired', 80, [5]);
E('housing.moved_in', 5, [9]); E('social.acquaint', 9, [9, 10], { tags: ['welcome'] }); E('social.friendship', 20, [9, 10]); E('group.joined', 40, [9]);
E('social.secret', 3, [8]); E('social.rumour', 9, [8]); E('social.scandal', 22, [8]);
const sorted = log.sort((a, b) => a.tick - b.tick || a.id - b.id);
const S = new Sifter({ patterns: PATTERNS, ticksPerDay: D });
for (const e of sorted) S.consume(e);
S.sweep(1e9);
const kinds = new Set(S.arcs.filter((a) => a.confirmed).map((a) => a.kind));
const want = ['falling_out', 'romance', 'job_loss', 'newcomer', 'scandal', 'welcome'];
const missing = want.filter((k) => !kinds.has(k));
for (const a of S.ranked(12, { includeQuiet: true })) console.log(S.summarise(a));
console.log('stats', JSON.stringify(S.stats()));
// perf: 10 sim-years x 500 pop ~ 150k events of mostly noise
const T0 = process.hrtime.bigint(); const P = new Sifter({ patterns: PATTERNS, ticksPerDay: D }); let seed = 1; const r = () => ((seed = (seed * 1664525 + 1013904223) >>> 0) / 4294967296);
const types = ['life.couple', 'labour.job_lost', 'labour.hired', 'social.fallout', 'social.friendship', 'money.arrears', 'housing.rent_rise', 'life.move_out', 'social.reconcile', 'housing.moved_in', 'health.diagnosis', 'group.joined'];
const N = 150000; let last = -1;
for (let i = 0; i < N; i++) { const t = r() < 0.7 ? 'shop.buy' : types[Math.floor(r() * r() * types.length)]; const a = Math.floor(r() * 500), b = Math.floor(r() * 500); P.consume({ id: i, type: t, tick: Math.floor((i / N) * 3650 * D), actors: [a, b], objects: [Math.floor(r() * 200)], place: Math.floor(r() * 60), tags: [], cause: r() < 0.3 && last >= 0 ? last : -1, salience: 0.3, payload: {} }); last = i; }
const ms = Number(process.hrtime.bigint() - T0) / 1e6;
console.log(`perf: ${N} events in ${ms.toFixed(0)}ms (${(ms / N * 1000).toFixed(1)}us/event); arcs ${P.arcs.length}, confirmed ${P.stats().arcs}`);
if (missing.length) { console.log('MISSING', missing.join(',')); process.exit(1); }
if (ms > 2000) { console.log('TOO SLOW'); process.exit(1); }
console.log('sifter selftest ok');

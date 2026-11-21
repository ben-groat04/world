// node sim/text/selftest.js [--full]  ~30 sample lines across genres from mock people/events; checks for leftovers.
import { TextEngine } from './engine.js';
import pack from '../../content/larkfield/text/index.js';
const eng = new TextEngine(pack, { seed: 7 });
const P = (id, o) => ({ id, ...o });
const people = [
  P(1, { firstName: 'Kayleigh', lastName: 'Marsh', sex: 'F', age: 16, segment: 'family', mood: 0.5, job: 'student' }),
  P(2, { firstName: 'Tomasz', lastName: 'Nowak', sex: 'M', age: 20, segment: 'student', mood: 0.3 }),
  P(3, { firstName: 'Priya', lastName: 'Shah', sex: 'F', age: 29, segment: 'young_sharer', mood: 0.6, job: 'analyst', traits: { extraversion: 0.7 } }),
  P(4, { firstName: 'Dean', lastName: 'Brook', sex: 'M', age: 38, segment: 'family', children: [1, 2], mood: 0.2, job: 'delivery driver' }),
  P(5, { firstName: 'Margaret', lastName: 'Hollis', sex: 'F', age: 78, segment: 'long_term', mood: 0.45, job: 'dinner lady' }),
  P(6, { firstName: 'Sam', lastName: 'Okafor', pronouns: 'they', age: 27, segment: 'young_sharer', mood: 0.8, job: 'barista' }),
  P(7, { firstName: 'Ahmed', lastName: 'Rahman', sex: 'M', age: 44, segment: 'settled', mood: 0.7, job: 'owner of the bakery' }),
];
const byId = new Map(people.map((p) => [p.id, p])); const people$ = (id) => byId.get(id);
const date = { year: 2031, month: 10, day: 14, weekday: 1, hour: 18, minute: 45 };
let id = 100; const ev = (type, actors, payload = {}, tags = []) => ({ id: id++, type, tick: 1, actors, objects: [], place: null, tags, cause: -1, salience: 0.5, payload });
const R = (e, ctx = {}) => eng.render(e, { people: people$, date, ...ctx });
const lines = [];
const out = (label, s) => lines.push(`${label.padEnd(20)} ${s}`);
const births = ev('life.birth', [3, 6], { baby: 'Nia', weight: 7 });
out('news headline', R(ev('biz.open', [7], { biz: 'Hollis & Rahman Bakery', kind: 'bakery' }), { genre: 'headline' }));
out('news body', R(ev('biz.open', [7], { biz: 'Rahman\'s Bakehouse', kind: 'bakery' }), { genre: 'news' }));
out('news', R(ev('home.eviction', [4], { years: 6 }), { genre: 'news' }));
out('news', R(ev('life.death', [5], { age: 78 }), { genre: 'news' }));
out('news', R(ev('social.fallout', [4, 7]), { genre: 'news' }));
out('news quiet', R('quiet', { genre: 'news' }));
for (const a of [1, 2, 3, 4, 5, 6]) out(`post.daily v=${people[a - 1].segment.slice(0, 7)}`, R('post.daily', { a }));
for (const a of [1, 3, 4, 5]) out('post rent', R(ev('home.rent_rise', [a], { pct: 12, amount: 925 }), { genre: 'post', a }));
out('post neighbours', R(births, { genre: 'post', a: 5 }));
out('post self', R(births, { genre: 'post', a: 3 }));
out('reply', R(births, { genre: 'reply', a: 2 }));
out('reply retiree', R(births, { genre: 'reply', a: 5 }));
out('msg parent', R('msg.hello', { a: 4 }));
out('msg student', R('msg.group.flat', { a: 2 }));
out('msg breakup', R(ev('life.breakup', [3, 6]), { genre: 'msg', a: 3 }));
out('msg retiree', R('msg.hello', { a: 5 }));
out('thought low', R('thought.money', { a: 4 }));
out('thought high', R('thought.money', { a: 6 }));
out('thought lonely', R('thought.lonely', { a: 5 }));
out('thought evict', R(ev('home.eviction', [2]), { genre: 'thought', a: 2 }));
out('thought they', R(ev('life.breakup', [6, 3]), { genre: 'thought', a: 6 }));
out('obit', R('obit', { a: 5, p: { years: 52, job: 'dinner lady at St Mark\'s', kids: 3, where: 'at the Royal' } }));
out('bio', R('bio', { a: 3, p: { years: 2 } }));
out('bio', R('bio', { a: 4 }));
console.log(lines.join('\n'));
// checks: unresolved markers, empties, repeats
const bad = lines.filter((l) => /#\w|\{|\}|undefined|NaN|\[ev|\[life|\[biz/.test(l));
// repetition test: 300 daily posts by 4 voices
const seen = new Map(); for (let i = 0; i < 300; i++) { const s = R('post.daily', { a: 1 + (i % 6), seed: i }); seen.set(s, (seen.get(s) || 0) + 1); }
console.log(`\nunresolved: ${bad.length}  distinct/300 daily posts: ${seen.size}  missing rules: ${[...eng.stats.missing.keys()].join(',') || 'none'}  retries: ${eng.stats.retries}`);
if (bad.length) { console.log(bad.join('\n')); process.exit(1); }

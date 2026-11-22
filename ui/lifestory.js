// A short readable life story for the inspector: one paragraph plus a timeline, built from the person's real data (memories, events, household, job).
// Pure over (world, person, facts); worker-safe. Nothing private or sensitive is shown: events/memories about mental health, addiction, crime, pregnancy loss and secrets are dropped.
import { clauseOf, occLabel } from '../sim/sifter/storylines.js';

const hsh = (n) => { let x = Math.imul(n | 0, 2654435761) >>> 0; x ^= x >>> 15; x = Math.imul(x, 2246822519) >>> 0; return (x ^ (x >>> 13)) >>> 0; };
const cap1 = (s) => (s ? s[0].toUpperCase() + s.slice(1) : s);
const aAn = (s) => (/^([aeiou]|HR\b|IT\b|MOT\b)/i.test(s) && !/^(uni|use|eu)/i.test(s) ? 'an ' : 'a ') + s;
const NUM = ['no', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight'];
const SENSITIVE = /bad patch|took over for a while|depress|anxi|mental|ptsd|psych|bipolar|eating|addict|alcohol|drug|substance|pregnancy|miscarr|burgled|assault|abuse|domestic|harass|robbed|mugg|secret|affair|arrest|convict/i;
const WHY = { 'downsize or care': 'to downsize', 'bigger home': 'for a bigger home', buy: 'to buy', job: 'for work', partner: 'to be with a partner', 'eviction or sale': 'after a notice to leave', 'better schools': 'for the schools', 'schools suburbs': 'for the schools', space: 'for more space', rent: 'to bring the rent down', 'tenancy ends': 'when the tenancy ended', health: 'for health reasons', relationship: 'after a relationship ended', bereavement: 'after a bereavement', 'business sale': 'after selling the business', retirement: 'on retiring', family: 'to be near family' };

/** Rewrites one stored memory into a plain timeline line, or null if it should not be shown. */
export function memText(w, m) {
  let t = String(m.text || '').trim(); if (!t || SENSITIVE.test(t) || m.type === 'goal') return null;
  let r;
  if ((r = /^Moved to (.+?) \(([^)]*)\)\.?$/.exec(t))) return `Moved to ${r[1]}${WHY[r[2]] ? ' ' + WHY[r[2]] : ''}.`;
  if ((r = /^Started seeing (.+?) \(met (.*)\)\.?$/.exec(t))) return `Started seeing ${r[1]}, having met ${r[2]}.`;
  if ((r = /^(Started|Left|Lost)( an? earlier job| the last job)? as (.+?)(?: \([^)]*\))?\.?$/.exec(t)) || (r = /^(Started|Left|Lost)( an? earlier job| the last job)?:? ?as (.+?)\.?$/.exec(t))) { const lab = String(r[3]).toLowerCase().replace(/\s*\([^)]*\)/g, '').trim(); const j = (w.pack && w.pack.jobs || []).find((x) => String(x.label).toLowerCase().replace(/\s*\([^)]*\)/g, '').trim() === lab || String(x.label).toLowerCase().startsWith(lab)); const nm = j ? occLabel(w, j.id) : lab.split(' / ')[0]; return `${r[1] === 'Started' ? 'Started work' : r[1] === 'Left' ? 'Left work' : 'Lost work'} as ${aAn(nm)}.`; }
  if ((r = /^(.*) an earlier job as (an? )?(.+?)\.?$/.exec(t))) return `Worked as ${aAn(r[3])} for a while.`;
  if (/ill health/i.test(t)) return 'Had to stop working.';
  if (/health scare/i.test(t)) return 'Spent a spell in hospital.';
  t = t.replace(/ \([^)]*\)(?=\.?$)/, ''); return t.endsWith('.') ? t : t + '.';
}

const SKIP_EV = new Set(['life.couple', 'life.breakup', 'life.divorce', 'life.marriage', 'life.birth', 'life.graduate', 'life.leave_home', 'life.cohabit', 'life.pregnant', 'life.engaged', 'life.funeral', 'life.will', 'life.move_out', 'life.move_in', 'life.miscarriage', 'social.acquaint', 'social.confide', 'social.kindness', 'social.secret', 'social.scandal', 'social.isolation', 'social.rumour', 'health.episode', 'health.treatment', 'health.recovered', 'health.substance', 'health.ill', 'goal.formed', 'goal.failed', 'goal.abandoned', 'goal.transformed', 'goal.invented', 'goal.deferred', 'labour.applied', 'money.cost_pressure', 'project.started', 'project.done', 'group.meeting', 'group.joined', 'group.left']);
const COLLAPSE = new Set(['money.arrears', 'money.arrears_cleared', 'money.debt_spiral', 'housing.rent_rise', 'social.fallout', 'social.reconcile', 'social.friendship']);
const FRIEND_MAX = 4, TL_MAX = 60;

/** Timeline [{tick, text, imp}] oldest first: rewritten memories plus the person's own events, repeats collapsed. */
export function timelineOf(w, p, events) {
  const out = [], seen = new Set();
  for (const m of p.memories || []) { const t = memText(w, m); if (!t) continue; const k = m.tick + '|' + t; if (seen.has(k)) continue; seen.add(k); out.push({ tick: m.tick, text: t, imp: m.importance || 2 }); }
  const mine = [];
  for (const ev of events) {
    if (SKIP_EV.has(ev.type) || /^crime\.|^kernel\.|^comms\./.test(ev.type)) continue; if ((ev.tags || []).some((t) => t === 'private' || t === 'sensitive' || t === 'secret')) continue;
    const a = ev.actors || []; if (a[0] !== p.id && !(ev.type === 'life.death' && a.includes(p.id)) && !(['social.friendship', 'social.fallout', 'social.reconcile'].includes(ev.type) && a.includes(p.id))) continue;
    if (ev.type === 'life.death' && a[0] === p.id) continue; // the person's own death is told in the header
    if (ev.type === 'goal.completed' && (ev.salience ?? 0) < 0.3) continue;
    const c = clauseOf(ev, w, [p.id]); if (!c) continue; mine.push({ ev, c });
  }
  mine.sort((x, y) => x.ev.tick - y.ev.tick);
  const DAY = w.TPD || 144, groups = [];
  for (const it of mine) { const g = COLLAPSE.has(it.ev.type) && groups.findLast((x) => x.type === it.ev.type && it.ev.tick - x.last < DAY * 300); if (g) { g.n++; g.last = it.ev.tick; g.items.push(it); } else groups.push({ type: it.ev.type, first: it.ev.tick, last: it.ev.tick, n: 1, items: [it] }); }
  let friends = groups.filter((g) => g.type === 'social.friendship'); if (friends.length > FRIEND_MAX) { const drop = new Set(friends.slice(0, friends.length - FRIEND_MAX)); for (let i = groups.length - 1; i >= 0; i--) if (drop.has(groups[i])) groups.splice(i, 1); }
  for (const g of groups) {
    const it = g.items[0], t = cap1(it.c.t + (it.c.x || '')); let text = t;
    if (g.n > 1) { const months = Math.max(1, Math.round((g.last - g.first) / DAY / 30)); text = g.type === 'money.arrears' ? `${t}, and it happened ${g.n - 1 === 1 ? 'once more' : (NUM[g.n - 1] || g.n - 1) + ' more times'} over ${months > 11 ? 'the next couple of years' : 'the following ' + (months > 1 ? months + ' months' : 'month')}` : g.type === 'money.arrears_cleared' ? 'Cleared the arrears (' + g.n + ' times, as money allowed)' : g.type === 'social.fallout' ? `${t}, and fell out again ${g.n - 1 === 1 ? 'once' : (NUM[g.n - 1] || g.n - 1) + ' times'} since` : t + ` (${g.n} times)`; }
    out.push({ ev: true, tick: g.first, text: text.endsWith('.') || text.endsWith(')') ? text : text + '.', imp: Math.min(5, Math.max(2, Math.round((it.ev.salience || 0.2) * 5))) });
  }
  out.sort((x, y) => x.tick - y.tick);
  if (out.length > TL_MAX) { const keep = out.filter((x) => x.imp >= 3); const rest = out.filter((x) => x.imp < 3).slice(-(TL_MAX - keep.length)); return keep.concat(rest).sort((x, y) => x.tick - y.tick).slice(-TL_MAX); }
  return out;
}

const years = (y) => (y < 1 ? 'less than a year' : y < 1.5 ? 'about a year' : `${Math.round(y)} years`);
const when = (w, tick) => { const d = (w.tick - tick) / (w.TPY || 52560); return d < 0.1 ? 'a few weeks ago' : d < 0.9 ? 'in the last few months' : d < 1.6 ? 'last year' : `${Math.round(d)} years ago`; };

/**
 * The paragraph. facts: {age, partner:{name,st,kind}|null, kids:[{name,age}], jobLabel, workplace, activity, yearsAtAddress, street, tenure, unit, household:n, timeline}
 * Varies wording by person id; every clause is only included when the data supports it.
 */
export function summaryOf(w, p, f) {
  const pop = p.ext.pop || {}, h = hsh(p.id), F = p.firstName, he = p.sex === 'F' ? 'she' : p.sex === 'M' ? 'he' : 'they', his = p.sex === 'F' ? 'her' : p.sex === 'M' ? 'his' : 'their', is = he === 'they' ? 'are' : 'is';
  const mem = (re) => (p.memories || []).find((m) => re.test(m.text));
  const sents = [];
  // 1. where from
  const born = mem(/^Born /), came = mem(/^Came to the UK|^Moved to the UK/), bornUK = pop.bornUK !== false && (!pop.birthplace || pop.birthplace === 'United Kingdom' || !came);
  let origin = '';
  if (born) origin = born.text.replace(/\.$/, '').replace(/^Born/, 'was born').replace(/, grew up in/, ' and grew up in');
  else if (came) origin = came.text.replace(/\.$/, '').replace(/^(Came|Moved) to the UK/, 'came to the UK').replace(/ from (\w[\w ]*?)( for work)?$/, ' from $1$2');
  else if (pop.birthplace && pop.birthplace !== 'United Kingdom' && bornUK === false) origin = 'came to the UK from ' + pop.birthplace;
  if (origin && f.age >= 5) sents.push([`${F} ${origin}, and ${is} now ${f.age}.`, `${F} is ${f.age}. ${cap1(he)} ${origin}.`, `Now ${f.age}, ${F} ${origin}.`][h % 3]);
  else sents.push(`${F} is ${f.age}${f.street ? ' and lives on ' + f.street : ''}.`);
  // 2. school / work
  const act = f.activity, jl = f.jobLabel ? f.jobLabel.toLowerCase() : '';
  const edu = { level4plus: 'a degree', level3: 'A-levels or similar', apprenticeship: 'an apprenticeship', level2: 'GCSEs', level1: 'a few GCSEs' }[pop.edu];
  if (act === 'employed' && jl) sents.push([`${cap1(he)} works as ${aAn(jl)}${f.workplace ? ', ' + f.workplace : ''}${edu && f.age < 60 ? ', and left education with ' + edu : ''}.`, `${F} is ${aAn(jl)}${f.workplace ? ' ' + f.workplace : ''}.`][(h >> 2) % 2]);
  else if (act === 'retired') { const r = mem(/^Retired/); sents.push(r ? `${cap1(he)} retired ${when(w, r.tick)}${jl ? ', having worked as ' + aAn(jl) : ''}.` : `${cap1(he)} is retired${jl ? ' after a working life as ' + aAn(jl) : ''}.`); }
  else if (act === 'student') sents.push(`${cap1(he)} ${is} still studying${f.age >= 18 ? ' at college or university' : ''}.`);
  else if (act === 'unemployed') sents.push(`${cap1(he)} ${is} between jobs${jl ? ', most recently as ' + aAn(jl) : ''}.`);
  else if (act === 'home_family') sents.push(`${cap1(he)} ${is} at home looking after the family.`);
  else if (act === 'child') sents.push(`${cap1(he)} ${is} at school.`);
  else if (act === 'sick_disabled' || act === 'other_inactive') sents.push(`${cap1(he)} ${is} not working at the moment.`);
  // 3. people and home
  const bits = [];
  const pt = f.partner; if (pt && pt.name) bits.push(pt.st === 'married' ? `married to ${pt.name.split(' ')[0]}` : pt.kind === 'off' ? `seeing ${pt.name.split(' ')[0]}, who lives elsewhere` : `with ${pt.name.split(' ')[0]}`);
  const kids = (f.kids || []).filter((k) => k.age != null); if (kids.length) bits.push(kids.length === 1 ? `a parent to ${kids[0].name} (${kids[0].age})` : `a parent of ${NUM[kids.length] || kids.length}, ${kids.slice(0, 3).map((k) => k.name + ' (' + k.age + ')').join(', ').replace(/, ([^,]*)$/, ' and $1')}${kids.length > 3 ? ' and others' : ''}`);
  if (!bits.length && f.age >= 20 && !(f.household > 1)) bits.push('living on ' + his + ' own');
  const home = f.street ? `${f.tenure ? 'a ' + f.tenure.replace(/_/g, ' ') + ' home' : 'home'} on ${f.street}${f.yearsAtAddress != null && f.yearsAtAddress >= 0.3 ? ' for ' + years(f.yearsAtAddress) : ''}` : '';
  if (bits.length && home) sents.push(`${cap1(he)} ${is} ${bits.join(' and ')}, with ${home}.`);
  else if (bits.length) sents.push(`${cap1(he)} ${is} ${bits.join(' and ')}.`);
  else if (home && !sents[0].includes(f.street || '@')) sents.push(`${cap1(he)} has ${home}.`);
  // 4. the last turning points: recent events of the person's own that mattered (event wording only: it is subject-free and past tense)
  const rec = (f.timeline || []).filter((x) => x.ev && x.tick > w.tick - (w.TPY || 52560) * 3 && x.imp >= 3 && x.tick <= w.tick).slice(-2);
  if (rec.length) { const L = (x) => x.text.replace(/[.)]+$/, '').replace(/^[A-Z](?![A-Z])/, (c) => c.toLowerCase()) + ' ' + when(w, x.tick); sents.push([`Lately ${he} ${L(rec[0])}${rec[1] ? ', and ' + L(rec[1]) : ''}.`, `The big changes recently: ${he} ${L(rec[0])}${rec[1] ? ', then ' + L(rec[1]) : ''}.`][(h >> 4) % 2].replace(/ , /g, ', ')); }
  return sents.join(' ');
}

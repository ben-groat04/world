// Facts about the world -> beliefs: event-driven news (who learns first-hand, who is told), everyday personal news, secrets (affairs, debts, health, job hunting, status).
import { TPD, clamp } from './core.js';
import { psOf } from './ties.js';
import { KINDS, KIND_LIST, addFact, learn, mkBelief, key as bkey, fkey } from './beliefs.js';

const PLACE = 100000; // place beliefs use about = PLACE + buildingId
export const placeId = (bid) => PLACE + bid;
export const isPlace = (a) => a >= PLACE;

/** Register a fact and give first-hand belief to the actors/knowers; tell close ties (unless private). Returns the fact. */
export function news(w, S, r, kind, a, o, m, ev, opts = {}) {
  const sp = isPlace(a) ? null : psOf(w, S, a);
  const f = addFact(S, w, kind, a, o, m, { sec: opts.sec, holders: [a] });
  const knowers = opts.knowers || (isPlace(a) ? [] : [a]);
  if (o && !isPlace(o) && !knowers.includes(o)) knowers.push(o);
  for (const id of knowers) { const ps = psOf(w, S, id); if (ps) learn(S, ps, mkBelief(S, kind, a, o, m, 1, -1, 0, w.tick, 1, { ev: ev || 0 })); }
  f.ev = ev || 0;
  if (f.sec) {
    if (kind !== 'job_hunting' && ev !== undefined && opts.emit !== false) w.emit('social.secret', { actors: [a], salience: 0.12, cause: ev || 0, tags: ['secret'], payload: { kind } });
    return f;
  }
  if (sp && !opts.quiet) { // people tell their close ties; the circle widens by gossip
    for (const t of sp.T.values()) {
      if (t.L > 3 || t.lv < 2 || typeof t.o !== 'number' || (t.L === 3 && r.next() > 0.25) || (t.L === 2 && r.next() > 0.75) || r.next() > 0.95) continue;
      const q = psOf(w, S, t.o); if (!q) continue;
      learn(S, q, mkBelief(S, kind, a, o, m, 0.92, a, 1, w.tick, 1, { ev: ev || 0 })); f.n = (f.n || 0);
    }
  }
  return f;
}
/** People in the same building (doorstep knowledge) learn about a household event. */
export function neighboursLearn(w, S, bid, kind, a, o, m, ev, conf = 0.8, skip = a) {
  const b = w.buildings.get(bid); if (!b) return;
  for (const id of b.residents) { if (id === skip) continue; const ps = S.ppl.get(id); if (ps) learn(S, ps, mkBelief(S, kind, a, o, m, conf, -1, 1, w.tick, 1, { ev: ev || 0 })); }
}

const EVERYDAY = (p, age, q) => {
  const w = {};
  for (const k of KIND_LIST) w[k] = KINDS[k][3];
  if (age >= 65) { w.ill *= 3; w.holiday *= 0.7; w.family_news *= 1.6; w.hobby_news *= 0.8; w.kid_news = 0.4; w.new_couple = 0; w.planning_move *= 0.5; }
  if (age < 25) { w.new_couple *= 2; w.kid_news = age < 17 ? 1 : 0; w.in_debt *= 1.5; w.job_hunting *= 1.5; w.row *= 1.5; }
  if (p.family.childrenIds.length) { w.kid_news *= 2.5; w.holiday *= 1.1; }
  else w.kid_news *= 0.15;
  if (q.activity !== 'employed') { w.job_hunting *= q.activity === 'unemployed' ? 3 : 0.2; }
  if ((q.fin && q.fin.stress > 0.5) || (q.fin && q.fin.debt > 1500)) w.in_debt *= 3;
  if (p.romance && p.romance.partnerId != null) { w.new_couple = 0; w.affair *= 1; } else w.affair = 0;
  if (q.pets && q.pets.dogs) w.new_dog = 0; if (age < 17) { w.affair = 0; w.in_debt = 0; w.drugs = 0; }
  w.noisy *= q.seg === 'students' || q.seg === 'young_sharers' ? 2.2 : 0.8;
  return w;
};
/** Weekly everyday news about a person's own life: gives conversations content. Mostly benign by construction. */
export function everyday(w, S, r, p) {
  const ps = S.ppl.get(p.id); if (!ps) return;
  const age = w.ageOf(p), q = p.ext.pop; if (age < 8) return;
  if (r.next() > 0.32) return;
  const ws = EVERYDAY(p, age, q); let tot = 0; for (const k in ws) tot += ws[k];
  let x = r.next() * tot, kind = 'holiday'; for (const k in ws) { x -= ws[k]; if (x < 0) { kind = k; break; } }
  if (kind === 'affair') { const f = news(w, S, r, 'affair', p.id, 0, 1, undefined, { sec: 1 }); return; }
  const old = S.facts.get(fkey(kind, p.id)); if (old && w.tick - old.t < 60 * TPD) return;
  const m = 1 + (r.next() < 0.25 ? 1 : 0) + (r.next() < 0.08 ? 1 : 0);
  news(w, S, r, kind, p.id, 0, m, undefined, { quiet: KINDS[kind][0] === 0 });
}
export const bk = bkey;

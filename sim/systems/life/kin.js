// Off-map kin: parents, siblings and grandparents recorded as Metropolis placeholders age and die on the same life table as residents; their deaths are bereavements for the resident
// (funeral trips off-map). Elderly parents develop care needs and an adult child (resident) may become the informal carer. Residents with a disabled partner / parent in the home are carers too.
import { clamp, wpick, ageOf, fullName, later, months, tieOf, dropTie, metro, metroAge, bump, rec, hhOf } from './util.js';
import { qxAnnual } from '../health/tables.js';

const KIN = /^(mother|father|sister|brother|grandmother|grandfather|son|daughter|son\/daughter)$/;
const careP = (a) => (a < 70 ? 0.001 : a < 75 ? 0.004 : a < 80 ? 0.009 : a < 85 ? 0.02 : a < 90 ? 0.035 : 0.05); // monthly onset of a care need

export function kinMonthly(w, rng) {
  const cal = w.pack.calibration, L = w.lf.life;
  const ms = w.lf.metro;
  for (let i = 0; i < ms.length; i++) {
    const m = ms[i]; if (!m.kin || m.dead) continue;
    const owner = w.people.get(m.owner); if (!owner || !owner.alive) continue;
    const a = metroAge(w, m); if (a < 40 && !(m.rel === 'mother' || m.rel === 'father')) continue;
    if (a < 45) continue; // sibling/parent deaths below 45 are too rare to matter at this scale; handled by 'other kin' draw below
    const need = m.care ? 1.5 : 1;
    if (rng.chance(qxAnnual(cal, a, m.sex) / 12 * need * (a >= 65 && w.lf.health && w.lf.health.mortMult ? w.lf.health.mortMult : 1))) { later(w, rng.int(1, 27) * 144, 'kin.die', { m: m.id }); continue; }
    if ((m.rel === 'mother' || m.rel === 'father' || m.rel === 'grandmother' || m.rel === 'grandfather') && !m.care && rng.chance(careP(a))) {
      m.care = { since: w.tick, hrs: rng.int(6, 30) };
      later(w, rng.int(1, 27) * 144, 'kin.care', { m: m.id });
    }
  }
  // a few young kin die too (siblings, young parents): ~tiny, represented by an annual-scale draw per owner aged 20-60
  // residents' adult siblings: use sister/brother placeholders of any age through the table (cheap: only those <45 here)
  for (let i = 0; i < ms.length; i++) {
    const m = ms[i]; if (!m.kin || m.dead) continue; const a = metroAge(w, m); if (a >= 45 || a < 18) continue;
    if (rng.chance(qxAnnual(cal, a, m.sex) / 12)) later(w, rng.int(1, 27) * 144, 'kin.die', { m: m.id });
  }
}
export const kinHandlers = {
  'kin.die'(w, d) {
    const m = metro(w, d.m); if (!m || m.dead) return; const owner = w.people.get(m.owner); if (!owner || !owner.alive) { m.dead = w.tick; return; }
    m.dead = w.tick; const a = metroAge(w, m);
    const ev = w.emit('life.kin_death', { actors: [owner.id], salience: 0.45, tags: ['death', 'family'], payload: { rel: m.rel, age: Math.round(a), name: m.name, cause: a > 75 ? 'old age' : 'illness' } });
    const t = tieOf(owner, m.id); const strength = t ? t.s : 0.5; dropTie(owner, m.id);
    w.addMemory(owner, { type: 'death', text: `${m.rel === 'son/daughter' ? 'A child' : 'Their ' + m.rel} ${m.name} died.`, otherIds: [], weight: -0.85, importance: 5 });
    if (w.commands.has('health.grief')) w.cmd('health.grief', { pid: owner.id, rel: m.rel, strength, cause: ev, name: m.name });
    const L = owner.ext.life; if (L.caring && L.caring.for === m.id) { endCaring(w, owner, 'died'); }
    bump(w, 'kin_deaths');
    // funeral trip off-map for those close enough
    if (strength > 0.3 || m.rel === 'mother' || m.rel === 'father') later(w, w.lf.life.funeralDelay ? w.lf.life.funeralDelay : 8 * 144 + rng2(w, d.m) * 5 * 144, 'funeral.trip', { pid: owner.id, rel: m.rel });
  },
  'kin.care'(w, d) {
    const m = metro(w, d.m); if (!m || m.dead || !m.care) return; const owner = w.people.get(m.owner); if (!owner || !owner.alive) return;
    const L = owner.ext.life, rng = w.rngFor('life.care'), age = ageOf(w, owner);
    if (L.caring || age < 25 || age > 72) return; // siblings/others share the load; formal care otherwise
    const p = (owner.sex === 'F' ? 0.6 : 0.4) * (owner.ext.pop.activity === 'employed' && owner.ext.pop.hours > 36 ? 0.7 : 1) * (m.where === 'a nearby town' || m.where === 'abroad' ? 0.5 : 1);
    if (!rng.chance(p)) return;
    const ev = w.emit('life.caring_start', { actors: [owner.id], salience: 0.35, tags: ['care', 'family'], payload: { rel: m.rel, hrs: m.care.hrs, offmap: true } });
    L.caring = { for: m.id, hrs: m.care.hrs, since: w.tick, kind: 'parent', ev }; bump(w, 'caring_start');
    if (w.commands.has('health.stress')) w.cmd('health.stress', { pid: owner.id, amount: 0.25, why: 'caring', cause: ev });
  },
  'funeral.trip'(w, d) {
    const p = w.people.get(d.pid); if (!p || !p.alive || !w.commands.has('routine.insert')) return;
    const t = w.time, h0 = 11, from = w.tick - Math.round(t.hourFloat * 6) + h0 * 6; // today 11:00 .. 17:30 (insert acts on today's plan)
    try { w.cmd('routine.insert', { pid: p.id, from, to: from + 39, label: `Travelling to ${d.rel === 'mother' ? 'her' : 'the'} funeral`, ptype: 3, dest: 'family_elsewhere' }); } catch (e) { /* plan not built yet */ }
    w.emit('life.funeral', { actors: [p.id], salience: 0.25, tags: ['death', 'funeral'], payload: { offmap: true, rel: d.rel } });
  },
};
const rng2 = (w, id) => (w.rngFor('life.funeralday', id).next());
export function endCaring(w, p, why) {
  const L = p.ext.life; if (!L.caring) return; const c = L.caring; L.caring = null;
  w.emit('life.caring_end', { actors: [p.id], salience: 0.25, cause: c.ev || 0, tags: ['care'], payload: { why, months: Math.round((w.tick - c.since) / (30.4 * 144)) } });
}

/** monthly: carers of co-resident disabled / dementia relatives; (health plugin keeps ext.hl). */
export function careScan(w, rng, people) {
  for (const p of people) {
    const L = p.ext.life, hl = p.ext.hl, q = p.ext.pop; if (!hl) continue;
    const a = ageOf(w, p);
    const needs = (hl.c.dementia && hl.c.dementia.sev > 0.35) || (q.health.limiting === 2 && a >= 68) || (hl.c.stroke && hl.c.stroke.sev > 0.4);
    if (!needs || L.needCare) { if (!needs && L.needCare) L.needCare = null; continue; }
    // find a carer in the household: partner first, then an adult child / parent living there
    const hh = hhOf(w, p); if (!hh) continue;
    const cand = hh.members.map((id) => w.people.get(id)).filter((x) => x && x.alive && x.id !== p.id && !x.ext.life.caring && ageOf(w, x) >= 17 && ageOf(w, x) < 80);
    const partner = cand.find((x) => L.part && L.part.id === x.id);
    const carer = partner && !(partner.ext.pop.health.limiting === 2) ? partner : cand.filter((x) => (x.family.motherId === p.id || x.family.fatherId === p.id || p.family.motherId === x.id || p.family.fatherId === x.id)).sort((x, y) => y.ext.pop.hours - x.ext.pop.hours)[0];
    L.needCare = { since: w.tick, carer: carer ? carer.id : null };
    if (carer) {
      const hrs = rng.int(14, 55), ev = w.emit('life.caring_start', { actors: [carer.id, p.id], salience: 0.4, tags: ['care', 'family'], payload: { rel: partner ? 'partner' : 'relative', hrs, offmap: false } });
      carer.ext.life.caring = { for: p.id, hrs, since: w.tick, kind: partner ? 'partner' : 'relative', ev }; bump(w, 'caring_start');
      if (w.commands.has('health.stress')) w.cmd('health.stress', { pid: carer.id, amount: 0.3, why: 'caring', cause: ev });
    }
  }
  // carers whose cared-for person died or recovered
  for (const p of people) { const c = p.ext.life.caring; if (!c || typeof c.for !== 'number') continue; const o = w.people.get(c.for); if (!o || !o.alive || !o.ext.life.needCare) endCaring(w, p, !o || !o.alive ? 'died' : 'ended'); }
}

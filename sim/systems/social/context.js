// Context tie formation (quarterly, per person): the ties people make through study, work, a shared flat and clubs with people who are NOT otherwise modelled
// (course-mates, off-map colleagues, flatmates' friends). Settled residents arrive in the founding network with a full Dunbar-style support layer; newcomers
// start with ~1/3 of it (family + a few old friends) and must build the rest. Evidence for how fast:
//  - first-year students: strangers on day 1 had on average 4.2 fellow students as friends by the end of the first year, with most ties formed in the first
//    weeks/term (Springer, Eur J Psych Educ 2020, 10.1007/s10212-020-00526-w; Hays & Oxley 1986; Buote et al. 2007 - recalled, not re-verified);
//  - work and neighbourhood supply a large share of adult friends and are replaced as people move (Kalmijn & Vermunt 2007; Mollenhorst et al. 2014 - recalled);
//  - people in their 20s have the highest network turnover; extraverts form ties faster (Roberts & Dunbar).
// The rate falls to zero as a person's support layers (L1-2, ~13 ties) fill, so settled people add (almost) none and nobody is given a target loneliness.
import NAMES from '../../../content/larkfield/names.js';
import { clamp, mkTie, relayer } from './core.js';
import { psOf } from './ties.js';

const K2 = 13; // size of the 'support + sympathy' layers a person tries to maintain (Dunbar 5 / 15)
const CTX = { school: [1.0, 0.30, 'weekly visit', 'school'], study: [1.2, 0.30, 'weekly visit', 'course'], flat: [0.5, 0.28, 'weekly visit', 'a flatmate\'s friends'], work: [0.6, 0.20, 'monthly meetup', 'work'], club: [0.3, 0.15, 'monthly meetup', 'a club/class'], online: [0.5, 0.2, 'daily messages', 'online (gaming / social media)'] };
const FRIEND_WHERE = ['elsewhere in the city', 'the city centre', 'the same area'];

export function contextTies(w, S, p, r) {
  const q = p.ext.pop, age = w.ageOf(p); if (!q || age < 11) return;
  const ps = psOf(w, S, p.id); if (!ps) return;
  let n2 = 0; for (const t of ps.T.values()) if (t.lv >= 2 && t.L <= 2) n2++;
  const sat = clamp(n2 / K2, 0, 1); if (sat >= 0.98) return;
  const E = p.personality.extraversion, hh = q.hh != null ? w.lf.households[q.hh] : null;
  const ageF = age < 30 ? 1.3 : age < 45 ? 1 : age < 65 ? 0.6 : 0.3;
  const ctx = [];
  // SECONDARY SCHOOL (11-15): the peer group is formed at school. Without it, people born in the simulation reached 16 with only kin and neighbours (n2 ~10 vs ~14.5 for the sampled founders) and a quarter of
  // them were lonely for years, a cohort leak that made 16-24 loneliness drift up as the sampled founders aged out. Adolescent school friendships are the core of the later young-adult network but turn over at
  // each transition (Wrzus et al. 2013, Psych Bull: friendship networks are largest in young adulthood and lose ~1/3 at life transitions), which the usual per-layer tie decay reproduces.
  if (age < 16) { if (q.activity === 'child' || q.school) ctx.push(['school', 1]); }
  else {
  const studying = q.activity === 'student' || (q.school && (q.school.kind === 'university' || q.school.kind === 'college'));
  if (studying && age >= 16) ctx.push(['study', q.uniStart != null && w.tick - q.uniStart < 0.4 * w.calendar.ticksPerYear ? 1.8 : 1]);
  if (q.activity === 'employed') ctx.push(['work', q.workplace && q.workplace.kind === 'onmap' ? 0.5 : 1]);
  if (hh && hh.members.some((id) => { if (id === p.id) return false; const o = w.people.get(id); return o && o.alive && w.ageOf(o) >= 18 && o.family.motherId !== p.id && p.family.motherId !== o.id && o.family.spouseId !== p.id && !(o.family.childrenIds || []).includes(p.id) && !p.family.childrenIds.includes(o.id); })) ctx.push(['flat', 1]);
  if (age >= 16 && age < 70) ctx.push(['club', 1]);
  // Online-formed friendships (gaming, social platforms, group chats): common among the young - Pew 2015 (57% of US teens made friends online), Ofcom Online Nation (16-24 are near-universal users); falls steeply with age.
  if (age >= 16 && age < 60) ctx.push(['online', age < 25 ? 1 : age < 35 ? 0.6 : 0.2]);
  }
  for (const [name, mult] of ctx) {
    const [rate, c0, fq, via] = CTX[name]; const lam = rate * mult * (0.5 + E) * ageF * (1 - sat); let k = Math.floor(lam) + (r.next() < lam - Math.floor(lam) ? 1 : 0);
    while (k-- > 0) {
      const lf = w.lf, sex = r.next() < 0.5 ? 'F' : 'M', ag = age < 16 ? clamp(Math.round(age + r.gauss(0, 1.2)), 10, 17) : clamp(Math.round(age + r.gauss(0, 4)), 16, 85), by = 2026 - ag;
      const nm = NAMES.pickName(r, NAMES.pickOrigin(r, q.eth, by, r.chance(0.5) ? q : null), sex, by), id = 'm' + (lf.metro.length + 1);
      const m = { id, name: `${nm.first} ${nm.last}`, age: ag, sex, rel: name === 'school' ? 'school friend' : name === 'study' ? 'course-mate' : name === 'work' ? 'colleague' : name === 'flat' ? 'flatmate\'s friend' : name === 'online' ? 'online friend' : 'friend from a club', where: FRIEND_WHERE[r.int(0, 2)], how: via, owner: p.id, freq: fq };
      lf.metro.push(m); S.metro.set(id, m);
      const tie = mkTie(id, { k: 'friend', r: m.rel, L: 3, c: clamp(c0 * (0.75 + 0.5 * r.next()), 0.05, 0.6), l: 0.35, e: 0.35, v: via, on: 0, lv: 2 }, w.tick); tie.fq = fq;
      ps.T.set(id, tie);
    }
  }
  relayer(ps);
}

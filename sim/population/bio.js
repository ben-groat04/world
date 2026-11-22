// Pre-history lite: every person gets ONE dated, internally consistent past as memories (world.addMemory with negative ticks).
// The timeline is built in life order so no event can contradict another: birth -> (UK arrival, for migrants) -> school/college/university -> work -> partners and
// children -> local moves -> later-life events. Every UK-located event (school, job, moving address, moving in with a partner) is clamped to AFTER arrival, every
// age-bound event (job, marriage, buying, retiring) to an age it can really happen at, and moves get reasons that fit the person's age, tenure and family at that moment.
// Also sets q.grewUp / q.arrived / q.jobSince. Texts are plain facts for the text engine to dress later. tools/lifecheck.js validates the result over a long run.
// Qualification of the era (DfE/Ofqual history): O-levels and CSEs to 1987 (first GCSE exams 1988), GCSEs after; school leaving age 15 until Sept 1972, 16 after.
import { clamp, wpick, wpickObj } from './util.js';

// A move reason is only offered when it makes sense for the person at the time of the move (age at move, tenure now, kids then, partner).
const REASON_OK = {
  downsize_or_care: (c) => c.ageAt >= 60, downsize: (c) => c.ageAt >= 50, retirement: (c) => c.ageAt >= 55, bereavement: (c) => c.ageAt >= 25, health: (c) => c.ageAt >= 30,
  buy: (c) => c.owner && c.ageAt >= 18, bigger_home: (c) => c.ageAt >= 22, upsize: (c) => c.ageAt >= 22 && c.kidsThen,
  better_schools: (c) => c.schoolKidThen, schools_suburbs: (c) => c.schoolKidThen, kids_schools: (c) => c.schoolKidThen,
  partner: (c) => c.hasPartner && c.ageAt >= 18, relationship: (c) => c.ageAt >= 20, divorce: (c) => c.ageAt >= 28 && !c.hasPartner, business_sale: (c) => c.ageAt >= 45,
  rent: (c) => !c.owner && c.ageAt >= 18, tenancy_ends: (c) => !c.owner && c.ageAt >= 18, graduate: (c) => c.ageAt >= 21 && c.degree, housemates: (c) => c.ageAt >= 18, flatmates_leave: (c) => c.ageAt >= 18,
  job: (c) => c.ageAt >= 18, space: (c) => c.ageAt >= 20, family_nearby: (c) => c.ageAt >= 25, nearer_family: (c) => c.ageAt >= 25, eviction_or_sale: (c) => !c.owner && c.ageAt >= 18,
  housing_offer: (c) => c.ageAt >= 18, overcrowding: (c) => c.ageAt >= 16, status_change: (c) => c.ageAt >= 18, chain_migration_cluster: (c) => c.ageAt >= 18, lease_end: (c) => c.ageAt >= 25,
};

const THE_PLACES = /^(Philippines|Netherlands|Gambia|Bahamas|Czech Republic|United States|Maldives|Seychelles|Congo|Ivory Coast|United Arab Emirates|UAE)$/;
const inPlace = (c) => (THE_PLACES.test(c) ? 'the ' + c : c);

export function writeBiographies(world, rng, hhs, people, { UK_PLACES }) {
  const cl = world.calendar, T0 = world.tick, Y = cl.ticksPerYear, pack = world.pack;
  const byId = new Map(people.map((p) => [p.id, p]));
  const seg = (id) => pack.meta.segments.find((s) => s.id === id);
  const at = (yearsAgo) => T0 - Math.round(yearsAgo * Y) - rng.int(0, 120);
  const mem = (p, yearsAgo, text, weight = 0, importance = 2, others = []) => { if (yearsAgo > 0.01) world.addMemory(p, { tick: at(yearsAgo), type: 'biography', text, weight, importance, otherIds: others }); };
  const info = new Map(); // per person: derived anchors every later step respects

  // ---- pass 1: where from, arrival, education: the anchors
  for (const p of people) {
    const q = p.ext.pop, age = world.ageOf(p), h = hhs[q.hh], s = seg(q.seg), occ = q.occ ? pack.jobs.find((o) => o.id === q.occ) : null;
    const birthYear = cl.dateOf(p.birthTick).y;
    const nativeHere = q.bornUK && rng.chance(q.seg === 'older_longterm' ? 0.35 : 0.1);
    q.grewUp = q.bornUK ? (nativeHere ? 'Larkfield (this neighbourhood)' : rng.pick(UK_PLACES.slice(1))) : q.birthplace;
    mem(p, age, q.bornUK ? `Born in ${q.grewUp === 'Larkfield (this neighbourhood)' ? 'the city, grew up in Larkfield' : q.grewUp}.` : `Born in ${q.birthplace}.`, 0.4, 3);
    // arrival: years ago. Never before birth, never after the current address was taken up.
    let ukYears = age; // years the person has been in the UK
    if (!q.bornUK) {
      let ya = q.seg === 'recent_arrivals' ? clamp(h.yearsAt + rng.float(0, 1.5), 0.3, 5) : age > 20 ? rng.float(2, Math.min(age - 14, 35)) : rng.float(0.5, Math.max(1, age));
      ya = Math.max(ya, (q.yearsAtAddress || 0) + 0.03); // arrived before moving into the current address
      ya = Math.min(ya, age - 0.05);                      // and after being born
      ukYears = Math.max(0.03, ya);
      q.yearsAtAddress = Math.min(q.yearsAtAddress || 0, ukYears - 0.02 > 0 ? ukYears - 0.02 : 0);
      q.arrived = at(ukYears);
      mem(p, ukYears, `Moved to the UK from ${q.birthplace}${q.seg === 'recent_arrivals' && age >= 18 ? ' for ' + wpick(rng, [['work', 3], ['family reunion', 2], ['study', 2], ['safety', 1]]) : ''}.`, 0.3, 4);
      if (ukYears > 6.5 && age - ukYears + 5.5 >= 0 && rng.chance(0.5)) mem(p, ukYears - 5.5, 'Became a British citizen.', 0.8, 3);
    }
    const ageAtArrival = age - ukYears, uk = (ageThen) => q.bornUK || ageThen >= ageAtArrival + 0.02; // is the person already in the UK at that age?
    // education, in the qualification of the era; abroad it is the home country's (or nothing)
    let eduEnd = 16; // age at which full-time education ended (earliest a job can start)
    if (age >= 4.5 && uk(4.5)) mem(p, age - 4.5, `Started primary school${nativeHere ? ' nearby' : ''}.`, 0.2, 1);
    const level = q.edu;
    if (age >= 16.2 && level && level !== 'none') {
      const examYear = birthYear + 16;
      if (uk(16)) {
        if (examYear >= 1988) mem(p, age - 16, 'Finished GCSEs.', 0.3, 2);
        else if (level === 'level1') mem(p, age - 16, examYear >= 1965 ? 'Left school with a few CSEs.' : 'Left school at 15.', 0.2, 2);
        else mem(p, age - 16, 'Took O-levels.', 0.3, 2);
      } else mem(p, age - 16, `Finished secondary school in ${inPlace(q.birthplace)}.`, 0.2, 2);
    }
    const deg = level === 'level4plus';
    if (age >= 19 && (deg || level === 'level3')) { mem(p, age - 18, `${deg ? 'Went to university' : 'Went to college'}${uk(18) ? '' : ' in ' + inPlace(q.birthplace)}.`, 0.5, 3); eduEnd = 18; }
    if (age >= 22 && deg) { mem(p, age - 21.3, 'Graduated.', 0.8, 3); eduEnd = 21.5; }
    if (age >= 20 && level === 'apprenticeship') { mem(p, age - 19, uk(19) ? 'Started an apprenticeship.' : `Started an apprenticeship in ${inPlace(q.birthplace)}.`, 0.4, 2); eduEnd = 19; }
    if (q.activity === 'student' && age >= 18) eduEnd = age; // still studying: no finished job history to tell
    info.set(p.id, { age, birthYear, q, h, s, occ, ukYears, ageAtArrival, uk, eduEnd, owner: /own|mortgage/.test((h.unit && h.unit.tenure) || '') });
  }

  // ---- pass 2: couples, told once so both partners' stories agree
  const done = new Set();
  for (const p of people) {
    const sp = p.family.spouseId != null ? byId.get(p.family.spouseId) : null, I = info.get(p.id);
    if (!sp || I.q.role === 'child' || done.has(p.id)) continue; const J = info.get(sp.id); if (!J) continue;
    done.add(p.id); done.add(sp.id);
    const young = Math.min(I.age, J.age), inUK = Math.min(I.ukYears, J.ukYears);
    let tog = clamp(rng.gauss(Math.min(12, young - 22) * 0.7 + 2, 3), 0.3, Math.max(0.5, young - 19)); // moved in together, years ago
    tog = Math.min(tog, inUK - 0.05); // never in a UK home before arriving
    I.tog = J.tog = tog;
    if (tog < 0.1) continue;
    const metYa = Math.min(tog + rng.float(0.5, 2.5), young - 16);
    const first = p.id < sp.id ? p : sp, second = first === p ? sp : p;
    if (metYa > tog + 0.1) { const how = rng.chance(0.2) ? ' through a dating app' : rng.chance(0.4) ? ' through friends' : rng.chance(0.5) ? ' at work' : ''; mem(first, metYa, `Met ${second.firstName}${how}.`, 0.8, 3, [second.id]); mem(second, metYa, `Met ${first.firstName}${how}.`, 0.8, 3, [first.id]); }
    mem(first, tog, `Moved in with ${second.firstName}.`, 0.6, 3, [second.id]); mem(second, tog, `Moved in with ${first.firstName}.`, 0.6, 3, [first.id]);
    if (p.romance.status === 'married') { const mY = Math.min(tog - 0.05, Math.max(0.2, tog - rng.float(0, 3)), young - 18); if (mY > 0.1) { mem(first, mY, `Married ${second.firstName}.`, 0.9, 4, [second.id]); mem(second, mY, `Married ${first.firstName}.`, 0.9, 4, [first.id]); } }
  }

  // ---- pass 3: work, family, moves, later life
  for (const p of people) {
    const I = info.get(p.id), { q, h, s, occ, age, ukYears, eduEnd, owner } = I;
    const kids = p.family.childrenIds.map((id) => byId.get(id)).filter(Boolean), kidAges = kids.map((c) => world.ageOf(c));
    const youngestKid = kidAges.length ? Math.min(...kidAges) : null;
    // the latest a UK job/event can have started (years ago): after leaving education and after arriving
    const maxYa = Math.min(age - eduEnd, ukYears - 0.05);
    if (age >= 16 && occ && q.activity === 'employed' && maxYa > 0.1) {
      const inJob = clamp(rng.float(0.3, 9), 0.1, maxYa * 0.9); // same draw the labour plugin makes for job tenure; here capped by education and arrival
      q.jobSince = T0 - Math.round(inJob * Y);
      mem(p, inJob, `Started as ${occ.label.toLowerCase()}.`, 0.5, 3);
      const left = inJob + rng.float(0.15, 1.6);
      if (age > 24 && left < maxYa - 0.1 && rng.chance(0.7)) mem(p, left, `Left an earlier job as ${rng.pick(['a shop assistant', 'a waiter', 'an admin temp', 'a warehouse picker', 'a call-centre adviser', 'a care assistant'])}.`, -0.1, 2);
    } else if (q.activity === 'unemployed' && age > 20) mem(p, Math.min(rng.float(0.2, 3), ukYears - 0.05, age - eduEnd), rng.chance(0.4) ? 'Made redundant.' : 'Left the last job; looking for work.', -0.6, 3);
    else if (q.activity === 'retired') mem(p, rng.float(0.5, Math.max(1, age - 60)), 'Retired from work.', 0.3, 3);
    else if (q.activity === 'sick_disabled' && maxYa > 0.6) mem(p, Math.min(rng.float(0.5, 8), maxYa), `Stopped working because of ${q.health.conds[0] || 'ill health'}.`, -0.7, 4);
    // children (the parent's side of the story; the child's own birth is its first entry)
    const born = new Set(); // twins share one birth: one entry for the pair
    for (const c of kids) { if (born.has(c.id)) continue; const tw = kids.filter((x) => x !== c && Math.abs(x.birthTick - c.birthTick) < 3 * 144); tw.forEach((x) => born.add(x.id)); mem(p, world.ageOf(c), tw.length ? `${[c, ...tw].map((x) => x.firstName).join(' and ')} were born (twins).` : `${c.firstName} was born.`, 0.95, 5, [c.id, ...tw.map((x) => x.id)]); }
    if (q.role === 'head' && h.arch.startsWith('lone_parent') && youngestKid != null && youngestKid > 0.6) mem(p, Math.min(rng.float(0.5, 8), youngestKid - 0.15, ukYears - 0.05), `Separated from the children's ${p.sex === 'F' ? 'father' : 'mother'}.`, -0.6, 4);
    if (q.role === 'head' && (h.arch === 'one_person_66plus' || h.arch === 'couple_66plus') && !p.family.spouseId && rng.chance(0.55)) mem(p, rng.float(1, 14), `${p.sex === 'F' ? 'Her husband' : 'His wife'} died.`, -0.9, 5);
    else if (age > 30 && !p.family.spouseId && q.role === 'head' && rng.chance(0.3)) mem(p, Math.min(rng.float(1, 9), age - 19, ukYears - 0.05), 'A long relationship ended.', -0.5, 3);
    // the move into the current address: nobody "moves" to the home they were born and raised in, and a child never moves "for work"
    const sinceYa = Math.min(h.yearsAt, q.yearsAtAddress + 0.01);
    if (sinceYa < age - 0.1 && sinceYa > 0.02 && age - sinceYa >= 2) { // (a baby's house moves are not narrated)
      const ageAt = age - sinceYa; let mr = null;
      if (ageAt >= 18 && q.role !== 'child') {
        const ctx = { ageAt, owner, hasPartner: !!p.family.spouseId && (I.tog || 0) >= sinceYa - 0.5, kidsThen: kidAges.some((k) => k > sinceYa), schoolKidThen: kidAges.some((k) => k - sinceYa >= 3 && k - sinceYa <= 16), degree: q.edu === 'level4plus' };
        for (let t = 0; t < 10 && !mr; t++) { const r = wpickObj(rng, s.mobility.moveReasons); if (!r || (REASON_OK[r] ? REASON_OK[r](ctx) : true)) mr = r; }
      } else mr = 'with the family'; // a child or teenager moves with their parents
      mem(p, sinceYa, `Moved to ${h.unit.address}${mr ? ' (' + mr.replace(/_/g, ' ') + ')' : ''}.`, 0.2, 3);
    }
    // later-life events
    if (age >= 45 && rng.chance(0.4)) mem(p, rng.float(0.5, 8), `${rng.pick(['Mother', 'Father'])} died.`, -0.8, 5);
    if (age >= 40 && rng.chance(0.15)) mem(p, rng.float(0.3, 6), `Health scare: ${q.health.conds[0] || 'a hospital stay'}.`, -0.6, 3);
    if (age >= 16 && rng.chance(0.12)) mem(p, Math.min(rng.float(0.3, 5), age - 15), rng.pick(['Holiday abroad that was a highlight of the year.', 'Was burgled; never felt quite as safe after.', 'Won a local competition.', 'Had a bad fall-out with a friend.', 'Ran a first 10k.']), 0.2, 2);
    p.memories.sort((a, b) => a.tick - b.tick);
  }
}
export default writeBiographies;

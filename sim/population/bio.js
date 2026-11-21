// Pre-history lite: every person gets a dated, plausible past as memories (world.addMemory with negative ticks): birth place, arrival in the UK, schooling,
// education, jobs, partners/children, moves, bereavements, health events. Also sets q.grewUp / q.arrived. Texts are plain facts for the text engine to dress later.
import { clamp, wpick, wpickObj } from './util.js';

export function writeBiographies(world, rng, hhs, people, { UK_PLACES }) {
  const cl = world.calendar, T0 = world.tick, Y = cl.ticksPerYear, pack = world.pack;
  const byId = new Map(people.map((p) => [p.id, p]));
  const seg = (id) => pack.meta.segments.find((s) => s.id === id);
  const at = (yearsAgo) => T0 - Math.round(yearsAgo * Y) - rng.int(0, 300);
  const mem = (p, yearsAgo, text, weight = 0, importance = 2, others = []) => world.addMemory(p, { tick: at(yearsAgo), type: 'biography', text, weight, importance, otherIds: others });
  for (const p of people) {
    const q = p.ext.pop, age = world.ageOf(p), h = hhs[q.hh], s = seg(q.seg), occ = q.occ ? pack.jobs.find((o) => o.id === q.occ) : null;
    // where from
    const nativeHere = q.bornUK && rng.chance(q.seg === 'older_longterm' ? 0.35 : 0.1);
    q.grewUp = q.bornUK ? (nativeHere ? 'Larkfield (this neighbourhood)' : rng.pick(UK_PLACES.slice(1))) : q.birthplace;
    mem(p, age, q.bornUK ? `Born in ${q.grewUp === 'Larkfield (this neighbourhood)' ? 'the city, grew up in Larkfield' : q.grewUp}.` : `Born in ${q.birthplace}.`, 0.4, 3);
    if (!q.bornUK) {
      const ya = q.seg === 'recent_arrivals' ? clamp(h.yearsAt + rng.float(0, 1.5), 0.3, 5) : age > 20 ? rng.float(2, Math.min(age - 14, 35)) : rng.float(0.5, Math.max(1, age));
      q.arrived = at(ya);
      mem(p, ya, `Moved to the UK from ${q.birthplace}${q.seg === 'recent_arrivals' ? ' for ' + wpick(rng, [['work', 3], ['family reunion', 2], ['study', 2], ['safety', 1]]) : ''}.`, 0.3, 4);
      if (ya > 6 && rng.chance(0.5)) mem(p, ya - 5.5, 'Became a British citizen.', 0.8, 3);
    }
    // school & education
    if (age >= 5) mem(p, age - 4.5, `Started primary school${nativeHere ? ' nearby' : ''}.`, 0.2, 1);
    if (age >= 17 && !['none'].includes(q.edu)) mem(p, age - 16, 'Finished GCSEs.', 0.3, 2);
    if (age >= 19 && (q.edu === 'level4plus' || q.edu === 'level3')) mem(p, age - 18, q.edu === 'level4plus' ? 'Went to university.' : 'Started college (A-levels / BTEC).', 0.5, 3);
    if (age >= 22 && q.edu === 'level4plus') mem(p, age - 21.3, 'Graduated.', 0.8, 3);
    if (age >= 20 && q.edu === 'apprenticeship') mem(p, age - 19, 'Started an apprenticeship.', 0.4, 2);
    // job history
    if (age >= 20 && occ && q.activity === 'employed') {
      const inJob = clamp(rng.gauss(Math.min(6, age - 20) * 0.6 + 1, 2.2), 0.2, age - 18);
      mem(p, inJob, `Started as ${occ.label.toLowerCase()}.`, 0.5, 3);
      if (age > 26 && inJob < age - 24 && rng.chance(0.7)) mem(p, Math.min(age - 19, inJob + rng.float(2, 7)), `Left an earlier job as ${rng.pick(['a shop assistant', 'a waiter', 'an admin temp', 'a warehouse picker', 'a call-centre adviser', 'a care assistant'])}.`, -0.1, 2);
    } else if (q.activity === 'unemployed' && age > 20) mem(p, rng.float(0.2, 3), rng.chance(0.4) ? 'Made redundant.' : 'Left the last job; looking for work.', -0.6, 3);
    else if (q.activity === 'retired') mem(p, rng.float(0.5, Math.max(1, age - 60)), 'Retired from work.', 0.3, 3);
    else if (q.activity === 'sick_disabled') mem(p, rng.float(0.5, 8), `Stopped working because of ${q.health.conds[0] || 'ill health'}.`, -0.7, 4);
    // partners and children
    if (p.family.spouseId && q.role !== 'child') {
      const sp = byId.get(p.family.spouseId), tog = clamp(rng.gauss(Math.min(12, age - 22) * 0.7 + 2, 3), 0.3, Math.max(0.5, age - 19));
      if (p.id < sp.id) { mem(p, tog + rng.float(0.5, 2.5), `Met ${sp.firstName}${rng.chance(0.2) ? ' through a dating app' : rng.chance(0.4) ? ' through friends' : rng.chance(0.5) ? ' at work' : ''}.`, 0.8, 3, [sp.id]); mem(p, tog, `Moved in with ${sp.firstName}.`, 0.6, 3, [sp.id]); if (p.romance.status === 'married') mem(p, Math.max(0.2, tog - rng.float(0, 3)), `Married ${sp.firstName}.`, 0.9, 4, [sp.id]); }
      else { mem(p, tog + 1, `Met ${sp.firstName}.`, 0.8, 3, [sp.id]); mem(p, tog, `Moved in with ${sp.firstName}.`, 0.6, 3, [sp.id]); }
    }
    for (const cid of p.family.childrenIds) { const c = byId.get(cid); if (c) mem(p, world.ageOf(c), `${c.firstName} was born.`, 0.95, 5, [c.id]); }
    if (q.role === 'head' && h.arch.startsWith('lone_parent')) mem(p, rng.float(0.5, 8), `Separated from the children's ${p.sex === 'F' ? 'father' : 'mother'}.`, -0.6, 4);
    if (q.role === 'head' && (h.arch === 'one_person_66plus' || h.arch === 'couple_66plus') && !p.family.spouseId && rng.chance(0.55)) mem(p, rng.float(1, 14), `${p.sex === 'F' ? 'Her husband' : 'His wife'} died.`, -0.9, 5);
    else if (age > 30 && !p.family.spouseId && q.role === 'head' && rng.chance(0.3)) mem(p, rng.float(1, 9), `A long relationship ended.`, -0.5, 3);
    // moves
    if (q.role !== 'child' || age > 8) { const mr = wpickObj(rng, s.mobility.moveReasons); mem(p, Math.min(h.yearsAt, q.yearsAtAddress + 0.01), `Moved to ${h.unit.address}${mr ? ' (' + mr.replace(/_/g, ' ') + ')' : ''}.`, 0.2, 3); }
    // later-life events
    if (age >= 45 && rng.chance(0.4)) mem(p, rng.float(0.5, 8), `${rng.pick(['Mother', 'Father'])} died.`, -0.8, 5);
    if (age >= 40 && rng.chance(0.15)) mem(p, rng.float(0.3, 6), `Health scare: ${q.health.conds[0] || 'a hospital stay'}.`, -0.6, 3);
    if (age >= 16 && rng.chance(0.12)) mem(p, rng.float(0.3, 5), rng.pick(['Holiday abroad that was a highlight of the year.', 'Was burgled; never felt quite as safe after.', 'Won a local competition.', 'Had a bad fall-out with a friend.', 'Ran a first 10k.']), 0.2, 2);
    p.memories.sort((a, b) => a.tick - b.tick);
  }
}
export default writeBiographies;

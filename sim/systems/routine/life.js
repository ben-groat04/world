// Static per-person habit profile (chronotype, weekly venue rates, favourite venues) + the shared context used by the plan builder.
import { dice, clamp, logn } from '../../population/util.js';
import { openingsFor, isOpenAt } from '../../population/venues.js';
import { A, MODE_IDX } from './acts.js';
import { wakeHour, workToday } from './plan.js';

export function makeCtx(world, pack) {
  const M = world.map.lf, offKeys = Object.keys(pack.meta.offmap), segs = pack.meta.segments.map((s) => s.id);
  const cal = world.calendar, byT = {};
  for (const v of M.venues) (byT[v.template] || (byT[v.template] = [])).push(v);
  const station = world.map.station;
  const ctx = {
    world, pack, cal, map: M, venuesBy: byT, destKeys: offKeys, destIdx: Object.fromEntries(offKeys.map((k, i) => [k, i])), destName: offKeys.map((k) => k.replace(/_/g, ' ')),
    rt: { startDow: cal.recAt(0).dow }, segIdx: Object.fromEntries(segs.map((s, i) => [s, i])), nseg: segs.length, tu: null, tuh: null, gwx: station ? station.x : 0, gwy: station ? station.y : 0,
    schoolB: byT.primary_school ? byT.primary_school[0].buildingId : null, nurseryB: byT.nursery ? byT.nursery[0].buildingId : null, gpB: byT.gp_surgery ? byT.gp_surgery[0].buildingId : null,
    ageOf: (p) => world.ageOf(p), runCache: new Map(),
  };
  ctx.wakeHour = (p, D) => wakeHour(ctx, p, D);
  ctx.hhKidsSchool = (p, rec) => rec.schoolDay && p.ext.rt.life.primaryKids > 0;
  // who does the school run / pick-up today: first adult (head/partner order alternates by day) who is free at the time -> bit 1 morning, bit 2 pick-up
  ctx.schoolRun = (p, D, rec) => {
    const L = p.ext.rt.life; if (!L.primaryKids) return 0;
    const hh = world.lf.households[p.ext.pop.hh];
    let c = ctx.runCache.get(hh.id);
    if (!c || c.D !== D) {
      const ad = hh.members.map((id) => world.people.get(id)).filter((x) => x && world.ageOf(x) >= 18 && x.ext.rt);
      if (dice(hh.id, D, 77) < 0.5) ad.reverse();
      let m = -1, k = -1;
      for (const a of ad) { const w = workToday(ctx, a, D, rec); if (m < 0 && (!w || w.s >= 9.3 || (w.kind === 'onmap' && w.s >= 8.95) || w.kind === 'home') && !(w && w.night)) m = a.id; if (k < 0 && (!w || w.e <= 15.6 || w.kind === 'home') && !(w && w.night && w.s < 15)) k = a.id; }
      c = { D, m, k }; ctx.runCache.set(hh.id, c);
    }
    return (c.m === p.id ? 1 : 0) | (c.k === p.id ? 2 : 0);
  };
  const open = (v, rec, h0, h1) => { const iv = openingsFor(pack, v, rec.dow, rec.bankHoliday); return isOpenAt(iv, h0) && isOpenAt(iv, Math.min(h1, 23.9)); };
  /** Convert a wish ({kind,a,dur}) into a concrete block or null (closed venue / nothing to go to). */
  ctx.makeOuting = (p, D, rec, wsh, L, q) => {
    const id = p.id, fav = L.fav, k = wsh.kind;
    const b = (act, bid, v, extra = {}) => { if (bid == null) return null; if (v && !open(v, rec, wsh.a, wsh.a + wsh.dur)) return null; return { act, pt: 1, pid: bid, dur: wsh.dur, tripBefore: 0, tripAfter: 0, ...extra }; };
    const venue = (bid) => M.venues.find((x) => x.buildingId === bid);
    switch (k) {
      case 'shop': { const bid = fav.shops.length > 1 && dice(id, D, 9) < 0.35 ? fav.shops[1] : fav.shops[0]; return b(A.shop, bid, venue(bid)); }
      case 'cafe': return b(A.cafe, fav.cafe, venue(fav.cafe));
      case 'pub': return b(A.pub, fav.pub, venue(fav.pub));
      case 'gym': return b(A.gym, fav.gym, venue(fav.gym));
      case 'library': return b(A.library, fav.library, venue(fav.library));
      case 'community': return b(A.community, fav.community, venue(fav.community));
      case 'pharmacy': return b(A.errand, fav.pharmacy, venue(fav.pharmacy));
      case 'launderette': return b(A.errand, fav.launderette, venue(fav.launderette));
      case 'takeaway': return b(A.takeaway, fav.takeaway, venue(fav.takeaway));
      case 'barber': return b(A.errand, fav.barber, venue(fav.barber));
      case 'park': { const pb = world.map.areaPlaces.park; return pb == null ? null : { act: A.park, pt: 1, pid: pb, dur: wsh.opts.dog ? 0.6 : wsh.dur, tripBefore: 0, tripAfter: 0 }; }
      case 'visit': {
        const ties = q.ties.filter((t) => t.on && t.t <= 2 && (t.k === 'friend' || t.k === 'kin') && typeof t.o === 'number');
        const cand = ties.filter((t) => world.people.get(t.o) && world.people.get(t.o).ext.pop.hh !== q.hh);
        if (!cand.length) return null;
        const t = cand[Math.floor(dice(id, D, 31) * cand.length)], f = world.people.get(t.o);
        return { act: A.visit, pt: 1, pid: f.homeId, aux: f.id, dur: wsh.dur, tripBefore: 0, tripAfter: 0 };
      }
      case 'offsocial': case 'nightout': case 'family_off': case 'retail_trip': {
        const dk = k === 'family_off' ? 'family_elsewhere' : k === 'retail_trip' ? 'retail_park' : (q.seg === 'recent_arrivals' || q.seg === 'older_longterm') && dice(id, D, 32) < 0.6 ? 'other_neighbourhood' : 'city_centre_retail_leisure';
        const dm = pack.meta.offmap[dk].minutes;
        const mode = k === 'retail_trip' && q.car ? 'drive' : k === 'nightout' && dm.rail ? (dice(id, D, 33) < 0.5 ? 'rail' : 'bus') : q.car && dm.drive && k !== 'nightout' ? 'drive' : dm.rail ? 'rail' : dm.bus ? 'bus' : 'drive';
        const mins = (dm[mode] + 8) / 60, di = ctx.destIdx[dk];
        return { act: k === 'nightout' ? A.nightout : k === 'family_off' ? A.family_off : k === 'retail_trip' ? A.retail_trip : A.offsocial, pt: 3, pid: di, dur: wsh.dur, tripBefore: mins, tripAfter: mins, tripId: di * 8 + MODE_IDX[mode] };
      }
    }
    return null;
  };
  return ctx;
}

const dist = (a, b) => Math.abs(a.x - b.x) + Math.abs(a.y - b.y);
export function makeLife(world, ctx, p) {
  const rng = world.rngFor('life', p.id), q = p.ext.pop, pack = ctx.pack, seg = pack.meta.segments.find((s) => s.id === q.seg), age = world.ageOf(p), pers = p.personality;
  const hh = world.lf.households[q.hh], home = world.buildings.get(p.homeId).door;
  const chrono = rng.gauss(0, 0.55) + (age < 30 ? 0.35 : age > 60 ? -0.4 : 0) + (q.seg === 'students' ? 0.4 : 0);
  const unstructured = q.activity === 'unemployed' || q.activity === 'sick_disabled' || q.activity === 'other_inactive';
  const wakeWd = clamp(6.9 + 0.8 * chrono + (q.activity === 'student' ? 1.0 : 0) + (unstructured ? 1.4 : 0) + (q.activity === 'retired' ? -0.3 : 0) + (q.activity === 'home_family' ? -0.2 : 0), 5, 10.5);
  const L = {
    chrono: +chrono.toFixed(2), wakeWd, wakeWe: clamp(wakeWd + 1.0 + 0.5 * chrono + rng.float(0, 0.8), 6, 11.5), wakeKid: 6.9 + rng.float(-0.2, 0.3),
    bedWd: clamp(22.8 + 0.8 * chrono + (q.seg === 'students' ? 1.0 : 0) + (unstructured ? 0.6 : 0) + (age < 16 ? (age < 6 ? -3 : age < 12 ? -2.2 : -1.0) : 0) + (age > 70 ? -0.5 : 0), 19, 26), bedWe: 0,
    prep: clamp(0.45 + 0.35 * (1 - pers.conscientiousness) + (p.sex === 'F' ? 0.12 : 0) + rng.float(0, 0.2), 0.35, 1.2), homeLunch: 0.3, kids: 0, primaryKids: 0, dog: false, lv: {}, fav: { shops: [] }, digital: p.skills.digital > 0.5,
  };
  L.bedWe = L.bedWd + (age < 16 ? 0.7 : 0.7);
  if (age < 16) { L.wakeWd = 6.9; L.wakeWe = 7.4 + rng.float(0, 1.2); }
  const kids = hh.members.map((id) => world.people.get(id)).filter((x) => world.ageOf(x) < 12), pk = hh.members.map((id) => world.people.get(id)).filter((x) => x.ext.pop.school && x.ext.pop.school.kind === 'primary');
  L.kids = kids.length; L.primaryKids = pk.length;
  L.dog = hh.dogs > 0 && age >= 14 && (q.role === 'head' || q.role === 'partner' || q.role === 'adult_child') && rng.chance(0.75);
  const V = seg.venues, mult = () => Math.exp(rng.gauss(0, 0.4)), E = pers.extraversion, C = pers.conscientiousness;
  const isMus = q.religion === 'Muslim', limited = q.health.limiting === 2 ? 0.4 : age > 75 ? 0.6 : 1, money = clamp(1.25 - seg.money.pressure, 0.35, 1.1);
  const idle = unstructured || q.activity === 'retired' ? 1.3 : 1;
  const v = (...ks) => ks.reduce((a, k) => a + (V[k] || 0), 0);
  const adult = age >= 16 ? 1 : 0;
  L.lv = {
    shop: v('corner_shop', 'small_supermarket', 'ethnic_grocer') * 0.8 * mult() * limited, cafe: v('cafe') * (0.5 + E) * money * mult() * idle * limited, pub: v('pub') * (0.4 + 1.1 * E) * (isMus ? 0.07 : 1) * money * mult() * limited,
    gym: v('gym') * (0.5 + C) * mult() * (age > 60 ? 0.5 : 1) * (q.health.limiting ? 0.4 : 1), library: v('library') * mult() * idle, community: v('community_centre') * mult() * idle, pharmacy: v('pharmacy', 'gp_surgery') * 0.5 * mult() * (age > 55 ? 1.3 : 1),
    launderette: v('launderette') * (hh.tenure === 'private_rent' && hh.bedrooms <= 1 ? 1 : 0.25), takeaway: v('takeaway') * 0.6 * mult() * money, barber: 0.12 * mult(), park: v('park') * mult() * limited * (L.dog ? 0.8 : 1),
    visit: (0.35 + 2.2 * seg.social.onMapShare.closeFriends * (0.5 + E)) * mult() * limited * (age > 65 ? 1.3 : 1), offsocial: seg.social.offMapMeetupsPerMonth / 4.3 * 0.6 * (0.5 + E) * money * mult() * limited, nightout: seg.social.offMapMeetupsPerMonth / 4.3 * 0.3 * (age < 45 ? 1 : age < 60 ? 0.3 : 0.05) * (isMus && q.religiosity > 0.3 ? 0.2 : 1) * money * mult() * (hh.members.some((id) => world.ageOf(world.people.get(id)) < 6) ? 0.3 : 1),
    family: 0.14 + (seg.id === 'students' ? 0.1 : 0), retail: hh.cars ? 0.35 : 0.12,
  };
  if (!adult) L.lv.shop = 0;
  // favourites weighted by proximity
  const pickNear = (list, k = 30) => { if (!list || !list.length) return null; const w = list.map((x) => 1 / (1 + dist(home, world.buildings.get(x.buildingId).door) / k)); return rng.weighted(list, w).buildingId; };
  const bt = ctx.venuesBy;
  const grocers = [...(bt.corner_shop || []), ...(bt.small_supermarket || []), ...((q.eth !== 'white_british' ? bt.ethnic_grocer : []) || []), ...((bt.bakery || []).slice(0, 1))];
  const s1 = pickNear(grocers, 25); L.fav.shops = [s1]; const rest = grocers.filter((g) => g.buildingId !== s1); const s2 = pickNear(rest, 40); if (s2 != null) L.fav.shops.push(s2);
  L.fav.cafe = pickNear(bt.cafe, 50); L.fav.pub = pickNear(bt.pub, 50); L.fav.gym = pickNear(bt.gym, 100); L.fav.library = pickNear(bt.library, 100); L.fav.community = pickNear(bt.community_centre, 100);
  L.fav.pharmacy = pickNear(bt.pharmacy, 100); L.fav.launderette = pickNear(bt.launderette, 100); L.fav.takeaway = pickNear(bt.takeaway, 40); L.fav.barber = pickNear([...(bt.barber || []), ...(bt.salon || [])], 60);
  L.fav.worship = q.religion === 'Muslim' ? pickNear(bt.mosque) : q.religion === 'Christian' ? pickNear(bt.church) : null;
  if (q.religion === 'Muslim' && L.fav.worship == null) L.fav.worship = null;
  L.homeLunch = q.workplace.kind === 'onmap' ? clamp(0.5 - dist(home, world.buildings.get(q.workplace.bid).door) / 100, 0.05, 0.5) : 0;
  return L;
}

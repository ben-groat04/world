// Consequences plugin: the second-order effects a god intervention (or a bad month) has on ordinary lives, as mechanisms with causes. Each ripple is
// an ordinary command/act on ordinary people, linked by `cause` to the event that triggered it, so the feed, storylines and the person inspector can show "because of".
//   HEAT  (health.outbreak 'heatwave'):  heat illness among the old / chronically ill / living alone / top-floor flats; broken sleep (stress); short tempers
//         between people who share a home; people drifting to the park and the shade on warm evenings.
//     Evidence: UKHSA heat mortality monitoring 2022 (~3,000 heat-associated deaths, >80% aged 65+); Public Health England Heatwave Plan (risk: age 75+, long-term
//     conditions, living alone, top-floor flats); Committee on Climate Change 2022 (overheating in UK flats); Minor et al. 2022 (sleep loss in heat); Anderson 2001
//     (heat and irritability/aggression); Met Office / Natural England People & Nature Survey (parks are the main heatwave refuge for people without gardens).
//   MONEY (housing.rent_rise / money.arrears): couples and housemates under a sudden bill row about it (Conger et al. 1990 Family Stress Model; Relate / Money and
//     Mental Health Policy Institute: money is among the strongest predictors of conflict).
import { converse } from '../systems/social/acts.js';

const PARK = /^(park|estate_green|park_pavilion|allotments|school_grounds)$/;
const TPD = 144;

export function createConsequences() {
  let W = null; const S = { heatEid: 0, rows: [], parks: null };
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const rng = (...k) => W.rngFor('consequences', ...k);
  const parks = () => S.parks || (S.parks = [...W.buildings.values()].filter((b) => b.lf && PARK.test(b.lf.template || '')).map((b) => b.id));

  function heatDay() {
    const hs = W.lf.health && W.lf.health.heat; if (!hs || hs.until <= W.tick) return;
    const sev = clamp((hs.mort - 0.1) / 0.2, 0, 1), r = rng(W.tick), cause = S.heatEid, P = parks();
    const done = new Set();
    for (const p of W.living()) {
      const age = W.ageOf(p), pop = p.ext.pop; if (!pop || !p.ext.hl) continue;
      const hh = W.lf.households[pop.hh], unit = W.sys.housing && W.sys.housing.query.unit(p.id), b = W.buildings.get(p.homeId);
      const top = !!(unit && b && (b.lf.units || []).length > 1 && (unit.floor ?? 0) >= Math.max(1, (W.map.lf.buildings[b.id]?.storeys || 1)));
      // vulnerability (PHE heatwave plan risk factors)
      let v = age >= 85 ? 1 : age >= 75 ? 0.7 : age >= 65 ? 0.35 : age < 5 ? 0.35 : 0.04;
      v *= 1 + 0.4 * Math.min(3, Object.keys(p.ext.hl.c || {}).length); if (hh && hh.members && hh.members.length === 1) v *= 1.3; if (top) v *= 1.4;
      if (!p.ext.hl.acute && r.next() < 0.007 * v * (0.5 + sev)) W.cmd('health.illness', { pid: p.id, name: 'heat exhaustion', severity: age >= 75 ? 2 : 1, days: 3, cause });
      // broken sleep (stressful, slightly more so in a hot top-floor flat or with a baby)
      if (age >= 5 && r.next() < 0.35 + (top ? 0.3 : 0)) W.cmd('health.stress', { pid: p.id, amount: 0.02 + 0.03 * sev, why: 'broken sleep in the heat', cause });
      // short tempers inside the home
      if (age >= 16 && hh && hh.members && hh.members.length > 1 && !done.has(pop.hh) && r.next() < 0.004 * (0.5 + p.personality.neuroticism) * (0.5 + sev)) {
        done.add(pop.hh); const mates = hh.members.map((id) => W.people.get(id)).filter((q) => q && q.alive && q !== p && W.ageOf(q) >= 16);
        if (mates.length) { const q = mates[(r.next() * mates.length) | 0]; try { converse(W, W.soc, r, p, q, 0, 'the heat', false, 7, cause); } catch (e) { /* ignore */ } }
      }
    }
  }
  // Early afternoon of a heat day: who will head for the park this evening (done after the day's plan is built, so it sticks).
  function heatEvening() {
    const hs = W.lf.health && W.lf.health.heat; if (!hs || hs.until <= W.tick) return; const sev = clamp((hs.mort - 0.1) / 0.2, 0, 1), r = rng('eve', W.tick), P = parks(); if (!P.length) return;
    for (const p of W.living()) {
      const age = W.ageOf(p), pop = p.ext.pop; if (!pop || !p.ext.rt) continue; const unit = W.sys.housing && W.sys.housing.query.unit(p.id), b = W.buildings.get(p.homeId);
      const top = !!(unit && b && (b.lf.units || []).length > 1 && (unit.floor ?? 0) >= Math.max(1, (W.map.lf.buildings[b.id]?.storeys || 1)));
      if (age >= 5 && age < 75 && !p.ext.rt.off && r.next() < (top ? 0.35 : 0.2) + 0.1 * sev) {
        const bid = P[(r.next() * P.length) | 0], from = W.tick + Math.max(1, Math.round((18 - (W.time.hourFloat || 0)) * 6));
        W.cmd('routine.insert', { pid: p.id, from, to: from + 12 + ((r.next() * 6) | 0), label: 'Out in the park, too hot indoors', ptype: 1, bid });
      }
    }
  }
  function rowsDay() {
    for (let i = S.rows.length - 1; i >= 0; i--) {
      const x = S.rows[i]; if (x.due > W.tick) continue; S.rows.splice(i, 1);
      const a = W.people.get(x.a), b = W.people.get(x.b); if (!a || !b || !a.alive || !b.alive || a.ext.pop.hh !== b.ext.pop.hh) continue;
      try { converse(W, W.soc, rng(x.a, x.b, W.tick), a, b, 0, 'money', false, 7, x.cause); } catch (e) { /* ignore */ }
    }
  }
  function onMoneyShock(ev) {
    if (!ev.actors.length || (ev.payload && ev.payload.pct != null && ev.payload.pct < 8)) return;
    const p = W.people.get(ev.actors[0]); if (!p || !p.ext.pop) return; const hh = W.lf.households[p.ext.pop.hh]; if (!hh || !hh.members) return;
    const adults = hh.members.map((id) => W.people.get(id)).filter((q) => q && q.alive && W.ageOf(q) >= 18); if (adults.length < 2) return;
    const r = rng(ev.id), N = (adults[0].personality.neuroticism + adults[1].personality.neuroticism) / 2;
    if (r.next() < 0.3 + 0.4 * N) S.rows.push({ a: adults[0].id, b: adults[1].id, due: W.tick + TPD * r.int(1, 9), cause: ev.id });
  }
  return {
    name: 'consequences', version: '1.0.0', deps: ['health'],
    clocks: { day: () => { heatDay(); rowsDay(); }, hour: (w) => { if (w.time.hour === 14) heatEvening(); } },
    init(w) {
      W = w;
      if (w.events.registry.has('health.outbreak')) w.on('health.outbreak', (ev) => { if (ev.payload && ev.payload.name === 'heatwave' && ev.payload.phase === 'start') S.heatEid = ev.id; });
      for (const t of ['housing.rent_rise', 'money.arrears']) if (w.events.registry.has(t)) w.on(t, onMoneyShock);
    },
    serialize() { return { rows: S.rows, heatEid: S.heatEid }; }, deserialize(st) { if (st) { S.rows = st.rows || []; S.heatEid = st.heatEid || 0; } },
  };
}
export default createConsequences();

// Rent-doubling response: node tools/rentshock.js [--seed 1] [--pct 100] [--warm 12] [--months 6]
// Runs two identical worlds (same seed, same warm-up); one gets housing.rentShock{pct} (god mode) and both run `months` more. Prints per-month counts for private renters:
// households in rent arrears (any / > 1 month's rent), debt-spiral (payday borrowing), median rent burden (rent / net income), eviction notices served, moves out, evictions.
import { createLarkfieldWorld } from '../sim/larkfield.js';
const a = process.argv.slice(2), arg = (k, d) => (a.includes(k) ? +a[a.indexOf(k) + 1] : d);
const seed = arg('--seed', 1), pct = arg('--pct', 100), warm = arg('--warm', 12), months = arg('--months', 6);
const mk = () => { const w = createLarkfieldWorld(seed), M = Math.round(w.calendar.ticksPerYear / 12); for (let m = 0; m < warm; m++) w.run(M); return [w, M]; };
function snap(w) {
  const hs = w.lf.households.filter((h) => !h.gone && h.tenure === 'private_rent' && h.fin); const burdens = hs.map((h) => (h.fin.income > 0 ? h.rentPcm / h.fin.income : 1)).sort((x, y) => x - y);
  const med = burdens.length ? burdens[burdens.length >> 1] : 0, st = w.sys.housing.query.stats();
  return { prHh: hs.length, arrearsAny: hs.filter((h) => h.fin.rentArrears > 1).length, arrears1m: hs.filter((h) => h.fin.rentArrears > h.rentPcm).length, spiral: hs.filter((h) => h.fin.spiralEv).length, unaffordable: hs.filter((h) => h.fin.income > 0 && h.rentPcm / h.fin.income > 0.5).length, medBurden: +med.toFixed(2), notices: st.notices, localMoves: st.localMoves, leftArea: st.departures, evictions: st.evictions, debtSpiral: hs.filter((h) => h.fin.spiralEv).length };
}
const [w0, M] = mk(), [w1] = mk(); w1.sys.housing && w1.cmd('housing.rentShock', { pct });
const base0 = snap(w0), base1 = snap(w1);
console.log('month', 'ctrl', JSON.stringify(base0)); console.log('month', 'shock', JSON.stringify(base1));
for (let m = 1; m <= months; m++) { w0.run(M); w1.run(M); const s0 = snap(w0), s1 = snap(w1); const d = (s, b) => ({ ...s, notices: s.notices - b.notices, localMoves: s.localMoves - b.localMoves, leftArea: s.leftArea - b.leftArea, evictions: s.evictions - b.evictions });
  console.log('m' + m, 'ctrl ', JSON.stringify(d(s0, base0))); console.log('m' + m, 'shock', JSON.stringify(d(s1, base1))); }

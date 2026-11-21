// Outcome metrics of a run (shared by tools/check.js, tools/tune.js).  metrics(world, pop0, years) -> flat object.
export function metrics(w, pop0, years) {
  const L = w.living(), ad = L.filter((p) => w.ageOf(p) >= 16), n = ad.length || 1;
  const act = (a) => ad.filter((p) => p.ext.pop && p.ext.pop.activity === a).length / n;
  const women = L.filter((p) => p.sex === 'F' && w.ageOf(p) >= 15 && w.ageOf(p) < 45).length || 1;
  const hs = w.lf.housing.stats, nets = ad.filter((p) => p.ext.pop && p.ext.pop.activity === 'employed').map((p) => p.ext.pop.fin.net).sort((a, b) => a - b);
  const lonely = ad.filter((p) => p.ext.hl && p.ext.hl.lonely).length / n;
  const old = ad.filter((p) => w.ageOf(p) >= 65), young = ad.filter((p) => w.ageOf(p) < 25);
  const ls = (g) => (g.length ? g.filter((p) => p.ext.hl && p.ext.hl.lonely).length / g.length : 0);
  const emp = ad.filter((p) => p.ext.pop && ['employed', 'unemployed'].includes(p.ext.pop.activity));
  const rec = (w.lf.life && w.lf.life.rec) || {}, nb = (rec.births || []).length, nd = (rec.deaths || []).length;
  return {
    popRatio: L.length / pop0, employed: act('employed'), student: act('student'), home_family: act('home_family'), retired: act('retired'),
    unemployment: emp.length ? emp.filter((p) => p.ext.pop.activity === 'unemployed').length / emp.length : 0,
    tfr: (nb / years / women) * 30, birthsPerYr: nb / years, deathsPerYr: nd / years,
    lonely, lonelyYoung: ls(young), lonelyOld: ls(old), evictionsPerYr: (hs.evictions || 0) / years, movesPerYr: (hs.moves || 0) / years, arrivalsPerYr: (hs.arrivals || 0) / years, departuresPerYr: (hs.departures || 0) / years,
    medianNet: nets.length ? nets[nets.length >> 1] : 0,
  };
}
export const TARGETS = { popRatio: 1.0, employed: 0.55, student: 0.10, home_family: 0.07, unemployment: 0.06, tfr: 1.45, lonely: 0.07 };

// Story-diversity metrics (ROADMAP 5.3). Pure functions over plain data; report.js can import { varietySection }.
// run = { events:[EventRecord], arcs:[arc from Sifter], sifter?:Sifter, texts?:string[], pop:number, ticksPerYear:number }
export const entropy = (h) => { const v = Object.values(h), t = v.reduce((a, b) => a + b, 0) || 1; return -v.reduce((s, x) => s + (x ? (x / t) * Math.log2(x / t) : 0), 0); };
export function hist(items) { const h = {}; for (const x of items) h[x] = (h[x] || 0) + 1; return h; }
/** Jensen-Shannon divergence (base 2, 0..1) between two count histograms. */
export function jsd(a, b) {
  const ka = new Set([...Object.keys(a), ...Object.keys(b)]); const ta = Object.values(a).reduce((x, y) => x + y, 0) || 1, tb = Object.values(b).reduce((x, y) => x + y, 0) || 1; let d = 0;
  for (const k of ka) { const p = (a[k] || 0) / ta, q = (b[k] || 0) / tb, m = (p + q) / 2; if (p) d += 0.5 * p * Math.log2(p / m); if (q) d += 0.5 * q * Math.log2(q / m); }
  return d;
}
const toks = (s) => s.toLowerCase().replace(/[^a-z0-9£' ]+/g, ' ').split(/\s+/).filter(Boolean);
/** Text variety: distinct-line ratio, type-token ratio, n-gram repetition (share of n-gram occurrences whose n-gram appears >1 time). */
export function textVariety(texts, n = 4) {
  const lines = new Set(texts), grams = new Map(); let total = 0; const types = new Set(); let tokens = 0;
  for (const t of texts) { const w = toks(t); tokens += w.length; w.forEach((x) => types.add(x)); for (let i = 0; i + n <= w.length; i++) { const g = w.slice(i, i + n).join(' '); grams.set(g, (grams.get(g) || 0) + 1); total++; } }
  let rep = 0; for (const c of grams.values()) if (c > 1) rep += c;
  const top = [...grams.entries()].sort((a, b) => b[1] - a[1]).slice(0, 3).map(([g, c]) => `${g} (${c})`);
  return { n: texts.length, distinctLines: lines.size / Math.max(1, texts.length), ttr: types.size / Math.max(1, Math.sqrt(tokens)), ngramRep: total ? rep / total : 0, top };
}
export function medianOf(a) { if (!a.length) return 0; const s = [...a].sort((x, y) => x - y); return s[Math.floor(s.length / 2)]; }
/** Single-run metrics. */
export function runMetrics(run, sig = (a) => a.sig) {
  const { events = [], arcs = [], pop = 500, ticksPerYear = 8760 } = run; const years = Math.max(0.01, Math.max(0, ...events.map((e) => e.tick)) / ticksPerYear);
  const conf = arcs.filter((a) => a.confirmed !== false); const kinds = conf.map((a) => a.kind);
  const perDecade = {}; for (const a of conf) { const d = Math.floor(a.start / ticksPerYear / 10); (perDecade[d] ||= new Set()).add(a.kind); }
  const sigs = hist(conf.map(sig)); const kindH = hist(kinds); const top = conf.slice().sort((a, b) => b.score - a.score).slice(0, 20);
  const caused = events.filter((e) => e.cause >= 0).length, traced = events.filter((e) => e.payload?.reason || e.reason).length, placed = events.filter((e) => e.place != null || e.objects?.length).length;
  return {
    years, events: events.length, arcs: conf.length, arcsPerYearPer100: conf.length / years / (pop / 100),
    kindsPerDecade: Object.fromEntries(Object.entries(perDecade).map(([d, s]) => [d, s.size])), kindEntropy: entropy(kindH), kindEntropyNorm: Object.keys(kindH).length > 1 ? entropy(kindH) / Math.log2(Object.keys(kindH).length) : 0,
    topKindShare: conf.length ? Math.max(...Object.values(kindH)) / conf.length : 0, distinctSigsPer1000Events: Object.keys(sigs).length / Math.max(1, events.length) * 1000, sigRepetition: conf.length ? 1 - Object.keys(sigs).length / conf.length : 0,
    causalFraction: events.length ? caused / events.length : 0, medianDepthTop: medianOf(top.map((a) => a.maxDepth)), crossSystem3: top.length ? top.filter((a) => a.systems.size >= 3).length / top.length : 0,
    quietShare: conf.length ? conf.filter((a) => a.quiet).length / conf.length : 0, reasonTraced: events.length ? traced / events.length : 0, placeNamed: events.length ? placed / events.length : 0,
    typeHist: hist(events.map((e) => e.type)), sigHist: sigs, text: run.texts?.length ? textVariety(run.texts) : null,
  };
}
/** Cross-seed divergence: mean pairwise JSD of event-type and arc-signature histograms. */
export function crossSeed(metrics) {
  let t = 0, s = 0, n = 0; for (let i = 0; i < metrics.length; i++) for (let j = i + 1; j < metrics.length; j++) { t += jsd(metrics[i].typeHist, metrics[j].typeHist); s += jsd(metrics[i].sigHist, metrics[j].sigHist); n++; }
  return n ? { typeJSD: t / n, sigJSD: s / n } : null;
}
const f = (x, d = 2) => (typeof x === 'number' ? x.toFixed(d) : x);
const band = (v, lo, hi) => (v >= lo && v <= hi ? 'ok' : v < lo ? 'LOW' : 'HIGH');
/** report section: rows [name, value, status]. */
export function varietySection(runs, sig) {
  const ms = runs.map((r) => runMetrics(r, sig)); const avg = (k) => ms.reduce((s, m) => s + m[k], 0) / ms.length; const rows = [];
  rows.push(['arcs/yr/100 residents', f(avg('arcsPerYearPer100')), band(avg('arcsPerYearPer100'), 0.2, 6)]);
  rows.push(['arc-kind entropy (norm)', f(avg('kindEntropyNorm')), band(avg('kindEntropyNorm'), 0.5, 1)]);
  rows.push(['top kind share', f(avg('topKindShare')), band(avg('topKindShare'), 0, 0.35)]);
  rows.push(['distinct arc sigs/1000 ev', f(avg('distinctSigsPer1000Events')), 'info']);
  rows.push(['arc signature repetition', f(avg('sigRepetition')), 'info']);
  rows.push(['events with cause parent', f(avg('causalFraction')), band(avg('causalFraction'), 0.5, 1)]);
  rows.push(['median causal depth (top arcs)', f(avg('medianDepthTop'), 1), band(avg('medianDepthTop'), 3, 99)]);
  rows.push(['top arcs crossing >=3 systems', f(avg('crossSystem3')), 'info']);
  rows.push(['quiet-arc share', f(avg('quietShare')), band(avg('quietShare'), 0, 0.6)]);
  rows.push(['events w/ reason trace', f(avg('reasonTraced')), band(avg('reasonTraced'), 0.9, 1)]);
  rows.push(['events w/ place or object', f(avg('placeNamed')), band(avg('placeNamed'), 0.7, 1)]);
  const kd = {}; for (const m of ms) for (const [d, n] of Object.entries(m.kindsPerDecade)) (kd[d] ||= []).push(n);
  rows.push(['distinct kinds per decade', Object.entries(kd).map(([d, v]) => `d${d}:${f(v.reduce((a, b) => a + b, 0) / v.length, 0)}`).join(' ') || '-', 'info']);
  const tx = ms.filter((m) => m.text); if (tx.length) { rows.push(['text 4-gram repetition', f(tx[0].text.ngramRep), band(tx[0].text.ngramRep, 0, 0.35)]); rows.push(['text distinct lines', f(tx[0].text.distinctLines), band(tx[0].text.distinctLines, 0.8, 1)]); }
  const cs = crossSeed(ms); if (cs) { rows.push(['cross-seed JSD event types', f(cs.typeJSD, 3), 'info']); rows.push(['cross-seed JSD arc signatures', f(cs.sigJSD, 3), band(cs.sigJSD, 0.02, 0.9)]); }
  return { title: 'Variety & emergence', rows, ok: rows.every((r) => r[2] === 'ok' || r[2] === 'info') };
}
export const renderRows = (sec) => `${sec.title}\n` + sec.rows.map((r) => `  ${String(r[0]).padEnd(34)} ${String(r[1]).padEnd(14)} ${r[2]}`).join('\n');

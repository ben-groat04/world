// Social + comms section (W1-E): node tools/report.js --pack larkfield --section social   (also called from report-larkfield.js)
// Network shape by layer/segment, local acquaintance density by building type, tie churn, message volume, rumours, secrets, loneliness, neighbours, feed and chat samples.
import { createLarkfieldWorld } from '../sim/larkfield.js';
import { TICKS_PER_DAY } from '../sim/time.js';
import { bandOf } from '../sim/systems/social/index.js';
import { confidants, counts } from '../sim/systems/social/ties.js';
import { KNAMES, KINDS } from '../sim/systems/social/beliefs.js';
import { ACT } from '../sim/systems/social/acts.js';

const f = (x, n = 1) => (x == null || !Number.isFinite(x) ? 'n/a' : x.toFixed(n)), pc = (x) => (x * 100).toFixed(0) + '%';
const pad = (s, n) => String(s).padEnd(n), lp = (s, n) => String(s).padStart(n);
const mean = (a) => (a.length ? a.reduce((x, y) => x + y, 0) / a.length : 0);

export function runSocial(o = {}) {
  const out = [], years = o.years || 1, w = createLarkfieldWorld(o.seed || 1), S0 = JSON.parse(JSON.stringify({ n: w.soc.stats.newTies, l: w.soc.stats.lostTies }));
  const people0 = [...w.people.values()].filter((p) => p.alive);
  const t0 = performance.now(); w.enableProfile(); const ticks = Math.round(years * 365 * TICKS_PER_DAY); w.run(ticks); const secs = (performance.now() - t0) / 1000;
  const S = w.soc, st = S.stats, days = ticks / TICKS_PER_DAY, people = w.living().filter((p) => p.ext.pop && S.ppl.get(p.id)), ad = people.filter((p) => w.ageOf(p) >= 16);
  const SEG = w.pack.meta.segments, ageOf = (p) => w.ageOf(p);
  const prof = w.prof.sys, tot = Object.values(prof).reduce((a, b) => a + b, 0) + w.prof.people + w.prof.brain + w.prof.walk;
  out.push(`SOCIAL seed ${w.seed}, ${years}y, pop ${people.length}: ${Math.round(ticks / secs)} ticks/s (profiled) | social ${f(prof.social / days, 2)} ms/day (${pc((prof.social || 0) / (secs * 1000))} of wall) comms ${f(prof.comms / days, 2)} ms/day (${pc((prof.comms || 0) / (secs * 1000))})`);
  // ---- layers by segment
  out.push('TIES per adult by layer (support<=5 / sympathy<=15 / affinity<=50 / acquaintance), known-by-name only; off-map share; confidants; clustering target 0.1-0.3');
  for (const s of SEG) {
    const ps = ad.filter((p) => p.ext.pop.seg === s.id); if (!ps.length) continue;
    const L = [1, 2, 3, 4].map((l) => mean(ps.map((p) => counts(S.ppl.get(p.id))[l])));
    const all = ps.flatMap((p) => [...S.ppl.get(p.id).T.values()].filter((t) => t.lv >= 2)), off = all.filter((t) => !t.on).length / Math.max(1, all.length);
    const cl = ps.flatMap((p) => [...S.ppl.get(p.id).T.values()].filter((t) => t.L <= 2 && t.k === 'friend' && !t.on)); const offF = cl.length / Math.max(1, ps.flatMap((p) => [...S.ppl.get(p.id).T.values()].filter((t) => t.L <= 2 && t.k === 'friend')).length);
    const cf = ps.map((p) => confidants(S.ppl.get(p.id)));
    out.push(`  ${pad(s.id, 23)} n=${lp(ps.length, 3)}  L1 ${f(L[0])} L2 ${f(L[1])} L3 ${f(L[2])} L4 ${lp(f(L[3]), 4)}  off-map ${lp(pc(off), 4)} (close friends ${lp(pc(offF), 4)}, target ${pc(1 - s.social.onMapShare.closeFriends)})  confidants ${f(mean(cf))} zero ${pc(cf.filter((x) => !x).length / cf.length)}`);
  }
  const cfAll = ad.map((p) => confidants(S.ppl.get(p.id)));
  // clustering of the on-map band graph
  let tri = 0, trip = 0; const sample = ad.slice(0, 300);
  for (const p of sample) { const ids = S.ppl.get(p.id).top.slice(0, 20); for (let i = 0; i < ids.length; i++) for (let j = i + 1; j < ids.length; j++) { trip++; const q = S.ppl.get(ids[i]); if (q && q.T.has(ids[j])) tri++; } }
  const deg = ad.map((p) => counts(S.ppl.get(p.id)).slice(1, 4).reduce((a, b) => a + b, 0)).sort((a, b) => a - b);
  out.push(`  ALL adults: confidants mean ${f(mean(cfAll))} zero ${pc(cfAll.filter((x) => !x).length / cfAll.length)} (target 3-4 / 8-15%)  clustering ${f(tri / Math.max(1, trip), 2)}  degree(L1-3) p10 ${deg[Math.floor(deg.length * 0.1)]} median ${deg[deg.length >> 1]} p90 ${deg[Math.floor(deg.length * 0.9)]} max ${deg[deg.length - 1]}`);
  // ---- density by building type + neighbours
  const byType = new Map();
  for (const p of people) { const b = w.buildings.get(p.homeId); if (!b) continue; const k = b.lf.archetype + (b.lf.units.length > 8 ? ' (large block)' : ''); const ps = S.ppl.get(p.id); let n = 0; for (const [id, t] of ps.T) { if (typeof id !== 'number' || t.lv < 2 || t.k !== 'neighbour') continue; const o = w.people.get(id); if (!o || o.ext.pop.hh === p.ext.pop.hh) continue; const d = w.sys.social.query ? 0 : 0; const bb = w.buildings.get(o.homeId); if (bb && Math.abs(bb.door.x - b.door.x) + Math.abs(bb.door.y - b.door.y) <= 20) n++; } const kn = w.sys.social.query.neighbourKnown(p.id) ? 1 : 0; const r = byType.get(k) || [0, 0, 0]; r[0]++; r[1] += n; r[2] += kn; byType.set(k, r); }
  out.push('LOCAL ACQUAINTANCES (known by name, within ~20 tiles, other households) and share who know a neighbour by name [target 60-70% overall, lower in large blocks]:');
  out.push('  ' + [...byType].sort((a, b) => b[1][0] - a[1][0]).slice(0, 8).map(([k, r]) => `${k.replace(/_/g, ' ')} n=${r[0]} ${f(r[1] / r[0])} acq, ${pc(r[2] / r[0])} know a neighbour`).join(' | '));
  out.push(`  OVERALL know a neighbour by name: ${pc(people.filter((p) => w.sys.social.query.neighbourKnown(p.id)).length / people.length)}   monthly chat with a neighbour (>=1 known + contact): ${pc(people.filter((p) => { const ps = S.ppl.get(p.id); for (const [id, t] of ps.T) { if (typeof id === 'number' && t.lv >= 2 && (t.k === 'neighbour') && w.tick - t.la < 45 * TICKS_PER_DAY) return true; } return false; }).length / people.length)} (target 58-66%)`);
  // ---- churn
  const nonKin = ad.flatMap((p) => [...S.ppl.get(p.id).T.values()].filter((t) => t.lv >= 2 && t.k !== 'kin' && t.k !== 'partner' && t.k !== 'housemate'));
  const online = nonKin.filter((t) => /app|online/.test(t.v || '')).length / nonKin.length;
  out.push(`CHURN per 100 people/yr: new known ties ${f((st.newTies - S0.n) / years / people.length * 100, 0)}, lapsed ${f((st.lostTies - S0.l) / years / people.length * 100, 0)}, friendships faded ${f(st.fades / years / people.length * 100, 1)}; non-kin known ties/adult ${f(nonKin.length / ad.length, 1)}; online-formed ${pc(online)} of non-kin (W2-F target 11%)`);
  // ---- messages
  const nb = {}; for (const p of people) { const b = bandOf(ageOf(p)); nb[b] = (nb[b] || 0) + 1; }
  out.push('MESSAGES per person/day by age (group sends + 1:1 sent; survey UK avg ~50, 18-24 ~100+): ' + Object.keys(nb).sort().map((b) => `${b} ${f((st.msgs.byBand[b] || 0) / days / nb[b], 0)}`).join('  ') + `   1:1 calls ${f(st.calls / days, 1)}/day`);
  const ck = {}; for (const c of S.chats) { const r = ck[c.kind] || (ck[c.kind] = [0, 0]); r[0]++; r[1] += c.m.length + c.nx; }
  out.push(`GROUP CHATS ${S.chats.length}: ` + Object.entries(ck).map(([k, r]) => `${k} ${r[0]} (avg ${f(r[1] / r[0], 0)})`).join(', ') + `; people in >=1 chat ${pc(people.filter((p) => S.ppl.get(p.id).ch.length).length / people.length)}; msgs/day in groups ${f(st.msgs.grp / days, 0)}`);
  // ---- conversations & acts
  out.push(`CONVERSATIONS ${f(st.conv / days, 0)}/day  acts: ${ACT.map((a, i) => `${a} ${pc(st.acts[i] / Math.max(1, st.conv))}`).join(' ')}  venue sessions ${f(st.enc.sess / days, 0)}/day, pairs ${f(st.enc.pairs / days, 0)}/day`);
  // ---- rumours
  const R = st.rum, fb = [], tb = [];
  for (const p of people) for (const b of S.ppl.get(p.id).B.values()) if (b.a !== p.id) (b.tr ? tb : fb).push(b);
  out.push(`RUMOURS told ${R.told} (${f(R.told / days, 1)}/day), mutated ${pc(R.mut / Math.max(1, R.told))} (mishearing ${pc(R.mis / Math.max(1, R.told))}), benign ${pc(R.benign / Math.max(1, R.benign + R.nonBenign))} [>=85%]; wrong-share by hop 1..5: ${[1, 2, 3, 4, 5].map((h) => pc(R.wrongByHop[h] / Math.max(1, R.byHop[h])) + `(${R.byHop[h]})`).join(' ')}; false beliefs in stock ${pc(fb.length / Math.max(1, fb.length + tb.length))} of ${fb.length + tb.length}`);
  const lt = st.secrets.lifeTicks.slice().sort((a, b) => a - b), nfacts = [...S.facts.values()].filter((x) => x.sec).length;
  out.push(`SECRETS made ${st.secrets.made} (live ${nfacts}), confided ${st.secrets.kept}, leaked ${st.secrets.leaked}, found out ${st.secrets.revealed}; median secret life when exposed ${lt.length ? f(lt[lt.length >> 1] / TICKS_PER_DAY, 0) + ' d' : 'n/a'}; norms: incidents ${st.norm.viol} complaints ${st.norm.compl}`);
  const kinds = R.byKind.map((n, i) => [KNAMES[i], n]).filter((x) => x[1] > 0).sort((a, b) => b[1] - a[1]).slice(0, 8);
  out.push('  top rumour kinds: ' + kinds.map(([k, n]) => `${k} ${n}`).join(', '));
  // ---- loneliness
  const ls = ad.map((p) => S.ppl.get(p.id).ls).sort((a, b) => a - b), thr = o.loneThr ?? 0.15;
  const often = ad.filter((p) => S.ppl.get(p.id).ls > thr), hl = ad.filter((p) => p.ext.hl && p.ext.hl.lonely).length;
  const ob = {}; for (const p of ad) { const b = ageOf(p) < 25 ? '16-24' : ageOf(p) < 65 ? '25-64' : '65+'; (ob[b] ||= [0, 0]); ob[b][1]++; if (S.ppl.get(p.id).ls > thr) ob[b][0]++; }
  out.push(`LONELINESS often-lonely (score>${thr}) ${pc(often.length / ad.length)} [target ~7%]; by age ${Object.entries(ob).map(([k, v]) => `${k} ${pc(v[0] / v[1])}`).join(' ')}; health-plugin flag ${pc(hl / ad.length)}; score p50 ${f(ls[ls.length >> 1], 2)} p90 ${f(ls[Math.floor(ls.length * 0.9)], 2)}`);
  // ---- online
  out.push(`ONLINE posts/day: feed ${f(st.posts.feed / days, 0)} (daily ${f(st.posts.daily / days, 0)}, event ${f(st.posts.event / days, 1)}), local forum ${f(st.posts.forum / days, 1)} (members ${S.forum.members.length} = ${pc(S.forum.members.length / people.length)} of residents), viral ${st.viral}, pile-ons ${st.pile}, dating-app users ${S.dating.users.length}`);
  out.push('SAMPLE local-forum / feed posts (generated):');
  const forum = w.sys.comms.query.forum(5), feed = w.sys.comms.query.feed(40).filter((p) => p.kind === 'daily' || p.kind === 'ev').slice(-3);
  for (const p of forum) out.push(`  [forum] ${w.people.get(p.author).firstName}: ${p.text}${p.replies.length ? '   -> ' + p.replies.slice(0, 2).map((r) => `${w.people.get(r.author).firstName}: "${r.text}"`).join(' / ') : ''}`);
  for (const p of feed) out.push(`  [feed ] ${w.people.get(p.author).firstName} (${Math.floor(ageOf(w.people.get(p.author)))}): ${p.text}  (reach ${p.reach})`);
  out.push('SAMPLE group-chat snippets:');
  const chats = S.chats.filter((c) => c.ring.length >= 2).sort((a, b) => b.vol - a.vol); const seenK = new Set(); let n = 0;
  for (const c of chats) { if (seenK.has(c.kind) && n >= 3) continue; seenK.add(c.kind); const rows = w.sys.comms.query.chat(c.id, 3); out.push(`  [${c.name}] ` + rows.map((r) => `${w.people.get(r.author).firstName}: ${r.text}`).join(' | ')); if (++n >= 6) break; }
  out.push('SAMPLE rumours passed (teller -> hearer: what was said):');
  for (const x of S.rumours.slice(-4)) { const t = w.people.get(x.from), h = w.people.get(x.to), sj = w.people.get(x.subj); if (!t || !h || !sj) continue; const tx = w.commsText.render('rumour.' + x.kind, t, { b: h, s: sj, o: x.obj && w.people.get(x.obj), seed: x.t }); out.push(`  ${t.firstName} -> ${h.firstName} (hop ${x.hops}, ${x.tr ? 'true' : 'FALSE'}${x.d ? ', distorted' : ''}${x.nt ? ', secret leaking' : ''}): ${tx}`); }
  return out;
}

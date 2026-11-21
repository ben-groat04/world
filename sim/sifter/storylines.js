// Storylines: turns confirmed arcs into a short list of human stories worth following (protagonists, one-line headline, recent beats, "now" state).
// Pure over (sifter, accessors); worker-safe. Selection rules (all structural, nothing tuned to a name or an outcome):
//   - one storyline per protagonist (the strongest), at most MAXKIND per kind, nothing quiet, nothing that lapsed long ago;
//   - rank = salience carried by the beats x recency x variety of what happened (distinct event types) x kind weight (what a viewer cares about).
const MAXKIND = 3;
const KIND_W = { romance: 1.35, new_family: 1.3, bereavement: 1.2, illness: 1.15, job_loss: 1.1, breakup: 1.1, money_squeeze: 1.05, falling_out: 1.0, welcome: 1.0, ambition: 0.95, newcomer: 0.85, career: 0.8, scandal: 0.9, group_saga: 0.9 };
const NOISE = /^goal\.(step|effect|planned|replanned|deferred|formed)$|^social\.rumour$|^group\.meeting$|^kernel\.|^comms\./;
const lc = (s) => String(s || '').replace(/_/g, ' ');

// beat phrase (no subject; reads after "…"), chosen from the event type and payload.
const PH = {
  'life.couple': () => 'got together', 'social.flirt': () => 'started flirting', 'life.cohabit': () => 'moved in together', 'life.engaged': () => 'got engaged', 'life.marriage': () => 'married', 'life.pregnant': () => 'expecting a baby', 'life.birth': () => 'had a baby',
  'life.breakup': () => 'split up', 'life.divorce': () => 'divorced', 'life.move_out': () => 'moved out', 'life.move_in': () => 'moved in', 'life.leave_home': () => 'left home', 'life.caring_start': () => 'became a carer', 'life.caring_end': () => 'stopped caring', 'life.death': () => 'died', 'life.kin_death': () => 'lost a relative', 'life.funeral': () => 'went to a funeral', 'life.will': () => 'named in a will', 'life.graduate': () => 'graduated',
  'labour.job_lost': () => 'lost their job', 'labour.quit': () => 'quit', 'labour.hired': (p, w) => 'started work' + (p.occ ? ' as ' + occLabel(w, p.occ) : ''), 'labour.promoted': () => 'got promoted', 'labour.pay_rise': () => 'got a pay rise', 'labour.second_job': () => 'took a second job', 'labour.firm_closed': () => 'saw the firm close', 'labour.went_inactive': () => 'stopped looking for work', 'labour.applied': (p) => (p.ok === false ? 'turned down for a job' : 'went for a job'),
  'housing.rent_rise': (p) => `rent up ${Math.round(p.pct || 0)}%`, 'housing.notice_served': () => 'served notice', 'housing.eviction': () => 'evicted', 'housing.moved_out': () => 'moved out', 'housing.moved_in': () => 'moved in', 'housing.homeless': () => 'lost their home', 'housing.overcrowded': () => 'crowded at home',
  'money.arrears': () => 'fell behind on rent', 'money.debt_spiral': () => 'borrowing to get by', 'money.cost_pressure': () => 'feeling the squeeze', 'money.benefit_claim': () => 'claimed benefits', 'money.arrears_cleared': () => 'cleared the arrears', 'money.estate': () => 'inherited something',
  'health.diagnosis': (p) => 'diagnosed with ' + lc(p.condition), 'health.crisis': () => 'taken to hospital', 'health.accident': () => 'had an accident', 'health.episode': (p) => lc(p.kind) + ' set in', 'health.treatment': () => 'sought help', 'health.recovered': () => 'recovered', 'health.ill': (p) => 'fell ill' + (p.name ? ' (' + lc(p.name) + ')' : ''),
  'social.fallout': (p) => 'fell out' + (p.over && !CHANNEL.test(p.over) ? ' over ' + lc(p.over) : ''), 'social.reconcile': () => 'made up', 'social.friendship': () => 'became friends', 'social.acquaint': (p) => (p.via === 'welcome' ? 'welcomed to the street' : 'got talking'), 'social.confide': () => 'confided', 'social.kindness': () => 'showed kindness', 'social.secret': () => 'kept a secret', 'social.scandal': () => 'secret got out',
  'group.founded': (p) => 'founded ' + (p.name || 'a group'), 'group.joined': () => 'joined a group', 'group.conflict': () => 'clashed at a meeting', 'group.dissolved': () => 'group folded', 'group.leader_changed': () => 'took over a group', 'group.split': () => 'group split', 'civic.complaint': () => 'complained',
  'goal.completed': (p, w) => 'managed to ' + gphrase(w, p.tpl), 'goal.failed': (p, w) => 'gave up trying to ' + gphrase(w, p.tpl), 'goal.abandoned': (p, w) => 'dropped the plan to ' + gphrase(w, p.tpl), 'goal.transformed': () => 'changed plan', 'goal.invented': (p) => 'came up with ' + (p.label || 'a plan'), 'project.started': () => 'kicked off a project', 'project.done': () => 'finished a project',
};
const CHANNEL = /^(remote|asked|goal|door|work|school|group|words|introduced|regulars)/;
const occLabel = (w, id) => { const o = (w.pack && w.pack.jobs || []).find((j) => j.id === id); return o ? String(o.label).replace(/\s*\(.*\)/, '').replace(/ \/ /g, '/').toLowerCase() : lc(id); };
let GP = null; const gphrase = (w, id) => { if (!GP) { GP = new Map(); try { for (const t of w.sys.goals.query.templates()) GP.set(t.id, t.phrase); } catch (e) { /* ignore */ } } return GP.get(id) || lc(id); };

const KIND_LEAD = { romance: 'Love story', breakup: 'After the break-up', new_family: 'A growing family', job_loss: 'Out of work', money_squeeze: 'Money getting tight', newcomer: 'New to the street', falling_out: 'A falling out', illness: 'Health scare', bereavement: 'Bereavement', career: 'Getting on', scandal: 'A secret', ambition: 'A plan', welcome: 'Neighbours', group_saga: 'A club story' };
export const kindLabel = (k) => KIND_LEAD[k] || lc(k);

/** Plain recent beats of an arc as [{tick, text, type}], newest last, noise removed, duplicates in a row collapsed. */
export function beatsOf(arc, w, max = 6) {
  const out = [];
  for (let i = arc.beats.length - 1; i >= 0 && out.length < max; i--) {
    const b = arc.beats[i]; if (NOISE.test(b.type) || b.stage === 'consequence') continue; const f = PH[b.type]; if (!f) continue;
    const ev = w.events.get ? w.events.get(b.eid) : null; if (!ev || (/^goal\./.test(b.type) && (ev.salience ?? 0) < 0.2)) continue; let text; try { text = f(ev.payload || {}, w); } catch (e) { continue; }
    if (out.length && out[0].text === text) continue; out.unshift({ tick: b.tick, text, type: b.type, eid: b.eid, actors: ev.actors || [] });
  }
  return out;
}
const firstName = (w, id) => { const p = w.people.get(id); return p ? p.firstName : 'someone'; };
export const namesOf = (w, ids) => { const n = ids.map((i) => firstName(w, i)); return n.length > 2 ? n.slice(0, -1).join(', ') + ' & ' + n.at(-1) : n.join(' & '); };

/** "Priya & Tom: got together, moved in together, expecting a baby" (chain of what happened, the latest state last). */
export function headlineOf(arc, w, beats = beatsOf(arc, w, 40)) {
  const names = namesOf(w, arc.actors.filter((a) => typeof a === 'number').slice(0, 2));
  const seen = new Set(), d = []; for (const b of beats) if (!seen.has(b.text)) { seen.add(b.text); d.push(b.text); }
  if (!d.length) return `${names}: ${kindLabel(arc.kind).toLowerCase()}`;
  const chain = d.length <= 3 ? d : [d[0], ...d.slice(-2)]; // how it started, then where it has got to
  return `${names}: ${chain.join(', ')}`;
}

/**
 * The stories worth following right now.
 * @param {import('./sifter.js').Sifter} sifter  @param {object} w world  @param {{limit?:number, now?:number}} o
 */
export function storylines(sifter, w, { limit = 6, now = w.tick } = {}) {
  const tpd = sifter.tpd, cand = [];
  for (const a of sifter.arcs) {
    if (!a.confirmed || a.quiet) continue; const idle = (now - a.last) / tpd; if (idle > (a.status === 'open' ? 150 : 60)) continue;
    const types = new Set(a.beats.filter((b) => PH[b.type] && b.stage !== 'consequence').map((b) => b.type)); if (types.size < 2) continue;
    const living = a.actors.filter((id) => typeof id === 'number' && w.people.get(id) && w.people.get(id).alive); if (!living.length) continue;
    const rank = a.sum * Math.exp(-idle / 70) * (1 + 0.2 * Math.min(5, types.size)) * (KIND_W[a.kind] ?? 1) * (a.status === 'open' ? 1 : 0.8);
    cand.push({ a, rank, types: types.size });
  }
  cand.sort((x, y) => y.rank - x.rank);
  const used = new Set(), perKind = {}, out = [];
  for (const c of cand) {
    const a = c.a; if (a.actors.some((x) => used.has(x))) continue; if ((perKind[a.kind] || 0) >= MAXKIND) continue;
    const beats = beatsOf(a, w, 5); if (beats.length < 2) continue;
    used.add(a.actors[0]); for (const x of a.actors) used.add(x); perKind[a.kind] = (perKind[a.kind] || 0) + 1;
    out.push({ id: a.id, kind: a.kind, label: kindLabel(a.kind), status: a.status, outcome: a.outcome, headline: headlineOf(a, w), actors: a.actors.filter((x) => typeof x === 'number').slice(0, 3).map((id) => ({ id, name: firstName(w, id) + ' ' + (w.people.get(id)?.lastName || '') })),
      beats: beats.map((b) => ({ tick: b.tick, date: w.calendar.formatDate(b.tick), text: b.text })), since: Math.max(1, Math.round((now - a.start) / tpd)), idle: Math.round((now - a.last) / tpd), rank: Math.round(c.rank * 100) / 100 });
    if (out.length >= limit) break;
  }
  return out;
}
/** One line for a person's inspector: their strongest live story, or null. */
export function storyOf(sifter, w, pid, now = w.tick) {
  const tpd = sifter.tpd; let best = null, br = 0;
  for (const a of sifter.byActor(pid)) {
    if (a.quiet || (now - a.last) / tpd > (a.status === 'open' ? 150 : 60)) continue; const r = a.sum * Math.exp(-(now - a.last) / tpd / 70) * (KIND_W[a.kind] ?? 1);
    if (r > br) { br = r; best = a; }
  }
  if (!best) return null; const beats = beatsOf(best, w, 4); if (beats.length < 2) return null;
  return { id: best.id, kind: best.kind, label: kindLabel(best.kind), headline: headlineOf(best, w), status: best.status, outcome: best.outcome };
}

// Town-level data for the UI: high street, safety, council, venue briefs, civic map pins. Worker-safe, no DOM.
// Everything is read through the plugins' public queries. Anything tagged private/sensitive (domestic abuse etc.) is never read, counted or shown.
import { APP_KINDS, CASE_KINDS } from '../sim/systems/civic/data.js';
import { TYPES } from '../sim/systems/crime/data.js';

export const MONTH_TICKS = Math.round(144 * 30.4);
const lc = (s) => String(s || '').replace(/_/g, ' ');
const r1 = (v) => Math.round(v * 10) / 10;

/** Sensitive events never reach any UI surface. */
export const isPrivate = (ev) => !!ev && (/^crime\.domestic/.test(ev.type) || (ev.tags || []).some((t) => t === 'private' || t === 'sensitive'));

export const FORMAT_LABEL = {
  charity_shop: 'charity shop', coffee_shop: 'coffee shop', family_cafe: 'family cafe', caff: 'caff', pub_local: 'local pub', pub_gastro: 'gastropub', restaurant: 'restaurant', bistro: 'bistro',
  takeaway_kebab: 'kebab and pizza takeaway', takeaway_curry: 'curry house', takeaway_chicken: 'chicken shop', takeaway_chinese: 'Chinese takeaway', fish_chips: 'fish and chip shop', barber: 'barber', barber_premium: 'barber',
  launderette: 'launderette', bakery_trad: 'bakery', bakery_chain: 'bakery chain', bakery_indie: 'bakery', ethnic_grocer: 'grocer', bookmaker: 'bookmaker', salon: 'hair salon', nail_bar: 'nail bar', off_licence: 'off-licence',
  money_phone: 'phone and money shop', supermarket: 'supermarket', pharmacy: 'pharmacy', gym: 'gym', estate_agent: 'estate agent', corner_shop: 'corner shop', vape_shop: 'vape shop', discount: 'discount store',
};
export const fmtLabel = (id) => FORMAT_LABEL[id] || lc(id);

/** How a business is doing, in words, from its stage (cut hours / staff) and last month's margin. */
export function doingWords(B) {
  const m = B.last ? B.last.margin : null;
  if (B.stage >= 3) return { word: 'in serious trouble', tone: 'bad', why: 'Cut hours and staff and still losing money.' };
  if (B.stage === 2) return { word: 'struggling', tone: 'bad', why: 'Has cut staff and opening hours to stay afloat.' };
  if (B.stage === 1) return { word: 'under pressure', tone: 'warn', why: 'Trimmed opening hours to cut costs.' };
  if (m == null) return { word: 'new, finding its feet', tone: 'ok', why: 'Not enough trading history yet.' };
  if (m > 0.1 && (B.rating || 0) >= 3.7) return { word: 'thriving', tone: 'good', why: 'Healthy takings and good reviews.' };
  if (m > 0.02) return { word: 'doing fine', tone: 'ok', why: 'Covering its costs with a little to spare.' };
  return { word: 'getting by', tone: 'warn', why: 'Takings only just cover costs.' };
}

export function bizBrief(h, bid) {
  const w = h.w, bq = w.sys.business && w.sys.business.query; if (!bq) return null; const B = h.safe(() => bq.venue(bid)); if (!B) return null;
  if (B.status === 'vacant') {
    const was = h.safe(() => bq.voids(), []).filter((x) => x.bid === bid).slice(-1)[0];
    return { status: 'vacant', months: B.vacantMonths, ask: B.ask, rent: B.rent, m2: B.m2, was: was && was.name ? was.name : null, startable: true };
  }
  let owner = null, ownerText = '';
  if (B.owner) {
    if (B.owner.kind === 'resident' && B.owner.pid != null) owner = h.ref(B.owner.pid);
    else ownerText = B.owner.kind === 'chain' ? (B.owner.brand ? B.owner.brand + ' (national chain)' : 'A national chain') : B.owner.kind === 'charity' ? (B.owner.brand ? B.owner.brand + ' (charity)' : 'A charity') : 'An independent owner who lives elsewhere';
  }
  const d = doingWords(B), L = B.last;
  return {
    status: 'trading', fid: B.fid, kind: fmtLabel(B.fid), owner, ownerText, doing: d, regulars: B.regulars || 0, ageMonths: B.ageMonths, hours: B.stage >= 1 ? 'reduced hours' : null,
    rating: B.rating, last: L ? { rev: L.rev, rent: L.rent, wages: L.wages, profit: L.profit } : null, rent: B.rent,
  };
}

/** Planning notices near a building (from the host's event-built pins). */
export function noticesAt(h, bid) {
  const q = h.w.sys.civic && h.w.sys.civic.query; const out = []; if (!q) return out;
  for (const p of h.pins.values()) if (p.bid === bid) {
    const app = h.safe(() => q.planning(60), []).filter((a) => a.status === 'open' && a.kind === p.kind)[0];
    out.push({ kind: 'planning', text: app ? app.name : APP_KINDS[p.kind]?.label || 'a planning application', objections: app ? app.objections : null, camp: p.camp, label: APP_KINDS[p.kind]?.label || 'planning' });
  }
  return out;
}

export function pinList(h) { return [...h.pins.values()].map((p) => ({ bid: p.bid, kind: p.camp ? 'campaign' : 'planning', label: p.camp ? 'Campaign against plans' : 'Planning notice' })).filter((p) => p.bid != null); }

const CRIME_GROUPS = [['violence', 'Violence and harassment', ['assault', 'harass']], ['theft', 'Theft and shoplifting', ['theft', 'theftperson', 'shoplift', 'bike']], ['vehicle', 'Vehicle crime', ['vehicle']],
  ['burglary', 'Burglary', ['burglary']], ['damage', 'Criminal damage', ['damage']], ['order', 'Public order and drugs', ['publicorder', 'drugs']]];
export const CRIME_GROUP_META = CRIME_GROUPS.map(([id, label]) => ({ id, label }));
/** Cumulative recorded counts per display group (used for the series; domestic offences are not types here, so they are never counted). */
export function crimeSample(h) {
  const cq = h.w.sys.crime && h.w.sys.crime.query; if (!cq) return null; const st = h.safe(() => cq.stats()); if (!st) return null; const rec = st.rec || {};
  const g = CRIME_GROUPS.map(([, , ts]) => ts.reduce((s, t) => s + (TYPES[t] && !TYPES[t].noRecord ? rec[t] || 0 : 0), 0));
  let f = 0, n = 0, worried = 0; for (const p of h.w.living()) { const x = h.safe(() => cq.fear(p.id), 0); f += x; n++; if (x >= 0.6) worried++; }
  return { cr: g, fear: n ? r1(f / n * 100) : 0, worried: n ? Math.round(worried / n * 100) : 0 };
}

export function townData(h) {
  const w = h.w, q = w.sys, S = (f, d) => h.safe(f, d), out = {};
  const bq = q.business && q.business.query;
  if (bq) {
    const list = S(() => bq.list(), []), trading = list.filter((b) => b.status === 'trading'), vac = list.filter((b) => b.status === 'vacant');
    const mix = S(() => bq.mix(), {}), mix0 = S(() => bq.mix0(), {}); const ch = [];
    for (const k of new Set([...Object.keys(mix), ...Object.keys(mix0)])) { const d = (mix[k] || 0) - (mix0[k] || 0); if (d) ch.push({ label: fmtLabel(k), d }); }
    ch.sort((a, b) => b.d - a.d);
    const struggling = trading.filter((b) => b.stage >= 1).length;
    out.high = {
      trading: trading.length, vacant: vac.length, rate: S(() => bq.vacancyRate(), 0), struggling, rentIdx: S(() => bq.rentIndex(), 1),
      units: vac.map((b) => ({ bid: b.bid, name: h.byBid.get(b.bid)?.lf?.address || h.byBid.get(b.bid)?.name || 'Unit', months: b.vacantMonths, ask: b.ask, m2: b.m2 })).sort((a, b) => (b.months || 0) - (a.months || 0)),
      changes: ch, news: S(() => bq.news(8), []).map((n) => ({ date: w.calendar.formatDate(n.t), text: n.line, type: n.type })),
      survival: S(() => bq.survival(), null),
    };
  }
  const cq = q.crime && q.crime.query;
  if (cq) {
    const st = S(() => cq.stats(), {}), pol = S(() => cq.police(), { cap: 1 });
    out.safety = { years: st.years || 0, police: pol.cap, wave: !!(st.wave), watches: S(() => cq.watch(), []).map((x) => ({ street: x.name, since: w.calendar.formatDate(x.since), members: x.members })), groups: CRIME_GROUP_META };
  }
  const vq = q.civic && q.civic.query;
  if (vq) {
    const sv = S(() => vq.services(), {}), el = S(() => vq.election(), {}), camps = S(() => vq.campaigns(), []), apps = S(() => vq.planning(40), []);
    const SV = { library: ['Library', `${sv.libraryHoursPerWeek} hours a week`], youth: ['Youth club', `${sv.youthSessionsPerWeek} sessions a week`], bins: ['Bin collections', null], roads: ['Roads and pavements', null], repairs: ['Council housing repairs', null], noise: ['Noise and enforcement', null] };
    out.council = {
      control: el.control, next: el.next ? w.calendar.formatDate(el.next) : '', nextDays: el.next ? Math.max(0, Math.round((el.next - w.tick) / 144)) : null, last: el.last ? { date: w.calendar.formatDate(el.last.t), turnout: Math.round(el.last.turnout * 100), top: el.last.top } : null,
      cllrs: S(() => vq.councillors(), []).map((c) => ({ name: c.name, party: c.party, id: c.id != null && w.people.get(c.id) ? c.id : null })),
      services: Object.entries(SV).map(([k, [label, detail]]) => ({ k, label, detail, level: sv[k] ?? 1 })),
      apps: apps.filter((a) => a.status === 'open').map((a) => ({ id: a.id, kind: APP_KINDS[a.kind]?.label || a.kind, name: a.name, street: a.street, objections: a.objections, supports: a.supports, days: Math.max(0, Math.round((a.decide - w.tick) / 144)) })),
      decided: apps.filter((a) => a.status !== 'open').slice(-3).reverse().map((a) => ({ name: a.name, street: a.street, outcome: a.status })),
      camps: camps.filter((c) => c.status === 'active').map((c) => ({ id: c.id, name: c.name, sign: c.signatures, members: c.members, leader: c.leader != null ? h.ref(c.leader) : null })),
      cases: S(() => vq.cases(40), []).filter((c) => !c.done).length, feed: S(() => vq.feed(6), []).map((f) => ({ date: w.calendar.formatDate(f.t), text: f.text })),
    };
  }
  return out;
}

/** Life-admin options for the player: vacant units to start a business in, businesses to work at, open planning apps, campaigns, case kinds. */
export function adminData(h, pid) {
  const w = h.w, q = w.sys, S = (f, d) => h.safe(f, d), out = {}; const p = w.people.get(pid);
  const bq = q.business && q.business.query;
  if (bq) {
    out.units = S(() => bq.vacant(), []).map((b) => ({ bid: b.bid, name: h.byBid.get(b.bid)?.lf?.address || 'Unit', m2: b.m2, ask: b.ask || b.rent, months: b.vacantMonths }));
    out.formats = S(() => bq.formats(), []).filter((id) => !['supermarket', 'discount', 'bookmaker', 'bakery_chain', 'charity_shop'].includes(id)).map((id) => ({ id, label: fmtLabel(id) })).sort((a, b) => a.label.localeCompare(b.label));
    out.firms = S(() => bq.list(), []).filter((b) => b.status === 'trading').map((b) => ({ bid: b.bid, name: b.name, kind: fmtLabel(b.fid), doing: doingWords(b).word })).sort((a, b) => a.name.localeCompare(b.name));
  }
  const vq = q.civic && q.civic.query;
  if (vq) {
    out.apps = S(() => vq.planning(40), []).filter((a) => a.status === 'open').map((a) => ({ id: a.id, name: a.name, street: a.street, objections: a.objections, kind: APP_KINDS[a.kind]?.label || a.kind }));
    out.camps = S(() => vq.campaigns(), []).filter((c) => c.status === 'active').map((c) => ({ id: c.id, name: c.name, sign: c.signatures }));
    out.cases = Object.keys(CASE_KINDS);
    out.parties = S(() => vq.parties(), []); out.next = S(() => vq.election().next, null);
    out.nextDate = out.next ? w.calendar.formatDate(out.next) : '';
  }
  const cq = q.crime && q.crime.query;
  if (cq && p) { out.victim = S(() => cq.victim(pid), null); out.risk = S(() => cq.risk(pid), 0); }
  out.money = p ? Math.round(p.money || 0) : 0;
  return out;
}

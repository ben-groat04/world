// Turns kernel events into short human sentences and "Larkfield Local" news items. Pure; worker-safe.
const isPrivateEv = (ev) => /^crime\.domestic/.test(ev.type) || (ev.tags || []).some((t) => t === 'private' || t === 'sensitive');
export { isPrivateEv };
const lc = (s) => String(s || '').replace(/_/g, ' ');
const cap1 = (s) => (s ? String(s)[0].toUpperCase() + String(s).slice(1) : s);
const nm = (p) => (p ? `${p.firstName} ${p.lastName}` : 'someone');
const money = (n) => '£' + Math.round(n).toLocaleString('en-GB');
let PHR = null;
const phrase = (w, id) => { if (!PHR) { PHR = new Map(); try { for (const t of w.sys.goals.query.templates()) PHR.set(t.id, t.phrase); } catch (e) { /* ignore */ } } return PHR.get(id) || lc(id); };

// "a few months" / "1 year" / "7 years" (never "0 years")
const span = (y) => { const n = +y; return !(n >= 0) ? 'a few years' : n < 0.75 ? 'a few months' : n < 1.5 ? 'about a year' : `${Math.round(n)} years`; };
const fixText = (t) => (t == null ? t : String(t).replace(/\b(zero|0|no) years\b/gi, 'less than a year').replace(/\bone years\b/g, 'one year'));
// [line(s, o, pl, ctx), news?]  s = subject name, o = second actor or payload name, pl = payload
const T = {
  'life.birth': (s, o, p) => `${s} and ${o} had a baby, ${p.baby || 'a new arrival'}`,
  'life.death': (s, o, p) => `${s} died aged ${p.age}${p.cause ? ` (${lc(p.cause)})` : ''}`,
  'life.marriage': (s, o) => `${s} and ${o} got married`,
  'life.couple': (s, o, p) => `${s} started seeing ${o || p.name || 'someone'}`,
  'life.engaged': (s, o) => `${s} and ${o} got engaged`,
  'life.breakup': (s, o, p) => `${s} ended a ${lc(p.kind)} relationship of ${span(p.years)}`,
  'life.divorce': (s, o, p) => `${s} and ${o} divorced after ${span(p.years)}`,
  'life.cohabit': (s, o, p) => `${s} moved in with ${o || 'a partner'}`,
  'life.pregnant': (s, o) => `${s} and ${o} are expecting a baby`,
  'life.miscarriage': (s) => `${s} suffered a miscarriage`,
  'life.move_in': (s, o, p) => `${s} joined the neighbourhood from ${p.from}`,
  'life.move_out': (s, o, p) => `${s} left for ${p.to}`,
  'life.leave_home': (s, o, p) => `${s} left the family home (${lc(p.reason)})`,
  'life.boomerang': (s) => `${s} moved back in with family`,
  'life.funeral': (s, o) => `${s} attended a funeral`,
  'life.caring_start': (s, o, p) => `${s} became a carer for ${p.rel === 'partner' ? 'a partner' : 'a relative'} (${p.hrs} hrs a week)`,
  'life.caring_end': (s) => `${s} stopped being a carer`,
  'life.kin_death': (s, o, p) => `${s} lost ${p.rel === 'mother' || p.rel === 'father' ? 'their ' + p.rel : 'a relative'}, ${p.name}`,
  'life.school': (s, o, p) => `${s} started ${lc(p.stage)}`,
  'life.will': (s) => `${s} was named in a will`,
  'labour.hired': (s, o, p) => `${s} started work as ${lc(p.occ)}`,
  'labour.job_lost': (s, o, p) => `${s} lost their job (${lc(p.kind)}, ${lc(p.occ)})`,
  'labour.promoted': (s, o, p) => `${s} was promoted to ${lc(p.occ)}`,
  'labour.quit': (s, o, p) => `${s} resigned from a job as ${lc(p.occ)}`,
  'labour.retired': (s, o, p) => `${s} retired at ${p.age}`,
  'labour.pay_rise': (s, o, p) => `${s} got a ${Math.round(p.pct)}% pay rise`,
  'labour.second_job': (s, o, p) => `${s} took a second job (${p.hours} hrs)`,
  'labour.graduated': (s) => `${s} finished studying and entered the job market`,
  'labour.went_inactive': (s, o, p) => `${s} left the labour market (${lc(p.why)})`,
  'labour.firm_closed': (s, o, p) => `${p.name || 'A business'} closed down`,
  'housing.moved_in': (s, o, p, c) => `${s} moved into ${c.place || 'a new home'}`,
  'housing.moved_out': (s, o, p, c) => `${s} moved out of ${c.place || 'their home'}`,
  'housing.notice_served': (s, o, p, c) => `${s} was served notice at ${c.place || 'home'} (${lc(p.reason)})`,
  'housing.eviction': (s, o, p, c) => `${s} was evicted from ${c.place || 'home'} (${lc(p.reason)})`,
  'housing.homeless': (s) => `${s} lost their home`,
  'housing.rent_rise': (s, o, p, c) => `${s}'s rent went up ${p.pct}% to ${money(p.to)}${c.place ? ' at ' + c.place : ''}`,
  'housing.repair_needed': (s, o, p, c) => `${s} reported disrepair${c.place ? ' at ' + c.place : ''}`,
  'housing.disrepair': (s, o, p, c) => `${s} is living with ${p.damp ? 'damp' : 'disrepair'}${c.place ? ' at ' + c.place : ''}`,
  'housing.overcrowded': (s) => `${s}'s household is overcrowded`,
  'health.diagnosis': (s, o, p) => `${s} was diagnosed with ${lc(p.condition)}`,
  'health.crisis': (s, o, p) => `${s} was ${lc(p.what)}`,
  'health.accident': (s, o, p) => `${s} had an accident: ${lc(p.kind)} (${lc(p.severity)})`,
  'health.episode': (s, o, p) => `${s} began an episode of ${lc(p.kind)}`,
  'health.substance': (s, o, p) => `${s}: ${lc(p.what)} ${lc(p.change)}`,
  'health.ill': (s, o, p) => (/heat/.test(p.name || '') ? `${s} was taken ill in the heat` : `${s} fell ill with ${lc(p.name)}`),
  'health.treatment': (s, o, p) => `${s} sought help: ${lc(p.what)}`,
  'health.recovered': (s, o, p) => `${s} recovered from ${lc(p.condition)}`,
  'money.windfall': (s, o, p) => `${s} came into ${money(p.amount)} (${lc(p.source)})`,
  'money.arrears': (s, o, p) => `${s} fell behind on ${lc(p.kind)} (${money(p.owed)} owed)`,
  'money.debt_spiral': (s) => `${s} is borrowing at ruinous rates to cover essentials`,
  'money.cost_pressure': (s) => `${s}'s household is feeling the squeeze`,
  'money.benefit_claim': (s, o, p) => `${s} started claiming benefits (${money(p.monthly)}/month)`,
  'money.arrears_cleared': (s) => `${s} cleared their arrears`,
  'money.estate': (s, o, p) => `${s} inherited ${money(p.amount)}`,
  'social.scandal': (s, o, p) => `A secret about ${s} got out (${lc(p.kind)})`,
  'social.fallout': (s, o, p) => `${s} and ${o} fell out${p.over ? ' over ' + lc(p.over) : ''}`,
  'social.reconcile': (s, o) => `${s} and ${o} made up`,
  'social.friendship': (s, o, p) => `${s} and ${o} became friends (${lc(p.via)})`,
  'social.confide': (s, o, p) => `${s} confided in ${o} about ${lc(p.kind)}`,
  'social.introduced': (s, o) => `${s} was introduced to ${o}`,
  'social.kindness': (s, o, p) => `${o} gave ${s} ${lc(p.kind)}`,
  'social.secret': (s, o, p) => `${s} is keeping a secret (${lc(p.kind)})`,
  'social.rumour': (s, o, p) => `A rumour (${lc(p.kind)}) about ${s} went round`,
  'social.acquaint': (s, o) => `${s} and ${o} got talking`,
  'social.norm_shift': (s, o, p) => `Street attitudes to ${lc(p.norm)} shifted`,
  'civic.complaint': (s, o, p) => `${s} complained about ${lc(p.kind)}`,
  'group.founded': (s, o, p) => `${s} founded ${p.name} (${lc(p.kind)})`,
  'group.dissolved': (s, o, p) => `A group folded after ${p.days} days`,
  'group.joined': (s) => `${s} joined a group`,
  'group.left': (s) => `${s} left a group`,
  'group.split': (s, o) => `A group split between ${s} and ${o}`,
  'group.conflict': (s, o) => `${s} and ${o} clashed at a group meeting`,
  'group.leader_changed': (s, o) => `${s} took over a group`,
  'goal.formed': (s, o, p, c) => `${s} set out to ${phrase(c.w, p.tpl)}`,
  'goal.completed': (s, o, p, c) => `${s} managed to ${phrase(c.w, p.tpl)}`,
  'goal.failed': (s, o, p, c) => `${s} gave up trying to ${phrase(c.w, p.tpl)} (${lc(p.why)})`,
  'goal.abandoned': (s, o, p, c) => `${s} dropped the plan to ${phrase(c.w, p.tpl)}`,
  'goal.transformed': (s, o, p, c) => `${s} swapped "${phrase(c.w, p.from)}" for "${phrase(c.w, p.to)}"`,
  'goal.invented': (s, o, p) => `${s} came up with ${p.label}`,
  'goal.step': (s) => `${s} took a step towards a goal`,
  'project.started': (s, o, p) => `${s} kicked off a ${lc(p.kind)} project`,
  'project.progress': (s) => `${s} moved a group project forward`,
  'project.done': (s) => `${s} and the group finished their project`,
  'project.effect': (s) => `${s}'s project changed something in the neighbourhood`,
  'project.failed': (s) => `${s}'s project fizzled out`,
  'labour.applied': (s, o, p) => `${s} ${p.ok ? 'got through to the next stage for' : 'was turned down for'} a ${lc(p.occ)} job`,
  'housing.let': (s, o, p, c) => `${c.place || 'A home'} was let (${lc(p.tenure)})`,
  'housing.void': (s, o, p, c) => `${c.place || 'A home'} stands empty`,
  'housing.repaired': (s, o, p, c) => `${c.place || 'A home'} was repaired`,
  'housing.landlord_sale': (s, o, p, c) => `A landlord sold up${c.place ? ' at ' + c.place : ''}`,
  'housing.bought': (s, o, p) => `${s} bought a home for ${money(p.price)}`,
  'legacy.chron': (s) => `${s} …`,
};

// ---- Town news: business, civic and (anonymised, non-sensitive) safety items in a sober local-paper tone. Never names victims or offenders; never uses events tagged private/sensitive.
const pound = (n) => '£' + Math.round(n).toLocaleString('en-GB');
const streetName = (w, sid) => (w.map && w.map.lf && w.map.lf.streets[sid] ? w.map.lf.streets[sid].name : 'the area');
const svcName = { library: 'library', youth: 'youth club', bins: 'bin collections', roads: 'road repairs', repairs: 'council housing repairs', noise: 'noise enforcement' };
const CRIME = { 'crime.burglary': ['Burglary reported', 'Police recorded a burglary at a home that was empty at the time. Residents are reminded to lock doors and windows, even for a short trip out.'],
  'crime.assault': ['Assault recorded', 'Police recorded an assault in the neighbourhood.'], 'crime.vehicle': ['Vehicle broken into', 'A vehicle was broken into overnight. Police advise leaving nothing on show.'],
  'crime.bike_theft': ['Bike stolen', 'A bike was taken from outside a home. Police advise using a good lock and registering bikes.'], 'crime.theft': ['Theft recorded', 'Police recorded a theft in the neighbourhood.'],
  'crime.damage': ['Criminal damage', 'Police recorded damage to property.'], 'crime.antisocial': ['Antisocial behaviour reported', 'Residents have reported antisocial behaviour. It can be reported to the council or on 101.'],
  'crime.fraud': ['Residents warned about scams', 'A resident lost money to a scam. Police remind people that banks never ask for PINs or ask you to move money.'], 'crime.harassment': ['Harassment reported', 'Police recorded a report of harassment.'],
  'crime.drugs': ['Drugs offence recorded', 'Police recorded a drugs offence.'], 'crime.disorder': ['Public order incident', 'Police dealt with a public order incident.'] };
const LOCAL = {
  'business.opened': (w, ev, p) => ({ head: `${p.name} opens`, body: `A new ${lc(p.fid || p.tmpl)} has opened${ev.place != null && w.buildings.get(ev.place) ? ' at ' + (w.buildings.get(ev.place).lf.address || '').replace(/^[^,]*, ?/, '') : ''}.` }),
  'business.closed': (w, ev, p) => ({ head: `${p.name} has closed`, body: `${p.ageMonths >= 24 ? 'After ' + Math.round(p.ageMonths / 12) + ' years' : 'After ' + (p.ageMonths || 1) + ' months'} of trading${p.jobs ? `, ${p.jobs} job${p.jobs > 1 ? 's are' : ' is'} affected` : ''}${p.regulars ? ' and regulars will miss it' : ''}. The reason given: ${({ owner_retired: 'the owner is retiring', insolvent: 'it could no longer cover its costs', owner_gave_up: 'the owner called it a day', god: 'a sudden closure' })[p.reason] || lc(p.reason)}.` }),
  'business.struggling': (w, ev, p) => ({ head: `${p.name} cuts back`, body: p.stage >= 2 ? 'The business has reduced staff and opening hours to cope with rising costs.' : 'The business has shortened its opening hours to cut costs.' }),
  'business.recovered': (w, ev, p) => ({ head: `${p.name} restores hours`, body: 'Trading has picked up and normal opening hours are back.' }),
  'business.rent_review': (w, ev, p) => ({ head: `${p.name}: rent ${p.pct > 0 ? 'rises' : 'falls'}`, body: `A rent review has ${p.pct > 0 ? 'raised' : 'lowered'} the commercial rent by ${Math.abs(Math.round(p.pct))}%.` }),
  'business.owner_change': (w, ev, p) => ({ head: `${p.name} under new ownership`, body: 'The business has changed hands and is trading as before.' }),
  'business.rates': (w, ev, p) => ({ head: p.pct < 0 ? 'Business rates cut' : 'Business rates up', body: `Business rates for local firms ${p.pct < 0 ? 'fall' : 'rise'} by ${Math.abs(p.pct)}%.` }),
  'crime.watch_started': (w, ev, p) => ({ head: `Neighbourhood watch starts on ${streetName(w, p.street)}`, body: 'Residents have organised a neighbourhood watch and set up a group chat for the street.' }),
  'civic.planning_application': (w, ev, p) => { const st = ev.place != null && w.buildings.get(ev.place) ? streetName(w, w.buildings.get(ev.place).lf.streetId) : null; const a = (w.sys.civic.query.planning(60) || []).filter((x) => x.status === 'open' && x.kind === p.kind && (!st || x.street === st))[0];
    return { head: `Planning application: ${a ? a.name : lc(p.kind)}`, body: `${st ? 'Lodged on ' + st + '. ' : ''}Neighbours have been notified and can comment before the council decides.` }; },
  'civic.planning_decision': (w, ev, p) => ({ head: `Council ${p.outcome} ${lc(p.kind)} plans`, body: p.objections ? `${p.objections} objection${p.objections > 1 ? 's' : ''} had been received.` : 'No objections had been received.' }),
  'civic.election': (w, ev, p) => ({ head: 'Ward election held', body: `Turnout was ${Math.round(p.turnout * 100)}%. ${p.winner || 'No party'} won the most votes.` }),
  'civic.councillor_elected': (w, ev, p) => ({ head: `${nm(w.people.get((ev.actors || [])[0]))} elected councillor`, body: `A local resident now sits for the ward (${p.party}).` }),
  'civic.service_cut': (w, ev, p) => ({ head: `Council cuts ${svcName[p.service] || lc(p.service)}`, body: ({ library: 'Library opening hours are reduced.', youth: 'The youth club will run fewer sessions.', bins: 'Collections move to a longer cycle on some streets.', roads: 'Road and pavement repairs are delayed.', repairs: 'Council housing repairs have a longer waiting list.', noise: 'The noise and enforcement team has lost officers.' })[p.service] || 'The service will be reduced.' }),
  'civic.service_restored': (w, ev, p) => ({ head: `${(svcName[p.service] || lc(p.service)).replace(/^./, (c) => c.toUpperCase())} partly restored`, body: 'The council has put some funding back.' }),
  'civic.campaign': (w, ev, p) => ({ head: `Campaign launched: ${p.cause}`, body: `${nm(w.people.get((ev.actors || [])[0]))} is gathering signatures and neighbours' support.` }),
  'civic.campaign_outcome': (w, ev, p) => ({ head: p.won ? 'Campaign succeeds' : 'Campaign ends without success', body: p.won ? 'The council has responded to local pressure.' : 'Campaigners say they will keep raising the issue.' }),
  'civic.bins': (w, ev, p) => ({ head: 'Missed bin collections', body: `Residents on ${streetName(w, p.street)} report bins left uncollected.` }),
};
LOCAL['health.outbreak'] = (w, ev, p) => { const heat = /heat/i.test(p.name || ''), over = p.phase === 'over' || p.phase === 'end';
  return heat ? { head: over ? 'The heat breaks' : 'Heat health warning for Larkfield', body: over ? 'Cooler nights at last. The park is emptier and the fans go back in the cupboard.' : 'Flats on the top floors are stifling. Older and unwell residents are being checked on by neighbours; drink water and keep curtains shut by day.' }
    : { head: over ? `${cap1(p.name || 'The outbreak')} is easing` : `${cap1(p.name || 'A virus')} is going round`, body: over ? `Fewer people are off sick${p.ill ? ` (about ${p.ill} cases locally)` : ''}. The surgery says appointments are returning to normal.` : 'The surgery is busier than usual and schools report absences. Older relatives and anyone with a health condition are being urged to take care.' }; };
for (const k of Object.keys(CRIME)) LOCAL[k] = () => ({ head: CRIME[k][0], body: CRIME[k][1] });
export const LOCAL_TYPES = Object.keys(LOCAL);
export const LOCAL_KINDS = new Set(['business', 'crime', 'civic']);
export const NEWS_TYPES = ['health.outbreak', 'life.birth', 'life.death', 'life.marriage', 'life.couple', 'life.engaged', 'life.breakup', 'life.divorce', 'life.cohabit', 'life.pregnant', 'life.move_in', 'life.move_out', 'life.kin_death', 'life.caring_start', 'labour.hired', 'labour.job_lost', 'labour.promoted', 'labour.quit', 'labour.retired', 'labour.firm_closed', 'labour.second_job', 'housing.moved_in', 'housing.moved_out', 'housing.notice_served', 'housing.eviction', 'housing.homeless', 'housing.rent_rise', 'housing.disrepair', 'health.diagnosis', 'health.crisis', 'health.accident', 'health.episode', 'health.ill', 'health.substance', 'money.debt_spiral', 'money.windfall', 'money.arrears', 'social.scandal', 'social.fallout', 'social.reconcile', 'group.founded', 'group.dissolved', 'goal.invented', 'life.funeral', 'life.school', ...LOCAL_TYPES];
const MIN_SAL = { 'crime.assault': 0.4, 'crime.burglary': 0.38, 'crime.theft': 0.4, 'crime.vehicle': 0.4, 'crime.damage': 0.4, 'crime.antisocial': 0.4, 'crime.fraud': 0.4, 'crime.harassment': 0.4, 'crime.bike_theft': 0.4, 'crime.drugs': 0.4, 'crime.disorder': 0.4, 'civic.bins': 0.1, 'civic.planning_application': 0.1, 'civic.planning_decision': 0.1, 'business.rent_review': 0.15, 'business.recovered': 0.15, 'health.ill': 0.35, 'life.funeral': 0.35, 'life.school': 0.3, 'civic.complaint': 0.1, 'money.arrears': 0.45, 'housing.rent_rise': 0.2, 'life.caring_start': 0.4, 'goal.invented': 0.3, 'labour.second_job': 0.25 };
const PAIR = new Set(['life.couple', 'life.breakup', 'life.marriage', 'life.cohabit', 'life.engaged', 'life.pregnant', 'social.reconcile', 'social.fallout']);
const MAP = { 'labour.hired': 'work.hired', 'labour.job_lost': 'work.fired', 'labour.promoted': 'work.promoted', 'housing.moved_in': 'life.move_in', 'housing.moved_out': 'life.move_out', 'housing.notice_served': 'home.eviction', 'housing.eviction': 'home.eviction', 'housing.rent_rise': 'home.rent_rise', 'life.divorce': 'life.breakup' };
const view = (w, p) => (p ? { firstName: p.firstName, lastName: p.lastName, sex: p.sex, age: Math.floor(w.ageOf(p)), segment: p.ext?.pop?.seg, mood: ((p.mood || 0) + 1) / 2, job: p.job } : null);
// Plain-English payload for the text grammar: where from/to, why they moved, who employs them, what the job is called.
const WHERE = { outside: 'elsewhere in the UK', local: 'elsewhere in the area', metropolis: 'the city centre', suburbs: 'the suburbs', elsewhere: 'somewhere else in the city', sofa_surfing_then_elsewhere: 'a friend\'s sofa for now' };
const WHY = { job: ['a new job', 'a job offer', 'work'], afford: ['rent they could no longer manage', 'the rent going up', 'money getting tight'], space: ['needing more space', 'a bigger place', 'a spare room for the kids'], partner: ['moving in with a partner', 'a partner', 'a relationship'], notice: ['a notice to leave', 'the landlord selling up', 'a letter from the landlord'],
  social_allocation: ['a council offer', 'a housing association offer'], chosen: ['a change of scene', 'wanting a change', 'a better flat'], study: ['a course', 'university'], lifecycle: ['a new stage of life', 'downsizing', 'the family growing'], independence: ['wanting a place of their own', 'independence'], separation: ['a split', 'a separation'], flatmate_rotation: ['a flatmate swapping round', 'the house changing hands'], arrival: ['a new job and a lower rent', 'a lower rent', 'a new start', 'a fresh start', 'a friend nearby', 'family close by'] };
const EMP = { city_centre_offices: ['an office in the city centre', 'a city-centre firm', 'a small agency in town'], business_park: ['a firm out at the business park', 'an operations team at the business park'], industrial_estate: ['a firm on the industrial estate', 'a workshop on the estate'], teaching_hospital: ['the teaching hospital', 'the hospital'], secondary_school: ['a secondary school', 'a school across town'], university: ['the university'], home: ['a firm that lets them work from home', 'themselves, from the spare room'], city_centre_retail_leisure: ['a shop in town', 'a restaurant in town', 'a bar in the centre'], other_neighbourhood: ['a firm across town', 'a place in the next neighbourhood'], retail_park: ['a store at the retail park'], logistics_park: ['a distribution centre', 'a warehouse on the ring road'], airport: ['the airport'] };
const hsh = (n) => { let x = (n | 0) * 2654435761 >>> 0; x ^= x >>> 15; return x >>> 0; };
const pickBy = (arr, n) => arr[hsh(n) % arr.length];
const roleLabel = (w, id) => { const o = (w.pack && w.pack.jobs || []).find((j) => j.id === id); const t = String(o ? o.label : lc(id)).replace(/\s*\([^)]*\)?/g, '').replace(/ \/ /g, '/').trim(); return /^[A-Z]{2,}/.test(t) ? t : t.charAt(0).toLowerCase() + t.slice(1); };
function humanPayload(w, ev) {
  const pl = ev.payload || {}, out = {}; if (pl.occ) { out.role = roleLabel(w, pl.occ); const o = (w.pack.jobs || []).find((j) => j.id === pl.occ); const venue = ev.place != null ? w.buildings.get(ev.place) : null;
    out.employer = venue && venue.name ? venue.name : o ? pickBy(EMP[o.dest || o.where] || ['a local employer'], ev.id) : 'a local employer'; }
  if (pl.years != null) out.span = span(pl.years);
  if (pl.from != null) out.from = WHERE[pl.from] || pl.from; if (pl.to != null) out.to = WHERE[pl.to] || pl.to;
  if (pl.reason) out.why = pickBy(WHY[pl.reason] || WHY.chosen, ev.id); else if (ev.type === 'housing.moved_in') out.why = pickBy(WHY.arrival, ev.id);
  return out;
}
const DEFAULTS = { employer: 'a local employer', role: 'new role', biz: 'a local business', kind: 'business', to: 'elsewhere in the city', from: 'elsewhere', years: 'a few', amount: 900, pct: 5, weight: 7 };

export function describeEvent(w, ev, text, viewer = null) {
  const f = T[ev.type]; const a = ev.actors || [];
  const S = viewer != null && a[0] === viewer ? 'They' : nm(w.people.get(a[0]));
  let O = a[1] != null ? w.people.get(a[1]) : null; const Ot = O ? (viewer != null && a[1] === viewer ? 'them' : nm(O)) : null;
  const pl = ev.payload || {}; const place = ev.place != null ? w.buildings.get(ev.place) : null;
  if (!f) { const doc = w.events.registry.get(ev.type)?.doc; return { line: a.length ? `${S}: ${doc || lc(ev.type.split('.').pop())}` : (doc || lc(ev.type)), generic: true }; }
  try { return { line: f(S, Ot, pl, { place: place && place.name, w }).replace(/^They's/, 'Their') }; } catch (e) { return { line: `${S}: ${ev.type}` }; }
}

export function newsFor(w, text, ev, host) {
  const min = MIN_SAL[ev.type] ?? 0.3; if (ev.salience < min) return null;
  if (/^health\.(episode|substance)$/.test(ev.type)) return null; // sober: nobody's mental health or drinking is named in the public feed (it stays in their own profile and the storylines)
  if (LOCAL[ev.type]) { if (isPrivateEv(ev)) return null; const kind = ev.type.split('.')[0]; let x; try { x = LOCAL[ev.type](w, ev, ev.payload || {}); } catch (e) { return null; }
    const place = ev.place != null && kind !== 'crime' ? w.buildings.get(ev.place) : null; const named = kind === 'civic' || ev.type === 'business.opened' || ev.type === 'business.closed' ? (ev.actors || []).slice(0, 2).map((id) => { const p = w.people.get(id); return p ? { id, name: nm(p) } : null; }).filter(Boolean) : [];
    return { tick: ev.tick, date: w.calendar.formatDate(ev.tick), time: w.time.hour != null ? `${String(w.time.hour).padStart(2, '0')}:${String(w.time.minute || 0).padStart(2, '0')}` : '', type: ev.type, kind, head: x.head, body: x.body, line: x.head, ppl: kind === 'crime' ? [] : named, sal: kind === 'crime' ? Math.min(ev.salience, 0.45) : ev.salience, place: place ? { id: place.id, name: place.name } : null, town: 1 }; }
  const d = describeEvent(w, ev, text); const a = ev.actors || [];
  const ppl = a.slice(0, 4).map((id) => { const p = w.people.get(id); return p ? { id, name: nm(p) } : null; }).filter(Boolean);
  let head = d.line, body = null;
  const key = ev.type === 'health.ill' && /heat/.test(ev.payload?.name || '') ? 'health.heat' : MAP[ev.type] || ev.type;
  const solo = PAIR.has(key) && (a.length < 2 || !w.people.get(a[1])); const sk = solo && text.has && text.has('headline:' + key + '.solo') ? key + '.solo' : key; // no resident on the other side: never print "and someone"
  if (text.has && text.has('headline:' + sk)) {
    const ctx = { genre: 'headline', a: view(w, w.people.get(a[0])), b: view(w, w.people.get(a[1])), people: (id) => view(w, w.people.get(id)), p: { ...DEFAULTS, ...ev.payload, ...humanPayload(w, ev), biz: ev.payload?.name || DEFAULTS.biz }, date: ((x) => ({ ...x, weekday: x.dow, day: x.d, month: x.m, year: x.y }))(w.calendar.dateOf(ev.tick)), placeName: ev.place != null ? w.buildings.get(ev.place)?.name : undefined };
    try {
      const e2 = { ...ev, type: sk }; const h = text.render(e2, ctx, w);
      if (h && !/[{}#\[]/.test(h)) { head = fixText(h); const b = text.render(e2, { ...ctx, genre: 'news' }, w); if (b && !/[{}#\[]|Details are still/.test(b)) body = fixText(b); }
    } catch (e) { /* keep plain line */ }
  }
  const place = ev.place != null ? w.buildings.get(ev.place) : null;
  return { tick: ev.tick, date: w.calendar.formatDate(ev.tick), time: w.time.hour != null ? `${String(w.time.hour).padStart(2, '0')}:${String(w.time.minute || 0).padStart(2, '0')}` : '', type: ev.type, kind: ev.type.split('.')[0], head, body, line: d.line, ppl, sal: ev.salience, place: place ? { id: place.id, name: place.name } : null };
}

const ACT = { home_family: 'Home & family', other_inactive: 'Not working', unemployed: 'Looking for work', student: 'Student', retired: 'Retired', long_term_sick: 'Long-term sick', employed: 'Working', sick: 'Long-term sick', carer: 'Carer' };
/** A job label that fits a list row: drop the bracketed detail and keep the first two parts ("Retail / sales assistant (city centre)" -> "Retail / sales assistant"). */
export function shortJob(label) {
  const s = String(label || ''); if (ACT[s]) return ACT[s]; let t = s.replace(/\s*\([^)]*\)?/g, '').trim(); const parts = t.split(/\s*\/\s*/); if (parts.length > 2) t = parts.slice(0, 2).join(' / ');
  return t ? t[0].toUpperCase() + t.slice(1) : '';
}

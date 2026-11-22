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
  Object.assign(out, specifics(w, ev, pl));
  return out;
}
// Real specifics that make two events of one type read differently: where (street / address / venue), who they are to each other, what a row was over, how people met.
const OVER = { remote: 'something said online', money: 'money', noise: 'noise', goal: 'clashing plans', parking: 'parking', door: 'what happened on the doorstep', school: 'the school run', bins: 'the bins', kids: 'the kids', dogs: 'the dogs', pub: 'a night at the pub', ethnic_grocer: 'something in the corner shop', park: 'the park', barber: 'the barber\'s', salon: 'the salon' };
const VIA = { 'same street': 'neighbours on the same street', 'school gate': 'from the school gate', 'place of worship': 'from the place of worship', 'same building': 'same building', neighbours: 'neighbours', 'shop regular': 'regulars at the same shop', mixing: 'in the same circles', online: 'online', school: 'at the school gate', welcome: 'a welcome visit', door: 'on the doorstep', park: 'in the park', community_centre: 'at the community centre', pub: 'at the pub', group: 'through a group', cafe: 'at the cafe', salon: 'at the salon', bakery: 'at the bakery', ethnic_grocer: 'at the corner shop', takeaway: 'at the takeaway', restaurant: 'over a meal', church: 'at church' };
const KIND_W = { ill: 'health', in_debt: 'money troubles', planning_move: 'plans to move', job_hunting: 'job-hunting', new_couple: 'a new relationship', family_news: 'family news', addiction: 'a private matter', affair: 'a relationship', moving_out: 'plans to move', lost_job: 'work', drugs: 'a private matter', row: 'a row', breakup: 'a break-up', pregnant: 'a pregnancy', noise: 'noise', parking: 'parking', bins: 'the bins', kids: 'kids', dogs: 'dogs' };
const TENURE_W = { private_rent: 'private rent', council: 'council', housing_assoc: 'housing association', mortgage: 'mortgage', owned_outright: 'owned', shared_ownership: 'shared ownership' };
const STAGE_W = { primary: 'primary school', secondary: 'secondary school', college: 'college', university: 'university', work: 'work' };
const SEV_W = { minor: 'nothing serious', fracture: 'a broken bone', serious: 'serious injuries' };
const SEASONS = ['winter', 'winter', 'spring', 'spring', 'spring', 'summer', 'summer', 'summer', 'autumn', 'autumn', 'autumn', 'winter'];
function specifics(w, ev, pl) {
  const o = { whenw: 'recently', nth: 1, nthw: '', street: '', addr: '', venue: '', relnoun: '', relvia: '', over: '', via: '', kindw: '', tenurew: '', stagew: '', sev: '', pctr: '', fromamt: '', disw: '', carerel: '', deathplace: '', afterw: '', dayw: '', season: '', dayname: '' };
  try { const b = ev.place != null ? w.buildings.get(ev.place) : null; if (b) { const st = b.lf && b.lf.streetId != null && w.map.lf.streets[b.lf.streetId]; if (st) o.street = st.name; if (b.lf && b.lf.kind === 'residential') o.addr = b.name; else if (b.name) o.venue = b.name; } } catch (e) { /* none */ }
  try { const d = w.calendar.dateOf(ev.tick); o.season = SEASONS[d.m] || ''; o.dayname = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'][d.dow] || '';
    o.whenw = d.hour < 5 ? `in the early hours of ${o.dayname}` : d.hour < 12 ? `on ${o.dayname} morning` : d.hour < 17 ? `on ${o.dayname} afternoon` : d.hour < 22 ? `on ${o.dayname} evening` : `late on ${o.dayname}`; } catch (e) { /* none */ }
  const a = ev.actors || [];
  if (a.length > 1 && typeof a[0] === 'number' && typeof a[1] === 'number' && /^(social|life|group)\./.test(ev.type)) { try { const t = (w.sys.social.query.ties(a[0]) || []).find((x) => x.o === a[1]); if (t) { const n = t.k === 'kin' ? t.r : t.k === 'partner' ? (t.r === 'partner' ? 'partner' : t.r) : t.k; if (n && !/^(acquaint|acquaintance|stranger|none)$/.test(n)) o.relnoun = lc(n).replace(/^friend$/, t.c > 0.8 ? 'old friend' : 'friend'); if (t.v && VIA[t.v]) o.relvia = VIA[t.v]; } } catch (e) { /* none */ } }
  if (pl.over != null) o.over = OVER[pl.over] || lc(pl.over); if (pl.via != null) o.via = VIA[pl.via] || lc(pl.via);
  if (pl.kind != null) o.kindw = KIND_W[pl.kind] || lc(pl.kind); if (pl.tenure) o.tenurew = TENURE_W[pl.tenure] || lc(pl.tenure); if (pl.stage) o.stagew = STAGE_W[pl.stage] || lc(pl.stage);
  if (pl.severity != null) o.sev = SEV_W[pl.severity] || lc(pl.severity); if (typeof pl.pct === 'number') o.pctr = Math.round(pl.pct); if (typeof pl.from === 'number') o.fromamt = pl.from;
  if (pl.kind != null && /^(extension|loft|change|new|conversion|basement)/.test(String(pl.kind))) o.kindw = lc(pl.kind); o.disw = pl.damp ? 'damp' : 'disrepair'; o.carerel = pl.rel === 'partner' ? 'a partner' : 'a relative';
  if (pl.where) o.deathplace = pl.where === 'hospital' ? ' in hospital' : pl.where === 'home' ? ' at home' : '';
  if (pl.after != null) o.afterw = span(pl.after); if (pl.days != null) o.dayw = pl.days < 21 ? 'a few days' : pl.days < 60 ? `${Math.round(pl.days / 7)} weeks` : pl.days < 400 ? `${Math.round(pl.days / 30)} months` : `${Math.round(pl.days / 365)} years`;
  return o;
}
const DEFAULTS = { employer: 'a local employer', role: 'new role', biz: 'a local business', kind: 'business', to: 'elsewhere in the city', from: 'elsewhere', years: 'a few', amount: 900, pct: 5, weight: 7 };

const selfView = { firstName: 'They', lastName: '', pronouns: 'they' };
const dview = (w, p) => (p ? { id: p.id, firstName: p.firstName, lastName: p.lastName, sex: p.sex, age: Math.floor(w.ageOf(p)), segment: p.ext?.pop?.seg, mood: ((p.mood || 0) + 1) / 2, job: p.job } : null);
export function describeEvent(w, ev, text, viewer = null) {
  const f = T[ev.type]; const a = ev.actors || [];
  const S = viewer != null && a[0] === viewer ? 'They' : nm(w.people.get(a[0]));
  let O = a[1] != null ? w.people.get(a[1]) : null; const Ot = O ? (viewer != null && a[1] === viewer ? 'them' : nm(O)) : null;
  const pl = ev.payload || {}; const place = ev.place != null ? w.buildings.get(ev.place) : null;
  // preferred: the grammar (line:<type>), composed from the event's own specifics and never the same sentence twice in a row
  if (text && text.has) {
    const pair = ['life.couple', 'life.breakup', 'life.cohabit', 'life.engaged', 'life.pregnant'].includes(ev.type); const key = pair && !O && text.has('line:' + ev.type + '.solo') ? ev.type + '.solo' : ev.type;
    if (text.has('line:' + key)) {
      try {
        const self = viewer != null && a[0] === viewer; const ctx = { genre: 'line', a: self ? selfView : dview(w, w.people.get(a[0])), b: dview(w, O), people: (id) => dview(w, w.people.get(id)), seed: ev.id * 2 + (self ? 1 : 0),
          p: { ...DEFAULTS, ...pl, ...humanPayload(w, ev), name: pl.name ?? DEFAULTS.biz }, placeName: place ? place.name : undefined, date: ((x) => ({ ...x, weekday: x.dow, day: x.d, month: x.m, year: x.y }))(w.calendar.dateOf(ev.tick)) };
        if (ctx.p.from == null) ctx.p.from = DEFAULTS.from; const h = text.render({ ...ev, type: key }, ctx, w);
        if (h && !/[{}#\[\]]|undefined|NaN/.test(h)) return { line: (self ? h.replace(/(?<!^)\bThey\b/g, 'them').replace(/^They's/, 'Their').replace(/\bthey\b(?= (are|were))/g, 'they') : h) };
      } catch (e) { /* fall back to the plain line */ }
    }
  }
  if (!f) { const doc = w.events.registry.get(ev.type)?.doc; return { line: a.length ? `${S}: ${doc || lc(ev.type.split('.').pop())}` : (doc || lc(ev.type)), generic: true }; }
  try { return { line: f(S, Ot, pl, { place: place && place.name, w }).replace(/^They's/, 'Their') }; } catch (e) { return { line: `${S}: ${ev.type}` }; }
}

const okText = (h) => h && !/[{}#\[\]]|undefined|NaN|Details are still/.test(h);
const dateCtx = (w, ev) => ((x) => ({ ...x, weekday: x.dow, day: x.d, month: x.m, year: x.y }))(w.calendar.dateOf(ev.tick));
function newsCtx(w, ev, extra) {
  const a = ev.actors || [];
  return { genre: 'headline', a: view(w, w.people.get(a[0])), b: view(w, w.people.get(a[1])), people: (id) => view(w, w.people.get(id)), p: { ...DEFAULTS, ...ev.payload, ...humanPayload(w, ev), ...(extra || {}), biz: ev.payload?.name || DEFAULTS.biz }, date: dateCtx(w, ev), placeName: ev.place != null ? w.buildings.get(ev.place)?.name : undefined };
}
// Several of one kind in one week become a single, specific line ("New faces on Raglan Road and Cobden Street this week"); events that keep recurring for one person are shown once and then marked "again".
const FOLD = { 'housing.moved_in': 'arrivals', 'life.move_in': 'arrivals', 'housing.moved_out': 'leavers', 'life.move_out': 'leavers', 'labour.hired': 'jobs', 'labour.job_lost': 'lost' };
const FOLD_SHOW = {}; // items shown in full before the rest of the week is folded into one line (default 2)
const REPEATS = new Set(['money.arrears', 'money.debt_spiral', 'labour.second_job', 'social.scandal', 'money.cost_pressure']);
const WORDS_N = ['no', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten'];
function foldItem(w, text, ev, host, it) {
  const kind = FOLD[ev.type]; if (!kind || !host) return it; const TPD = 144, k = kind + ':' + Math.floor(ev.tick / (TPD * 7)), st = host._fold || (host._fold = new Map());
  const x = st.get(k) || st.set(k, { n: 0, streets: [] }).get(k); x.n++;
  try { const b = ev.place != null ? w.buildings.get(ev.place) : null; const sn = b && b.lf && b.lf.streetId != null ? w.map.lf.streets[b.lf.streetId]?.name : null; if (sn && !x.streets.includes(sn)) x.streets.push(sn); } catch (e) { /* none */ }
  if (st.size > 200) st.delete(st.keys().next().value);
  const show = FOLD_SHOW[kind] ?? 2; if (x.n <= show) return it; if (x.n > show + 1) return null;
  const list = x.streets.length ? (x.streets.length > 1 ? x.streets.slice(0, -1).join(', ') + ' and ' + x.streets.at(-1) : x.streets[0]) : 'Larkfield';
  const e2 = { ...ev, type: 'fold.' + kind }; const ctx = newsCtx(w, e2, { count: show + 1, streets: list });
  try { const h = text.render(e2, ctx, w), b = text.render(e2, { ...ctx, genre: 'news' }, w); if (okText(h)) { it.head = fixText(h); it.body = okText(b) ? fixText(b) : null; it.line = it.head; it.ppl = []; it.type = 'fold.' + kind; it.sal = Math.min(it.sal, 0.4); return it; } } catch (e) { /* keep */ }
  return it;
}

export function newsFor(w, text, ev, host) {
  const min = MIN_SAL[ev.type] ?? 0.3; if (ev.salience < min) return null;
  if (/^health\.(episode|substance)$/.test(ev.type)) return null; // sober: nobody's mental health or drinking is named in the public feed (it stays in their own profile and the storylines)
  let nth = 1;
  if (host && REPEATS.has(ev.type) && ev.actors && ev.actors[0] != null) { const m = host._rep || (host._rep = new Map()), k = ev.type + ':' + ev.actors[0], rec = m.get(k) || { n: 0, last: -1e9 }; if (ev.tick - rec.last < 144 * 90) { rec.last = ev.tick; m.set(k, rec); return null; } rec.n++; rec.last = ev.tick; nth = rec.n; m.set(k, rec); if (m.size > 3000) m.delete(m.keys().next().value); }
  if (host && ev.type === 'social.scandal') { const last = host._gosTick ?? -1e9; if (ev.tick - last < 144 * 1.7) return null; host._gosTick = ev.tick; } // gossip dumps arrive in batches: one story a day and a half is enough, and the host never needs its generic "Talk of the town" fold
  if (LOCAL[ev.type]) { if (isPrivateEv(ev)) return null; const kind = ev.type.split('.')[0]; let x; try { x = LOCAL[ev.type](w, ev, ev.payload || {}); } catch (e) { return null; }
    if (text && text.has && text.has('headline:' + ev.type)) { try { const ctx = newsCtx(w, ev, kind === 'crime' ? { biz: '' } : null), e2 = { ...ev }, h = text.render(e2, ctx, w); if (okText(h)) x = { head: fixText(h), body: x.body };
      if (text.has('news:' + ev.type)) { const b = text.render(e2, { ...ctx, genre: 'news' }, w); if (okText(b)) x.body = fixText(b); } } catch (e) { /* static text stands */ } }
    const place = ev.place != null && kind !== 'crime' ? w.buildings.get(ev.place) : null; const named = kind === 'civic' || ev.type === 'business.opened' || ev.type === 'business.closed' ? (ev.actors || []).slice(0, 2).map((id) => { const p = w.people.get(id); return p ? { id, name: nm(p) } : null; }).filter(Boolean) : [];
    return { tick: ev.tick, date: w.calendar.formatDate(ev.tick), time: w.time.hour != null ? `${String(w.time.hour).padStart(2, '0')}:${String(w.time.minute || 0).padStart(2, '0')}` : '', type: ev.type, kind, head: x.head, body: x.body, line: x.head, ppl: kind === 'crime' ? [] : named, sal: kind === 'crime' ? Math.min(ev.salience, 0.45) : ev.salience, place: place ? { id: place.id, name: place.name } : null, town: 1 }; }
  const d = describeEvent(w, ev, text); const a = ev.actors || [];
  const ppl = a.slice(0, 4).map((id) => { const p = w.people.get(id); return p ? { id, name: nm(p) } : null; }).filter(Boolean);
  let head = d.line, body = null;
  const key = ev.type === 'health.ill' && /heat/.test(ev.payload?.name || '') ? 'health.heat' : MAP[ev.type] || ev.type;
  const solo = PAIR.has(key) && (a.length < 2 || !w.people.get(a[1])); const sk = solo && text.has && text.has('headline:' + key + '.solo') ? key + '.solo' : key; // no resident on the other side: never print "and someone"
  if (text.has && text.has('headline:' + sk)) {
    const ctx = newsCtx(w, ev, { nth, nthw: nth > 1 ? 'Again: ' : '' });
    try {
      const e2 = { ...ev, type: sk }; const h = text.render(e2, ctx, w);
      if (h && !/[{}#\[]/.test(h)) { head = fixText(h); const b = text.render(e2, { ...ctx, genre: 'news' }, w); if (b && !/[{}#\[]|Details are still/.test(b)) body = fixText(b); }
    } catch (e) { /* keep plain line */ }
  }
  const place = ev.place != null ? w.buildings.get(ev.place) : null;
  const out = { tick: ev.tick, date: w.calendar.formatDate(ev.tick), time: w.time.hour != null ? `${String(w.time.hour).padStart(2, '0')}:${String(w.time.minute || 0).padStart(2, '0')}` : '', type: ev.type, kind: ev.type.split('.')[0], head, body, line: d.line, ppl, sal: ev.salience, place: place ? { id: place.id, name: place.name } : null };
  return foldItem(w, text, ev, host, out);
}

const ACT = { home_family: 'Home & family', other_inactive: 'Not working', unemployed: 'Looking for work', student: 'Student', retired: 'Retired', long_term_sick: 'Long-term sick', employed: 'Working', sick: 'Long-term sick', carer: 'Carer' };
/** A job label that fits a list row: drop the bracketed detail and keep the first two parts ("Retail / sales assistant (city centre)" -> "Retail / sales assistant"). */
export function shortJob(label) {
  const s = String(label || ''); if (ACT[s]) return ACT[s]; let t = s.replace(/\s*\([^)]*\)?/g, '').trim(); const parts = t.split(/\s*\/\s*/); if (parts.length > 2) t = parts.slice(0, 2).join(' / ');
  return t ? t[0].toUpperCase() + t.slice(1) : '';
}

// ---------------------------------------------------------------------------------------------------------------------------------
// What a person is doing and thinking right now, in words, from the sim's activity plus what is true of them.
// The routine owns the plain activity label ("Asleep at home"); this renders richer wording from it and the context. Deterministic, never claims what the data does not show.
const hh32 = (n) => { let x = Math.imul(n | 0, 2654435761) >>> 0; x ^= x >>> 15; x = Math.imul(x, 2246822519) >>> 0; return (x ^ (x >>> 13)) >>> 0; };
const theName = (n) => (/^[a-z]/.test(n) ? 'the ' + n : n);
const lowerFirst = (t) => (t ? t[0].toLowerCase() + t.slice(1) : t);
const ROLE = { nurse: 'On the ward', practice_nurse: 'Seeing patients', primary_teacher: 'In the classroom', secondary_teacher: 'In the classroom', teaching_assistant: 'In the classroom', barista_waiter: 'Behind the counter', cook_chef: 'In the kitchen', chef_offmap: 'In the kitchen', kitchen_porter_cook: 'In the kitchen', bar_staff: 'Behind the bar', publican: 'Behind the bar', retail_assistant: 'On the shop floor', retail_city: 'On the shop floor', shop_supervisor: 'On the shop floor', store_manager: 'On the shop floor', warehouse_operative: 'On the warehouse floor', warehouse_picker: 'Picking orders', delivery_rider: 'Out on deliveries', delivery_courier_app: 'Out on deliveries', delivery_driver: 'On the road with a van', taxi_driver: 'Out on a fare', rideshare_driver: 'Out on a fare', receptionist: 'On reception', gp: 'In surgery', care_worker: 'On a care round', cleaner_housekeeper: 'Cleaning', security_guard: 'On the door', barber_hairdresser: 'Cutting hair', builder_labourer_trades: 'On site', electrician_plumber: 'On a job', carpenter_joiner: 'On a job', mechanic_engineering_trades: 'In the workshop', vehicle_technician: 'In the workshop' };
const wxOf = (w) => { const wx = w.weather, m = w.time?.rec?.month ?? 0; if (!wx) return null; const win = m === 11 || m <= 1; let t = wx.type; if (t === 'snow' && !win) t = 'rain'; if (t === 'fog' && m >= 5 && m <= 7) t = 'cloudy'; if (t === 'rain' && m >= 6 && m <= 7 && wx.temp > 20) t = 'clear'; const mean = [5, 5, 8, 10, 13, 16, 19, 19, 16, 12, 8, 5][m], legacy = [11, 22, 10, -1][w.time.season ?? 0]; return { type: t, temp: Math.round(mean + ((wx.temp ?? 10) - legacy) * 0.6) }; };
const S = (f, d = null) => { try { const v = f(); return v === undefined ? d : v; } catch (e) { return d; } };
/** Household members and the partner currently in the same building as p: [{id, firstName, age}] (on-map only). */
function companions(w, p) {
  const b = p.locationId != null ? w.buildings.get(p.locationId) : null; if (!b || !b.occupants) return [];
  const pop = p.ext?.pop || {}, hh = S(() => w.lf.households[pop.hh]), kin = new Set((hh && hh.members || []).map((m) => (typeof m === 'object' ? m.id : m)));
  const sp = p.family?.spouseId; if (sp != null) kin.add(sp); for (const k of p.family?.childrenIds || []) kin.add(k); kin.delete(p.id);
  const out = []; for (const o of b.occupants) if (o && o.id !== p.id && kin.has(o.id) && o.alive !== false) out.push({ id: o.id, firstName: o.firstName, age: Math.floor(w.ageOf(o)), sp: o.id === sp, kid: (p.family?.childrenIds || []).includes(o.id) });
  return out;
}
const joinNames = (a) => (a.length <= 1 ? a.join('') : a.slice(0, -1).join(', ') + ' and ' + a.at(-1));

/** A richer label for what p is doing right now. now = routine.query.now(p) ({act, cat, off, label}). Returns the sim's own label if nothing better can honestly be said. */
export function activityLabel(w, p, now, x = {}) {
  if (!now) return '';
  const base = String(now.label || '').replace(/ at home at home$/, ' at home'), act = now.act, h = w.time.hour ?? 12, rec = w.time.rec || {}, dow = rec.dow ?? 0, weekend = dow >= 5;
  const pop = p.ext?.pop || {}, seed = hh32(p.id * 31 + Math.floor(w.tick / 9)), pick = (...a) => a[seed % a.length];
  const at = (/^.* at (?!home$)(.+)$/.exec(base) || [])[1] || (/\(([^)]+)\)$/.exec(base) || [])[1] || '';
  const home = p.locationId === p.homeId, co = x.co || companions(w, p), kids = co.filter((c) => c.kid && c.age < 12), partner = co.find((c) => c.sp), job = pop.occ, occN = ROLE[job] || '';
  const stress = pop.fin?.stress ?? 0, mood = p.mood ?? 0, wx = wxOf(w), rain = wx && /rain/.test(wx.type), dog = (pop.pets?.dogs || 0) > 0;
  const next = x.next || S(() => w.sys.routine.query.plan(p).find((e) => e.tick > w.tick && /^(work|night_work|business|work_home)$/.test(e.act)), null);
  const toShift = next && next.tick - w.tick < 130 ? next.act : null; let m;
  switch (act) {
    case 'sleep': return h < 6 || h >= 22 ? pick('Fast asleep', 'Asleep, phone charging by the bed', 'Dead to the world') : weekend ? pick('Having a lie-in', 'Sleeping in, nowhere to be') : 'Asleep at home';
    case 'sleep_day': return pick('Sleeping off a night shift', 'Asleep after a night shift, curtains drawn');
    case 'nap': return pick('Having a rest', 'Resting their eyes');
    case 'getup': return toShift === 'night_work' ? 'Up and getting ready for tonight\'s shift' : kids.length ? pick('Getting the kids up and ready', `Getting ${kids[0].firstName} ready for the day`) : toShift && pop.activity === 'employed' ? pick('Getting ready for work', 'Getting up and out for work') : pick('Getting up and putting the kettle on', 'Getting up and ready at home');
    case 'breakfast': return kids.length ? pick('Breakfast with the kids', `Breakfast with ${joinNames(kids.slice(0, 2).map((k) => k.firstName))}`) : partner ? `Breakfast with ${partner.firstName}` : pick('Toast and tea at home', 'Having breakfast at home');
    case 'lunch': return at && /work/i.test(base) ? 'Lunch break at ' + theName(at) : pick('Having lunch at home', 'Making some lunch');
    case 'dinner': return toShift === 'night_work' && home ? 'Making tea before the night shift' : kids.length ? pick('Cooking dinner for the family', `Sorting dinner while ${kids[0].firstName} does homework`) : partner ? `Cooking dinner with ${partner.firstName}` : home ? pick('Sorting something for tea', 'Cooking dinner for one', 'Having dinner at home') : base;
    case 'cook': return partner ? `Cooking with ${partner.firstName}` : kids.length ? 'Cooking with the kids around' : 'Cooking something proper';
    case 'tv': { const fb = (p.interests || []).includes('football') && ((dow === 5 && h >= 12 && h < 18) || (h >= 19 && h < 22)); const wi = partner || co[0]; return fb ? (wi ? `Watching the match with ${wi.firstName}` : 'Watching the match') : wi ? `Watching TV with ${wi.firstName}` : kids.length ? 'Watching something with the kids' : pick('On the sofa with the telly on', 'Watching TV at home'); }
    case 'gaming': return co[0] ? `Gaming with ${co[0].firstName} in the room` : 'Gaming at home';
    case 'phone': return stress > 0.6 || mood < -0.3 ? 'Scrolling, not really taking it in' : pick('Messaging friends', 'Scrolling on the sofa');
    case 'online': return pick('Chatting online with friends', 'Online with friends');
    case 'chores': return kids.length ? 'Picking up after the kids' : pick('Catching up on the washing', 'Doing the housework', 'Tidying round the flat');
    case 'childcare': return kids.length ? `Looking after ${joinNames(kids.slice(0, 3).map((k) => k.firstName))}` : 'Looking after the children';
    case 'garden': return pick('Out in the garden', 'Pottering in the garden or on the allotment');
    case 'sick': return pick('Under the weather at home', 'Off sick and resting');
    case 'jobsearch': return pop.activity === 'unemployed' ? pick('Going through job ads', 'Working on applications') : 'Sorting out paperwork';
    case 'carer': return 'Caring for a relative';
    case 'bedtime': return pick('Winding down for bed', 'Getting ready for bed');
    case 'homework': case 'study': return pick('Getting on with homework', 'Studying at home');
    case 'work': case 'night_work': case 'business': case 'work_home': {
      if (act === 'work_home') return pick('Working from home, laptop open', 'On a call from home');
      if (act === 'business') return at ? 'Running the business at ' + at : 'Running the business';
      const place = at ? ' at ' + theName(at) : ''; if (act === 'night_work') return (occN ? occN + ' on' : 'On') + ' the night shift' + place;
      return occN && at ? `${occN}${place}` : at ? `At work${place}` : base; }
    case 'commute': if ((m = /^(Walking|Cycling|On the bus|On the train|Driving) (to|home from) (.+)$/.exec(base))) { return `${m[1]} ${m[2]} ${theName(m[3])}${rain && /Walking|Cycling/.test(m[1]) ? ' in the rain' : ''}`; } return base;
    case 'school_run': return kids.length ? `Taking ${kids[0].firstName} to school` : h > 12 ? 'Collecting the kids from school' : 'On the school run';
    case 'shop': return at ? (stress > 0.6 ? `At ${at}, watching the total` : pick(`Picking up bits at ${at}`, `Shopping at ${at}`)) : base;
    case 'errand': return at ? `Popping into ${at}` : base;
    case 'cafe': return at ? pick(`Coffee at ${at}`, `Having a coffee at ${at}`) : base;
    case 'pub': return at ? pick(`Out at ${at}`, `Catching up at ${at}`) : base;
    case 'gym': return at ? `Working out at ${at}` : base;
    case 'park': return at ? (dog ? `Walking the dog in ${at}` : `Out in ${at}`) : dog ? 'Out walking the dog' : base;
    case 'worship': return at ? `At ${at}` : base;
    case 'community': case 'library': return at ? `At ${at}` : base;
    default: return base;
  }
}

const SENS_GOAL = /smok|drink|drug|alcohol|debt|therapy|counsel|mental|condition|immigration|visa|grievance|irregular|relationship|ask_out|partner/i;
/**
 * One current inner thought for p, keyed to what is true of them right now: money pressure, a goal step, partner, weather, the shift coming up, what they are doing.
 * Stable within about four game-hours, then moves on to something else true. x = optional facts already gathered ({press, unit, goals, partner, ties, lst, now, wb}).
 */
export function thoughtFor(w, text, p, x = {}) {
  if (!p || !text || !text.has) return '';
  const id = p.id, pop = p.ext?.pop || {}, h = w.time.hour ?? 12, q = w.sys, fin = pop.fin || {}, stress = x.press?.stress ?? pop.fin?.stress ?? 0;
  const now = x.now ?? S(() => q.routine.query.now(p)), act = now?.act || '', cat = now?.cat || '';
  const unit = x.unit ?? S(() => q.housing.query.unit(id)), goals = x.goals ?? S(() => q.goals.query.goalsOf(id), []), partner = x.partner ?? S(() => q.life.query.partner(id)), lst = x.lst ?? S(() => q.life.query.status(id), {});
  const wb = x.wb ?? S(() => q.health.query.wellbeing(id), {}), ties = x.ties ?? S(() => q.social.query.ties(id), []), wx = wxOf(w), co = companions(w, p), home = p.locationId === p.homeId;
  const mood01 = ((p.mood || 0) + 1) / 2, age = Math.floor(w.ageOf(p)), C = []; // candidates [key, weight, extras]
  const add = (k, wt, ex) => { if (text.has(k)) C.push([k, wt, ex || {}]); };
  const asleep = act === 'sleep' || act === 'sleep_day' || act === 'nap';
  if (asleep) add('thought.sleeping', 3); else if (h >= 1 && h < 5) add('thought.night', 3);
  if (!asleep) {
    const burden = S(() => q.housing.query.rentBurden(id), 0), renter = unit && unit.rent > 0 && !/own|mortgage/.test(unit.tenure || '');
    if ((fin.arrears || 0) > 60) add('thought.arrears', 3.2, { p: { owed: Math.round(fin.arrears) } });
    if (unit && unit.notice) add('thought.notice', 3.4, { p: { rent: Math.round((unit.rent || 900) * 1.0) } });
    if (renter && burden > 0.4) add('thought.rent', 1.6, { p: { rent: Math.round(unit.rent).toLocaleString('en-GB'), pct: Math.round(burden * 100) } });
    if (stress > 0.6) add('thought.money', 2);
    if (unit && unit.damp && home) add('thought.damp', 1.4);
    const g = goals.find((g) => g.status === 'active' && !g.secret && g.phrase && !SENS_GOAL.test(g.id || '') && !SENS_GOAL.test(g.phrase));
    if (g) { const st = g.step && g.step.label; if (st) add('thought.goal', 2.3, { goal: g.phrase, step: lowerFirst(st) }); else add('thought.goal_plain', 1, { goal: g.phrase }); }
    if (partner && partner.id != null && h >= 17 && h < 24) { const P = w.people.get(partner.id); if (P && partner.kind === 'on' && home) add('thought.partner', 1.7, { b: P }); }
    if (partner && partner.kind === 'off' && partner.id != null && h >= 8) { const P = w.people.get(partner.id); if (P) add('thought.partner_away', 1.2, { b: P }); }
    const kid = (p.family?.childrenIds || []).map((k) => w.people.get(k)).find((k) => k && k.alive && w.ageOf(k) < 15);
    if (kid && h >= 7 && h < 22) add('thought.kids', 1.5, { kid: kid.firstName });
    if (lst && lst.pregnant) add('thought.pregnant', 2.2); if (lst && lst.careing) add('thought.caring', 2);
    if (pop.activity === 'unemployed' && h >= 9 && h < 21) add('thought.jobhunt', 2.2);
    if (pop.activity === 'retired' && h >= 9 && h < 21) add('thought.retired', 1.5);
    if (pop.activity === 'student' && age >= 17 && h >= 9 && h < 22) add('thought.student', 1.5);
    if (wb && wb.lonely) add('thought.lonely', 2);
    if (wx && (cat === 'commute' || cat === 'errand' || cat === 'out' || (h >= 7 && h <= 9))) { const t = wx.type, k = t === 'rain' ? 'rain' : t === 'snow' ? 'snow' : t === 'fog' ? 'fog' : wx.temp <= 2 ? 'cold' : wx.temp >= 24 ? 'hot' : ''; if (k) add('thought.weather_' + k, 1.8); }
    const fr = ties.find((t) => t.on && (t.k === 'friction' || t.l < -0.25) && w.people.get(t.o)); if (fr) add('thought.friend_row', 1.3, { b: w.people.get(fr.o) });
    const nx = S(() => q.routine.query.plan(p).find((e) => e.tick > w.tick && /^(work|night_work|business|work_home)$/.test(e.act)), null);
    if (nx && nx.act === 'night_work' && nx.tick - w.tick < 130 && cat !== 'work' && home) add('thought.shift', 2.6, { p: { job: p.job ? String(p.job).split(/[ /(]/)[0].toLowerCase() : 'shift' } });
    const A = { tv: 'tv', pub: 'pub', gym: 'gym', shop: 'shop', cafe: 'cafe', worship: 'worship', park: (pop.pets?.dogs || 0) ? 'dog' : '', commute: 'commute', work: 'work', business: 'work' }[act]; if (A) add('thought.' + A, 1.9);
    if (home && act !== 'tv') add('thought.home', 0.8); if (!pop.hh || co.length === 0) add('thought.idle', 0.5);
    if ((p.family?.childrenIds || []).length && home && h % 4 === 0) add('thought.family', 0.6);
  }
  if (!C.length) return '';
  const d = w.calendar.dateOf(w.tick) || {}, win = Math.floor(w.tick / Math.max(6, Math.floor((w.TPD || 144) / 6))), base = hh32(id * 977 + win * 131);
  let tot = 0; for (const c of C) tot += c[1]; let r = (base % 10000) / 10000 * tot, ci = 0; for (; ci < C.length - 1; ci++) { r -= C[ci][1]; if (r < 0) break; }
  const order = [ci, ...C.map((_, i) => i).filter((i) => i !== ci)];
  const street = S(() => w.map.lf.streets[w.buildings.get(p.homeId).lf.streetId].name, 'the road');
  const view = (q2) => (q2 ? { id: q2.id, firstName: q2.firstName, lastName: q2.lastName, sex: q2.sex, age: Math.floor(w.ageOf(q2)), segment: q2.ext?.pop?.seg, mood: ((q2.mood || 0) + 1) / 2, job: q2.job, children: q2.family?.childrenIds || [] } : null);
  for (const i of order.slice(0, 3)) {
    const [key, , ex] = C[i];
    const ctx = { genre: 'thought', memory: false, a: view(p), b: ex.b ? view(ex.b) : undefined, seed: id * 8 + win * 3 + (d.d || 0) * 977, date: { ...d, weekday: d.dow, day: d.d, month: d.m, year: d.y, hour: h }, goal: ex.goal, step: ex.step, kid: ex.kid, p: { street, ...(ex.p || {}) }, features: { 'a.age': age } };
    try { const t = text.render(key, ctx, w); if (okText(t)) return t; } catch (e) { /* next */ }
  }
  return '';
}

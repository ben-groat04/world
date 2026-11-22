// Storylines: turns confirmed arcs into a short list of human stories worth following (protagonists, one-line headline, recent beats, "now" state).
// Pure over (sifter, accessors); worker-safe. Selection rules (all structural, nothing tuned to a name or an outcome):
//   - one storyline per protagonist (the strongest), at most MAXKIND per kind, nothing quiet, nothing that lapsed long ago;
//   - rank = salience carried by the beats x recency x variety of what happened (distinct event types) x kind weight (what a viewer cares about).
const MAXKIND = 3;
const KIND_W = { romance: 1.35, new_family: 1.3, bereavement: 1.2, illness: 1.15, job_loss: 1.1, breakup: 1.1, money_squeeze: 1.05, falling_out: 1.0, welcome: 1.0, ambition: 0.95, newcomer: 0.85, career: 0.8, scandal: 0.9, group_saga: 0.9 };
const NOISE = /^goal\.(step|effect|planned|replanned|deferred|formed)$|^social\.rumour$|^group\.meeting$|^kernel\.|^comms\./;
const lc = (s) => String(s || '').replace(/_/g, ' ');

// ---------------------------------------------------------------------------------------------------------------------------------
// Beat phrasing. Each event type gives a subject-free past clause ("lost his job when the firm closed") built from the real payload,
// place and other people, plus optionally a state form ("out of work") that reads after "now they're ...". Sensitive matters (secrets,
// addiction, mental health, crime) either return null (never shown) or are described soberly without the label.
const OVER = { remote: 'something said online', money: 'money', goal: 'what each of them wanted', noise: 'noise', parking: 'parking', pub: 'a night at the pub', bins: 'the bins', door: 'something said on the doorstep', kids: 'the kids', dogs: 'a dog', school: 'the school', community_centre: 'something at the community centre', bookmaker: 'the bookies', park: 'the park' };
const HOW = { nightout: 'after a night out', chance: 'by chance', friends: 'through friends', app: 'on a dating app', community: 'through the community', work: 'at work', family: 'through family', uni: 'at uni' };
const FVIA = { 'same street': 'as neighbours down the road', 'place of worship': 'at the place of worship', 'school gate': 'at the school gate', neighbours: 'as neighbours', 'same building': 'living in the same building', 'shop regular': 'as shop regulars', mixing: 'out and about', online: 'online' };
const AVIA = { school: 'got talking at the school gate', door: 'got talking on the doorstep', pub: 'got talking in the pub', park: 'got talking in the park', community_centre: 'met at the community centre', cafe: 'got talking in the cafe', group: 'met through a group', takeaway: 'got chatting in the takeaway queue', ethnic_grocer: 'got chatting in the grocer\'s', restaurant: 'got chatting over a meal', mosque: 'met at the mosque', church: 'met at the church', gym: 'met at the gym' };
const MOVE_WHY = { afford: 'when the rent got too much', notice: 'after notice came', partner: 'to be with a partner', separation: 'after the split', job: 'for work', study: 'to study', space: 'for more room', own_place: 'to a place of their own', flatmate_rotation: 'as the flatmates changed over', independence: 'to stand on their own feet', buy: 'to buy somewhere' };
const MOVE_TO = { metropolis: 'to the city', local: 'to somewhere nearby', elsewhere: 'further afield', suburbs: 'out to the suburbs' };
const JOBLOSS = { redundancy: 'was made redundant', firm_closed: 'lost {his} job when the firm closed', sick: 'had to give up work', dismissal: 'was let go', fixed_term_end: 'came to the end of a fixed-term contract', business_failed: 'saw the business go under' };
const COMPLAIN = { noise: 'noise', bins: 'the bins', damp: 'damp', parking: 'parking', dogs: 'dogs', litter: 'litter' };
const SENSITIVE_GOAL = /smok|drink|drug|alcohol|debt|therapy|counsel|mental|condition|immigration|visa|grievance|quick_cash|irregular|relationship|ask_out|find_partner/i;
const hsh = (n) => { let x = (Math.imul(n | 0, 2654435761) >>> 0); x ^= x >>> 15; x = Math.imul(x, 2246822519) >>> 0; return (x ^ (x >>> 13)) >>> 0; };
const aAn = (s) => (/^([aeiou]|HR|IT|MOT|SEN|GP\b)/i.test(s) && !/^(uni|use|eu)/i.test(s) && !/^GP/.test(s) ? 'an ' : 'a ') + s;
const cap1 = (s) => (s ? s[0].toUpperCase() + s.slice(1) : s);
const money = (n) => '£' + Math.round(n).toLocaleString('en-GB');
const span = (y) => (y < 1 ? 'a few months' : y < 1.5 ? 'about a year' : Math.round(y) + ' years');
const JOB = { airport_ground_staff: 'airport worker', hospitality_offmap: 'hospitality worker', retail_city: 'shop assistant', call_centre_cs: 'call-centre adviser', hgv_van_driver: 'driver', factory_operative: 'factory operative', rideshare_driver: 'private-hire driver', warehouse_picker: 'warehouse picker', food_factory_pack: 'food factory packer', delivery_courier_app: 'delivery courier', student_part_time: 'part-time job', healthcare_assistant: 'healthcare assistant', childcare_nanny: 'childminder', cleaner_housekeeper: 'cleaner', chef_offmap: 'chef', care_worker: 'care worker', admin_clerk: 'admin clerk', software_engineer: 'software engineer', marketing_media_creative: 'marketing associate', hr_finance_associate: 'HR associate', it_support_technician: 'IT technician', sales_agent_b2b: 'sales executive', leisure_receptionist: 'leisure centre receptionist', church_caretaker: 'caretaker', allied_health: 'allied health professional', dispatcher: 'taxi dispatcher', bar_staff: 'bar worker', barista_waiter: 'barista', shop_owner_manager: 'shopkeeper', school_support_staff: 'school caretaker', school_cook_midday: 'school cook', kitchen_porter_cook: 'kitchen porter', cook_chef: 'chef', builder_labourer_trades: 'builder', mechanic_engineering_trades: 'mechanic', electrician_plumber: 'electrician', police_fire_officer: 'police officer', freelancer_creative: 'freelance designer', lecturer_researcher: 'university lecturer', solicitor_legal: 'solicitor', accountant_finance: 'accountant', engineer_architect: 'engineer', phd_student_stipend: 'PhD researcher', doctor_hospital: 'hospital doctor', barber_hairdresser: 'hairdresser', printer_designer: 'designer', artist_maker: 'artist', clergy: 'vicar', lettings_agent: 'lettings agent', delivery_rider: 'delivery rider', delivery_driver: 'delivery driver', taxi_driver: 'taxi driver', warehouse_operative: 'warehouse operative', primary_teacher: 'primary school teacher', gp: 'GP', nurse: 'nurse', receptionist: 'receptionist', security_guard: 'security guard', tailor_seamstress: 'seamstress', betting_shop_cashier: 'betting shop cashier', launderette_attendant: 'launderette attendant', imam: 'imam', social_worker: 'social worker', retail_assistant: 'shop assistant', shop_supervisor: 'shop supervisor', bookkeeper_pa: 'bookkeeper', office_administrator: 'office administrator' };
export const occLabel = (w, id) => { if (JOB[id]) return JOB[id]; const o = (w.pack && w.pack.jobs || []).find((j) => j.id === id); if (!o) return ''; const t = String(o.label); return t.replace(/\s*\([^)]*\)?/g, '').split(' / ')[0].trim().toLowerCase(); };
let GP = null; const gphrase = (w, id) => { if (!GP) { GP = new Map(); try { for (const t of w.sys.goals.query.templates()) GP.set(t.id, t.phrase); } catch (e) { /* ignore */ } } return GP.get(id) || lc(id); };
const asJob = (w, id) => (occLabel(w, id) ? ' as ' + aAn(occLabel(w, id)) : '');
const first = (w, id) => { const p = w.people.get(id); return p ? p.firstName : null; };
const placeOf = (w, ev) => { try { const b = ev.place != null && w.buildings.get(ev.place); if (!b) return ''; if (b.lf && b.lf.kind === 'residential') { const st = w.map.lf.streets[b.lf.streetId]; return st ? ' on ' + st.name : ''; } return b.name && !/^(vacant|to let)/i.test(b.name) ? ' at ' + b.name : ''; } catch (e) { return ''; } };
// the other person in a two-person event when they are not one of the story's protagonists ("with Hamza")
const other = (c, ev) => { for (const id of (ev.actors || [])) if (!c.ids.has(id)) { const f = first(c.w, id); if (f) return f; } return null; };
const deceasedOf = (w, ev) => { const d = ev.type === 'life.funeral' && ev.cause ? w.events.get(ev.cause) : ev; return d && d.actors ? d.actors[0] : null; };

/** type -> (payload, c{w,ev,ids,his}) => string | {t, st} | null (null = never shown). */
const PH = {
  'life.couple': (p, c) => { const o = p.name && !c.names.includes(p.name.split(' ')[0]) ? ' with ' + p.name.split(' ')[0] : ''; return 'got together' + o + (HOW[p.how] ? ' ' + HOW[p.how] : ''); },
  'social.flirt': () => ({ t: 'started flirting', st: 'flirting' }),
  'life.cohabit': (p) => (p.how === 'partner moved in' ? { t: 'had their partner move in', st: 'living together' } : { t: 'moved in together', st: 'living together' }),
  'life.engaged': (p) => ({ t: 'got engaged' + (p.after >= 1 ? ' after ' + span(p.after) + ' together' : ''), st: 'engaged' }),
  'life.marriage': () => ({ t: 'got married', st: 'newly married' }),
  'life.pregnant': () => ({ t: 'found out a baby was on the way', st: 'expecting a baby' }),
  'life.birth': (p) => 'welcomed ' + (p.baby ? (p.sex === 'F' ? 'baby girl ' : p.sex === 'M' ? 'baby boy ' : 'baby ') + p.baby : 'a baby'),
  'life.breakup': (p) => 'split up' + (p.years >= 1 ? ' after ' + span(p.years) : ''),
  'life.divorce': (p) => 'divorced' + (p.years >= 1 ? ' after ' + span(p.years) : ''),
  'life.move_out': (p) => 'moved out' + (p.to ? ' to ' + p.to : '') + (p.reason === 'partner' ? ', to be with a partner' : p.reason === 'separation' ? ' after the split' : p.reason === 'job' ? ' for work' : p.reason === 'study' ? ' to study' : ''),
  'life.move_in': (p) => 'moved in' + (p.reason === 'partner' ? ' with a partner' : '') + (p.from ? ', from ' + p.from : ''),
  'life.leave_home': (p) => 'left home' + (p.reason === 'job' ? ' for work' : p.reason === 'study' ? ' to study' : p.reason === 'independence' ? ' to be independent' : ''),
  'life.caring_start': (p, c) => ({ t: 'took on caring for ' + c.his + ' ' + (p.rel || 'relative') + (p.hrs >= 35 ? ', a full-time job on its own' : ''), st: 'caring for ' + c.his + ' ' + (p.rel || 'relative') }),
  'life.caring_end': () => 'stopped being a carer',
  'life.death': (p, c) => { const d = c.ev.actors && c.ev.actors[0]; if (d != null && !c.ids.has(d)) { const f = first(c.w, d); return f ? 'lost ' + f : 'lost someone close'; } return 'died' + (p.age ? ' aged ' + p.age : ''); },
  'life.kin_death': () => 'lost a relative',
  'life.funeral': (p, c) => { const d = deceasedOf(c.w, c.ev); const f = d != null && !c.ids.has(d) ? first(c.w, d) : null; return f ? "went to " + f + "'s funeral" : 'went to a funeral'; },
  'life.will': () => 'was named in a will',
  'life.graduate': () => 'graduated',
  'labour.job_lost': (p, c) => { const t = (JOBLOSS[p.kind] || 'lost {his} job').replace('{his}', c.his); return { t: t + (p.occ && !/closed|under|contract/.test(t) ? asJob(c.w, p.occ) : ''), st: 'out of work' }; },
  'labour.quit': (p, c) => ({ t: 'quit ' + (occLabel(c.w, p.occ || '') ? 'the ' + occLabel(c.w, p.occ) + ' job' : c.his + ' job'), st: 'out of work' }),
  'labour.hired': (p, c) => ({ t: (occLabel(c.w, p.occ || '') ? 'started as ' + aAn(occLabel(c.w, p.occ)) : 'started a new job') + (p.via === 'referral' ? ', on a friend\'s word' : p.from === 'unemployed' ? ', after a spell out of work' : ''), st: occLabel(c.w, p.occ || '') ? 'working as ' + aAn(occLabel(c.w, p.occ)) : 'in a new job' }),
  'labour.promoted': (p, c) => 'was promoted' + (occLabel(c.w, p.occ || '') ? ' to ' + occLabel(c.w, p.occ) : ''),
  'labour.pay_rise': (p) => 'got ' + (p.pct ? aAn(Math.round(p.pct) + '% pay rise') : 'a pay rise'),
  'labour.second_job': () => 'took on a second job',
  'labour.firm_closed': (p) => 'saw ' + (p.name || 'the firm') + ' close',
  'labour.went_inactive': (p) => (p.why === 'caring' ? 'gave up work to care for someone' : p.why === 'long_term_sickness' ? 'stopped work long-term' : 'stopped looking for work'),
  'labour.applied': (p, c) => (p.ok === false ? 'was turned down for a job' + (occLabel(c.w, p.occ || '') ? ' as ' + aAn(occLabel(c.w, p.occ)) : '') : 'went for a job' + (occLabel(c.w, p.occ || '') ? ' as ' + aAn(occLabel(c.w, p.occ)) : '')),
  'housing.rent_rise': (p) => ({ t: 'saw the rent go up ' + Math.round(p.pct || 0) + '%' + (p.to ? ', to ' + money(p.to) + ' a month' : ''), st: 'paying ' + money(p.to || 0) + ' a month in rent' }),
  'housing.notice_served': (p) => ({ t: p.reason === 'arrears' ? 'was served notice over the arrears' : p.reason === 'sale' ? 'was given notice because the landlord is selling' : p.reason === 'family_use' ? 'was given notice so the landlord\'s family could move in' : p.reason === 'retaliatory' ? 'was given notice after complaining' : 'was served notice', st: 'facing eviction' }),
  'housing.eviction': () => 'was evicted', 'housing.homeless': () => 'lost their home',
  'housing.moved_out': (p) => 'moved out' + (MOVE_TO[p.to] ? ' ' + MOVE_TO[p.to] : '') + (MOVE_WHY[p.reason] ? ' ' + MOVE_WHY[p.reason] : ''),
  'housing.moved_in': (p) => ({ t: 'moved in' + (p.from === 'outside' ? ' from outside the area' : p.from === 'local' ? ' from nearby' : '') + (p.reason === 'social_allocation' ? ' on a council tenancy' : p.reason === 'flatmate_arrival' ? ' to share a flat' : p.reason === 'couple' ? ' with a partner' : p.reason === 'job' ? ' for work' : ''), st: 'new to the street' }),
  'housing.overcrowded': (p) => ({ t: 'found the flat too small for everyone', st: 'short of space' }),
  'money.arrears': (p) => ({ t: 'fell ' + (p.owed ? money(p.owed) + ' ' : '') + 'behind on the rent', st: 'behind on the rent' }),
  'money.debt_spiral': (p) => ({ t: 'started borrowing to get by', x: p.debt ? ', about ' + money(Math.round(p.debt / 100) * 100) + ' in debt' : '', st: 'borrowing to get by' }),
  'money.cost_pressure': () => ({ t: 'started to feel the squeeze', st: 'feeling the squeeze' }),
  'money.benefit_claim': () => 'put in a benefits claim',
  'money.arrears_cleared': () => 'cleared the arrears',
  'money.estate': () => 'came into a little money',
  'health.diagnosis': (p) => 'was diagnosed with ' + lc(p.condition),
  'health.crisis': () => 'ended up in hospital', 'health.accident': (p) => (p.kind === 'road' ? 'was hurt in a road accident' : p.kind === 'fall' ? 'had a bad fall' : 'had an accident'),
  'health.episode': () => 'went through a rough few months', 'health.treatment': () => 'asked the GP for help', 'health.recovered': () => 'turned a corner',
  'health.ill': (p) => (p.name ? 'came down with ' + lc(p.name) : 'fell ill'),
  'social.fallout': (p, c) => { const o = OVER[p.over]; return 'fell out' + (o ? ' over ' + o : '') + (p.over === 'remote' ? '' : placeOf(c.w, c.ev)); },
  'social.reconcile': () => 'made up',
  'social.friendship': (p, c) => { const o = other(c, c.ev); return 'became friends' + (o ? ' with ' + o : '') + (FVIA[p.via] ? ' ' + FVIA[p.via] : ''); },
  'social.acquaint': (p, c) => { const o = other(c, c.ev); return p.via === 'welcome' ? (o ? 'was welcomed to the street by ' + o : 'was welcomed to the street') : (AVIA[p.via] || 'got talking') + (o ? ' with ' + o : ''); },
  'social.confide': (p, c) => { const o = other(c, c.ev); return o ? 'opened up to ' + o : 'opened up to a friend'; },
  'social.kindness': (p, c) => { const o = other(c, c.ev); return o ? 'looked out for ' + o : 'showed a kindness'; },
  'social.secret': () => null,
  'social.scandal': (p, c) => (p.kind === 'new_couple' ? 'had a new romance become the talk of the street' : p.kind === 'lost_job' ? 'had news of a job loss get round' : p.kind === 'family_news' ? 'had family news get round' : p.kind === 'moving_out' ? 'had word get round of a move' : null),
  'group.founded': (p) => 'started ' + (p.name || 'a group') + (p.kind && p.name && !new RegExp(p.kind, 'i').test(p.name) ? ', ' + aAn(p.kind) : ''),
  'group.joined': () => 'joined a local group', 'group.conflict': (p, c) => 'clashed at a meeting' + placeOf(c.w, c.ev), 'group.dissolved': (p) => (p.why === 'never got going' ? 'saw the group fold before it got going' : 'saw the group fold'),
  'group.leader_changed': (p) => (p.how === 'challenge' ? 'ousted the group\'s leader' : 'took over running the group'), 'group.split': () => 'split the group',
  'civic.complaint': (p) => 'complained to the council' + (COMPLAIN[p.kind] ? ' about ' + COMPLAIN[p.kind] : ''),
  'goal.formed': (p, c) => (SENSITIVE_GOAL.test(p.tpl || '') || (c.ev.tags || []).includes('secret') ? null : { t: 'decided to ' + gphrase(c.w, p.tpl), st: 'trying to ' + gphrase(c.w, p.tpl) }),
  'goal.completed': (p, c) => (SENSITIVE_GOAL.test(p.tpl || '') ? null : 'managed to ' + gphrase(c.w, p.tpl)),
  'goal.failed': (p, c) => (SENSITIVE_GOAL.test(p.tpl || '') ? null : 'gave up trying to ' + gphrase(c.w, p.tpl)),
  'goal.abandoned': (p, c) => (SENSITIVE_GOAL.test(p.tpl || '') ? null : 'dropped the plan to ' + gphrase(c.w, p.tpl)),
  'goal.transformed': () => 'changed tack', 'goal.invented': (p) => 'came up with a plan for ' + (p.label || 'something new'),
  'project.started': (p) => 'got a ' + (p.kind || 'project') + ' going', 'project.done': (p) => (p.ok === false ? 'saw a ' + (p.kind || 'project') + ' fall flat' : 'pulled off a ' + (p.kind || 'project')),
};
// events that say the same thing share a key so a card does not repeat itself ("fell out", "fell out over money", "fell out")
const KEY = (t) => ({ 'life.move_out': 'move', 'housing.moved_out': 'move', 'life.move_in': 'movein', 'housing.moved_in': 'movein', 'goal.failed': 'goalend', 'goal.abandoned': 'goalend', 'life.death': 'death', 'life.kin_death': 'death', 'labour.job_lost': 'jobend', 'labour.quit': 'jobend', 'social.acquaint': 'meet', 'social.friendship': 'friend', 'life.breakup': 'split', 'life.divorce': 'split', 'money.cost_pressure': 'squeeze', 'housing.rent_rise': 'rent' }[t] || t);
const hisOf = (w, ids) => { if (ids.length !== 1) return 'their'; const p = w.people.get(ids[0]); return p && p.sex === 'F' ? 'her' : p && p.sex === 'M' ? 'his' : 'their'; };

const KIND_LEAD = { romance: 'Love story', breakup: 'After the break-up', new_family: 'A growing family', job_loss: 'Out of work', money_squeeze: 'Money getting tight', newcomer: 'New to the street', falling_out: 'A falling out', illness: 'Health scare', bereavement: 'Bereavement', career: 'Getting on', scandal: 'Word on the street', ambition: 'A plan', welcome: 'Neighbours', group_saga: 'A club story' };
export const kindLabel = (k) => KIND_LEAD[k] || lc(k);
const firstName = (w, id) => { const p = w.people.get(id); return p ? p.firstName : 'someone'; };
/** Protagonist display names: first names, full only when two share one. */
function nameList(w, ids) { const f = ids.map((i) => firstName(w, i)); return f.map((n, i) => (f.indexOf(n) !== i ? n + ' ' + ((w.people.get(ids[i]) || {}).lastName || '') : n).trim()); }
export const namesOf = (w, ids) => { const n = nameList(w, ids); return n.length > 2 ? n.slice(0, -1).join(', ') + ' & ' + n.at(-1) : n.join(' & '); };
const PAIRED = new Set(['life.couple', 'life.breakup', 'life.divorce', 'life.cohabit', 'life.engaged', 'life.marriage', 'life.pregnant', 'life.birth', 'social.friendship', 'social.fallout', 'social.reconcile', 'social.flirt', 'life.caring_start']);
const PAIR = new Set(['romance', 'breakup', 'falling_out', 'welcome', 'new_family']); // stories about two people; the rest follow one person and name others as they appear
const protagonists = (arc, w) => arc.actors.filter((a) => typeof a === 'number' && w.people.get(a)).slice(0, PAIR.has(arc.kind) ? 2 : 1);

/** One event as a subject-free clause: {t (past), st (state form or ''), key}, or null when it is mundane/sensitive/unknown. */
export function clauseOf(ev, w, ids) {
  const f = PH[ev.type]; if (!f) return null;
  const names = ids.map((i) => firstName(w, i)); let r;
  try { r = f(ev.payload || {}, { w, ev, ids: new Set(ids), names, his: hisOf(w, ids) }); } catch (e) { return null; }
  if (!r) return null; if (typeof r === 'string') r = { t: r }; return { t: r.t, x: r.x || '', st: r.st || '', key: KEY(ev.type), type: ev.type };
}

/** Plain recent beats of an arc as [{tick, text, st, key, type, eid, actors}], oldest first, noise removed, duplicates in a row collapsed. */
export function beatsOf(arc, w, max = 6) {
  const out = [], ids = protagonists(arc, w);
  for (let i = arc.beats.length - 1; i >= 0 && out.length < max; i--) {
    const b = arc.beats[i]; if (NOISE.test(b.type) || b.stage === 'consequence') continue; if (!PH[b.type]) continue;
    const ev = w.events.get ? w.events.get(b.eid) : null; if (!ev || ((/^goal\./.test(b.type)) && (ev.salience ?? 0) < 0.2)) continue;
    const c = clauseOf(ev, w, ids); if (!c) continue; if (out.length && out[0].text === c.t) continue;
    const W = 'was welcomed to the street by '; if (out.length && c.t.startsWith(W) && out[0].text.startsWith(W)) { const wl = (out[0].wl || [out[0].text.slice(W.length)]).concat(c.t.slice(W.length)); out[0].wl = wl; out[0].text = W + (wl.length > 3 ? wl.slice(0, 2).join(', ') + ' and ' + (wl.length - 2) + ' others' : wl.length === 3 ? wl.join(', ').replace(/, ([^,]*)$/, ' and $1') : wl.join(' and ')); out[0].tick = b.tick; continue; }
    if (out.length && out[0].key === c.key && c.key === 'money.arrears') out.shift();
    out.unshift({ tick: b.tick, text: c.t, x: c.x, st: c.st, key: c.key, type: b.type, eid: b.eid, actors: ev.actors || [] });
  }
  return out;
}

/**
 * One-sentence premise from the actual people, what happened and how it stands now:
 * "Priya and Tom got together through friends, then moved in together; now they're expecting a baby."
 */
export function headlineOf(arc, w, beats = beatsOf(arc, w, 40)) {
  const ids = protagonists(arc, w), nm = nameList(w, ids), S = nm.join(' and ') || 'Someone', one = ids.length === 1, p0 = w.people.get(ids[0]);
  const pro = one ? (p0 && p0.sex === 'F' ? 'she' : p0 && p0.sex === 'M' ? 'he' : 'they') : 'they', be = one && pro !== 'they' ? "'s" : "'re";
  const plur = (t) => (one ? t : t.replace(/^was /, 'were ').replace(/^has /, 'have '));
  // collapse same-key repeats: keep the latest; "again" only when it really is the same thing again
  const by = new Map(), seen = new Map(); for (const b of beats) { const o = by.get(b.key), prev = seen.get(b.key) || new Set(); by.set(b.key, { ...b, again: prev.has(b.text), text: o && o.text.length > b.text.length && b.text.length < 14 ? o.text : b.text }); prev.add(b.text); seen.set(b.key, prev); }
  const d = [...by.values()].sort((x, y) => x.tick - y.tick);
  if (!d.length) return `${S}: ${kindLabel(arc.kind).toLowerCase()}.`;
  const h = hsh(arc.id ?? (arc.start | 0)), open = arc.status === 'open';
  // in a pair story a beat that happened to just one of them is attributed to them by name
  const sub = (b) => { if (one || PAIRED.has(b.type)) return ''; const inv = ids.filter((i) => b.actors.includes(i)); return inv.length === 1 ? nm[ids.indexOf(inv[0])] : ''; };
  const txt = (b) => plur(b.text) + (b.again ? ' again' : ''), lead = (b) => `${sub(b) || S} ${txt(b)}`, tail = (b) => (sub(b) ? `${sub(b)} ${txt(b)}` : txt(b));
  if (d.length === 1) return `${lead(d[0])}.`;
  const a = d[0], z = d.at(-1), m = d.length >= 3 ? d[d.length - 2] : null, thens = ['then', 'soon', 'after that'];
  let s = lead(a);
  if (z.st && open && !/^(life|goal)\.(death|failed|abandoned)/.test(z.type) && !sub(z)) {
    if (m) s += `, ${thens[h % 3]} ${tail(m)}`;
    s += [`; now ${pro}${be} ${z.st}`, ` and now ${pro}${be} ${z.st}`, `, and these days ${pro}${be} ${z.st}`][h % 3];
  } else {
    const sameSub = m && sub(m) === sub(z); if (m && sameSub) s += `, ${thens[h % 3]} ${tail(m)} and ${sub(z) ? txt(z) : tail(z)}`;
    else s += (m ? `, ${thens[h % 3]} ${tail(m)}` : '') + [`, then ${tail(z)}`, `; ${['after that', 'soon after', 'not long after'][(h >>> 3) % 3]} ${sub(z) ? '' : pro + ' '}${tail(z)}`, `, and then ${tail(z)}`][h % 3];
  }
  if (s.length > 175 && m) s = `${lead(a)}, then ${tail(z)}`;
  return s.replace(/\s+/g, ' ') + '.';
}

// "Tom lost his job when the firm closed": a beat with its subject (who in the story it happened to), for a card's list.
function beatLine(b, w, arc) {
  const ids = protagonists(arc, w), who = ids.filter((i) => b.actors.includes(i)); const pick = who.length ? who : ids.slice(0, 1);
  return cap1(`${nameList(w, ids).filter((n, i) => pick.includes(ids[i])).join(' and ')} ${pick.length > 1 ? b.text.replace(/^was /, 'were ') : b.text}${b.x || ''}`);
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
      beats: beats.map((b) => ({ tick: b.tick, date: w.calendar.formatDate(b.tick), text: beatLine(b, w, a) })), since: Math.max(1, Math.round((now - a.start) / tpd)), idle: Math.round((now - a.last) / tpd), rank: Math.round(c.rank * 100) / 100 });
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

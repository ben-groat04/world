// Play + god-consequence layer for the UI host (worker-safe, no DOM). Owns: player setup/creation, verbs -> kernel commands (actor 'player'),
// the compact HUD state, on-demand sheet sections, pause-on-event, skip-ahead, and the god-intervention consequence tracker (causal event chains).
import { describeEvent } from '../describe.js';
import { isPrivate, adminData, fmtLabel } from '../town.js';
import { GOD_PRESETS } from '../godcatalogue.js';
import { CASE_KINDS } from '../../sim/systems/civic/data.js';
import { stepLabel } from '../../sim/goals/describe.js';
import { MOVE } from '../../sim/goals/moves.js';

const nm = (p) => (p ? `${p.firstName} ${p.lastName}` : 'someone');
const r2 = (v) => Math.round(v * 100) / 100;
const lc = (s) => String(s || '').replace(/_/g, ' ');
const REQ_TEXT = { ask: 'would like to ask you a favour', persuade: 'is trying to talk you round', recruit: 'would like you to join something', befriend: 'wants to get to know you better', flatter: 'is being very nice to you', confide: 'wants to confide in you', gossip: 'has some gossip to share', confront: 'wants a word with you', apologise: 'wants to apologise to you', borrow: 'would like to borrow some money', lend: 'wants to lend you some money', gift: 'has a little gift for you', invite: 'is inviting you out', visit: 'would like to visit you', message: 'has sent you a message', threaten: 'is leaning on you', mediate: 'wants to smooth things over' };
const REQ_TPL = { befriend_isolated_neighbour: 'knocked to say hello: you are new on the street', help_neighbour: 'popped round to ask if you need anything now you have moved in' };
const ASK_FAVOUR = ['asks if you have a drill they could borrow', 'asks if you could take in a parcel for them', 'is after a cup of sugar and a bit of company', 'asks whether you could keep an eye on the flat this weekend', 'asks if you know a decent plumber', 'asks if you have jump leads'];
const WEEK = 144 * 7;
const cap1 = (s) => (s ? s[0].toUpperCase() + s.slice(1) : s);
const WARM = (l) => (l == null ? 'not met' : l > 0.5 ? 'close' : l > 0.2 ? 'friendly' : l > -0.15 ? 'acquaintance' : 'cool');
const ACT_DID = { small: 'chatted with', joke: 'joked with', news: 'shared some news with', advise: 'offered advice to', comfort: 'comforted', complain: 'had a moan with', confide: 'confided in', gossip: 'gossiped with', flirt: 'flirted with', favour: 'asked a favour of', apologise: 'apologised to', argue: 'argued with' };
const ACT_COOL = { flirt: 'Flirting lands better once you know each other.', argue: 'Arguing rarely wins people over.', favour: 'Asking for favours works better once you have built some goodwill.', confide: 'Opening up to someone you barely know can feel like too much.', gossip: 'Gossip goes down badly if they like the person you are talking about.', complain: 'Moaning to someone you hardly know can wear thin.' };
// What you can do yourself to speed up each kind of goal step (goal steps otherwise run on autopilot, mostly in spare evenings).
const MOVE_HINT = { search: 'happens on its own at home', plan: 'happens on its own at home', budget: 'happens on its own at home', save: 'happens on its own', wait: 'just takes time', apply: 'you can apply yourself: Do > Life admin > Jobs', attend: 'go along yourself: Do > Go somewhere', join: 'you can join a group yourself: Do > Goals & groups', ask: 'talk to or message the person yourself', befriend: 'talk to people when you meet them', persuade: 'talk to them yourself', recruit: 'ask them yourself: talk to them', invite: 'invite them yourself: message them', visit: 'drop in yourself: Do > Go somewhere', rent: 'Do > Life admin > Home', move: 'Do > Life admin > Home', train: 'happens on its own in spare time', learn: 'happens on its own in spare time', exercise: 'happens on its own in spare time', message: 'message them yourself: Do > Phone', buy: 'happens on its own' };
// Templates that only make sense in a situation the sim has to create (a grievance, a partner to win back...): hidden from the picker.
const NEEDS_SITUATION = new Set(['ask_out', 'repair_or_end_relationship', 'settle_a_grievance', 'reconcile_with_person', 'win_back_ex', 'get_engaged_or_commit', 'avenge_wrong', 'expose_secret', 'challenge_group_leader', 'deal_with_neighbour_noise', 'find_partner', 'move_in_together', 'grieve_and_settle_affairs', 'support_parent', 'help_child_at_school', 'get_childcare', 'start_family']);
const FIX_JOB = { unemployed: 'out of work', 'sick disabled': 'off work (ill or disabled)', 'other inactive': 'not working', 'looking after family': 'at home with family', student: 'student', retired: 'retired' };
const k0 = (v) => Math.round(v / 1000);
const fh = (h) => { h = h % 24; const hh = Math.floor(h), mm = Math.floor((h - hh) * 60); return hh + ':' + String(mm).padStart(2, '0'); };
const CASE_NAME = { bins: 'missed bins', pothole: 'a pothole', flytip: 'fly-tipping', damp: 'damp in a council home', repair: 'a council repair', noise: 'noise' };
const dayName = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];

export class PlayHost {
  constructor(host) {
    this.h = host; this.w = host.w; this.pauseOnEvent = true; this.skip = null; this.lastState = 0; this.lastRep = null; this.repAt = -1e9; this.reqSeen = new Set();
    this.ivs = []; this.tracked = new Map(); this.scanFrom = this.w.events.nextId; this.ivSeq = 1; this.convSig = '';
    if (this.w.events.registry.has('request.pending')) this.w.on('request.pending', (ev) => this.onRequest(ev));
    for (const t of ['player.match', 'labour.applied']) if (this.w.events.registry.has(t)) this.w.on(t, (ev) => this.onEvent(ev, null)); // player-facing notices that are not news
  }
  get pid() { return typeof this.w.player === 'number' ? this.w.player : null; }
  S(f, d = null) { try { return f(); } catch (e) { return d; } }
  say(msg) { this.h.send(msg); }

  // ------------------------------------------------------------------ setup (newcomer creator / take over)
  setup() {
    const w = this.w, P = w.sys.player.query;
    const mk = () => P.vacancies().filter((u) => u.tenure === 'private_rent'); let vac = mk(), guard = 0;
    while (!vac.length && guard++ < 60) { w.run(144); vac = mk(); }
    const byB = this.h.byBid;
    const homes = vac.slice(0, 24).map((u) => ({ id: u.id, bid: u.bid, address: u.address, rent: u.rent, beds: u.bedrooms, tenure: u.tenure, cond: r2(u.cond), area: byB.get(u.bid)?.name || '' }));
    const seen = new Map(); for (const o of P.openings()) { const k = o.occ; const e = seen.get(k) || { occ: k, label: lc(k), n: 0, onmap: false }; e.n += o.count || 1; if (o.kind === 'slot') e.onmap = true; seen.set(k, e); }
    const jobs = [...seen.values()].map((e) => ({ ...e, ...this.jobInfo(e.occ), n: e.n })).sort((a, b) => (b.onmap - a.onmap) || (b.mid - a.mid)).slice(0, 40);
    this.say({ t: 'play.setup', homes, jobs, date: w.calendar.formatDate(w.tick) });
  }
  // Human job title and pay band from the pack (pay is { p10, median, p90 } gross full-time-equivalent GBP a year).
  jobInfo(occ) {
    const o = (this.w.pack.jobs || []).find((j) => j.id === occ); if (!o) return { label: cap1(lc(occ)), sub: '', band: '', mid: 0, hours: '' };
    const title = o.label.replace(/\s*\(.*?\)\s*/g, ' ').trim(), sub = (o.label.match(/\((.*?)\)/) || [])[1] || '', lo = k0(o.pay.p10), hi = k0(o.pay.p90), h = o.hours;
    return { label: title, sub, band: lo === hi ? `£${lo}k` : `£${lo}–${hi}k`, mid: o.pay.median, hours: h ? `${Math.round(h[1])} h/week` : '', where: o.where === 'onmap' ? 'in Larkfield' : o.where === 'home' ? 'from home' : 'in the city' };
  }
  jobWords(p) { const j = p.job || ''; if (FIX_JOB[j]) return FIX_JOB[j]; const o = (this.w.pack.jobs || []).find((x) => x.id === j || x.label === j); return o ? this.jobInfo(o.id).label.toLowerCase() : lc(j); }
  create(args) { const r = this.verb('player.create', args, true); if (r && r.ok) { this.h.setTier('scene'); this.pauseOnEvent = true; this.h.selected = r.pid; this.say({ t: 'play.on', pid: r.pid }); this.state(true); } else this.say({ t: 'play.result', name: 'player.create', ok: false, text: (r && r.why) ? cap1(r.why) + '.' : 'Could not move in.', body: 'Pick another flat, or bring more savings: you need the deposit and first month of rent.' }); }
  take(pid) { const r = this.verb('player.take', { pid }, true); if (r && r.ok) { this.h.setTier('scene'); this.h.selected = pid; this.say({ t: 'play.on', pid }); this.state(true); } }
  release() { this.verb('player.release', {}, true); this.say({ t: 'play.off' }); }

  // ------------------------------------------------------------------ verbs
  verb(name, args, quiet) {
    const w = this.w; let r; if (/^(business\.(start|workAt|becomeRegular)|crime\.(report|joinWatch|lockUp)|civic\.(complain|object|joinCampaign|standCouncillor))$/.test(name)) args = { ...(args || {}), pid: this.pid };
    try { r = w.queueCommand({ actor: 'player', name, args: args || {} }); } catch (e) { r = { ok: false, why: String(e.message || e) }; }
    if (r === true) r = { ok: true }; else if (r === false || r == null) r = { ok: false, why: '' };
    if (!quiet) { const fb = this.feedback(name, args || {}, r); this.say({ t: 'play.result', name, ok: !!r.ok, text: fb.title, ...fb }); }
    if (r && r.ok && /goTo|stay|goOut|buy/.test(name)) this.h.lastDetail = 0;
    return r;
  }
  // Every action answers three things in plain English: what you did, what happened and why, and what you could try next.
  feedback(name, a, r) {
    const w = this.w, pid = this.pid, q = a.to != null ? w.people.get(a.to) : null, who = q ? q.firstName : 'them', Q = w.sys.player.query;
    const out = (title, body, o = {}) => ({ ok: !!r.ok, title, body, ...o });
    const days = (n) => (n <= 1 ? 'about a day' : `about ${n} days`);
    const pendingLine = () => { const pe = this.S(() => Q.pending(pid), []); return pe.length ? `Out now: ${pe.map((x) => `${this.jobInfo(x.occ).label} (reply in ${x.daysLeft ? days(x.daysLeft) : 'a day or so'})`).join('; ')}.` : ''; };
    const place = (bid) => { const b = w.buildings.get(bid); return b ? b.name : 'there'; };
    switch (name) {
      case 'player.talk': {
        if (!r.ok) {
          if (/not here/.test(r.why || '')) return out(`${who} is not here any more`, 'People move on. Check who is here now, or message them from Phone.', { next: [{ label: 'See who is here', open: 'menu' }] });
          if (/little while/.test(r.why || '')) return out(`You have only just spoken to ${who}`, 'Give it half an hour or so. Talk to someone else, or go somewhere new, then come back.', { next: [{ label: 'See who is here', open: 'menu' }] });
          return out('Nobody to talk to', 'Nobody by that name is here.', { next: [{ label: 'See who is here', open: 'menu' }] });
        }
        const lbl = WARM(r.l), met = r.met ? ` You have now properly met ${who}: they are in your People list, so you can message them and ask them out, or invite them to things.` : '';
        if (r.react === 'warm') return out(`You ${ACT_DID[r.act] || 'talked to'} ${who}`, `${who} warmed to it. You are now ${lbl}.${met}`, { next: [{ label: 'Talk more later', open: 'menu' }] });
        if (r.react === 'cool') return out(`You ${ACT_DID[r.act] || 'talked to'} ${who}`, `${who} did not take it well and likes you a little less. ${ACT_COOL[r.act] || 'It happens.'} Try something lighter next time, like small talk or a joke.`, { next: [{ label: 'Try small talk instead', open: 'menu' }] });
        return out(`You ${ACT_DID[r.act] || 'talked to'} ${who}`, `${who} took it in their stride, and nothing much changed. Friendships grow with repeat meetings, so keep bumping into each other: groups, the pub, the café. You are ${lbl}.${met}`, { next: [{ label: 'Find a group to join', open: 'goals' }] });
      }
      case 'player.message': {
        if (!r.ok) return out(`Could not reach ${who}`, 'Their phone seems to be off. Try again later.');
        return out(`You ${r.voice ? 'rang' : 'messaged'} ${who}`, r.react === 'warm' ? `${who} replied warmly. Keeping in touch builds a tie more slowly than seeing each other, but it counts.` : r.react === 'cool' ? `${who} was short with you. Maybe not the right moment.` : `${who} replied; nothing much changed. Messages keep a tie alive; meeting in person grows it.`, { next: [{ label: 'Back to the list', open: 'phone' }] });
      }
      case 'player.askOut': {
        if (r.ok) return out(`${who} said yes`, `You are now seeing each other. Keep it going: talk, message, spend time together. Things can go further if it works.`);
        if (/not really met/.test(r.why || '')) return out(`You have not really met ${who} yet`, 'Get to know them first: chat when you meet, join the same group, or message them.', { next: [{ label: 'See who is here', open: 'menu' }] });
        if (r.why === 'asked recently') return out(`You already asked ${who} out`, `Asking again straight away would be pushy. Give it ${r.days} more days and spend some time together first.`);
        if (/already seeing/.test(r.why || '')) return out(r.why[0].toUpperCase() + r.why.slice(1), 'Nobody to ask out right now.');
        if (r.why === 'not a match') return out(`${who} is not someone you would match with`, 'Age or orientation does not line up, so there is no point asking.');
        if (r.low) return out(`${who} turned you down`, `They do not seem to see you that way, and asking again soon will not change it. Plenty of other people to meet: try the dating app or a group.`, { next: [{ label: 'Open dating', open: 'dating' }] });
        return out(`${who} said not right now`, `You do not know each other well enough yet (${r.inPerson ? 'asking in person' : 'asking by message'} takes a bit of nerve and it did not land). Spend more time together first, chat, meet at a group, and try again in a few weeks.`, { next: [{ label: 'Message them', open: 'dating' }] });
      }
      case 'player.datingProfile': {
        if (!r.ok) return out('Could not set up a profile', /seeing/.test(r.why || '') ? 'You are already seeing someone.' : 'Something went wrong. Try again in a moment.');
        if (!r.on) return out('Dating profile paused', 'You will not get new matches until you switch it back on. Existing matches stay.');
        return out('Your dating profile is live', r.pool ? `About ${r.pool} people near you are on the app and could be a match. Matches arrive over days (roughly one or two a week), and the game stops to tell you. Then you can message them, and ask them out when you have chatted a bit.` : 'Hardly anyone nearby is on the app yet. Leave it on: matches can still show up as people join.', { next: [{ label: 'Meet people in person too', open: 'menu' }] });
      }
      case 'player.apply': {
        const label = this.jobInfo(a.occ).label;
        if (r.ok) return out(`Application sent: ${label}`, `Employers usually take one to three weeks to reply: expect ${days(r.days)}. They weigh your qualifications and experience against other jobseekers, and senior posts go to people already working up to them. ${pendingLine()} You can have three out at once.`, { next: [{ label: 'Apply for another', open: 'work' }, { label: 'Meanwhile, meet people', open: 'menu' }] });
        if (/three applications/.test(r.why || '')) return out('You already have three applications out', `${pendingLine()} Wait for a reply before applying for more; the game will tell you as soon as one comes back.`);
        if (/already applied/.test(r.why || '')) return out(`You already applied for ${label}`, `${pendingLine()} Nothing to do but wait.`);
        return out('Could not apply', r.why ? cap1(r.why) + '.' : 'That job is not available.');
      }
      case 'player.quit': return r.ok ? out('You handed in your notice', 'You will not be paid after your last day. Look under Life admin > Jobs for something else.', { next: [{ label: 'Find a job', open: 'work' }] }) : out('You have no job to quit', 'You are not employed right now.');
      case 'player.rent': return r.ok ? out('You signed a new lease', 'Your belongings follow within a day or so. Check your money: rent is due monthly.') : out('Could not take that flat', r.why ? cap1(r.why) + '. Another one may suit better.' : 'It may have just gone. Pick another.', { next: [{ label: 'See other flats', open: 'work' }] });
      case 'player.join': {
        if (r.ok) return out(`You joined ${r.name}`, `A ${lc(r.kind)} with ${r.size} members${r.venue != null ? `, based around ${place(r.venue)}` : ''}. Being a member puts you in the same places as the others, which is how you get to know them. Go along when they meet, or look for members in Here & now.`, { next: [{ label: 'Things to try', open: 'menu' }] });
        return out('Could not join', /already/.test(r.why || '') ? 'You are already a member of that group.' : r.why ? cap1(r.why) + '. Try another group, or start your own.' : 'Try another group, or start your own.');
      }
      case 'player.found': return r.ok ? out('You started a group', 'It is just you for now. Others join as they hear about it, mostly through the people you know.') : out('Could not start a group', 'Give it a name first.');
      case 'player.adopt': {
        if (!r.ok) return out(/already working/.test(r.why || '') ? 'You already have that goal' : 'No plan possible right now', /already working/.test(r.why || '') ? 'See its steps under Goals.' : 'This goal needs a situation that does not exist yet. Pick another goal, or check back in a few days.');
        const g = this.S(() => w.sys.goals.query.goal(r.goal)); const plan = g ? this.planOf(g) : [];
        return out(`Goal set: ${g ? g.phrase : 'new goal'}`, `${plan.length} steps. Your character works through them in spare time (usually evenings) and you will be told when something needs you. Steps marked "you" go faster if you do them yourself.`, { plan, next: [{ label: 'Back to goals', open: 'goals' }] });
      }
      case 'player.drop': return out(r.ok ? 'Goal dropped' : 'Could not drop it', r.ok ? 'Your character stops working on it.' : 'It may already be over.');
      case 'player.lend': return r.ok ? out(`You lent ${who} £${Math.round(a.amount)}`, `They will pay it back over months if they can. It makes ${who} trust you more, and awkward if they cannot.`) : out('You cannot afford that', `You only have £${Math.round(w.people.get(pid)?.money || 0)}. Try a smaller amount.`);
      case 'player.borrow': return r.ok ? out(`You borrowed £${Math.round(r.amount || a.amount)}`, `From ${a.kind === 'family' ? 'family' : a.kind === 'payday' ? 'a payday lender (expensive: it must be repaid fast with high interest)' : 'the bank'}. It is added to your debt and repaid from income.`) : out('Turned down', a.kind === 'bank' ? 'The bank said no, probably because of your income or existing debt. Try family, or earn first.' : a.kind === 'family' ? 'You have no family able to lend right now.' : 'The lender said no.');
      case 'player.post': return r.ok ? out(a.forum ? 'You posted on the neighbourhood forum' : 'You posted online', 'Neighbours may reply within a day or two. Check Phone for replies. Posting is a cheap way to be noticed.', { next: [{ label: 'Open Phone', open: 'phone' }] }) : out('Could not post', 'Try again in a moment.');
      case 'player.buy': return r.ok ? out(`You bought ${r.item === 'pint' ? 'a drink' : 'a coffee'} (£${r.price.toFixed(2).replace('.00', '')})`, 'You sat with it for half an hour. Cafés and pubs are where you bump into locals: have a look who is here.', { next: [{ label: 'See who is here', open: 'menu' }] }) : out('Cannot afford that', 'Check your money in the strip above.');
      case 'player.goTo': return out(`Heading to ${place(a.bid)}`, `About ${Math.max(10, (r.from - w.tick - 1) * 10)} minutes' walk. Your character walks there by themselves while time runs. When they arrive, open Do to see who is there.`);
      case 'player.stay': return out('Taking it easy', 'Your character stays put for an hour, then goes back to their routine. Time runs while they do.');
      case 'player.goOut': return out('Out in the city', 'A few hours away from the neighbourhood. You will be back on the map after.');
      case 'business.start': {
        const addr = (this.h.byBid.get(a.unit)?.lf?.address || 'the unit').replace(/^TO LET, /, '');
        if (r.ok) return out(`You opened a ${fmtLabel(a.type).toLowerCase()}`, `It is at ${addr}. Set-up cost about £${(r.cost || 0).toLocaleString('en-GB')}, paid from your savings and ${a.loan === false ? 'no loan' : 'a start-up loan (up to £25,000, repaid from takings)'}. New businesses rarely make money in the first year and rent, wages and rates come out every month. Tap the building on the map to see how it is doing; regulars and reviews build slowly.`, { next: [{ label: 'Check my money', open: 'me' }] });
        if (/needs about/.test(r.why || '')) return out('Not enough to start up yet', `${cap1(r.why).replace(/£(\d{4,})/g, (m, n) => '£' + (+n).toLocaleString('en-GB'))}. You have £${Math.round(w.people.get(pid)?.money || 0).toLocaleString('en-GB')} in hand. A smaller unit or a cheaper type (a barber or corner shop costs far less than a restaurant) may fit.`, { next: [{ label: 'Choose again', open: 'work' }] });
        if (/not vacant/.test(r.why || '')) return out('That unit has just gone', 'Someone else took it. Pick another empty unit.', { next: [{ label: 'See units to let', open: 'work' }] });
        return out('Could not start a business', r.why ? cap1(r.why) + '.' : 'Pick a unit to let and a type of business.', { next: [{ label: 'Back', open: 'work' }] });
      }
      case 'business.workAt': {
        const nameB = this.h.byBid.get(a.bid)?.name || 'that business';
        if (r.ok) return out(`Application sent to ${nameB}`, `Small employers usually reply within a week or two: expect ${days(r.days || 7)}. They weigh your experience against other applicants, and they only hire if they have a vacancy. ${pendingLine()}`, { next: [{ label: 'Back to Life admin', open: 'work' }] });
        if (/three applications/.test(r.why || '')) return out('You already have three applications out', `${pendingLine()} Wait for a reply first.`);
        if (/already applied/.test(r.why || '')) return out(`You already applied to ${nameB}`, `${pendingLine()} Nothing to do but wait.`);
        return out(`${nameB} is not hiring`, r.why ? cap1(r.why) + '.' : 'No vacancy at the moment. Small businesses hire rarely: try another, or check back in a few weeks.');
      }
      case 'crime.report': return r.ok ? out('You reported it to the police', 'It is now on record and has a crime number you can use for insurance. Reporting does not guarantee an arrest: most thefts are never solved. But recorded crime is how police and the council see patterns on your street, and being taken seriously nudges your trust in the police up.', { next: [{ label: 'Neighbourhood watch', open: 'work' }] }) : out('Nothing to report', 'There is no recent crime against you that has not been reported. If something happens to you, come back here. In an emergency call 999.');
      case 'crime.joinWatch': return r.ok ? out('You joined the street watch', 'Neighbours look out for each other and share alerts in a group chat. Watches are linked to less burglary and vehicle crime in the research, and mean you get to know people on your street.', { next: [{ label: 'Open Phone', open: 'phone' }] }) : out('Could not join', 'There is no watch you can join from where you live right now.');
      case 'crime.lockUp': return r.ok ? out('You made your home more secure', 'Better locks, lights and a habit of checking windows. This lowers the burglary risk for your household and does not move the risk onto neighbours.') : out('Could not do that', 'You need a home of your own first.');
      case 'civic.complain': {
        const K = CASE_KINDS[a.kind || 'bins'] || { days: 14, service: 'bins' }, lvl = this.S(() => w.sys.civic.query.service(K.service), 1);
        return r.ok ? out(`You told the council about ${CASE_NAME[a.kind || 'bins'] || a.kind}`, `The council's target for this is ${K.days} days${lvl < 0.9 ? ', and the service has been cut back so expect longer' : ''}. If nothing happens, a ward councillor can chase it. How well it is handled changes how far you trust the council.`, { next: [{ label: 'Back', open: 'work' }] }) : out('Could not log that', 'Try again in a moment.');
      }
      case 'civic.object': return r.ok ? out('Your objection is in', 'It goes to the planning committee with everyone else\'s. Objections count when they raise real planning grounds (noise, traffic, overlooking) and when many neighbours write, especially close to an election. Most applications (about 86% nationally) are approved anyway.', { next: [{ label: 'Join a campaign', open: 'work' }] }) : out('Could not object', 'You may already have objected, or the council has already decided it.');
      case 'civic.joinCampaign': return r.ok ? out('You joined the campaign', 'You added your name and joined its group. Campaigns win more when many sign, when the local paper and forum take it up, and when an election is close.', { next: [{ label: 'Goals & groups', open: 'goals' }] }) : out('Could not join', 'That campaign may have just ended.');
      case 'civic.standCouncillor': { const nx = this.S(() => w.sys.civic.query.election().next); return r.ok ? out('You will stand for the council', `At the ward election on ${nx ? w.calendar.formatDate(nx) : 'the next election day'}. Candidates win by being known and trusted: join groups, campaign on local problems and get to know the street first.`, { next: [{ label: 'Goals & groups', open: 'goals' }] }) : out('You cannot stand', 'You need to be 18 or over.'); }
      case 'player.respond': return out('Answered', 'They will remember how you replied. It shapes how they treat you.');
      default: return out(r.ok ? 'Done' : 'That did not work', r.why ? cap1(r.why) + '.' : 'Nothing changed. Open Do > Here & now for what is possible.');
    }
  }
  stepText(x) {
    const raw = stepLabel(this.w, { ...x, target: x.target }); if (!/\(/.test(raw)) return cap1(raw); const v = lc(x.v || '');
    const T = { apply: `Apply for ${v === 'job' ? 'jobs' : v}`, attend: `Go along to ${v === 'group' ? 'a group or club' : v === 'out' ? 'a night out' : v}`, invite: `Invite someone for ${v}`, message: 'Send a message', befriend: `Get to know ${v === 'regular' ? 'the regulars' : v}`, search: `Look into ${v}`, plan: `Make a plan: ${v}`, save: `Put money aside (${v})`, learn: `Study ${v}`, train: `Practise ${v}`, fix: `Get stuck into ${v}`, shop: `Shop for ${v}`, wait: `Wait for ${v}` };
    return T[x.move] || cap1(raw);
  }
  // A goal's plan, split into what you do and what happens on its own.
  planOf(g) {
    const cur = g.step ? g.step.i - 1 : g.steps ? g.steps.findIndex((x) => x.state !== 'done') : 0;
    return (g.steps || []).map((x, i) => { const mv = MOVE[x.move], text = this.stepText(x); return { text, state: x.state, now: i === cur, note: x.note || '', hint: MOVE_HINT[x.move] || (mv && mv.kind === 'social' ? 'talk to them yourself to speed this up' : 'happens on its own'), mine: !!(MOVE_HINT[x.move] && /yourself|Do >/.test(MOVE_HINT[x.move])) }; });
  }
  skipTo(ticks, label) { const w = this.w; this.skip = { limit: w.tick + Math.max(1, ticks), label, back: this.h.tier === 'pause' ? 'scene' : this.h.tier }; this.h.setTier('max'); }
  skipDue() { const s = this.skip; if (!s) return false; if (this.h.tier !== 'max') { this.skip = null; return false; } if (this.w.tick >= s.limit) { this.skip = null; this.h.setTier(s.back === 'max' ? 'scene' : s.back); this.say({ t: 'play.result', name: 'skip', ok: true, text: s.label || 'Time passes.' }); this.state(true); return true; } return false; }
  skipMorning() { const w = this.w, hr = w.time.hourFloat || 0, to = ((7 - hr + 24) % 24) || 24; this.skipTo(Math.round(to * 6) + 1, 'A new morning.'); }
  op(m) {
    switch (m.op) {
      case 'setup': return this.setup();
      case 'create': return this.create(m.args);
      case 'take': return this.take(m.pid);
      case 'release': return this.release();
      case 'do': return this.verb(m.name, m.args);
      case 'skip': return m.what === 'morning' ? this.skipMorning() : this.skipTo(Math.round((m.hours || 2) * 6), `${m.hours || 2} hours later.`);
      case 'pauseOnEvent': this.pauseOnEvent = !!m.on; return;
      case 'section': return this.section(m.name);
      case 'state': return this.state(true);
    }
  }

  // ------------------------------------------------------------------ events: pause on what matters to the player
  onEvent(ev, it) {
    const pid = this.pid; if (pid == null || !this.pauseOnEvent) return;
    if (!ev.actors || !ev.actors.includes(pid) || ev.salience < 0.45 || /^kernel\.|^goal\./.test(ev.type)) return;
    if (this.h.tier === 'pause') return; this.h.setTier('pause'); this.skip = null;
    const o = ev.actors.find((x) => x !== pid), on = o != null && this.w.people.get(o) ? nm(this.w.people.get(o)) : 'someone';
    const head = ev.type === 'player.match' ? `New dating-app match: ${on}` : ev.type === 'labour.applied' && ev.payload && ev.payload.ok === false ? `Job application: not this time. ${cap1(ev.payload.why || 'they went with someone else')}.` : it ? it.head : cap1(lc(ev.type.split('.').pop()));
    this.say({ t: 'play.moment', why: head, hint: ev.type === 'player.match' ? 'Open Do > Phone > Dating to message them.' : ev.type.startsWith('labour') ? 'Open Do > Life admin > Jobs for next steps.' : '', date: this.w.calendar.formatDate(this.w.tick) });
  }
  onRequest(ev) {
    const pid = this.pid; if (pid == null || ev.payload.to !== pid) return; this.lastState = 0;
    // Only weighty asks (a real goal, a warm tie, a favour) interrupt; the rest wait quietly in the inbox. The card itself says who is asking, so no extra toast.
    const top = this.S(() => this.w.sys.player.query.inbox(pid), []).find((r) => r.from === ev.payload.from && r.move === ev.payload.move);
    if (top && top.notable && this.h.tier !== 'pause' && this.pauseOnEvent) { this.h.setTier('pause'); this.skip = null; }
  }

  // ------------------------------------------------------------------ HUD state (cheap, ~2 Hz)
  state(force) {
    const pid = this.pid; if (pid == null) return; const now = performance.now(); if (!force && now - this.lastState < 450) return; this.lastState = now;
    const w = this.w, p = w.people.get(pid); if (!p) return;
    const pop = p.ext.pop || {}, fin = pop.fin || {}, rt = p.ext.rt, off = !!(rt && rt.off), q = w.sys;
    const loc = p.locationId != null ? this.h.place(p.locationId) : null;
    const here = off ? [] : q.player.query.here(pid).slice(0, 12).map((id) => this.personChip(id));
    const reqs = this.S(() => q.player.query.inbox(pid), []).map((r) => ({ id: r.id, from: this.ref(r.from), move: r.move, text: r.move === 'ask' && r.v === 'favour' ? ASK_FAVOUR[(r.id * 7 + r.from) % ASK_FAVOUR.length] : REQ_TPL[r.tpl] || REQ_TEXT[r.move] || 'wants something from you', why: r.topic, notable: r.notable, left: Math.max(0, Math.round((r.until - w.tick) / 6)) }));
    const job = this.S(() => q.labour.query.job(pid)); const unit = this.S(() => q.housing.query.unit(pid));
    const hr = w.time.hourFloat || 0;
    this.say({ t: 'play.state', s: {
      pid, homeId: p.homeId, name: nm(p), age: Math.floor(w.ageOf(p)), money: Math.round(p.money || 0), debt: Math.round(fin.debt || 0), mood: r2(p.mood || 0), needs: Object.fromEntries(Object.entries(p.needs || {}).map(([k, v]) => [k, r2(v)])),
      loc, off, here, reqs, thought: p.thought || '', canSleep: hr >= 20 || hr < 6, health: r2(p.health ?? 1), ill: !!p.illness,
      job: job && job.activity === 'employed' ? { occ: this.jobInfo(job.occ).label.toLowerCase(), pay: job.pay, hours: job.hours } : { activity: lc(job ? job.activity : '') },
      home: unit ? { tenure: lc(unit.tenure), rent: unit.rent } : null, tick: w.tick,
      acts: off ? [] : this.hereActions(p, here, loc, off), things: this.things(pid),
      now: { day: dayName[((rt && rt.dow) ?? 0) % 7], time: fh(hr) }, doing: /^asleep/i.test(p.thought || '') && hr >= 8 && hr < 22 ? '' : p.thought || '',
      lately: this.S(() => q.player.query.log(), []).slice(-5).reverse().map((l) => ({ ago: Math.max(0, Math.round((w.tick - l.tick) / 144)), text: l.text })),
      pendingJobs: this.S(() => q.player.query.pending(pid), []).map((x) => ({ label: this.jobInfo(x.occ).label, daysLeft: x.daysLeft })),
    } });
  }
  ref(id) { const p = this.w.people.get(id); return { id, name: p ? nm(p) : 'someone' }; }
  personChip(id) {
    const p = this.w.people.get(id); if (!p) return { id, name: 'someone' }; const t = this.S(() => this.w.sys.social.query.tie(id, this.pid)), known = !!(t && t.lv >= 2), age = Math.floor(this.w.ageOf(p));
    const job = this.jobWords(p), rel = known && !/^(acq|acquaintance|friend|match)$/.test(t.r || t.k) ? lc(t.r || t.k) : (known && (t.r || t.k) === 'match' ? 'app match' : '');
    const line = [`${age}`, job, known ? `${rel ? rel + ', ' : ''}${WARM(t.l)}` : 'you have not met'].filter(Boolean).join(' · ');
    return { id, name: nm(p), first: p.firstName, age, job, l: t ? r2(t.l) : null, known, rel, line };
  }
  // The few sensible things to do right now, from the real situation (who is here, where, time, money, job).
  hereActions(p, here, loc, off) {
    const w = this.w, hr = w.time.hourFloat || 0, acts = [], home = p.locationId === p.homeId, b = loc ? this.h.byBid.get(loc.id) : null, tpl = b && b.lf ? b.lf.template : '';
    const pop = p.ext.pop || {}, emp = pop.activity === 'employed';
    const people = here.slice().sort((x, y) => (y.known ? 1 : 0) - (x.known ? 1 : 0) || (y.l ?? 0) - (x.l ?? 0));
    for (const x of people.slice(0, 2)) acts.push({ k: 'talk', id: x.id, label: x.known ? `Talk to ${x.first}` : `Say hello to ${x.first}`, sub: x.line });
    if (!off && /^(cafe|bakery)$/.test(tpl)) acts.push({ k: 'buy', item: 'coffee', label: 'Order a coffee', sub: 'About £3. A good place to start a conversation.' });
    else if (!off && tpl === 'pub') acts.push({ k: 'buy', item: 'pint', label: 'Get a drink', sub: 'About £5. Pubs are where locals mix.' });
    const wp = pop.workplace; if (emp && hr >= 5.5 && hr < 19) {
      if (wp && wp.kind === 'onmap' && wp.bid != null && p.locationId !== wp.bid) acts.push({ k: 'work', bid: wp.bid, label: 'Head to work', sub: `${this.h.place(wp.bid)?.name || 'your workplace'}. Your character also goes by themselves when a shift starts.` });
      else if (wp && wp.kind !== 'onmap' && !off) acts.push({ k: 'work', dest: (this.S(() => w.sys.labour.query.job(p.id)) || {}).workplace?.dest, label: 'Head to work', sub: 'Off-map workplace. Your character also goes by themselves when a shift starts.' });
    }
    if (!home && !off) acts.push({ k: 'home', label: 'Go home', sub: 'Head back to your flat.' });
    if (people.length > 2 && acts.length < 4) acts.push({ k: 'talk', id: people[2].id, label: `Talk to ${people[2].first}`, sub: people[2].line });
    if (home && (hr >= 20 || hr < 6)) acts.push({ k: 'morning', label: 'Sleep till morning', sub: 'Time moves on to about 7am.' });
    else if (acts.length < 5 && !off) acts.push({ k: 'stay', label: 'Stay here a while', sub: 'Wait an hour and see who turns up.' });
    return acts.slice(0, 5);
  }
  // "Things to try": derived from the real state of the character's life, so they tick themselves off.
  things(pid) {
    const w = this.w, q = w.sys, out = [], S = (f, d) => this.S(f, d);
    const ties = S(() => q.social.query.ties(pid), []).filter((t) => typeof t.o === 'number' && t.k !== 'kin' && t.k !== 'family');
    const me = w.people.get(pid), hb = me && w.buildings.get(me.homeId), street = hb && hb.lf ? hb.lf.streetId : null, nbrs = ties.filter((t) => { const o = w.people.get(t.o), ob = o && w.buildings.get(o.homeId); return /neighbour/.test(t.k + t.r) || (ob && (ob.id === me.homeId || (street != null && ob.lf && ob.lf.streetId === street))); }).length, pend = S(() => q.player.query.pending(pid), []), emp = (S(() => q.labour.query.job(pid)) || {}).activity === 'employed';
    const grp = S(() => q.goals.query.groupsOf(pid), []), goals = S(() => q.goals.query.goalsOf(pid), []).filter((g) => !g.mundane && g.status === 'active');
    const friends = ties.filter((t) => t.k === 'friend' || t.l >= 0.4);
    out.push({ id: 'neighbours', label: 'Meet your neighbours', done: nbrs >= 2, prog: `${Math.min(nbrs, 2)}/2`, hint: 'Say hello to people you see at home, the café or the pub.' });
    out.push({ id: 'job', label: 'Find a job', done: emp, prog: emp ? '' : pend.length ? `${pend.length} out` : '', hint: pend.length ? 'Applications are out. Replies take one to three weeks.' : 'Do > Life admin > Jobs: apply for something.' });
    out.push({ id: 'group', label: 'Join a group', done: grp.length > 0, prog: '', hint: 'Do > Goals & groups: clubs and teams are the easiest way to meet people.' });
    out.push({ id: 'friend', label: 'Make a friend', done: friends.length > 0, prog: '', hint: 'Keep talking to the same people. It takes a few meetings.' });
    out.push({ id: 'goal', label: 'Set yourself a goal', done: goals.length > 0, prog: '', hint: 'Do > Goals & groups: pick something to work towards.' });
    return out;
  }

  // ------------------------------------------------------------------ sheet sections (on demand)
  section(name) {
    const w = this.w, pid = this.pid; if (pid == null) return; const q = w.sys, out = { name };
    if (name === 'people') {
      out.ties = this.S(() => q.social.query.ties(pid), []).filter((t) => t.on && typeof t.o === 'number').slice(0, 40).map((t) => ({ id: t.o, name: t.name, k: t.k, rel: t.r, warm: r2(t.l), trust: r2(t.t), seen: this.S(() => w.calendar.formatDate(t.last), '') }));
      out.here = q.player.query.here(pid).map((id) => this.personChip(id));
    } else if (name === 'phone') {
      const cm = q.comms && q.comms.query; const nameOf = (id) => nm(w.people.get(id));
      out.chats = cm ? this.S(() => cm.chats(pid), []).slice(0, 8).map((c) => ({ id: c.id, name: c.name || c.kind, kind: c.kind, n: c.n, last: this.S(() => cm.chat(c.id, 3), []).map((m) => ({ au: nameOf(m.author), text: m.text })) })) : [];
      out.forum = cm ? this.S(() => cm.forum(8), []).reverse().map((f) => ({ au: nameOf(f.author), kind: lc(f.kind), text: f.text, replies: (f.replies || []).length, date: w.calendar.formatDate(f.t) })) : [];
      out.dating = this.S(() => q.player.query.dating(pid), { on: false, matches: [], pool: 0 }); out.datable = this.S(() => q.player.query.datable(pid), []).slice(0, 8);
      out.contacts = this.S(() => q.social.query.ties(pid), []).filter((t) => typeof t.o === 'number' && t.on && t.c > 0.2).slice(0, 14).map((t) => ({ id: t.o, name: t.name, k: t.k }));
    } else if (name === 'goals') {
      out.goals = this.S(() => q.goals.query.goalsOf(pid), []).filter((g) => !g.mundane).map((g) => { const f = this.S(() => q.goals.query.goal(g.id)); return { id: g.id, phrase: g.phrase, status: g.status, line: g.line || '', plan: f ? this.planOf(f) : [] }; });
      out.groups = this.S(() => q.goals.query.groupsOf(pid), []).map((g) => ({ id: g.id, name: g.name, kind: lc(g.kind), size: g.size }));
      out.open = this.S(() => q.goals.query.groups({}), []).filter((g) => !out.groups.some((x) => x.id === g.id)).slice(0, 12).map((g) => ({ id: g.id, name: g.name, kind: lc(g.kind), size: g.size, at: this.h.place(g.venue)?.name || '' }));
      const gt = new Map((w.pack.goalTemplates || []).map((t) => [t.id, t]));
      out.templates = this.S(() => q.goals.query.templates().filter((t) => !t.mundane && !t.invented && !NEEDS_SITUATION.has(t.id)).map((t) => { const g = gt.get(t.id) || {}; return { id: t.id, phrase: t.phrase, by: (g.by || []).slice(0, 4).map(lc), days: g.horizon || null }; }), []).slice(0, 70);
      out.choices = this.S(() => q.goals.query.getChoices(pid), []).slice(0, 4).map((c) => ({ label: c.label, reason: c.reason }));
    } else if (name === 'me') {
      const rep = q.player.query.reputation(pid); const p = w.people.get(pid);
      const BEL = { moved_in: 'is new here', new_couple: 'is seeing someone', lost_job: 'lost a job', new_job: 'started a new job', ill: 'has been unwell', breakup: 'split up', in_debt: 'is short of money', evicted: 'lost a home', pregnant: 'is expecting', holiday: 'went away', crime_nearby: 'was near trouble', planning_move: 'may be leaving' };
      out.rep = { known: rep.known, warm: rep.warm, cool: rep.cool, score: rep.rep, beliefs: Object.entries(rep.beliefs).sort((a, b) => b[1] - a[1]).slice(0, 6).map(([k, n]) => ({ text: BEL[k] || lc(k), n })) };
      out.log = q.player.query.log().reverse();
      const hst = this.S(() => q.health.query.status(pid)) || {}; out.health = { score: r2(p.health ?? 1), conditions: (hst.conditions || []).map(lc) };
      const fin = (p.ext.pop || {}).fin || {}; out.money = { cash: Math.round(p.money || 0), debt: Math.round(fin.debt || 0), arrears: Math.round(fin.arrears || 0), net: Math.round(fin.net || 0) };
    } else if (name === 'places') {
      out.places = [...w.buildings.values()].filter((b) => b.lf && b.lf.kind !== 'residential' && b.name).map((b) => ({ id: b.id, name: b.name, tpl: lc(b.lf.template || b.lf.category || b.type) })).sort((a, b) => a.name.localeCompare(b.name));
      out.dests = Object.keys(w.pack.meta.offmap).filter((k) => /centre|leisure|retail|airport|other_neigh/.test(k)).map((k) => ({ k, name: lc(k) }));
    } else if (name === 'work') {
      const P = q.player.query; const seenOcc = new Set(); out.openings = P.openings().map((o) => ({ occ: o.occ, ...this.jobInfo(o.occ), bid: o.bid ?? null, at: o.bid != null ? this.h.place(o.bid)?.name : '', count: o.count })).filter((o) => { const k = o.occ + ':' + o.bid; if (seenOcc.has(k)) return false; seenOcc.add(k); return true; }).sort((a, b) => (b.bid != null) - (a.bid != null) || b.mid - a.mid).slice(0, 70);
      out.pending = this.S(() => P.pending(pid), []).map((x) => ({ ...x, label: this.jobInfo(x.occ).label })); out.job = this.S(() => q.labour.query.job(pid)); if (out.job && out.job.occ) out.job = { ...out.job, ...this.jobInfo(out.job.occ) }; out.vac = P.vacancies().filter((u) => u.tenure === 'private_rent').slice(0, 10).map((u) => ({ id: u.id, address: u.address, rent: u.rent, beds: u.bedrooms }));
      out.unit = this.S(() => q.housing.query.unit(pid)); out.admin = adminData(this.h, pid);
    }
    this.say({ t: 'play.section', ...out });
  }

  // ------------------------------------------------------------------ god: presets + consequence tracker
  preset(m) {
    const P = GOD_PRESETS.find((x) => x.id === m.id); if (!P) return;
    const w = this.w, before = w.events.nextId; const results = [];
    for (const s of P.steps(m.picks || {}, this.h)) { try { results.push(w.queueCommand({ actor: 'god', name: s.name, args: s.args })); } catch (e) { results.push(false); } }
    this.track(P.label, P.describe ? P.describe(m.picks || {}, this.h) : P.desc, before, P.icon);
    this.say({ t: 'result', name: P.label, ok: results.some((r) => r !== false), error: null, args: m.picks, date: w.calendar.formatDate(w.tick) });
  }
  track(label, body, before, icon) {
    const w = this.w, roots = []; for (let id = before; id < w.events.nextId; id++) { const r = w.events.get(id); if (r && r.type !== 'kernel.command') roots.push(r); }
    const iv = { id: this.ivSeq++, label, body: body || '', icon: icon || '★', tick: w.tick, date: w.calendar.formatDate(w.tick), n: 0, kinds: {}, actors: new Set(), buckets: [0], top: [], roots: roots.length, last: w.tick };
    this.ivs.push(iv); if (this.ivs.length > 12) { const old = this.ivs.shift(); for (const [k, v] of this.tracked) if (v === old) this.tracked.delete(k); }
    for (const r of roots) { this.tracked.set(r.id, iv); this.count(iv, r); }
    this.scanFrom = Math.max(this.scanFrom, w.events.nextId); this.convSig = ''; this.sendConseq();
  }
  count(iv, r) {
    iv.n++; const k = r.type.split('.')[0]; iv.kinds[k] = (iv.kinds[k] || 0) + 1; for (const a of r.actors) if (typeof a === 'number') iv.actors.add(a);
    const b = Math.max(0, Math.floor((r.tick - iv.tick) / WEEK)); while (iv.buckets.length <= b) iv.buckets.push(0); iv.buckets[b]++; iv.last = r.tick;
    if (r.salience >= 0.3 && !/^goal\.|^kernel\./.test(r.type)) { iv.top.push({ id: r.id, s: r.salience, tick: r.tick }); if (iv.top.length > 40) { iv.top.sort((a, c) => c.s - a.s || a.tick - c.tick); iv.top.length = 14; } }
  }
  scan() {
    if (!this.ivs.length) return; const ev = this.w.events, end = ev.nextId; let n = 0;
    for (let id = this.scanFrom; id < end && n < 40000; id++, n++) { const r = ev.get(id); if (!r || !r.cause) continue; const iv = this.tracked.get(r.cause); if (iv) { if (this.tracked.size < 150000) this.tracked.set(id, iv); this.count(iv, r); } }
    this.scanFrom = Math.min(end, this.scanFrom + n);
  }
  sendConseq() {
    const w = this.w, sig = this.ivs.map((i) => i.id + ':' + i.n).join(',') + ':' + Math.floor(w.tick / 144); if (sig === this.convSig) return; this.convSig = sig;
    const list = this.ivs.slice().reverse().map((iv) => {
      iv.top.sort((a, c) => c.s - a.s || a.tick - c.tick); const top = [];
      for (const t of iv.top.slice(0, 6)) { const r = w.events.get(t.id); if (!r || isPrivate(r)) continue; const d = this.S(() => describeEvent(w, r, this.h.text)); if (d && d.line) top.push({ date: w.calendar.formatDate(r.tick), text: d.line, pid: typeof r.actors[0] === 'number' ? r.actors[0] : null }); }
      return { id: iv.id, label: iv.label, body: iv.body, icon: iv.icon, date: iv.date, n: iv.n, people: iv.actors.size, kinds: iv.kinds, buckets: iv.buckets.slice(0, 40), top, days: Math.round((w.tick - iv.tick) / 144), live: w.tick - iv.last < WEEK * 2 };
    });
    this.say({ t: 'conseq', list });
  }
  tickFrame() { this.scan(); this.sendConseq(); if (this.pid != null) this.state(); }
}

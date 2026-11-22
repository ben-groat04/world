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
const WARM = (l) => (l == null ? 'not met' : l > 0.5 ? 'close friends' : l > 0.2 ? 'on friendly terms' : l > -0.15 ? 'acquaintances' : 'on cool terms');
const ACT_DID = { small: 'chatted with', joke: 'joked with', news: 'shared some news with', advise: 'offered advice to', comfort: 'comforted', complain: 'had a moan with', confide: 'confided in', gossip: 'gossiped with', flirt: 'flirted with', favour: 'asked a favour of', apologise: 'apologised to', argue: 'argued with' };
// what the other person actually says back: short, in character-neutral British speech, picked by act and outcome (deterministic per moment)
const SAYS = {
  small: { warm: ['"Terrible weather, isn\'t it? Honestly though, I\'d rather be out in it than at home."', '"Oh, you\'re new, aren\'t you? Where are you living?"', '"Been here years. Best thing is the people, worst thing is the parking."'], flat: ['"Yes, mustn\'t grumble," and a polite nod.', 'A short, friendly answer, then back to their phone.', '"Mm, you\'re right." The conversation runs out of road.'] },
  joke: { warm: ['A proper laugh. "Ha! Stop it. I\'m telling that one at work."', '"That\'s terrible. Do another."'], flat: ['A half-smile. The joke lands somewhere near the floor.', '"Ha. Right." They are not sure if it was a joke.'] },
  news: { warm: ['"Really? I hadn\'t heard. Thanks for telling me."', '"Well, that\'s something. Anyone else know?"'], flat: ['"Oh, right." They take it in and say little.'] },
  advise: { warm: ['"That\'s actually useful, thank you. I\'ll try it."'], flat: ['"Hm. Maybe." Advice is easier to give than to take.'] },
  comfort: { warm: ['"Thanks. That means more than you\'d think."'], flat: ['A small nod. "I\'ll be fine, honestly."'] },
  confide: { warm: ['"Thank you for telling me. It stays with me."'], flat: ['They listen, a little awkwardly, and change the subject gently.'] },
  flirt: { warm: ['A grin they try to hide. "Careful, I might take you seriously."'], flat: ['A polite laugh and a half step back.'] },
  favour: { warm: ['"Of course. Just let me know when."'], flat: ['"Er, I\'ll see what I can do." It is not a yes.'] },
  complain: { warm: ['"Don\'t get me started. Honestly, it\'s the same for all of us."'], flat: ['"Yeah, well." They do not want to join in.'] },
  gossip: { warm: ['"No! Who told you? ...Go on, then."'], flat: ['"I\'d rather not say anything about anyone." A raised eyebrow.'] },
  apologise: { warm: ['"Don\'t worry. We\'re fine. Thanks for saying."'], flat: ['"Okay." It will take more than words.'] },
  argue: { warm: ['A long pause, then, "...Fair. I hadn\'t thought of it that way."'], flat: ['"We\'ll have to agree to differ."'] },
};
const sayOf = (w, who, act, react) => { const p = (SAYS[act] || SAYS.small)[react === 'warm' ? 'warm' : 'flat']; return `${who}: ${p[(w.tick >> 3) % p.length]}`; };
const ACT_COOL = { flirt: 'Flirting lands better once you know each other.', argue: 'Arguing rarely wins people over.', favour: 'Asking for favours works better once you have built some goodwill.', confide: 'Opening up to someone you barely know can feel like too much.', gossip: 'Gossip goes down badly if they like the person you are talking about.', complain: 'Moaning to someone you hardly know can wear thin.' };
// What you can do yourself to speed up each kind of goal step (goal steps otherwise run on autopilot, mostly in spare evenings).
const MOVE_HINT = { search: 'happens on its own at home', plan: 'happens on its own at home', budget: 'happens on its own at home', save: 'happens on its own', wait: 'just takes time', apply: 'you can apply yourself: Do > Life admin > Jobs', attend: 'go along yourself: Do > Go somewhere', join: 'you can join a group yourself: Do > Goals & groups', ask: 'talk to or message the person yourself', befriend: 'talk to people when you meet them', persuade: 'talk to them yourself', recruit: 'ask them yourself: talk to them', invite: 'invite them yourself: message them', visit: 'drop in yourself: Do > Go somewhere', rent: 'Do > Life admin > Home', move: 'Do > Life admin > Home', train: 'happens on its own in spare time', learn: 'happens on its own in spare time', exercise: 'happens on its own in spare time', message: 'message them yourself: Do > Phone', buy: 'happens on its own' };
// Templates that only make sense in a situation the sim has to create (a grievance, a partner to win back...): hidden from the picker.
const NEEDS_SITUATION = new Set(['ask_out', 'repair_or_end_relationship', 'settle_a_grievance', 'reconcile_with_person', 'win_back_ex', 'get_engaged_or_commit', 'avenge_wrong', 'expose_secret', 'challenge_group_leader', 'deal_with_neighbour_noise', 'find_partner', 'move_in_together', 'grieve_and_settle_affairs', 'support_parent', 'help_child_at_school', 'get_childcare', 'start_family']);
const FIX_JOB = { unemployed: 'out of work', 'sick disabled': 'off work (ill or disabled)', 'other inactive': 'not working', 'looking after family': 'at home with family', student: 'student', retired: 'retired' };
const SOLO_LABEL = { market_stall: 'a market stall', pop_up: 'a pop-up food stall', mobile_trade: 'a mobile trade', home_based: 'a home-based business' };
const k0 = (v) => Math.round(v / 1000);
const fh = (h) => { h = h % 24; const hh = Math.floor(h), mm = Math.floor((h - hh) * 60); return hh + ':' + String(mm).padStart(2, '0'); };
const CASE_NAME = { bins: 'missed bins', pothole: 'a pothole', flytip: 'fly-tipping', damp: 'damp in a council home', repair: 'a council repair', noise: 'noise' };
const money0 = (n) => (Number.isFinite(+n) ? Math.round(+n) : 0);
const gbpH = (n) => { n = money0(n); return (n < 0 ? '-£' : '£') + Math.abs(n).toLocaleString('en-GB'); };
const ACT_KIND = { student: 'student', retired: 'retired', employed: 'working', unemployed: 'jobless', home_family: 'carer' };
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
    const title = o.label.replace(/\s*\(.*?\)\s*/g, ' ').trim(), sub = (o.label.match(/\((.*?)\)/) || [])[1] || '', pay = o.pay || {}, lo = k0(pay.p10 || pay.median || 0), hi = k0(pay.p90 || pay.median || 0), h = o.hours;
    return { label: title, sub, band: !hi ? 'pay varies' : lo === hi ? `£${lo}k a year` : `£${lo}–${hi}k a year`, mid: pay.median || 0, hours: h ? `${Math.round(h[1])} h/week` : '', where: o.where === 'onmap' ? 'in Larkfield' : o.where === 'home' ? 'from home' : 'in the city' };
  }
  jobWords(p) { const j = p.job || ''; if (FIX_JOB[j]) return FIX_JOB[j]; const o = (this.w.pack.jobs || []).find((x) => x.id === j || x.label === j); return o ? this.jobInfo(o.id).label.toLowerCase() : lc(j); }
  create(args) { const r = this.verb('player.create', args, true); if (r && r.ok) { this.h.setTier('scene'); this.pauseOnEvent = true; this.h.selected = r.pid; this.say({ t: 'play.on', pid: r.pid }); this.state(true); } else this.say({ t: 'play.result', name: 'player.create', ok: false, text: (r && r.why) ? cap1(r.why) + '.' : 'Could not move in.', body: 'Pick another flat, or bring more savings: you need the deposit and first month of rent.' }); }
  take(pid) { const r = this.verb('player.take', { pid }, true); if (r && r.ok) { this.h.setTier('scene'); this.h.selected = pid; this.say({ t: 'play.on', pid }); this.state(true); } }
  release() { this.verb('player.release', {}, true); this.say({ t: 'play.off' }); }

  // ------------------------------------------------------------------ verbs
  verb(name, args, quiet) {
    const w = this.w; let r; if (/^(business\.(start|workAt|becomeRegular)|crime\.(report|joinWatch|lockUp)|civic\.(complain|object|joinCampaign|standCouncillor))$/.test(name)) args = { ...(args || {}), pid: this.pid };
    const me0 = w.people.get(this.pid), m0 = me0 ? me0.money : 0, tie0 = args && args.to != null ? this.S(() => w.sys.social.query.tie(args.to, this.pid)) : null, l0 = tie0 ? tie0.l : null;
    try { r = w.queueCommand({ actor: 'player', name, args: args || {} }); } catch (e) { r = { ok: false, why: String(e.message || e) }; }
    if (r === true) r = { ok: true }; else if (r === false || r == null) r = { ok: false, why: '' };
    if (!quiet) {
      const fb = this.feedback(name, args || {}, r), facts = [], m1 = me0 ? me0.money : 0;
      if (Math.abs(m1 - m0) >= 1) facts.push(`Money ${gbpH(m0)} → ${gbpH(m1)}`);
      if (l0 != null && args.to != null) { const t1 = this.S(() => w.sys.social.query.tie(args.to, this.pid)); if (t1 && t1.l != null && Math.abs(t1.l - l0) >= 0.02) facts.push(`${w.people.get(args.to)?.firstName || 'They'} now ${WARM(t1.l)} with you (was ${WARM(l0)})`); }
      this.say({ t: 'play.result', name, ok: !!r.ok, text: fb.title, ...fb, facts });
    }
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
        if (r.react === 'warm') return out(`You ${ACT_DID[r.act] || 'talked to'} ${who}`, `${sayOf(w, who, r.act, 'warm')}\n\nThey warmed to it. You are now ${lbl}.${met}`, { next: [{ label: 'Talk more later', open: 'menu' }] });
        if (r.react === 'cool') return out(`You ${ACT_DID[r.act] || 'talked to'} ${who}`, `${who} did not take it well and likes you a little less. ${ACT_COOL[r.act] || 'It happens.'} Try something lighter next time, like small talk or a joke.`, { next: [{ label: 'Try small talk instead', open: 'menu' }] });
        return out(`You ${ACT_DID[r.act] || 'talked to'} ${who}`, `${sayOf(w, who, r.act, 'flat')}\n\nNothing much changed, which is normal: friendships grow with repeat meetings, so keep bumping into each other (groups, the pub, the café). You are ${lbl}.${met}`, { next: [{ label: 'Find a group to join', open: 'goals' }] });
      }
      case 'player.message': {
        if (!r.ok) return out(`Could not reach ${who}`, 'Their phone seems to be off. Try again later.');
        return out(`You ${r.voice ? 'rang' : 'messaged'} ${who}`, r.react === 'warm' ? `${who} replied warmly. Keeping in touch builds a tie more slowly than seeing each other, but it counts.` : r.react === 'cool' ? `${who} was short with you. Maybe not the right moment.` : `${who} replied; nothing much changed. Messages keep a tie alive; meeting in person grows it.`, { next: [{ label: 'Back to the list', open: 'phone' }] });
      }
      case 'player.askOut': {
        if (r.ok) return out(`${who} said yes`, `You are now seeing each other${r.p != null ? ` (it was about ${Math.round(r.p * 100)}% likely, and it came off)` : ''}. Your dating profile, if you had one, switches off. Keep it going: talk, message, spend time together. Friends and family will notice; things can go further if it works.`, { next: [{ label: 'See how people react', open: 'me' }] });
        if (/not really met/.test(r.why || '')) return out(`You have not really met ${who} yet`, 'Get to know them first: chat when you meet, join the same group, or message them.', { next: [{ label: 'See who is here', open: 'menu' }] });
        if (r.why === 'asked recently') return out(`You already asked ${who} out`, `Asking again straight away would be pushy. Give it ${r.days} more days and spend some time together first.`);
        if (/already seeing/.test(r.why || '')) return out(r.why[0].toUpperCase() + r.why.slice(1), 'Nobody to ask out right now.');
        if (r.why === 'not a match') return out(`${who} is not someone you would match with`, 'Age or orientation does not line up, so there is no point asking.');
        if (r.why === 'declined' || r.fx || r.p != null) {
          // The odds life.askOut used, and which ingredient pulled them down most. Nothing here decides the result: it is read back from the sim.
          const fx = r.fx || {}, pc = r.p != null ? Math.round(r.p * 100) : null, parts = [['att', 0.4 * (fx.att || 0), 0.4, `${who} does not seem to find you attractive yet`], ['aff', 0.3 * (fx.aff || 0), 0.3, `the two of you have not really clicked yet (little in common so far)`], ['fam', 0.25 * (fx.fam || 0), 0.25, `you have not spent enough time together yet`], ['gap', -(fx.gap || 0) / 40, 0, `there is a ${fx.gap}-year age gap`]];
          const worst = parts.map((x) => ({ ...x, lack: x[2] - x[1] })).sort((m, n) => n.lack - m.lack)[0], odds = pc == null ? '' : pc < 12 ? 'a long shot' : pc < 30 ? 'roughly one chance in four' : pc < 50 ? 'a fair chance' : 'good odds';
          return out(`${who} said no`, `Asked ${r.inPerson ? 'in person' : 'by message'}. It was ${odds}${pc != null ? ` (about ${pc}%)` : ''} and the weakest ingredient was this: ${worst.lack > 0.02 ? worst[3] : 'nothing stood out, it just went the other way'}. Rejection dents ${who}'s interest a little, so asking again right away will not help. You can ask again in about three weeks. Meanwhile see them at a group, chat, message; or try the app.`, { next: [{ label: 'Open dating', open: 'dating' }, { label: 'Meet people', open: 'places' }] });
        }
        return out(`${who} said no`, `Nothing more to say about why. Give it a few weeks and spend time together first.`, { next: [{ label: 'Message them', open: 'dating' }] });
      }
      case 'player.datingProfile': {
        if (!r.ok) return out('Could not set up a profile', /seeing/.test(r.why || '') ? 'You are already seeing someone.' : 'Something went wrong. Try again in a moment.');
        if (!r.on) return out('Dating profile paused', 'You will not get new matches until you switch it back on. Existing matches stay.');
        return out('Your dating profile is live', r.pool ? `About ${r.pool} people near you are on the app and could be a match. Matches arrive over days (roughly one or two a week), and the game stops to tell you. Then you can message them, and ask them out when you have chatted a bit.` : 'Hardly anyone nearby is on the app yet. Leave it on: matches can still show up as people join.', { next: [{ label: 'Meet people in person too', open: 'menu' }] });
      }
      case 'player.apply': {
        const label = this.jobInfo(a.occ).label;
        if (r.ok) return out(`Application sent: ${label}`, `Employers usually take one to three weeks to reply: expect ${days(r.days)}. They weigh your qualifications and experience against other jobseekers, and senior posts go to people already working up to them. ${pendingLine()} You can have three out at once.`, { next: [{ label: 'Apply for another', open: 'work' }, { label: 'Meanwhile, meet people', open: 'menu' }] });
        if (r.retired) return out('You are retired', 'Employers in this world do not hire people who have retired, so there is nothing to wait for. A small trade of your own (a market stall) or volunteering is open to you.', { next: [{ label: 'Start a stall', open: 'work' }, { label: 'Volunteer', open: 'goals' }] });
        if (/three applications/.test(r.why || '')) return out('You already have three applications out', `${pendingLine()} Wait for a reply before applying for more; the game will tell you as soon as one comes back.`);
        if (/already applied/.test(r.why || '')) return out(`You already applied for ${label}`, `${pendingLine()} Nothing to do but wait.`);
        return out('Could not apply', r.why ? cap1(r.why) + '.' : 'That job is not available.');
      }
      case 'player.quit': return r.ok ? out('You handed in your notice', 'You will not be paid after your last day. Look under Life admin > Jobs for something else.', { next: [{ label: 'Find a job', open: 'work' }] }) : out('You have no job to quit', 'You are not employed right now.');
      case 'player.rent': return r.ok ? out('You signed a new lease', 'Your belongings follow within a day or so, and the people you live with come too. Rent is due monthly from now; check Me > money, and tell the neighbours you are leaving by seeing them first.', { next: [{ label: 'Check my money', open: 'me' }] }) : out('Could not take that flat', /deposit/.test(r.why || '') ? `Your household does not have enough cash on hand for the deposit and first rent (you hold ${gbpH(w.people.get(pid)?.money)}). Earn first, or pick a cheaper flat.` : r.why ? cap1(r.why) + '. Another one may suit better.' : 'It may have just gone to someone else. Pick another.', { next: [{ label: 'See other flats', open: 'work' }] });
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
      case 'player.borrow': {
        if (r.ok) return out(`You borrowed £${Math.round(r.amount || a.amount)}`, `From ${a.kind === 'family' ? (r.from === 'offmap' ? 'family elsewhere' : 'a relative') : a.kind === 'payday' ? 'a payday lender (expensive: it must be repaid fast with high interest)' : 'the bank (credit card or overdraft style)'}. It is added to what you owe and comes out of your income, so check your money in Me.`, { next: [{ label: 'Check my money', open: 'me' }] });
        if (a.kind === 'family') return out('Family could not help', 'No relative here has enough to spare, and the sim found no one elsewhere. Try the bank, or earn first.');
        if (a.kind === 'payday') return out('The payday lender said no', `You already owe them £${r.payday || 0} and they cap what one person can carry.`);
        const why = r.noCredit ? 'your credit record is poor (missed payments), so credit is refused outright' : r.monthNet <= 0 ? 'you have no regular income, and the limit is set by income' : r.room != null && r.room <= 0 ? `your limit (about two months of take-home pay, £${Math.round(r.monthNet * 2.2).toLocaleString('en-GB')}) is already used up: you owe £${r.cc || r.owed}` : 'it is more than your limit allows';
        return out('The bank said no', `Because ${why}. Earning first raises the limit; family or a payday lender are the other doors (payday loans are costly).`, { next: [{ label: 'Check my money', open: 'me' }] });
      }
      case 'player.post': return r.ok ? out(a.forum ? 'You posted on the neighbourhood forum' : 'You posted online', 'Neighbours may reply within a day or two. Check Phone for replies. Posting is a cheap way to be noticed.', { next: [{ label: 'Open Phone', open: 'phone' }] }) : out('Could not post', 'Try again in a moment.');
      case 'player.buy': return r.ok ? out(`You bought ${r.item === 'pint' ? 'a drink' : 'a coffee'} (£${r.price.toFixed(2).replace('.00', '')})`, 'You sat with it for half an hour. Cafés and pubs are where you bump into locals: have a look who is here.', { next: [{ label: 'See who is here', open: 'menu' }] }) : out('Cannot afford that', 'Check your money in the strip above.');
      case 'player.goTo': return out(`Heading to ${place(a.bid)}`, `About ${Math.max(10, (r.from - w.tick - 1) * 10)} minutes' walk. Your character walks there by themselves while time runs. When they arrive, open Do to see who is there.`);
      case 'player.stay': return out('Taking it easy', 'Your character stays put for an hour, then goes back to their routine. Time runs while they do.');
      case 'player.goOut': return out('Out in the city', 'A few hours away from the neighbourhood. You will be back on the map after.');
      case 'business.start': {
        if (SOLO_LABEL[a.type]) {
          if (r.ok) return out(`You started ${SOLO_LABEL[a.type]}`, `Set-up cost ${gbpH(r.cost)}${r.loan ? `, of which ${gbpH(r.loan)} is a start-up loan repaid monthly from takings` : ', paid from your savings'}. Takings start low and build over many months; pitch, van or insurance costs and any loan repayment come out every month. If it loses money for six months running it closes. Watch your money in Me, and the news for how it is going.`, { next: [{ label: 'Check my money', open: 'me' }] });
          if (/already running/.test(r.why || '')) return out('You already run one', 'One small trade at a time. It closes if it loses money for six months running.');
          return out('Could not start it', `${r.loanRefused ? 'The start-up loan was refused after a credit and business-plan check.' : 'Savings alone do not cover it.'} You hold ${gbpH(w.people.get(pid)?.money)} and up to 80% of that can go in; it needs about ${gbpH(r.cost)} in all. Try the cheapest option (home-based), or save first.`, { next: [{ label: 'Choose again', open: 'work' }] });
        }
        const addr = (this.h.byBid.get(a.unit)?.lf?.address || 'the unit').replace(/^TO LET, /, '');
        if (r.ok) return out(`You opened a ${fmtLabel(a.type).toLowerCase()}`, `It is at ${addr}. Set-up cost about £${(r.cost || 0).toLocaleString('en-GB')}, paid from your savings and ${a.loan === false ? 'no loan' : 'a start-up loan (up to £25,000, repaid from takings)'}. New businesses rarely make money in the first year and rent, wages and rates come out every month. Tap the building on the map to see how it is doing; regulars and reviews build slowly.`, { next: [{ label: 'Check my money', open: 'me' }] });
        if (/needs about/.test(r.why || '')) return out('Not enough to start up yet', `${cap1(r.why).replace(/£(\d{4,})/g, (m, n) => '£' + (+n).toLocaleString('en-GB'))}. You have ${gbpH(w.people.get(pid)?.money)} in hand. A smaller unit or a cheaper type (a barber or corner shop costs far less than a restaurant) may fit.`, { next: [{ label: 'Choose again', open: 'work' }] });
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
      case 'godUndo': return this.undo(m.id);
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
      pid, homeId: p.homeId, name: nm(p), age: Math.floor(w.ageOf(p)), money: money0(p.money), debt: money0(fin.debt), mood: r2(p.mood || 0), needs: Object.fromEntries(Object.entries(p.needs || {}).map(([k, v]) => [k, r2(v)])),
      loc, off, here, reqs, thought: p.thought || '', canSleep: hr >= 20 || hr < 6, health: r2(p.health ?? 1), ill: !!p.illness,
      job: job && job.activity === 'employed' ? { occ: this.jobInfo(job.occ).label.toLowerCase(), pay: job.pay, hours: job.hours } : { activity: lc(job ? job.activity : '') },
      home: unit ? { tenure: lc(unit.tenure), rent: unit.rent } : null, tick: w.tick,
      acts: off ? [] : this.hereActions(p, here, loc, off), things: this.things(pid), me: this.situation(pid),
      now: { day: dayName[((rt && rt.dow) ?? 0) % 7], time: fh(hr) }, doing: /^asleep/i.test(p.thought || '') && hr >= 8 && hr < 22 ? '' : p.thought || '',
      lately: this.lately(pid),
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
  // Who you are right now, as plain facts read from the sim (nothing invented): what you do all day, where you live, what you owe, who you share life with.
  // `tips` are shortcuts into the real menus for this kind of life; they never decide an outcome.
  situation(pid) {
    const w = this.w, q = w.sys, S = (f, d) => this.S(f, d), p = w.people.get(pid); if (!p) return null;
    const pop = p.ext.pop || {}, fin = pop.fin || {}, age = Math.floor(w.ageOf(p)), act = pop.activity || '', kind = ACT_KIND[act] || (/sick|disab/.test(act) ? 'sick' : 'other');
    const unit = S(() => q.housing.query.unit(pid)), bud = S(() => q.money.query.budget(pid)), hh = (w.lf && w.lf.households && w.lf.households[pop.hh]) || null;
    const withParents = pop.role === 'adult_child' || pop.role === 'child', ten = unit ? String(unit.tenure) : '', rent = unit ? money0(unit.rent) : 0;
    const netM = bud && bud.personNetMonth != null ? bud.personNetMonth : money0((fin.net || 0) / 12), hhInc = bud ? money0(bud.income) : 0, arrears = money0((fin.arrears || 0)), debt = money0(fin.debt);
    const facts = [];
    // what you do
    let doing = '';
    if (kind === 'student') {
      const uni = pop.school && pop.school.kind === 'university', yr = uni && pop.uniStart != null ? Math.min(pop.courseYears || 3, Math.floor((w.tick - pop.uniStart) / w.calendar.ticksPerYear) + 1) : 0;
      doing = uni ? `At university${yr ? `, year ${yr} of ${pop.courseYears || 3}` : ''}` : pop.school && pop.school.kind === 'college' ? 'At college' : 'In full-time education';
      if (pop.occ) doing += `, with a part-time job (${this.jobInfo(pop.occ).label.toLowerCase()})`;
    } else if (kind === 'working') doing = `Works as ${this.jobInfo(pop.occ).label.toLowerCase()}${pop.hours ? `, ${Math.round(pop.hours)} h/week` : ''}${pop.pay ? `, ${gbpH(pop.pay)} a year gross` : ''}`;
    else if (kind === 'jobless') { const wk = pop.search && pop.search.since != null ? Math.round((w.tick - pop.search.since) / (144 * 7)) : 0; doing = `Looking for work${wk >= 2 ? ` for ${wk} weeks` : ''}`; }
    else if (kind === 'retired') doing = 'Retired';
    else if (kind === 'carer') doing = 'At home looking after family';
    else if (kind === 'sick') doing = 'Off work through ill health or disability';
    else doing = cap1(lc(act || 'not working'));
    facts.push({ k: 'do', label: kind === 'student' ? 'Study' : kind === 'retired' ? 'Life stage' : 'Work', text: doing });
    // where you live
    let home = '';
    if (withParents) home = 'Living in the family home';
    else if (/private/.test(ten)) home = `Renting privately, ${gbpH(rent)} a month`;
    else if (/social|council|housing_assoc/.test(ten)) home = `Social tenant, ${gbpH(rent)} a month`;
    else if (/mortgage/.test(ten)) home = 'Paying off a mortgage';
    else if (/owned/.test(ten)) home = 'Owns their home outright';
    else if (unit) home = cap1(lc(ten));
    const burden = S(() => q.housing.query.rentBurden(pop.hh), null);
    if (home) facts.push({ k: 'home', label: 'Home', text: home + (typeof burden === 'number' && burden > 0 && /rent/.test(ten) ? ` (${Math.round(burden * 100)}% of household income)` : '') });
    // money
    const bits = [`${gbpH(p.money)} in hand`]; if (debt > 0) bits.push(`${gbpH(debt)} owed`); if (arrears > 0) bits.push(`${gbpH(arrears)} behind on bills or rent`);
    facts.push({ k: 'money', label: 'Money', text: bits.join(', '), tone: p.money < 100 || arrears > 0 ? 'warn' : '' });
    if (netM > 0) facts.push({ k: 'inc', label: 'Income', text: `${gbpH(netM)} a month after tax${hhInc && hhInc > netM + 50 ? ` (household ${gbpH(hhInc)})` : ''}` });
    // people
    const L = p.ext.life || {}, part = L.part && L.part.id != null ? w.people.get(L.part.id) : null;
    facts.push({ k: 'love', label: 'Partner', text: part ? `${nm(part)} (${L.part.st === 'married' ? 'married' : L.part.st === 'engaged' ? 'engaged' : 'together since ' + w.calendar.formatDate(L.part.since)})` : age >= 17 ? 'Single' : '' });
    const ties = S(() => q.social.query.ties(pid), []).filter((t) => typeof t.o === 'number' && t.on); const close = ties.filter((t) => t.l > 0.5).length;
    facts.push({ k: 'ties', label: 'People', text: `${ties.length} you know, ${close} close` });
    const part2 = !!part, single = !part && age >= 17;
    // shortcuts that fit this life
    const tips = [];
    if (kind === 'student') { tips.push({ t: 'Earn a bit alongside your course', d: 'Part-time jobs fit around lectures. Employers reply in 1-3 weeks.', open: 'work' }); if (money0(p.money) < 150 || debt > 500) tips.push({ t: 'Money is tight', d: 'Goals: "Sort out benefits" or "Find some quick cash" start a plan that runs over days.', open: 'goals' }); tips.push({ t: 'Join a society or team', d: 'The quickest way to widen your circle: you end up in the same places each week.', open: 'goals' }); }
    else if (kind === 'retired') { tips.push({ t: 'See who is around', d: 'Cafes, the library and the community centre are where neighbours drop in.', open: 'places' }); tips.push({ t: 'Join something local', d: 'Choir, allotment, book group, faith group: you meet the same people weekly.', open: 'goals' }); if ((p.health ?? 1) < 0.65) tips.push({ t: 'Health is not great', d: 'Goal "See the GP" books an appointment over the next days.', open: 'goals' }); if (!this.soloOf(pid)) tips.push({ t: 'Keep a small sideline', d: 'A market stall or home-based trade is open to anyone. Costs and risks are shown first.', open: 'work' }); }
    else if (kind === 'jobless') { tips.push({ t: 'Apply for jobs', d: 'You can have three applications out. Replies take 1-3 weeks.', open: 'work' }); if (money0(p.money) < 150 || arrears > 0 || debt > 300) tips.push({ t: 'Sort out money first', d: 'Goals: "Sort out benefits" or "Pay down the debt" make a plan that runs in the background.', open: 'goals' }); tips.push({ t: 'Study or retrain', d: 'Goal "Do a course" plans the enrolment and study over weeks.', open: 'goals' }); if (!this.soloOf(pid)) tips.push({ t: 'Try working for yourself', d: 'A market stall is the cheapest route: no premises, small set-up.', open: 'work' }); }
    else if (kind === 'working') { tips.push({ t: 'Change job or ask for a raise', d: 'Goals plan the steps (look, apply, interview). Outcomes depend on the labour market.', open: 'goals' }); if (arrears > 0 || debt > 500) tips.push({ t: 'Money is stretched', d: 'Goal "Pay down the debt", or move somewhere cheaper in Life admin.', open: 'goals' }); }
    else { tips.push({ t: 'Look for work or a small trade', d: 'Jobs, local firms and a market stall are all in Life admin.', open: 'work' }); }
    if (single && kind !== 'retired') tips.push({ t: 'Dating', d: 'Switch on the app (matches arrive over days) or ask out someone you already know.', open: 'dating' });
    if (part2) tips.push({ t: 'Spend time with ' + part.firstName, d: 'Seeing each other and messaging keep a relationship warm.', open: 'phone' });
    return { kind, age, facts: facts.filter((f) => f.text), tips: tips.slice(0, 4), withParents, rented: /rent/.test(ten), owns: /owned|mortgage/.test(ten), ten: lc(ten), rent, money: money0(p.money), partner: part ? part.firstName : '' };
  }
  // Does this person run a stall/home business? (the business plugin has no query for it yet, so read the opened/closed events)
  soloOf(pid) {
    const ev = this.S(() => this.w.events.query({ actor: pid, type: 'business.opened', limit: 20 }), []).filter((r) => r.payload && SOLO_LABEL[r.payload.fid]), cl = this.S(() => this.w.events.query({ actor: pid, type: 'business.closed', limit: 20 }), []).filter((r) => r.payload && SOLO_LABEL[r.payload.fid]);
    const last = ev[0]; if (!last || (cl[0] && cl[0].tick > last.tick)) return null; return { label: SOLO_LABEL[last.payload.fid], since: this.w.calendar.formatDate(last.tick) };
  }
  // "Lately": what actually happened around you (events from the sim that you are part of, newest first) plus your own actions.
  lately(pid) {
    const w = this.w, q = w.sys, out = [], seen = new Set(), since = w.tick - 144 * 21;
    const evs = this.S(() => w.events.query({ actor: pid, since, minSalience: 0.2, limit: 60 }), []);
    for (const r of evs) { if (isPrivate(r) || /^kernel\.|^goal\.|^routine\./.test(r.type)) continue; const sf = r.payload && SOLO_LABEL[r.payload.fid]; const d = sf && /^business\.(opened|closed)$/.test(r.type) ? { line: r.type === 'business.opened' ? `You started ${sf}` : `Your ${sf.replace(/^a /, '')} closed (${r.payload.reason === 'insolvent' ? 'six months of losses' : 'you moved on'})` } : this.S(() => describeEvent(w, r, this.h.text)); if (!d || !d.line || seen.has(d.line)) continue; seen.add(d.line); out.push({ tick: r.tick, text: d.line, ev: true }); }
    for (const l of this.S(() => q.player.query.log(), []).slice(-8)) if (!seen.has(l.text)) { seen.add(l.text); out.push({ tick: l.tick, text: l.text }); }
    const me = w.people.get(pid), full = me ? nm(me) : null, you = (t) => (full ? t.split(full + "'s").join('Your').split(full).join('you').replace(/^you\b/, 'You') : t);
    return out.sort((a, b) => b.tick - a.tick).slice(0, 6).map((l) => ({ ago: Math.max(0, Math.round((w.tick - l.tick) / 144)), text: l.ev ? you(l.text).replace(/^You: /, '') : l.text }));
  }
  // The few sensible things to do right now, from the real situation (who is here, where, time, money, job).
  hereActions(p, here, loc, off) {
    const w = this.w, hr = w.time.hourFloat || 0, acts = [], home = p.locationId === p.homeId, b = loc ? this.h.byBid.get(loc.id) : null, tpl = b && b.lf ? b.lf.template : '';
    const pop = p.ext.pop || {}, emp = pop.activity === 'employed';
    const people = here.slice().sort((x, y) => (y.known ? 1 : 0) - (x.known ? 1 : 0) || (y.l ?? 0) - (x.l ?? 0));
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
    const kind = (ACT_KIND[(me && me.ext.pop && me.ext.pop.activity) || ''] || 'other'), earning = !!(me && me.ext.pop && me.ext.pop.occ && kind === 'student');
    out.push({ id: 'neighbours', label: 'Meet your neighbours', done: nbrs >= 2, prog: `${Math.min(nbrs, 2)}/2`, hint: 'Say hello to people you see at home, the café or the pub.' });
    if (kind === 'jobless' || kind === 'other') out.push({ id: 'job', label: 'Find a job', done: emp, prog: emp ? '' : pend.length ? `${pend.length} out` : '', hint: pend.length ? 'Applications are out. Replies take one to three weeks.' : 'Do > Life admin > Jobs: apply for something.' });
    else if (kind === 'student') out.push({ id: 'job', label: 'Earn alongside your course', done: earning || emp, prog: pend.length ? `${pend.length} out` : '', hint: 'Part-time jobs are under Do > Life admin > Jobs.' });
    out.push({ id: 'group', label: kind === 'retired' ? 'Join something local' : 'Join a group', done: grp.length > 0, prog: '', hint: 'Do > Goals & groups: clubs and teams are the easiest way to meet people.' });
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
      const known = new Set(this.S(() => q.social.query.ties(pid), []).filter((t) => typeof t.o === 'number' && t.on).map((t) => t.o));
      out.open = this.S(() => q.goals.query.groups({}), []).filter((g) => !out.groups.some((x) => x.id === g.id)).map((g) => { const f = this.S(() => q.goals.query.group(g.id)), mem = f && f.members ? f.members : [], kn = mem.filter((m) => known.has(m.id)).map((m) => w.people.get(m.id)?.firstName).filter(Boolean); return { id: g.id, name: g.name, kind: lc(g.kind), size: g.size, at: this.h.place(g.venue)?.name || '', knows: kn.length, names: kn.slice(0, 3).join(', ') }; }).sort((a, b) => b.knows - a.knows || b.size - a.size).slice(0, 12);
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
      // places worth walking to, social ones first; workshops, arches, schools and the like are not offered
      const HIDE = /(^| )(unit|estate green|nursery|vacant unit|primary school|secondary school|mortuary)( |$)/, GOOD = { cafe: 0, pub: 0, 'community centre': 0, library: 0, park: 1, 'park pavilion': 1, gym: 1, church: 1, mosque: 1, 'church hall': 1, restaurant: 2, bakery: 2, 'small supermarket': 3, 'ethnic grocer': 3, 'off licence': 3, barber: 3, salon: 3, launderette: 3, pharmacy: 3, 'charity shop': 3, station: 4 };
      const GROUP = ['Meet people', 'Parks, sport and worship', 'Eating out', 'Shops and services', 'Getting about', 'Other'];
      out.places = [...w.buildings.values()].filter((b) => b.lf && b.lf.kind !== 'residential' && b.name).map((b) => { const t = lc(b.lf.template || b.lf.category || b.type); return { id: b.id, name: b.name, tpl: cap1(t), hide: HIDE.test(t), g: GOOD[t] ?? 5 }; }).filter((p) => !p.hide && (p.g < 5 || !/^\d+ /.test(p.name))).map((p) => ({ id: p.id, name: p.name, tpl: p.tpl, group: GROUP[p.g] })).sort((a, b) => GROUP.indexOf(a.group) - GROUP.indexOf(b.group) || a.name.localeCompare(b.name));
      out.dests = Object.keys(w.pack.meta.offmap).filter((k) => /centre|leisure|retail|airport|other_neigh/.test(k)).map((k) => ({ k, name: lc(k) }));
    } else if (name === 'work') {
      const P = q.player.query; const seenOcc = new Set(); out.openings = P.openings().map((o) => ({ occ: o.occ, ...this.jobInfo(o.occ), bid: o.bid ?? null, at: o.bid != null ? this.h.place(o.bid)?.name : '', count: o.count })).filter((o) => { const k = o.occ + ':' + o.bid; if (seenOcc.has(k)) return false; seenOcc.add(k); return true; }).sort((a, b) => (b.bid != null) - (a.bid != null) || b.mid - a.mid).slice(0, 70);
      out.pending = this.S(() => P.pending(pid), []).map((x) => ({ ...x, label: this.jobInfo(x.occ).label })); out.job = this.S(() => q.labour.query.job(pid)); if (out.job && out.job.occ) out.job = { ...this.jobInfo(out.job.occ), ...out.job }; out.vac = P.vacancies().filter((u) => u.tenure === 'private_rent').slice(0, 10).map((u) => ({ id: u.id, address: u.address, rent: money0(u.rent), beds: u.bedrooms, need: money0(u.rent * 0.6) })); // housing.rentFlat refuses unless the household holds at least 60% of one month's rent
      out.solo = this.S(() => q.business.query.startOptions(pid, null).solo, []); out.mySolo = this.soloOf(pid); out.me = this.situation(pid);
      out.unit = this.S(() => q.housing.query.unit(pid)); out.admin = adminData(this.h, pid);
    }
    this.say({ t: 'play.section', ...out });
  }

  // ------------------------------------------------------------------ god: presets + consequence tracker
  preset(m) {
    const P = GOD_PRESETS.find((x) => x.id === m.id); if (!P) return;
    const w = this.w, before = w.events.nextId; const results = [];
    for (const s of P.steps(m.picks || {}, this.h)) { try { results.push(w.queueCommand({ actor: 'god', name: s.name, args: s.args })); } catch (e) { results.push(false); } }
    const iv = this.track(P.label, P.describe ? P.describe(m.picks || {}, this.h) : P.desc, before, P.icon);
    if (iv) { iv.preset = P.id; iv.ends = P.lasts ? w.calendar.formatDate(w.tick + P.lasts * 144) : null; iv.undo = P.undo ? P.undo.label : null; this.convSig = ''; this.sendConseq(); }
    if (this.h.tier === 'pause') this.h.setTier('scene'); // a paused world shows nothing: let time run so the reaction can be watched
    this.say({ t: 'result', name: P.label, ok: results.some((r) => r !== false), error: null, args: m.picks, date: w.calendar.formatDate(w.tick) });
  }
  undo(id) {
    const iv = this.ivs.find((x) => x.id === id), P = iv && GOD_PRESETS.find((x) => x.id === iv.preset); if (!P || !P.undo || iv.undone) return; const w = this.w, b = w.events.nextId;
    for (const s of P.undo.steps()) { try { w.queueCommand({ actor: 'god', name: s.name, args: s.args }); } catch (e) { /* ignore */ } }
    iv.undone = true; this.track('Reversed: ' + P.label, `${P.undo.label}. This is a new intervention: evictions, moves, closures and illnesses it already caused stay.`, b, '↺'); this.say({ t: 'result', name: P.undo.label, ok: true, error: null, date: w.calendar.formatDate(w.tick) });
  }
  track(label, body, before, icon) {
    const w = this.w, roots = []; for (let id = before; id < w.events.nextId; id++) { const r = w.events.get(id); if (r && r.type !== 'kernel.command') roots.push(r); }
    const iv = { id: this.ivSeq++, label, body: body || '', icon: icon || '★', tick: w.tick, date: w.calendar.formatDate(w.tick), n: 0, kinds: {}, actors: new Set(), buckets: [0], top: [], roots: roots.length, last: w.tick };
    this.ivs.push(iv); if (this.ivs.length > 12) { const old = this.ivs.shift(); for (const [k, v] of this.tracked) if (v === old) this.tracked.delete(k); }
    for (const r of roots) { this.tracked.set(r.id, iv); this.count(iv, r); }
    this.scanFrom = Math.max(this.scanFrom, w.events.nextId); this.convSig = ''; this.sendConseq(); return iv;
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
      return { id: iv.id, label: iv.label, body: iv.body, icon: iv.icon, date: iv.date, ends: iv.ends || null, undo: iv.undo && !iv.undone ? iv.undo : null, undone: !!iv.undone, n: iv.n, people: iv.actors.size, kinds: iv.kinds, buckets: iv.buckets.slice(0, 40), top, days: Math.round((w.tick - iv.tick) / 144), live: w.tick - iv.last < WEEK * 2 };
    });
    this.say({ t: 'conseq', list });
  }
  tickFrame() { this.scan(); this.sendConseq(); if (this.pid != null) this.state(); }
}

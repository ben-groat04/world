// Beat vocabulary: the one-line "latest beat" under a storyline headline. A beat is a real event (with its payload, place, the other people involved and the gap since the
// previous beat), so the line is built from those details, not from a single stock clause per event type.
//   - TV[type](p, c) returns alternative whole-sentence templates (all true of any event of that type; the choice is a hash of the event id, never the sim's RNG);
//   - an optional lead says how long since the story's previous beat ("Three weeks on, ..."), an optional tail echoes the protagonists' mood for events with an obvious valence;
//   - tokens {n} {they} {They} {their} {them} {was} {has} {is} {at} {o} are filled from the story. Anything sensitive is filtered upstream (storylines.js PH returns null for it).
// Pure functions, worker-safe, no sim RNG.
import { projectWords } from './projectwords.js';
const hsh = (n) => { let x = (Math.imul(n | 0, 2654435761) >>> 0); x ^= x >>> 15; x = Math.imul(x, 2246822519) >>> 0; return (x ^ (x >>> 13)) >>> 0; };
const NUM = ['no', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten', 'eleven', 'twelve'];
const nw = (n) => (n >= 0 && n < NUM.length ? NUM[n] : String(n));
const money = (n) => '£' + Math.round(n).toLocaleString('en-GB');
const round = (n) => (n >= 2000 ? Math.round(n / 500) * 500 : n >= 400 ? Math.round(n / 50) * 50 : Math.round(n / 10) * 10);
const lst = (a) => (a.length <= 1 ? a.join('') : a.length === 2 ? a.join(' and ') : a.length === 3 ? a.slice(0, 2).join(', ') + ' and ' + a[2] : a.slice(0, 2).join(', ') + ' and ' + nw(a.length - 2) + ' others');
import { a_an as aAn } from '../text/mods.js';

/** Lead-in phrases by gap since the previous beat (days). */
function leads(g, h) {
  if (g < 0.4) return ['Later that day,', 'Hours afterwards,', 'The same day,'];
  if (g < 1.6) return ['The next day,', 'A day later,', 'By the following morning,'];
  if (g < 7) return ['A few days later,', 'Within the week,', nw(Math.round(g)) + ' days on,', 'Days afterwards,'];
  if (g < 21) return ['A week or two on,', 'About a fortnight later,', 'Within a couple of weeks,', 'Not long afterwards,'];
  if (g < 75) return ['A few weeks later,', nw(Math.max(2, Math.round(g / 7))) + ' weeks on,', 'Within two months,', 'Before long,'];
  if (g < 300) return [nw(Math.round(g / 30)) + ' months on,', 'About ' + nw(Math.round(g / 30)) + ' months later,', 'By the next season,', 'Some months afterwards,'];
  if (g < 700) return ['A year or so on,', 'About a year later,', 'The following year,', 'Many months later,'];
  return ['Years later,', 'A long time afterwards,', 'Much later,'];
}
const NEG = new Set(['life.breakup', 'life.divorce', 'life.death', 'life.kin_death', 'labour.job_lost', 'labour.firm_closed', 'housing.notice_served', 'housing.eviction', 'housing.homeless', 'money.arrears', 'money.debt_spiral', 'money.cost_pressure', 'health.diagnosis', 'health.crisis', 'health.accident', 'health.ill', 'health.episode', 'social.fallout', 'goal.failed', 'goal.abandoned', 'housing.rent_rise', 'labour.went_inactive']);
const POS = new Set(['life.couple', 'life.cohabit', 'life.engaged', 'life.marriage', 'life.pregnant', 'life.birth', 'labour.hired', 'labour.promoted', 'labour.pay_rise', 'life.graduate', 'social.reconcile', 'social.friendship', 'money.arrears_cleared', 'health.recovered', 'goal.completed', 'project.done', 'group.founded']);
const TAIL = {
  negLow: [', and it has hit {them} hard', ', by all accounts taking it badly', '; friends say {they} {is} low about it', ', and it shows'],
  negHigh: [', though {they} {is} bearing up', ', but friends say {they} {is} coping', ', and {they} {is} putting a brave face on it'],
  posHigh: [', and {they} {is} delighted', '; friends say {they} {is} glowing', ', to general cheer'],
  posLow: [', though {they} {is} not quite feeling it yet', ', though it has not lifted {their} spirits much'],
};

const AB = (c) => (c.o && c.one ? '{n} and ' + c.o : '{n}');
const WITH = (c) => (c.o ? ' with ' + c.o : '');
/** type -> (payload, c) => string[] of templates. c: {st, at, o, one, pair, place, wl}. */
const TV = {
  'life.couple': (p, c) => [`{n} got together${WITH(c)}${p.how === 'nightout' ? ' after a night out' : p.how === 'app' ? ' after matching on an app' : p.how === 'work' ? ', having met through work' : p.how === 'friends' ? ' through friends' : p.how === 'family' ? ' through family' : p.how === 'uni' ? ' having met at uni' : ''}`, `{n} became an item${WITH(c)}`, `{n} made it official${WITH(c)}`, `{n} started seeing each other${c.o ? ', with ' + c.o + ' in the picture' : ''}`, `It was official by the weekend: {n} {was} a couple${WITH(c)}`, `{n} began a relationship${WITH(c)} that friends had half expected`],
  'social.flirt': () => ['{n} started flirting in earnest', '{n} {was} seen lingering over a drink together', 'There was a spark: {n} started flirting', '{n} {was} getting on suspiciously well'],
  'life.cohabit': (p) => ['{n} moved in together', p.how === 'partner moved in' ? '{n} had a partner move in' : '{n} {was} sharing a front door by the weekend', '{n} unpacked the second toothbrush for good', 'It was boxes and bin bags for {n}, who moved in together'],
  'life.engaged': (p) => [`{n} got engaged${p.after >= 1 ? ' after ' + nw(Math.round(p.after)) + ' years together' : ''}`, `{n} announced an engagement${p.after >= 1 ? ', ' + nw(Math.round(p.after)) + ' years in the making' : ''}`, '{n} {was} engaged, to the delight of the street', 'A ring appeared: {n} got engaged'],
  'life.marriage': () => ['{n} got married', '{n} tied the knot', '{n} {was} married at the register office', 'Confetti for {n}, who got married'],
  'life.pregnant': () => ['{n} found out a baby was on the way', '{n} {was} expecting', '{n} told family a baby was coming', 'There was news at home: {n} {was} expecting'],
  'life.birth': (p) => { const b = p.baby ? (p.sex === 'F' ? 'baby girl ' : p.sex === 'M' ? 'baby boy ' : 'baby ') + p.baby : 'a baby'; return [`{n} welcomed ${b}`, `${b[0].toUpperCase() + b.slice(1)} arrived, and {n} {was} up all hours`, `{n} brought ${b} home`, `${b[0].toUpperCase() + b.slice(1)} came home to {n}`]; },
  'life.breakup': (p) => [`{n} split up${p.years >= 1 ? ' after ' + (p.years < 1.5 ? 'about a year' : nw(Math.round(p.years)) + ' years') : ''}`, '{n} called it a day', `{n} ended it${p.years >= 2 ? ', a long time coming' : ''}`, '{n} went their separate ways', 'It was over between {n}', `{n} parted${p.years >= 1 ? ', ' + nw(Math.round(p.years)) + ' years after it began' : ''}`],
  'life.divorce': (p) => [`{n} divorced${p.years >= 1 ? ' after ' + nw(Math.round(p.years)) + ' years' : ''}`, `The papers came through: {n} {was} divorced${p.years >= 1 ? ', ' + nw(Math.round(p.years)) + ' years on from the wedding' : ''}`, '{n} finalised the divorce'],
  'life.move_out': (p) => [`{n} moved out${p.to ? ' to ' + p.to : ''}`, `{n} packed up${p.to ? ' for ' + p.to : ''}${p.reason === 'partner' ? ', to be with a partner' : p.reason === 'separation' ? ' after the split' : p.reason === 'job' ? ' for work' : p.reason === 'study' ? ' to study' : ''}`, `{n} left the street${p.reason === 'job' ? ' for a job elsewhere' : ''}`, `The van came for {n}${p.to ? ', bound for ' + p.to : ''}`],
  'housing.moved_out': (p, c) => [`{n} moved out${p.to === 'metropolis' ? ' to the city' : p.to === 'local' ? ' to somewhere nearby' : p.to === 'suburbs' ? ' to the suburbs' : ''}${p.reason === 'afford' ? ' when the rent got too much' : p.reason === 'notice' ? ' after notice came' : p.reason === 'partner' ? ' to be with a partner' : p.reason === 'separation' ? ' after the split' : p.reason === 'job' ? ' for work' : p.reason === 'study' ? ' to study' : p.reason === 'buy' ? ' to buy somewhere' : ''}`, `{n} handed back the keys${c.at}`, `The for-let board went up where {n} had lived`, `{n} left the flat${p.reason === 'space' ? ' for more room' : p.reason === 'independence' ? ' to stand on {their} own feet' : ''}`],
  'life.move_in': (p, c) => [`{n} moved in${p.from ? ' from ' + p.from : ''}`, `{n} arrived${p.from ? ' from ' + p.from : ''} with more boxes than expected`, `{n} {was} the new face${c.at || ' on the street'}`, `{n} settled in${c.at}`],
  'housing.moved_in': (p, c) => [`{n} moved in${p.from === 'outside' ? ' from outside the area' : p.from === 'local' ? ' from nearby' : ''}${p.reason === 'social_allocation' ? ' on a council tenancy' : p.reason === 'flatmate_arrival' ? ' to share a flat' : p.reason === 'couple' ? ' with a partner' : p.reason === 'job' ? ' for work' : ''}`, `{n} got the keys${c.at}${p.tenure === 'council' ? ' to a council tenancy' : p.tenure === 'private_rent' ? ' to a rented flat' : p.tenure === 'mortgage' ? ' to a place of {their} own' : ''}`, `{n} {was} new${c.at || ' to the street'}${p.from === 'outside' ? ', having come from further afield' : ''}`, `{n} carried the first boxes in${c.at}`, `{n} unpacked${c.at}${p.from === 'local' ? ', not far from the old place' : ''}`, `A new name went on the bell${c.at}: {n}`],
  'life.leave_home': (p) => [`{n} left home${p.reason === 'job' ? ' for work' : p.reason === 'study' ? ' to study' : p.reason === 'independence' ? ' to be independent' : ''}`, '{n} flew the nest', '{n} packed a bag and left the family home'],
  'life.caring_start': (p, c) => [`{n} took on caring for {their} ${p.rel || 'relative'}${p.hrs >= 35 ? ', a full-time job in itself' : ''}`, `{n} became a carer for {their} ${p.rel || 'relative'}`, `Caring for {their} ${p.rel || 'relative'} became part of {n}'s week${p.hrs >= 35 ? ' and then most of it' : ''}`],
  'life.caring_end': () => ['{n} stopped being a carer', 'The caring came to an end for {n}'],
  'life.death': (p, c) => (c.dead ? [`{n} lost ${c.dead}`, `${c.dead} died, and {n} {was} left to sort things out`, `{n} said goodbye to ${c.dead}`] : [`{n} died${p.age ? ' aged ' + p.age : ''}`, `{n} died${p.age ? ', at ' + p.age : ''}, and the street felt it`]),
  'life.kin_death': () => ['{n} lost a relative', 'A family bereavement hit {n}', '{n} {was} bereaved'],
  'life.funeral': (p, c) => (c.dead ? [`{n} went to ${c.dead}'s funeral`, `{n} stood at ${c.dead}'s funeral`, `The funeral of ${c.dead} brought {n} out in black`] : ['{n} went to a funeral', '{n} attended a funeral', 'There was a funeral for {n} to get through']),
  'life.will': () => ['{n} {was} named in a will', '{n} heard from a solicitor about a will', 'A will left something to {n}'],
  'life.graduate': () => ['{n} graduated', '{n} threw a cap in the air', '{n} came out of university with a degree and an overdraft'],
  'labour.job_lost': (p, c) => [`{n} ${jobLoss(p, c)}`, `{n} ${jobLoss(p, c)}, and started on the applications`, `The news came on a weekday: {n} ${jobLoss(p, c)}`, `{n} ${jobLoss(p, c)}${c.occ && /^(redundancy|dismissal)$/.test(p.kind) ? ' as ' + aAn(c.occ) : ''}`],
  'labour.quit': (p, c) => [`{n} quit${c.occ ? ' {their} job as ' + aAn(c.occ) : ' {their} job'}`, `{n} handed in notice${c.occ ? ' as ' + aAn(c.occ) : ''}`, '{n} walked away from the job', '{n} left work on {their} own terms'],
  'labour.hired': (p, c) => [`{n} started ${c.occ ? 'as ' + aAn(c.occ) : 'a new job'}${p.via === 'referral' ? ', on a friend\'s word' : p.from === 'unemployed' ? ', after a spell out of work' : ''}`, `{n} landed a job${c.occ ? ' as ' + aAn(c.occ) : ''}${p.from === 'unemployed' ? ' after a long search' : ''}`, `{n} {was} taken on${c.occ ? ' as ' + aAn(c.occ) : ''}${p.via === 'referral' ? ' on the strength of a recommendation' : ''}`, `First day at the new job for {n}${c.occ ? ', as ' + aAn(c.occ) : ''}`, `{n} signed the contract${c.occ ? ' as ' + aAn(c.occ) : ''}`],
  'labour.promoted': (p, c) => [`{n} {was} promoted${c.occ ? ' to ' + c.occ : ''}`, `{n} moved up at work${c.occ ? ', now ' + aAn(c.occ) : ''}`, `{n} got the step up at work${c.occ ? ' and became ' + aAn(c.occ) : ''}`],
  'labour.pay_rise': (p) => [`{n} got ${p.pct ? aAn(Math.round(p.pct) + '% pay rise') : 'a pay rise'}`, `{n} came away with ${p.pct ? 'a ' + Math.round(p.pct) + '% bump in pay' : 'a bit more pay'}`, `{n} {was} paid more from the next month${p.pct ? ', up ' + Math.round(p.pct) + '%' : ''}`],
  'labour.second_job': () => ['{n} took on a second job', '{n} added evening shifts to the week', '{n} started picking up extra work on top'],
  'labour.firm_closed': (p) => [`{n} saw ${p.name || 'the firm'} close`, `${p.name || 'The firm'} shut for good, with {n} on the payroll`, `{n} turned up to find ${p.name || 'the firm'} closing down`],
  'labour.went_inactive': (p) => [p.why === 'caring' ? '{n} gave up work to care for someone' : p.why === 'long_term_sickness' ? '{n} stopped work long-term' : '{n} stopped looking for work', p.why === 'caring' ? 'Caring took over, and {n} left work' : '{n} dropped out of the job market for now'],
  'labour.applied': (p, c) => (p.ok === false ? [`{n} {was} turned down for a job${c.occ ? ' as ' + aAn(c.occ) : ''}`, `{n} had a rejection email${c.occ ? ' for a post as ' + aAn(c.occ) : ''}`, `Another no for {n}${c.occ ? ', this time for a job as ' + aAn(c.occ) : ''}`] : [`{n} went for a job${c.occ ? ' as ' + aAn(c.occ) : ''}`, `{n} sent in an application${c.occ ? ' for a post as ' + aAn(c.occ) : ''}`, `{n} sat an interview${c.occ ? ' for ' + aAn(c.occ) + ' job' : ''}`]),
  'housing.rent_rise': (p) => [`{n} saw the rent go up ${Math.round(p.pct || 0)}%${p.to ? ', to ' + money(p.to) + ' a month' : ''}`, `The rent letter came: up ${Math.round(p.pct || 0)}% for {n}${p.to ? ', now ' + money(p.to) + ' a month' : ''}`, `{n} {was} told to find ${p.to ? 'another ' + money(Math.max(10, round(p.to * (p.pct || 5) / (100 + (p.pct || 5)))))+ ' a month' : 'more'} for the same flat`, `{n}'s landlord put the rent up ${Math.round(p.pct || 0)}%`, `A ${Math.round(p.pct || 0)}% rise left {n} doing the sums again`],
  'housing.notice_served': (p) => [p.reason === 'arrears' ? '{n} was served notice over the arrears' : p.reason === 'sale' ? '{n} {was} given notice because the landlord is selling' : p.reason === 'family_use' ? '{n} {was} given notice so the landlord\'s family could move in' : p.reason === 'retaliatory' ? '{n} {was} given notice after complaining' : '{n} {was} served notice', '{n} had a notice to leave pushed through the door', 'A solicitor\'s letter told {n} to find somewhere else'],
  'housing.eviction': () => ['{n} {was} evicted', 'The bailiffs came for {n}', 'The notice ran out, and {n} had to go'],
  'housing.homeless': () => ['{n} lost {their} home', '{n} had nowhere to go and a friend\'s sofa to hand', '{n} {was} left without a home'],
  'housing.overcrowded': () => ['{n} found the flat too small for everyone', '{n} {was} living on top of each other', 'Space ran out at home for {n}'],
  'money.arrears': (p) => (p.owed ? [`{n} fell ${money(round(p.owed))} behind on the rent`, `{n} {was} ${money(round(p.owed))} in arrears`, `The rent ran ${money(round(p.owed))} short for {n}`, `{n} owed ${money(round(p.owed))} in rent, and knew it`, `{n} missed the rent and ${p.owed > 1500 ? 'the hole grew to ' + money(round(p.owed)) : 'owed ' + money(round(p.owed))}`, `{n} {was} behind with the landlord by ${money(round(p.owed))}`] : ['{n} fell behind on the rent', '{n} missed a rent payment', 'The rent ran short for {n}']),
  'money.debt_spiral': (p) => [`{n} started borrowing to get by${p.debt ? ', about ' + money(round(p.debt)) + ' in debt' : ''}`, `{n} turned to credit to cover the basics${p.debt ? ', with ' + money(round(p.debt)) + ' owed' : ''}`, `Borrowing became a habit for {n}${p.debt ? ': ' + money(round(p.debt)) + ' and rising' : ''}`, `{n} reached for a loan to see the month out${p.debt ? ' and owed ' + money(round(p.debt)) + ' by the end' : ''}`, `The cards and catalogues filled up for {n}${p.debt ? ' to ' + money(round(p.debt)) : ''}`],
  'money.cost_pressure': () => ['{n} started to feel the squeeze', '{n} began counting every pound', 'The weekly shop became a negotiation for {n}', 'Bills outran the wage for {n}', '{n} cut back on the extras'],
  'money.benefit_claim': () => ['{n} put in a benefits claim', '{n} filled in the forms for a claim', '{n} applied for help with the bills', '{n} made a claim and waited'],
  'money.arrears_cleared': () => ['{n} cleared the arrears', '{n} paid off what was owed on the rent', 'The rent was back up to date for {n}'],
  'money.estate': () => ['{n} came into a little money', 'An inheritance, small but welcome, reached {n}', '{n} {was} left something by a relative'],
  'health.diagnosis': (p) => [`{n} was diagnosed with ${lc(p.condition)}`, `{n} heard a diagnosis: ${lc(p.condition)}`, `The tests came back, and {n} learned it was ${lc(p.condition)}`],
  'health.crisis': () => ['{n} ended up in hospital', '{n} {was} taken to hospital', 'An ambulance came for {n}'],
  'health.accident': (p) => [p.kind === 'road' ? '{n} was hurt in a road accident' : p.kind === 'fall' ? '{n} had a bad fall' : '{n} had an accident', '{n} {was} injured and out of action for a bit', 'An accident left {n} nursing a sore body'],
  'health.episode': () => ['{n} went through a rough few months', '{n} had a hard patch', '{n} hit a low spell', '{n} struggled for a while'],
  'health.treatment': () => ['{n} asked the GP for help', '{n} saw the GP and started to get support', '{n} finally booked the appointment'],
  'health.recovered': () => ['{n} turned a corner', '{n} {was} on the mend', '{n} felt well again', 'It lifted, slowly, for {n}'],
  'health.ill': (p) => [p.name ? `{n} came down with ${lc(p.name)}` : '{n} fell ill', p.name ? `${lc(p.name)} laid {n} low` : '{n} {was} laid low', '{n} {was} off sick for a week'],
  'social.fallout': (p, c) => { const o = OVER[p.over], ab = AB(c); return [`{n} fell out${c.o && c.one ? ' with ' + c.o : ''}${o ? ' over ' + o : ''}${p.over === 'remote' || p.over === 'pub' ? '' : c.at}`, `Words were exchanged between ${ab}${o ? ' over ' + o : ''}`, `${ab} stopped speaking${o ? ' after a row about ' + o : ''}`, `It blew up between ${ab}${o ? ': ' + o : ''}${p.over === 'remote' ? '' : c.at}`, `${ab} had a row${o ? ' about ' + o : ''}, and neither backed down`, `${ab} ${c.o && c.one ? 'were' : '{was}'} not on speaking terms${o ? ' after the row over ' + o : ''}`]; },
  'social.reconcile': () => ['{n} made up', '{n} buried it and started talking again', 'The silence ended: {n} made up', '{n} patched things up'],
  'social.friendship': (p, c) => [`{n} became friends${WITH(c)}${FV[p.via] ? ' ' + FV[p.via] : ''}`, `{n} fell into a friendship${WITH(c)}`, `{n} clicked${WITH(c)}${FV[p.via] ? ' ' + FV[p.via] : ''}`, `{n} started meeting up${WITH(c)}`, `A friendship took hold between {n}${c.o ? ' and ' + c.o : ''}`],
  'social.acquaint': (p, c) => (p.via === 'welcome' ? (c.wl && c.wl.length ? [`{n} {was} welcomed to the street by ${lst(c.wl)}`, `${lst(c.wl)} came to say hello to {n}`, `{n} met the neighbours: ${lst(c.wl)}`, `First to knock for {n} were ${lst(c.wl)}`, `${lst(c.wl)} made {n} feel at home`] : ['{n} {was} welcomed to the street', '{n} met the neighbours', '{n} had a first week of nodding hellos']) : [`{n} got talking${c.o ? ' with ' + c.o : ''}${ACQ[p.via] || ''}`, `{n} fell into conversation${c.o ? ' with ' + c.o : ''}${ACQ[p.via] || ''}`, `{n} met${c.o ? ' ' + c.o : ' someone'}${ACQ[p.via] || ''}`]),
  'social.confide': (p, c) => (c.o ? [`{n} opened up to ${c.o}`, `{n} told ${c.o} what was on {their} mind`, `{n} leaned on ${c.o} for a while`] : ['{n} opened up to a friend', '{n} talked it through with a friend']),
  'social.kindness': (p, c) => (c.o ? [`{n} looked out for ${c.o}`, `{n} did ${c.o} a good turn`, `{n} turned up for ${c.o} when it counted`] : ['{n} showed a kindness', '{n} did someone a good turn']),
  'social.scandal': (p) => [p.kind === 'new_couple' ? '{n} had a new romance become the talk of the street' : p.kind === 'lost_job' ? '{n} had news of a job loss get round' : p.kind === 'family_news' ? '{n} had family news get round' : '{n} had word get round of a move'],
  'group.founded': (p) => [`{n} started ${p.name || 'a group'}`, `{n} got ${p.name || 'a group'} off the ground`, `{n} called a first meeting of ${p.name || 'a new group'}`],
  'group.joined': () => ['{n} joined a local group', '{n} signed up to a local group', '{n} found a group to belong to'],
  'group.conflict': (p, c) => [`{n} clashed at a meeting${c.at}`, `Tempers frayed at a meeting for {n}${c.at}`, `{n} had a sharp exchange at the group${c.at}`],
  'group.dissolved': (p) => [p.why === 'never got going' ? '{n} saw the group fold before it got going' : '{n} saw the group fold', 'The group {n} belonged to wound up'],
  'group.leader_changed': (p) => [p.how === 'challenge' ? '{n} ousted the group\'s leader' : '{n} took over running the group', '{n} stepped up to lead the group'],
  'group.split': () => ['{n} split the group', 'The group divided, with {n} on one side'],
  'civic.complaint': (p) => [`{n} complained to the council${COMPLAIN[p.kind] ? ' about ' + COMPLAIN[p.kind] : ''}`, `{n} wrote to the council${COMPLAIN[p.kind] ? ' about ' + COMPLAIN[p.kind] : ''}`, `{n} reported${COMPLAIN[p.kind] ? ' ' + COMPLAIN[p.kind] : ' a problem'} to the council and waited`],
  'goal.transformed': () => ['{n} changed tack', '{n} rethought the plan', '{n} tried a different route'],
  'goal.invented': (p) => [`{n} came up with a plan for ${p.label || 'something new'}`, `{n} got an idea about ${p.label || 'something new'}`],
  'project.started': (p) => projectWords(p.kind, 'start').map((x) => `{n} ${x}`),
  'project.done': (p) => projectWords(p.kind, p.ok === false ? 'flop' : 'done').map((x) => `{n} ${x}`),
};
const OVER = { remote: 'something said online', money: 'money', goal: 'what each of them wanted', noise: 'noise', parking: 'parking', pub: 'a night at the pub', bins: 'the bins', door: 'something said on the doorstep', kids: 'the kids', dogs: 'a dog', school: 'the school', community_centre: 'something at the community centre', bookmaker: 'the bookies', park: 'the park' };
const FV = { 'same street': 'as neighbours down the road', 'place of worship': 'at the place of worship', 'school gate': 'at the school gate', neighbours: 'as neighbours', 'same building': 'living in the same building', 'shop regular': 'as shop regulars', mixing: 'out and about', online: 'online' };
const ACQ = { school: ' at the school gate', door: ' on the doorstep', pub: ' in the pub', park: ' in the park', community_centre: ' at the community centre', cafe: ' in the cafe', group: ' through a group', takeaway: ' in the takeaway queue', ethnic_grocer: ' in the grocer\'s', restaurant: ' over a meal', mosque: ' at the mosque', church: ' at the church', gym: ' at the gym' };
const COMPLAIN = { noise: 'noise', bins: 'the bins', damp: 'damp', parking: 'parking', dogs: 'dogs', litter: 'litter' };
const lc = (s) => String(s || '').replace(/_/g, ' ');
const JL = { redundancy: 'was made redundant', firm_closed: 'lost {their} job when the firm closed', sick: 'had to give up work', dismissal: 'was let go', fixed_term_end: 'came to the end of a fixed-term contract', business_failed: 'saw the business go under' };
const jobLoss = (p) => (JL[p.kind] || 'lost {their} job').replace('was ', '{was} ');

/**
 * The sentence for one beat. c = {n, one, pro ('he'|'she'|'they'), mood, o, at, wl, dead, occ, gap (days since previous beat or null), id (event id), kindOf}
 * Returns a sentence starting with a capital, no final full stop (matches the old beats).
 */
export function beatSentence(b, p, c, fallback) {
  const f = TV[b.type]; let alts = null; try { alts = f ? f(p || {}, c) : null; } catch (e) { alts = null; }
  const h = hsh((c.id | 0) * 7 + 3);
  let t = alts && alts.length ? alts[h % alts.length] : fallback;
  if (!t) return null;
  const mid = hsh((c.id | 0) * 13 + 5);
  // lead-in: how long since the story's last beat (about half of beats that have a previous one)
  const lead = c.gap != null && mid % 100 < 50 ? (() => { const L = leads(c.gap, mid); return L[(mid >>> 8) % L.length]; })() : '';
  // mood echo, only where the event has an obvious valence and the protagonists' mood is clearly one way or the other
  let tail = '';
  if (!lead && c.mood != null && mid % 100 >= 50 && mid % 100 < 72) { const neg = NEG.has(b.type), pos = POS.has(b.type); const k = neg ? (c.mood < -0.15 ? 'negLow' : c.mood > 0.4 ? 'negHigh' : '') : pos ? (c.mood > 0.45 ? 'posHigh' : c.mood < -0.2 ? 'posLow' : '') : ''; if (k) tail = TAIL[k][(mid >>> 9) % TAIL[k].length]; }
  if (lead && t[0] !== '{' && !(c.keep || []).some((k) => k && t.startsWith(k))) t = t[0].toLowerCase() + t.slice(1);
  let s = (lead ? lead + ' ' : '') + t + tail;
  s = s.replace(/\{(\w+)\}/g, (m, k) => (k === 'n' ? c.n : k === 'they' ? c.pro : k === 'They' ? c.pro[0].toUpperCase() + c.pro.slice(1) : k === 'their' ? c.their : k === 'them' ? c.them : k === 'was' ? (c.one && c.pro !== 'they' ? 'was' : c.one ? 'was' : 'were') : k === 'has' ? (c.one && c.pro !== 'they' ? 'has' : 'have') : k === 'is' ? (c.one && c.pro !== 'they' ? 'is' : 'are') : k === 'at' ? c.at || '' : k === 'o' ? c.o || '' : m));
  return s[0].toUpperCase() + s.slice(1);
}
export const hasBeatWords = (type) => !!TV[type];

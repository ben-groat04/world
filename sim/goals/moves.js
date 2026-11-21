// Primitive moves: the verbs plans are built from. Each is an affordance-like record {preconds, effects, costs, resolution}; execution is a real activity (label + thought via the routine hook)
// and an outcome roll. A move NEVER scripts the result: p(success) = base + trait loadings + relationship + self-model belief - difficulty - competition - scarcity; failures carry a reason
// (refused / maybe / competition / no_money / bad_luck / busy / opposed) that drives replanning and credit assignment.
// roles: who the planner picks as target (contact friend family partner neighbour employer authority expert landlord target member).
// bel: self-model belief that biases choosing this move (positive loading = believing it raises willingness AND slightly success via confidence).
const M = (id, kind, o) => ({ id, kind, role: null, dur: 6, hrs: [10, 17], money: 0, base: 0.7, tr: {}, bel: null, diffw: 0.3, venue: null, social: 0, doing: id, ...o });
export const MOVES = [
  // --- information and self-management
  M('search', 'self', { dur: 6, hrs: [19, 22], base: 0.92, doing: 'looking into {v} for {g}', thought: 'Right, let me find out what is actually out there for {g}.', venue: ['home'] }),
  M('plan', 'self', { dur: 6, hrs: [19, 22], base: 0.95, tr: { C: 0.03 }, bel: 'planning_works', doing: 'working out a plan for {g}', thought: 'Writing it down properly this time: {g}.', venue: ['home'] }),
  M('budget', 'self', { dur: 6, hrs: [19, 22], base: 0.9, tr: { C: 0.05 }, bel: 'planning_works', doing: 'going through the budget', thought: 'Where does it all go? Time to look at the numbers.', venue: ['home'] }),
  M('save', 'econ', { dur: 1, hrs: [8, 9], base: 0.7, tr: { C: 0.1, N: -0.03 }, bel: 'effort_pays', diffw: 0.4, doing: 'putting money aside ({v})', thought: 'Not touching this, it is for {g}.', venue: ['home'] }),
  M('wait', 'wait', { dur: 1, base: 1, doing: 'waiting on {v}', thought: 'Nothing to do now but wait for {v}.', venue: ['home'] }),
  M('reflect', 'self', { dur: 3, base: 1, doing: 'thinking it over', venue: ['home'] }),
  M('maintain', 'self', { dur: 6, hrs: [8, 20], base: 0.88, tr: { C: 0.08 }, bel: 'effort_pays', doing: 'keeping at it ({v})', thought: 'Small steps. {v}, again.', venue: ['home'] }),
  M('fix', 'self', { dur: 12, hrs: [10, 17], base: 0.8, tr: { C: 0.06, O: 0.03 }, money: 20, doing: 'getting stuck into {v}', thought: 'Sleeves up: {v}.', venue: ['home'] }),
  M('shop', 'econ', { dur: 6, hrs: [10, 17], base: 0.95, money: 15, doing: 'shopping for {v}', venue: ['shop', 'market'] }),
  // --- training and learning
  M('train', 'self', { dur: 9, hrs: [7, 20], base: 0.78, tr: { C: 0.1, N: -0.03 }, bel: 'effort_pays', diffw: 0.5, doing: 'practising ({v})', thought: 'Putting the hours in: {v}.', venue: ['gym', 'park', 'community_centre', 'home'] }),
  M('learn', 'self', { dur: 12, hrs: [18, 21], base: 0.82, tr: { C: 0.09, O: 0.04 }, bel: 'effort_pays', diffw: 0.5, money: 25, doing: 'studying ({v})', thought: 'Head down, learning {v}.', venue: ['library', 'community_centre', 'home'] }),
  M('attend', 'social', { dur: 9, hrs: [18, 21], base: 0.84, tr: { E: 0.05, C: 0.04 }, doing: 'going along to {v}', thought: 'Going along to {v}. Might as well see.', venue: ['community_centre', 'pub', 'library', 'cafe', 'park'], social: 1 }),
  M('appointment', 'inst', { dur: 3, hrs: [9, 16], base: 0.9, bel: 'institutions_help', doing: 'at an appointment ({v})', thought: 'Appointment: {v}. Hope this is useful.', venue: ['clinic', 'office', 'home'] }),
  M('work_extra', 'econ', { dur: 18, hrs: [17, 19], base: 0.88, tr: { C: 0.06 }, bel: 'effort_pays', doing: 'picking up extra work ({v})', thought: 'Extra hours, extra money. {g} needs it.', venue: ['work'] }),
  M('exercise', 'self', { dur: 6, hrs: [7, 19], base: 0.7, tr: { C: 0.1 }, doing: 'exercising', venue: ['gym', 'park'] }),
  // --- asking and persuading
  M('ask', 'social', { role: 'contact', dur: 3, hrs: [17, 21], base: 0.52, tr: { E: 0.04, A: 0.02 }, bel: 'asking_works', diffw: 0.8, doing: 'asking {t} {v}', thought: 'Going to ask {t} {v}. Deep breath.', social: 1, venue: ['pub', 'cafe', 'home'] }),
  M('persuade', 'social', { role: 'contact', dur: 4, hrs: [17, 21], base: 0.4, tr: { E: 0.06, O: 0.02 }, bel: 'people_trustworthy', diffw: 0.9, doing: 'talking {t} round', thought: 'Need to bring {t} round on {g}.', social: 1, venue: ['pub', 'cafe', 'home'] }),
  M('recruit', 'social', { role: 'friend', dur: 4, hrs: [17, 21], base: 0.45, tr: { E: 0.07, A: 0.02 }, bel: 'asking_works', diffw: 0.9, doing: 'sounding out {t} about joining', thought: 'Would {t} be up for {g}? Only one way to find out.', social: 1, venue: ['pub', 'cafe', 'home'] }),
  M('befriend', 'social', { role: 'contact', dur: 6, hrs: [17, 21], base: 0.6, tr: { E: 0.08, A: 0.05 }, bel: 'people_trustworthy', diffw: 0.5, doing: 'getting to know {t}', thought: 'Make the effort with {t}.', social: 1, venue: ['pub', 'cafe', 'park', 'community_centre'] }),
  M('flatter', 'social', { role: 'target', dur: 3, base: 0.6, tr: { E: 0.04, A: -0.03 }, doing: 'buttering up {t}', thought: 'A bit of flattery never hurt with {t}.', social: 1, venue: ['pub', 'cafe'] }),
  M('confide', 'social', { role: 'friend', dur: 6, hrs: [18, 22], base: 0.8, tr: { E: 0.03, N: -0.04 }, bel: 'people_trustworthy', doing: 'talking things through with {t}', thought: 'I should tell {t} what is really going on.', social: 1, venue: ['pub', 'cafe', 'home'] }),
  M('lie', 'social', { role: 'target', dur: 2, base: 0.62, tr: { A: -0.06, C: -0.02 }, doing: 'bending the truth ({v})', thought: 'Nobody needs to know the whole story.', venue: ['home'] }),
  M('threaten', 'social', { role: 'target', dur: 2, base: 0.4, tr: { A: -0.08, N: 0.03 }, diffw: 0.8, doing: 'leaning on {t}', thought: '{t} needs to understand this is serious.', venue: ['street'] }),
  M('sabotage', 'social', { role: 'target', dur: 3, hrs: [20, 23], base: 0.5, tr: { A: -0.08, C: 0.03 }, doing: 'quietly getting in {t} way', thought: 'Not my fault if things go wrong for {t}.', venue: ['street'] }),
  M('gossip', 'social', { role: 'contact', dur: 3, hrs: [18, 22], base: 0.75, tr: { E: 0.06, A: -0.05 }, doing: 'letting slip a few things about {t}', thought: 'People should know what {t} is like.', social: 1, venue: ['pub', 'cafe'] }),
  M('observe', 'self', { role: 'target', dur: 4, base: 0.9, doing: 'keeping an eye on {t}', thought: 'Watch and wait on {t}.', venue: ['street'] }),
  M('confront', 'social', { role: 'target', dur: 3, hrs: [17, 21], base: 0.5, tr: { A: -0.03, E: 0.05, N: -0.03 }, diffw: 0.7, doing: 'having it out with {t}', thought: 'I am going to say it to {t} face to face.', social: 1, venue: ['street', 'pub'] }),
  M('apologise', 'social', { role: 'target', dur: 3, hrs: [17, 21], base: 0.6, tr: { A: 0.05, N: -0.02 }, bel: 'people_trustworthy', diffw: 0.8, doing: 'apologising to {t}', thought: 'I owe {t} an apology.', social: 1, venue: ['cafe', 'home'] }),
  M('mediate', 'social', { role: 'target', dur: 4, base: 0.5, tr: { A: 0.06 }, doing: 'trying to broker peace with {t}', venue: ['cafe'] }),
  M('negotiate', 'social', { role: 'authority', dur: 4, hrs: [10, 16], base: 0.5, tr: { A: -0.02, E: 0.04 }, bel: 'asking_works', diffw: 0.7, doing: 'negotiating ({v})', thought: 'Time to haggle about {v}.', venue: ['office', 'shop'] }),
  M('advise', 'inst', { role: 'expert', dur: 3, hrs: [10, 16], base: 0.85, bel: 'institutions_help', doing: 'getting advice ({v})', thought: 'Better ask someone who knows: {v}.', venue: ['community_centre', 'library', 'office', 'home'] }),
  // --- money moves
  M('borrow', 'econ', { role: 'family', dur: 3, base: 0.5, tr: { A: 0.02 }, bel: 'asking_works', diffw: 0.8, doing: 'asking to borrow money', thought: 'I hate asking, but I need a loan for {g}.', social: 1, venue: ['home'] }),
  M('lend', 'econ', { role: 'friend', dur: 2, base: 0.9, tr: { A: 0.06 }, money: 40, doing: 'lending {t} some money', thought: '{t} needs help; I can spare it.', social: 1, venue: ['home'] }),
  M('buy', 'econ', { dur: 3, hrs: [10, 18], base: 0.95, money: 40, doing: 'buying {v}', thought: 'Spending on {v}. It is for {g}.', venue: ['shop', 'market', 'home'] }),
  M('sell', 'econ', { dur: 4, base: 0.65, bel: 'money_matters', diffw: 0.5, doing: 'selling {v}', thought: 'Selling {v} to help with {g}.', venue: ['home', 'market'] }),
  M('rent', 'econ', { role: 'landlord', dur: 4, hrs: [10, 16], base: 0.5, money: 300, bel: 'landlords_exploit', diffw: 0.9, doing: 'sorting a rental ({v})', thought: 'Signing for {v}. This is real now.', venue: ['office'] }),
  M('apply', 'inst', { role: 'authority', dur: 6, hrs: [18, 21], base: 0.32, tr: { C: 0.07, O: 0.02 }, bel: 'effort_pays', diffw: 1, doing: 'applying ({v})', thought: 'Application for {v} sent off. Fingers crossed.', venue: ['home', 'library'] }),
  M('quit', 'inst', { role: 'employer', dur: 4, hrs: [10, 16], base: 0.97, tr: { N: -0.02 }, bel: 'risk_pays', doing: 'handing in notice', thought: 'This is it. Handing in my notice.', venue: ['work'] }),
  M('move', 'econ', { dur: 36, hrs: [9, 12], base: 0.88, money: 150, diffw: 0.6, doing: 'moving ({v})', thought: 'Boxes everywhere. Moving ({v}).', venue: ['home'] }),
  M('gift', 'social', { role: 'target', dur: 2, base: 0.9, money: 20, tr: { A: 0.04 }, doing: 'giving {t} a gift ({v})', thought: 'A little something for {t}.', social: 1, venue: ['home', 'cafe'] }),
  M('fundraise', 'social', { dur: 6, hrs: [10, 20], base: 0.6, tr: { E: 0.06, A: 0.03 }, bel: 'community_works', diffw: 0.7, doing: 'fundraising ({v})', thought: 'Every pound counts for {g}.', social: 1, venue: ['community_centre', 'pub', 'street'] }),
  // --- institutional and public
  M('report', 'inst', { role: 'authority', dur: 3, hrs: [10, 16], base: 0.5, bel: 'institutions_help', diffw: 0.7, doing: 'reporting it ({v})', thought: 'Putting it on record: {v}.', venue: ['office', 'home'] }),
  M('complain', 'inst', { role: 'authority', dur: 3, hrs: [10, 16], base: 0.45, tr: { C: 0.04, A: -0.02 }, bel: 'institutions_help', diffw: 0.8, doing: 'making a formal complaint ({v})', thought: 'I will keep complaining until someone listens.', venue: ['home', 'office'] }),
  M('post', 'social', { dur: 3, hrs: [19, 23], base: 0.9, tr: { E: 0.03, O: 0.02 }, doing: 'posting online ({v})', thought: 'Putting it out there: {v}.', venue: ['home'] }),
  M('petition', 'social', { dur: 6, hrs: [10, 18], base: 0.65, tr: { E: 0.05, C: 0.03 }, bel: 'community_works', diffw: 0.7, doing: 'working on a petition ({v})', thought: 'Signatures for {g}.', social: 1, venue: ['street', 'community_centre'] }),
  M('canvass', 'social', { dur: 9, hrs: [10, 19], base: 0.7, tr: { E: 0.07 }, bel: 'community_works', diffw: 0.6, doing: 'knocking on doors ({v})', thought: 'Doors to knock on for {g}.', social: 1, venue: ['street'] }),
  M('organise', 'group', { dur: 9, hrs: [18, 21], base: 0.72, tr: { C: 0.07, E: 0.04 }, bel: 'community_works', diffw: 0.8, money: 15, doing: 'organising ({v})', thought: 'Getting {v} sorted for {g}.', social: 1, venue: ['community_centre', 'pub', 'home'] }),
  M('volunteer', 'social', { dur: 12, hrs: [10, 17], base: 0.85, tr: { A: 0.06, C: 0.03 }, doing: 'volunteering ({v})', thought: 'Giving a few hours: {v}.', social: 1, venue: ['community_centre', 'church', 'park'] }),
  M('invite', 'social', { role: 'friend', dur: 3, hrs: [17, 21], base: 0.7, tr: { E: 0.07 }, bel: 'people_trustworthy', doing: 'inviting {t} ({v})', thought: 'Invite {t} along: {v}.', social: 1, venue: ['home', 'cafe', 'pub'] }),
  M('visit', 'social', { role: 'family', dur: 9, hrs: [11, 19], base: 0.9, tr: { A: 0.03 }, doing: 'visiting {t} ({v})', thought: 'Popping round to see {t}.', social: 1, venue: ['home'] }),
  M('message', 'social', { role: 'friend', dur: 1, hrs: [18, 22], base: 0.72, tr: { E: 0.03 }, bel: 'asking_works', diffw: 0.6, doing: 'messaging {t} ({v})', thought: 'Drafting a message to {t}. Delete. Draft again.', social: 1, venue: ['home'] }),
  M('join', 'group', { dur: 6, hrs: [18, 21], base: 0.7, tr: { E: 0.05 }, bel: 'community_works', diffw: 0.5, doing: 'signing up with {v}', thought: 'Joining {v}. Why not.', social: 1, venue: ['community_centre', 'pub', 'gym', 'park'] }),
  M('found', 'group', { dur: 6, hrs: [18, 21], base: 0.9, tr: { E: 0.03, C: 0.04 }, doing: 'making it official ({v})', thought: 'We are an actual {v} now.', social: 1, venue: ['pub', 'community_centre', 'home'] }),
  M('book', 'inst', { dur: 3, hrs: [10, 17], base: 0.72, money: 25, tr: { C: 0.04 }, bel: 'planning_works', diffw: 0.6, doing: 'booking ({v})', thought: 'Booking {v}.', venue: ['pub', 'community_centre', 'office'] }),
  M('perform', 'group', { dur: 12, hrs: [19, 22], base: 0.8, tr: { E: 0.07, N: -0.05 }, bel: 'risk_pays', diffw: 0.9, doing: 'putting on {v}', thought: '{v}. Nerves, mostly.', social: 1, venue: ['pub', 'community_centre', 'street', 'home'] }),
  M('rally', 'group', { dur: 4, base: 0.6, tr: { E: 0.07, A: -0.03 }, doing: 'counting votes', venue: ['pub'] }),
  M('stand', 'group', { dur: 6, base: 0.5, tr: { E: 0.07 }, diffw: 1, doing: 'standing for election', venue: ['community_centre'] }),
  M('avoid', 'self', { role: 'target', dur: 2, base: 0.85, tr: { N: -0.03 }, doing: 'steering clear of {t}', thought: 'Crossing the road to avoid {t}.', venue: ['street'] }),
  M('mediate_dummy', 'self', { dur: 1, base: 1 }),
];
export const MOVE = Object.fromEntries(MOVES.map((m) => [m.id, m]));
// Outcome text. why -> template; {t} target, {g} goal object, {v} variant.
export const OUTCOME_TEXT = {
  ok: ['{doing}: it worked', 'got it done ({v})', 'went well ({v})'],
  okT: ['{t} said yes', '{t} was up for it', '{t} agreed'],
  maybe: ['{t} said maybe', '{t} wants to think about it', 'left it open ({v})'],
  refused: ['{t} said no', '{t} turned it down', '{t} was not interested'],
  competition: ['someone else got it', 'lost out to another candidate', 'too many others after the same thing'],
  no_money: ['could not afford it', 'the money was not there', 'ran out of money'],
  bad_luck: ['it fell through', 'it did not come off', 'bad timing'],
  busy: ['never got round to it', 'life got in the way', 'let it slide'],
  opposed: ['someone was working against it', 'got blocked by a rival plan'],
};
export const VARIANT_NOUN = { help: 'for a hand', money: 'for a loan', info: 'for advice', date: 'out', join: 'to join', favour: 'for a favour', referral: 'for an introduction', permission: 'for permission', intro: 'for an introduction', transfer: 'about a transfer', raise: 'about a raise', promotion: 'about a promotion', reduce: 'about reducing hours', feedback: 'for feedback', hand: 'for their hand', musician: 'to join', member: 'to join', volunteer: 'to help', parent: 'to join', partner: 'to go in together', young: 'a young person' };

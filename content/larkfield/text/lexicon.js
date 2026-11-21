// Shared vocabulary rules (lx.*). Event payload conventions used across the text packs (event.payload / ctx.p):
//  life.birth{baby} life.death{cause,age} life.marriage life.engaged life.couple life.breakup life.move_in{from,reason} life.move_out{to,reason}
//  life.graduate{course} work.hired{employer,role} work.fired{employer} work.promoted{role} work.quit{employer} biz.open{biz,kind} biz.close{biz,kind}
//  home.eviction{landlord} home.rent_rise{amount,pct} home.flatmate_join home.flatmate_leave money.windfall{amount} money.debt{amount}
//  crime.burglary crime.bike_theft crime.antisocial health.diagnosis{condition} health.recovered civic.campaign{cause} civic.bins social.fallout social.reconcile
//  social.friendship school.result{grade}. s=actors[0] subject, o=actors[1].
export const V = (voice, ...ts) => ts.map((t) => (typeof t === 'string' ? { t, when: { voice } } : { ...t, when: { ...t.when, voice } }));
export default {
  'lx.weather': ['grey again', 'sideways rain', 'properly freezing', 'muggy and unsettled', 'bright but bitter', 'drizzly in that way that soaks you anyway', 'unseasonably warm', 'all fog and no view', 'blowing a hooley', 'that flat white sky'],
  'lx.bus': ['the 52', 'the 17', 'the 86', 'the number 9', 'the night bus', 'the 41'],
  'lx.food': ['a bacon roll', 'cheese on toast', 'a Greggs sausage roll', 'chips from the chippy', 'a jacket potato', 'beans on toast', 'a meal deal', 'leftover curry', 'a Sunday roast', 'a crumpet', 'a Co-op sandwich', 'pasta, again'],
  'lx.drink': ['a brew', 'a flat white', 'a pint', 'a cup of tea', 'a gin and tonic', 'a can of something cold', 'tea, strong, one sugar', 'an oat latte'],
  'lx.shop': ['the Co-op', 'the corner shop', 'the Lidl', 'the chemist', 'the launderette', 'the barber', 'the post office', 'the Tesco Express'],
  'lx.nuisance': ['the bins', 'the potholes', 'the parking', 'the e-scooters on the pavement', 'the noise upstairs', 'the bus timetable', 'the scaffolding that has been up since March', 'the dog mess', 'the broken streetlight on the corner', 'the fly-tipping behind the shops'],
  'lx.day': ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'],
  'lx.hobby': ['five-a-side', 'the allotment', 'bingo', 'pottery class', 'parkrun', 'the choir', 'a pub quiz', 'the climbing wall', 'Zumba', 'knitting group', 'chess in the library', 'Sunday league'],
  'lx.tired': ['knackered', 'shattered', 'wrecked', 'running on fumes', 'absolutely done in', 'dead on my feet', 'barely awake'],
  'lx.good': ['lovely', 'brilliant', 'class', 'smashing', 'a proper result', 'not bad at all', 'sound', 'decent'],
  'lx.bad': ['grim', 'rubbish', 'a nightmare', 'a right palaver', 'pants', 'dreadful', 'a faff', 'not ideal'],
  'lx.congrats': ['Congratulations', 'Well done', 'Brilliant news', 'Fantastic', 'Cheers to that', 'That is wonderful'],
  'lx.sorry': ['So sorry to hear this', 'Thinking of you', 'Oh no, I am sorry', 'Gutted for you', 'That is rotten luck', 'Here if you need anything'],
  'lx.employer': ['the council', 'the hospital', 'a logistics firm out by the ring road', 'an accountancy practice', 'the university', 'a call centre', 'a primary school', 'a care home', 'a design studio', 'the bus depot', 'a law firm in town', 'a hotel kitchen', 'a software start-up above the vape shop'],
  'lx.role': ['project coordinator', 'support worker', 'warehouse operative', 'teaching assistant', 'junior analyst', 'barista', 'dental nurse', 'delivery driver', 'bookkeeper', 'sous chef', 'care assistant', 'admin officer'],
  'lx.biz': ['a coffee place', 'a nail bar', 'a bakery', 'a vintage clothes shop', 'a barber shop', 'a takeaway', 'a repair shop for phones', 'a plant shop', 'a community cafe', 'a vape and phone shop'],
  'lx.sector': ['hospitality', 'retail', 'care', 'the public sector', 'tech', 'logistics', 'education'],
};

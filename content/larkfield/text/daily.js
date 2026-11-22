// Daily personal-feed chatter (key post.daily; post2.mood / post2.photo alias it). Built to stay fresh over years:
//  - per voice: whole lines with real-place slots ({v.cafe} {v.pub} {v.shop} {v.park} {v.library} {v.street}, {p.street} = author's own road)
//  - per voice: observation + aside pairs (dozens x dozens), so two posts rarely share more than a fragment
//  - shared pools keyed to season, today's weather (only claimed for posts written today), weekend, time of day, mood band
// Nothing here claims an event happened to anyone: it is texture. Event-linked posts live in social.js (post:<type>).
import { V } from './lexicon.js';
const D = (voice, ...ts) => ts.map((t) => (typeof t === 'string' ? { t, when: { voice } } : { ...t, when: { ...t.when, voice } }));
const M = (voice, band, ...ts) => ts.map((t) => ({ t, when: { voice, moodband: band } }));
const W = (cond, ...ts) => ts.map((t) => ({ t, when: cond }));

const teenFull = [
  'bus into town was {r.35-65} mins late. {r.4-9} people on it, one of them eating a whole rotisserie chicken',
  'why does {v.shop} close at {r.6-9}pm on a {when|dow}. where am i meant to get snacks',
  'revising at {v.library} for {r.2-3} hours. have learnt the vending machine takes 20ps now',
  'ngl {v.cafe} hot chocolate is the only reason i get through {when|dow}',
  'mum has "borrowed" my charger again. second time this week. not a drill',
  'got off at the wrong stop and had to walk the whole of {p.street}. legs not it',
  'my little brother has told the whole of {p.street} i cried at the film. i did not. it was hay fever',
  'teacher said "see me after" and i have been sweating since {r.9-11}am',
  'lowkey want to learn guitar. highly lacking a guitar',
  'it is {r.8-11}pm and i have discovered i have a presentation tmrw. this is fine',
  'someone left a full bag of chips on the wall at {v.park}. i respect the generosity',
  'been outside {v.shop} for {r.10-40} mins waiting for my mate to turn up. he is "literally round the corner"',
  'got my hair cut at {v.barber} and now i look like my passport photo',
  'nan sent me a text that says "WHO IS THIS" from her own number. she has put me in as "boy"',
  'if i have to hear "what are you doing after sixth form" one more time i will become a hermit',
  'pe in the rain. why. what did we do',
  'dad has started doing "the dance" in front of my friends. i have left the country (the kitchen)',
  'the 5-a-side at {v.park} ended 9-8. i was in goal. do not ask',
  'new trainers day. have walked around {p.street} twice just to look at them',
  'chicken shop on {p.street} gave me an extra wing for free. best day of the term',
  'cannot find my other shoe. have looked in {r.5-12} places. it is probably in the dog',
  'there is a fox on our bins. it looked at me like i owed it money',
  'exam in {r.2-9} days and i have tidied my entire room. productive procrastination hall of fame',
  'wifi has gone down for the {r.2-6}th time this month. i am becoming a person who reads',
  'saw a teacher in {v.shop}. in jeans. we both pretended not to see each other. unspoken pact',
];
const teenObs = ['the bus', 'my phone at {r.1-9}%', 'sir in assembly', 'the group chat', 'my room', 'homework', 'the walk to school', 'my mum', 'year {r.9-13}', 'the canteen', 'lunch', 'my little sister', 'the wifi', 'netball', 'football', 'the chicken shop', 'my alarm', 'my hair', 'tuesday', 'that maths test', 'the queue at {v.shop}', 'the corner by {v.park}', 'my laptop', 'our form tutor', 'my bag', 'the bus home'];
const teenAside = ['i cannot', 'i said what i said', 'no thoughts, head empty', 'fr though', 'send help', 'i am fine', 'smh', 'lol anyway', 'wild', 'that is it, that is the post', 'asking for a friend', 'and it is only {when|dow}', 'character development, apparently'];
const teenPred = ['is a lot today', 'is not it rn', 'has done me dirty', 'is actually kinda funny', 'is carrying me', 'is a joke', 'is a whole mood', 'was not it', 'is not helping', 'took me out', 'has no chill', 'is giving chaos', 'is lowkey the highlight of my week'];

const studentFull = [
  'week {r.3-11} and the fridge contains one lemon and a note from my housemate that just says "NO"',
  'library on {v.street}: third floor, third table, third coffee. we are on first name terms with the cleaner',
  'seminar at {r.9-10}am, {r.3-9} people there. the tutor looked heartbroken and so did i',
  'tried the cheap curry on {p.street}. £{r.6-9}. regret level: low, heartburn level: high',
  'someone has put the bins out in the wrong order for the {r.2-5}th time. a house meeting has been called',
  'overdraft: {r.200-900} quid in the red and the cheese in the fridge is not mine. but it is now',
  'cycling back from campus in the dark with one working light. {r.30-60} minutes of vibes',
  'my housemate has started "meal prepping". our oven is now a lifestyle',
  'went to {v.pub} for "one". it is now {r.1-2}am and i know the barman\'s dog\'s name',
  'did the big shop at {v.shop}. spent £{r.12-31}. it is mostly pasta. we are proud',
  'new rule in the flat: no cooking after midnight. the new rule is already being broken by me',
  'my essay is {r.800-1900} words short and my motivation is {r.0-9}%. both are fine',
  'part-time shift at the pub tonight. will smell of chips until {when|dow}',
  'laundry day at the launderette on {p.street}. found a sock that is not mine. adopting it',
  'the heating in our house works in the kitchen and nowhere else. we all live in the kitchen now',
  'job search update: have applied for {r.4-19} things, got {r.0-3} replies, all automated',
  'got my deposit back. £{r.120-460} of it. the mould took the rest apparently',
  'nobody tells you uni is mostly standing in {v.shop} deciding between two types of baked beans',
  'went home for the weekend. my mum did my washing. i am {r.19-24} and regress instantly',
  'society social at {v.pub}. we are {r.3-9} people and one is the barman',
];
const studentObs = ['the flat', 'my seminar group', 'my bank balance', 'the library at {r.1-3}am', 'my housemate', 'the oven', 'reading week', 'the group project', 'my lecturer', 'the 9am lecture', 'the student loan', 'the landlord', 'my dissertation', 'the bike lock', 'my bus pass', 'rent day', 'my sleep pattern', 'the pot noodle situation', 'the heating', 'the washing-up rota', 'deadline day', 'freshers\' flu', 'my placement'];
const studentAside = ['send snacks', 'we move', 'ok but why', 'will not be discussed', 'so that is {when|dow} sorted', 'i will cry about it after the deadline', 'nobody has noticed', 'thriving, in a manner of speaking', 'this is what the loan was for'];
const studentPred = ['has become a personality trait', 'is held together with blu tack', 'is testing my faith', 'is not sustainable', 'was a mistake and a great time', 'is an ongoing situation', 'has eaten my pasta. all of it', 'replied at {r.2-4}am. why', 'is the only thing keeping me going', 'is sorted until at least Thursday', 'has not been mentioned in the house chat, and that says it all'];

const proFull = [
  'train was cancelled, bus was full, so i walked along {v.street} and found out where all the good bakeries are',
  'commute update: {r.18-50} minutes each way, standing for most of it, one man eating a boiled egg. zero regrets about working from home on {when|dow}',
  'new coffee order at {v.cafe}: oat flat white, extra shot. the barista and i have an understanding now',
  'office pretends hybrid is optional while counting badge swipes. i have started waving at the scanner',
  'flat viewing on {p.street} today. "bijou" was doing a lot of work. so was the damp',
  'paid £{r.7-12} for a lunch that came in a box with a lid on a lid. one for the environment',
  'ran along the canal at {r.6-7}am and nobody saw me. there is a version of me that does this daily',
  'booked a table at {v.pub} for {r.4-8}. "casual drinks". it is a team of {r.4-8}. it will be a spreadsheet',
  'council tax, energy, rent. the three tenors. all on the same week',
  'tried the new place on {v.street}. the staff were lovely, the portion was a canapé',
  'a parcel is "left in a safe place". i am now searching {p.street} for the safe place',
  'gym induction at {v.gym}. the trainer used the word "journey" {r.3-8} times. i counted',
  'the landlord has promised to fix the boiler "this week" for the {r.2-5}th week. i am wearing a hat indoors',
  'my commute smells of someone\'s second breakfast and ambition',
  'meeting that could have been an email, followed by an email about the meeting',
  'brunch at {v.cafe} cost me what a week of food used to. the eggs were excellent though',
  'house party planning: {r.4-9} people, {r.1-3} chairs, one very lovely neighbour who has been warned',
  'we are the people who pay £{r.4-6} for a pint of lager now and call it "a quick one"',
  'cycled past {v.park} and there was a man doing tai chi with a dog. i want his life',
  'working from {v.cafe} on {when|dow}. wifi is fine, the sourdough is a risk to my productivity',
  'moved the sofa up the stairs on {p.street}. it fits. we did not think it would. we have never been so proud',
  'long week. dinner is cereal. i will call it "deconstructed"',
];
const proObs = ['the commute', 'the office', 'the flat', 'brunch', 'my landlord', 'the gym', 'my manager', 'monday', 'the new place on {v.street}', 'sourdough', 'the flatmate chat', 'rent day', 'the 8.{r.10-59} train', 'standup', 'my inbox', 'the deli on {p.street}', 'the electric bill', 'the lift at work', 'my calendar', 'the pub quiz team', 'parking on {p.street}', 'the group chat'];
const proAside = ['no notes', 'ten out of ten, would repeat', 'a situation', 'tell nobody', 'back to it', 'it is a lot of money for a Tuesday', 'i have a spreadsheet for this', 'that is the update'];
const proPred = ['was fine. nothing to report. remarkable', 'is a rolling disaster with good lighting', 'has been "looked into" since March', 'is cheaper than therapy and about as long a wait', 'asked me to "circle back" on something i did not know existed', 'is an experience', 'got me again', 'wins again', 'brings out my worst', 'will be raised at the next review', 'is character building, apparently', 'has a rota now, and a spreadsheet to go with it'];

const parentFull = [
  'school run: {r.3-6} shoes found, one jumper, no idea where the other child is (he is in the car)',
  'parents\' evening at {r.4-6}.{r.10-50}. told our little one is "a delight but chatty". so, like his father',
  'it is {r.6-7}am and I have already negotiated a sock treaty',
  'the park on {when|dow}: {r.6-14} children, {r.2-3} wet benches, one dad on a call. we are all there for the same thing: tiredness',
  'soft play was a mistake. the ball pit has taught me things about humanity',
  'packed lunch contents rejected so far today: {r.3-7}. mine included',
  'World Book Day costume sorted at {r.9-11}pm. cardboard and tape. we do what we can',
  'half-term plan: {v.park}, {v.library}, repeat. someone please invent a fourth place',
  'bath time update: more water on the floor than in the bath. the cat has moved out',
  'nursery pick-up and one of the other parents brought a flask of actual coffee. i am in awe',
  'we have achieved clean uniform AND on time. nobody clap, you will wake it',
  'the parents\' WhatsApp for {v.school} has {r.80-190} messages about one lost cardigan',
  'our kitchen floor has gone beyond sticky. it has gone sentient',
  'the little one just said "I love you" and then "can I have a biscuit". it was a good deal',
  'sat on the wall by {v.shop} eating a doughnut in peace for {r.4-9} minutes. a holiday',
  'leaving the house with the kids takes {r.25-55} minutes. leaving without them takes {r.2-5}',
  'got the bus with a pram and no one offered to help except the {r.60-80}-year-old woman. thank you madam',
  'weetabix on the ceiling. i will not be asking how',
  'tea at {r.5-6}pm and bedtime at {r.7-8}pm is the only time of day i feel like a competent adult',
  'swimming lessons across town: the changing room alone should count as cardio',
  'got a call from {v.school}. everyone is fine. one tooth, no sign of it, an official form',
  'asked the kids what they want for tea and was told "pizza or no tea". pizza then',
  'taxi service to {v.park} again. i am basically a minicab with snacks',
  'every bag I own has a wet wipe in the bottom. every pocket has a dinosaur',
];
const parentObs = ['the school run', 'bedtime', 'the park', 'tea', 'the parents\' WhatsApp', 'half term', 'weetabix', 'football practice', 'the book bag', 'parents\' evening', 'nursery drop-off', 'the washing basket', 'the car seat', 'the nit letter', 'school photo day', 'the lunchbox', 'our kitchen', 'the swimming bag', 'the little one'];
const parentAside = ['i am a shell of a person but a well-fed one', 'nobody warned me about the glitter', 'we live and learn. mostly learn', 'send tea', 'and it is only {when|dow}', 'no regrets, lots of crumbs', 'wine o\'clock was at {r.4-6}', 'every single time', 'it will be fine. it will be fine', 'that is parenting', 'more coffee, please', 'good luck to us all'];
const parentPred = ['is a war and I am the casualty', 'has beaten me again', 'is not for the faint-hearted',  'was an adventure, in the way that a flood is an adventure', 'has been "just five more minutes" since {r.6-7}pm', 'is a situation that nobody warned me about', 'needs a rota and a stiff drink', 'went better than expected. do not tell anyone', 'smells of something I choose not to identify'];

const retireeFull = [
  'lovely morning at the allotment. the courgettes are showing off again and the slugs are on a go-slow',
  'queued {r.12-25} minutes at the post office. the lady in front was telling the whole queue about her hip. we enjoyed it',
  'the 52 was on time today. i have written it in the diary',
  'a cabbage is now £{r.1-2}.{r.10-99} at {v.shop}. i remember when that bought a pint',
  'bumped into an old neighbour at {v.shop}. forty minutes later we parted, no wiser about the bread aisle',
  'Church hall tea on {when|dow}: the scones were reported "acceptable". high praise',
  'gentle walk round {v.park}. the ducks and i exchanged views',
  'my knees say rain. they have been right {r.4-9} times out of ten, better than the forecast',
  'the library on {v.street} has the large print version of the book I wanted. a small joy',
  'pharmacy queue: {r.4-8} ahead of me, all with a story. i brought my own',
  'it has been {r.2-4} weeks since the plumber said "next week". the tap and i have an understanding',
  'my granddaughter showed me how to video call. i have been waving at the ceiling',
  'thank you to whoever put my bin back on {p.street}. you know who you are, and so do I',
  'made soup. enough for the street. i shall go round with it',
  'darts at {v.pub} tonight. i will not be playing, but my opinions will',
  'the milk delivery has been late again. i have written to the dairy in my best handwriting',
  'the doctor\'s waiting room had a jigsaw. i did the corner. it will be there next month',
  'still using the same tea pot for {r.30-48} years. we have both held up',
  'i recall when this road had a butcher, a baker and not one phone shop',
  'went to the bingo. did not win. had a very pleasant evening nonetheless',
  'crossword clue of the day was a pun. i have been smiling since breakfast',
  'It was {r.1-6} degrees at the bus stop and the shelter is still missing a panel. Letters have been sent.',
];
const retireeObs = ['our street', 'the surgery', 'the new bus timetable', 'the library', 'the post office', 'the corner shop', 'the bin men', 'young people on scooters', 'my knees', 'the pharmacy queue', 'the church hall', 'the allotment', 'the paper', 'the radio this morning', 'the weather forecast', 'the chap at {v.shop}', 'the neighbour\'s fence', 'my morning walk', 'the postman'];
const retireeAside = ['we manage', 'there it is', 'I thought I should mention it', 'and I stand by that', 'as it always was', 'one does notice', 'no complaints, mostly', 'that is all for now'];
const retireePred = ['was lovely, if I say so myself', 'is not what it was, but then neither am I', 'has gone downhill since they changed the opening hours', 'is a credit to the area', 'did its best', 'made my morning', 'has been the same for {r.20-50} years and I like it that way', 'could do with a letter to the council', 'was better when I was young, but so was I'];

const adultFull = [
  'long week. a cup of tea and an early night is what we are calling "an event"',
  'anyone know a plumber on {p.street} who actually turns up? the last one rang to say he was "nearly there" two days ago',
  'quiet on {p.street} this morning, which tells you something about {when|dow}',
  'wore the same jumper since Tuesday and nobody has said a word',
  'pulled the wrong lever at {v.shop} and ended up with a loyalty card. i am now a member of something',
  'walked the long way home via {v.park}. good for the head, bad for the shoes',
  'the dog has decided that every walk must pass {v.shop}. there is a sausage roll involved',
  'it is {r.19-23}:{r.10-55} and I am sorting recycling like it is a competitive sport',
  'someone has parked across two spaces outside {v.shop}. i have thoughts and none of them are kind',
  'the traffic on {v.street} this morning: {r.15-40} minutes for {r.1}.{r.2-9} miles. i could have crawled',
  'phoned the council about the streetlight on {p.street}. i am number {r.4-12} in the queue. i can hear the same {r.8-30} seconds of music',
  'chippy on a {when|dow} night. no regrets. a pickled egg for good measure',
  'got the bank to refund {r.12-65} quid. it only took {r.3-5} calls and a tiny breakdown',
  'put the bins out and then realised it was not bin day. hauling them back in. dignity intact, mostly',
  'sat in the car outside the house for {r.5-20} minutes just to listen to the end of the radio play. sometimes it is the only quiet room',
  'at {v.pub} for a quick pint with {r.2-4} mates. we are discussing the state of the roads',
  'forgot my keys, remembered my lunch, left the lights on. a full set',
  'dentist on {when|dow}. i know it will be fine. i am nonetheless sweating like a butter',
  'two aisles at {v.shop} and I forgot the one thing I came for. classic',
  'the neighbour\'s security light has a mind of its own. it has just lit up my bedroom twice. as did the fox',
  'a surprisingly good evening: the film was decent, the takeaway was warm, nobody rang',
  'ordered something online that is "arriving between 8am and 8pm". i am a prisoner in my own hallway',
];
const adultObs = ['the day', 'the traffic', 'the evening', 'my phone', 'the commute', 'tea', 'the neighbours', 'the van across the road', 'the high street', 'my back', 'the weekend', 'the shop on {p.street}', 'the boiler', 'the inbox', 'the radio', 'the dentist', 'the car', 'my lunch break', 'the queue at {v.shop}'];
const adultAside = ['not that anyone is surprised', 'but here we are', 'I will live', 'could be worse', 'that is all I have', 'enough said', 'fine, then', 'tell nobody', 'it\'s the little things', 'back to it', 'as you were', 'carry on, everyone', 'bit of a day'];
const adultPred = ['was fine. just fine', 'has taken it out of me', 'did not go to plan', 'is not what it was', 'is what it is', 'could have been worse', 'has a lot to answer for', 'went on a bit', 'was better than expected', 'is not my favourite thing today'];

const full = (voice, arr) => D(voice, ...arr);
const compose = (voice, obsRule, asideRule) => ({ t: `#${obsRule}# #${asideRule}#`, w: 3, when: { voice } });

export default {
  'post.daily': [
    { t: '#d.teen#', when: { voice: 'teen' }, w: 12 },
    { t: '#d.student|sent#', when: { voice: 'student' }, w: 12 },
    { t: '#d.young_pro|sent#', when: { voice: 'young_pro' }, w: 12 },
    { t: '#d.parent|sent#', when: { voice: 'parent' }, w: 12 },
    { t: '#d.retiree|sent#', when: { voice: 'retiree' }, w: 12 },
    { t: '#d.adult|sent#', when: { voice: 'adult' }, w: 12 },
    { t: '#d.mix|sent#', w: 5 },
    ],
  'post2.mood': ['#post.daily#'], 'post2.photo': ['#post.daily#'],
  'd.teen': [{ t: '#g.scene#', w: 9 }, { t: '#g.scene# #g.verdict#', w: 9 }, { t: '#d.pre.dp# #g.scene#', w: 3 }, { t: '#d.pre.wx# #g.scene#', w: 4, when: { wx: ['clear', 'cloudy', 'rain', 'snow', 'fog'] } }, { t: '#g.scene# #d.react.teen#', w: 5 }, { t: '#d.pre.wx# #d.teen.full#', w: 5, when: { wx: ['clear', 'cloudy', 'rain', 'snow', 'fog'] } }, { t: '#d.pre.season# #d.teen.full#', w: 1.5 }, { t: '#d.pre.dp# #d.teen.full#', w: 1.2 }, { t: '#d.pre.dp# #d.teen.full#. #d.react.teen#', w: 1.2 }, { t: '#d.pre.wx# #d.teen.full#. #d.react.teen#', w: 2, when: { wx: ['clear', 'cloudy', 'rain', 'snow', 'fog'] } }, { t: '#d.teen.full#', w: 3 }, { t: '#d.teen.full#. #d.react.teen#', w: 6 }, { t: '#d.obs.teen# #d.pred.teen#', w: 1 }, { t: '#d.obs.teen# #d.pred.teen#. #d.aside.teen#', w: 1.5 }],
  'd.teen.full': teenFull, 'd.obs.teen': teenObs, 'd.pred.teen': teenPred, 'd.aside.teen': teenAside,
  'd.student': [{ t: '#g.scene#', w: 9 }, { t: '#g.scene# #g.verdict#', w: 9 }, { t: '#d.pre.dp# #g.scene#', w: 3 }, { t: '#d.pre.wx# #g.scene#', w: 4, when: { wx: ['clear', 'cloudy', 'rain', 'snow', 'fog'] } }, { t: '#g.scene# #d.react.student#', w: 5 }, { t: '#d.pre.wx# #d.student.full#', w: 5, when: { wx: ['clear', 'cloudy', 'rain', 'snow', 'fog'] } }, { t: '#d.pre.season# #d.student.full#', w: 1.5 }, { t: '#d.pre.dp# #d.student.full#', w: 1.2 }, { t: '#d.pre.dp# #d.student.full#. #d.react.student#', w: 1.2 }, { t: '#d.pre.wx# #d.student.full#. #d.react.student#', w: 2, when: { wx: ['clear', 'cloudy', 'rain', 'snow', 'fog'] } }, { t: '#d.student.full#', w: 3 }, { t: '#d.student.full#. #d.react.student#', w: 6 }, { t: '#d.obs.student# #d.pred.student#', w: 1 }, { t: '#d.obs.student# #d.pred.student#. #d.aside.student#', w: 1.5 }],
  'd.student.full': studentFull, 'd.obs.student': studentObs, 'd.pred.student': studentPred, 'd.aside.student': studentAside,
  'd.young_pro': [{ t: '#g.scene#', w: 9 }, { t: '#g.scene# #g.verdict#', w: 9 }, { t: '#d.pre.dp# #g.scene#', w: 3 }, { t: '#d.pre.wx# #g.scene#', w: 4, when: { wx: ['clear', 'cloudy', 'rain', 'snow', 'fog'] } }, { t: '#g.scene# #d.react.young_pro#', w: 5 }, { t: '#d.pre.wx# #d.young_pro.full#', w: 5, when: { wx: ['clear', 'cloudy', 'rain', 'snow', 'fog'] } }, { t: '#d.pre.season# #d.young_pro.full#', w: 1.5 }, { t: '#d.pre.dp# #d.young_pro.full#', w: 1.2 }, { t: '#d.pre.dp# #d.young_pro.full#. #d.react.young_pro#', w: 1.2 }, { t: '#d.pre.wx# #d.young_pro.full#. #d.react.young_pro#', w: 2, when: { wx: ['clear', 'cloudy', 'rain', 'snow', 'fog'] } }, { t: '#d.young_pro.full#', w: 3 }, { t: '#d.young_pro.full#. #d.react.young_pro#', w: 6 }, { t: '#d.obs.young_pro# #d.pred.young_pro#', w: 1 }, { t: '#d.obs.young_pro# #d.pred.young_pro#. #d.aside.young_pro#', w: 1.5 }],
  'd.young_pro.full': proFull, 'd.obs.young_pro': proObs, 'd.pred.young_pro': proPred, 'd.aside.young_pro': proAside,
  'd.parent': [{ t: '#g.scene#', w: 9 }, { t: '#g.scene# #g.verdict#', w: 9 }, { t: '#d.pre.dp# #g.scene#', w: 3 }, { t: '#d.pre.wx# #g.scene#', w: 4, when: { wx: ['clear', 'cloudy', 'rain', 'snow', 'fog'] } }, { t: '#g.scene# #d.react.parent#', w: 5 }, { t: '#d.pre.wx# #d.parent.full#', w: 5, when: { wx: ['clear', 'cloudy', 'rain', 'snow', 'fog'] } }, { t: '#d.pre.season# #d.parent.full#', w: 1.5 }, { t: '#d.pre.dp# #d.parent.full#', w: 1.2 }, { t: '#d.pre.dp# #d.parent.full#. #d.react.parent#', w: 1.2 }, { t: '#d.pre.wx# #d.parent.full#. #d.react.parent#', w: 2, when: { wx: ['clear', 'cloudy', 'rain', 'snow', 'fog'] } }, { t: '#d.parent.full#', w: 3 }, { t: '#d.parent.full#. #d.react.parent#', w: 6 }, { t: '#d.obs.parent# #d.pred.parent#', w: 1 }, { t: '#d.obs.parent# #d.pred.parent#. #d.aside.parent#', w: 1.5 }],
  'd.parent.full': parentFull, 'd.obs.parent': parentObs, 'd.pred.parent': parentPred, 'd.aside.parent': parentAside,
  'd.retiree': [{ t: '#g.scene#', w: 9 }, { t: '#g.scene# #g.verdict#', w: 9 }, { t: '#d.pre.dp# #g.scene#', w: 3 }, { t: '#d.pre.wx# #g.scene#', w: 4, when: { wx: ['clear', 'cloudy', 'rain', 'snow', 'fog'] } }, { t: '#g.scene# #d.react.retiree#', w: 5 }, { t: '#d.pre.wx# #d.retiree.full#', w: 5, when: { wx: ['clear', 'cloudy', 'rain', 'snow', 'fog'] } }, { t: '#d.pre.season# #d.retiree.full#', w: 1.5 }, { t: '#d.pre.dp# #d.retiree.full#', w: 1.2 }, { t: '#d.pre.dp# #d.retiree.full#. #d.react.retiree#', w: 1.2 }, { t: '#d.pre.wx# #d.retiree.full#. #d.react.retiree#', w: 2, when: { wx: ['clear', 'cloudy', 'rain', 'snow', 'fog'] } }, { t: '#d.retiree.full#', w: 3 }, { t: '#d.retiree.full#. #d.react.retiree#', w: 6 }, { t: '#d.obs.retiree# #d.pred.retiree#', w: 1 }, { t: '#d.obs.retiree# #d.pred.retiree#. #d.aside.retiree#', w: 1.5 }],
  'd.retiree.full': retireeFull, 'd.obs.retiree': retireeObs, 'd.pred.retiree': retireePred, 'd.aside.retiree': retireeAside,
  'd.adult': [{ t: '#g.scene#', w: 9 }, { t: '#g.scene# #g.verdict#', w: 9 }, { t: '#d.pre.dp# #g.scene#', w: 3 }, { t: '#d.pre.wx# #g.scene#', w: 4, when: { wx: ['clear', 'cloudy', 'rain', 'snow', 'fog'] } }, { t: '#g.scene# #d.react.adult#', w: 5 }, { t: '#d.pre.wx# #d.adult.full#', w: 5, when: { wx: ['clear', 'cloudy', 'rain', 'snow', 'fog'] } }, { t: '#d.pre.season# #d.adult.full#', w: 1.5 }, { t: '#d.pre.dp# #d.adult.full#', w: 1.2 }, { t: '#d.pre.dp# #d.adult.full#. #d.react.adult#', w: 1.2 }, { t: '#d.pre.wx# #d.adult.full#. #d.react.adult#', w: 2, when: { wx: ['clear', 'cloudy', 'rain', 'snow', 'fog'] } }, { t: '#d.adult.full#', w: 3 }, { t: '#d.adult.full#. #d.react.adult#', w: 6 }, { t: '#d.obs.adult# #d.pred.adult#', w: 1 }, { t: '#d.obs.adult# #d.pred.adult#. #d.aside.adult#', w: 1.5 }],
  'd.adult.full': adultFull, 'd.obs.adult': adultObs, 'd.pred.adult': adultPred, 'd.aside.adult': adultAside,
  // the "obs: aside" composites above read as "the bus ... is a lot today"; capitalisation is fixed by the tidy pass
  'd.react.teen': ['i have no notes', 'the audacity', 'and breathe', 'this is my life now', 'not even mad, just tired', 'genuinely cannot make this up', 'anyway, thoughts and prayers', 'i need a nap and a new personality', 'mood', 'that is the whole story', 'i am going to bed', 'respectfully, no', 'lowkey fine with it', 'proper chaos', 'somebody explain this to me', 'top tier nonsense', 'told my mum, she laughed', 'it is giving {when|dow}', 'so that is happening', 'whatever, it is {when|dow}', 'ok bye', 'character building, allegedly', 'absolutely sending it', 'i will survive', 'pray for me', 'and that is on {when|dow}'],
  'd.react.student': ['this is what the loan is for', 'will update when i have slept', 'a lot of feelings about it', 'which is student life, i suppose', 'at least the cheese is mine', 'my future self will deal with it', 'cannot wait to be an adult. wait', 'and I am not even hungover. yet', '10/10 would put on the CV', 'a classic {when|dow}', 'one for the group chat', 'pray for my overdraft', 'it is fine. it is all fine', 'will cry later, scheduled for {r.6-9}pm', 'somebody check on me', 'anyone else, or just me', 'this is the vibe', 'such a time to be alive', 'i regret nothing (i regret some things)', 'no further questions'],
  'd.react.young_pro': ['so that is my {when|dow}', 'at least the coffee was good', 'it is a lot of money for what it is', 'this is a flex, apparently', 'will be raising it at the next one-to-one', 'sums up the week',  'no notes, only questions', 'thriving, in a way', 'and we call this a life', 'not sure what I expected', '7/10, would do again', 'good enough, ship it', 'this is fine, genuinely', 'more of this please', 'I am now officially tired of this topic', 'back to the group chat', 'save it for the spreadsheet', 'hard pass on the repeat', 'such is life in the city'],
  'd.react.parent': ['there is no way this is the last time', 'I need a holiday from my holiday', 'somebody pass the wine, or tea, honestly either', 'and breathe', 'we got there, eventually', 'the kids found it hilarious', 'it is a phase, they say', 'nobody tells you this part', 'bedtime cannot come soon enough', 'small wins, as they say', 'I wouldn\'t change it. I would change the noise', 'we are all fine, just a little frazzled', 'the school will hear about it', 'more biscuits required', 'a very normal {when|dow} in this house', 'wish me luck for tomorrow', 'but we are fine. we are fine.', 'thank goodness for the weekend', 'another day, another shoe', 'bless them, honestly'],
  'd.react.retiree': ['one does what one can', 'that is how it was in my day too', 'I thought I should mention it', 'but it is all part of life', 'it did make me smile', 'take care, everyone', 'it made the day, really', 'that will do for now', 'there is always tomorrow', 'I shall say no more', 'and so to bed', 'all in all, no complaints', 'the young ones would not understand', 'my husband would have laughed', 'my wife would have laughed', 'as the saying goes', 'just a small thing, but a good one', 'anyway, tea\'s getting cold', 'I do hope you are all well'],
  'd.react.adult': ['and that is the day', 'it is what it is', 'I will not be discussing it further', 'a slow {when|dow}, but a good one', 'fine by me', 'nobody will believe it', 'best get on with it', 'all in a day\'s work', 'honestly, it could be worse', 'tea time', 'small things, small pleasures', 'no complaints, no surprises', 'that is me done for the day', 'so that is that', 'carry on', 'you know how it is', 'still, it made me laugh', 'and so another {when|dow} ends', 'no regrets, a few aches'],
  'd.pre.wx': [
    ...W({ wx: 'rain' }, 'rain again.', 'soaked on {p.street} this morning.', 'forecast said "showers". the forecast was being generous.', 'umbrella gave up outside {v.shop}.', 'wet through.', 'rain on the windows and the heating on.', 'puddle the size of a pond at the corner of {p.street}.', 'drizzle, but the sort that gets in everywhere.', 'rain all day and the kettle never off.'),
    ...W({ wx: 'clear' }, 'blue sky for once.', 'sunshine on {p.street}.', 'bright and crisp this morning.', 'clear skies, finally.', 'everything looks better in the sun.', 'not a cloud over {v.park}.', 'proper daylight, for once.', 'dry day, thank goodness.'),
    ...W({ wx: 'cloudy' }, 'grey again.', 'a flat white sky today.', 'not raining, not not-raining.', 'overcast and a bit nothing.', 'that kind of cloud that sits on the rooftops.', 'dull one out there.', 'cloud down to the chimney pots.'),
    ...W({ wx: 'snow' }, 'snow on {p.street}!', 'half an inch of snow and the whole street has stopped.', 'white over everything this morning.', 'the first snow and the bus has already given up.', 'slush by {v.shop}.'),
    ...W({ wx: 'fog' }, 'fog this morning.', 'cannot see {v.shop} from the corner for the fog.', 'thick fog on {p.street}.', 'damp and foggy out there.'),
  ],
  'd.pre.season': [
    ...W({ season: 'spring' }, 'blossom on {p.street}.', 'clocks have changed, again.', 'daffodils out in {v.park}.', 'light evenings are back.', 'spring is trying its best.', 'pollen season.', 'april showers, in {r.3-5} different months.'),
    ...W({ season: 'summer' }, 'long light evenings.', 'school summer holidays.', 'too hot to think.', 'windows open all night.', 'sunburn on one side.', 'ice lollies from {v.shop}.', 'summer in the city.'),
    ...W({ season: 'autumn' }, 'leaves on the pavement.', 'dark at {r.5-6}pm already.', 'conker season.', 'first heating of the year.', 'the clocks have gone back.', 'scarf weather.', 'back-to-school season.'),
    ...W({ season: 'winter' }, 'dark at {r.4-5}pm.', 'frost on the car.', 'cold enough to see your breath on {p.street}.', 'christmas lights going up.', 'january again.', 'every radiator on.', 'scraping the windscreen again.'),
  ],
  'd.pre.dp': [...W({ dp: 'morning' }, 'morning.', 'up too early.', 'first coffee of the day.', 'on the bus at {r.7-8}am.', 'school-run hour.', 'before nine:'), ...W({ dp: 'afternoon' }, 'lunchtime.', 'mid-afternoon slump.', 'quick break:', 'afternoon on {p.street}:'), ...W({ dp: 'evening' }, 'evening.', 'back from work.', 'tea time.', 'sofa o\'clock.', 'dark already.', 'after tea:'), ...W({ dp: 'night' }, 'still up.', 'late one.', 'cannot sleep.', 'midnight snack.', 'after hours:')],
  'd.mix': [
    { t: '#g.scene#. #d.low#', when: { moodband: 'low' }, w: 3 }, { t: '#d.low#. #g.scene#', when: { moodband: ['low', 'flat'] }, w: 2 },
    { t: '#g.scene#. #d.high#', when: { moodband: 'high' }, w: 3 }, { t: '#d.high#. #g.scene#', when: { moodband: ['high', 'ok'] }, w: 1 },
    { t: '#d.pre.season# #g.scene#', w: 3 }, { t: '#d.pre.dp# #g.scene#', w: 2 }, { t: '#d.pre.wx# #g.scene#', when: { wx: ['clear', 'cloudy', 'rain', 'snow', 'fog'] }, w: 3 },
  ],
  'd.season': [
    ...W({ season: 'spring' }, 'clocks have gone forward and i have already lost an hour of my life and a glove', 'blossom on {p.street}. the pavements look like a wedding', 'first day I could sit outside {v.cafe} without a coat. i was wrong, i needed a coat', 'daffodils in {v.park} are out. the council has done something right', 'spring cleaning: found {r.2-9} odd socks and a very old receipt', 'pollen count is hitting. my eyes have left the building', 'the evenings are lighter and the neighbours have all remembered they have gardens'),
    ...W({ season: 'summer' }, 'the flat is {r.26-31} degrees and I am lying on the kitchen floor', 'ice lollies from {v.shop} are carrying the whole street', 'lunch on the grass at {v.park}. {r.20-60} people with their shirts off. the sun has a lot to answer for', 'summer on {p.street}: windows open, every radio on a different station', 'school holidays: day {r.3-30} of "I\'m bored"', 'the allotment is giving us more courgettes than there are neighbours', 'the heat has beaten the fan. we are all in damp towels'),
    ...W({ season: 'autumn' }, 'conkers on {p.street}. i confiscated three from a seven-year-old for "safety"', 'first proper coat day. my keys were in the other pocket', 'leaves everywhere. council sweeper has not been since the {r.2-5}th', 'back to school routine: the lunchbox situation has begun', 'dark by {r.5-6}pm. the evening has been cancelled', 'bonfire night is on the way and the fireworks have already started. the dog is not impressed', 'smell of damp wool on the bus. it is autumn now, officially'),
    ...W({ season: 'winter' }, 'frost on the windscreens along {p.street}. i have used my loyalty card to scrape mine', 'christmas lights are up on {v.street}. one of them is flashing in morse', 'dark when i went to work, dark when i came back. i have been seeing the sun through a window only', 'boiler has gone. the house is {r.9-13} degrees. i have put on three jumpers and a hat', 'puddles with a layer of ice on them outside {v.shop}. a hazard and a joy', 'january: the month that takes its time', 'every coat on the radiator and the cat on top of them'),
  ],
  'd.weather': [
    ...W({ wx: 'rain' }, 'rain again. the umbrella inverted outside {v.shop} and i have never felt so seen', 'drizzle on {p.street} that gets you wet without ever really raining', 'the road outside {v.shop} is a river and a bus has just made it a wave', 'wet socks all day. no regrets, plenty of dampness', 'the sort of rain that makes the whole street smell of wet pavement'),
    ...W({ wx: 'clear' }, 'blue sky over the rooftops and half the street is in the {v.park}', 'sun is out on {p.street}. i have seen a neighbour\'s legs. it is officially a thing now', 'a bright clear day and everyone has remembered they like people', 'clear skies, cold hands. nice though'),
    ...W({ wx: 'cloudy' }, 'flat grey sky. not raining, not not-raining. very british', 'white cloud all day. the street looks like an old photograph', 'cloudy and a bit muggy. nobody is happy but nobody has complained'),
    ...W({ wx: 'snow' }, 'snow on {p.street}! {r.4-9} children, one sledge (a tray), zero buses', 'the first snow has stopped the 52 and started a snowball fight outside {v.shop}', 'everything is white and the council has gritted exactly one road. it is not ours'),
    ...W({ wx: 'fog' }, 'fog so thick I could not see {v.shop} from the corner', 'a fog on {p.street} this morning. the streetlights looked like they were glowing on purpose'),
    ...W({ wx: ['clear', 'cloudy'], warm: 'yes' }, 'it is hot enough that the tarmac outside {v.shop} is shiny. cold drinks, cold shower', 'fan on, windows open, neighbour\'s barbecue going. the sound of a hot evening on {p.street}'),
  ],
  'd.weekend': [
    'Saturday on {v.street}: {r.30-80} people in {v.cafe}, one table free. it was by the loo. we took it',
    'sunday lie-in lasted until {r.7-8}.{r.10-50}am, courtesy of next door\'s bin lorry', 'the car boot at {v.park} had a bargain. I will not be telling anyone what it was',
    'roast at {v.pub}: the Yorkshire was the size of a hat. it will be a very slow afternoon', 'parkrun at {v.park}: {r.80-250} runners, one man dressed as a banana, nobody was faster than the banana',
    'sat on the bench at {v.park} with a coffee for {r.20-50} minutes and watched the world pass. recommend', 'saturday shop at {v.shop} is a competitive sport. i came second to a trolley',
    'sunday and the whole of {p.street} smells of roast dinner',
    'the weekend has gone in a blink and all that was achieved was a clean kitchen', 'a Sunday walk round {v.park}. everyone had a dog and an opinion',
  ],
  'd.weekday': [
    'it is only {when|dow} and I am already counting down to Friday', 'mid-week slump. the biscuit tin has been raided', '{when|dow} morning on {p.street}: bins, buses and a lot of people looking at their phones',
    'the school-run crowd on {v.street} at {r.8}.{r.10-50}: a nature documentary', 'lunchtime queue at {v.shop} is out the door. is there a special? there is not', 'the 5pm rush on {v.street}: everyone is going home, no one is happy about it',
    'a {when|dow} that feels like a Monday. who approved this?', 'the commute had a signal failure. the signal had it coming',
  ],
  'd.night': [
    'still awake at {r.1-3}am. the fox outside is more productive than I am', 'can hear a siren on {v.street}. whoever it is, I hope they are okay', 'insomnia has produced the following idea: toast', 'night bus home: {r.2-5} people, three of whom are asleep, one is eating chips. good night',
    'streetlights humming. the world is quiet and the fridge is loud', '{r.1-3}am and next door\'s dog is performing opera. a recital for one',
  ],
  'd.morning': [
    'bin lorry at {r.6-7}am on {p.street}. nature\'s alarm clock', 'cuppa, toast, radio. the only part of the day nobody can touch', 'bus stop on {p.street} at {r.7-8}am: {r.4-9} people, nobody speaking. the national sport',
    'the morning smell of toast from the flat below. hungry now', 'trying to leave on time. leaving on time is a fiction invented by people with fewer shoes',
  ],
  'd.evening': [
    'tea is on. the telly is on. my mind is not', 'a lovely light on the rooftops from {p.street} this evening. phone photos do not do it justice', 'walking home via {v.park}. the ducks have gone to bed. i should too',
    'lights on in every window of {p.street}. it is a good look', 'takeaway menu on the fridge has become a form of therapy',
  ],
  'd.low': [
    'not a great day. the kettle is on. it will do', 'feeling low and boring about it. going to bed early and hoping for better', 'one of those weeks when everything is a bit much. will try again tomorrow',
    'tired in a way sleep does not fix. nobody needs to reply', 'quiet one tonight. the telly is on for the company', 'flat today. not sad exactly, just a bit grey',
  ],
  'd.high': [
    'good day. a proper one. do not ask, just let me have it', 'for some reason, everything has gone right today. suspicious, but I will take it', 'in a very good mood and I do not know why. perhaps the weather. perhaps the biscuits',
    'a nice chat in {v.shop}, a seat on the bus, and a cheap loaf. what a day', 'feeling lucky. possibly just rested. either way I will take it',
  ],
};

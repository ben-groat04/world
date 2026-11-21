// Obituaries (key 'obit') and short bios ('bio'). ctx.a = person, p: {years (in area), job, kids, partner, hobby, facts...}.
import { V } from './lexicon.js';
export default {
  'obit': [
    { t: '#obit.open# #obit.life# #obit.char# #obit.close#' },
  ],
  'obit.open': ['{a.name}, {a.age}, died {p.where?at home} on {when|date}, surrounded by family.', '{a.name} died peacefully on {when|date}, aged {a.age}.', 'It is with great sadness that we announce the death of {a.name}, {a.age}, who passed away on {when|dow} after a short illness.', '{a.first} {a.last}, {a.age}, has died. {a.They} lived in Larkfield for {p.years?a few|words} years.'],
  'obit.life': [
    'Born in {p.born?the city}, {a.they} worked as {p.job|a} for most of {a.their} life, retiring "when the lanyard got too heavy".',
    '{a.They} {a.v:was} {p.job?a bus driver|a} for thirty-one years and knew every shortcut, pothole and temper on the route.',
    'After the children came, {a.they} kept the household and the allotment going and, on Thursdays, the library.',
    '{a.They} ran {p.biz?a small business} on the parade and never once gave short change on principle.',
    'A nurse, a neighbour, an immigrant: {a.they} came with one suitcase and a recipe, and built an extended family around both.',
  ],
  'obit.char': [
    'Known for {a.their} stubbornness, {a.their} sponge cakes, and an unnerving ability to win at dominoes.',
    'Friends remember {a.them} as the one who always answered the door before the second knock.',
    '{a.They} {a.v:was} a regular at the bingo, the bus stop, and any argument about parking.',
    'Never one for fuss, {a.they} left strict instructions that nobody should wear black and that the sandwiches be egg.',
    'Stories about {a.them} usually begin "you won\'t believe this" and are, in fact, all true.',
  ],
  'obit.close': ['{p.kids?three|words|cap} children and a gang of grandchildren survive {a.them}; they will be teasing each other about it at the wake. The funeral will be at the crematorium, with tea after at the community centre.', '{a.They} leave{a.They|}'.replace('leave{a.They|}','leave a partner of fifty years, and a dog who is not coping. Donations in lieu of flowers to the hospice.'), 'The family would like to thank everyone at the surgery and the neighbours who kept the soup coming.'],
  'bio': [{ t: '#bio.who# #bio.hook# #bio.now#' }],
  'bio.who': [
    { t: '{a.name}, {a.age}, works as {a.job?a worker|a} and lives on the {p.street?Larkfield} side of the neighbourhood.', when: { voice: ['young_pro', 'adult'] } },
    { t: '{a.name}, {a.age}, is a student who shares a four-bed with three others and a persistent mould.', when: { voice: 'student' } },
    { t: '{a.name}, {a.age}, is a parent of {a.kids?two|words}, and a regular at the school gate, the Co-op, and the pharmacy.', when: { voice: 'parent' } },
    { t: '{a.name}, {a.age}, has lived here for {p.years?a few|words} years, long enough to remember when the library was open on Saturdays.', when: { voice: 'retiree' } },
    { t: '{a.name}, {a.age}, is in the sixth form and is currently "between hobbies".', when: { voice: 'teen' } },
  ],
  'bio.hook': ['{a.They} {a.v:swear} the chippy on the corner is the best in town.', '{a.They} {a.v:keep} meaning to learn the guitar.', 'Most weekends, {a.they} can be found at #lx.hobby#.', '{a.They} {a.v:have} a long-running feud with the upstairs neighbour about a bike.', '{a.They} {a.v:know} the bus timetable better than the bus drivers do.'],
  'bio.now': ['Right now, mostly tired.', 'Lately, {a.they} {a.v:have} been thinking about moving.', 'Things are going well, mostly, and {a.they} {a.v:be} suspicious of it.', 'Money is tight but the kettle is always on.'],
};

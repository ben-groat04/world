// Inner thoughts (genre 'thought'). Keys by situation: thought.commute thought.money thought.lonely thought.work thought.home thought.family thought.night thought.idle,
// plus thought:<eventType> for reactions. Conditions: moodband low/flat/ok/high, voice, a.trait.* (0..1).
import { V } from './lexicon.js';
const M = (band, ...ts) => ts.map((t) => ({ t, when: { moodband: band } }));
export default {
  'thought.commute': [
    ...M('low', 'Same stop, same faces, same grey. Another day of being a number on a card reader.', 'The bus is going to be late and I am going to let it ruin me.'),
    ...M('flat', 'Third bus this week where I have stood the whole way. Standing is a lifestyle now.', 'Put the headphones on so nobody talks to me. It works about half the time.'),
    ...M('ok', 'Quiet carriage. Someone has brought a bacon sandwich on, and honestly good for them.', 'Light\'s on the canal and nobody is shouting. Fine, then.'),
    ...M('high', 'Cycling in with the sun on my back and nothing to do until ten. This is what it is for.', 'Got a seat. Got a window. Got a plan for lunch.'),
  ],
  'thought.money': [
    ...M('low', 'Rent, then the gas, then whatever is left. There is never "left".', 'Checking the balance the way you check a wound.', 'Another envelope that looks official. Put it behind the clock with the rest.'),
    ...M('flat', 'Added it up twice and it came out the same. That is the worst part.', 'If I skip the takeaway twice it covers the electric. Maths as a hobby.'),
    ...M('ok', 'A bit put by this month. A bit. I shall not look directly at it.', 'Payday. Treated myself to the good coffee. Immediately regretted it. Enjoyed it.'),
    ...M('high', 'Paid off the card. Nobody was there to see it, and it still felt like a parade.', 'Maybe a holiday. Maybe the sea. Maybe just a day at the seaside.'),
  ],
  'thought.lonely': [
    ...M('low', 'Three days since I spoke to anyone who wasn\'t paid to speak to me.', 'The flat is loud with nobody in it. I hear the fridge more than I hear people.'),
    ...M('flat', 'Everyone is busy. Everyone is also on their phone. I am on mine. We are all very busy.', 'Might go to the cafe just to hear people talking in the next booth.'),
    ...M('ok', 'The man at the shop asked how I was and meant it. That counts for something.'),
    ...M('high', 'Quiet evening in, but a good quiet. Music on. Door locked. Friends on speed dial.'),
  ],
  'thought.work': [
    { t: 'If one more person says "circle back" I will circle back into the river.', when: { voice: 'young_pro' } },
    { t: 'Half past two. Whole afternoon ahead and the will of a damp sock.', when: { moodband: ['low', 'flat'] } },
    { t: 'Dentist. Teacher. Driver. A hundred little tasks nobody notices until they\'re not done.', when: { moodband: ['ok', 'high'] } },
    { t: 'The boss is nice, which is worse; you can\'t even resent him properly.', when: {} },
    { t: 'Lunch is the only item on the day I actually chose.', when: {} },
  ],
  'thought.home': [
    ...M('low', 'The kitchen smells of last night. I should open a window. I should do lots of things.'),
    ...M('flat', 'Everything is where it should be and I can\'t tell if that\'s tidy or a sign I\'ve stopped living here.'),
    ...M('ok', 'Kettle on, radiator ticking. Small mercies.'),
    ...M('high', 'Cooked a proper meal for no reason. Played the music loud. The neighbours can learn to love it.'),
    { t: 'Landlord says he will "look into" the damp. I have heard this sentence three winters running.', when: { voice: ['student', 'young_pro'] } },
  ],
  'thought.family': [
    { t: 'She said she\'s fine in the voice that means she isn\'t.', when: { voice: ['parent', 'adult'] } },
    { t: 'I should ring my mum. I\'ll ring on Sunday. I said that last Sunday.', when: { voice: ['young_pro', 'student'] } },
    { t: 'The house is too big for one now. I keep a second cup out of habit.', when: { voice: 'retiree' } },
    { t: 'Mum is going to ask about my grades. Better to be ill.', when: { voice: 'teen' } },
    { t: 'Everyone keeps asking how the kids are. Nobody asks how I am. I am fine. I am also asleep on my feet.', when: { voice: 'parent' } },
  ],
  'thought.night': [
    ...M('low', 'It\'s the kind of three a.m. where every decision I\'ve ever made is lined up on the wall.', 'Foxes outside. A siren. Sleep is a rumour.'),
    ...M('flat', 'Lying here doing the list again. The list never gets shorter, it just changes order.'),
    ...M('ok', 'Quiet street, good bed, a bit of rain on the window.'),
    ...M('high', 'Can\'t sleep for good reasons. Lovely.'),
  ],
  'thought.idle': [
    '#lx.shop|cap# will have it. Or it won\'t, and I\'ll walk past #lx.shop# on the way home with nothing.', 'Thinking about #lx.food# for no reason. Mostly reason.', 'Went past #lx.hobby# and nearly went in. Nearly.', 'Mum used to say #lx.weather# weather builds character. I think it builds a cold.', 'I should do something about #lx.nuisance#. I will write a strongly worded email. Or have a nap.', 'Fancy #lx.drink#. Not fancy getting up for it.', 'If I leave now, I will make #lx.bus# and be early. If I stay, I will see the end of this programme. Staying.',
    'Wonder what\'s for tea.', 'Someone\'s frying onions two doors down. I have never been so jealous.', 'The pigeon on the wall has been looking at me for ten minutes. We\'re in a standoff.', 'I should go for a walk. I\'ll go for a walk. After this.', 'The street smells of wet leaves and chips.', 'Must renew that thing. What thing? That thing.',
    { t: 'Odd to think there are four hundred people within a five-minute walk and I know maybe a dozen.', when: { 'a.trait.extraversion': '<0.4' } },
    { t: 'Think I\'ll pop to the pub. Just for one. Famous last words.', when: { 'a.trait.extraversion': '>0.6' } },
  ],
  'thought:home.eviction': [...M('low', 'Twenty-eight days. Everything I own in boxes I haven\'t got.', 'It was the only place that ever felt like mine.'), ...M('flat', 'Right. Phone calls. Lists. Somewhere cheaper, somewhere further.'), ...M('ok', 'It\'s only a flat. It\'s only a flat. It is not only a flat.')],
  'thought:life.breakup': [...M('low', 'Everywhere I look is a place we were.', 'I keep reaching for my phone to tell {b.first}.'), ...M('flat', 'It was the right decision. It was the right decision. It is still a decision.'), ...M('ok', 'Lighter, somehow. I shall not say so out loud.'), ...M('high', 'Strange to feel this free. I am not going to examine it too closely.')],
  'thought:work.fired': [...M('low', 'I have been good at something for eleven years and a spreadsheet disagrees.'), ...M('flat', 'Cardboard box, lanyard handed in. Out into a Tuesday afternoon.'), ...M('ok', 'Maybe this is the push. Maybe it is a push off a cliff. Tea first.')],
  'thought:work.hired': [...M('high', 'Start date: {when|dow}. New lanyard. New me. Same trainers.'), { t: 'It is real. It is paid. I should be happy and mostly I am checking the commute twice.', when: {} }],
  'thought:life.birth': ['She is looking at me like she already knows all of my mistakes.', 'I have never been so tired or so awake.', 'All the planning and not one thing prepared me for her hands.'],
  'thought:life.death': [...M('low', 'The house is quiet in a different way now.'), { t: 'I keep thinking I\'ll have to tell {s.first}. Then I remember.', when: {} }],
  'thought:*': ['Right. That is a thing that has happened.', 'Think about it later. Put the kettle on first.', 'Not sure how I feel. That is also information.'],
};

// Group chat and DM lines (keys chat.<kind>). Slots: {a.first}. {b.first} (the person being addressed or discussed), {p.thing}.
import { V } from '../lexicon.js';
export default {
  'cx.day': ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday', 'tomorrow', 'tonight', 'tomorrow night', 'this weekend'],
  'cx.time': ['7', '7.30', '8', '6.45', '1', '2ish', 'half six', '12.30', '10'],
  'cx.food': ['pizza', 'a curry', 'chips', 'Wagamama', 'a roast', 'the chippy', 'Nando\'s', 'sushi', 'kebabs', 'fish finger sandwiches'],
  'cx.emoji': ['', '', '', ' x', ' 😂', ' 🙈', ' 🙃', ' haha', ' lol', ' 😭'],
  'chat.flat': [
    'Who has left the oven on again? Not mad. A bit mad.', 'Bins out please, it is our turn and I am not doing it solo again', 'Heating man is coming {#cx.day#} between 8 and 6. Someone has to be in!', 'Did someone move my shelf in the fridge? It was MY shelf',
    'Landlord says the mould is "condensation". I am going to send him a photo of the bathroom ceiling', 'Anyone want anything from Aldi? Going now', '{#cx.food#} {#cx.day#}? I am not cooking', 'Can the person who showers for 40 mins at 7am please share their secret, I need to leave for work',
    'Rent is due in 2 days, don\'t be like last month 🙏', 'Whoever has my charger I will pay in biscuits', 'Friend staying {#cx.day#}, ok? Sofa only', 'Wifi is down again. Have turned it off and on. Have cried. Not helped.', 'We are out of loo roll. This is not a drill.',
    'Who is that on the doorbell cam at 3am, it looks like a fox in a hat', 'Cleaning rota is on the fridge. Please. It is a laminated document.',
  ],
  'chat.family': [
    'Dinner at ours {#cx.day#}, {#cx.time#}. Bring nothing. (Bring pudding.)', 'Has anyone heard from Gran? She did not pick up', 'Happy birthday!! 🎂 Hope it is a good one', 'Look at this photo of the baby. Look at those cheeks.', 'Is anyone driving up on Sunday? Car is in the garage again',
    'Dad has sent another voicemail. It is 4 minutes of him walking.', 'Did you get the form for the hospital? I can drop it round', 'Just checking you all got home ok x', 'Can someone explain to me how to turn the camera on? Love, Mum', 'Proud of you all. That is all. Going now.',
    'Weather terrible. Stay in! Soup on if you need it.', 'The cat has had the kittens!! Four of them. Nobody tell Dad he is a grandfather.', 'What do we all think about Christmas? I will not decide on my own. I will decide on my own.',
  ],
  'chat.friends': [
    '{#cx.food#} {#cx.day#}? Need to see actual faces', 'Dying. Out last night. Never again (see you Friday)', 'Honestly the way he looked at me. I need a debrief.', 'Who is coming Saturday? Need numbers so I can lie to the restaurant', 'Running 10 mins late, order me a drink and tell no one',
    'Sent you a link, please do not open it at work', 'I have news and you are all going to be weird about it', 'Anyone fancy the quiz {#cx.day#}? We lost last time but we were robbed on the music round', 'Missing you all. Come to mine. I will make something with pasta.',
    'You free for a call tonight? Nothing bad. Just need my people.', 'Wedding RSVP is due. Are we going? Don\'t make me decide alone', 'Rail replacement bus. I repeat: rail replacement bus. Start without me.', 'Photos from last weekend are up. I look like a startled owl in all of them',
  ],
  'chat.school': [
    'Does anyone know if the trip money is due {#cx.day#} or is it the 14th?', 'Is it non-uniform day tomorrow or have I imagined it', 'Lost property now has what appears to be an entire second school in it', 'Anyone going to the PTA meeting? Need moral support and a seat by the door',
    'What time is pick-up on {#cx.day#}? The letter says two different things.', 'Whoops. Wrong group. Please ignore the thing about the wine.', 'Can anyone have {b.first} for an hour after school? Work has gone mad', 'Cake sale on Friday. I have signed up for "something sensible". I will bring shop-bought.',
    'Nits. Check your kids. That is all.', 'Anyone got the spelling list? Little one says "teacher didn\'t say"', 'Thank you to whoever dropped off the PE kit. You are a hero.', 'World Book Day costumes. Help. I am not a person who sews.',
  ],
  'chat.five': [
    'Pitch is booked {#cx.day#} {#cx.time#}. Need 10. Reply now or be benched.', 'Who has the bibs? Please say not me', 'Carl is injured again, which means the entire left flank is a rumour', 'Pub after? Yes. Obviously yes.', 'Anyone have a spare pair of size 9 boots? Left mine in the car at my mum\'s',
    'We lost 7-2. Defence was "a concept".', 'Match fee £3.50 each. Pay me or be banished.', 'Who is the man who turned up in jeans?', 'Floodlights are out. Back to jumpers for goalposts.', 'Great game tonight lads. Back at it Thursday.',
  ],
  'chat.residents': [
    'Reminder that the residents\' meeting is {#cx.day#} at the community centre. Agenda is parking, bins and the lift. In that order.', 'Has the lift been fixed? Management say yes. The lift says no.', 'Skip arriving on {#cx.day#}, space for bulky waste. Please do not put fridges in it.',
    'Report any fly-tipping to the council and tag the ward councillor. Pictures please.', 'We got the grant! £400 for planters. Anyone want to help dig?', 'Someone has been leaving the main door unlocked. Please make sure it clicks shut.', 'Winter gritting list: who can do the steps at No. 12 and No. 14?',
    'Thanks to everyone who came to the clean-up. 14 bags. A shopping trolley. A traffic cone, which is now in the hall.',
  ],
  'chat.work': [
    'Anyone know when the new rota is out?', 'Can someone cover {#cx.day#}? Will owe you', 'Meeting moved AGAIN. I have learned to hold my life lightly.', 'Printer is jammed. It is not me. It has never been me.', 'Lunch? Escape?', 'Well done everyone today, that was a nightmare and we survived',
    'Manager wants a word with whoever left the fridge like that. It was not me. It was Dave.', 'Leaving drinks for Sandra, {#cx.day#} at the pub. Card is going round.',
  ],
  'chat.faith': ['Reminder: service at 10.30, tea afterwards. Bring a friend.', 'Please remember Mrs Okoro in your prayers. She is back from hospital.', 'Volunteers needed to set up chairs for Sunday.', 'Thank you to everyone who came to the food bank collection. 62 bags!', 'Youth group is on {#cx.day#}. Snacks welcome.'],
  'chat.dm': [
    ...V('teen', 'u up?', 'omg did u see what she posted', 'can u come to mine after school', 'mum said no. again.', 'tell me everything'),
    ...V('student', 'pub?', 'are you in the library or the other library', 'I have not eaten since 11. Send food', 'did you do the reading? Be honest', 'night out saturday??'),
    ...V('young_pro', 'Free for a quick call?', 'Running late, start without me', 'Can we do Thursday instead? Work has eaten me', 'Got your message, will reply properly tonight, promise', 'Saw this and thought of you'),
    ...V('parent', 'Can you get him from football? Stuck at work.', 'Home by 6. Pasta?', 'The school have sent another email. I will forward it so we can both be confused', 'Did we pay the nursery? I cannot remember'),
    ...V('retiree', 'Hello love, just checking you are all right. No need to ring back.', 'Did you get my card? The post is dreadful.', 'Saw Margaret at the bus stop. She asks after you.', 'Please tell me how to stop it auto-correcting my name.'),
    ...V('adult', 'You free to talk later?', 'Quick question about the car.', 'Thanks for yesterday, really needed that.', 'Running late. Start without me.'),
  ],
};

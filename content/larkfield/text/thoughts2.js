// More inner thoughts (genre 'thought'), widening the pools in thoughts.js with real places and the time of year. See thoughtFor() in ui/describe.js.
const M = (band, ...ts) => ts.map((t) => ({ t, when: { moodband: band } }));
const Sn = (season, ...ts) => ts.map((t) => ({ t, when: { season } }));
export default {
  'thought.idle': [
    'Could murder #lx.food#. Could also not leave the sofa.', 'The light at {v.park} at this time of day is doing something to me.', 'Walked past {v.cafe} and the smell nearly had me.', 'Must remember to ring about the thing. What thing. The thing.', 'There is a particular silence on {p.street} on a {when|dow} afternoon.', 'Half the street is in, half is out. I am neither.',
    'A pint at {v.pub} would sort it. A pint at {v.pub} would also not sort it.', 'I know the bus times by heart now. This is not a skill.', 'Could do with a day where nobody needs anything from me. Even a short one.', 'Wonder if {v.shop} still has those biscuits.', 'Somebody should write a poem about the 52.',
    ...Sn('winter', 'Dark again. The street looks like a stage set with the lights half down.', 'Everyone wearing the same coat. Nobody says anything.', 'The radiator ticks. The house settles. Fine.'),
    ...Sn('summer', 'Windows open, whole street audible. I know what everyone is having for tea.', 'Too hot to think, so I am not thinking.', 'Light till ten. Where did the time go.'),
    ...Sn('spring', 'The blossom is out and so is every allergy on the street.', 'Lighter evenings. Suddenly I have energy and nowhere to put it.'),
    ...Sn('autumn', 'Leaves, conkers, the smell of somebody else\'s fireplace. Back to normal, then.', 'The clocks go back and so does my will.'),
  ],
  'thought.work': [
    'The kettle has more of a social life than I do at {r.2-4}pm.', 'Nobody tells you how much of a job is just waiting for other people.', 'Half past ten and I have already done an impression of working.', 'One more meeting and then I will start the actual work. Said that at nine.',
    ...M('low', 'It would be nice to be good at this again. Or at least to be noticed being bad.', 'Counting the hours the way you count steps on a very long staircase.'),
    ...M('high', 'Good day at work. Ridiculous, but I will take it.', 'Got something finished. Genuinely finished. I shall tell the cat.'),
  ],
  'thought.commute': ['Standing, again. The man next to me is eating something I can smell from here.', 'Late bus, loud phone, and a child who has opinions about the route.', 'The view from the top deck: rooftops, chimney pots, a pigeon in a puddle.', 'Passed {v.park} on the way, and it looked so green I almost got off.', 'Gave up my seat to a woman who gave me a look that said she had not asked.'],
  'thought.money': ['Went to {v.shop} for milk and spent £{r.14-27}. Nobody told me about the milk.', 'Added up the week. It came to a number I do not like.', 'Could do with a lucky break. Or a smaller bill.', 'There is a particular sound a card makes when it declines. I know it too well.'],
  'thought.lonely': ['Talked to the man in {v.shop} for {r.2-5} minutes. Longest conversation of the day.', 'The street is full of lit windows and I do not know anyone behind most of them.', 'Wonder what the people in the flat above are like. I only know their footsteps.', 'Would love a knock on the door right now. Even the delivery driver.'],
  'thought.home': ['Need to clean the oven. I will clean the oven. I will do it on the weekend. I said that last month.', 'The pile on the chair has become a piece of furniture.', 'Heating on for twenty minutes, then off. I am a bill-saving machine.', 'Someone is cooking with a lot of garlic and I am deeply in favour.'],
  'thought.family': ['Rang home. Nobody picked up. They are probably at {v.shop}. Or asleep. Or both.', 'The kids are quiet. That is never good news.', 'Should plan something for the weekend. A plan, any plan, with a park in it.'],
  'thought.night': ['Hearing every pipe in the house. They all have things to say.', 'Quarter past {r.2-4}. A fox, a siren, and my mind going round the same three things.', 'The streetlight outside is orange and wrong and I have got used to it.'],
};

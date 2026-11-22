// Generic street-life observations for the feed, assembled from small typed pools (smells, sights, sounds, people, small injustices) and real places.
// Together with the voice pools in daily.js this keeps a feed of tens of thousands of posts from reading alike. Voice-neutral, British, mundane, true to nothing in particular.
const A = (...a) => a;
export default {
  'g.smell': A('frying onions', 'fresh bread', 'wet dog', 'cut grass', 'curry', 'chip fat', 'bleach', 'woodsmoke', 'toast', 'someone\'s barbecue', 'warm bins', 'coffee', 'rain on hot pavement', 'laundry sheets', 'fabric softener', 'a chicken shop', 'damp leaves', 'a bonfire', 'diesel', 'cinnamon'),
  'g.crowd': A('a man with a trolley full of toilet roll', 'two pigeons and a pram', 'a woman carrying a lamp', 'three lads on one scooter', 'a toddler in a dinosaur costume', 'a delivery driver talking to a cat', 'a pensioner on a mobility scooter doing at least twenty', 'a group of schoolkids sharing one bag of chips', 'a man in a full suit eating an ice cream', 'a lady with a shopping trolley and a plan', 'a runner in shorts in {r.1-6} degrees', 'a bloke walking a very small dog in a very large coat', 'a cyclist with a Christmas tree', 'two builders arguing about a sandwich', 'a woman with a violin case and a baguette', 'a lad dribbling a football down the middle of the road'),
  'g.sound': A('a bin lorry at {r.6-7}am', 'next door\'s washing machine on spin', 'somebody practising the trumpet', 'a baby that is not mine', 'a car alarm that nobody owns', 'a drill from three doors down', 'the ice cream van playing the same {r.4-9} notes', 'two foxes having an argument', 'a siren, going somewhere else', 'the 52 hissing at the stop', 'church bells at the wrong time', 'an upstairs neighbour moving furniture at {r.10-11}pm'),
  'g.nuis': A('a trolley abandoned outside {v.shop}', 'a sofa on {p.street}', 'a bike with no wheels chained to the railings on {v.street}', 'a mattress propped on the wall by {v.park}', 'a broken umbrella on every corner', 'a bus shelter with no glass', 'a pothole the size of a tea tray on {p.street}', 'a "temporary" sign that has been there since {r.2-9} months', 'a traffic cone on the {v.pub} roof', 'fly-tipping behind {v.shop}', 'a shopping bag hung in a tree'),
  'g.verdict': A('Not complaining. Just noting.', 'Make of that what you will.', 'A normal {when|dow} in Larkfield.', 'You could not make it up.', 'Only here.', 'Nobody else saw it, which is a shame.', 'I do love this place, mostly.', 'Written down for the record.', 'The neighbourhood never gets boring.', 'And people say nothing happens.', 'I shall be telling the grandchildren.', 'Anyway.', 'Typical {when|dow}.', 'Just a small thing, but it made me smile.', 'It was a lot, at {r.8-9}am.', 'Everyone behaved as if this was normal.', 'And that was before breakfast.', 'I did not have bingo for that one.', 'Right, tea.', 'No further comment.'),
  'g.time': A('this morning', 'on the way home', 'on my lunch', 'at {r.6-9}pm', 'at half past {r.6-9}', 'just now', 'earlier', 'about {r.5-9}am', 'this afternoon', 'at {r.9-11} last night'),
  'g.scene': A(
    'Walked down {v.street} #g.time# and it smelled of #g.smell#. Passed #g.crowd#.',
    'Heard #g.sound# #g.time#. Saw #g.nuis#. Larkfield in a nutshell.',
    'The queue at {v.shop} #g.time# was {r.5-19} people deep. Behind me: #g.crowd#.',
    'On {p.street} #g.time#: #g.crowd#. Also #g.nuis#.',
    'Spotted #g.crowd# outside {v.shop}. Nobody blinked.',
    'The whole of {p.street} smells of #g.smell# today. Possibly also #g.smell#.',
    'Someone has left #g.nuis#. I have been looking at it since {r.7-9}am.',
    'Sat outside {v.cafe} #g.time#. Watched #g.crowd# go past. Hard to beat.',
    'There is #g.nuis# by {v.park} and #g.sound# every time I walk past. We cope.',
    'Cut through {v.park} #g.time#. Met #g.crowd#. Heard #g.sound#.',
    'The corner of {p.street} and {v.street}: #g.nuis#, #g.crowd#, and #g.smell#. Never quiet.',
    '#g.sound|cap# at {r.1-5}am again. I am now fluent in the sounds of {p.street}.',
    'Overheard #g.time# at {v.cafe}: "I told him, I said, I will not be doing that." Never found out what.',
    'The man at {v.shop} remembered my order #g.time#. I do not know whether to be flattered or worried.',
    'Went to {v.shop} for one thing and came out thinking about #lx.food#.',
    '{v.street} is lovely #g.time#: #g.smell#, a bit of sun, #g.crowd#.',
    'Someone has been feeding the pigeons outside {v.library} again. They are now in charge.',
    'The bench by {v.park} has been taken over by #g.crowd#. I walked around it.',
    '#lx.nuisance|cap# again on {p.street}. I have written to the council. It has been {r.2-6} weeks.',
    'Told the barista at {v.cafe} my name was {a.first}. It has been {r.3-9} visits and they still write something else.',
  ),
};

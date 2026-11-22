// Fold-up lines for days when many events of one kind land together (ui/host.js onEvent): the third and later become one summary item.
// Slots: {p.street} the street of the latest case, {p.month}, {p.n} how many so far today. All variants are true of the real batch (nothing here claims a particular person).
const T = (heads, bodies) => ({ head: heads, body: bodies });
const SETS = {
  'health.episode': T(['More people are finding things hard', 'A hard stretch for a few households', 'Low spells on {p.street} and beyond', 'Quiet struggles across the patch'],
    ['The GP surgery says appointments are filling, with {p.street} among the roads it is hearing from.', 'Several residents have been signed off or have asked for help this {p.month}. Neighbours are being asked to knock on doors.', 'Surgery staff say they are seeing more people than usual for low mood and worry, and that asking early helps.']),
  'money.arrears': T(['More households fall behind on rent', 'Rent day leaves a few households short', 'Rent arrears creeping up, {p.street} among them', 'Short at the end of the month'],
    ['Rent day came and went with several households short. Landlords and advice centres are both getting calls, and {p.street} is not the only road affected.', 'Advice workers say the arrears queries are mostly from people who have never missed a payment before.', 'A run of missed rent payments this {p.month}. Most are expected to be caught up soon, but not all.']),
  'money.cost_pressure': T(['The cost of living bites again', 'Budgets stretched thin this {p.month}', 'Households on {p.street} say the money no longer lasts', 'The weekly shop is the new worry'],
    ['More households say the budget no longer stretches to the end of the month. Food and energy are mentioned most.', 'People on {p.street} and nearby are cutting back on heating and takeaways to make the numbers work.', 'Money worries came up at the school gate and in the chip shop queue this week, in roughly equal measure.']),
  'money.debt_spiral': T(['More borrowing to cover the basics', 'Credit cards and catalogues quietly filling up', 'People are borrowing just to get by', 'Debt advice phone lines busy'],
    ['Advice workers report a rise in people borrowing to pay for essentials, with a few cases from {p.street}.', 'Several households have started using credit for food and bills this {p.month}. The advice centre says the earlier they ring, the better.', 'It is not luxuries: more borrowing is going on rent, the electric and school uniform.']),
  'labour.second_job': T(['Extra shifts and second jobs', 'More people picking up a second job', 'Evenings and weekends turn into work', 'Two jobs to make one wage'],
    ['More residents are picking up evening and weekend work to make ends meet, including a few from {p.street}.', 'Employers on the high street say they have never had so many applications for part-time shifts.', 'Tired but practical: several people say the extra hours are the only way the rent gets paid.']),
  'housing.moved_out': T(['Several households move on', 'Vans and boxes this week', 'For-let boards going up on {p.street}', 'A run of moves out of the area'],
    ['A run of moves this week: vans, boxes and for-let boards on the street, with {p.street} seeing a few.', 'Lettings agents say a handful of tenancies have ended at once and the flats will be back on the market soon.', 'Neighbours report a lot of cardboard and a lot of goodbyes this week.']),
  'housing.moved_in': T(['New neighbours arrive', 'Welcome mats out on {p.street}', 'New faces on the street', 'Several new households settle in'],
    ['Several new households have moved onto the streets this week, with {p.street} gaining a few.', 'There are fresh names on doorbells and a few people on the pavement asking where the nearest shop is.', 'The welcome wagon, in the form of whoever is out walking a dog, is already at work.']),
  'social.scandal': T(['Talk of the town', 'Tongues wagging on {p.street}', 'Gossip at the school gate', 'The week\'s whispers'],
    ['A few names are doing the rounds at the school gate and the pub this week. Nobody wants to be the one who started it.', 'The people talking on {p.street} swear they heard it from someone else.', 'No names here, but the chip shop queue and the launderette have both had a good week.']),
  'social.rumour': T(['Whispers on the street', 'Rumours going round', 'Half-heard stories this {p.month}', 'The grapevine is busy'],
    ['Several rumours are going round at once. Most will be forgotten by Friday.', 'By the time it reaches {p.street}, a story has usually been through three people and grown a bit.', 'Some of it is true and some of it is not. Nobody is checking.']),
  'god.rent_letters': T(['Rent letters all over Larkfield', 'The same rise lands across the patch', 'Doorstep comparisons of rent letters', 'Letters from landlords, all at once'],
    ['The same rise has landed on households across the neighbourhood. Letters are being compared on doorsteps and in the group chats.', 'From {p.street} outwards, people are reading the same figure twice. Advice centres expect a busy week.', 'Tenants say the timing is no coincidence; landlords say it is routine.']),
};
const rules = {};
for (const [k, v] of Object.entries(SETS)) { rules['batch.head:' + k] = v.head; rules['batch.body:' + k] = v.body; }
rules['batch.moved'] = ['{a.first} changes address', '{a.first} swaps one front door for another', 'Boxes and a van: {a.first} moves house', '{a.first} is moving, but only {p.where}', 'Down the road with the sofa: {a.first}'];
rules['batch.moved.body'] = ['{a.first} is staying in the area, just not at the old address. A few doors, or a few streets, along.', 'Not far to go, and the new neighbours on {p.street} are already being looked over.', '{a.first} has not gone anywhere, only a few streets along to {p.street}.', 'The removal van was spotted going {p.where}. {a.first} is still local.'];
export default rules;

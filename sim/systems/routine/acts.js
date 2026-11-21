// Activity vocabulary of the routine (habit) layer. cat: sleep|work|commute|errand|out|social|home|chores|care|eat
// Entry in a person's plan = [tick, act, ptype, pid, aux]; ptype: 0 home, 1 building (pid = building id), 2 street near home, 3 off-map (pid = dest index), 4 transit (pid = dest*8+mode)
export const ACTS = [
  ['build', '', 'home'], ['sleep', 'Asleep', 'sleep'], ['getup', 'Getting up and ready', 'home'], ['commute', 'Commuting', 'commute'], ['work', 'At work', 'work'], ['work_home', 'Working from home', 'work'],
  ['school', 'At school', 'work'], ['nursery', 'At nursery', 'work'], ['uni', 'Studying', 'work'], ['school_run', 'On the school run', 'care'], ['lunch', 'Having lunch', 'eat'], ['breakfast', 'Having breakfast', 'eat'],
  ['dinner', 'Cooking and eating dinner', 'eat'], ['shop', 'Shopping', 'errand'], ['errand', 'Running an errand', 'errand'], ['cafe', 'At the cafe', 'out'], ['pub', 'At the pub', 'out'], ['gym', 'At the gym', 'out'],
  ['park', 'Out in the park', 'out'], ['worship', 'At worship', 'out'], ['community', 'At the community centre', 'out'], ['library', 'At the library', 'out'], ['visit', 'Visiting a friend', 'social'],
  ['offsocial', 'Out in the city with friends', 'social'], ['nightout', 'On a night out in the city', 'social'], ['family_off', 'Visiting family elsewhere', 'social'], ['retail_trip', 'On a shopping trip', 'out'],
  ['tv', 'Watching TV', 'home'], ['gaming', 'Gaming', 'home'], ['phone', 'On the phone / scrolling', 'home'], ['chores', 'Doing housework', 'chores'], ['childcare', 'Looking after the children', 'care'], ['homework', 'Doing homework', 'home'],
  ['nap', 'Having a rest', 'sleep'], ['rest', 'Relaxing', 'home'], ['garden', 'In the garden / on the allotment', 'home'], ['bedtime', 'Winding down for bed', 'home'], ['study', 'Studying at home', 'work'], ['jobsearch', 'Sorting out paperwork and job search', 'chores'],
  ['carer', 'Caring for a relative', 'care'], ['sick', 'Unwell at home', 'home'], ['play', 'Playing', 'home'], ['sleep_day', 'Sleeping after a night shift', 'sleep'], ['night_work', 'On a night shift', 'work'], ['online', 'Online with friends', 'home'],
  ['goal', 'Pursuing something', 'out'], ['takeaway', 'Collecting a takeaway', 'errand'], ['business', 'Running the business', 'work'], ['cook', 'Cooking', 'chores'],
];
export const A = Object.fromEntries(ACTS.map((a, i) => [a[0], i]));
export const ACT_LABEL = ACTS.map((a) => a[1]);
export const ACT_CAT = ACTS.map((a) => a[2]);
export const MODES = ['walk', 'cycle', 'bus', 'rail', 'drive'];
export const MODE_IDX = { walk: 0, cycle: 1, bus: 2, rail: 3, drive: 4 };
export const MODE_VERB = ['Walking', 'Cycling', 'On the bus', 'On the train', 'Driving'];
export const STRIDE = 5;

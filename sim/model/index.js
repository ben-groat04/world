// Person/field schema registry (ROADMAP 3.6 #7). Fields added to a person record must be declared here with their owner system;
// writes only by the owner (or through commands). `checkPerson(p, {strict})` reports undeclared keys (used by tests/schema checks).
// The medieval person record (sim/person.js) is declared as owner 'core' / legacy systems; new systems call declareField at init.
const FIELDS = new Map();
/** declareField('goals', {owner:'goals', type:'object', doc:'...', tier:'cold'|'hot'}) -> registers; re-declaring with a different owner throws. */
export function declareField(name, def) {
  if (!def || typeof def.owner !== 'string') throw new Error(`declareField(${name}): owner (system name) required`);
  const prev = FIELDS.get(name);
  if (prev && prev.owner !== def.owner) throw new Error(`person field '${name}' is owned by '${prev.owner}', not '${def.owner}'`);
  FIELDS.set(name, { name, type: def.type || 'any', doc: def.doc || '', owner: def.owner, hot: def.tier === 'hot' });
  return FIELDS.get(name);
}
export const fieldOwner = (name) => (FIELDS.has(name) ? FIELDS.get(name).owner : null);
export const listFields = () => [...FIELDS.values()];
const CORE = ['id', 'firstName', 'lastName', 'sex', 'birthTick', 'alive', 'deathTick', 'causeOfDeath', 'x', 'y', 'path', 'pathIdx', 'locationId', 'inside', 'homeId', 'workId', 'job', 'genes', 'personality', 'traits', 'interests', 'values', 'skills', 'needs', 'mood', 'moodlets', 'moodletSum', 'health', 'illness', 'money', 'inventory', 'reputation', 'relationships', 'family', 'romance', 'memories', 'rumors', 'pregnant', 'jailedUntil', 'currentAction', 'thought', 'lastAction', 'cooldown', 'nextThink', 'wake', 'lastMeal', 'starve', 'workedTicks', 'cell', 'needsTick', 'seg', 'segTick', 'speed', 'schedule', 'ext', 'bubble', 'needRate', 'tier'];
for (const k of CORE) declareField(k, { owner: 'core', doc: 'medieval core record' });
for (const k of ['_talkCount', '_lastTalk', '_thoughtTick', '_nextTalk', 'cliqueId', '_hang', '_visitFriendId', 'drunk', '_nm']) declareField(k, { owner: 'social', doc: 'legacy social' });
for (const k of ['debt', 'creditorId', 'lastWorkId', 'homemaker']) declareField(k, { owner: 'economy', doc: 'legacy economy' });
for (const k of ['maidenName', 'widowed', '_pregRumor', '_dyingOfMother']) declareField(k, { owner: 'family', doc: 'legacy family' });
declareField('econ', { owner: 'economy', doc: 'legacy economy' }); declareField('orientation', { owner: 'romance', doc: 'legacy romance' }); declareField('crime', { owner: 'crime', doc: 'legacy crime' });
for (const k of ['graveId']) declareField(k, { owner: 'health', doc: 'legacy health' });
for (const k of ['emigrated', 'emigratedTick', 'emigratedTo']) declareField(k, { owner: 'migration', doc: 'legacy migration' });
for (const k of ['_speechPending']) declareField(k, { owner: 'politics', doc: 'legacy politics' });
for (const k of ['_playerNotified']) declareField(k, { owner: 'core', doc: 'ui' });
/** Returns the list of undeclared keys on p (empty = ok). New systems must declareField before writing a new top-level key. */
export function checkPerson(p) { const bad = []; for (const k of Object.keys(p)) if (!FIELDS.has(k)) bad.push(k); return bad; }

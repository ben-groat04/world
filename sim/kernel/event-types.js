// Event type registry. New-style types need an entry (unknown types throw when world.strictEvents is true, which the test/check
// harness turns on). Packages register their own: registerEventType('life.birth', {payload:{...}, template:'life.birth'}).
// Names are 'domain.verb'. Legacy payload-style events of the medieval systems are registered {legacy:true}: they are dispatched
// synchronously with the raw payload exactly as before and are not stored in the event log.
export class EventRegistry {
  constructor() { this.map = new Map(); }
  register(type, def = {}) {
    if (typeof type !== 'string' || !type) throw new Error('event type must be a non-empty string');
    const prev = this.map.get(type);
    if (prev && !prev.legacy && !def.legacy && JSON.stringify(prev.payload) !== JSON.stringify(def.payload)) throw new Error(`event type ${type} already registered with a different schema`);
    this.map.set(type, { type, payload: def.payload || null, template: def.template || type, legacy: !!def.legacy, doc: def.doc || '' });
    return this;
  }
  has(type) { return this.map.has(type); }
  get(type) { return this.map.get(type); }
  list() { return [...this.map.keys()]; }
}
export const LEGACY_EVENT_TYPES = ['tick', 'hour', 'day', 'season', 'year', 'actionStart', 'actionEnd', 'arrive', 'death', 'chronicle', 'buildingAdded', 'intervention', 'birth', 'pregnancy',
  'marriage', 'divorce', 'dating', 'engagement', 'affair', 'breakup', 'romanceOffer', 'scandal', 'crime', 'arrest', 'conviction', 'jobChange', 'moveHome', 'immigrate', 'emigrate', 'election', 'speech', 'rumor',
  'relationshipChange', 'conversation', 'encounter', 'outbreak', 'outbreakEnd', 'recovered', 'funeral', 'fire', 'disaster', 'festival', 'festivalEnd', 'sermon', 'miracle', 'bankruptcy', 'businessOpened'];
/** Built-in new-style kernel event types. */
export const CORE_EVENT_TYPES = {
  'legacy.chron': { payload: { entryId: 'number' }, template: 'legacy.chron', doc: 'Adapter: every old chronicle.add() entry. actors=people, place=buildingId, salience=importance/5, tags=[type]' },
  'kernel.command': { payload: { name: 'string' }, template: 'kernel.command', doc: 'A queued command executed' },
  'kernel.stage': { payload: { stage: 'string' }, template: 'kernel.stage', doc: 'A person changed life stage (index maintenance)' },
};
export function makeRegistry() {
  const r = new EventRegistry();
  for (const t of LEGACY_EVENT_TYPES) r.register(t, { legacy: true });
  for (const [t, d] of Object.entries(CORE_EVENT_TYPES)) r.register(t, d);
  return r;
}

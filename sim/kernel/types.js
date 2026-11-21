// Kernel JSDoc types + frozen constants. FROZEN INTERFACE (Wave 0): signatures here are stable; extend, never rename.
// Import for IDE help only:  /** @typedef {import('./types.js').EventRecord} EventRecord */
export const CONTRACT_VERSION = '1.0.0';
/** Fidelity tiers (LOD). T0 = observed/featured, T1 = full agenda sim, T2 = statistical/lazy, T3 = off-map aggregate. */
export const TIER = Object.freeze({ T0: 0, T1: 1, T2: 2, T3: 3 });
/** Clock names a plugin may register under `clocks`. */
export const CLOCKS = Object.freeze(['hour', 'day', 'week', 'month', 'year']);

/**
 * @typedef {Object} EventInput   what you pass to world.emit(type, input) for a registered (new-style) event type
 * @property {number[]} [actors]  person ids involved (first = subject)
 * @property {number[]} [objects] other ids (buildings, orgs, items) in the order the event type's schema documents
 * @property {number|null} [place] building/venue id
 * @property {string[]} [tags]
 * @property {number} [cause]     id of the causing event (0/undefined = none); powers world.events.query({cause})
 * @property {number} [salience]  0..1 narrative weight (default 0.1); the gazette/arc sifter reads this
 * @property {Object} [payload]   small JSON-able data; NO formatted strings (text is rendered at read time)
 *
 * @typedef {Object} EventRecord  stored form (returned by world.events.get / query)
 * @property {number} id @property {string} type @property {number} tick @property {number[]} actors @property {number[]} objects
 * @property {number|null} place @property {string[]|null} tags @property {number} cause @property {number} salience @property {Object|null} payload
 *
 * @typedef {Object} EventTypeDef
 * @property {Object<string,string>} [payload]  payload field -> 'number'|'string'|'boolean'|'object'|'any' (checked in dev/test mode)
 * @property {string} [template]  text template key (rendered by world.text.render)
 * @property {boolean} [legacy]   true = old synchronous payload-style event (systems/ medieval code); do not use for new code
 * @property {string} [doc]
 *
 * @typedef {Object} Plugin       sim/systems/<x>/index.js default export
 * @property {string} name  @property {string} version  @property {string[]} [deps]
 * @property {(world:any, pack:any)=>void} [init]
 * @property {{hour?:Function,day?:Function,week?:Function,month?:Function,year?:Function}} [clocks]  each (world, time) -> void
 * @property {Object<string,(world:any, ev:EventRecord)=>void>} [on]  EventType -> handler (runs after the emitting step, never re-entrantly)
 * @property {Object<string,string[]>} [events]  {emits:[types], listens:[types]} documentation used by contract tests
 * @property {(person:any, ctx:any)=>Affordance[]} [affordances]  pure, read-only
 * @property {Object<string,Function>} [query]   read-only API for other systems: world.sys.<name>.query.fn(...)
 * @property {Object<string,(world:any, args:any, cmd:any)=>any>} [commands]  commands this system owns (world.cmd / queueCommand)
 * @property {()=>any} [serialize]  @property {(state:any, version:string)=>void} [deserialize]  @property {(fromVersion:string, state:any)=>any} [migrate]
 *
 * @typedef {Object} Affordance
 * @property {string} id @property {string} verb @property {number} actor @property {number} [target]
 * @property {Array<(world:any, a:Affordance)=>boolean>} [preconds]
 * @property {Array<Effect>} [effects]
 * @property {{time?:number, money?:number, energy?:number, social?:number}} [cost]
 * @property {{full?:Function, statistical?:Function}} [resolver]  @property {string[]} [tags]
 *
 * @typedef {{kind:'emit', type:string, input:EventInput}|{kind:'transfer', from:any, to:any, amount:number, reason:string}|{kind:'cmd', name:string, args:any}|{kind:'rel', a:number, b:number, delta:Object}|{kind:'belief', actor:number, belief:Object}|{kind:'set', system:string, args:any}} Effect
 *
 * @typedef {Object} Command   world.queueCommand(cmd) / log entry
 * @property {number} [tick] executes at the start of the step following this tick (default: now)  @property {'god'|'player'|'policy'|number|string} actor
 * @property {string} name  @property {any} args (JSON-able)  @property {number} [seq] assigned on queue
 *
 * @typedef {Object} Pack   content pack (content/<id>/index.js default export), validated by sim/kernel/schema.js
 * @property {string} id @property {string} version @property {string} contractVersion
 *
 * @typedef {Object} Snapshot @property {number} v @property {number} tick @property {Object<string,{v:string,state:any}>} systems @property {Object} [arrays]
 */
export {};

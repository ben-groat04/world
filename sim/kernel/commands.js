// Command queue + log + replay. ALL player/god/policy actions go through world.queueCommand({tick?, actor, name, args}).
// Commands execute at the START of the next step (world.step) or immediately when queued between steps with tick <= world.tick.
// Every executed command is appended to world.commands.log; replay = same seed + pack + this log (see replay()).
// Owners register handlers: world.registerCommand('name', (world, args, cmd) => result). Plugins declare them in `commands`.
export class CommandBus {
  constructor(world) { this.world = world; this.handlers = new Map(); this.pending = []; this.log = []; this.seq = 0; this.running = false; }
  register(name, fn) { if (this.handlers.has(name)) throw new Error(`command '${name}' already has an owner`); this.handlers.set(name, fn); }
  has(name) { return this.handlers.has(name); }
  /** Queue (and, if due and the world is between steps, run now). Returns the handler result when run immediately, else the seq. */
  queue(cmd) {
    const c = { tick: cmd.tick ?? this.world.tick, actor: cmd.actor ?? 'god', name: cmd.name, args: cmd.args === undefined ? {} : cmd.args, seq: ++this.seq };
    if (!this.handlers.has(c.name)) throw new Error(`unknown command '${c.name}'`);
    this.pending.push(c);
    if (!this.world._inStep && c.tick <= this.world.tick) { const r = this._run(c); this.pending.splice(this.pending.indexOf(c), 1); return r; }
    return c.seq;
  }
  /** Run due commands (called at the start of each step). */
  runDue() {
    if (this.pending.length === 0) return;
    this.pending.sort((a, b) => a.tick - b.tick || a.seq - b.seq);
    while (this.pending.length && this.pending[0].tick <= this.world.tick) this._run(this.pending.shift());
  }
  _run(c) {
    this.log.push(JSON.parse(JSON.stringify({ tick: this.world.tick, actor: c.actor, name: c.name, args: c.args, seq: c.seq })));
    const was = this.running; this.running = true;
    try { return this.handlers.get(c.name)(this.world, c.args, c); }
    finally { this.running = was; this.world.emit('kernel.command', { actors: typeof c.actor === 'number' ? [c.actor] : [], payload: { name: c.name } }); }
  }
  serialize() { return { seq: this.seq, log: this.log, pending: this.pending }; }
  restore(s) { this.seq = s.seq; this.log = s.log; this.pending = s.pending; }
}
/** Replay a command log on a fresh world: returns the world advanced to `ticks`. `makeWorld()` must build the same seed/pack/opts. */
export function replay(makeWorld, log, ticks) {
  const w = makeWorld();
  const sorted = [...log].sort((a, b) => a.tick - b.tick || a.seq - b.seq);
  for (const c of sorted) w.commands.pending.push({ ...c });
  w.commands.seq = sorted.reduce((m, c) => Math.max(m, c.seq), 0);
  w.replaying = true;
  w.commands.runDue(); // tick-0 commands
  while (w.tick < ticks) w.step();
  w.replaying = false;
  return w;
}

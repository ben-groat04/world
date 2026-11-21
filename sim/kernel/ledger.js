// Money ledger. world.ledger.transfer(from, to, amount, reason, causeEvent). Accounts: person id (number), 'b:<buildingId>', 'council', 'metropolis', 'void' (minting/sink, tracked).
// Legacy adapter: person accounts read/write p.money, building accounts b.funds, 'council' = world.town.treasury, so old systems and new code agree.
// Invariant: sum of all transfers is zero, so total(people+buildings+council+metropolis+void) is conserved; `void` balance records net mint/burn.
// Owner: systems/money (W1-C) will be the only writer; others call transfer(). Stub-quality history ring kept for audits.
export class Ledger {
  constructor(world, opts = {}) { this.world = world; this.cap = opts.cap || 4000; this.entries = []; this.n = 0; this.balances = { metropolis: 0, void: 0 }; this.volume = 0; }
  balance(acc) {
    const w = this.world;
    if (typeof acc === 'number') { const p = w.people.get(acc); return p ? p.money : 0; }
    if (acc === 'council') return w.town.treasury;
    if (typeof acc === 'string' && acc.startsWith('b:')) { const b = w.buildings.get(+acc.slice(2)); return b ? b.funds : 0; }
    return this.balances[acc] ?? 0;
  }
  _add(acc, d) {
    const w = this.world;
    if (typeof acc === 'number') { const p = w.people.get(acc); if (!p) throw new Error('ledger: no person ' + acc); p.money += d; }
    else if (acc === 'council') w.town.treasury += d;
    else if (typeof acc === 'string' && acc.startsWith('b:')) { const b = w.buildings.get(+acc.slice(2)); if (!b) throw new Error('ledger: no building ' + acc); b.funds += d; }
    else if (acc in this.balances) this.balances[acc] += d;
    else throw new Error('ledger: unknown account ' + acc);
  }
  /** Move `amount` (>0) from -> to. Throws on non-finite/negative. Overdrafts are allowed (debt) unless opts.noOverdraft. */
  transfer(from, to, amount, reason = '', cause = 0, opts = {}) {
    if (!(amount > 0) || !Number.isFinite(amount)) { if (amount === 0) return 0; throw new Error('ledger.transfer: bad amount ' + amount); }
    if (opts.noOverdraft && this.balance(from) < amount) return -1;
    this._add(from, -amount); this._add(to, amount);
    const id = ++this.n; this.volume += amount;
    this.entries.push({ id, tick: this.world.tick, from, to, amount, reason, cause });
    if (this.entries.length > this.cap) this.entries.splice(0, this.entries.length - this.cap * 0.9 | 0);
    return id;
  }
  /** Sum of all money in people, buildings, council, metropolis, void: must stay constant unless something mints/burns via 'void'. */
  total() {
    const w = this.world; let s = w.town.treasury + this.balances.metropolis + this.balances.void;
    for (const p of w.people.values()) s += p.money; for (const b of w.buildings.values()) s += b.funds;
    return s;
  }
  history(q = {}) { return this.entries.filter((e) => (q.account === undefined || e.from === q.account || e.to === q.account) && (q.reason === undefined || e.reason === q.reason)).slice(-(q.limit || 50)); }
  serialize() { return { balances: this.balances, n: this.n, volume: this.volume, entries: this.entries }; }
  restore(s) { this.balances = s.balances; this.n = s.n; this.volume = s.volume; this.entries = s.entries; }
}

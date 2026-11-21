// Double-entry money ledger (W1-C). Upgrades the kernel stub IN PLACE (so anything that captured world.ledger keeps working) with:
//   accounts: person id (number -> p.money, cash/overdraft), 'b:<buildingId>' (venue/business funds), 'council', 'metropolis' (the rest of the world), 'void',
//   'hmrc' (tax in / benefits out), 'o:<id>' orgs, 'e:<key>' off-map employers, 'l:<id>' landlords, 'h:<id>' household pots.
// Every transfer is integer pounds and zero-sum, so total() is conserved EXACTLY (invariant()). Only this module mutates balances.
import { Ledger } from '../../kernel/ledger.js';

const NAMED = /^(o|e|l|h):/;
export class MoneyLedger extends Ledger {
  static upgrade(world) {
    const L = world.ledger;
    if (L instanceof MoneyLedger) return L;
    Object.setPrototypeOf(L, MoneyLedger.prototype);
    L.balances.hmrc = L.balances.hmrc || 0; L.flows = {}; L.baseline = null; L.cap = 3000;
    return L;
  }
  balance(acc) { if (typeof acc === 'string' && !acc.startsWith('b:') && acc !== 'council') return this.balances[acc] || 0; return super.balance(acc); }
  _add(acc, d) {
    if (typeof acc === 'string' && (NAMED.test(acc) || acc === 'hmrc')) { this.balances[acc] = (this.balances[acc] || 0) + d; return; }
    super._add(acc, d);
  }
  /** Move `amount` pounds (rounded to integer; 0 is a no-op) from -> to. Returns the entry id (0 when nothing moved, -1 when noOverdraft refused). */
  transfer(from, to, amount, reason = '', cause = 0, opts = {}) {
    if (!Number.isFinite(amount) || amount < 0) throw new Error('ledger.transfer: bad amount ' + amount);
    amount = Math.round(amount); if (amount === 0 || from === to) return 0;
    if (opts.noOverdraft && this.balance(from) < amount) return -1;
    this._add(from, -amount); this._add(to, amount);
    const id = ++this.n; this.volume += amount;
    const k = reason.split(':')[0]; this.flows[k] = (this.flows[k] || 0) + amount;
    this.entries.push({ id, tick: this.world.tick, from, to, amount, reason, cause });
    if (this.entries.length > this.cap) this.entries.splice(0, this.entries.length - this.cap * 0.9 | 0);
    return id;
  }
  total() {
    let s = super.total();
    for (const k of Object.keys(this.balances)) if (k !== 'metropolis' && k !== 'void') s += this.balances[k];
    return s;
  }
  /** Exact conservation check: total() must equal the baseline recorded at the first call (births/deaths/arrivals move money only through transfers). */
  invariant() { const t = this.total(); if (this.baseline === null) this.baseline = t; return { ok: t === this.baseline, total: t, baseline: this.baseline, drift: t - this.baseline }; }
  serialize() { return { balances: this.balances, n: this.n, volume: this.volume, entries: this.entries.slice(-400), flows: this.flows, baseline: this.baseline }; }
  restore(s) { this.balances = s.balances; this.n = s.n; this.volume = s.volume; this.entries = s.entries; this.flows = s.flows || {}; this.baseline = s.baseline ?? null; }
}
export default MoneyLedger;

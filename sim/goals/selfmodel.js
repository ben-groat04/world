// Self-model: ~12 causal belief-weights per person (0..1). Biased credit assignment: successes are credited to the self (more so by the low-neuroticism), failures to others/luck/institutions or
// to the self depending on personality; salient outcomes of ties nudge beliefs too (social learning). Beliefs bias method choice (moves carry `bel`) and goal choice (templates carry `bias`).
import { clamp } from './util.js';
import { personalityZ, segmentOf } from './facts.js';
export class SelfModels {
  constructor(beliefs) { this.keys = Object.keys(beliefs); this.def = beliefs; this.idx = Object.fromEntries(this.keys.map((k, i) => [k, i])); }
  init(world, p, parentVec) {
    const z = personalityZ(p), seg = segmentOf(p), r = world.rngFor('goals.self', p.id), v = new Array(this.keys.length);
    for (let i = 0; i < this.keys.length; i++) {
      const d = this.def[this.keys[i]]; let x = d.start; for (const [t, w] of Object.entries(d.prior || {})) x += w * z[t]; if (seg && d.seg && d.seg[seg]) x += d.seg[seg];
      x += r.gauss(0, 0.07); if (parentVec) x = x * 0.65 + parentVec[i] * 0.35; v[i] = clamp(x, 0.03, 0.97);
    }
    return v;
  }
  get(ps, key) { const i = this.idx[key]; return i === undefined ? 0.5 : ps.self[i]; }
  nudge(ps, key, d) { const i = this.idx[key]; if (i === undefined) return 0; const o = ps.self[i], n = clamp(o + d, 0.02, 0.98); ps.self[i] = n; return n - o; }
  /** Own outcome. beliefs: keys linked to the method used. out: +1 success / -1 failure. why: failure reason. z: personality z-scores. */
  creditOwn(ps, beliefs, out, why, z, lr = 0.05) {
    for (const b of beliefs) {
      if (out > 0) { this.nudge(ps, b, lr * (0.8 + 0.1 * (-z.N))); if (b !== 'luck_decides') this.nudge(ps, 'luck_decides', -lr * 0.25 * (1 + z.C * 0.2)); }
      else {
        const selfBlame = clamp(0.35 + 0.18 * z.N - 0.1 * z.A * 0 + 0.1 * (z.C), 0.1, 0.8);       // neurotic/conscientious people blame themselves
        if (why === 'refused' || why === 'competition' || why === 'opposed') { this.nudge(ps, b, -lr * selfBlame); this.nudge(ps, 'people_trustworthy', -lr * (1 - selfBlame) * 0.6); }
        else if (why === 'bad_luck') this.nudge(ps, 'luck_decides', lr * 0.8);
        else this.nudge(ps, b, -lr * selfBlame);
        if (why === 'refused' && (b === 'asking_works')) this.nudge(ps, 'asking_works', -lr * 0.3);
      }
    }
  }
  /** Observed outcome of a tie (weight w 0..1) nudges beliefs less. */
  observe(ps, beliefs, out, w, lr = 0.025) { for (const b of beliefs) this.nudge(ps, b, lr * out * w); }
  /** Bias in [-1,1]-ish for a template: sum of template.bias[belief] * (belief-0.5)*2. */
  goalBias(ps, bias) { if (!bias) return 0; let s = 0; for (const [k, w] of Object.entries(bias)) s += w * (this.get(ps, k) - 0.5) * 2; return s; }
  /** Belief-based push on a move: (belief-0.5)*2 in [-1,1]. */
  moveBias(ps, move) { return move.bel ? (this.get(ps, move.bel) - 0.5) * 2 : 0; }
  describe(ps) { return this.keys.map((k) => [k, +ps.self[this.idx[k]].toFixed(2)]).sort((a, b) => Math.abs(b[1] - 0.5) - Math.abs(a[1] - 0.5)); }
}

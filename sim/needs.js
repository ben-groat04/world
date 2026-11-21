// Needs decay (1 = satisfied, 0 = desperate) and mood.
export const NEED_KEYS = ['hunger', 'energy', 'social', 'fun', 'hygiene', 'comfort', 'purpose'];
export const DECAY = { hunger: 0.0105, energy: 0.0062, social: 0.0042, fun: 0.0032, hygiene: 0.0028, comfort: 0.0020, purpose: 0.0026 };

export function makeNeedRates(pers) {
  return {
    hunger: 0.9 + 0.2 * (1 - pers.conscientiousness), energy: 1, social: 0.6 + 0.8 * pers.extraversion,
    fun: 0.7 + 0.6 * pers.openness, hygiene: 1, comfort: 0.8 + 0.4 * pers.neuroticism, purpose: 0.6 + 0.8 * pers.conscientiousness,
  };
}

// Needs are integrated lazily: stepNeeds(world,p) applies everything since p.needsTick in one go, using the person's
// CURRENT action state (decay multipliers + perTick effects while doing). The engine calls it every NEEDS_PERIOD ticks
// per person (staggered) AND whenever the action changes (world.flushNeeds), so short actions are still accounted exactly.
export const NEEDS_PERIOD = 6;
export function stepNeeds(world, p) {
  const dt = world.tick - p.needsTick;
  if (dt <= 0) return;
  p.needsTick = world.tick;
  const n = p.needs, r = p.needRate, ca = p.currentAction;
  const doing = ca !== null && ca.status === 1;
  const def = doing ? ca._d : undefined, dm = def !== undefined ? def.decay : undefined;
  let kh = r.hunger, ke = r.energy, ks = r.social, kf = r.fun, kg = r.hygiene, kc = r.comfort, kp = r.purpose;
  if (dm !== undefined) {
    if (dm.hunger !== undefined) kh *= dm.hunger; if (dm.energy !== undefined) ke *= dm.energy; if (dm.social !== undefined) ks *= dm.social;
    if (dm.fun !== undefined) kf *= dm.fun; if (dm.hygiene !== undefined) kg *= dm.hygiene; if (dm.comfort !== undefined) kc *= dm.comfort;
    if (dm.purpose !== undefined) kp *= dm.purpose;
  }
  let dh = -DECAY.hunger * kh * dt, de = -DECAY.energy * ke * dt, ds = -DECAY.social * ks * dt, df = -DECAY.fun * kf * dt, dg = -DECAY.hygiene * kg * dt, dc = -DECAY.comfort * kc * dt, dp = -DECAY.purpose * kp * dt;
  const pt = def !== undefined ? def._pt : undefined;
  if (pt) for (let k = 0; k < pt.length; k++) {
    const key = pt[k][0], v = pt[k][1] * dt;
    if (key === 'hunger') dh += v; else if (key === 'energy') de += v; else if (key === 'social') ds += v; else if (key === 'fun') df += v;
    else if (key === 'hygiene') dg += v; else if (key === 'comfort') dc += v; else if (key === 'purpose') dp += v;
  }
  let v;
  v = n.hunger + dh; n.hunger = v < 0 ? 0 : v > 1 ? 1 : v;
  v = n.energy + de; n.energy = v < 0 ? 0 : v > 1 ? 1 : v;
  v = n.social + ds; n.social = v < 0 ? 0 : v > 1 ? 1 : v;
  v = n.fun + df; n.fun = v < 0 ? 0 : v > 1 ? 1 : v;
  v = n.hygiene + dg; n.hygiene = v < 0 ? 0 : v > 1 ? 1 : v;
  v = n.comfort + dc; n.comfort = v < 0 ? 0 : v > 1 ? 1 : v;
  v = n.purpose + dp; n.purpose = v < 0 ? 0 : v > 1 ? 1 : v;
  if (n.hunger < 0.04) p.starve += dt;
  const w = n.hunger * 0.22 + n.energy * 0.16 + n.social * 0.14 + n.fun * 0.14 + n.hygiene * 0.06 + n.comfort * 0.1 + n.purpose * 0.18;
  let target = (w - 0.55) * 2.4 + p.moodletSum + (0.5 - p.personality.neuroticism) * 0.15;
  if (p.health < 0.5) target -= (0.5 - p.health);
  if (target > 1) target = 1; else if (target < -1) target = -1;
  p.mood += (target - p.mood) * (dt === 1 ? 0.03 : 1 - Math.pow(0.97, dt));
}

// Needs decay (1 = satisfied, 0 = desperate) and mood.
export const NEED_KEYS = ['hunger', 'energy', 'social', 'fun', 'hygiene', 'comfort', 'purpose'];
export const DECAY = { hunger: 0.0105, energy: 0.0062, social: 0.0042, fun: 0.0048, hygiene: 0.0028, comfort: 0.0020, purpose: 0.0030 };

export function makeNeedRates(pers) {
  return {
    hunger: 0.9 + 0.2 * (1 - pers.conscientiousness), energy: 1, social: 0.6 + 0.8 * pers.extraversion,
    fun: 0.7 + 0.6 * pers.openness, hygiene: 1, comfort: 0.8 + 0.4 * pers.neuroticism, purpose: 0.6 + 0.8 * pers.conscientiousness,
  };
}

export function stepNeeds(world, p) {
  const n = p.needs, r = p.needRate, ca = p.currentAction;
  const dm = ca !== null && ca.status === 1 ? ca._d.decay : undefined;
  let kh = r.hunger, ke = r.energy, ks = r.social, kf = r.fun, kg = r.hygiene, kc = r.comfort, kp = r.purpose;
  if (dm !== undefined) {
    if (dm.hunger !== undefined) kh *= dm.hunger; if (dm.energy !== undefined) ke *= dm.energy; if (dm.social !== undefined) ks *= dm.social;
    if (dm.fun !== undefined) kf *= dm.fun; if (dm.hygiene !== undefined) kg *= dm.hygiene; if (dm.comfort !== undefined) kc *= dm.comfort;
    if (dm.purpose !== undefined) kp *= dm.purpose;
  }
  n.hunger -= DECAY.hunger * kh; if (n.hunger < 0) n.hunger = 0;
  n.energy -= DECAY.energy * ke; if (n.energy < 0) n.energy = 0;
  n.social -= DECAY.social * ks; if (n.social < 0) n.social = 0;
  n.fun -= DECAY.fun * kf; if (n.fun < 0) n.fun = 0;
  n.hygiene -= DECAY.hygiene * kg; if (n.hygiene < 0) n.hygiene = 0;
  n.comfort -= DECAY.comfort * kc; if (n.comfort < 0) n.comfort = 0;
  n.purpose -= DECAY.purpose * kp; if (n.purpose < 0) n.purpose = 0;
  if (n.hunger < 0.04) p.starve++;
  const w = n.hunger * 0.22 + n.energy * 0.16 + n.social * 0.14 + n.fun * 0.14 + n.hygiene * 0.06 + n.comfort * 0.1 + n.purpose * 0.18;
  let target = (w - 0.55) * 2.4 + p.emotionSum + (0.5 - p.personality.neuroticism) * 0.15;
  if (p.health < 0.5) target -= (0.5 - p.health);
  if (target > 1) target = 1; else if (target < -1) target = -1;
  p.mood += (target - p.mood) * 0.03;
}

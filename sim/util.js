// Shared tiny helpers for sim code (pure, no world state).
export const clamp = (x, a = 0, b = 1) => (x < a ? a : x > b ? b : x);
export const has = (p, trait) => !!p && p.traits.includes(trait);
export const pid = (x) => (x !== null && typeof x === 'object' ? x.id : x);
export const fullName = (p) => (p ? `${p.firstName} ${p.lastName}` : 'someone');

// Readable goal / plan lines: "Goal: start a band - step 2/5: recruit a drummer (asked Priya, she said maybe)".
// Goes through world.text.render('goal.line', ...) when a grammar supplies that key (pack text), otherwise the built-in phrasing below. Never consumes sim RNG.
import { MOVE, VARIANT_NOUN } from './moves.js';
import { cap1 } from './util.js';
const first = (world, id) => { const q = world.people.get(id); return q ? q.firstName : 'someone'; };
export function stepLabel(world, s) {
  const m = MOVE[s.move], vn = VARIANT_NOUN[s.v] || (s.v ? `(${s.v.replace(/_/g, ' ')})` : '');
  const t = s.target != null ? (typeof s.target === 'number' ? first(world, s.target) : s.target.label) : (s.role && !['target', 'member'].includes(s.role) ? ROLE_LABEL[s.role] || '' : '');
  const verb = m ? s.move.replace(/_/g, ' ') : s.move;
  return [verb, t, vn].filter(Boolean).join(' ');
}
export const ROLE_LABEL = { employer: 'the manager', authority: 'the council', landlord: 'the landlord', expert: 'an adviser', contact: 'a contact', friend: 'a friend', family: 'family', neighbour: 'a neighbour', partner: 'their partner' };
export function goalLine(world, g, tplPhrase) {
  const n = g.steps ? g.steps.length : 0, i = Math.min(g.si + 1, n), st = g.steps && g.steps[g.si];
  const head = `Goal: ${tplPhrase}`;
  if (g.status !== 'active') return `${head} - ${g.status}${g.endWhy ? ` (${g.endWhy})` : ''}`;
  if (!st) return `${head} - looking for a way in`;
  const note = st.tries && st.note ? ` (${st.note})` : '';
  return `${head} - step ${i}/${n}: ${stepLabel(world, st)}${note}`;
}
export function render(world, key, ctx, fallback) {
  try { if (world.text && world.text.engine && world.text.engine.has && !world.text.engine.has(key)) return fallback; const s = world.text.render(key, ctx); if (typeof s === 'string' && !(s.startsWith('[') && s.endsWith(']'))) return s; } catch (e) { /* fall through */ }
  return fallback;
}
export { cap1 };

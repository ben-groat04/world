// Venue helpers: staffing slots per venue (template staff; business_unit variants), opening hours lookup.
export function venueStaff(pack, v) {
  const t = pack.venues[v.template]; if (!t) return [];
  if (v.template === 'business_unit') { const vr = t.variants && t.variants[v.variant]; return vr ? vr.staff || [] : []; }
  return t.staff || [];
}
/** Opening intervals for a venue on a day. dow Mon=0; bank = bank-holiday name|null. Returns [[from,to],...] (to may exceed 24) or []. */
export function openingsFor(pack, v, dow, bank) {
  const t = pack.venues[v.template]; if (!t) return [];
  let h = t.hours; if (v.template === 'business_unit' && t.variants && t.variants[v.variant] && t.variants[v.variant].hoursOverride) return t.variants[v.variant].hoursOverride;
  if (!h) return [];
  if (v.trim && v.trim.days.includes(dow)) return []; // struggling business has dropped a day (business plugin)
  let key = dow === 6 ? 'sun' : dow === 5 ? 'sat' : 'wk';
  if (bank) key = h.bank === 'sat' ? 'sat' : 'sun';
  const iv = h[key] || [];
  return v.trim && v.trim.eve > 0 && iv.length ? iv.map((x, i) => (i === iv.length - 1 ? [x[0], Math.max(x[0] + 1, x[1] - v.trim.eve)] : x)) : iv; // ...or closes earlier in the evening
}
export const isOpenAt = (iv, hour) => { for (let i = 0; i < iv.length; i++) if (hour >= iv[i][0] && hour < iv[i][1]) return true; return false; };

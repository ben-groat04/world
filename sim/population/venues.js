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
  let key = dow === 6 ? 'sun' : dow === 5 ? 'sat' : 'wk';
  if (bank) key = h.bank === 'sat' ? 'sat' : 'sun';
  return h[key] || [];
}
export const isOpenAt = (iv, hour) => { for (let i = 0; i < iv.length; i++) if (hour >= iv[i][0] && hour < iv[i][1]) return true; return false; };

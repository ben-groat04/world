// One place that turns a job-taxonomy label ("IT / science technician", "Freelance designer / writer / photographer (city)") into the noun phrase used in prose.
// The taxonomy is slash-separated alternatives; prose must never show a slash, and must not truncate to a bare modifier ("IT", "software").
const OVERRIDE = { admin_clerk: 'office administrator', student_part_time: 'part-time job', delivery_courier_app: 'delivery courier', police_fire_officer: 'police officer', school_support_staff: 'school caretaker', senior_manager: 'senior manager', phd_student_stipend: 'PhD student', gp: 'GP', shop_owner_manager: 'shop owner', care_worker: 'care worker', allied_health: 'physiotherapist', engineer_architect: 'engineer', social_worker: 'social worker', clergy: 'priest', receptionist: 'receptionist' };
const MODIFIER = new Set(['software', 'sales', 'marketing', 'hospitality', 'retail', 'lettings', 'gym', 'operations', 'church', 'airport', 'factory', 'food factory', 'taxi', 'private-hire', 'call-centre', 'hr', 'it', 'hgv', 'administrative']);
/** label -> lower-case-initial noun phrase without slashes or brackets (acronyms keep their capitals). id optional, for hand-set overrides. */
export function jobNoun(label, id) {
  if (id && OVERRIDE[id]) return OVERRIDE[id];
  let t = String(label || '').replace(/\s*\([^)]*\)?/g, '').trim(); if (!t) return '';
  const segs = t.split(/\s*\/\s*/).filter(Boolean);
  if (segs.length > 1) {
    const first = segs[0], last = segs[segs.length - 1], lw = last.split(/\s+/);
    // a first alternative that is only a modifier ("IT / science technician", "Software / data professional") borrows the head noun of the last alternative
    t = MODIFIER.has(first.toLowerCase()) && lw.length >= 2 ? `${first} ${lw[lw.length - 1]}` : first;
  }
  t = t.replace(/\s+/g, ' ').trim();
  return /^[A-Z]{2,}\b/.test(t) ? t : t.charAt(0).toLowerCase() + t.slice(1);
}

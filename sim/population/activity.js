// Economic activity by age (day-1 INPUT; also used for arrivals from the Metropolis). Replaces the old "segment head distribution applied to
// everyone" draw, which under-produced students and over-produced employment. Base table = age-specific shares of residents in an inner-city
// ward (ONS Census 2021 TS066 by age band, urban/diverse wards; `student` = full-time students NOT also working: the census counts working
// students as employed). Segment character enters as a bounded tilt (segment head distribution / pooled non-student distribution), so
// benefit_dependent skews to sick/unemployed, settled_professionals to employed, etc. No quota: each person is an independent draw.
// After day 1 nothing here is used for residents: activity changes through labour (hiring, graduation, sickness, caring) and life (school stages).
import { wpickObj } from './util.js';

// [maxAge, shares]   keys follow content/larkfield/segments.js
const BASE = [
  [17, { student: 0.84, employed: 0.09, unemployed: 0.03, otherInactive: 0.04 }],
  [21, { student: 0.50, employed: 0.35, unemployed: 0.06, lookingAfterHomeFamily: 0.03, longTermSickDisabled: 0.02, otherInactive: 0.04 }],
  [24, { student: 0.22, employed: 0.56, unemployed: 0.07, lookingAfterHomeFamily: 0.05, longTermSickDisabled: 0.03, otherInactive: 0.07 }],
  [29, { student: 0.07, employed: 0.72, unemployed: 0.05, lookingAfterHomeFamily: 0.06, longTermSickDisabled: 0.03, otherInactive: 0.07 }],
  [39, { student: 0.03, employed: 0.72, unemployed: 0.04, lookingAfterHomeFamily: 0.12, longTermSickDisabled: 0.04, otherInactive: 0.05 }],
  [49, { student: 0.015, employed: 0.71, unemployed: 0.04, lookingAfterHomeFamily: 0.09, longTermSickDisabled: 0.07, otherInactive: 0.07 }],
  [59, { student: 0.01, employed: 0.62, unemployed: 0.04, lookingAfterHomeFamily: 0.05, longTermSickDisabled: 0.12, otherInactive: 0.08, retired: 0.08 }],
  [64, { employed: 0.43, unemployed: 0.03, lookingAfterHomeFamily: 0.04, longTermSickDisabled: 0.13, otherInactive: 0.07, retired: 0.30 }],
  [200, { retired: 0.95, employed: 0.04, longTermSickDisabled: 0.01 }],
];
let POOLED = null;
function pooled(segments) {
  if (POOLED && POOLED.n === segments.length) return POOLED.v;
  const v = {}; let tot = 0;
  for (const s of segments) { if (s.id === 'students') continue; tot += s.householdShare; for (const [k, x] of Object.entries(s.head.activity)) v[k] = (v[k] || 0) + x * s.householdShare; }
  for (const k of Object.keys(v)) v[k] /= tot;
  POOLED = { n: segments.length, v }; return v;
}
/** Draw an activity key (segments.js vocabulary) for a person aged >= 16. opts: {sex, youngKids (partner with a child < 12), role} */
export function sampleActivity(rng, segments, seg, age, opts = {}) {
  if (age < 16) return 'child';
  if (seg.id === 'students' && age < 30 && opts.role !== 'parent') return wpickObj(rng, seg.head.activity);
  const band = BASE.find((b) => age <= b[0])[1], P = pooled(segments), w = {};
  for (const [k, x] of Object.entries(band)) {
    let t = 1;
    if (k !== 'retired' && age >= 18 && k !== 'student') t = Math.min(3, Math.max(0.3, ((seg.head.activity[k] || 0) + 0.02) / ((P[k] || 0) + 0.02)));
    else if (k === 'student' && age >= 18) t = Math.min(3, Math.max(0.4, ((seg.head.activity[k] || 0) + 0.03) / ((P[k] || 0) + 0.03)));
    else if (k === 'retired') t = seg.id === 'older_longterm' ? 1.6 : 1;
    w[k] = x * t;
  }
  if (opts.youngKids) { w.lookingAfterHomeFamily = (w.lookingAfterHomeFamily || 0.03) * (opts.sex === 'F' ? 3.5 : 0.5); w.employed = (w.employed || 0.5) * (opts.sex === 'F' ? 0.8 : 1.05); }
  return wpickObj(rng, w);
}

// Larkfield content pack (W1-A). Default export = pack validated by sim/kernel/schema.js (loadPack('larkfield')).
// Section map:  calibration (re-export), names{GROUPS,pickOrigin,pickName,...}, jobs[] (occupations) , buildings{archetypes}, venues{templates}, drives[], goalTemplates[],
//   calendar (buildCalendar(2026) day table), settings, meta{ segments, households, segmentComposition, patterns, socToOcc, tax, benefits, gateways, offmap, publicSpaces, tenures, landlords, roomModel, terraceMix, mapPack }.
// The map generator reads `mapPack` (map-pack.js); content stays in data modules so any agent can import the slice it needs.
import calibration from './calibration.js';
import NAMES from './names.js';
import JOBS, { OCCUPATIONS, PATTERNS, SOC_GROUPS, SOC_TO_OCC, TAX, BENEFITS, CONTRACT_TYPES } from './jobs.js';
import * as ARCH from './archetypes.js';
import * as VEN from './venues.js';
import { DRIVES, SEGMENT_SHIFTS } from './drives.js';
import { GOAL_TEMPLATES } from './goal-templates.js';
import { SEGMENTS, HOUSEHOLD_ARCHETYPES, SEGMENT_COMPOSITION, expectedAnnualMoveRate } from './segments.js';
import calendar, { buildCalendar } from './calendar.js';
import mapPack from './map-pack.js';

export const pack = {
  id: 'larkfield', version: '1.0.0', contractVersion: '1.0.0',
  calibration, names: NAMES, jobs: OCCUPATIONS, buildings: ARCH.BUILDING_ARCHETYPES, venues: VEN.VENUE_TEMPLATES,
  unitTypes: { rooms: ARCH.ROOM_MODEL, tenures: ARCH.TENURES, terraceMix: ARCH.TERRACE_MIX },
  drives: DRIVES, goalTemplates: GOAL_TEMPLATES, calendar,
  settings: { id: 'larkfield', name: 'Larkfield', region: 'UK inner-urban neighbourhood (composite)', targetPopulation: 500, startYear: 2026, lat: 53.4, lon: -2.2 },
  meta: {
    segments: SEGMENTS, segmentShifts: SEGMENT_SHIFTS, households: HOUSEHOLD_ARCHETYPES, segmentComposition: SEGMENT_COMPOSITION.joint,
    patterns: PATTERNS, socGroups: SOC_GROUPS, socToOcc: SOC_TO_OCC, contractTypes: CONTRACT_TYPES, tax: TAX, benefits: BENEFITS,
    gateways: VEN.GATEWAYS, offmap: VEN.OFFMAP_DESTINATIONS, publicSpaces: VEN.PUBLIC_SPACES, expectedVenueCounts: VEN.EXPECTED_VENUE_COUNTS,
    tenureFromCalibration: ARCH.TENURE_FROM_CALIBRATION, landlords: ARCH.LANDLORDS, mapPack, buildCalendar,
  },
};

/** Cross-reference + calibration-consistency checks beyond the schema. Returns {ok, errors, warnings, stats}. */
export function validate(p = pack) {
  const errors = [], warnings = [];
  const occ = new Map(p.jobs.map((o) => [o.id, o]));
  for (const o of p.jobs) {
    if (!PATTERNS[o.pattern]) errors.push(`occupation ${o.id}: unknown pattern ${o.pattern}`);
    if (o.where === 'offmap' && o.dest && !VEN.OFFMAP_DESTINATIONS[o.dest]) errors.push(`occupation ${o.id}: unknown dest ${o.dest}`);
    if (!(o.pay.p10 <= o.pay.median && o.pay.median <= o.pay.p90)) errors.push(`occupation ${o.id}: pay bands not ordered`);
    if (o.soc < 1 || o.soc > 9) errors.push(`occupation ${o.id}: bad soc`);
    if (o.hours && !(o.hours[0] <= o.hours[1] && o.hours[1] <= o.hours[2])) errors.push(`occupation ${o.id}: hours not ordered`);
  }
  for (const [soc, m] of Object.entries(SOC_TO_OCC)) for (const id of Object.keys(m)) { const o = occ.get(id); if (!o) errors.push(`SOC_TO_OCC[${soc}]: unknown occupation ${id}`); else if (o.soc !== +soc) errors.push(`SOC_TO_OCC[${soc}]: ${id} is SOC ${o.soc}`); }
  for (const [vid, v] of Object.entries(VEN.VENUE_TEMPLATES)) for (const s of v.staff || []) { if (!occ.has(s.occ)) errors.push(`venue ${vid}: unknown staff occupation ${s.occ}`); else if (s.pattern && !PATTERNS[s.pattern]) errors.push(`venue ${vid}: unknown pattern ${s.pattern}`); }
  for (const [soc, key] of Object.entries(SOC_GROUPS)) if (!(key in calibration.occupationSOC.composite)) errors.push(`SOC group key '${key}' missing from calibration.occupationSOC`);
  const drivesIds = new Set(DRIVES.map((d) => d.id));
  for (const g of GOAL_TEMPLATES) { for (const d of g.drive) if (!drivesIds.has(d)) errors.push(`goal ${g.id}: unknown drive ${d}`); if (!g.by || !g.by.length) errors.push(`goal ${g.id}: no methods`); }
  if (new Set(GOAL_TEMPLATES.map((g) => g.id)).size !== GOAL_TEMPLATES.length) errors.push('duplicate goal template ids');
  const segIds = new Set(SEGMENTS.map((s) => s.id));
  for (const k of Object.keys(SEGMENT_SHIFTS)) { if (!segIds.has(k)) errors.push(`segmentShifts: unknown segment ${k}`); for (const d of Object.keys(SEGMENT_SHIFTS[k])) if (!drivesIds.has(d)) errors.push(`segmentShifts.${k}: unknown drive ${d}`); }
  const shareSum = SEGMENTS.reduce((a, s) => a + s.householdShare, 0); if (Math.abs(shareSum - 1) > 1e-6) errors.push(`segment shares sum to ${shareSum}`);
  if (SEGMENT_COMPOSITION.maxMarginalError > 1e-3) errors.push(`segment x composition IPF did not converge (${SEGMENT_COMPOSITION.maxMarginalError})`);
  for (const s of SEGMENTS) for (const k of Object.keys(s.tenure)) if (!ARCH.TENURES.includes(k) && k !== 'tied_above_shop') errors.push(`segment ${s.id}: unknown tenure ${k}`);
  // implied tenure from segments vs calibration (households)
  const tn = {}; for (const s of SEGMENTS) { const tot = Object.values(s.tenure).reduce((a, b) => a + b, 0); for (const [k, v] of Object.entries(s.tenure)) { const kk = k === 'tied_above_shop' ? 'private_rent' : k; tn[kk] = (tn[kk] || 0) + s.householdShare * v / tot; } }
  const target = {}; for (const [lab, v] of Object.entries(calibration.tenure.composite)) { const k = ARCH.TENURE_FROM_CALIBRATION[lab]; if (k) target[k] = (target[k] || 0) + v; }
  const tdev = Object.keys(target).map((k) => [k, +((tn[k] || 0) - target[k]).toFixed(3)]); for (const [k, d] of tdev) if (Math.abs(d) > 0.06) warnings.push(`segment-implied tenure ${k} deviates ${d} from calibration`);
  const mv = expectedAnnualMoveRate(); if (mv < 0.12 || mv > 0.22) warnings.push(`household annual move rate ${mv.toFixed(3)} outside 0.12-0.22 (calibration ~0.16/person)`);
  const cal = p.calendar; if (cal.nDays !== 365 && cal.nDays !== 366) errors.push('calendar length');
  return { ok: errors.length === 0, errors, warnings, stats: { occupations: p.jobs.length, venueTemplates: Object.keys(p.venues).length, goalTemplates: GOAL_TEMPLATES.length, segments: SEGMENTS.length, householdMoveRate: +mv.toFixed(3), impliedTenureDev: Object.fromEntries(tdev), schoolDays: cal.days.filter((d) => d.schoolDay).length } };
}
export { calendar, buildCalendar, mapPack, SEGMENTS, HOUSEHOLD_ARCHETYPES, OCCUPATIONS, PATTERNS, DRIVES, GOAL_TEMPLATES, NAMES };
export default pack;

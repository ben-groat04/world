// Epidemiological tables for the health package. Numbers are per-year hazards by age band (0-29, 30-39, 40-49, 50-59, 60-69, 70-79, 80+) in cases per 1000 people at risk,
// shaped on UK primary-care (QOF) prevalence and incidence so that point prevalence by age lands near published values; social-gradient and ethnicity multipliers on top.
import { clamp } from '../life/util.js';

export const AGE_BANDS = [30, 40, 50, 60, 70, 80, 999];
export const bandIdx = (a) => (a < 30 ? 0 : a < 40 ? 1 : a < 50 ? 2 : a < 60 ? 3 : a < 70 ? 4 : a < 80 ? 5 : 6);

/** annual death probability (calibration life table, single-year) */
export function qxAnnual(cal, age, sex) {
  const t = cal.mortality.singleYearQx[sex === 'F' ? 'female' : 'male'], a = Math.floor(age);
  if (a <= 100) return t[a] ?? t[100];
  return Math.min(0.7, t[100] * Math.pow(1.1, a - 100));
}

// condition -> incidence per 1000 per year by age band
export const INC = {
  hypertension: [1, 5, 13, 24, 31, 33, 28],
  diabetes: [0.6, 2.8, 5.2, 7.7, 9.4, 8.7, 6.2],
  'heart disease': [0.05, 0.3, 1.4, 3.8, 7.5, 12, 16],
  stroke: [0.05, 0.2, 0.7, 1.8, 3.6, 7, 11],
  COPD: [0.15, 0.5, 1.8, 4.5, 7, 8, 8],
  cancer: [0.45, 1.1, 2.7, 6.5, 12, 18, 19],
  dementia: [0, 0, 0.05, 0.3, 2.0, 8, 24],
  arthritis: [1, 4.5, 11.5, 22, 32, 36, 31],
  'back pain': [7, 10, 11, 11, 9, 7, 5],
  asthma: [7, 3, 2, 1.5, 1.2, 1, 0.8],
  'mobility impairment': [0.2, 0.5, 1.2, 2.5, 5, 10, 18],
  'hearing/sight loss': [0.3, 0.8, 2, 5, 9, 16, 28],
};
/** relative log-hazard of death for having each condition (before adherence) */
export const FRAIL = { hypertension: 0.15, diabetes: 0.5, 'heart disease': 0.95, stroke: 0.85, COPD: 0.95, cancer: 1.7, dementia: 1.0, arthritis: 0.08, 'back pain': 0.0, asthma: 0.12, 'mobility impairment': 0.4, 'hearing/sight loss': 0.1, 'depression/anxiety': 0.3 };
/** burden on the 0..1 health score and whether the condition is disabling (limits day-to-day activity) */
export const BURDEN = { hypertension: 0.02, diabetes: 0.06, 'heart disease': 0.12, stroke: 0.2, COPD: 0.15, cancer: 0.2, dementia: 0.22, arthritis: 0.08, 'back pain': 0.05, asthma: 0.04, 'mobility impairment': 0.14, 'hearing/sight loss': 0.04, 'depression/anxiety': 0.08, epilepsy: 0.08, 'autism/ADHD': 0.03, 'chronic fatigue': 0.12 };
export const DISABLING = new Set(['stroke', 'dementia', 'mobility impairment', 'COPD', 'cancer', 'epilepsy', 'chronic fatigue']);
/** months from onset to diagnosis (mean) before the GP-wait multiplier */
export const DX_DELAY = { hypertension: 14, diabetes: 10, 'heart disease': 2, stroke: 0.1, COPD: 8, cancer: 1.2, dementia: 14, arthritis: 6, 'back pain': 1, asthma: 3, 'mobility impairment': 3, 'hearing/sight loss': 10 };
/** cause-of-death weights by age band (<15, 15-34, 35-49, 50-64, 65-79, 80+) for people with no relevant condition; chronic causes are boosted by the condition itself */
export const CAUSES = ['perinatal', 'accident', 'road', 'suicide', 'overdose', 'cancer', 'heart disease', 'stroke', 'COPD', 'dementia', 'pneumonia', 'liver disease', 'infection', 'assault', 'other'];
export const CAUSE_BASE = {
  //            <15   15-34 35-49 50-64 65-79 80+
  perinatal: [5, 0, 0, 0, 0, 0], accident: [1.2, 3, 1.5, 1.2, 1.6, 3.2], road: [0.8, 2.2, 0.8, 0.5, 0.4, 0.2], suicide: [0.05, 4, 2.2, 1.2, 0.5, 0.2], overdose: [0.02, 2.4, 2.0, 0.9, 0.1, 0],
  cancer: [0.7, 1.4, 4, 7, 9, 5], 'heart disease': [0.05, 0.5, 2, 4, 5, 6], stroke: [0.03, 0.2, 0.7, 1.6, 2.6, 4.2], COPD: [0.02, 0.1, 0.4, 1.3, 2.4, 2.6], dementia: [0, 0, 0, 0.1, 1.2, 8],
  pneumonia: [0.1, 0.2, 0.3, 0.5, 1.3, 4.2], 'liver disease': [0, 0.2, 1.1, 1.4, 0.7, 0.2], infection: [0.4, 0.4, 0.4, 0.5, 0.6, 1.0], assault: [0.05, 0.6, 0.2, 0.05, 0, 0], other: [1, 1.5, 1.6, 1.8, 2.0, 2.5],
};
export const causeBand = (a) => (a < 15 ? 0 : a < 35 ? 1 : a < 50 ? 2 : a < 65 ? 3 : a < 80 ? 4 : 5);
/** terminal phase length in days (min,max) by cause: sudden causes die within hours/days; cancer and dementia take weeks to months */
export const TERMINAL = { perinatal: [0, 3], accident: [0, 2], road: [0, 1], suicide: [0, 0], overdose: [0, 1], cancer: [25, 260], 'heart disease': [0, 6], stroke: [0, 20], COPD: [5, 70], dementia: [20, 140], pneumonia: [3, 21], 'liver disease': [15, 120], infection: [2, 14], assault: [0, 1], other: [1, 40] };
export const DEATH_TEXT = { perinatal: 'complications around birth', accident: 'an accident', road: 'a road accident', suicide: 'suicide', overdose: 'an overdose', cancer: 'cancer', 'heart disease': 'heart disease', stroke: 'a stroke', COPD: 'chronic lung disease', dementia: 'dementia', pneumonia: 'pneumonia', 'liver disease': 'liver disease', infection: 'an infection', assault: 'an assault', other: 'natural causes' };
/** statistical bucket the report uses to compare with the calibration's leading causes */
export const CAUSE_GROUP = { dementia: "Dementia and Alzheimer's", 'heart disease': 'Ischaemic heart diseases', COPD: 'Chronic lower respiratory diseases', stroke: 'Cerebrovascular diseases', cancer: 'Cancer', pneumonia: 'Influenza and pneumonia' };
export { clamp };

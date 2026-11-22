// Crime data: offence types with the real-world parameters the mechanisms use. Sources are CSEW (ONS "Crime in England and Wales", reporting to police by offence),
// Home Office "Crime outcomes in England and Wales" (charge/summons share of recorded offences, YE Mar 2024), HMICFRS crime-recording audits (~92% of reported crimes recorded,
// NCRS), Bennett, Holloway & Farrington 2008/09 (Campbell review: neighbourhood watch associated with 16-26% lower crime), Johnson & Bowers 2004 (near-repeat burglary),
// Moffitt 1993 / Farrington 1986 (age-crime curve, adolescence-limited offending), Sampson & Laub 1993 (marriage/work bonds and desistance), CSEW fraud: 12% reported to police/Action Fraud.
// rep = share of victim-experienced incidents the victim reports to police (approx. CSEW); det = share of RECORDED offences ending charged/summonsed or an out-of-court
// disposal with a named local offender, before the evidence multipliers in index.js (approx. Home Office outcomes); sev = seriousness 0-3 (stress, fear, sentencing).
export const TYPES = {
  burglary:   { ev: 'crime.burglary',   rep: 0.72, det: 0.050, sev: 2, label: 'burglary' },
  theft:      { ev: 'crime.theft',      rep: 0.33, det: 0.020, sev: 1, label: 'other theft' },
  vehicle:    { ev: 'crime.vehicle',    rep: 0.50, det: 0.020, sev: 1, label: 'vehicle crime' },
  bike:       { ev: 'crime.bike_theft', rep: 0.40, det: 0.012, sev: 1, label: 'bicycle theft' },
  theftperson:{ ev: 'crime.theft',      rep: 0.38, det: 0.025, sev: 2, label: 'theft from the person' },
  shoplift:   { ev: 'crime.theft',      rep: 0.42, det: 0.140, sev: 0, label: 'shoplifting' },
  damage:     { ev: 'crime.damage',     rep: 0.33, det: 0.040, sev: 1, label: 'criminal damage' },
  asb:        { ev: 'crime.antisocial', rep: 0.20, det: 0.015, sev: 0, label: 'antisocial behaviour', noRecord: true },
  assault:    { ev: 'crime.assault',    rep: 0.36, det: 0.075, sev: 2, label: 'violence' },
  harass:     { ev: 'crime.harassment', rep: 0.24, det: 0.055, sev: 1, label: 'harassment or stalking' },
  publicorder:{ ev: 'crime.disorder',   rep: 1.00, det: 0.300, sev: 0, label: 'public order offence', policeInitiated: true },
  drugs:      { ev: 'crime.drugs',      rep: 1.00, det: 0.600, sev: 0, label: 'drug offence', policeInitiated: true },
  fraud:      { ev: 'crime.fraud',      rep: 0.12, det: 0.005, sev: 1, label: 'fraud', noRecord: true },
};
export const TYPE_IDS = Object.keys(TYPES);
// calibration comparison groups: recorded offences per 1000 residents/yr (uk-inner-city profile urban-force rates x innerCityFactor 1.35; ONS P3 YE Dec 2024)
export const CAL_GROUPS = {
  'violence+harassment': { types: ['assault', 'harass'], per1000: (36.878 - 3.728) * 1.35 },
  theft: { types: ['theft', 'theftperson', 'shoplift', 'bike'], per1000: (28.798 - 6.291) * 1.35 },
  vehicle: { types: ['vehicle'], per1000: 6.291 * 1.35 },
  burglary: { types: ['burglary'], per1000: 4.583 * 1.35 },
  damage: { types: ['damage'], per1000: 8.512 * 1.35 },
  'drugs+order': { types: ['drugs', 'publicorder'], per1000: (3.447 + 8.809) * 1.35 },
};
// time-of-week offence profiles (relative hourly weights; normalised in index.js). nte = night-time economy, day = working-day, night, eve = after school / evening
export const PROFILE = {
  day: (h, dow) => (h >= 9 && h < 18 ? 1.7 : h >= 18 && h < 22 ? 0.9 : 0.25),
  shop: (h) => (h >= 9 && h < 19 ? 1.7 : h >= 19 && h < 22 ? 0.5 : 0.05),
  night: (h) => (h >= 22 || h < 5 ? 2.2 : h >= 5 && h < 8 ? 0.8 : 0.4),
  nte: (h, dow) => ((dow === 4 || dow === 5) && (h >= 21 || h < 3) ? 4 : (dow === 3 || dow === 6) && h >= 21 ? 1.4 : h >= 12 && h < 21 ? 0.7 : 0.25),
  eve: (h, dow) => (h >= 15 && h < 23 ? 2 : h >= 11 && h < 15 ? 0.6 : 0.1) * (dow >= 5 ? 1.3 : 1),
  flat: () => 1,
};
export const PROF_OF = { burglary: 'day', theft: 'flat', vehicle: 'night', bike: 'day', theftperson: 'nte', shoplift: 'shop', damage: 'night', asb: 'eve', assault: 'nte', harass: 'flat', publicorder: 'nte', drugs: 'flat', fraud: 'flat' };

// Crime data: offence types with the real-world parameters the mechanisms use. Sources are CSEW (ONS "Crime in England and Wales", reporting to police by offence),
// Home Office "Crime outcomes in England and Wales" (charge/summons share of recorded offences, YE Mar 2024), HMICFRS crime-recording audits (~92% of reported crimes recorded,
// NCRS), Bennett, Holloway & Farrington 2008/09 (Campbell review: neighbourhood watch associated with 16-26% lower crime), Johnson & Bowers 2004 (near-repeat burglary),
// Moffitt 1993 / Farrington 1986 (age-crime curve, adolescence-limited offending), Sampson & Laub 1993 (marriage/work bonds and desistance), CSEW fraud: 12% reported to police/Action Fraud.
// rep = share of victim-experienced incidents the victim reports to police (approx. CSEW); det = share of RECORDED offences ending charged/summonsed or an out-of-court
// disposal with a named local offender, before the evidence multipliers in index.js; chg = charged/summonsed share of those positive outcomes; sev = seriousness 0-3.
// det/chg are INPUTS per offence class from Home Office "Crime outcomes in England and Wales 2023 to 2024" (first-published, YE Mar 2024): victim-based offences 5.5% charged/summonsed
// + ~2.2% out-of-court (so ~7.7% positive); non-victim-based (found by police) 11% charged + 10% out-of-court; sexual offences 4.2% charged (47.6% 'evidential difficulties: victim does not support');
// theft 5.8%, residential burglary 4.3%, non-residential 7.9% charged; drugs 19% charged + 36% out-of-court; public order 7% charged + 9% out-of-court. The aggregate is emergent (offence mix,
// known-offender, CCTV and police-capacity multipliers) and is reported against 7.7% (victim-based) / ~21% (police-initiated) as a held-out check.
export const TYPES = {
  burglary:   { ev: 'crime.burglary',   rep: 0.72, det: 0.050, chg: 0.75, sev: 2, label: 'burglary' },
  theft:      { ev: 'crime.theft',      rep: 0.33, det: 0.020, chg: 0.75, sev: 1, label: 'other theft' },
  vehicle:    { ev: 'crime.vehicle',    rep: 0.50, det: 0.020, chg: 0.75, sev: 1, label: 'vehicle crime' },
  bike:       { ev: 'crime.bike_theft', rep: 0.40, det: 0.012, chg: 0.75, sev: 1, label: 'bicycle theft' },
  theftperson:{ ev: 'crime.theft',      rep: 0.38, det: 0.025, chg: 0.75, sev: 2, label: 'theft from the person' },
  shoplift:   { ev: 'crime.theft',      rep: 0.42, det: 0.140, chg: 0.55, sev: 0, label: 'shoplifting' },
  damage:     { ev: 'crime.damage',     rep: 0.33, det: 0.040, chg: 0.75, sev: 1, label: 'criminal damage' },
  asb:        { ev: 'crime.antisocial', rep: 0.20, det: 0.015, chg: 0.5, sev: 0, label: 'antisocial behaviour', noRecord: true },
  assault:    { ev: 'crime.assault',    rep: 0.36, det: 0.075, chg: 0.72, sev: 2, label: 'violence' },
  harass:     { ev: 'crime.harassment', rep: 0.24, det: 0.055, chg: 0.72, sev: 1, label: 'harassment or stalking' },
  publicorder:{ ev: 'crime.disorder',   rep: 1.00, det: 0.160, chg: 0.44, sev: 0, label: 'public order offence', policeInitiated: true },
  drugs:      { ev: 'crime.drugs',      rep: 1.00, det: 0.550, chg: 0.35, sev: 0, label: 'drug offence', policeInitiated: true },
  sexual:     { ev: 'crime.sexual',     rep: 0.17, det: 0.047, chg: 0.9, sev: 3, label: 'sexual offence', sensitive: true }, // ONS/CSEW: ~1 in 6 victims of sexual assault tell the police; 4.2% charged (Home Office YE Mar 2024)
  fraud:      { ev: 'crime.fraud',      rep: 0.12, det: 0.005, chg: 0.75, sev: 1, label: 'fraud', noRecord: true },
};
export const TYPE_IDS = Object.keys(TYPES);
// CALIBRATION GROUPS. Metric (one definition everywhere): recorded offences per 1000 RESIDENTS per year with a resident as victim (offence on the map or in the city, e.g. a night out).
// Reference = ONS police-recorded crime (Table P3) rate per 1000 population for an urban force x innerCityFactor 1.35 (inner-city wards run ~1.3-1.5x the force average; an INPUT, not tuned).
// Sexual offences: ONS YE Mar 2025 3.4 per 1000 (209k recorded) x 1.35. The summed total (CAL_TOTAL) is the TUNED TARGET for the outsider-stream parameters (PARAMS.OUT, NTE); per-type/age mix is emergent.
export const CAL_GROUPS = {
  'violence+harassment': { types: ['assault', 'harass'], per1000: (36.878 - 3.728) * 1.35 },
  theft: { types: ['theft', 'theftperson', 'shoplift', 'bike'], per1000: (28.798 - 6.291) * 1.35 },
  vehicle: { types: ['vehicle'], per1000: 6.291 * 1.35 },
  burglary: { types: ['burglary'], per1000: 4.583 * 1.35 },
  damage: { types: ['damage'], per1000: 8.512 * 1.35 },
  'drugs+order': { types: ['drugs', 'publicorder'], per1000: (3.447 + 8.809) * 1.35 },
  sexual: { types: ['sexual'], per1000: 3.4 * 1.35 },
};
export const CAL_TOTAL = Object.values(CAL_GROUPS).reduce((a, g) => a + g.per1000, 0);
// time-of-week offence profiles (relative hourly weights; normalised in index.js). nte = night-time economy, day = working-day, night, eve = after school / evening
export const PROFILE = {
  day: (h, dow) => (h >= 9 && h < 18 ? 1.7 : h >= 18 && h < 22 ? 0.9 : 0.25),
  shop: (h) => (h >= 9 && h < 19 ? 1.7 : h >= 19 && h < 22 ? 0.5 : 0.05),
  night: (h) => (h >= 22 || h < 5 ? 2.2 : h >= 5 && h < 8 ? 0.8 : 0.4),
  nte: (h, dow) => ((dow === 4 || dow === 5) && (h >= 21 || h < 3) ? 4 : (dow === 3 || dow === 6) && h >= 21 ? 1.4 : h >= 12 && h < 21 ? 0.7 : 0.25),
  eve: (h, dow) => (h >= 15 && h < 23 ? 2 : h >= 11 && h < 15 ? 0.6 : 0.1) * (dow >= 5 ? 1.3 : 1),
  flat: () => 1,
};
export const PROF_OF = { burglary: 'day', theft: 'flat', vehicle: 'night', bike: 'day', theftperson: 'nte', shoplift: 'shop', damage: 'night', asb: 'eve', assault: 'nte', harass: 'flat', publicorder: 'nte', drugs: 'flat', fraud: 'flat', sexual: 'nte' };

// Occupations, pay bands and work patterns for Larkfield. DATA ONLY. Pay = gross annual full-time-equivalent GBP (2026 money), p10/median/p90 of the
// occupation as held by residents of a mid-income northern/midlands inner city (NOT London). `hourlyFloor` applies (National Living Wage £12.71/h from Apr 2026).
// where: 'onmap' = a venue on the Larkfield map staffs it (venues.js `staff`); 'offmap' = a workplace in the Metropolis (destination keys in venues.js OFFMAP_DESTINATIONS);
// `female` = share of this occupation's employee jobs held by women, from ASHE 2026 (provisional) Table 14.6a jobs by sex (SOC 2020 4-digit codes in `ashe`); where ASHE suppresses one sex it is
// clipped to [0.02, 0.95] or set by hand (ov in docs/CALIBRATION-METHOD.md). Occupation draws are weighted by sexFit (sim/population/util.js) so label/sex combinations that reality rules out (imam=woman) are ~impossible.
// PAY: p10/median/p90 are ASHE 2026 provisional (April 2026) UK full-time employees: SOC 4-9 hourly pay excl. overtime (Table 14.6a) x 1950 h; SOC 1-3 annual gross (Table 14.7a, salaried, paid <= 37.5 h). Self-employed/gig/owner
// occupations (no `ashe` pay basis: shop_owner_manager, cafe_owner, small_business_owner, taxi_driver, rideshare/courier/rider, artist_maker, freelancer_creative, childcare_nanny, student_part_time, phd stipend, gp, dentist) keep hand bands.
// 'home' = home-based/remote or mobile (trades go to client sites off-map). Hours are contracted weekly hours [min, typical, max].
export const NLW_HOURLY_2026 = 12.71;
// ---- Work patterns: shifts as [startHour, endHour] on given weekdays (Mon=0). `rotation` describes how the sim should vary weeks. endHour>24 = past midnight.
const WK = [0, 1, 2, 3, 4];
export const PATTERNS = {
  day: { label: 'Office/9-5', shifts: [{ days: WK, from: 9, to: 17.5 }], flex: 0.1 },
  early: { label: 'Early starts', shifts: [{ days: [0, 1, 2, 3, 4, 5], from: 5.5, to: 13.5 }] },
  late: { label: 'Late shifts', shifts: [{ days: [0, 1, 2, 3, 4, 5, 6], from: 14, to: 23 }], rotation: { offDaysPerWeek: 2, varies: true } },
  split_shifts: { label: 'Split / part-time shifts', shifts: [{ days: [2, 3, 4, 5, 6], from: 7.5, to: 15.5 }], rotation: { offDaysPerWeek: 2, varies: true } },
  retail_rota: { label: 'Retail rota (4 on 3 off, mixed opens/closes)', shifts: [{ days: [0, 1, 2, 3, 4, 5, 6], from: 6, to: 14.5, tag: 'open' }, { days: [0, 1, 2, 3, 4, 5, 6], from: 13.5, to: 22, tag: 'close' }, { days: [0, 1, 2, 3, 4, 5, 6], from: 9, to: 17.5, tag: 'mid' }], rotation: { shiftsPerWeek: 4, varies: true, weekendsWorked: 0.5 } },
  evening_shift: { label: 'Evening hospitality', shifts: [{ days: [1, 2, 3, 4, 5, 6], from: 16.5, to: 24.5 }], rotation: { shiftsPerWeek: 4, varies: true } },
  school_day: { label: 'School hours (term time)', shifts: [{ days: WK, from: 8, to: 16.5 }], termOnly: true },
  nursery: { label: 'Nursery 7:30-18:00 rota', shifts: [{ days: WK, from: 7.5, to: 15.5, tag: 'open' }, { days: WK, from: 10, to: 18, tag: 'close' }], rotation: { shiftsPerWeek: 5, varies: true } },
  clinic: { label: 'Clinic sessions', shifts: [{ days: WK, from: 8, to: 18.5 }], rotation: { offDaysPerWeek: 2, varies: true } },
  flexible: { label: 'Self-directed / irregular', shifts: [{ days: WK, from: 9, to: 17 }], flex: 0.6 },
  // ----- off-map patterns -----
  office_hybrid: { label: 'Office 3 days + home 2', shifts: [{ days: WK, from: 8.75, to: 17.5 }], hybridOfficeDays: [1, 2, 3], flex: 0.3 },
  office_onsite: { label: 'On-site office/9-5', shifts: [{ days: WK, from: 8.5, to: 17.5 }], flex: 0.1 },
  remote: { label: 'Fully remote', shifts: [{ days: WK, from: 9, to: 17.5 }], flex: 0.5, atHome: true },
  nhs_shifts: { label: 'NHS shifts (long days/nights)', shifts: [{ days: [0, 1, 2, 3, 4, 5, 6], from: 7, to: 19.5, tag: 'long_day' }, { days: [0, 1, 2, 3, 4, 5, 6], from: 19, to: 31.5, tag: 'night' }, { days: [0, 1, 2, 3, 4, 5, 6], from: 7, to: 15, tag: 'early' }, { days: [0, 1, 2, 3, 4, 5, 6], from: 13, to: 21, tag: 'late' }], rotation: { shiftsPerWeek: 3, varies: true, weekendsWorked: 0.4 } },
  night: { label: 'Nights', shifts: [{ days: [0, 1, 2, 3, 4, 5, 6], from: 21.5, to: 30 }], rotation: { shiftsPerWeek: 4, varies: true } },
  logistics_shifts: { label: 'Warehouse shifts (early/late/night)', shifts: [{ days: WK, from: 6, to: 14 }, { days: WK, from: 14, to: 22 }, { days: WK, from: 22, to: 30 }], rotation: { fixedPerPerson: true } },
  site_day: { label: 'Site hours (trades/construction)', shifts: [{ days: WK, from: 7.5, to: 16.5 }, { days: [5], from: 8, to: 12, prob: 0.2 }] },
  gig_flexible: { label: 'App/gig: lunch + evening peaks', shifts: [{ days: [0, 1, 2, 3, 4, 5, 6], from: 11.5, to: 14, prob: 0.5 }, { days: [0, 1, 2, 3, 4, 5, 6], from: 17, to: 22.5, prob: 0.7 }], flex: 0.9 },
  taxi_hours: { label: 'Taxi/private hire', shifts: [{ days: [0, 1, 2, 3, 4, 5, 6], from: 6, to: 11, prob: 0.5 }, { days: [3, 4, 5], from: 20, to: 27, prob: 0.6 }, { days: [0, 1, 2, 3, 4, 5], from: 14, to: 19, prob: 0.5 }], flex: 0.8 },
  university_term: { label: 'University term-time timetable', shifts: [{ days: [0, 1, 2, 3, 4], from: 10, to: 16, prob: 0.8 }], termOnly: 'university' },
  teaching_secondary: { label: 'Secondary school day', shifts: [{ days: WK, from: 7.8, to: 16.8 }], termOnly: true },
};
const O = (id, label, soc, o) => ({ id, label, soc, ...o });
const P = (p10, med, p90) => ({ p10, median: med, p90 });
const FT = [35, 38, 45], PT = [14, 22, 30], FT40 = [37.5, 40, 48];

// SOC major groups (calibration.occupationSOC keys) -> numeric code
export const SOC_GROUPS = { 1: '1 Managers/directors', 2: '2 Professionals', 3: '3 Associate professional/technical', 4: '4 Admin/secretarial', 5: '5 Skilled trades', 6: '6 Caring/leisure/other service', 7: '7 Sales/customer service', 8: '8 Process/plant/machine operatives', 9: '9 Elementary' };

/** ---- Occupations. Fields: id, label, soc, pay{p10,median,p90}, hours[min,typ,max], pattern, where, dest (off-map destination key), qual (min qualification level key), age:[min,max typical], selfEmployed (prob), notes. ---- */
export const OCCUPATIONS = [
  // =============== on-map: shops & services ===============
  O('shop_owner_manager', 'Shop owner-manager (corner shop/grocer)', 1, { pay: P(14000, 26000, 55000), female: 0.33, ashe: '7131', hours: [55, 70, 85], pattern: 'flexible', where: 'onmap', qual: 'none', selfEmployed: 0.9, notes: 'family business; spouse and relatives staff it informally' }),
  O('retail_assistant', 'Retail assistant', 7, { pay: P(24800, 27050, 37300), female: 0.60, ashe: '7111', hours: [16, 28, 40], pattern: 'retail_rota', where: 'onmap', qual: 'none', age: [16, 70], partTime: 0.6 }),
  O('shop_supervisor', 'Shop supervisor / team leader', 7, { pay: P(25650, 30850, 41000), female: 0.48, ashe: '7132', hours: FT, pattern: 'retail_rota', where: 'onmap', qual: 'level2' }),
  O('store_manager', 'Store manager', 1, { pay: P(26400, 39100, 80200), female: 0.45, ashe: '1150', hours: [40, 45, 50], pattern: 'day', where: 'onmap', qual: 'level3' }),
  O('baker', 'Baker', 5, { pay: P(25250, 27350, 39550), female: 0.58, ashe: '5432', hours: FT, pattern: 'early', where: 'onmap', qual: 'level2' }),
  O('cafe_owner', 'Café owner', 1, { pay: P(13000, 24000, 48000), female: 0.47, ashe: '1222', hours: [50, 60, 75], pattern: 'flexible', where: 'onmap', qual: 'none', selfEmployed: 0.95 }),
  O('barista_waiter', 'Barista / waiter / front-of-house', 6, { pay: P(23600, 26000, 33700), female: 0.72, ashe: '9264+9266', hours: [12, 24, 38], pattern: 'split_shifts', where: 'onmap', qual: 'none', age: [16, 40], partTime: 0.6 }),
  O('cook_chef', 'Cook / chef', 5, { pay: P(25300, 30050, 42200), female: 0.40, ashe: '5434+5435', hours: [40, 45, 55], pattern: 'evening_shift', where: 'onmap', qual: 'level2' }),
  O('kitchen_porter_cook', 'Kitchen porter / takeaway cook', 9, { pay: P(24800, 26300, 33100), female: 0.58, ashe: '9263', hours: [30, 45, 60], pattern: 'evening_shift', where: 'onmap', qual: 'none' }),
  O('restaurant_manager', 'Restaurant manager', 1, { pay: P(24100, 32700, 59050), female: 0.53, ashe: '1222+5436', hours: [45, 50, 60], pattern: 'evening_shift', where: 'onmap', qual: 'level3' }),
  O('publican', 'Publican / pub manager', 1, { pay: P(23300, 34300, 57250), female: 0.58, ashe: '1223+5436', hours: [55, 65, 80], pattern: 'evening_shift', where: 'onmap', qual: 'level2', selfEmployed: 0.3 }),
  O('bar_staff', 'Bar staff', 6, { pay: P(23650, 26300, 34150), female: 0.61, ashe: '9265', hours: [12, 22, 38], pattern: 'evening_shift', where: 'onmap', qual: 'none', age: [18, 35], partTime: 0.7 }),
  O('delivery_rider', 'Delivery rider (app/takeaway)', 9, { pay: P(10000, 18000, 28000), female: 0.07, ashe: '8214', hours: [15, 30, 55], pattern: 'gig_flexible', where: 'onmap', qual: 'none', selfEmployed: 0.8, gig: true, age: [18, 45] }),
  O('delivery_driver', 'Delivery driver (van)', 8, { pay: P(24800, 27600, 36050), female: 0.07, ashe: '8214', hours: FT40, pattern: 'early', where: 'onmap', qual: 'level1', selfEmployed: 0.35 }),
  O('barber_hairdresser', 'Barber / hairdresser / beautician', 6, { pay: P(22650, 26200, 34250), female: 0.81, ashe: '6221+6222', hours: [30, 42, 55], pattern: 'flexible', where: 'onmap', qual: 'level2', selfEmployed: 0.55 }),
  O('launderette_attendant', 'Launderette attendant', 9, { pay: P(23150, 25750, 33400), female: 0.72, ashe: '9224', hours: [20, 30, 40], pattern: 'day', where: 'onmap', qual: 'none' }),
  O('betting_shop_cashier', 'Betting shop cashier', 7, { pay: P(24950, 28650, 41600), female: 0.59, ashe: '7112+7219', hours: [25, 35, 40], pattern: 'retail_rota', where: 'onmap', qual: 'none' }),
  O('tailor_seamstress', 'Tailor / seamstress / alterations', 5, { pay: P(20200, 27750, 40150), female: 0.75, ashe: '5413', hours: [30, 40, 55], pattern: 'flexible', where: 'onmap', qual: 'none', selfEmployed: 0.8 }),
  O('lettings_agent', 'Lettings / sales negotiator', 7, { pay: P(23800, 31950, 50600), female: 0.59, ashe: '3555', hours: FT40, pattern: 'day', where: 'onmap', qual: 'level2', notes: 'commission-heavy' }),
  O('office_administrator', 'Office administrator', 4, { pay: P(25400, 30800, 46100), female: 0.77, ashe: '4159', hours: FT, pattern: 'day', where: 'onmap', qual: 'level2' }),
  O('receptionist', 'Receptionist / admin (surgery, leisure, nursery)', 4, { pay: P(24800, 26800, 33850), female: 0.87, ashe: '4216', hours: [20, 32, 38], pattern: 'day', where: 'onmap', qual: 'level2', partTime: 0.4 }),
  O('security_guard', 'Security guard / door staff', 9, { pay: P(25250, 29750, 40950), female: 0.18, ashe: '9231', hours: [36, 44, 56], pattern: 'night', where: 'onmap', qual: 'none' }),
  O('taxi_driver', 'Taxi / private-hire driver', 8, { pay: P(15000, 24000, 38000), female: 0.03, ashe: '8213', hours: [30, 48, 65], pattern: 'taxi_hours', where: 'onmap', qual: 'none', selfEmployed: 0.9, gig: true, notes: 'rank at the station' }),
  O('dispatcher', 'Taxi dispatcher / controller', 4, { pay: P(26450, 37350, 51900), female: 0.65, ashe: '7213', hours: FT, pattern: 'late', where: 'onmap', qual: 'level2' }),
  // =============== on-map: trades & workshops ===============
  O('carpenter_joiner', 'Carpenter / joiner', 5, { pay: P(24800, 34100, 49400), female: 0.02, ashe: '5316', hours: FT40, pattern: 'site_day', where: 'onmap', qual: 'apprenticeship', selfEmployed: 0.5 }),
  O('welder_fabricator', 'Welder / fabricator', 5, { pay: P(26250, 32750, 47350), female: 0.03, ashe: '5213', hours: FT40, pattern: 'site_day', where: 'onmap', qual: 'apprenticeship' }),
  O('vehicle_technician', 'Vehicle technician (MOT/garage)', 5, { pay: P(25150, 34250, 48600), female: 0.03, ashe: '5231', hours: FT40, pattern: 'site_day', where: 'onmap', qual: 'apprenticeship' }),
  O('brewer', 'Craft brewer', 5, { pay: P(25000, 29850, 43250), female: 0.15, ashe: '5449', hours: FT40, pattern: 'site_day', where: 'onmap', qual: 'level3' }),
  O('printer_designer', 'Printer / graphic designer', 3, { pay: P(25600, 35700, 57000), female: 0.38, ashe: '2142+5422', hours: FT, pattern: 'flexible', where: 'onmap', qual: 'level3', selfEmployed: 0.4 }),
  O('artist_maker', 'Artist / maker / studio tenant', 3, { pay: P(6000, 15000, 34000), female: 0.54, ashe: '3411+3412', hours: [20, 35, 50], pattern: 'flexible', where: 'onmap', qual: 'level3', selfEmployed: 0.85, notes: 'usually second income' }),
  O('warehouse_operative', 'Warehouse operative (local unit)', 9, { pay: P(24800, 27900, 36400), female: 0.25, ashe: '9252', hours: FT40, pattern: 'early', where: 'onmap', qual: 'none' }),
  // =============== on-map: public services ===============
  O('gp', 'GP (partner/salaried)', 2, { pay: P(70000, 92000, 120000), female: 0.53, ashe: '2211', hours: [35, 45, 55], pattern: 'clinic', where: 'onmap', qual: 'level4plus', notes: 'rarely lives locally; often commutes in' }),
  O('practice_nurse', 'Practice nurse', 2, { pay: P(32250, 42500, 67850), female: 0.91, ashe: '2232', hours: [30, 34, 38], pattern: 'clinic', where: 'onmap', qual: 'level4plus' }),
  O('practice_manager', 'Practice manager', 1, { pay: P(24650, 41900, 84600), female: 0.90, ashe: '1231', hours: FT, pattern: 'day', where: 'onmap', qual: 'level4plus' }),
  O('pharmacist', 'Community pharmacist', 2, { pay: P(33950, 55400, 88500), female: 0.66, ashe: '2251', hours: [37.5, 40, 48], pattern: 'day', where: 'onmap', qual: 'level4plus' }),
  O('pharmacy_assistant', 'Pharmacy assistant / dispenser', 6, { pay: P(24800, 26200, 36400), female: 0.82, ashe: '7114', hours: [25, 35, 40], pattern: 'day', where: 'onmap', qual: 'level2' }),
  O('dentist', 'Dentist', 2, { pay: P(55000, 80000, 130000), female: 0.50, ashe: '2211', hours: [35, 40, 48], pattern: 'day', where: 'onmap', qual: 'level4plus' }),
  O('dental_nurse', 'Dental nurse', 6, { pay: P(24800, 28500, 37250), female: 0.95, ashe: '6133', hours: [30, 37.5, 40], pattern: 'day', where: 'onmap', qual: 'level3' }),
  O('primary_teacher', 'Primary school teacher', 2, { pay: P(32000, 47200, 61850), female: 0.79, ashe: '2314', hours: [40, 50, 58], pattern: 'school_day', where: 'onmap', qual: 'level4plus', notes: 'plus evening marking' }),
  O('headteacher', 'Headteacher', 1, { pay: P(52900, 73100, 116750), female: 0.56, ashe: '2321', hours: [50, 55, 65], pattern: 'school_day', where: 'onmap', qual: 'level4plus' }),
  O('teaching_assistant', 'Teaching assistant', 6, { pay: P(25800, 29600, 36150), female: 0.90, ashe: '6112', hours: [27, 32, 35], pattern: 'school_day', where: 'onmap', qual: 'level2', termOnlyPay: true, partTime: 0.5 }),
  O('school_support_staff', 'School caretaker / office / lunchtime supervisor', 9, { pay: P(25500, 29350, 38350), female: 0.55, ashe: '6232', hours: [10, 25, 37.5], pattern: 'school_day', where: 'onmap', qual: 'none' }),
  O('school_cook_midday', 'School cook / midday supervisor', 9, { pay: P(24800, 26300, 33100), female: 0.58, ashe: '9263', hours: [10, 18, 30], pattern: 'school_day', where: 'onmap', qual: 'none' }),
  O('nursery_manager', 'Nursery manager', 1, { pay: P(22850, 33150, 52900), female: 0.95, ashe: '2324', hours: FT, pattern: 'nursery', where: 'onmap', qual: 'level3' }),
  O('nursery_practitioner', 'Nursery practitioner', 6, { pay: P(17650, 25250, 37600), female: 0.95, ashe: '3232+6111', hours: [30, 37.5, 40], pattern: 'nursery', where: 'onmap', qual: 'level3' }),
  O('librarian', 'Librarian', 2, { pay: P(23600, 38850, 62050), female: 0.78, ashe: '2471', hours: [30, 37, 40], pattern: 'day', where: 'onmap', qual: 'level4plus' }),
  O('library_assistant', 'Library assistant', 4, { pay: P(25550, 32150, 47400), female: 0.78, ashe: '4135', hours: [18, 30, 37], pattern: 'day', where: 'onmap', qual: 'level2' }),
  O('community_centre_manager', 'Community centre manager', 1, { pay: P(20450, 34750, 70200), female: 0.45, ashe: '1224', hours: [37, 40, 48], pattern: 'flexible', where: 'onmap', qual: 'level3' }),
  O('youth_worker', 'Youth worker', 3, { pay: P(24750, 33850, 53600), female: 0.75, ashe: '3221', hours: [20, 30, 37], pattern: 'evening_shift', where: 'onmap', qual: 'level3' }),
  O('fitness_instructor', 'Fitness instructor / PT', 6, { pay: P(20350, 29350, 46450), female: 0.49, ashe: '3433+3432', hours: [20, 32, 45], pattern: 'split_shifts', where: 'onmap', qual: 'level3', selfEmployed: 0.55 }),
  O('leisure_receptionist', 'Gym / leisure receptionist', 7, { pay: P(24800, 27100, 34450), female: 0.79, ashe: '4216+6211', hours: [20, 32, 40], pattern: 'late', where: 'onmap', qual: 'level2' }),
  O('clergy', 'Priest / vicar / minister', 2, { pay: P(26700, 32550, 52000), female: 0.28, ashe: '2463', hours: [45, 55, 65], pattern: 'flexible', where: 'onmap', qual: 'level4plus', notes: 'stipend + housing; often lives in a tied house on-map' }),
  O('imam', 'Imam (mosque)', 2, { pay: P(26700, 32550, 52000), female: 0, sexOnly: 'M', // leads the congregation in mainstream UK mosques; women's religious roles are the separate religious_teacher
    ashe: '2463', hours: [40, 50, 60], pattern: 'flexible', where: 'onmap', qual: 'level3' }),
  O('religious_teacher', 'Religious teacher / faith worker (madrasa, chaplaincy, lay ministry)', 2, { pay: P(26700, 32550, 52000), female: 0.50, ashe: '2463+6112', hours: [20, 35, 50], pattern: 'flexible', where: 'onmap', qual: 'level3' }),
  O('church_caretaker', 'Church / mosque caretaker', 9, { pay: P(25500, 29350, 38350), female: 0.30, ashe: '6232', hours: [10, 20, 30], pattern: 'flexible', where: 'onmap', qual: 'none' }),
  // =============== off-map (the Metropolis) ===============
  // --- SOC 1 managers ---
  O('senior_manager', 'Senior manager / director (corporate/public)', 1, { pay: P(39000, 80950, 162100), female: 0.47, ashe: '1139+1131+1132+1136', hours: [40, 45, 55], pattern: 'office_hybrid', where: 'offmap', dest: 'city_centre_offices', qual: 'level4plus', age: [35, 62] }),
  O('operations_manager', 'Operations / site manager', 1, { pay: P(31100, 55850, 116050), female: 0.23, ashe: '1121+1122+1241+1242', hours: [40, 45, 52], pattern: 'office_onsite', where: 'offmap', dest: 'business_park', qual: 'level3', age: [30, 60] }),
  O('small_business_owner', 'Small-business owner (with employees)', 1, { pay: P(12000, 32000, 90000), female: 0.48, ashe: '1259', hours: [45, 55, 70], pattern: 'flexible', where: 'offmap', dest: 'industrial_estate', qual: 'level2', selfEmployed: 1, age: [30, 65] }),
  // --- SOC 2 professionals ---
  O('nurse', 'Nurse (hospital)', 2, { pay: P(32150, 44950, 63550), female: 0.84, ashe: '2237+2234+2231+2232+2235', hours: [30, 37.5, 45], pattern: 'nhs_shifts', where: 'offmap', dest: 'teaching_hospital', qual: 'level4plus', age: [22, 66] }),
  O('doctor_hospital', 'Doctor (hospital, incl. juniors)', 2, { pay: P(55100, 108300, 178850), female: 0.42, ashe: '2212', hours: [40, 48, 56], pattern: 'nhs_shifts', where: 'offmap', dest: 'teaching_hospital', qual: 'level4plus', age: [24, 60] }),
  O('allied_health', 'Allied health (physio/OT/radiographer/paramedic)', 2, { pay: P(34800, 48500, 77450), female: 0.66, ashe: '2221+2222+2254+2255', hours: [30, 37.5, 42], pattern: 'nhs_shifts', where: 'offmap', dest: 'teaching_hospital', qual: 'level4plus', age: [22, 62] }),
  O('secondary_teacher', 'Secondary teacher', 2, { pay: P(33300, 49500, 65250), female: 0.60, ashe: '2313', hours: [42, 50, 58], pattern: 'teaching_secondary', where: 'offmap', dest: 'secondary_school', qual: 'level4plus', age: [23, 62] }),
  O('lecturer_researcher', 'University lecturer / researcher', 2, { pay: P(30150, 53150, 83050), female: 0.50, ashe: '2311', hours: [37.5, 45, 55], pattern: 'university_term', where: 'offmap', dest: 'university', qual: 'level4plus', age: [26, 66] }),
  O('software_engineer', 'Software / data professional', 2, { pay: P(34600, 60450, 108400), female: 0.18, ashe: '2134+2133+2132', hours: [37.5, 40, 45], pattern: 'office_hybrid', where: 'offmap', dest: 'city_centre_offices', qual: 'level4plus', remote: 0.4, age: [22, 55] }),
  O('accountant_finance', 'Accountant / finance professional', 2, { pay: P(29400, 53200, 84900), female: 0.42, ashe: '2421+2422', hours: [37.5, 42, 50], pattern: 'office_hybrid', where: 'offmap', dest: 'city_centre_offices', qual: 'level4plus', age: [23, 62] }),
  O('solicitor_legal', 'Solicitor / legal professional', 2, { pay: P(34750, 57200, 91350), female: 0.63, ashe: '2412', hours: [40, 46, 55], pattern: 'office_hybrid', where: 'offmap', dest: 'city_centre_offices', qual: 'level4plus' }),
  O('engineer_architect', 'Engineer / architect / planner', 2, { pay: P(33350, 51000, 81450), female: 0.15, ashe: '2129+2121+2122+2451', hours: [37.5, 40, 45], pattern: 'office_hybrid', where: 'offmap', dest: 'city_centre_offices', qual: 'level4plus' }),
  O('social_worker', 'Social worker / probation / counsellor', 2, { pay: P(31950, 45900, 73300), female: 0.79, ashe: '2461', hours: [37, 40, 45], pattern: 'office_hybrid', where: 'offmap', dest: 'city_centre_offices', qual: 'level4plus' }),
  O('phd_student_stipend', 'PhD student / research assistant (stipend)', 2, { pay: P(19000, 21000, 25000), female: 0.50, ashe: '2311', hours: [30, 40, 50], pattern: 'university_term', where: 'offmap', dest: 'university', qual: 'level4plus', age: [22, 32] }),
  // --- SOC 3 associate professional ---
  O('it_support_technician', 'IT / science technician', 3, { pay: P(25650, 36450, 57800), female: 0.25, ashe: '3132+3119', hours: FT, pattern: 'office_hybrid', where: 'offmap', dest: 'city_centre_offices', qual: 'level3', remote: 0.3 }),
  O('marketing_media_creative', 'Marketing / media / creative associate', 3, { pay: P(26350, 38650, 61450), female: 0.62, ashe: '3554+2494+2493', hours: FT, pattern: 'office_hybrid', where: 'offmap', dest: 'city_centre_offices', qual: 'level4plus', remote: 0.3, age: [22, 50] }),
  O('hr_finance_associate', 'HR / finance / business associate', 3, { pay: P(28400, 41800, 66200), female: 0.65, ashe: '3571+3534+3549', hours: FT, pattern: 'office_hybrid', where: 'offmap', dest: 'city_centre_offices', qual: 'level3' }),
  O('police_fire_officer', 'Police officer / community support / fire', 3, { pay: P(35150, 51400, 69500), female: 0.31, ashe: '3312+3313', hours: [37, 40, 45], pattern: 'nhs_shifts', where: 'offmap', dest: 'city_centre_offices', qual: 'level3', notes: 'shift pattern reuse; four-on-four-off' }),
  O('paramedic_technician', 'Paramedic / ambulance technician', 3, { pay: P(33450, 45900, 70250), female: 0.48, ashe: '2255+6132', hours: [37.5, 40, 45], pattern: 'nhs_shifts', where: 'offmap', dest: 'teaching_hospital', qual: 'level3' }),
  O('sales_agent_b2b', 'Sales / account executive', 3, { pay: P(27350, 41700, 66000), female: 0.36, ashe: '3552', hours: FT40, pattern: 'office_hybrid', where: 'offmap', dest: 'city_centre_offices', qual: 'level3', notes: 'commission' }),
  O('freelancer_creative', 'Freelance designer / writer / photographer', 3, { pay: P(9000, 24000, 55000), female: 0.42, ashe: '3416+3417+3429+2142', hours: [15, 35, 55], pattern: 'remote', where: 'home', dest: null, qual: 'level4plus', selfEmployed: 1 }),
  // --- SOC 4 admin ---
  O('admin_clerk', 'Administrative / clerical (offices, councils, NHS)', 4, { pay: P(26150, 31400, 46200), female: 0.71, ashe: '4112+4111+4159+4131', hours: [30, 37, 40], pattern: 'office_onsite', where: 'offmap', dest: 'city_centre_offices', qual: 'level2', partTime: 0.3 }),
  O('bookkeeper_pa', 'Bookkeeper / PA / secretary', 4, { pay: P(26350, 35200, 56300), female: 0.76, ashe: '4122+4215', hours: [24, 35, 40], pattern: 'office_hybrid', where: 'offmap', dest: 'city_centre_offices', qual: 'level3', remote: 0.2 }),
  // --- SOC 5 skilled trades ---
  O('electrician_plumber', 'Electrician / plumber / gas engineer', 5, { pay: P(25150, 37300, 53150), female: 0.03, ashe: '5241+5315', hours: FT40, pattern: 'site_day', where: 'offmap', dest: 'industrial_estate', qual: 'apprenticeship', selfEmployed: 0.5 }),
  O('builder_labourer_trades', 'Builder / bricklayer / plasterer / painter-decorator', 5, { pay: P(25000, 33700, 48750), female: 0.02, ashe: '5313+5321+5323+5319', hours: FT40, pattern: 'site_day', where: 'offmap', dest: 'industrial_estate', qual: 'apprenticeship', selfEmployed: 0.55 }),
  O('mechanic_engineering_trades', 'Mechanic / machinist / engineering technician', 5, { pay: P(25950, 36650, 55250), female: 0.03, ashe: '5223+5221+5231', hours: FT40, pattern: 'site_day', where: 'offmap', dest: 'industrial_estate', qual: 'apprenticeship' }),
  O('chef_offmap', 'Chef (city restaurants/hotels)', 5, { pay: P(25350, 30450, 42550), female: 0.27, ashe: '5434', hours: [40, 48, 58], pattern: 'evening_shift', where: 'offmap', dest: 'city_centre_retail_leisure', qual: 'level2' }),
  // --- SOC 6 caring/leisure ---
  O('care_worker', 'Care worker (home care / care home)', 6, { pay: P(24900, 27250, 36350), female: 0.76, ashe: '6135', hours: [25, 37.5, 48], pattern: 'nhs_shifts', where: 'offmap', dest: 'other_neighbourhood', qual: 'none', partTime: 0.4, age: [19, 65], notes: 'zero-hours common; mileage unpaid' }),
  O('healthcare_assistant', 'Healthcare assistant / porter', 6, { pay: P(25350, 30050, 40250), female: 0.75, ashe: '6131', hours: [30, 37.5, 42], pattern: 'nhs_shifts', where: 'offmap', dest: 'teaching_hospital', qual: 'level2' }),
  O('childcare_nanny', 'Childcare worker / childminder (home-based)', 6, { pay: P(15000, 23000, 30000), female: 0.95, ashe: '6116+6111', hours: [30, 45, 55], pattern: 'day', where: 'home', qual: 'level3', selfEmployed: 0.5 }),
  O('hospitality_offmap', 'Hospitality / leisure worker (city)', 6, { pay: P(23600, 26100, 33850), female: 0.68, ashe: '9264+9266+9265', hours: [16, 30, 40], pattern: 'evening_shift', where: 'offmap', dest: 'city_centre_retail_leisure', qual: 'none', age: [18, 40], partTime: 0.5 }),
  O('cleaner_housekeeper', 'Cleaner / housekeeper', 9, { pay: P(24800, 26650, 33200), female: 0.77, ashe: '9223+6231', hours: [10, 20, 35], pattern: 'early', where: 'offmap', dest: 'city_centre_offices', qual: 'none', partTime: 0.65, selfEmployed: 0.2, age: [20, 70] }),
  // --- SOC 7 sales & customer service ---
  O('retail_city', 'Retail / sales assistant (city centre, retail park)', 7, { pay: P(24800, 27050, 37300), female: 0.60, ashe: '7111', hours: [16, 30, 40], pattern: 'retail_rota', where: 'offmap', dest: 'retail_park', qual: 'none', partTime: 0.55, age: [16, 65] }),
  O('call_centre_cs', 'Call-centre / customer-service adviser', 7, { pay: P(25200, 28850, 41800), female: 0.60, ashe: '7211+7219', hours: [30, 37.5, 40], pattern: 'office_onsite', where: 'offmap', dest: 'business_park', qual: 'level2', remote: 0.25 }),
  // --- SOC 8 process/transport ---
  O('hgv_van_driver', 'HGV / van / bus / rail driver', 8, { pay: P(26800, 32100, 44350), female: 0.05, ashe: '8211+8212+8219', hours: [40, 47, 56], pattern: 'logistics_shifts', where: 'offmap', dest: 'logistics_park', qual: 'level1', notes: 'bus drivers: early/late rotas' }),
  O('factory_operative', 'Factory / process / machine operative', 8, { pay: P(24900, 28500, 39150), female: 0.27, ashe: '8111+8149+8142', hours: [37, 40, 45], pattern: 'logistics_shifts', where: 'offmap', dest: 'industrial_estate', qual: 'level1' }),
  O('rideshare_driver', 'Private-hire / rideshare driver (app)', 8, { pay: P(11000, 20000, 34000), female: 0.03, ashe: '8213', hours: [25, 45, 65], pattern: 'taxi_hours', where: 'offmap', dest: 'city_centre_retail_leisure', qual: 'none', selfEmployed: 0.95, gig: true, age: [22, 62] }),
  // --- SOC 9 elementary ---
  O('warehouse_picker', 'Warehouse picker / packer', 9, { pay: P(24800, 27750, 36300), female: 0.27, ashe: '9252+9132', hours: FT40, pattern: 'logistics_shifts', where: 'offmap', dest: 'logistics_park', qual: 'none', age: [18, 60] }),
  O('airport_ground_staff', 'Airport / transport ground staff', 9, { pay: P(26700, 33800, 46600), female: 0.30, ashe: '8233', hours: [32, 40, 45], pattern: 'nhs_shifts', where: 'offmap', dest: 'airport', qual: 'none' }),
  O('food_factory_pack', 'Food factory / agency packer', 9, { pay: P(24900, 27550, 36500), female: 0.35, ashe: '9132+8111', hours: [24, 38, 45], pattern: 'logistics_shifts', where: 'offmap', dest: 'industrial_estate', qual: 'none', partTime: 0.3 }),
  O('delivery_courier_app', 'Courier / delivery (app, cloud-delivered)', 9, { pay: P(10000, 17000, 27000), female: 0.07, ashe: '8214', hours: [15, 30, 55], pattern: 'gig_flexible', where: 'offmap', dest: 'city_centre_retail_leisure', qual: 'none', selfEmployed: 0.9, gig: true, age: [18, 50] }),
  O('student_part_time', 'Student part-time job (hospitality/retail)', 9, { pay: P(8000, 10500, 14500), female: 0.63, ashe: '9264+7111', hours: [8, 15, 22], pattern: 'evening_shift', where: 'offmap', dest: 'city_centre_retail_leisure', qual: 'none', age: [17, 30], studentOnly: true }),
];

/** SOC group -> {occupation id: relative weight} of the residents' OFF-MAP + ON-MAP job mix. The founding generator draws SOC from calibration.occupationSOC, then an occupation here;
 *  on-map occupations are capped by the venue staffing slots (venues.js `staff`), with overflow redrawn from the off-map entries of the same SOC group. */
export const SOC_TO_OCC = {
  1: { senior_manager: 3, operations_manager: 3, small_business_owner: 3, shop_owner_manager: 0.8, cafe_owner: 0.5, publican: 0.2, store_manager: 0.6, restaurant_manager: 0.4, practice_manager: 0.2, headteacher: 0.1, nursery_manager: 0.2, community_centre_manager: 0.1 },
  2: { nurse: 4, doctor_hospital: 2, allied_health: 1.5, secondary_teacher: 3, primary_teacher: 1, lecturer_researcher: 1.5, software_engineer: 4, accountant_finance: 2.5, solicitor_legal: 1.2, engineer_architect: 2, social_worker: 1.8, phd_student_stipend: 0.8, practice_nurse: 0.3, pharmacist: 0.3, librarian: 0.2, gp: 0.2, dentist: 0.1, clergy: 0.1, imam: 0.05, religious_teacher: 0.1 },
  3: { it_support_technician: 2, marketing_media_creative: 2.5, hr_finance_associate: 2.5, police_fire_officer: 1.2, paramedic_technician: 0.8, sales_agent_b2b: 2, freelancer_creative: 1.5, printer_designer: 0.2, artist_maker: 0.3, youth_worker: 0.3 },
  4: { admin_clerk: 6, bookkeeper_pa: 2, office_administrator: 0.4, receptionist: 0.6, library_assistant: 0.1, dispatcher: 0.1 },
  5: { electrician_plumber: 3, builder_labourer_trades: 4, mechanic_engineering_trades: 2, chef_offmap: 1.5, cook_chef: 0.8, baker: 0.3, carpenter_joiner: 0.4, welder_fabricator: 0.4, vehicle_technician: 0.4, brewer: 0.1, tailor_seamstress: 0.2 },
  6: { care_worker: 4, healthcare_assistant: 2.5, hospitality_offmap: 1.5, childcare_nanny: 1, barista_waiter: 0.7, bar_staff: 0.5, barber_hairdresser: 1, nursery_practitioner: 0.5, teaching_assistant: 1, fitness_instructor: 0.4, pharmacy_assistant: 0.2, dental_nurse: 0.2 },
  7: { retail_city: 4, retail_assistant: 1.4, call_centre_cs: 3, shop_supervisor: 0.4, lettings_agent: 0.3, betting_shop_cashier: 0.2, leisure_receptionist: 0.2 },
  8: { hgv_van_driver: 3, factory_operative: 2.5, rideshare_driver: 1, taxi_driver: 0.8, delivery_driver: 0.6 },
  9: { warehouse_picker: 3, food_factory_pack: 1.5, cleaner_housekeeper: 2.5, airport_ground_staff: 0.8, delivery_courier_app: 0.9, delivery_rider: 0.4, kitchen_porter_cook: 0.8, security_guard: 0.6, launderette_attendant: 0.1, school_support_staff: 0.3, school_cook_midday: 0.1, warehouse_operative: 0.3, church_caretaker: 0.05 },
};

// Contract/employment types (calibration.economicActivity16plus.hoursShareOfEmployed & selfEmployedShareOfEmployed apply across the whole workforce)
export const CONTRACT_TYPES = {
  permanent: { label: 'Permanent', securityIndex: 1.0, sickPay: 'ssp+occupational' }, zero_hours: { label: 'Zero-hours / agency', securityIndex: 0.35, sickPay: 'none' },
  fixed_term: { label: 'Fixed-term', securityIndex: 0.6, sickPay: 'ssp' }, self_employed: { label: 'Self-employed (own account)', securityIndex: 0.45, sickPay: 'none' },
  gig: { label: 'Platform/gig', securityIndex: 0.2, sickPay: 'none' }, apprenticeship: { label: 'Apprenticeship', securityIndex: 0.7, sickPay: 'ssp' },
};
// UK tax/benefit parameters (2026/27 rUK-England; used by the money system; approximate)
export const TAX = { personalAllowance: 12570, basicRateBand: 37700, basicRate: 0.2, higherRate: 0.4, additionalThreshold: 125140, additionalRate: 0.45, niPrimaryRate: 0.08, niPrimaryThreshold: 12570, niUpperEarningsLimit: 50270, niUpperRate: 0.02, studentLoanPlan2Threshold: 28470, studentLoanRate: 0.09, councilTaxBandAMonthly: 135, councilTaxBandBMonthly: 157, councilTaxBandCMonthly: 180 };
export const BENEFITS = { universalCreditStandardAllowanceMonthlySingle25plus: 424.9, universalCreditCouple25plus: 666.97, childElementMonthly: 292.81, statePensionWeeklyNewFull: 230.25, jsaEquivalentFromUC: true, childBenefitWeeklyFirst: 26.05, childBenefitWeeklyOther: 17.25, housingBenefitLHAByBedrooms: { 1: 620, 2: 760, 3: 860, 4: 1050 }, disabilityPIPWeeklyStandardDaily: 73.9 };
export default { OCCUPATIONS, PATTERNS, SOC_GROUPS, SOC_TO_OCC, CONTRACT_TYPES, TAX, BENEFITS, NLW_HOURLY_2026 };

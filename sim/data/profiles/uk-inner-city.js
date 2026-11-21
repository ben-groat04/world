// Area profile: typical UK inner-city neighbourhood (DEFAULT).
// Composite of inner-urban wards in 16 non-London UK cities (England + Cardiff), ONS Census 2021 (Nomis, 2022 wards),
// selected by rule and population-weighted by city - see reference.composite and ../../../CALIBRATION.md.
// Same schema as any profile: area-specific blocks only; national blocks live in ../calibration.js and are merged by getProfile().
// Confidence: 'measured' = published figure, 'derived' = computed by us from published figures, 'estimate' = our judgement.
// Shares are fractions (0-1) unless a key says Pct or Per1000.
export default {
 "reference": {
  "id": "uk-inner-city",
  "name": "Typical UK inner-city neighbourhood (composite of inner-urban wards in 16 non-London UK cities)",
  "why": "A general inner-urban neighbourhood: terraces + purpose-built flats + converted houses, renter-heavy, young and diverse but not London-extreme (median age ~32, 65+ ~10%, ~42% car-free). Built from 95 inner wards in 16 cities across the North, Midlands, South and Wales, selected by rule and population-weighted by city. Scotland and Northern Ireland are NOT in the measured blocks (different census year/tables): national E&W figures are used for them and the profile should be read as England-and-Wales urban.",
  "composite": {
   "census": "Census 2021 (27 March 2021 - during COVID restrictions: WFH, commuting and 1-year moves are distorted)",
   "unit": "2022 wards (Census 2021 TS tables); shares pooled over selected wards within each city, then averaged across cities with the weights below",
   "selectionRule": "ward is \"inner-urban\" if renters (social+private) >= 42% of households AND detached+semi-detached <= 35% of dwellings AND full-time students <= 30% of residents 16+ (excludes suburban owner estates and student enclaves such as Headingley/Cathays-type wards)",
   "cityWardsSelected": {
    "Manchester": 9,
    "Leeds": 4,
    "Bristol": 8,
    "Birmingham": 15,
    "Sheffield": 3,
    "Nottingham": 1,
    "Liverpool": 10,
    "Newcastle": 3,
    "Leicester": 1,
    "Norwich": 8,
    "Reading": 6,
    "Portsmouth": 5,
    "Plymouth": 4,
    "Brighton": 9,
    "Southampton": 5,
    "Cardiff": 4
   },
   "cityWeightsUsed": {
    "Manchester": 0.0824,
    "Leeds": 0.1213,
    "Bristol": 0.0705,
    "Birmingham": 0.1712,
    "Sheffield": 0.083,
    "Nottingham": 0.0482,
    "Liverpool": 0.0726,
    "Newcastle": 0.0448,
    "Leicester": 0.055,
    "Norwich": 0.0214,
    "Reading": 0.0261,
    "Portsmouth": 0.0311,
    "Plymouth": 0.0396,
    "Brighton": 0.0414,
    "Southampton": 0.0373,
    "Cardiff": 0.0541
   },
   "weightBasis": "approx. 2021 city (LAD) population, renormalised over cities with >=1 selected ward (Birmingham 1146k, Leeds 812k, Sheffield 556k, Manchester 552k, Liverpool 486k, Bristol 472k, Leicester 368k, Cardiff 362k, Nottingham 323k, Newcastle 300k, Brighton & Hove 277k, Plymouth 265k, Southampton 250k, Portsmouth 208k, Reading 175k, Norwich 143k)",
   "caveats": "Nottingham and Leicester have 1 selected ward each (their inner wards are mostly student/suburban by the rule), Sheffield/Newcastle 3: thin cells. Weighted pooled means, not true medians. Glasgow, Edinburgh and Belfast (~8% of UK city population) excluded.",
   "nWards": 95
  },
  "avgHouseholdSize": 2.39,
  "scaleTo500": {
   "households": 209,
   "note": "500 residents ~ 209 households at 2.39 persons/household"
  },
  "confidence": "derived",
  "source": "ONS Census 2021 via Nomis API (nomisweb.co.uk/api/v01/dataset/NM_20xx_1, 2022-ward geography TYPE153); selection and aggregation by us (see composite.*)"
 },
 "ageStructure": {
  "composite": {
   "0-4": 0.0614,
   "5-9": 0.062,
   "10-14": 0.0614,
   "15-19": 0.0635,
   "20-24": 0.0997,
   "25-29": 0.1013,
   "30-34": 0.0932,
   "35-39": 0.0798,
   "40-44": 0.0669,
   "45-49": 0.0592,
   "50-54": 0.0569,
   "55-59": 0.0505,
   "60-64": 0.041,
   "65-69": 0.0322,
   "70-74": 0.0266,
   "75-79": 0.0182,
   "80-84": 0.0134,
   "85+": 0.013
  },
  "englandPct": {
   "0-4": 5.4,
   "5-9": 5.9,
   "10-14": 6.0,
   "15-19": 5.7,
   "20-24": 6.0,
   "25-29": 6.6,
   "30-34": 7.0,
   "35-39": 6.7,
   "40-44": 6.3,
   "45-49": 6.4,
   "50-54": 6.9,
   "55-59": 6.7,
   "60-64": 5.8,
   "65-69": 4.9,
   "70-74": 5.0,
   "75-79": 3.6,
   "80-84": 2.5,
   "85+": 2.4
  },
  "medianAge": 32.1,
  "over65": 0.1034,
  "source": "ONS Census 2021 TS007 (age by single year) aggregated to 5-year bands over selected wards; England % from TS007A",
  "confidence": "derived",
  "note": "Composite is younger than England (65+ 10.3% vs 18.4%) and more family-heavy than a London borough."
 },
 "ethnicity": {
  "shares": {
   "White": 0.5778,
   "Black/African/Caribbean": 0.1058,
   "Asian": 0.2237,
   "Mixed": 0.0444,
   "Other (incl Arab)": 0.0483
  },
  "detail": {
   "White British": 0.4877,
   "Other White": 0.0901,
   "Indian": 0.0668,
   "Pakistani": 0.0879,
   "Bangladeshi": 0.0311,
   "Chinese": 0.0133,
   "Other Asian": 0.0247,
   "African": 0.0758,
   "Caribbean": 0.0189
  },
  "source": "ONS Census 2021 TS021",
  "confidence": "derived",
  "note": "Asian (Pakistani/Bangladeshi/Indian) is the largest minority group, as in Birmingham, Leicester, Manchester, Sheffield, Leeds; Black share is lower than in London."
 },
 "religion": {
  "shares": {
   "No religion": 0.3444,
   "Christian": 0.3108,
   "Muslim": 0.2365,
   "Jewish": 0.002,
   "Buddhist": 0.0059,
   "Hindu": 0.0226,
   "Sikh": 0.0103,
   "Other": 0.0068,
   "Not answered": 0.0608
  },
  "source": "ONS Census 2021 TS030",
  "confidence": "derived",
  "note": "Muslim share is high because rule-selected inner wards in Birmingham/Manchester/Leeds/Leicester are heavily South Asian."
 },
 "birthplace": {
  "bornInUK": 0.6879,
  "englandNationalBornInUK": 0.826,
  "source": "ONS Census 2021 TS004",
  "confidence": "derived",
  "note": "Only born-in-UK computed for the composite; year-of-arrival splits omitted (assume ~15-20% arrived within the last 10 years)."
 },
 "sexualOrientation16plus": {
  "straight": 0.894,
  "gayLesbian": 0.015,
  "bisexual": 0.013,
  "other": 0.003,
  "notAnswered": 0.075,
  "source": "ONS Census 2021 TS077, England & Wales national (not computed for wards)",
  "confidence": "estimate",
  "note": "Inner cities are above national for LGB+ (urban 2-3x), but no composite computed; use national as floor."
 },
 "health": {
  "generalHealthCrude": {
   "veryGood": 0.4878,
   "good": 0.3272,
   "fair": 0.125,
   "bad": 0.0458,
   "veryBad": 0.0143
  },
  "disabledAnyEqualityAct": 0.1761,
  "disabledLimitedALot": 0.0791,
  "source": "ONS Census 2021 TS037 / TS038 (crude, NOT age-standardised)",
  "confidence": "derived"
 },
 "householdSize": {
  "composite": {
   "1 person": 0.3654,
   "2 people": 0.2892,
   "3 people": 0.1364,
   "4 people": 0.103,
   "5 people": 0.054,
   "6 people": 0.0275,
   "7 people": 0.0126,
   "8+ people": 0.0117
  },
  "england": {
   "1": 0.301,
   "2": 0.34,
   "3": 0.16,
   "4": 0.129,
   "5": 0.045,
   "6": 0.015,
   "7": 0.005,
   "8+": 0.004
  },
  "source": "ONS Census 2021 TS017",
  "confidence": "derived"
 },
 "householdComposition": {
  "composite": {
   "One person aged 66+": 0.0894,
   "One person under 66": 0.276,
   "Married/civil partner couple, no children": 0.0646,
   "Married couple, dependent children": 0.1257,
   "Married couple, all children non-dependent": 0.0343,
   "Cohabiting couple, no children": 0.0832,
   "Cohabiting couple, dependent children": 0.0336,
   "Cohabiting couple, non-dependent children": 0.005,
   "Lone parent, dependent children": 0.0825,
   "Lone parent, non-dependent children": 0.0431,
   "Couple/other single-family aged 66+ (all 66+)": 0.031,
   "Other single family": 0.0298,
   "Other households with dependent children (multi-family/sharers)": 0.0391,
   "Other: sharers, all full-time students, multigen etc": 0.0775
  },
  "englandOnePerson": 0.301,
  "englandLoneParentDependent": 0.069,
  "englandOtherSharers": 0.042,
  "source": "ONS Census 2021 TS003",
  "confidence": "derived",
  "note": "One-person households are the biggest type; couples with dependent children are ~16%; lone parents with dependent children ~8%."
 },
 "tenure": {
  "composite": {
   "Owned outright": 0.1824,
   "Owned with mortgage/loan": 0.1931,
   "Shared ownership": 0.0064,
   "Social rent - council": 0.1471,
   "Social rent - housing association/other": 0.1218,
   "Private rent - landlord/agency": 0.323,
   "Private rent - other": 0.0234,
   "Rent free": 0.0028
  },
  "englandPct": {
   "ownedOutright": 32.5,
   "ownedMortgage": 28.8,
   "sharedOwnership": 1.0,
   "socialRent": 17.1,
   "privateRent": 20.5,
   "rentFree": 0.1
  },
  "source": "ONS Census 2021 TS054",
  "confidence": "derived",
  "note": "Renting ~64%: private rent 35%, social rent 27%; owner-occupied ~38% (England 61%). Social renting is split council ~15% / housing association ~12%."
 },
 "accommodationType": {
  "detached": 0.0492,
  "semi": 0.1536,
  "terraced": 0.3571,
  "purposeBuiltFlats": 0.333,
  "convertedOrSharedHouse": 0.0751,
  "otherConvertedBuilding": 0.0192,
  "commercialBuilding": 0.0118,
  "caravan": 0.001,
  "source": "ONS Census 2021 TS044",
  "confidence": "derived",
  "note": "Terraced houses (36%) and purpose-built flats (33%) dominate. England: 22.9% detached, 17.1% purpose-built flats."
 },
 "carOwnership": {
  "composite": {
   "none": 0.4224,
   "one": 0.4154,
   "two": 0.1313,
   "threePlus": 0.0309
  },
  "england": {
   "none": 0.235,
   "one": 0.413,
   "two": 0.261,
   "threePlus": 0.091
  },
  "source": "ONS Census 2021 TS045",
  "confidence": "derived"
 },
 "relationships": {
  "legalStatus16plus": {
   "neverMarried": 0.45,
   "married": 0.37,
   "civilPartnership": 0.003,
   "separated": 0.03,
   "divorced": 0.095,
   "widowed": 0.05
  },
  "livingInCouple": 0.5,
  "livingInCouple_england": 0.578,
  "englandWalesLegalStatus16plus_TS002": {
   "neverMarried": 0.379,
   "marriedOrCP": 0.447,
   "separated": 0.0225,
   "divorced": 0.0907,
   "widowed": 0.0606
  },
  "source": "TS002 is not published at ward level; composite values interpolate between E&W (TS002: never married 37.9%, married/CP 44.7%) and the youth/renter skew of the composite households",
  "confidence": "estimate"
 },
 "economicActivity16plus": {
  "employed": 0.5509,
  "unemployed": 0.0557,
  "retired": 0.1144,
  "student": 0.0983,
  "lookingAfterHomeFamily": 0.0714,
  "longTermSickDisabled": 0.0586,
  "otherInactive": 0.0508,
  "fullTimeStudentsWorkingOrSeeking": 0.0411,
  "selfEmployedShareOfEmployed": {
   "withEmployees": 0.022,
   "withoutEmployees": 0.1209
  },
  "hoursShareOfEmployed": {
   "partTime<=15": 0.1094,
   "partTime16-30": 0.2122,
   "fullTime31-48": 0.6022,
   "fullTime49+": 0.0763
  },
  "source": "ONS Census 2021 TS066 / TS059",
  "confidence": "derived",
  "note": "\"employed\" includes employed full-time students (4.1%); shares are of residents 16+."
 },
 "occupationSOC": {
  "composite": {
   "1 Managers/directors": 0.0805,
   "2 Professionals": 0.2231,
   "3 Associate professional/technical": 0.1269,
   "4 Admin/secretarial": 0.0792,
   "5 Skilled trades": 0.0752,
   "6 Caring/leisure/other service": 0.0965,
   "7 Sales/customer service": 0.088,
   "8 Process/plant/machine operatives": 0.0818,
   "9 Elementary": 0.1488
  },
  "englandPct": {
   "1": 12.9,
   "2": 20.3,
   "3": 13.3,
   "4": 9.3,
   "5": 10.2,
   "6": 9.3,
   "7": 7.5,
   "8": 6.9,
   "9": 10.5
  },
  "source": "ONS Census 2021 TS063",
  "confidence": "derived",
  "note": "SOC 1-3 is 43% (England 46.5%); SOC 6-9 service/operative/elementary is 42%."
 },
 "industry": {
  "composite": {
   "Manufacturing (C)": 0.0671,
   "Public admin (O)": 0.0533,
   "Construction (F)": 0.0525,
   "Other (agri, mining, utilities, water)": 0.0122,
   "Info & communication (J)": 0.0507,
   "Admin & support (N)": 0.0607,
   "Other incl arts/entertainment (R-U)": 0.0442,
   "Retail & wholesale (G)": 0.1474,
   "Transport & storage (H)": 0.0644,
   "Education (P)": 0.1037,
   "Real estate (L)": 0.0123,
   "Health & social work (Q)": 0.1642,
   "Accommodation & food (I)": 0.0705,
   "Prof/scientific/technical (M)": 0.0646,
   "Financial & insurance (K)": 0.0322
  },
  "detail": {
   "foodAndBeverageService": 0.0629,
   "retail": 0.1107,
   "postalCourier": 0.0158,
   "humanHealth": 0.1032,
   "residentialCare": 0.0162,
   "socialWork": 0.0448,
   "education": 0.1037,
   "construction": 0.0525,
   "computerProgramming": 0.0318,
   "securityInvestigation": 0.0091,
   "buildingServicesCleaning": 0.0254
  },
  "source": "ONS Census 2021 TS060 (2-digit divisions grouped to sections by us)",
  "confidence": "derived"
 },
 "qualifications16plus": {
  "none": 0.216,
  "level1": 0.0905,
  "level2": 0.1088,
  "apprenticeship": 0.0378,
  "level3": 0.1589,
  "level4plus": 0.3581,
  "other": 0.0299,
  "englandLevel4plus": 0.339,
  "source": "ONS Census 2021 TS067",
  "confidence": "derived"
 },
 "nsSec16plus": {
  "higherManagerialProf": 0.1077,
  "lowerManagerialProf": 0.158,
  "intermediate": 0.0902,
  "smallEmployersOwnAccount": 0.0774,
  "lowerSupervisoryTechnical": 0.0443,
  "semiRoutine": 0.1055,
  "routine": 0.1422,
  "neverWorkedLongTermUnemployed": 0.1404,
  "fullTimeStudents": 0.1343,
  "source": "ONS Census 2021 TS062",
  "confidence": "derived"
 },
 "commuteMode": {
  "allEmployed_census2021": {
   "workFromHome": 0.2987,
   "tube/metro/light rail": 0.0074,
   "train": 0.0164,
   "bus": 0.0986,
   "taxi": 0.016,
   "motorcycle": 0.0036,
   "drivingCarVan": 0.3297,
   "carPassenger": 0.0443,
   "bicycle": 0.0323,
   "walk": 0.139,
   "other": 0.0139
  },
  "commutersOnly_excludingHome": {
   "tube/metro/light rail": 0.0106,
   "train": 0.0234,
   "bus": 0.1406,
   "taxi": 0.0228,
   "motorcycle": 0.0051,
   "drivingCarVan": 0.4701,
   "carPassenger": 0.0632,
   "bicycle": 0.0461,
   "walk": 0.1982,
   "other": 0.0198
  },
  "englandAllEmployed": {
   "workFromHome": 0.315,
   "driving": 0.445,
   "walk": 0.076,
   "bus": 0.043,
   "train": 0.02,
   "metro": 0.019,
   "bicycle": 0.021
  },
  "source": "ONS Census 2021 TS061",
  "confidence": "derived",
  "note": "Driving is the largest single mode (~33% of workers, ~47% of commuters) even in inner wards; bus 14% of commuters, walking 20%, cycling 4.6%. Census day was in lockdown so WFH (30%) is inflated."
 },
 "workLocation": {
  "census2021CompositeWFH": 0.2987,
  "censusEnglandWFH": 0.315,
  "simSuggestion_postPandemic": {
   "onSiteOnly": 0.62,
   "hybrid": 0.28,
   "fullyRemote": 0.1
  },
  "source": "Census 2021 TS061 (composite); ONS OPN hybrid (national, in shared block)",
  "confidence": "estimate",
  "note": "simSuggestion is our estimate: only ~43% of workers are SOC 1-3, so hybrid is near the GB 28% average and fully-remote is lower than a professional-heavy area."
 },
 "gigWork": {
  "compositeCensus2021": {
   "postalAndCourierShareOfEmployed": 0.0158,
   "selfEmployedNoEmployees": 0.1209
  },
  "simSuggestion": {
   "primaryIncomeAppDeliveryOrDriving": 0.02,
   "anyAppBasedLocalGigIncludingSideWork": 0.04,
   "note": "~2% of workers main-income, ~4% incl. side hustle: slightly above the strict LFS 1.4% as inner wards have more taxi/courier/delivery work."
  },
  "source": "Census 2021 TS060 postal/courier (division 53, includes all postal workers); sim suggestion = estimate scaled from national blocks",
  "confidence": "estimate"
 },
 "incomeAndRent": {
  "compositeResidentFullTimeMedianGrossAnnual_estimate": 33000,
  "compositeResidentPartTimeMedianGrossAnnual_estimate": 11500,
  "compositeMeanPrivateRentPerMonth_estimate": {
   "all": 1000,
   "1bed": 800,
   "2bed": 950,
   "3bed": 1050
  },
  "source": "estimate from ONS ASHE regional resident medians (North/Midlands/South-West below England median) shaded down for inner-ward occupation mix; rents from ONS PRMS England-excluding-London level and city means (not fetched ward-level)",
  "confidence": "estimate",
  "note": "Shared block holds England-wide figures (FT median £39.2k, mean rent £1,332 incl. London). Treat the composite numbers as +/-15%; rent/income ratio ~35-40% for a median renting household on one wage."
 },
 "mobility": {
  "oneYearAgoAddress": {
   "composite": {
    "same": 0.8392,
    "termTime": 0.0145,
    "movedFromElsewhereUK": 0.1267,
    "movedFromAbroad": 0.0196
   },
   "england": {
    "same": 0.889,
    "termTime": 0.006,
    "movedFromElsewhereUK": 0.096,
    "movedFromAbroad": 0.009
   }
  },
  "movesPer100ResidentsPerYearByAge_estimate": {
   "0-4": 14.6,
   "5-14": 8.3,
   "15-19": 8.3,
   "20-24": 33.6,
   "25-29": 33.6,
   "30-34": 27.3,
   "35-44": 12.6,
   "45-54": 7.3,
   "55-64": 5.3,
   "65-74": 4.2,
   "75+": 5.3
  },
  "source": "ONS Census 2021 TS019 (composite); age profile is our estimate scaled from the earlier shape (peak 20-34) to match the composite total",
  "confidence": "derived",
  "note": "~16% of residents had a different address a year earlier (England 11%): about 1 in 6 move each year."
 },
 "mortality": {
  "derivedCrudeDeathRatePer1000": 5.68,
  "derivedExpectedDeathsPer500PerYear": 2.84,
  "source": "E&W 2022-24 life-table qx (shared block) applied to the composite age structure by us (male/female averaged)",
  "confidence": "derived",
  "note": "No local mortality adjustment: deprived inner wards have lower life expectancy than E&W, so true mortality is probably somewhat higher than this; the migrant-health effect partly offsets."
 },
 "fertility": {
  "tfrComposite_estimate": 1.45,
  "tfr": {
   "manchester": 1.4,
   "note": "LAD-level TFRs outside London cluster at 1.3-1.6; E&W 1.44 (2023)"
  },
  "asfrComposite_derived": {
   "15-19": 8.5,
   "20-24": 39.8,
   "25-29": 77.5,
   "30-34": 93.3,
   "35-39": 56.6,
   "40+": 15.4
  },
  "derivedCrudeBirthRatePer1000": 13.3,
  "derivedBirthsPer500PerYear": 6.6,
  "source": "ONS births summary tables 2022 (E&W ASFR, shared block) scaled to the composite TFR; Manchester TFR from the same ONS table",
  "confidence": "estimate",
  "note": "TFR estimate = E&W 1.44-1.49 adjusted for inner-city compositional effects (young, diverse, renting); not a measured composite. Shape is the national curve; inner-city curves skew later."
 },
 "crime": {
  "urbanForcesWeightedPer1000_YE_Dec2024": {
   "totalExcFraud": 94.955,
   "violenceAgainstPerson": 36.878,
   "violenceWithInjury": 9.775,
   "violenceWithoutInjury": 14.968,
   "stalkingHarassment": 12.092,
   "homicide": 0.009,
   "sexualOffences": 3.728,
   "robbery": 1.226,
   "theftOffences": 28.798,
   "burglaryAll": 4.583,
   "burglaryResidentialPer1000Households": 7.936,
   "vehicleOffences": 6.291,
   "theftFromPerson": 0.865,
   "bicycleTheft": 0.817,
   "shoplifting": 9.265,
   "otherTheft": 6.978,
   "criminalDamageArson": 8.512,
   "drugOffences": 3.447,
   "weaponsPossession": 1.226,
   "publicOrder": 8.809
  },
  "manchesterCSPRecordedPer1000": {
   "total": 156.0,
   "violenceAgainstPerson": 54.89,
   "theftOffences": 49.3,
   "theftFromPerson": 6.58,
   "bicycleTheft": 2.07,
   "shoplifting": 9.65,
   "criminalDamage": 11.27,
   "robbery": 3.27,
   "publicOrder": 16.88,
   "drugs": 8.87,
   "sexual": 5.53
  },
  "innerCityFactor_estimate": 1.35,
  "source": "ONS Police force area data tables YE Dec 2024 Table P3 (rate per 1,000): GMP, West Yorkshire, South Yorkshire, Merseyside, West Midlands, Avon & Somerset, Leicestershire, Nottinghamshire, Northumbria, Sussex, Devon & Cornwall, Hampshire, Thames Valley, Norfolk, South Wales, weighted by the city weights; Manchester CSP from Table C4",
  "confidence": "measured (force rates) / estimate (inner-city factor)",
  "simSuggestion": "Force-wide urban rate is ~95 recorded offences/1000 (non-London); inner wards run higher: Manchester city 156 vs GMP 110 (x1.4). Apply x1.35 => ~128/1000 => ~64 offences per 500 residents per year (about half theft/shoplifting/vehicle, ~30% violence incl. harassment, burglary ~8 per 1000 households inner-city). Theft from person and bike theft are far lower than in London (0.9 and 0.8 per 1000 force-wide); violence and criminal damage are higher. Homicide ~0.01 per 1000: ~1 per 200 neighbourhood-years at 500 pop. Fraud not in these figures."
 }
};

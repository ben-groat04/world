# CALIBRATION - real-data anchors for Larkfield

Files: `sim/data/calibration.js` (shared national blocks + `getProfile(id='uk-inner-city')`, `PROFILES`, default export = merged default profile)
and `sim/data/profiles/uk-inner-city.js` (area blocks, same schema for any future profile). Every block has `source` + `confidence`.
Confidence: **measured** = published figure, **derived** = we computed it from published figures, **estimate** = our judgement (flagged).

## Reference: a typical UK inner-city neighbourhood
A composite of **inner-urban wards in 16 non-London UK cities**, ONS Census 2021 via the Nomis API (2022 wards, TS tables), plus national series for non-local things.
Read Larkfield as "the ordinary inner-city patch of a British city", not London.

**Cities (approx. population weights):** Birmingham 17%, Leeds 12%, Sheffield 8%, Manchester 8%, Liverpool 7%, Bristol 7%, Leicester 5.5%, Cardiff 5.4%,
Nottingham 4.8%, Newcastle 4.5%, Brighton & Hove 4.1%, Plymouth 4.0%, Southampton 3.7%, Portsmouth 3.1%, Reading 2.6%, Norwich 2.1%
(North 40%, Midlands 28%, South and Wales 32%; weights = 2021 city populations, renormalised).
**Selection rule (95 wards):** renters (social + private) >= 42% of households AND detached + semi <= 35% of dwellings AND full-time students <= 30% of 16+.
This keeps terraced/flat/renter-heavy inner wards, drops suburban estates and student enclaves. **Aggregation:** pooled within each city, then weighted across cities (means, not medians).
**Not covered:** Glasgow, Edinburgh and Belfast (~8% of UK city population) - Scotland's Census 2022 and NISRA tables are not directly comparable, so E&W figures stand in; read as England-and-Wales urban.
**Thin cells:** Nottingham and Leicester have 1 selected ward each, Sheffield/Newcastle 3 (their inner wards are mostly student or suburban by the rule).
Census day (27 Mar 2021) was in lockdown: WFH, commuting and 1-year moves are distorted. Scale: 500 residents ~ 209 households (2.39 per household).

## Key numbers (composite unless stated)
- **Age**: 0-14 18.5%; 15-24 16.3%; 25-39 27.4%; 40-64 27.5%; 65+ 10.3% (England 18.4%); median 32. 25-34 = 19.5%.
- **Ethnicity**: White 58% (White British 49%), Asian 22% (Pakistani 8.8%, Indian 6.7%, Bangladeshi 3.1%), Black 10.6%, Mixed 4.4%, Other 4.8%.
  Religion: none 34%, Christian 31%, Muslim 24%, Hindu 2%, Sikh 1%. Born in UK 69%.
- **Households**: one-person 36.5% (66+: 9%); couples with dependent children 16%; lone parent 8% (dependent children); cohabiting no children 8%; sharers/other 8%; avg size 2.39.
- **Tenure**: private rent 35%, social rent 27% (council 15%, HA 12%), owner-occupied 38% (outright 18%, mortgage 19%), shared ownership 0.6%.
- **Dwellings**: terraced 36%, purpose-built flats 33%, semi 15%, converted houses 7.5%, detached 5%.
- **Cars**: 42% of households have none; 42% one; 13% two; 3% three+ (England 23.5% none).
- **Work (16+)**: employed 55% (incl. working students), unemployed 5.6%, retired 11%, student 10%, home/family 7%, long-term sick 5.9%.
  Self-employed 14% of workers (12% without employees); 68% full-time hours >30 (part-time <=30h: 32%). Degree-level 36% (England 34%); no qualifications 22%.
  Occupation: SOC 1-3 43% (professionals 22%, assoc. prof 13%, managers 8%), SOC 6-9 42% (elementary 15%, caring/leisure 10%, sales 9%, operatives 8%), admin 8%, trades 7.5%.
  Industries: health+social 16%, retail/wholesale 15%, education 10%, accommodation+food 7%, manufacturing 7%, transport 6%, admin/support 6%, construction 5%, prof/scientific 6.5%, ICT 5%.
- **Health**: very good 49%, good 33%, fair 12.5%, bad/very bad 6%; disabled (Equality Act) 17.6%, limited a lot 7.9% (crude, not age-standardised).
- **Commute (Census day)**: 30% WFH; of all workers driving 33%, walk 14%, bus 10%, cycle 3%, train 1.6%, metro/tram 0.7%; of commuters ~47% drive, 20% walk, 14% bus. Post-pandemic estimate: 62% on-site, 28% hybrid, 10% fully remote.
- **Pay/rent (estimates, +/-15%)**: resident median full-time ~£33k (England £39.2k); part-time ~£11.5k; mean private rent ~£1,000/month (England incl. London £1,332). UK median household disposable income £39.2k.
- **Mortality (E&W 2022-24 qx, per 1000/yr)**: 20-24 0.5; 35-39 1.3; 50-54 4.2; 60-64 9.2; 70-74 23; 80-84 67; 90+ 275. Life expectancy M 79.3 / F 83.2.
  Composite age structure gives crude ~5.7/1000 = **~2.8 deaths per 500 residents per year** (derived; probably a floor in deprived wards).
- **Fertility**: composite TFR ~1.45 (estimate; E&W 1.44 in 2023, 1.49 in 2022; Manchester 1.40); mean maternal age 30.9; 51% of births outside marriage.
  E&W ASFR/1000: 15-19 8.7, 20-24 40.9, 25-29 79.6, 30-34 95.9, 35-39 58.2, 40+ 15.8 (scaled x0.97 in profile). Crude ~13/1000 = **~6.6 births per 500 residents per year**.
- **Partnership**: legal status is estimated (TS002 not published by ward): never married ~45%, married ~37%, divorced ~9.5%; ~50% living in a couple (England 58%).
  Marriage 20/1000 unmarried men, 18/1000 women; divorce ~6.7/1000 married. Couples meet via friends, work and chance far more than apps (apps ~11% overall, ~22% of 30-39s).
- **Mobility**: 16% had a different address a year earlier (12.7% from elsewhere in UK, 2% from abroad, 1.5% term-time) vs 11% England. Age profile is an estimate (peak 20-34 ~30%/yr).
- **Crime (police recorded, per 1000/yr, YE Dec 2024)**: urban-force weighted (GMP, W Yorks, S Yorks, Merseyside, W Midlands, Avon & Somerset, Leics, Notts, Northumbria, Sussex, Devon & Cornwall, Hampshire, Thames Valley, Norfolk, S Wales) **95/1000**:
  violence 37 (injury 9.8, no injury 15, stalking/harassment 12), theft 29 (shoplifting 9.3, vehicle 6.3, other 7, from person 0.9, bike 0.8), criminal damage 8.5, public order 8.8, drugs 3.5, sexual 3.7, robbery 1.2, residential burglary 7.9 per 1000 households.
  Inner wards run higher (Manchester city 156 vs GMP 110): x1.35 estimate => **~64 recorded offences per 500 residents per year**.
- **Time use (adults, ONS Mar 2023, national)**: sleep/rest 8h56; free time 3h44 (TV 2h16, socialising 33 min); unpaid housework 2h38; travel 61 min. Hourly weekday/weekend profiles in file.
- **Social (national; urban 68% chat to neighbours monthly)**: trust neighbours 37% urban; often/always lonely 7% (16-24s ~10%); formal volunteering monthly 16%; pub weekly ~14%, never 11%.
- **Pets**: UK dog households 36-41%, cats ~30%; inner-city dog 12% and cat 20% are estimates.

## Myths vs data
1. **Gig work is small.** No official statistics; best LFS figure 1.4% of employed (CIPD 2022); broad 13% includes remote online work. Sim default ~2% of workers main-income app riders/drivers, ~4% including side hustle.
2. **Renting is not just private renting.** Renters are ~62% of households here, but a third of renting is social (27% of all households); owners are 38%.
3. **Most households are not families.** One-person households are the biggest type (36.5%); couples with dependent children ~16%; lone parents ~8%.
4. **Young but not London-young**: median age 32, 65+ ~10% (England 18%). Retirees living alone exist (9% of households) but are a minority; TFR ~1.45 so 3+ child families are uncommon except in some South Asian households (6+ person households ~5%).
5. **Cars are not rare**: 58% of households have one, but 42% do not. Driving is still the biggest commute mode (~47% of commuters); bus, walking and cycling matter, but this is not London's tube-and-bike pattern.
6. **Jobs are mixed**: SOC 1-3 is 43% (vs 64% in a London borough such as Hackney, 46.5% England). Health/social care and retail are the biggest sectors; hospitality ~7%, creative/ICT ~5%. Part-time medians are ~£11-12k: low hours drive poverty.
7. **Diversity is local-specific**: the main minority is South Asian (Pakistani, Indian, Bangladeshi) in Midlands/northern cities and African/Caribbean in Bristol/Birmingham/Manchester; religion is 34% none but Muslim 24% and Christian 31%.
8. **Pubs are not a weekly habit for most**: ~14% weekly, 11% never; 20% of adults do not drink; drinking in the past week is lowest among 16-24s.
9. **Neighbours**: ~68% of urban English residents chat to neighbours monthly but only ~37% trust many; under-25s are the least connected (45% monthly). Loneliness is chronic for ~7%, higher for the young.
10. **Crime is mostly theft and violence, not street robbery**: outside London theft from person and bike theft are rare (<1/1000); shoplifting, vehicle crime, harassment and non-injury violence dominate; homicide ~0.01/1000 (~1 per 200 neighbourhood-years at 500 pop). Fraud is not in local figures.
11. **Dating apps are a minority route**: most couples still meet via friends, work and chance; apps matter for 25-40s.
12. **People move a lot**: ~1 in 6 residents move each year, ~1 in 3 of 20-34s - churn is larger than commonly assumed.
13. **WFH**: Census 30% is a lockdown artefact. Post-pandemic estimate ~28% hybrid, ~10% fully remote, rest on-site (GB hybrid 28%).

## Gaps / estimates to treat with care
- Estimates: legal partnership status, age-specific mobility, cause-of-death mix by age, friend counts, inner-city pet ownership, post-2021 WFH split, composite TFR and ASFR shape, pay and rent levels, inner-city crime factor (x1.35), sexual orientation (E&W national, not composite).
- Weighted pooled means over rule-selected wards, not medians; thin cells (Nottingham, Leicester 1 ward; Sheffield, Newcastle 3). Scotland and Northern Ireland not measured.
- Health is crude (not age-standardised); year-of-arrival splits and unpaid care not computed for the composite.
- Crime rates are force-wide (include suburbs/rural) scaled by an estimated factor; no local ward crime rates.
- Pub frequency is from commercial YouGov polls (undated). No income distribution/gini: use medians and add dispersion yourself.

# CALIBRATION - real-data anchors for Larkfield

Data file: `sim/data/calibration.js` (default export; every block has `source` + `confidence`).
Confidence: **measured** = published figure; **derived** = we computed it from published figures; **estimate** = our judgement (flagged).

## Reference model
**London Borough of Hackney (E09000012), ONS Census 2021**, plus England & Wales national series where local ones do not exist.
Why: full Census 2021 detail is available via Nomis; it is dense (60% purpose-built flats, 14% terraces, 15% converted houses),
young (median age 32), diverse, car-light and hospitality/creative-heavy - the closest match to the brief. Read Larkfield as
"Hackney-like", not Hackney: the Haredi Jewish share (6.7%) and 40% social rent are borough-specific.
Caveat: Census day (27 Mar 2021) fell in lockdown, so WFH and 1-year moves are distorted.
Scale: 500 residents ~ 205 households (2.44 persons per household).

## Key numbers (Hackney unless stated)
- **Age**: 0-14 17.9%; 15-24 12.7%; 25-39 33.6%; 40-64 27.8%; 65+ 7.9% (England 65+: 18.4%). 25-34 alone is 24.5%.
- **Ethnicity**: White 53%, Black 21%, Asian 10%, Mixed 7%, Other 9%. Religion: none 36%, Christian 31%, Muslim 13%.
  Born in UK 60% (24% of residents arrived 10+ yrs ago, 4% under 2 yrs).
- **Households**: 33% one-person (66+: 7%), 12% sharers/other non-family, 15.5% lone-parent, 13% cohabiting couples,
  20% married couples, avg size 2.44. 60% of adults never married; 40% live in a couple.
- **Tenure**: social rent 40% (council 21%), private rent 32%, owner-occupied 25% (outright 10%, mortgage 15%), shared ownership 3%.
- **Cars**: 65% of households have none; 30% one; 4.6% two or more (England: 23.5% none).
- **Work (16+)**: employed 64%, unemployed 5.5%, retired 8%, student 8%, home/family 5%, long-term sick 5%, other 5%.
  20% of workers self-employed (18% without employees). 71% full-time. 52% degree-level (England 34%).
  Occupation: professionals 30%, associate prof 21%, managers 14%, elementary 8%, caring/leisure 7%, admin 7%, sales 5%, trades 5%, operatives 3%.
  Top industries: professional/scientific 16%, health+social 12%, education 11%, retail 11%, ICT 10%, food/drink 4.6%, construction 3.9%.
- **Pay**: resident median full-time £49.5k (England £39.2k); part-time median £11.8k; UK median household disposable income £39.2k.
  Mean private rent £2,582/month (1-bed £1,941, 2-bed £2,412; England mean £1,332). Median GB household wealth £293.7k.
- **Commute (Census)**: of those travelling: bus 21%, walk 19%, cycle 15%, tube 15%, car driver 17%, train 7%; 50% WFH on census day.
- **Mortality (E&W 2022-24, per 1000/yr)**: age 20-24 0.5; 35-39 1.3; 50-54 4.2; 60-64 9.2; 70-74 23; 80-84 67; 90+ 275.
  Life expectancy at birth M 79.3 / F 83.2. Hackney age structure gives ~4/1000 crude = **~2 deaths per 500 residents per year**.
- **Fertility**: Hackney TFR 1.31 (inner London 1.19; E&W 1.49 in 2022, 1.44 in 2023); mean maternal age 30.9 (London 32.5).
  E&W ASFR/1000: 15-19 8.7, 20-24 40.9, 25-29 79.6, 30-34 95.9, 35-39 58.2, 40+ 15.8.
  Hackney crude birth rate 13.4/1000 = **~6-7 births per 500 residents per year**. 51% of births outside marriage.
- **Partnership**: marriage 20/1000 unmarried men, 18/1000 women; divorce ~6.7/1000 married. Couples meet via friends, work and chance far more than apps (apps ~11% overall, ~22% of 30-39s).
- **Mobility**: 15.5% of Hackney residents had moved in the previous year (13.5% within UK, 1.6% from abroad) vs 10.5% England. Age profile in file is an estimate (peak 20-34 at ~30%/yr).
- **Crime (police recorded, per 1000/yr, Hackney YE Dec 2024)**: total 127; theft 65 (theft from person 18.8, other 14.3, vehicle 9.8, shoplifting 8.3, bike 5.4);
  violence 30 (with injury 8.6, without 14.5, stalking/harassment 6.5); robbery 6.8; criminal damage 6.7; public order 8; drugs 5.6; sexual 3.3; weapons 0.8; homicide 0.03.
  Residential burglary 14.4 per 1000 households. Per 500 residents: ~63 recorded offences/yr, ~half of them theft.
- **Time use (adults, ONS Mar 2023)**: sleep/rest 8h56; free time 3h44 (TV 2h16, socialising 33 min); unpaid housework 2h38; travel 61 min.
  Weekday vs weekend: 8.7h vs 9.5h sleep; 5.8h vs 4.3h outside home; weekend cleaning +21 min. Hourly profiles in file.
- **Social**: chat to neighbours at least monthly 69% England / **62% London**; belonging 57% London; trust neighbours 32% London.
  Often/always lonely 7% (16-24s ~10%). Formal volunteering monthly 16%, informal 24%. Pub weekly ~14%, monthly 16%, never 11%.
- **Pets**: UK dog households 36-41%, cats ~30%; inner-city dog 12% and cat 20% are estimates.

## Myths vs data (corrections to SETTING.md)
1. **Gig work is small.** ONS says there are *no official statistics*. Best LFS-based figure: 1.4% of employed (CIPD, 2022).
   Broad Understanding Society figure 13% includes remote online "cloud" work (4x more common than local gig). Census: couriers 0.7% of Hackney workers.
   Sim default: ~1.5% main-income app riders/drivers (~3 of 500), ~3% incl. side hustle.
2. **Renting is not just private renting.** Social rent (40%) outweighs private rent (32%) in Hackney; owners are 25%.
3. **Most households are not families.** One-person households are the biggest type (33%); couples with dependent children only 14.5%; flatshares ~12%.
4. **It is a young, small-household, child-light place** with very few retirees (7.9% 65+). Many "retirees living alone" would be unrealistic;
   and TFR is ~1.3, so 3+ child families are rare.
5. **Few people own cars (35% of households do)**; commutes are bus/walk/cycle/tube. Few drive to work.
6. **Jobs are professional**: 64% of workers in SOC 1-3 (managers, professionals, technical), not retail/hospitality. Hospitality is ~5%, retail ~11%.
   Pay: median FT £49k; part-time medians ~£12k - low hours, not low rates, drive poverty.
7. **Pubs are not a weekly habit for most**: ~14% go weekly, 11% never; 20% of adults do not drink at all, and drinking in the past week is lowest among 16-24s.
8. **Neighbours**: in London ~38% do not chat to neighbours even monthly, and only a third trust them; under-25s are the least connected (45% monthly).
   Loneliness is chronic for ~7%, higher for the young, not the old.
9. **Crime is mostly theft, not violence**: ~51% theft (phones, shoplifting, bikes), ~23% violence (half is non-injury); homicide ~0 in a 500-person area.
   Hackney's rate is inflated by visitors/nightlife; a residential patch is probably 20-30% lower for theft. Fraud (largest crime by volume in CSEW) is not in local figures.
10. **Dating apps are a minority route**: most couples still meet via friends, work and chance; apps matter for 25-40s.
11. **People move a lot**: ~1 in 6.5 residents move each year, ~1 in 3 of 20-34s - the churn in the brief is right, and larger than commonly assumed.
12. **WFH**: the Census 50% is a lockdown artefact. Post-pandemic: 28% of GB workers hybrid; our estimate for Hackney ~50% on-site, 38% hybrid, 12% fully remote.

## Gaps / estimates to treat with care
- Age-specific mobility, cause-of-death mix by age, friend counts, inner-city pet ownership, post-2021 WFH split, Hackney ASFR curve shape: **estimate**.
- Time-use weekday/weekend only at coarse activity categories; no age-specific breakdown.
- Pub frequency is from commercial YouGov polls (undated) not official stats.
- No local income distribution/gini; use ASHE medians and add dispersion yourself.
- Rent figures are secondary reports of ONS data (borough mean, not median).

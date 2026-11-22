import sys; sys.path.insert(0,'../nomis')
import json, numpy as np, pandas as pd
from g1 import tab, K
old=json.load(open('/home/user/world/experiments/ai-convo/sampler/data.json'))
g1,g2,g3,g4=[json.load(open(f'g{i}.json')) for i in (1,2,3,4)]
A=json.load(open('../nomis/A.json'))
D={}
D['_status']="All real-world numbers below were pulled programmatically on 2026-11-22 from Nomis (Census 2021 E&W; 2011 Census detailed tables as seeds, refitted to 2021 totals), ONS downloads (ASHE 2024 revised, ONS fertility, ONS birth characteristics 2022, ONS marriages 2023) and gov.uk. Scripts: provenance/. Anything not sourced is listed under `unspecified` and is NOT modelled; `design` lists scenario/structure rules that are not data claims."
D['sources']={
 "S1":"Nomis NM_2029_1 Census 2021 TS009 Sex by single year of age (popY; inner/E&W age ratio -> ageMul)",
 "S2":"Nomis NM_2041_1 TS021 Ethnic group; NM_2132_1 RM032 Ethnic group by sex by age (eth); ethMul fitted so adults 25+ reproduce Inner London RM032 mix",
 "S3":"Nomis NM_663_1 DC2205EW (Census 2011) country of birth by detailed ethnic group, scaled to Census 2021 RM027 (NM_2127_1) group UK-born shares (ukBorn); NM_2111_1 RM011 UK-born share by age (ukAge); NM_2032_1 TS012 UK nations (ukNation); RM027 arrival-age bands (arr)",
 "S4":"Nomis NM_659_1 DC2201EW (2011) ethnic group x religion as seed, iteratively fitted to Census 2021 RM031 (NM_2131_1) group totals (rel)",
 "S5":"Nomis NM_2124_1 RM024 (2021 levels by sex x age); NM_750_1 DC6107EW (2011) for within-group shares (ft/pt/se, retired/sick/home); NM_2083_1 TS066 targets -> act",
 "S6":"Nomis NM_2146_1 RM046 and NM_2143_1 RM043 (good / not good health by age, 2021); NM_2055_1 TS037 national 5-category ratios -> health",
 "S7":"Nomis NM_1102_1 DC5102EW (2011) qualification by age shape, fitted to Census 2021 TS067 (NM_2084_1) totals (edu); NM_2149_1 RM049 degree share by ethnic group (eduMul)",
 "S8":"Nomis NM_2167_1 RM067 Living arrangements by sex by age -> rs, marr",
 "S9":"Nomis NM_2157_1 RM057 Household composition by age; NM_2158_1 RM058 by ethnic group of HRP; NM_2023_1 TS003; NM_2037_1 TS017 -> hhAge, hhMul, hhEth, famType, hhSize",
 "S10":"Nomis NM_2235_1 RM135 tenure by composition; NM_2301_1 RM201 tenure by age of HRP; NM_2236_1 RM136 bedrooms by tenure x household size; NM_2199_1 RM099 overcrowding target -> ten, tenAge, bed",
 "S11":"ONS 'Fertility for those born in different years' Table 3 (women, E&W; children by age and cohort) -> fert; ONS Birth characteristics 2022 Table 16 (age of mother by previous live-born children) -> birthAge",
 "S12":"ONS Marriages in England and Wales 2023 Table 7a: mean age at marriage men 39.0, women 36.8 -> partnerGap 2.2",
 "S13":"ONS ASHE 2024 revised Table 2.6a/2.9a (occupation, 2-digit SOC 2020: hourly pay, paid hours percentiles, FT/PT jobs) and Table 20 (age group x occupation x sex jobs, hourly pay, PT hours) -> O, studentHours",
 "S14":"Nomis NM_2203_1 RM103 occupation by economic activity (employed full-time students by major group) and TS066 -> studentMajor, stWork",
 "S15":"gov.uk National minimum wage rates: 1 Apr 2024-31 Mar 2025 NLW 11.44 (21+), 18-20 8.60 -> minWage; Working Time Regulations: 11h daily rest, 24h weekly rest, 48h average week (restOk)"}
D['popY']=g1['popY']; D['ageMul']=g1['ageMul']; D['ethMul']=g1['ethMul']
D['ethLabel']=old['ethLabel']; D['eth']=g1['eth']; D['G8']=g1['G8']
D['ukBorn']=g1['ukBorn']; D['ukAge']=g1['ukAge']; D['ukNation']={k.split(': ')[-1]:v for k,v in g1['ukNation'].items()}; D['cobRegion']=g1['cobRegion']; D['arr']=g1['arr']
D['rel']=g1['rel']; D['act']=g2['act']; D['health']=g2['health']; D['edu']=g2['edu']; D['eduMul']=g2['eduMul']; D['eduLabel']=old['eduLabel']
D['rs']=g2['rs']; D['marr']=g2['marr']; D['sePT']=g2['sePT']
ts=tab('NM_2083_1'); ts.columns=['c','v']; ts=ts.set_index('c').v
D['stWork']=float(ts.iloc[14]/(ts.iloc[13]+ts['Economically inactive: Student']))
D['hhAge']=g3['hhAge']; D['hhMul']=g3['hhMul']; D['hhEth']=g3['hhEth']
t=tab('NM_2023_1'); t.columns=['c','v']; t=t.set_index('c').v
fk=lambda *c: float(sum(t[x] for x in c))
D['famType']={'couple_dep':fk('Single family household: Married or civil partnership couple: Dependent children','Single family household: Cohabiting couple family: With dependent children'),'lone_dep':fk('Single family household: Lone parent family: With dependent children'),'couple_adult':fk('Single family household: Married or civil partnership couple: All children non-dependent','Single family household: Cohabiting couple family: All children non-dependent'),'lone_adult':fk('Single family household: Lone parent family: All children non-dependent'),'multigen':fk('Single family household: Other single family household: Other family composition','Other household types: With dependent children')}
hs=tab('NM_2037_1'); hs.columns=['c','v']; hs=hs.set_index('c').v; D['hhSize']={c:float(v) for c,v in hs.items()}
D['tenMul']=g1['tenMul']; D['ten']=g3['ten']; D['tenAge']=g3['tenAge']; D['bed']=g3['bed']; D['tt']=old['tt']; D['tenLabel']=old['tenLabel']
D['fert']=g3['fert']; D['birthAge']=g3['birthAge']; D['partnerGap']=g3['partnerGap']
# parent in adult-child households: lone vs couple (RM057 persons aged 16-34 in non-dependent-children families)
from g3 import H
D['parLone']=float(sum(H.get((b,'lnd'),0) for b in ['Aged 16 to 24 years','Aged 25 to 34 years'])/sum(H.get((b,k),0) for b in ['Aged 16 to 24 years','Aged 25 to 34 years'] for k in ('lnd','cnd')))
def title(code): return old_titles[code]  # '&' becomes 'and': the Workflow tool HTML-escapes args, so '&' would arrive as '&amp;'
old_titles={(r['code'] if isinstance(r,dict) else r[0]):(r['title'] if isinstance(r,dict) else r[1]) for r in old['O']}
PAT={11:['office'],12:['retail','office'],21:['office'],22:['shift12'],23:['school'],24:['office'],31:['office'],32:['shift12'],33:['security','shift12'],34:['flex'],35:['office'],41:['office'],42:['office'],51:['trades'],52:['trades'],53:['trades'],54:['factory','hosp'],61:['care'],62:['retail'],71:['retail'],72:['office'],81:['factory'],82:['driver'],91:['trades','factory'],92:['hosp','factory','retail','security']}
D['O']=[{'code':o['code'],'title':old_titles[o['code']].replace(' & ',' and '),'pat':PAT[o['code']],'M':[max(1,v) for v in o['M']],'F':[max(1,v) for v in o['F']],'pay':o['pay'],'ftJobs':o['ft'],'ptJobs':o['pt'],'hf':o['hf'],'hp':o['hp']} for o in g4['occ']]
D['studentHours']=g4['studentHours']; D['studentMajor']=g4['studentMajor']
D['minWage']={'21+':11.44,'18-20':8.60}
# targets (published figures to compare against)
D['targets']={'_note':"Census 2021 / ASHE figures pulled from Nomis. age = % of adults 18+; eth25 = adults 25+ (RM032); act = % of 16+ (TS066, 'other inactive' folded into home); ten = % households; inner = 14 Inner London boroughs.",
 'age':{'ew':{k:float(v) for k,v in A['t_age']['EW'].items()},'inner':{k:float(v) for k,v in A['t_age']['IL'].items()}},
 'eth25':{'ew':g1['t_eth25']['EW'],'inner':g1['t_eth25']['IL']},'act':g2['t_act'],'ten':g1['t_ten'],'overcrowded':{'ew':g3['t_over']['EW'],'inner':g3['t_over']['IL']},'edu':g2['t_edu']}
# design rules (scenario/structure choices, not claims about the real world)
D['design']=["Shift timetables (days allowed, start times, shift lengths) per job family are plausible-pattern design rules; options are chosen uniformly (no weights). Shift length cap 12.5 paid hours and max 6 days follow the Working Time Regulations (11h daily rest, 24h weekly rest).",
 "Partners and children share the focal person's ethnic group; dependent children take the mother's religion.",
 "'city'/'inner' profile strength pr in [0,1]: 0 = E&W tables, 1 = Inner London tables; fractional values interpolate (geometric for multipliers, mixture for bedroom tables).",
 "Cafe scenario: owner + staff; cook only when 3+ people; counter staff otherwise; some staff are full-time students. Role mix is a scenario choice.",
 "Friends scenario: friends' ages must be within FRIEND_AGE_WINDOW years of the anchor (a parameter, default 5) and every friend shares at least one attribute with another friend; no probabilities are assumed.",
 "Census 'retired' cells below age 50 (a few hundred early retirements) are folded into long-term sick/disabled so no 20-year-old pensioners appear.",
 "Uniform interpolation inside published bands (single years inside 5-year birth-age bands, arrival-age bands, ASHE percentiles linear between published percentiles).",
 "Co-resident adult children in 'couple/lone parent with adult children' households: all of the mother's children (all >=18) live there. Sibling relations of adult children living with parents are not generated."]
D['unspecified']=[
 "Economic activity by household type (e.g. home carers among unrelated sharers): no published table reached (ONS custom-dataset API refused requests; RM020/RM133/RM094 do not cross activity with household composition). Not modelled: sharers draw activity from the age x sex Census rates.",
 "Lone fathers: no sex split of lone parents sourced -> lone-parent households are always headed by a mother.",
 "Same-sex couples, mixed-ethnicity couples and parents/child religion mismatches: not sourced -> not generated (partners share ethnicity).",
 "Fathers' children outside the household, and men's non-resident children: unspecified -> not listed. Women's children under 18 are always co-resident.",
 "Employment at 75+: only the Census 65+ band exists, so 75+ share the 65+ activity row (employment at very old ages is overstated).",
 "Self-employment by occupation and sex x age: not sourced -> self-employed people draw occupation like employees (ASHE covers employees only).",
 "Non-earnings income (pensions, benefits, student support): annual_income is null for people without earnings; pension/benefit receipt rates are not sourced.",
 "Contract type (permanent/fixed-term/zero-hours/agency): not sourced -> 'employee' vs 'self-employed' only.",
 "Employer names/sector by occupation: not sourced -> null (cafe staff: 'this cafe').",
 "Religion and ethnicity age effects inside Census age bands; religion by age: not sourced -> religion depends on ethnicity only.",
 "Age 18-24 activity row uses the Census 16-24 band (includes 16-17-year-olds, overstating students); education 18-24 uses the 2011 16-24 band shape.",
 "Partner age gap uses the ONS marriage mean difference (2.2 years) as a deterministic offset for married and cohabiting couples; its spread and cohabiting-couple gap are unspecified.",
 "Siblings: not generated for adult children living with parents.",
 "Child sex ratio at birth: child sex drawn from the Census population sex ratio at that age.",
 "Names: modest illustrative lists, equal weights (not frequency-weighted); cohort grouping is by decade of birth.",
 "Number of unrelated housemates in street/friends/cafe households: proxied by Census household size (TS017) for 2+ person households; not specific to sharers.",
 "Tenure by age of reference person: RM201 only separates 16-64 and 65+, so under-65 households share one age effect.",
 "Births to mothers under 16 and number of children '4 or more' (treated as 4): not sourced; the under-20 birth band is drawn from 16-19.",
 "Bedrooms: RM136 stops at '4 or more' (treated as 4); sharers in 5+ person households get one bedroom each.",
 "Health: the split inside Good (very good/good) and Not good (fair/bad/very bad) uses national TS037 ratios, not age-specific ones.",
 "Student job occupation mix: ASHE 18-21 jobs weighted by the Census RM103 ratio of employed full-time students to all employed, by SOC major group.",
 "Co-residence of adult children in households with dependent children: not sourced -> only dependent children are listed as co-resident; adult children are listed as living in their own household.",
 "First-degree age floor: nobody under 21 holds a degree (validity rule from UK higher-education timelines, not a Census table)."]
json.dump(D,open('/home/user/world/experiments/ai-convo/sampler/data.json','w'),separators=(',',':'))
print('ok',len(json.dumps(D)))

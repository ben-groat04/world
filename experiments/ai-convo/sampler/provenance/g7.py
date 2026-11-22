# Part 7: conditioning that was missing (round-1 audit). Run from sampler/: python3 provenance/g7.py
#  actSub : economic activity within a Census 2021 age band, by 5-year sub-band (2011 DC6107EW) -> multiplier on the 2021 band row
#  tenArr : tenure by year of arrival in the UK (2011 CT0069) -> multiplier vs all residents in households
#  tenAct : tenure by economic activity of the household reference person (2021 RM133) -> multiplier vs all HRPs
import csv, io, json, urllib.request
get = lambda q: list(csv.DictReader(io.StringIO(urllib.request.urlopen('https://www.nomisweb.co.uk/api/v01/dataset/' + q, timeout=120).read().decode())))
D = json.load(open('data.json'))
# --- activity by 5-year age (2011): our classes ft pt se st un re si ho; 'Other' inactive dropped (as in the 2021 rows)
A = get('NM_750_1.data.csv?geography=2092957703&measures=20100&c_sex=1,2&select=c_sex_name,c_age_name,economic_activity_name,obs_value')
K = {'Economically active: In employment: Employee: Full-time (including full-time students)': 'ft', 'Economically active: In employment: Employee: Part-time (including full-time students)': 'pt',
     'Economically active: In employment: Self-employed: Total': 'se', 'Economically active: Unemployed (including full-time students)': 'un', 'Economically inactive: Retired': 're',
     'Economically inactive: Student (including full-time students)': 'st', 'Economically inactive: Looking after home or family': 'ho', 'Economically inactive: Long-term sick or disabled': 'si'}
band = {'16 to 19': '16-24', '20 to 21': '16-24', '22 to 24': '16-24', '25 to 29': '25-34', '30 to 34': '25-34', '35 to 39': '35-49', '40 to 44': '35-49', '45 to 49': '35-49', '50 to 54': '50-64', '55 to 59': '50-64', '60 to 64': '50-64'}
cnt = {}
for r in A:
    a = r['C_AGE_NAME'].replace('Age ', ''); k = K.get(r['ECONOMIC_ACTIVITY_NAME'])
    if a in band and k: sx = 'M' if r['C_SEX_NAME'] == 'Males' else 'F'; cnt.setdefault(sx, {}).setdefault(a, {})[k] = float(r['OBS_VALUE'])
out = {}
for sx, ages in cnt.items():
    out[sx] = {}
    for a, c in ages.items():
        b = [x for x in ages if band[x] == band[a]]; tb = {k: sum(ages[x][k] for x in b) for k in K.values()}
        ps, pb = sum(c.values()), sum(tb.values())
        out[sx][a.replace(' to ', '-')] = {k: (c[k] / ps) / (tb[k] / pb) if tb[k] else 1 for k in K.values()}
D['actSub'] = out
# --- tenure by year of arrival (2011)
T = get('NM_990_1.data.csv?geography=0&c_cob=0&measures=20100&select=c_tenhuk11_name,c_yrarrpuk11_name,obs_value')
TK = {'Owned: Owned outright': 'own', 'Owned: Owned with a mortgage or loan or shared ownership': 'mort', 'Social rented: Total': 'soc', 'Private rented or living rent free: Total': 'priv'}
YA = {'Born in the UK': 'uk', 'Arrived before 1981': '<1981', 'Arrived 1981-1990': '1981-1990', 'Arrived 1991-2000': '1991-2000', 'Arrived 2001-2011': '2001-2011', 'All categories: All usual residents in households': 'all'}
t = {}
for r in T:
    k, y = TK.get(r['C_TENHUK11_NAME']), YA.get(r['C_YRARRPUK11_NAME'])
    if k and y: t.setdefault(y, {})[k] = float(r['OBS_VALUE'])
sh = lambda d: {k: v / sum(d.values()) for k, v in d.items()}
D['tenArr'] = {y: {k: sh(t[y])[k] / sh(t['all'])[k] for k in TK.values()} for y in t if y != 'all'}
# --- tenure by HRP economic activity (2021)
R = get('NM_2233_1.data.csv?geography=2092957703&measures=20100&select=c2021_eastat_10_name,c2021_hhtenure_5_name,obs_value')
RT = {'Owned: Owns outright': 'own', 'Owned: Owns with a mortgage or loan or shared ownership': 'mort', 'Rented: Social rented': 'soc', 'Rented: Private rented or lives rent free': 'priv'}
RA = {'Economically active (excluding full-time students): In employment': 'emp', 'Economically active and a full-time student: In employment': 'emp', 'Economically active (excluding full-time students): Unemployed': 'un',
      'Economically active and a full-time student: Unemployed': 'un', 'Economically inactive: Retired': 're', 'Economically inactive: Student': 'st', 'Economically inactive: Looking after home or family': 'ho',
      'Economically inactive: Long-term sick or disabled': 'si', 'Total': 'all'}
u = {}
for r in R:
    k, a = RT.get(r['C2021_HHTENURE_5_NAME']), RA.get(r['C2021_EASTAT_10_NAME'])
    if k and a: u.setdefault(a, {}); u[a][k] = u[a].get(k, 0) + float(r['OBS_VALUE'])
D['tenAct'] = {a: {k: sh(u[a])[k] / sh(u['all'])[k] for k in RT.values()} for a in u if a != 'all'}
D['sources']['S17'] = "Nomis NM_750_1 DC6107EW (2011) economic activity by sex by 5-year age -> actSub; NM_990_1 CT0069 (2011) tenure by year of arrival in the UK -> tenArr; NM_2233_1 RM133 (2021) tenure by economic activity of HRP -> tenAct"
D['design'] = [d for d in D['design'] if not d.startswith('Activity within a 2021 age band')] + [
 "Activity within a 2021 age band follows the 2011 five-year profile inside that band (actSub multiplies the 2021 band row; assumes the within-band shape held from 2011 to 2021).",
 "Tenure multiplies independent multipliers (age of eldest adult, year of arrival of the eldest adult, economic activity of the eldest adult as HRP proxy): a naive-Bayes combination; joint tables are not published. Arrivals after 2011 use the 2001-2011 row."]
D['unspecified'] = [x for x in D['unspecified'] if not x.startswith(('Partners\' economic activity', 'Ages of unrelated sharers', 'Pay of the self-employed', 'Friends: friends are matched'))] + [
 "Partners' economic activity: no published joint table was found, so each partner's activity is drawn separately (given sex and age). Combinations such as two early-retired partners can come out more often than in reality.",
 "Ages of unrelated sharers: each housemate's age is drawn separately from the sharer age distribution. Whether sharers cluster in age is not sourced.",
 "Pay of the self-employed: ASHE covers employees only, so self-employed people have hourly_pay and annual_income null (unspecified).",
 "Friends: friends are matched by a shared attribute (ethnicity, education, religion, occupation group) within an age window around one anchor person. This is a design rule, not sourced data, and it acts as a selection effect: friends samples come out older, and more often White British, retired and owner-occupiers, than the inner-city profile they are drawn from (see test.mjs)."]
json.dump(D, open('data.json', 'w'), separators=(',', ':'), ensure_ascii=False)
print(json.dumps(D['actSub']['M']['50-54']), json.dumps(D['tenArr']['2001-2011']), json.dumps(D['tenAct']['re']))

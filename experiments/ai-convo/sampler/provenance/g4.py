# Part 4: occupations (ASHE 2024 revised T2 + T20) and student job mix (Census RM103)
import sys; sys.path.insert(0,'../nomis')
import pandas as pd, numpy as np, json, glob
from g1 import tab
A='../ashe/'
CODES=[11,12,21,22,23,24,31,32,33,34,35,41,42,51,52,53,54,61,62,71,72,81,82,91,92]
def f2(n): return glob.glob(A+f'x/*Table 2.{n}a *')[0]
def f20(n): return glob.glob(A+f'y/*Table 20.{n}a *')[0]
def num(v):
    try: return float(v)
    except: return np.nan
def rd(f,sheet,skip=5):
    d=pd.read_excel(f,sheet_name=sheet,header=None,skiprows=skip); return d
# T2 per occupation (all employees): pay percentiles; FT/PT jobs and hours percentiles
def t2(f,sheet):
    d=rd(f,sheet); d=d[pd.to_numeric(d[1],errors='coerce').notna()].copy(); d[1]=d[1].astype(int); return d.set_index(1)
P=t2(f2('6'),'All'); FJ=t2(f2('6'),'Full-Time'); PJ=t2(f2('6'),'Part-Time'); HF=t2(f2('9'),'Full-Time'); HP=t2(f2('9'),'Part-Time')
# percentile columns in these sheets: 3 median, 7:10,8:20,9:25,10:30,11:40,12:60,13:70,14:75,15:80,16:90
FB=[(7,[8]),(9,[8,10]),(3,[]),(14,[13,15]),(16,[15])]   # suppressed ('x') percentile -> adjacent published percentile of the same row
def q5(row):
    out=[]
    for c,fb in FB:
        v=num(row[c])
        for f in fb:
            if v!=v: v=num(row[f])
        out.append(v)
    if any(v!=v for v in out):   # still suppressed: interpolate between the row's other published percentiles
        pts=[(p,num(row[c])) for p,c in zip([10,20,25,30,40,50,60,70,75,80,90],[7,8,9,10,11,3,12,13,14,15,16])]; pts=[(p,v) for p,v in pts if v==v]
        for i,(c,p) in enumerate(zip([7,9,3,14,16],[10,25,50,75,90])):
            if out[i]!=out[i]: out[i]=float(np.interp(p,[a for a,_ in pts],[b for _,b in pts]))
    return out
AG=['18-21','22-29','30-39','40-49','50-59','60+']
def t20(f,sheet):
    d=rd(f,sheet); d['ag']=d[0].astype(str).str.split().str[0]; return d
T20P=t20(f20('6'),'All'); T20J_M=t20(f20('6'),'Male'); T20J_F=t20(f20('6'),'Female'); T20HP=t20(f20('9'),'Part-Time')
def cell(d,code,ag,col):
    x=d[(d.ag==ag)&((pd.to_numeric(d[1],errors='coerce')==code) if code else d[0].astype(str).str.contains('ALL OCCUPATIONS'))]
    return num(x.iloc[0][col]) if len(x) else np.nan
allq={ag:[cell(T20P,None,ag,c) for c in (7,9,3,14,16)] for ag in AG}
allq_tot=[num(P.iloc[0][c]) if False else np.nan for c in range(5)]
tot=pd.read_excel(f2('6'),sheet_name='All',header=None,skiprows=5); tot=tot[tot[0].astype(str).str.strip()=='All employees'].iloc[0]; allq_tot=q5(tot)
occ=[]
for c in CODES:
    base=q5(P.loc[c])
    pay=[]
    for ag in AG:
        q=[cell(T20P,c,ag,col) for col in (7,9,3,14,16)]
        if any(np.isnan(v) for v in q): q=[b*(a/t) for b,a,t in zip(base,allq[ag],allq_tot)]   # fallback: occupation quantiles scaled by the all-occupation age ratio (published)
        pay.append([round(float(v),2) for v in q])
    jobsM=[cell(T20J_M,c,ag,2) for ag in AG]; jobsF=[cell(T20J_F,c,ag,2) for ag in AG]
    occ.append(dict(code=c,pay=pay,M=[0 if np.isnan(v) else v for v in jobsM],F=[0 if np.isnan(v) else v for v in jobsF],ft=num(FJ.loc[c][2]),pt=num(PJ.loc[c][2]),hf=q5(HF.loc[c]),hp=q5(HP.loc[c])))
# student hours: ASHE T20 part-time, ALL OCCUPATIONS, by age band
sh={ag:[cell(T20HP,None,ag,c) for c in (7,9,3,14,16)] for ag in AG}
# students' jobs by occupation major group (RM103) : share of employed full-time students in each major group vs all employed
r=tab('NM_2203_1'); r.columns=['st','occ','v']; r=r[r.occ!='Total']
stu=r[r.st=='Economically active and a full-time student: In employment'].set_index('occ').v; allemp=r[r.st.isin(['Economically active (excluding full-time students): In employment','Economically active and a full-time student: In employment'])].groupby('occ').v.sum()
out={'occ':occ,'studentHours':sh,'studentMajor':{k[0]:float(stu[k]/stu.sum()/(allemp[k]/allemp.sum())) for k in stu.index}}
json.dump(out,open('g4.json','w'))
print(json.dumps(out['studentMajor'])); print(sh); print(occ[0]['pay'][1],occ[0]['hf'],occ[24]['hp'],occ[24]['ft'],occ[24]['pt'])

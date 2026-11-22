# Part 2: activity, health, education, partnership, households, tenure, bedrooms
import sys; sys.path.insert(0,'../nomis')
import pandas as pd, numpy as np, json, re
from g1 import tab, N, K, G8
out={}
# population by sex x age for weights
g1=json.load(open('g1.json')); popY=g1['popY']
def pop(sx,lo,hi): return sum(popY[a][0 if sx=='M' else 1] for a in range(lo,min(hi,99)+1))
SX={'M':'Male','F':'Female'}
# ---------- ACTIVITY: 2021 RM024 levels x 2011 DC6107 within-group shares
r=tab('NM_2124_1'); r.columns=['st','age','sex','v']
A21=['Aged 16 to 24 years','Aged 25 to 34 years','Aged 35 to 49 years','Aged 50 to 64 years','Aged 65 years and over']
d=pd.read_csv(N+'NM_750_1.EW.csv'); d=d[d.C_SEX_NAME.isin(['Males','Females'])]
B11={0:['Age 20 to 21','Age 22 to 24'],1:['Age 25 to 29','Age 30 to 34'],2:['Age 35 to 39','Age 40 to 44','Age 45 to 49'],3:['Age 50 to 54','Age 55 to 59','Age 60 to 64'],4:['Age 65 and over']}
def v11(sx,bi,cat):
    x=d[(d.C_SEX_NAME==('Males' if sx=='M' else 'Females'))&(d.C_AGE_NAME.isin(B11[bi]))&(d.ECONOMIC_ACTIVITY_NAME==cat)]; return float(x.OBS_VALUE.sum())
E='Economically active: In employment: '
act={}
for sx in 'MF':
    rows=[]
    for bi,a in enumerate(A21):
        g=lambda s: float(r[(r.sex==SX[sx])&(r.age==a)&(r.st==s)].v.sum()); tot=g('Total')
        emp=g('Economically active (excluding full-time students): In employment')/tot; un=g('Economically active (excluding full-time students): Unemployed')/tot
        stu=(g('Economically active and a full-time student: In employment')+g('Economically active and a full-time student: Unemployed')+g('Economically inactive and a full-time student'))/tot
        ina=g('Economically inactive (excluding full-time students)')/tot
        eft=v11(sx,bi,E+'Employee: Full-time (including full-time students)'); ept=v11(sx,bi,E+'Employee: Part-time (including full-time students)'); ese=v11(sx,bi,E+'Self-employed: Total'); es=eft+ept+ese
        ir=v11(sx,bi,'Economically inactive: Retired'); isk=v11(sx,bi,'Economically inactive: Long-term sick or disabled'); iho=v11(sx,bi,'Economically inactive: Looking after home or family'); ioth=v11(sx,bi,'Economically inactive: Other')
        iz=ir+isk+iho+ioth; ho=iho+ioth*iho/(iho+isk); si=isk+ioth*isk/(iho+isk)
        rows.append(dict(ft=emp*eft/es,pt=emp*ept/es,se=emp*ese/es,st=stu,un=un,re=ina*ir/iz,si=ina*si/iz*0+ina*si/iz,ho=ina*ho/iz))
    act[sx]=rows+[rows[4]]   # 65-74 and 75+ share the published 65+ row (no finer table)
    act[sx]=[act[sx][0],act[sx][1],act[sx][2],act[sx][3],act[sx][4],act[sx][4]]
out['act']=act
# target: TS066 totals 16+
ts=tab('NM_2083_1'); ts.columns=['c','v']; ts=ts.set_index('c').v; T=ts.iloc[0]
out['t_act']={'ft':float(100*ts.iloc[5]/T),'pt':float(100*ts.iloc[4]/T),'se':float(100*(ts.iloc[6]+ts.iloc[9])/T),'st':float(100*(ts.iloc[13]+ts['Economically inactive: Student'])/T),'un':float(100*ts.iloc[12]/T),'re':float(100*ts['Economically inactive: Retired']/T),'si':float(100*ts['Economically inactive: Long-term sick or disabled']/T),'ho':float(100*(ts['Economically inactive: Looking after home or family']+ts['Economically inactive: Other'])/T)}
# PT share among self-employed (TS066) -> hours class for self-employed
se_pt=float((ts.iloc[7]+ts.iloc[10])/(ts.iloc[6]+ts.iloc[9])); out['sePT']=se_pt
# ---------- HEALTH: RM046 good/not-good by age band (all tenures) + TS037 national 5-category ratios + RM043 (<=15)
h=tab('NM_2146_1'); h.columns=['h','t','age','v']; h=h[h.t=='Total']
def ng(a): x=h[h.age==a]; return float(x[x.h=='Not good health'].v.sum()/(x[x.h=='Not good health'].v.sum()+x[x.h=='Good health'].v.sum()))
H6=['Aged 24 years and under','Aged 25 to 34 years','Aged 35 to 49 years','Aged 50 to 64 years','Aged 65 years and over']
k=tab('NM_2143_1'); k.columns=['e','h','age','v']; k=k[k.e=='Total']; kx=k[k.age=='Aged 15 years and under']; ng_kid=float(kx[kx.h=='Not good health'].v.sum()/(kx[kx.h=='Not good health'].v.sum()+kx[kx.h=='Good health'].v.sum()))
t5=tab('NM_2055_1'); t5.columns=['h','v']; t5=t5.set_index('h').v
good=np.array([t5['Very good health'],t5['Good health']],float); good/=good.sum(); bad=np.array([t5['Fair health'],t5['Bad health'],t5['Very bad health']],float); bad/=bad.sum()
def row(n): return {'very good':float((1-n)*good[0]),'good':float((1-n)*good[1]),'fair':float(n*bad[0]),'bad':float(n*bad[1]),'very bad':float(n*bad[2])}
out['health']=[row(ng_kid)]+[row(ng(a)) for a in H6]+[row(ng(H6[4]))]
out['t_ng']={a:ng(a) for a in H6}
# ---------- EDUCATION: 2011 age shape (DC5102EW) fitted to 2021 TS067 totals
q=pd.read_csv(N+'NM_1102_1.EW.csv'); q=q[q.C_SEX_NAME=='All persons']
MAP={'No qualifications':'none','Level 1 qualifications':'gcse','Level 2 qualifications':'gcse','Other qualifications':'gcse','Apprenticeship':'l3','Level 3 qualifications':'l3','Level 4 qualifications and above':'deg'}
A11=['Age 16 to 24','Age 25 to 34','Age 35 to 49','Age 50 to 64','Age 65 and over']
sh=np.array([[q[(q.C_AGE_NAME==a)&(q.C_HLQPUK11_NAME.map(MAP)==c)].OBS_VALUE.sum() for c in ['none','gcse','l3','deg']] for a in A11],float); sh/=sh.sum(1,keepdims=True)
tq=tab('NM_2084_1'); tq.columns=['c','v']; tq=tq.set_index('c').v; real=np.array([tq['No qualifications'],tq['Level 1 and entry level qualifications']+tq['Level 2 qualifications']+tq['Other qualifications'],tq['Apprenticeship']+tq['Level 3 qualifications'],tq['Level 4 qualifications or above']],float); real/=real.sum()
w=np.array([pop('M',16,24)+pop('F',16,24),pop('M',25,34)+pop('F',25,34),pop('M',35,49)+pop('F',35,49),pop('M',50,64)+pop('F',50,64),pop('M',65,99)+pop('F',65,99)],float)
f=np.ones(4)
for _ in range(200): m=sh*f; m/=m.sum(1,keepdims=True); cur=(w[:,None]*m).sum(0)/w.sum(); f*=real/cur
m=sh*f; m/=m.sum(1,keepdims=True); out['edu']=[{c:float(v) for c,v in zip(['none','gcse','l3','deg'],r_)} for r_ in m]+[]
out['t_edu']={c:float(100*v) for c,v in zip(['none','gcse','l3','deg'],real)}
qe=tab('NM_2149_1'); qe.columns=['e','q','v']
def g8(e): return {'Asian, Asian British or Asian Welsh':'asian','Black, Black British, Black Welsh, Caribbean or African':'black','Mixed or Multiple ethnic groups':'mixed','White: English, Welsh, Scottish, Northern Irish or British':'wb','White: Irish':'irish','White: Gypsy or Irish Traveller, Roma or Other White':'ow','Other ethnic group':'other'}.get(e)
qe['g']=qe.e.map(g8); qe=qe.dropna(subset=['g']); dg={g:float(qe[(qe.g==g)&(qe.q=='Level 4 qualifications or above')].v.sum()/qe[(qe.g==g)&(qe.q=='Total')].v.sum()) for g in qe.g.unique()}
allq=float(real[3]); out['eduMul']={k:dg[G8[k]]/allq if G8[k]!='ow' else (dg['irish']*507465+dg['ow']*3836746)/(507465+3836746)/allq for k in K}
# ---------- PARTNERSHIP: RM067 by sex x age
lp=tab('NM_2167_1'); lp.columns=['s','age','sex','v']
M5={'Living in a couple: Married':'married','Living in a couple: In a civil partnership':'married','Living in a couple: Cohabiting':'cohab','Living in a couple: Separated, but still married or in a civil partnership':'divorced','Not living in a couple: Single (never married and never registered a civil partnership)':'single','Not living in a couple: Married or in a registered civil partnership':'divorced','Not living in a couple: Separated (including those who are married and those who are in civil partnerships)':'divorced','Not living in a couple: Divorced or formerly in a civil partnership which is now legally dissolved':'divorced','Not living in a couple: Widowed or surviving partner from a civil partnership':'widowed'}
lp['k']=lp.s.map(M5); lp=lp.dropna(subset=['k']); rs={}; marr={}
for sx in 'MF':
    rr=[];mm=[]
    for a in A21:
        x=lp[(lp.sex==SX[sx])&(lp.age==a)].groupby('k').v.sum(); x=x/x.sum(); rr.append({k:float(v) for k,v in x.items()}); mm.append(float(x['married']/(x['married']+x['cohab'])))
    rs[sx]=rr+[rr[4]]; marr[sx]=mm+[mm[4]]
out['rs']=rs; out['marr']=marr
json.dump(out,open('g2.json','w'))
print(json.dumps(out['act']['F'][1]),'\n',json.dumps(out['act']['M'][4])); print(out['health'][2]); print(out['edu'][0]); print(out['sePT'],out['t_act'])

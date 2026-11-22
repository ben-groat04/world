import show, pandas as pd, json, re, numpy as np
D=json.load(open('/home/user/world/experiments/ai-convo/sampler/data.json'))
def tab(d,g): return show.load(d,g).drop(columns=['MEASURES','OBS_STATUS','OBS_CONF'])
def norm(d,k=100.0): s=sum(d.values()); return {a:k*v/s for a,v in d.items()}
def fmt(d): return ','.join(f'{k}:{v:.2f}'.rstrip('0').rstrip('.') for k,v in d.items() if v>0.004)
def P(s): return {k:float(v) for k,v in (x.split(':') for x in s.split(','))}
out={}
AGE5=['Aged 16 to 24 years','Aged 25 to 34 years','Aged 35 to 49 years','Aged 50 to 64 years','Aged 65 years and over']
# population helpers (TS009 EW) for 16-17 / 18-24 and 65-74 / 75+ weights, by sex
t=tab('NM_2029_1','EW'); t.columns=['sex','age','v']; t=t[t.age.str.match(r'^Aged (\d+) years?$')]; t['a']=t.age.str.extract(r'(\d+)').astype(int)
def pop(sex,lo,hi): return t[(t.sex==sex)&(t.a>=lo)&(t.a<=hi)].v.sum()
SX={'M':'Male','F':'Female'}
oldact=D['act']
# ---------- activity: RM024 + RM056 + TS066 + priors
r=tab('NM_2124_1','EW'); r.columns=['st','age','sex','v']
h=tab('NM_2156_1','EW'); h.columns=['hrs','age','sex','v']
ts=tab('NM_2083_1','EW'); ts.columns=['c','v']; ts=ts.set_index('c').v
self_share=(ts.iloc[[6,9]].sum())/ts.iloc[2]
inact={'re':ts['Economically inactive: Retired'],'ho':ts['Economically inactive: Looking after home or family'],'si':ts['Economically inactive: Long-term sick or disabled']}
oth=ts['Economically inactive: Other']; inact['ho']+=oth*inact['ho']/(inact['ho']+inact['si']); inact['si']+=oth*inact['si']/(inact['ho']+inact['si']) if False else 0
inact['si']+=oth*ts['Economically inactive: Long-term sick or disabled']/(ts['Economically inactive: Long-term sick or disabled']+ts['Economically inactive: Looking after home or family'])
act={}
for sx in 'MF':
    rows=[]
    for i,a in enumerate(AGE5):
        g=lambda s: r[(r.sex==SX[sx])&(r.age==a)&(r.st.str.startswith(s))].v.sum()
        tot=r[(r.sex==SX[sx])&(r.age==a)&(r.st=='Total')].v.sum()
        emp=r[(r.sex==SX[sx])&(r.age==a)&(r.st=='Economically active (excluding full-time students): In employment')].v.sum()
        un=r[(r.sex==SX[sx])&(r.age==a)&(r.st=='Economically active (excluding full-time students): Unemployed')].v.sum()
        stu=r[(r.sex==SX[sx])&(r.age==a)&(r.st.isin(['Economically active and a full-time student: In employment','Economically active and a full-time student: Unemployed','Economically inactive and a full-time student']))].v.sum()
        ina=r[(r.sex==SX[sx])&(r.age==a)&(r.st=='Economically inactive (excluding full-time students)')].v.sum()
        ft=h[(h.sex==SX[sx])&(h.age==a)&(h.hrs=='Full-time')].v.sum(); hp=h[(h.sex==SX[sx])&(h.age==a)&(h.hrs=='Part-time')].v.sum(); ftsh=ft/(ft+hp)
        d=dict(emp=emp/tot,un=un/tot,st=stu/tot,ina=ina/tot,ftsh=ftsh)
        if i==0: # 18-24 only: assume 90% of 16-17s are students (assumption)
            p1617=pop(SX[sx],16,17); p1824=pop(SX[sx],18,24); T=p1617+p1824
            s18=max(0,(d['st']*T-0.9*p1617)/p1824); rest=(1-s18)/(1-d['st']); d={**d,'st':s18,'emp':d['emp']*rest,'un':d['un']*rest,'ina':d['ina']*rest}
        rows.append(d)
    act[sx]=rows
# self-employed share by sex/age: prior profile scaled so overall = Census
def prior_se(sx,i):
    p=P(oldact[sx][i] if i<6 else oldact[sx][5]); e=p.get('ft',0)+p.get('pt',0)+p.get('se',0); return p.get('se',0)/e if e else 0
sc=[]; 
tot_e=0;tot_s=0
for sx in 'MF':
    for i in range(5):
        e=act[sx][i]['emp']*pop(SX[sx],[18,25,35,50,65][i],[24,34,49,64,99][i]); tot_e+=e; tot_s+=e*prior_se(sx,i if i<4 else 4)
kse=self_share/(tot_s/tot_e)
# inactive split prior -> IPF to national re/si/ho totals
prior_in={}
for sx in 'MF':
    for i in range(6):
        p=P(oldact[sx][i]); v=np.array([p.get('re',0.001),p.get('si',0.001),p.get('ho',0.001)]); prior_in[(sx,i)]=v/v.sum()
rowtot={}; 
for sx in 'MF':
    for i in range(5): rowtot[(sx,i)]=act[sx][i]['ina']*pop(SX[sx],[18,25,35,50,65][i],[24,34,49,64,99][i])
colT=np.array([inact['re'],inact['si'],inact['ho']]); colT=colT/colT.sum()
f=np.ones(3)
for _ in range(50):
    tot=sum(rowtot.values()); cur=sum(rowtot[k]*(prior_in[(k[0],min(k[1],4) if False else k[1])]*f)/ (prior_in[(k[0],k[1])]*f).sum() for k in rowtot)
    cur=cur/cur.sum(); f=f*colT/cur
inrows={}
for sx in 'MF':
    for i in range(5):
        v=prior_in[(sx,i)]*f; inrows[(sx,i)]=v/v.sum()
final={}
for sx in 'MF':
    rows=[]
    for i in range(5):
        d=act[sx][i]; e=d['emp']; s=min(0.5,kse*prior_se(sx,min(i,4))); 
        row=dict(ft=e*d['ftsh']*(1-s),pt=e*(1-d['ftsh'])*(1-s),se=e*s,st=d['st'],un=d['un'],re=d['ina']*inrows[(sx,i)][0],si=d['ina']*inrows[(sx,i)][1],ho=d['ina']*inrows[(sx,i)][2])
        rows.append(row)
    # split 65+ into 65-74 / 75+ using prior shape scaled to match
    r65=rows[4]; p74=P(oldact[sx][4]); p75=P(oldact[sx][5]); w74=pop(SX[sx],65,74); w75=pop(SX[sx],75,99)
    a,b={},{}
    for k in r65:
        pk_=(p74.get(k,0)*w74+p75.get(k,0)*w75)/(w74+w75)
        s=(r65[k]*100)/pk_ if pk_>0 else 0
        a[k]=p74.get(k,0)*s/100; b[k]=p75.get(k,0)*s/100
    for dct in (a,b):
        z=sum(dct.values()); 
        for k in dct: dct[k]/=z
    final[sx]=[rows[0],rows[1],rows[2],rows[3],a,b]
out['act']={sx:[fmt({k:100*v for k,v in rw.items()}) for rw in final[sx]] for sx in 'MF'}
# overall target act (16+), TS066
T=ts['Total: All usual residents aged 16 years and over']
tg={'ft':ts.iloc[5],'pt':ts.iloc[4],'se':ts.iloc[[6,9]].sum(),'st':ts.iloc[13]+inact_st if False else ts.iloc[13]+ts['Economically inactive: Student'],'un':ts.iloc[12],'re':ts['Economically inactive: Retired'],'si':ts['Economically inactive: Long-term sick or disabled'],'ho':ts['Economically inactive: Looking after home or family']+oth}
out['t_act']=fmt({k:100*v/T for k,v in tg.items()})
# ---------- health (RM043): scale priors to Census good/not-good by age
hh=tab('NM_2143_1','EW'); hh.columns=['eth','hl','age','v']
def ng(a): 
    x=hh[(hh.eth=='Total')&(hh.age==a)]; return x[x.hl=='Not good health'].v.sum()/x[x.hl=='Total'].v.sum() if (x.hl=='Total').any() else x[x.hl=='Not good health'].v.sum()/x[x.hl!='Not good health'].v.sum()
hh2=hh[hh.eth=='Total']
def share(a):
    x=hh2[hh2.age==a]; n=x[x.hl=='Not good health'].v.sum(); g=x[x.hl=='Good health'].v.sum(); return n/(n+g)
tgt={'0':share('Aged 15 years and under'),'16-49':share('Aged 16 to 49 years'),'50-64':share('Aged 50 to 64 years'),'65+':share('Aged 65 years and over')}
pr=[P(s) for s in D['health']]
def scale(p,ngt):
    cur=sum(p[k] for k in('fair','bad','very bad'))/100; 
    return {k:(v*ngt/cur if k in('fair','bad','very bad') else v*(1-ngt)/(1-cur)) for k,v in p.items()}
rows=[scale(pr[0],tgt['0'])]
# 16-49 bands 1..3 share a common factor: choose f so pop-weighted not-good = target
w=[pop('Male',18,24)+pop('Female',18,24),pop('Male',25,34)+pop('Female',25,34),pop('Male',35,49)+pop('Female',35,49)]
cur=[sum(pr[i][k] for k in('fair','bad','very bad'))/100 for i in (1,2,3)]
f=tgt['16-49']/(sum(a*b for a,b in zip(w,cur))/sum(w))
for i,c in zip((1,2,3),cur): rows.append(scale(pr[i],min(.9,c*f)))
rows.append(scale(pr[4],tgt['50-64']))
w65=[pop('Male',65,74)+pop('Female',65,74),pop('Male',75,99)+pop('Female',75,99)]
c65=[sum(pr[i][k] for k in('fair','bad','very bad'))/100 for i in (5,6)]
f=tgt['65+']/(sum(a*b for a,b in zip(w65,c65))/sum(w65))
for i,c in zip((5,6),c65): rows.append(scale(pr[i],min(.95,c*f)))
out['health']=[fmt(r) for r in rows]; out['t_ng']={k:round(v*100,1) for k,v in tgt.items()}
# ---------- partnership (RM067 by sex x age)
lp=tab('NM_2167_1','EW'); lp.columns=['s','age','sex','v']
M5={'Living in a couple: Married':'married','Living in a couple: In a civil partnership':'married','Living in a couple: Cohabiting':'cohab','Living in a couple: Separated, but still married or in a civil partnership':'divorced','Not living in a couple: Single (never married and never registered a civil partnership)':'single','Not living in a couple: Married or in a registered civil partnership':'divorced','Not living in a couple: Separated (including those who are married and those who are in civil partnerships)':'divorced','Not living in a couple: Divorced or formerly in a civil partnership which is now legally dissolved':'divorced','Not living in a couple: Widowed or surviving partner from a civil partnership':'widowed'}
lp['k']=lp.s.map(M5); lp=lp.dropna(subset=['k'])
oldrs=[P(s) for s in D['rs']]
rs={}
marr={}
for sx in 'MF':
    rows=[]; mr=[]
    for a in AGE5:
        x=lp[(lp.sex==SX[sx])&(lp.age==a)].groupby('k').v.sum(); rows.append(norm(x.to_dict())); mr.append(x['married']/(x['married']+x['cohab']))
    # split 65+: scale prior rows
    w74=pop(SX[sx],65,74); w75=pop(SX[sx],75,99); r65=rows[4]; a_,b_={},{}
    for k in r65:
        pkv=(oldrs[4].get(k,0)*w74+oldrs[5].get(k,0)*w75)/(w74+w75); s=r65[k]/pkv if pkv else 0
        a_[k]=oldrs[4].get(k,0)*s; b_[k]=oldrs[5].get(k,0)*s
    rs[sx]=[fmt(norm(x)) for x in rows[:4]]+[fmt(norm(a_)),fmt(norm(b_))]
    marr[sx]=[round(v,2) for v in mr]+[round(mr[4]+0.0,2)]
out['rs']=rs; out['marr']=marr
# ---------- household composition by age (RM057) -> hhAge; IL/EW profile
hc=tab('NM_2157_1','EW'); hc.columns=['c','age','v']; hci=tab('NM_2157_1','IL'); hci.columns=['c','age','v']
CMAP={'One-person household: Aged 66 years and over':'one66','One-person household: Other':'one','Single family household: All aged 66 years and over':'c66',
 'Single family household: Married or civil partnership couple: No children':'couple','Single family household: Cohabiting couple family: No children':'couple',
 'Single family household: Married or civil partnership couple: Dependent children':'couple_dep','Single family household: Cohabiting couple family: With dependent children':'couple_dep',
 'Single family household: Married or civil partnership couple: All children non-dependent':'cnd','Single family household: Cohabiting couple family: All children non-dependent':'cnd',
 'Single family household: Lone parent family: With dependent children':'lone_dep','Single family household: Lone parent family: All children non-dependent':'lnd',
 'Single family household: Other single family household: Other family composition':'multi','Other household types: With dependent children':'multi','Other household types: Other, including all full-time students and all aged 66 years and over':'oth'}
def hhrows(df):
    df=df.copy(); df['k']=df.c.map(CMAP); df=df.dropna(subset=['k']); return df.groupby(['age','k']).v.sum()
H=hhrows(hc); Hi=hhrows(hci)
bands=['Aged 16 to 24 years','Aged 25 to 34 years','Aged 35 to 49 years','Aged 50 years and over']
def mk(H,band):
    g=lambda k: H.get((band,k),0)
    d={'one':g('one')+g('one66'),'couple':g('couple')+g('c66'),'multigen':(0.4*g('multi') if band!=bands[0] else 0),'shared':0.2*g('multi')+0.9*g('oth')}
    mrest=0.4*g('multi') if band==bands[0] else 0.4*g('multi')
    return g,d
res=[]
for bi,band in enumerate(bands):
    g,d=mk(H,band)
    if bi==0: d.update({'couple_dep':0.1*g('couple_dep'),'lone_dep':0.1*g('lone_dep'),'withparents':0.9*(g('couple_dep')+g('lone_dep'))+g('cnd')+g('lnd')+0.6*g('multi')+0.4*g('multi')*0})
    elif bi==1: d.update({'couple_dep':g('couple_dep'),'lone_dep':g('lone_dep'),'withparents':g('cnd')+g('lnd')+0.6*g('multi')})
    elif bi==2: d.update({'couple_dep':g('couple_dep'),'lone_dep':g('lone_dep'),'withparents':0.25*(g('cnd')+g('lnd')),'couple_adult':0.75*g('cnd')+0.4*g('multi'),'lone_adult':0.75*g('lnd')})
    else: d.update({'couple_dep':g('couple_dep'),'lone_dep':g('lone_dep'),'couple_adult':g('cnd'),'lone_adult':g('lnd')})
    res.append(norm(d))
# split 50+ into 50-64 / 65-74 / 75+ : one66/c66 are >=66 ; others <66 -> 50-64
g,_=mk(H,bands[3]); 
old=[P(s) for s in D['hhAge']]
h50=res[3]
r5064={'one':g('one'),'couple':0.5*g('couple'),'couple_dep':g('couple_dep'),'lone_dep':g('lone_dep'),'couple_adult':0.5*g('cnd'),'lone_adult':0.5*g('lnd'),'multigen':0.4*g('multi')*0.5,'shared':0.2*g('multi')*0.5+0.9*g('oth')*0.3}
r65p={'one':g('one66'),'couple':g('c66')+0.5*g('couple'),'couple_adult':0.5*g('cnd'),'lone_adult':0.5*g('lnd'),'multigen':0.4*g('multi')*0.1,'shared':0.9*g('oth')*0.1}
for dct in (r5064,r65p): pass
w74=pop('Male',65,74)+pop('Female',65,74); w75=pop('Male',75,99)+pop('Female',75,99)
a_,b_={},{}
for k in r65p:
    pkv=(old[4].get(k,0)*w74+old[5].get(k,0)*w75)/(w74+w75); s=r65p[k]/pkv if pkv>0 else 0
    a_[k]=old[4].get(k,0)*s; b_[k]=old[5].get(k,0)*s
hhAge=[fmt(res[0]),fmt(res[1]),fmt(res[2]),fmt(norm(r5064)),fmt(norm(a_)),fmt(norm(b_))]
out['hhAge']=hhAge
# IL/EW ratio by type (adults)
def tot(H):
    keys=['one','one66','couple','c66','couple_dep','cnd','lone_dep','lnd','multi','oth']; 
    s={k:sum(H.get((b,k),0) for b in bands[1:]) for k in keys}; return s
a=tot(H); b=tot(Hi); za=sum(a.values()); zb=sum(b.values())
rat=lambda *ks: (sum(b[k] for k in ks)/zb)/(sum(a[k] for k in ks)/za)
out['prof_hh']={'one':round(rat('one','one66'),2),'couple':round(rat('couple','c66'),2),'couple_dep':round(rat('couple_dep'),2),'lone_dep':round(rat('lone_dep'),2),'withparents':round(rat('cnd','lnd'),2),'shared':round(rat('oth'),2),'multigen':round(rat('multi'),2)}
json.dump(out,open('B.json','w'),indent=0)
for k,v in out.items(): print(k,json.dumps(v)[:1500])

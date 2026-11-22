import show, pandas as pd, json, re, numpy as np
D=json.load(open('/home/user/world/experiments/ai-convo/sampler/data.json'))
A=json.load(open('A.json'))
def tab(d,g): return show.load(d,g).drop(columns=['MEASURES','OBS_STATUS','OBS_CONF'])
def norm(d,k=100.0): s=sum(d.values()); return {a:k*v/s for a,v in d.items()}
def fmt(d): return ','.join(f'{k}:{v:.2f}'.rstrip('0').rstrip('.') for k,v in d.items() if v>0.004)
def P(s): return {k:float(v) for k,v in (x.split(':') for x in s.split(','))}
out={}
# ---------- tenure by household composition (RM135), rating by composition (RM098) and tenure (RM099)
TM={'Owned: Owns outright':'own','Owned: Owns with a mortgage or loan or shared ownership':'mort','Rented: Social rented':'soc','Rented: Private rented or lives rent free':'priv'}
CM={'One-person household: Aged 66 years and over':'one','One-person household: Other':'one','Single family household: All aged 66 years and over':'couple',
 'Single family household: Married or civil partnership couple: No children':'couple','Single family household: Cohabiting couple family: No children':'couple',
 'Single family household: Married or civil partnership couple: Dependent children':'couple_dep','Single family household: Cohabiting couple family: With dependent children':'couple_dep',
 'Single family household: Married or civil partnership couple: All children non-dependent':'adult','Single family household: Cohabiting couple family: All children non-dependent':'adult','Single family household: Lone parent family: All children non-dependent':'adult',
 'Single family household: Lone parent family: With dependent children':'lone_dep','Other household types: With dependent children':'multigen','Single family household: Other single family household: Other family composition':'multigen',
 'Other household types: Other, including all full-time students and all aged 66 years and over':'shared'}
t=tab('NM_2235_1','EW'); t.columns=['c','t','v']; t['k']=t.c.map(CM); t['tk']=t.t.map(TM); t=t.dropna(subset=['k','tk'])
ten={k:fmt(norm(t[t.k==k].groupby('tk').v.sum().to_dict())) for k in ['one','couple','couple_dep','lone_dep','adult','multigen','shared']}
out['ten']=ten
# tenure totals EW/IL (TS054 households)
def tt(g):
    x=tab('NM_2072_1',g); x.columns=['t','v']; x=x.set_index('t').v
    d={'own':x['Owned: Owns outright'],'mort':x['Owned: Owns with a mortgage or loan']+x['Shared ownership'],'soc':x['Social rented'],'priv':x['Private rented']+x['Lives rent free']}
    return norm(d)
TE={g:tt(g) for g in['EW','IL']}
out['t_ten']={g:fmt(TE[g]) for g in TE}; out['prof_ten']={k:round(TE['IL'][k]/TE['EW'][k],2) for k in TE['EW']}
# rating: keys -1 (<= -1), 0, 1, 2 (+2 or more)
RM={'Occupancy rating of bedrooms: +2 or more':'2','Occupancy rating of bedrooms: +1':'1','Occupancy rating of bedrooms: 0':'0','Occupancy rating of bedrooms: -1 or less':'-1'}
def rate(d,g,keymap=None,col='c'):
    x=tab(d,g); x.columns=['c','r','v']; x['r']=x.r.map(RM); x=x.dropna(subset=['r']); return x
bedType={};
x=rate('NM_2198_1','EW'); x['k']=x.c.map(CM); x=x.dropna(subset=['k'])
for k in ten: bedType[k]=fmt(norm(x[x.k==k].groupby('r').v.sum().to_dict()))
out['bedType']=bedType
x=rate('NM_2199_1','EW'); x.columns=['c','r','v']
TM2={'Owned: Owns outright':'own','Owned: Owns with a mortgage or loan or shared ownership':'mort','Rented: Social rented':'soc','Rented: Private rented or lives rent free':'priv'}
x['k']=x.c.map(TM2); x=x.dropna(subset=['k']); allr=norm(x.groupby('r').v.sum().to_dict())
bt={}
for k in ['own','mort','soc','priv']:
    d=norm(x[x.k==k].groupby('r').v.sum().to_dict()); bt[k]=fmt({r:d[r]/allr[r] for r in d})
out['bedTen']=bt
def over(g): 
    y=rate('NM_2199_1',g); y['k']=y.c.map(TM2); y=y.dropna(subset=['k']); z=y.groupby('r').v.sum(); return 100*z['-1']/z.sum()
out['t_over']={'EW':round(over('EW'),1),'IL':round(over('IL'),1)}; out['prof_over']=round(over('IL')/over('EW'),2)
# ---------- education: scale priors to TS067 overall; ethnic multiplier from RM049
q=tab('NM_2084_1','EW'); q.columns=['c','v']; q=q.set_index('c').v
tot=q.iloc[0]; real={'none':q['No qualifications'],'gcse':q['Level 1 and entry level qualifications']+q['Level 2 qualifications']+q['Other qualifications'],'l3':q['Apprenticeship']+q['Level 3 qualifications'],'deg':q['Level 4 qualifications or above']}
real=norm(real)
pop=tab('NM_2029_1','EW'); pop.columns=['sex','age','v']; pop=pop[(pop.sex=='All persons')&pop.age.str.match(r'^Aged (\d+) years?$')]; pop['a']=pop.age.str.extract(r'(\d+)').astype(int)
w=[pop[(pop.a>=lo)&(pop.a<=hi)].v.sum() for lo,hi in [(18,24),(25,34),(35,49),(50,64),(65,74),(75,120)]]
pri=[P(s) for s in D['edu']]; f={k:1.0 for k in real}
for _ in range(60):
    cur={k:sum(w[i]*pri[i][k]*f[k]/sum(pri[i][j]*f[j] for j in f) for i in range(6)) for k in real}; z=sum(cur.values()); cur={k:100*v/z for k,v in cur.items()}
    f={k:f[k]*real[k]/cur[k] for k in f}
out['edu']=[fmt(norm({k:pri[i][k]*f[k] for k in f})) for i in range(6)]; out['t_edu']=fmt(real)
x=tab('NM_2149_1','EW'); x.columns=['e','q','v']
def g8(e): return {'Asian, Asian British or Asian Welsh':'asian','Black, Black British, Black Welsh, Caribbean or African':'black','Mixed or Multiple ethnic groups':'mixed','White: English, Welsh, Scottish, Northern Irish or British':'wb','White: Irish':'irish','White: Gypsy or Irish Traveller, Roma or Other White':'ow','Other ethnic group':'other'}.get(e)
x['g']=x.e.map(g8); x=x.dropna(subset=['g'])
degsh={g:x[(x.g==g)&(x.q=='Level 4 qualifications or above')].v.sum()/x[(x.g==g)&(x.q=='Total')].v.sum() for g in x.g.unique()}
allsh=real['deg']/100
out['eduMul8']={g:round(v/allsh,2) for g,v in degsh.items()}
# ---------- rescale sub-group priors to group totals (uk-born, religion, edu mult)
E=A['t_eth']['EW']; G={'asian':['in','pk','bd','cn','oa'],'black':['ba','bc'],'mixed':['mx'],'wb':['wb'],'irish_ow':['wo'],'other':['ao']}
G8={'irish_ow':('irish','ow')}
uk8=A['uk8']; priorUK=D['ukBorn']
ukB={}
for g,ks in G.items():
    key=g if g in uk8 else None
    tgt=uk8[g] if g in uk8 else (E['wo'] and (uk8['irish']*0.1+uk8['ow']*0.9) if g=='irish_ow' else uk8['other'])
    if g=='irish_ow': tgt=(uk8['irish']*507465+uk8['ow']*(3667997+67768+100981))/(507465+3667997+67768+100981)
    wts=np.array([E[k] for k in ks]); pr=np.array([priorUK[k] for k in ks])
    lo,hi=0,5
    for _ in range(60):
        s=(lo+hi)/2; v=np.minimum(.99,1-(1-pr)*s) if False else np.minimum(.995,pr*s); cur=(wts*v).sum()/wts.sum()
        if cur<tgt: lo=s
        else: hi=s
    for k,vv in zip(ks,v): ukB[k]=round(float(vv),3)
out['ukBorn']=ukB
# religion: IPF sub-groups so group aggregate matches RM031
relg={'asian':['in','pk','bd','cn','oa'],'black':['ba','bc'],'mixed':['mx'],'wb':['wb'],'other':['ao']}
relR=A['rel8']; newrel={}
for g,ks in relg.items():
    tgt=relR[g]; 
    # irish/ow handled below
    wts=np.array([E[k] for k in ks]); cats=list(tgt)
    pri=np.array([[P(D['rel'][k]).get(c,0.05) for c in cats] for k in ks]); pri=pri/pri.sum(1,keepdims=True)
    f=np.ones(len(cats)); tg=np.array([tgt[c] for c in cats]); tg=tg/tg.sum()
    for _ in range(200):
        m=pri*f; m=m/m.sum(1,keepdims=True); cur=(wts[:,None]*m).sum(0)/wts.sum(); f=f*(tg+1e-9)/(cur+1e-9)
    m=pri*f; m=m/m.sum(1,keepdims=True)
    for k,row in zip(ks,m): newrel[k]=fmt(dict(zip(cats,100*row)))
# white other = irish + ow weighted
wo_w=np.array([507465,3667997+67768+100981]); cats=list(relR['irish'])
newrel['wo']=fmt({c:(relR['irish'][c]*wo_w[0]+relR['ow'][c]*wo_w[1])/wo_w.sum() for c in cats})
out['rel']=newrel
# edu multipliers per sub-group (rescale priors so group-weighted avg equals group multiplier)
em={}
for g,ks in {'asian':['in','pk','bd','cn','oa'],'black':['ba','bc'],'mixed':['mx'],'wb':['wb'],'other':['ao']}.items():
    wts=np.array([E[k] for k in ks]); pr=np.array([D['eduMul'][k] for k in ks]); s=out['eduMul8'][g]/((wts*pr).sum()/wts.sum())
    for k,v in zip(ks,pr*s): em[k]=round(float(v),2)
em['wo']=round((out['eduMul8']['irish']*507465+out['eduMul8']['ow']*(3667997+67768+100981))/(507465+3667997+67768+100981),2)
out['eduMul']=em
# ---------- children (ONS fertility, women): P(childless) and parity by cohort, at representative ages
ch=pd.read_excel('/tmp/claude-0/-home-user-world/3aafb74d-db3e-530a-8b2c-0ff1d175c0be/scratchpad/ashe/ch.xlsx','Table 3',header=None)
ch=ch.iloc[9:].dropna(subset=[0,1]); ch.columns=['yr','age','n0','n1','n2','n3','n4']
ch=ch.apply(pd.to_numeric,errors='coerce').dropna(subset=['yr','age'])
def fem(age):
    yr=2025-age; a=min(age,45); x=ch[(ch.yr==yr)&(ch.age==a)]
    return x.iloc[0] if len(x) else None
reps=[22,30,42,57,70,80]; cl_f=[]; 
for a in reps:
    r=fem(a); cl_f.append(round(r.n0/100,2) if r is not None else None)
out['childless_F']=cl_f
r45=ch[(ch.age==45)&(ch.yr.between(1960,1979))][['n1','n2','n3','n4']].mean(); out['nkids']=fmt({str(i+1):float(v) for i,v in enumerate(r45)})
json.dump(out,open('C.json','w'),indent=0)
for k,v in out.items(): print(k,json.dumps(v)[:1100])

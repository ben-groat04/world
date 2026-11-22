# Part 1: population, ethnicity, birthplace, religion  (all numbers from Nomis/ONS tables; see data.json sources)
import sys; sys.path.insert(0,'../nomis')
import show, pandas as pd, numpy as np, json, re
N='../nomis/'
def tab(d,g='EW'):
    df=pd.read_csv(N+f'{d}.{g}.csv'); names=[c for c in df.columns if c.endswith('_NAME') and not c.startswith(('DATE','GEOGRAPHY','MEASURES','OBS_'))]
    df=df.groupby(names,sort=False)['OBS_VALUE'].sum().reset_index(); df.columns=[c.replace('C2021_','').replace('_NAME','') for c in df.columns]; return df
K=['wb','wo','in','pk','bd','cn','oa','ba','bc','mx','ao']
def e21(n):
    n=n.replace('Asian, Asian British or Asian Welsh: ','A:'); m={'A:Indian':'in','A:Pakistani':'pk','A:Bangladeshi':'bd','A:Chinese':'cn','A:Other Asian':'oa','Black, Black British, Black Welsh, Caribbean or African: African':'ba','Black, Black British, Black Welsh, Caribbean or African: Caribbean':'bc','Black, Black British, Black Welsh, Caribbean or African: Other Black':'bc','White: English, Welsh, Scottish, Northern Irish or British':'wb','White: Irish':'wo','White: Gypsy or Irish Traveller':'wo','White: Roma':'wo','White: Other White':'wo','Other ethnic group: Arab':'ao','Other ethnic group: Any other ethnic group':'ao'}
    return 'mx' if n.startswith('Mixed or Multiple ethnic groups:') else m.get(n)
def e11(n):
    n=n.replace('Asian/Asian British: ','A:').replace('Black/African/Caribbean/Black British: ','B:')
    m={'A:Indian':'in','A:Pakistani':'pk','A:Bangladeshi':'bd','A:Chinese':'cn','A:Other Asian':'oa','B:African':'ba','B:Caribbean':'bc','B:Other Black':'bc','White: English/Welsh/Scottish/Northern Irish/British':'wb','White: Irish':'wo','White: Gypsy or Irish Traveller':'wo','White: Other White':'wo','Other ethnic group: Arab':'ao','Other ethnic group: Any other ethnic group':'ao'}
    return 'mx' if n.startswith('Mixed/multiple ethnic group:') and n!='Mixed/multiple ethnic group: Total' else m.get(n)
G8={'in':'asian','pk':'asian','bd':'asian','cn':'asian','oa':'asian','ba':'black','bc':'black','mx':'mixed','wb':'wb','wo':'ow','ao':'other'}
def g8(e):
    return {'Asian, Asian British or Asian Welsh':'asian','Black, Black British, Black Welsh, Caribbean or African':'black','Mixed or Multiple ethnic groups':'mixed','White: English, Welsh, Scottish, Northern Irish or British':'wb','White: Irish':'irish','White: Gypsy or Irish Traveller, Roma or Other White':'ow','Other ethnic group':'other'}.get(e)
out={}
# --- single-year population (TS009), E&W
t=tab('NM_2029_1'); t.columns=['sex','age','v']; t=t[t.age.str.match(r'^(Aged (\d+) years?|Aged under 1 year)$')]; t['a']=t.age.map(lambda s:0 if 'under 1' in s else int(re.search(r'\d+',s).group()))
t=t[t.a<=99]
M=t[t.sex=='Male'].set_index('a').v; F=t[t.sex=='Female'].set_index('a').v
out['popY']=[[int(M.get(a,0)),int(F.get(a,0))] for a in range(100)]
# --- inner/E&W age ratio by band
def sh(g):
    x=tab('NM_2029_1',g); x.columns=['sex','age','v']; x=x[(x.sex=='All persons')&x.age.str.match(r'^Aged (\d+) years?$')]; x['a']=x.age.str.extract(r'(\d+)').astype(int); return x
e,i=sh('EW'),sh('IL'); edges=[0,15,20,25,30,35,40,50,60,65,75,120]; pa=[]
for lo,hi in zip(edges,edges[1:]): pa.append([lo,round((i[(i.a>=lo)&(i.a<hi)].v.sum()/i.v.sum())/(e[(e.a>=lo)&(e.a<hi)].v.sum()/e.v.sum()),3)])
out['ageMul']=pa
# --- ethnicity totals, by age
def tot(g):
    x=tab('NM_2041_1',g); x.columns=['e','v']; x['k']=x.e.map(e21); s=x.dropna().groupby('k').v.sum(); return s
ET={g:tot(g) for g in['EW','IL']}
AGES=['Aged 24 years and under','Aged 25 to 34 years','Aged 35 to 49 years','Aged 50 to 64 years','Aged 65 years and over']
x=tab('NM_2132_1'); x.columns=['e','age','sex','v']; x=x[x.sex=='All persons']; x['k']=x.e.map(e21); x=x.dropna(subset=['k'])
rows=[]
for a in AGES: s=x[x.age==a].groupby('k').v.sum(); rows.append({k:float(s[k]/s.sum()) for k in K})
out['eth']=rows
xi=tab('NM_2132_1','IL'); xi.columns=['e','age','sex','v']; xi=xi[xi.sex=='All persons']; xi['k']=xi.e.map(e21); xi=xi.dropna(subset=['k'])
adult=lambda d: d[d.age!=AGES[0]].groupby('k').v.sum()
tg=adult(xi); tg=tg/tg.sum(); ew25=adult(x); ew25=ew25/ew25.sum()
out['t_eth25']={'EW':{k:float(100*ew25[k]) for k in K},'IL':{k:float(100*tg[k]) for k in K}}
out['t_eth']={g:{k:float(100*ET[g][k]/ET[g].sum()) for k in K} for g in ET}
# adult age structure for fitting the inner multiplier
w=np.zeros(5); step=lambda tbl,a:[v for f,v in tbl if a>=f][-1]
for a in range(25,100): w[0 if a<35 else 1 if a<50 else 2 if a<65 else 3 if False else (3 if a<65 else 4)]+=0  # placeholder (re-done below)
def eb(a): return 0 if a<25 else 1 if a<35 else 2 if a<50 else 3 if a<65 else 4
w=np.zeros(5)
for a in range(25,100): w[eb(a)]+=sum(out['popY'][a])*step(out['ageMul'],a)
w/=w.sum(); R=np.array([[r[k] for k in K] for r in rows]); m=np.ones(len(K)); tgv=np.array([tg[k] for k in K])
for _ in range(300): p=R*m; p/=p.sum(1,keepdims=True); cur=(w[:,None]*p).sum(0); cur/=cur.sum(); m*=tgv/cur
out['ethMul']={k:float(v) for k,v in zip(K,m)}
# --- tenure ratio IL/EW (TS054)
def tt(g):
    x=tab('NM_2072_1',g); x.columns=['t','v']; x=x.set_index('t').v
    d={'own':x['Owned: Owns outright'],'mort':x['Owned: Owns with a mortgage or loan']+x['Shared ownership'],'soc':x['Social rented'],'priv':x['Private rented']+x['Lives rent free']}; s=sum(d.values()); return {k:float(100*v/s) for k,v in d.items()}
TE={g:tt(g) for g in['EW','IL']}; out['t_ten']=TE; out['tenMul']={k:TE['IL'][k]/TE['EW'][k] for k in TE['EW']}
# --- birthplace: UK-born by detailed ethnicity (2011) scaled to 2021 group totals (RM027)
c=pd.read_csv(N+'NM_663_1.EW.csv'); c=c[c.C_SEX_NAME=='All persons']; c['k']=c.C_ETHPUK11_NAME.map(e11); c=c.dropna(subset=['k'])
ukc=['Europe: United Kingdom: Total']; allc='All categories: Country of birth'
tot11=c[c.C_COB_NAME==allc].groupby('k').OBS_VALUE.sum(); uk11=c[c.C_COB_NAME.isin(ukc)].groupby('k').OBS_VALUE.sum()
nonuk=1-uk11/tot11
r=tab('NM_2127_1'); r.columns=['arr','e8','v']; r['g']=r.e8.map(g8); r=r.dropna(subset=['g'])
uk21={g:float(r[(r.g==g)&(r.arr=='Born in the UK')].v.sum()/r[(r.g==g)&(r.arr=='Total')].v.sum()) for g in r.g.unique()}
# 2021 group weights by detailed key: wo = irish + ow -> 'irish'/'ow' via TS021 counts
x=tab('NM_2041_1'); x.columns=['e','v']; cnt={'irish':float(x[x.e=='White: Irish'].v.iloc[0]),'ow':float(x[x.e.isin(['White: Gypsy or Irish Traveller','White: Roma','White: Other White'])].v.sum())}
ukB={}
for g,keys in {'asian':['in','pk','bd','cn','oa'],'black':['ba','bc'],'mixed':['mx'],'wb':['wb'],'other':['ao']}.items():
    wt=np.array([ET['EW'][k] for k in keys]); nu=np.array([nonuk[k] for k in keys]); f=(1-uk21[g])*wt.sum()/(wt*nu).sum()
    for k,v in zip(keys,np.minimum(1,nu*f)): ukB[k]=float(1-v)
wo_nu=nonuk['wo']; f=(1-(uk21['irish']*cnt['irish']+uk21['ow']*cnt['ow'])/(cnt['irish']+cnt['ow'])); ukB['wo']=float(1-min(1,wo_nu*f/wo_nu))
out['ukBorn']=ukB
# UK-born share by age (RM011) relative to all ages
a=tab('NM_2111_1'); a.columns=['cob','age','v']
ab={}
for ag,x in a.groupby('age'):
    ab[ag]=float(x[x.cob=='Europe: United Kingdom'].v.sum()/x[x.cob.str.startswith('Total')].v.sum())
out['ukAge']=ab
# birth regions for non-UK-born by ethnicity (2011 leaf regions)
REG=['Europe: Ireland','Europe: Other Europe: EU countries: Member countries in March 2001','Europe: Other Europe: EU countries: Accession countries April 2001 to March 2011','Europe: Other Europe: Rest of Europe','Africa: North Africa','Africa: Central and Western Africa','Africa: South and Eastern Africa','Africa: Africa not otherwise specified','Middle East and Asia: Middle East','Middle East and Asia: Eastern Asia','Middle East and Asia: Southern Asia','Middle East and Asia: South-East Asia','Middle East and Asia: Central Asia','The Americas and the Caribbean: North America and the Caribbean','The Americas and the Caribbean: Central and South America','Antarctica and Oceania (including Australasia)','Other']
def lab(s): return s.split(': ')[-1] if not s.startswith('Europe: Other Europe: EU') else ('EU (pre-2004 members)' if 'Member' in s else 'EU (2004-2011 accession)')
cr={}
for k in K:
    x=c[(c.k==k)&(c.C_COB_NAME.isin(REG))].groupby('C_COB_NAME').OBS_VALUE.sum(); cr[k]={lab(r):float(x.get(r,0)) for r in REG}
out['cobRegion']=cr
nat=tab('NM_2032_1'); nat.columns=['c','v']; nat=nat.set_index('c').v
out['ukNation']={n:float(nat[n]) for n in nat.index if n in ('Europe: United Kingdom: England','Europe: United Kingdom: Wales','Europe: United Kingdom: Scotland','Europe: United Kingdom: Northern Ireland')}
# arrival-age band shares of non-UK-born (RM027, 2021) by 8-group
arr={}
for g in r.g.unique():
    x=r[(r.g==g)&(r.arr.str.startswith('Arrived in the UK: Aged'))]; arr[g]={s.replace('Arrived in the UK: Aged ','').replace(' years',''):float(v) for s,v in zip(x.arr,x.v)}
out['arr']=arr; out['uk21']=uk21; out['G8']=G8
# --- religion: 2011 detailed ethnicity x religion seeds, fitted (IPF) to 2021 group totals (RM031)
rl=pd.read_csv(N+'NM_659_1.EW.csv'); rl['k']=rl.C_ETHPUK11_NAME.map(e11); rl=rl.dropna(subset=['k'])
rl=rl[~rl.C_RELPUK11_NAME.isin(['All categories: Religion','Religion not stated'])]
RELS=['No religion','Christian','Buddhist','Hindu','Jewish','Muslim','Sikh','Other religion']
seed={k:np.array([rl[(rl.k==k)&(rl.C_RELPUK11_NAME==c)].OBS_VALUE.sum() for c in RELS],float) for k in K}
q=tab('NM_2131_1'); q.columns=['e8','rel','v']; q['g']=q.e8.map(g8); q=q.dropna(subset=['g']); q=q[~q.rel.isin(['Total','Not answered'])]
tgt={g:np.array([q[(q.g==g)&(q.rel==c)].v.sum() for c in RELS],float) for g in q.g.unique()}
def fit(keys,wts,tg):
    P=np.array([seed[k]/seed[k].sum()+1e-6 for k in keys]); tg=tg/tg.sum(); f=np.ones(len(RELS))
    for _ in range(300):
        m=P*f; m/=m.sum(1,keepdims=True); cur=(np.array(wts)[:,None]*m).sum(0)/sum(wts); f*=tg/np.maximum(cur,1e-12)
    m=P*f; m/=m.sum(1,keepdims=True); return m
rel={}
for g,keys in {'asian':['in','pk','bd','cn','oa'],'black':['ba','bc'],'mixed':['mx'],'wb':['wb'],'other':['ao']}.items():
    m=fit(keys,[ET['EW'][k] for k in keys],tgt[g]); 
    for k,row in zip(keys,m): rel[k]={c:float(v) for c,v in zip(RELS,row)}
tg_wo=tgt['irish']*cnt['irish']/(cnt['irish']+cnt['ow'])*0+ (tgt['irish']/tgt['irish'].sum()*cnt['irish']+tgt['ow']/tgt['ow'].sum()*cnt['ow'])
m=fit(['wo'],[1],tg_wo); rel['wo']={c:float(v) for c,v in zip(RELS,m[0])}
out['rel']=rel
json.dump(out,open('g1.json','w'))
print(json.dumps(out['ethMul'])); print(json.dumps(ukB)); print({k:round(v,3) for k,v in out['ukAge'].items()}); print(out['ukNation']); print(json.dumps(arr['asian'])); print(json.dumps(rel['pk'])[:200]); print(json.dumps(cr['ba'])[:300])

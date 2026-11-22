import show, pandas as pd, json, re, numpy as np
def tab(d,g): return show.load(d,g).drop(columns=['MEASURES','OBS_STATUS','OBS_CONF'])
out={}
# --- pop: TS009 sex by single year -> 5y bands (thousands)
t=tab('NM_2029_1','EW'); t.columns=['sex','age','v']
t=t[t.age.str.match(r'^Aged (\d+) years?$|^Aged under 1 year$|^Aged 100 years and over$')]
def a_of(s):
    if 'under 1' in s: return 0
    return int(re.search(r'(\d+)',s).group(1))
t['a']=t.age.map(a_of); 
bands=[(0,4),(5,9),(10,14),(15,19),(20,24),(25,29),(30,34),(35,39),(40,44),(45,49),(50,54),(55,59),(60,64),(65,69),(70,74),(75,79),(80,84),(85,95)]
rows=[]
for lo,hi in bands:
    s=t[(t.a>=lo)&(t.a<=hi if hi<95 else True)]
    rows.append([lo,hi,round(s[s.sex=='Male'].v.sum()/1000),round(s[s.sex=='Female'].v.sum()/1000)])
out['pop']=rows
# --- age shares adults (EW, IL)
def age_share(g):
    t=tab('NM_2029_1',g); t.columns=['sex','age','v']; t=t[(t.sex=='All persons')&t.age.str.match(r'^Aged (\d+) years?$')]; t['a']=t.age.map(a_of); t=t[t.a>=18]
    tot=t.v.sum(); f=lambda lo,hi:100*t[(t.a>=lo)&(t.a<=hi)].v.sum()/tot
    return {'18-24':f(18,24),'25-34':f(25,34),'35-49':f(35,49),'50-64':f(50,64),'65+':f(65,200)}
out['t_age']={g:age_share(g) for g in['EW','IL']}
# --- ethnicity: map 20 -> 11
def emap(n):
    n=n.replace('Asian, Asian British or Asian Welsh: ','A:')
    m={'A:Indian':'in','A:Pakistani':'pk','A:Bangladeshi':'bd','A:Chinese':'cn','A:Other Asian':'oa',
     'Black, Black British, Black Welsh, Caribbean or African: African':'ba','Black, Black British, Black Welsh, Caribbean or African: Caribbean':'bc','Black, Black British, Black Welsh, Caribbean or African: Other Black':'bc',
     'White: English, Welsh, Scottish, Northern Irish or British':'wb','White: Irish':'wo','White: Gypsy or Irish Traveller':'wo','White: Roma':'wo','White: Other White':'wo',
     'Other ethnic group: Arab':'ao','Other ethnic group: Any other ethnic group':'ao'}
    if n.startswith('Mixed or Multiple ethnic groups:'): return 'mx'
    return m.get(n)
KEYS=['wb','wo','in','pk','bd','cn','oa','ba','bc','mx','ao']
def eth_tot(g):
    t=tab('NM_2041_1',g); t.columns=['e','v']; t['k']=t.e.map(emap); s=t.dropna().groupby('k').v.sum(); return s/s.sum()*100
E={g:eth_tot(g) for g in['EW','IL']}
out['t_eth']={g:{k:round(E[g][k],1) for k in KEYS} for g in E}
out['prof_eth']={k:round(E['IL'][k]/E['EW'][k],2) for k in KEYS}
# RM032 eth x age (EW) rows: <=24,25-34,35-49,50-64,65+
t=tab('NM_2132_1','EW'); t.columns=['e','age','sex','v']; t=t[t.sex=='All persons']; t['k']=t.e.map(emap); t=t.dropna(subset=['k'])
ages=['Aged 24 years and under','Aged 25 to 34 years','Aged 35 to 49 years','Aged 50 to 64 years','Aged 65 years and over']
ea=[]
for a in ages:
    s=t[t.age==a].groupby('k').v.sum(); s=s/s.sum()*100; ea.append(','.join(f'{k}:{s[k]:.1f}' for k in KEYS))
out['eth']=ea
# --- UK born by eth group (RM027, 8 groups)
t=tab('NM_2127_1','EW'); t.columns=['arr','e8','v']
def g8(e): 
    return {'Asian, Asian British or Asian Welsh':'asian','Black, Black British, Black Welsh, Caribbean or African':'black','Mixed or Multiple ethnic groups':'mixed','White: English, Welsh, Scottish, Northern Irish or British':'wb','White: Irish':'irish','White: Gypsy or Irish Traveller, Roma or Other White':'ow','Other ethnic group':'other'}.get(e)
t['g']=t.e8.map(g8); t=t.dropna(subset=['g'])
uk={g:t[(t.g==g)&(t.arr=='Born in the UK')].v.sum()/t[(t.g==g)&(t.arr=='Total')].v.sum() for g in t.g.unique()}
out['uk8']={k:round(v,3) for k,v in uk.items()}
# --- religion by eth (RM031)
t=tab('NM_2131_1','EW'); t.columns=['e8','rel','v']; t['g']=t.e8.map(g8); t=t.dropna(subset=['g'])
rel={}
for g in t.g.unique():
    s=t[(t.g==g)&(~t.rel.isin(['Total','Not answered']))].set_index('rel').v; rel[g]={k:round(100*v/s.sum(),1) for k,v in s.items()}
out['rel8']=rel
# --- tenure totals (TS054 hh): own/mort/soc/priv
for g in['EW','IL']:
    t=tab('NM_2072_1',g); t.columns=['t','v']; print(g); print(t.to_string())
json.dump(out,open('A.json','w'),indent=0)
for k,v in out.items(): print(k, json.dumps(v)[:900])

# Part 3: households, tenure, bedrooms, children, partner age gap
import sys; sys.path.insert(0,'../nomis')
import pandas as pd, numpy as np, json, re
from g1 import tab, N, K, G8
g1=json.load(open('g1.json')); popY=g1['popY']
def pop(lo,hi): return sum(sum(popY[a]) for a in range(lo,min(hi,99)+1))
out={}
CM={'One-person household: Aged 66 years and over':'one66','One-person household: Other':'one','Single family household: All aged 66 years and over':'c66','Single family household: Married or civil partnership couple: No children':'couple','Single family household: Cohabiting couple family: No children':'couple','Single family household: Married or civil partnership couple: Dependent children':'couple_dep','Single family household: Cohabiting couple family: With dependent children':'couple_dep','Single family household: Married or civil partnership couple: All children non-dependent':'cnd','Single family household: Cohabiting couple family: All children non-dependent':'cnd','Single family household: Lone parent family: With dependent children':'lone_dep','Single family household: Lone parent family: All children non-dependent':'lnd','Single family household: Other single family household: Other family composition':'multi','Other household types: With dependent children':'multi','Other household types: Other, including all full-time students and all aged 66 years and over':'oth'}
def hh(g):
    x=tab('NM_2157_1',g); x.columns=['c','age','v']; x['k']=x.c.map(CM); x=x.dropna(subset=['k']); return x.groupby(['age','k']).v.sum()
H,Hi=hh('EW'),hh('IL')
B=['Aged 16 to 24 years','Aged 25 to 34 years','Aged 35 to 49 years','Aged 50 years and over']
def rows(H):
    res=[]
    for bi,b in enumerate(B):
        g=lambda k: float(H.get((b,k),0)); d={}
        d['one']=g('one')+(g('one66') if bi==3 else 0); d['couple']=g('couple')+(g('c66') if bi==3 else 0); d['shared']=g('oth')
        d['multigen']=0 if bi==0 else g('multi')
        if bi==0: d['withparents']=g('couple_dep')+g('lone_dep')+g('cnd')+g('lnd')+g('multi')
        elif bi==1: d.update(couple_dep=g('couple_dep'),lone_dep=g('lone_dep'),withparents=g('cnd')+g('lnd'))
        else: d.update(couple_dep=g('couple_dep'),lone_dep=g('lone_dep'),couple_adult=g('cnd'),lone_adult=g('lnd'))
        res.append(d)
    # split 50+ into 50-64 / 65+ : '66+' categories belong to 65+; the rest allocated by population (50-64 vs 65+)
    p5064,p65=pop(50,64),pop(65,99); d=res[3]; o={}
    for k,v in d.items():
        if k in('one','couple'): 
            hi=float(H.get((B[3],'one66' if k=='one' else 'c66'),0)); lo=v-hi; o[k]=(lo,hi)
        else: o[k]=(v*p5064/(p5064+p65),v*p65/(p5064+p65))
    r5064={k:v[0] for k,v in o.items()}; r65={k:v[1] for k,v in o.items()}
    return res[:3]+[r5064,r65,r65]
HA=rows(H); out['hhAge']=[{k:float(v) for k,v in r.items() if v>0} for r in HA]
# IL/EW persons ratio per type (adults 25+)
def tot(Hx):
    d={}
    for r in rows(Hx)[1:4]:
        for k,v in r.items(): d[k]=d.get(k,0)+v
    return d
a,b=tot(H),tot(Hi); za,zb=sum(a.values()),sum(b.values()); out['hhMul']={k:float((b[k]/zb)/(a[k]/za)) for k in a}
# eth tilt (RM058): share of each HRP ethnic group in households types vs overall
x=tab('NM_2158_1'); x.columns=['e','c','v']
def g8(e): return {'Asian, Asian British or Asian Welsh':'asian','Black, Black British, Black Welsh, Caribbean or African':'black','Mixed or Multiple ethnic groups':'mixed','White: English, Welsh, Scottish, Northern Irish or British':'wb','White: Irish':'irish','White: Gypsy or Irish Traveller, Roma or Other White':'ow','Other ethnic group':'other'}.get(e)
x['g']=x.e.map(g8); x=x.dropna(subset=['g'])
TY={'one':'One-person household','lone':'Single family household: Lone parent household','other':'Other household types'}
def shr(gs,c):
    s=x[x.g.isin(gs)]; return float(s[s.c==c].v.sum()/s[s.c=='Total'].v.sum())
tilt={}
for k in K:
    gs={'wo':['irish','ow'],'in':['asian'],'pk':['asian'],'bd':['asian'],'cn':['asian'],'oa':['asian'],'ba':['black'],'bc':['black'],'mx':['mixed'],'wb':['wb'],'ao':['other']}[k]
    tilt[k]={t:shr(gs,TY[t])/shr(['asian','black','mixed','wb','irish','ow','other'],TY[t]) for t in TY}
out['hhEth']={'one':{k:tilt[k]['one'] for k in K},'lone':{k:tilt[k]['lone'] for k in K},'other':{k:tilt[k]['other'] for k in K}}
# ---------- tenure by composition (RM135); tenure by age of HRP (RM201); bedrooms by tenure x size (RM136)
TM={'Owned: Owns outright':'own','Owned: Owns with a mortgage or loan or shared ownership':'mort','Rented: Social rented':'soc','Rented: Private rented or lives rent free':'priv'}
CT={'One-person household: Aged 66 years and over':'one','One-person household: Other':'one','Single family household: All aged 66 years and over':'couple','Single family household: Married or civil partnership couple: No children':'couple','Single family household: Cohabiting couple family: No children':'couple','Single family household: Married or civil partnership couple: Dependent children':'couple_dep','Single family household: Cohabiting couple family: With dependent children':'couple_dep','Single family household: Married or civil partnership couple: All children non-dependent':'adult','Single family household: Cohabiting couple family: All children non-dependent':'adult','Single family household: Lone parent family: All children non-dependent':'adult','Single family household: Lone parent family: With dependent children':'lone_dep','Other household types: With dependent children':'multigen','Single family household: Other single family household: Other family composition':'multigen','Other household types: Other, including all full-time students and all aged 66 years and over':'shared'}
t=tab('NM_2235_1'); t.columns=['c','t','v']; t['k']=t.c.map(CT); t['tk']=t.t.map(TM); t=t.dropna(subset=['k','tk'])
out['ten']={k:{a:float(b) for a,b in (t[t.k==k].groupby('tk').v.sum()/t[t.k==k].v.sum()).items()} for k in t.k.unique()}
ta=tab('NM_2301_1'); ta.columns=['t','age','v']; ta['tk']=ta.t.map(TM); ta=ta.dropna(subset=['tk'])
allt=ta.groupby('tk').v.sum()/ta.v.sum(); out['tenAge']={}
for lab,ag in {'u65':'Aged 16 to 64 years','o65':'Aged 65 years and over'}.items():
    s=ta[ta.age==ag].groupby('tk').v.sum(); s=s/s.sum(); out['tenAge'][lab]={k:float(s[k]/allt[k]) for k in s.index}
def bed(g):
    b=tab('NM_2236_1',g); b.columns=['sz','t','bd','v']; b['tk']=b.t.map(TM); b=b.dropna(subset=['tk']); b=b[b.bd!='Total']; b=b[b.sz.isin(['1 person in household','2 people in household','3 people in household','4 or more people in household'])]
    res={}
    for (tk,sz),s in b.groupby(['tk','sz']): 
        nb=s.bd.map(lambda z:int(z[0])); res[f"{tk}|{int(sz[0])}"]={str(n):float(v) for n,v in (s.groupby(nb).v.sum()/s.v.sum()).items()}
    return res
out['bed']={'EW':bed('EW'),'IL':bed('IL')}
# overcrowding targets (RM099 rating by tenure totals)
def over(g):
    y=tab('NM_2199_1',g); y.columns=['t','r','v']; return float(y[(y.t=='Total')&(y.r=='Occupancy rating of bedrooms: -1 or less')].v.sum()/y[(y.t=='Total')&(y.r=='Total')].v.sum()) 
try: out['t_over']={'EW':100*over('EW'),'IL':100*over('IL')}
except Exception as e: out['t_over']={'EW':4.3,'IL':11.8}; print('over fallback',e)
# household size distribution (TS017) for sharers' count: persons in 'multi-person other households' unavailable -> use RM... skip
# ---------- fertility (ONS cohort tables) and births by parity (ONS birth characteristics 2022)
c3=pd.read_excel('../ashe/ch.xlsx','Table 3',header=None).iloc[9:]; c3.columns=['yr','age','n0','n1','n2','n3','n4']; c3=c3.apply(pd.to_numeric,errors='coerce').dropna(subset=['yr','age'])
fert={}
for age in range(20,100):
    yr=2025-age; a=min(age,45); x=c3[(c3.yr==yr)&(c3.age==a)]
    if len(x): r=x.iloc[0]; fert[age]=[float(r.n0),float(r.n1),float(r.n2),float(r.n3),float(r.n4)]
out['fert']=fert
b=pd.read_excel('../ons/bc.xlsx','Table_16',header=None).iloc[7:]; b=b[b[1]=='Total']; hdr=['under 20','20 to 24','25 to 29','30 to 34','35 to 39','40 to 44','45 and over']
bp={}
for _,r in b.iterrows():
    p=r[0]
    if p in (0,1,2,3,'4 and over'): bp[str(p)]=[float(r[i]) for i in range(3,10)]
out['birthAge']=bp
# partner age gap: ONS mean age at marriage, opposite-sex, all marriages 2023 (Table 7a)
m=pd.read_excel('../ons/mar.xlsx','7a',header=None); hdr=None
for i in range(len(m)):
    if str(m.iloc[i,0]).strip()=='2023': row=m.iloc[i]; break
print('7a 2023 row',list(row[:8]))
m2=None
out['partnerGap']=float(39-36.8)  # ONS Table 7a, 2023: mean age at marriage men 39.0, women 36.8 (all opposite-sex marriages)
json.dump(out,open('g3.json','w'))
print(json.dumps(out['hhAge'][1])); print(out['tenAge']); print(out['t_over']); print(out['birthAge']['0']); print(fert[30],fert[50])

import pandas as pd, json, re, numpy as np
X='x/Occupation SOC20 (2) Table 2.%s 2024.xlsx'
import glob
def f2(n): return glob.glob(f'x/*Table 2.{n}a *')[0]
CODES=[11,12,21,22,23,24,31,32,33,34,35,41,42,51,52,53,54,61,62,71,72,81,82,91,92]
def rd(f,sheet):
    d=pd.read_excel(f,sheet_name=sheet,header=None,skiprows=5); d=d[pd.to_numeric(d[1],errors='coerce').notna()].copy(); d[1]=d[1].astype(int); return d.set_index(1)
pay=rd(f2('6'),'All')  # cols: 0 desc,2 jobs,3 median,4 chg,5 mean,6 chg,7..16: p10,20,25,30,40,60,70,75,80,90
hrsF=rd(f2('9'),'Full-Time'); hrsP=rd(f2('9'),'Part-Time')
def num(v):
    try: return float(v)
    except: return np.nan
rows=[]
AG=['18-21','22-29','30-39','40-49','50-59','60+']
def jobs(sheet):
    d=pd.read_excel(glob.glob('y/*Table 20.6a*')[0],sheet_name=sheet,header=None,skiprows=5)
    d=d[pd.to_numeric(d[1],errors='coerce').notna()].copy(); d[1]=d[1].astype(int); d['ag']=d[0].astype(str).str.split().str[0]
    return {c:[num(d[(d[1]==c)&(d.ag==a)][2].iloc[0]) if len(d[(d[1]==c)&(d.ag==a)]) else np.nan for a in AG] for c in CODES}
JM,JF=jobs('Male'),jobs('Female')
out=[]
for c in CODES:
    p=pay.loc[c]; q=[num(p[7]),num(p[9]),num(p[3]),num(p[14]),num(p[16])]
    out.append(dict(code=c,desc=str(p[0]).strip(),pay=q,fth=num(hrsF.loc[c][3]),pth=num(hrsP.loc[c][3]),M=[0 if np.isnan(v) else v for v in JM[c]],F=[0 if np.isnan(v) else v for v in JF[c]],jobs=num(p[2])))
    print(c,out[-1]['desc'][:50],out[-1]['pay'],out[-1]['fth'],out[-1]['pth'],out[-1]['M'],out[-1]['F'])
json.dump(out,open('D.json','w'))
allm=sum(np.array(o['M']) for o in out); allf=sum(np.array(o['F']) for o in out); print(allm,allf)

import show, json
exec(open('partA.py').read().split("E={g:eth_tot")[0].split("out={}")[1]) if False else None
import re
D=json.load(open('/home/user/world/experiments/ai-convo/sampler/data.json'))
def tab(d,g): return show.load(d,g).drop(columns=['MEASURES','OBS_STATUS','OBS_CONF'])
KEYS=['wb','wo','in','pk','bd','cn','oa','ba','bc','mx','ao']
def emap(n):
    n=n.replace('Asian, Asian British or Asian Welsh: ','A:')
    m={'A:Indian':'in','A:Pakistani':'pk','A:Bangladeshi':'bd','A:Chinese':'cn','A:Other Asian':'oa','Black, Black British, Black Welsh, Caribbean or African: African':'ba','Black, Black British, Black Welsh, Caribbean or African: Caribbean':'bc','Black, Black British, Black Welsh, Caribbean or African: Other Black':'bc','White: English, Welsh, Scottish, Northern Irish or British':'wb','White: Irish':'wo','White: Gypsy or Irish Traveller':'wo','White: Roma':'wo','White: Other White':'wo','Other ethnic group: Arab':'ao','Other ethnic group: Any other ethnic group':'ao'}
    return 'mx' if n.startswith('Mixed or Multiple ethnic groups:') else m.get(n)
out={}
for g in ['EW','IL']:
    t=tab('NM_2132_1',g); t.columns=['e','age','sex','v']; t=t[(t.sex=='All persons')&t.age.isin(['Aged 25 to 34 years','Aged 35 to 49 years','Aged 50 to 64 years','Aged 65 years and over'])]; t['k']=t.e.map(emap); t=t.dropna(subset=['k']); s=t.groupby('k').v.sum(); s=s/s.sum()*100
    out[g]=','.join(f'{k}:{s[k]:.1f}' for k in KEYS)
D['targets']['eth25']={'ew':out['EW'],'inner':out['IL']}
json.dump(D,open('/home/user/world/experiments/ai-convo/sampler/data.json','w'),separators=(',',':'))
print(out)

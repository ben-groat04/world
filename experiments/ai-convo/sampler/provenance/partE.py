import json, re, numpy as np, pandas as pd, show
D=json.load(open('/home/user/world/experiments/ai-convo/sampler/data.json'))
A=json.load(open('A.json')); B=json.load(open('B.json')); C=json.load(open('C.json')); O=json.load(open('../ashe/D.json'))
def tab(d,g): return show.load(d,g).drop(columns=['MEASURES','OBS_STATUS','OBS_CONF'])
# profile age multipliers: IL age-share / EW age-share
def shares(g):
    t=tab('NM_2029_1',g); t.columns=['sex','age','v']; t=t[(t.sex=='All persons')&t.age.str.match(r'^Aged (\d+) years?$')]; t['a']=t.age.str.extract(r'(\d+)').astype(int); return t
e,i=shares('EW'),shares('IL'); edges=[0,15,20,25,30,35,40,50,60,65,75,120]; pa=[]
for lo,hi in zip(edges,edges[1:]):
    se=e[(e.a>=lo)&(e.a<hi)].v.sum()/e.v.sum(); si=i[(i.a>=lo)&(i.a<hi)].v.sum()/i.v.sum(); pa.append([lo,round(si/se,2)])
D['prof']['age']=pa
D['prof']['eth']=A['prof_eth']; D['prof']['ten']=C['prof_ten']; D['prof']['hh']=B['prof_hh']; D['prof']['over']=C['prof_over']
D['pop']=A['pop']; D['eth']=A['eth']; D['ukBorn']=C['ukBorn']; D['rel']=C['rel']
D['act']=B['act']; D['health']=B['health']; D['rs']=B['rs']; D['marr']=B['marr']; D['hhAge']=B['hhAge']
D['ten']=C['ten']; D['bedType']=C['bedType']; D['bedTen']=C['bedTen']; D.pop('bed',None)
D['edu']=C['edu']; D['eduMul']=C['eduMul']
cf=C['childless_F']; D['childless']={'F':cf,'M':[min(.99,round(v+d,2)) for v,d in zip(cf,[0.05,0.10,0.12,0.10,0.08,0.08])]}
D['nkids']=C['nkids']
# occupation table
pat={11:'office',12:'retail:3,office:1',21:'office',22:'shift12',23:'school',24:'office',31:'office',32:'shift12',33:'security:2,shift12:1',34:'flex',35:'office',41:'office',42:'office',51:'trades',52:'trades',53:'trades',54:'factory:2,hosp:1',61:'care',62:'retail',71:'retail',72:'office',81:'factory',82:'driver',91:'trades:2,factory:1',92:'hosp:3,factory:3,retail:2,security:1'}
title={11:'Corporate managers & directors',12:'Other managers & proprietors (incl. cafe and shop owners)',21:'Science, research, engineering & technology professionals',22:'Health professionals (doctors, nurses, therapists)',23:'Teaching & other educational professionals',24:'Business, media & public-service professionals',31:'Science, engineering & technology associate professionals',32:'Health & social-care associate professionals',33:'Protective service occupations',34:'Culture, media & sports occupations',35:'Business & public-service associate professionals',41:'Administrative occupations',42:'Secretarial & related occupations',51:'Skilled agricultural & related trades',52:'Skilled metal, electrical & electronic trades',53:'Skilled construction & building trades',54:'Textiles, printing & other skilled trades (incl. chefs and cooks)',61:'Caring personal service occupations',62:'Leisure, travel & related personal service occupations',71:'Sales occupations',72:'Customer service occupations',81:'Process, plant & machine operatives',82:'Transport & mobile machine drivers and operatives',91:'Elementary trades & related occupations',92:'Elementary administration & service (cleaners, kitchen assistants, servers, security guards, etc.)'}
deg={21:1,22:2,23:2,24:1}; deg.update({c:-1 for c in (51,52,53,54,61,62,71,81,82,91,92)})
se={11:1.2,12:3,21:.5,22:.3,23:.3,24:.9,31:.5,32:.4,33:.05,34:4,35:1,41:.3,42:.4,51:3,52:2.5,53:5,54:1.5,61:.4,62:4,71:.2,72:.3,81:.3,82:2,91:1.5,92:.8}
er={11:"Private-sector company|Large corporate group|Public-sector body",12:"Small private business|Retail or hospitality chain",21:"Engineering consultancy|Manufacturer|University or research institute|Public body",22:"NHS trust|GP practice|Private hospital or care provider",23:"State school|Independent school|College or university",24:"Accountancy or law firm|Bank or insurer|Local authority or civil service|Media company",31:"Manufacturer|Technology company|Utilities or public body",32:"NHS trust|Private care provider|Local authority",33:"Police or fire service|Security firm|Local authority",34:"Creative agency|Media company|Sports or leisure venue",35:"Private company|Estate agency or finance firm|Local authority",41:"Private company|Local authority|NHS or school",42:"Private company|Local authority|NHS or school",51:"Farm or estate|Landscaping firm",52:"Garage or workshop|Manufacturer|Utilities",53:"Building contractor|Small builder",54:"Restaurant|Printer or manufacturer|Cafe or caterer",61:"Private care provider|Local authority|NHS or nursery",62:"Salon or gym|Travel or leisure company",71:"Supermarket|High-street retailer|Independent shop",72:"Call centre|Retail or utilities company|Private company",81:"Factory|Food-processing plant|Manufacturing firm",82:"Haulage or courier firm|Bus or rail operator|Delivery platform",91:"Warehouse or logistics firm|Construction firm|Local authority",92:"Cleaning contractor|Cafe or restaurant|Warehouse or logistics firm|Security firm"}
rows=[]
for o in O:
    c=o['code']; q=o['pay']; 
    if q[0]!=q[0]: q[0]=11.44
    rows.append([c,title[c],pat[c],[max(v,1) for v in o['M']],[max(v,1) for v in o['F']],deg.get(c,0),se[c],*[round(x,2) for x in q],o['fth'],o['pth'],er[c]])
D['cols']=["code (SOC 2020 2-digit)","title","shift patterns (weights)","employee jobs by age band 18-21,22-29,30-39,40-49,50-59,60+ - men (ASHE T20, thousand)","same - women","degree (1 usual, 2 required, -1 low-qual; ASSUMPTION)","self-employment propensity (ASSUMPTION)","p10","p25","median","p75","p90 (ASHE 2024 T2.6a hourly excl overtime, GBP)","FT median paid hours (T2.9a)","PT median paid hours (T2.9a)","employers"]
D['O']=rows
D['sj']="71:4,92:5,72:1.5,41:0.5,61:0.3,62:0.5"
D['contract']="permanent:89,fixed term:5.5,zero hours:3.5,agency:2"
D.pop('ptHours',None)
for p in D['pat'].values(): p.pop('fth',None)
T=D['targets']; T['age']={'ew':'18-24:%.1f,25-34:%.1f,35-49:%.1f,50-64:%.1f,65+:%.1f'%tuple(A['t_age']['EW'].values()),'inner':'18-24:%.1f,25-34:%.1f,35-49:%.1f,50-64:%.1f,65+:%.1f'%tuple(A['t_age']['IL'].values())}
T['eth']={'ew':','.join(f'{k}:{v}' for k,v in A['t_eth']['EW'].items()),'inner':','.join(f'{k}:{v}' for k,v in A['t_eth']['IL'].items())}
T['act']={'ew':B['t_act']}; T['ten']={'ew':C['t_ten']['EW'],'inner':C['t_ten']['IL']}; T['overcrowded']={'ew':C['t_over']['EW'],'inner':C['t_over']['IL']}
T['edu']=C['t_edu']; T['ng_health']=B['t_ng']
T['_note']="Real Census 2021 / ASHE 2024 figures pulled via Nomis API and ONS downloads (see sources, provenance/). age = % adults 18+; eth = % all residents; act = % of 16+ (retired/other inactive 'other' folded into ho); ten = % households; 'inner' = 14 Inner London boroughs aggregate (E09000001,07,12,13,14,19,20,22,23,25,28,30,32,33)."
json.dump(D,open('/home/user/world/experiments/ai-convo/sampler/data.json','w'),indent=None,separators=(',',':'))
print('ok',len(rows))

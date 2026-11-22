# Part 6: ONS Families & Households 2025 (same-sex couples, lone mothers, children per family), Census 2021 mixed partnerships, ONS baby names
import pandas as pd, json
O='../ons/'
D=json.load(open('/home/user/world/experiments/ai-convo/sampler/data.json'))
# --- same-sex couples among couples with no dependent children (ONS F&H 2025 Tables 1 and 9; LFS thousands)
ss=162+101; os_=6002+1853        # same-sex cohabiting (no/non-dep children) + same-sex married (no children); opposite-sex married + cohabiting (no children)
D['ssNoKids']=ss/(ss+os_)
# --- lone parent sex (Table 1): mothers' share of lone-parent families
D['loneMother']={'dep':1695/1946,'adult':1000/1240}
# --- ethnically mixed partnerships (Census 2021 TS023 households where groups differ within partnerships / couple-family households TS003)
D['pMixedPartner']=1424981/(7516491+2864627)
# --- dependent children per family (Table 3), test target
D['t_kids']={'couple':{'1':2091+616+0,'2':2348+487,'3+':759+165},'lone':{'1':1081,'2':601,'3+':264}}
# --- ONS baby names: top 100 per sex at 10-yearly intervals 1904-2024 (ranks only; no counts published in this table)
x=pd.ExcelFile(O+'hn.xlsx'); baby={}
for sx,s in (('F','Table_1'),('M','Table_2')):
    d=pd.read_excel(x,s,header=None); h=d.iloc[3]; body=d.iloc[4:104]
    baby[sx]={str(int(h[c])):[str(v).strip() for v in body[c].tolist()] for c in range(1,d.shape[1]) if str(h[c]).replace('.0','').isdigit()}
D['baby']=baby
# surnames: no ONS source -> keep names.* surname lists as illustrative; record plainly
D['names']['ie']={'M':'Conor Sean Liam Kieran Patrick Cian','F':'Aoife Niamh Siobhan Orla Grainne Roisin','S':["Murphy","O'Brien","Kelly","Walsh","Byrne","Ryan"]}
D['names']['ee']={'M':'Piotr Jakub Marek Tomasz Andrei Mihai Dmitri Jan Stefan Mateusz','F':'Anna Katarzyna Agnieszka Magdalena Elena Ioana Ewa Natalia','S':["Kowalski","Nowak","Wisniewski","Popescu","Ionescu","Novak","Petrov","Horvath"]}
D['names']['eu']={'M':'Giovanni Marco Pedro Luis Pierre Lukas Hans Antonio','F':'Giulia Sofia Marta Ana Camille Lena Isabel Chiara','S':["Rossi","Russo","Garcia","Fernandez","Silva","Muller","Dubois","Lopez","Costa","Moreau"]}
D['sources']['S16']="ONS Families and Households in the UK 2025 (LFS) Tables 1, 3, 9: same-sex couples (ssNoKids), lone mothers (loneMother), dependent children per family (t_kids); Nomis NM_2042_1 TS023 + NM_2023_1 TS003: mixed-ethnic partnerships (pMixedPartner); ONS 'Top 100 baby names in England and Wales 1904 to 2024' Tables 1-2 (baby)"
D['unspecified']=[u for u in D['unspecified'] if not u.startswith(('Lone fathers','Same-sex couples','Names:'))]
D['unspecified']+=[
 "Surnames: no sourced frequency data (ONS publishes none; Census records no names). Illustrative lists, equal weights. Whether partners share a surname, and whether children take the father's, is not sourced -> design rule: partners keep their own surnames, children take the father's.",
 "First names for ethnic groups other than White British (and UK-born White Other/Mixed, which use the ONS lists): ONS baby names are not published by ethnicity -> illustrative lists, equal weights; White Other born abroad draw from small origin-specific lists by birth region.",
 "ONS baby names are top-100 ranks at 10-yearly intervals (no counts), so first names are drawn with equal weight from the nearest listed year's top 100.",
 "Same-sex couples: share is sourced only for couples with no dependent children (ONS F&H 2025: 263k same-sex of 8,118k); civil-partner couples cannot be split by sex. Same-sex couples with children (8k cohabiting, 18k married) are not generated. Partner age gap for same-sex couples is unspecified -> partner drawn in the same 5-year age band.",
 "Which ethnic group a partner belongs to in a mixed partnership: only the overall mixed-partnership share (13.7% of couple households, includes multi-family households) is sourced; the partner's group is drawn from the Census mix excluding the focal person's. Children of ethnically different partners are recorded as Mixed (design rule).",
 "Lone-father families: share sourced (ONS F&H 2025). Their children's ages use the ONS births-by-mother tables with a notional mother aged (father's age - 2.2); no father-specific birth-age table was found.",
 "Economic activity by household type (e.g. home carers among unrelated sharers): no source found (ONS custom dataset tool refused API access; Working and workless households / LFS household tables do not cross activity with unrelated-adult households). Sharers are therefore NOT given home-carer status; their activity is the age x sex Census mix with that category removed and the remainder renormalised."]
D['unspecified']=[u for u in D['unspecified'] if not u.startswith('Economic activity by household type (e.g. home carers among unrelated sharers): no published')]
D['design']=[d for d in D['design'] if not d.startswith("Partners and children share")]+["Dependent children take the mother's religion. Children of ethnically different partners are Mixed."]
json.dump(D,open('/home/user/world/experiments/ai-convo/sampler/data.json','w'),separators=(',',':'))
print(D['ssNoKids'],D['loneMother'],D['pMixedPartner'],list(D['baby']['F'].keys())[:3],D['baby']['M']['1994'][:5],D['baby']['F']['2024'][:5])

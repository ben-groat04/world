# Fits prof.eth (inner-city multipliers) so that adults 25+ reproduce the Inner London RM032 ethnic mix. Run after partE/partF; see data.json prof._eth_note.
import json, numpy as np
D=json.load(open('../data.json')); K=['wb','wo','in','pk','bd','cn','oa','ba','bc','mx','ao']
rows=np.array([[float(x.split(':')[1]) for x in r.split(',')] for r in D['eth']]); tgt=np.array([float(x.split(':')[1]) for x in D['targets']['eth25']['inner'].split(',')]); tgt/=tgt.sum()
step=lambda t,x: [v for f,v in t if x>=f][-1]; eb=lambda a: 0 if a<25 else 1 if a<35 else 2 if a<50 else 3 if a<65 else 4
w=np.zeros(5)
for lo,hi,m,f in D['pop']:
    if lo>=25: w[eb(lo)]+=(m+f)*step(D['prof']['age'],(lo+hi)/2)
w/=w.sum(); m=np.array([D['prof']['eth'][k] for k in K])
for _ in range(200): p=rows*m; p/=p.sum(1,keepdims=True); cur=(w[:,None]*p).sum(0); cur/=cur.sum(); m*=tgt/cur
D['prof']['eth']={k:round(float(v),2) for k,v in zip(K,m)}; json.dump(D,open('../data.json','w'),separators=(',',':'))

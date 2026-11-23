// quick metrics over list files: node m.mjs list...
import fs from 'node:fs';
const rows=d=>fs.readFileSync(d+'/log.jsonl','utf8').split('\n').filter(Boolean).map(l=>JSON.parse(l));
let T={chats:0,n:0,cap:0,capmsg:0,bracket:0,md:0,days:0,silent:0,night:0,bed:0,notes:0,aware:0,asks:0};const gaps=[];
for(const lf of process.argv.slice(2)) for(const l of fs.readFileSync(lf,'utf8').split('\n').filter(Boolean)){const [lab,d]=l.split(' ');const r=rows(d),c=r.find(x=>x.cast);T.chats++;
 const ms=r.filter(x=>x.posted===true&&x.text&&!x.oracle);T.n+=ms.length;
 const hd=r[0]; const people=c.names; const cp=people.filter(n=>c.cast[n].capitals).length; T.cap+=cp>0?1:0;
 let cw=[],lw=[];for(const m of ms){const w=m.text.split(/\s+/).length;(/^\p{Lu}/u.test(m.text)?cw:lw).push(w);if(/^\p{Lu}/u.test(m.text))T.capmsg++;if(/\[[^\]]*\]/.test(m.text))T.bracket++;if(/\b(group chat|this chat|in a chat|typing|doing the thing)\b/i.test(m.text))T.aware++;}
 if(cw.length&&lw.length)gaps.push(cw.reduce((a,b)=>a+b,0)/cw.length-lw.reduce((a,b)=>a+b,0)/lw.length);
 T.notes+=r.filter(x=>x.note).length; T.asks+=r.filter(x=>x.oracle).length;
 for(const x of r.filter(x=>x.oracle)){ if(/[*#|]|\n-/.test(x.text))T.md++; }
 // days: group by date of 04:00 shift
 const byDay={};for(const m of ms){const t=new Date(m.at+':00Z');t.setUTCHours(t.getUTCHours()-4);const k=t.toISOString().slice(0,10);(byDay[k]??=[]).push(m)}
 const keys=Object.keys(byDay).sort();const first=new Date(ms[0].at+':00Z');const lastK=Object.keys(byDay).sort().at(-1);
 const s=new Date(keys[0]+'T00:00:00Z'),e=new Date(keys.at(-1)+'T00:00:00Z');for(let t=+s;t<=+e;t+=864e5){const k=new Date(t).toISOString().slice(0,10);T.days++;const d=byDay[k];if(!d)T.silent++;else if(/\b(night|bed|sleep|bedtime|sleeping)\b/i.test(d.slice(-2).map(x=>x.text).join(' ')))T.bed++;}
 T.night+=ms.filter(m=>/\b(night|bed|sleep)/i.test(m.text)).length;
}
console.log(T,'capshare',(T.capmsg/T.n).toFixed(2),'chats with caps people',T.cap,'/',T.chats,'gap',gaps.map(x=>x.toFixed(1)).join(','),'night%',(T.night/T.n*100).toFixed(1),'bedend%',(T.bed/(T.days-T.silent)*100).toFixed(0));

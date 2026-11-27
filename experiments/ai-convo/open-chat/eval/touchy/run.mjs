// Runs the touchy-topics battery: node eval/touchy/run.mjs [--seeds 3] [--only T01,T05]
// Writes briefs in --gen shape (brief = situation) and runs writer.mjs --gen: once without and once with --oracle (the Claude-agent briefs).
// Each chat is labelled <id>-t<tier>-s<seed>. Run folders are listed in eval/touchy/runs.txt (one "<label> <dir>" per line).
import fs from 'node:fs'; import path from 'node:path'; import { spawn } from 'node:child_process';
const here = import.meta.dirname, root = path.join(here, '..', '..');
const a = process.argv.slice(2), opt = (k, d) => { const i = a.indexOf('--' + k); return i < 0 ? d : a[i + 1]; };
const ARM = opt('arm', ''), TIERS = opt('tiers', '1,2,3').split(',').map(Number), SEEDS = +opt('seeds', 3), only = opt('only', '')?.split(',').filter(Boolean);
const briefs = JSON.parse(fs.readFileSync(path.join(here, 'briefs.json'), 'utf8')).filter(b => !only.length || only.includes(b.id));
const SEEDS_HI = +opt('seeds-hi', 2); // tiers 2 and 3 run fewer seeds to bound cost
const gen = o => briefs.filter(b => !!b.oracle === o).flatMap(b => b.tiers.flatMap((topic, t) => !TIERS.includes(t + 1) ? [] : Array.from({ length: t ? SEEDS_HI : SEEDS }, (_, s) => ({ label: `${b.id}-t${t + 1}${ARM ? 'n' : ''}-s${s + 1}`, people: b.people, brief: b.situation, topic, secrets: b.secrets, days: b.days }))));
const go = (o, delay) => new Promise(res => setTimeout(() => {
  const items = gen(o); if (!items.length) return res([]);
  const f = path.join(here, (o ? 'gen-oracle-' : 'gen-plain-') + TIERS.join('') + ARM + '.json'); fs.writeFileSync(f, JSON.stringify(items, null, 1));
  const p = spawn('node', [ARM ? path.join(here, 'writer-nosteer.mjs') : path.join(root, 'writer.mjs'), '--gen', f, '--model', 'haiku', '--conc', o ? '2' : '8', ...(o ? ['--oracle'] : [])], { stdio: ['ignore', 'pipe', 'pipe'] });
  let out = ''; p.stdout.on('data', d => { out += d; process.stdout.write(d); }); p.stderr.on('data', d => { out += d; process.stderr.write(d); });
  p.on('close', () => { fs.writeFileSync(path.join(here, (o ? 'gen-oracle-' : 'gen-plain-') + TIERS.join('') + ARM + '.log'), out); const m = out.match(/list: (\S+)/); res(m ? fs.readFileSync(m[1], 'utf8').split('\n').filter(Boolean) : []); });
}, delay));
const [p, o] = await Promise.all([go(false, 0), go(true, 1500)]);
const lines = [...p, ...o].sort(); fs.writeFileSync(path.join(here, 'runs-' + TIERS.join('') + ARM + '.txt'), lines.join('\n') + '\n'); console.log(`${lines.length} chats listed in runs.txt`);

// Exports a run in progress for the viewer's live view: `node viewer/live.mjs <runId> <outDir>`.
// Writes <outDir>/run.json (meta plus status) and one <outDir>/turn-<i>.json per turn not exported before (state in <outDir>/sent.txt),
// then prints the new turn files. Claude writes them to the artifact's database (live_runs/<runId>, live_turns/<runId>-<i>).
import fs from 'fs'; import path from 'path'; import { execFileSync } from 'child_process';
const [id, out] = process.argv.slice(2), here = import.meta.dirname;
execFileSync('node', [path.join(here, 'build.mjs')]);
const run = JSON.parse(fs.readFileSync(path.join(here, 'runs.json'), 'utf8')).find(r => r.id === id);
if (!run) throw new Error(`run ${id} not in runs.json`);
fs.mkdirSync(out, { recursive: true });
const done = process.argv[4] === 'done', sentFile = path.join(out, 'sent.txt');
const sent = fs.existsSync(sentFile) ? +fs.readFileSync(sentFile, 'utf8') : 0;
const { turns, ...meta } = run;
fs.writeFileSync(path.join(out, 'run.json'), JSON.stringify({ ...meta, status: done ? 'done' : 'running' }));
const files = [];
turns.forEach((t, i) => {
  if (i < sent) return;
  const f = path.join(out, `turn-${String(i).padStart(4, '0')}.json`);
  fs.writeFileSync(f, JSON.stringify({ run: id, i, ...t }));
  files.push(f);
});
fs.writeFileSync(sentFile, String(turns.length));
console.log(files.join('\n'));

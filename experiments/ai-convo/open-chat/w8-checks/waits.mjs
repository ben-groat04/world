// node w8-checks/waits.mjs <export dir> [speed]   For a --live run: turns released <5 story minutes apart whose real gap exceeds the story gap / speed by more than 2 s (the writer was behind the clock), the longest such excess, and the run status.
import fs from 'node:fs'; import path from 'node:path';
const dir = process.argv[2], speed = +(process.argv[3] ?? 60), T = t => +new Date(t + ':00Z');
const turns = fs.readdirSync(dir).filter(f => /^turn-\d+\.json$/.test(f)).sort().map(f => ({ ...JSON.parse(fs.readFileSync(path.join(dir, f), 'utf8')), real: fs.statSync(path.join(dir, f)).mtimeMs })).filter(t => !t.clock);
let n = 0, late = 0, worst = 0, longest = 0;
for (let i = 1; i < turns.length; i++) { const story = (T(turns[i].at) - T(turns[i - 1].at)) / 6e4, real = (turns[i].real - turns[i - 1].real) / 1e3; if (story < 5) { n++; const excess = real - story * 60 / speed; if (excess > 2) late++; worst = Math.max(worst, excess); longest = Math.max(longest, real); } }
console.log(`${turns.length} turns, ${n} gaps under 5 story minutes: ${late} released more than 2 s late, worst excess ${worst.toFixed(1)} s, longest real gap ${longest.toFixed(1)} s; run.json status ${JSON.parse(fs.readFileSync(path.join(dir, 'run.json'), 'utf8')).status}`);

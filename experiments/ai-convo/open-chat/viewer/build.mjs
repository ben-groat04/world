// Reads every runs/<timestamp>/log.jsonl and writes viewer/runs.json (newest first) for index.html.
import fs from 'fs'; import path from 'path';
const here = import.meta.dirname, runsDir = path.join(here, '..', 'runs');
const arg = (argv, flag) => argv[argv.indexOf(flag) + 1];
const MARK = ' Something that\'s been on your mind: ', SECRET = ' Only you know this: ';
const split = (s, mark) => { const i = s.indexOf(mark); return i < 0 ? [s, null] : [s.slice(0, i), s.slice(i + mark.length)]; };
// Only runs made with run.mjs's current default brief; earlier test runs stay in runs/ but not in the viewer.
const BRIEF = fs.readFileSync(path.join(here, '..', 'run.mjs'), 'utf8').match(/const BRIEF = process\.argv\[3\] \|\| '([^']*)'/)[1];
const runs = [];
for (const id of fs.readdirSync(runsDir).sort().reverse()) {
  const file = path.join(runsDir, id, 'log.jsonl');
  if (!fs.existsSync(file)) continue;
  const rows = fs.readFileSync(file, 'utf8').split('\n').filter(Boolean).map(l => JSON.parse(l));
  if (!rows.length) continue;
  const m = id.match(/^(\d{4}-\d\d-\d\d)T(\d\d)-(\d\d)-(\d\d)-(\d{3})Z$/);
  const started = m ? `${m[1]}T${m[2]}:${m[3]}:${m[4]}.${m[5]}Z` : null;
  const byWho = w => rows.find(r => r.who === w)?.argv;
  const names = [...new Set(rows.map(r => r.who))], secrets = {};
  const brief = w => { const [b, sec] = split(arg(byWho(w) || rows[0].argv, '--system-prompt'), SECRET); if (sec) secrets[w] = sec; return b; };
  const [, topic] = split(brief(names[0]), MARK);
  const briefB = brief(names[1]); names.slice(2).forEach(brief);
  if (briefB !== BRIEF) continue;
  const last = rows.at(-1).round, lastRows = rows.filter(r => r.round === last);
  runs.push({
    id, started, model: arg(rows[0].argv, '--model'), brief: briefB,
    names, topic, secrets: Object.keys(secrets).length ? secrets : null,
    rounds: last,
    ended: lastRows.length === 4 && lastRows.every(r => r.pass) ? 'everyone passed' : 'round limit',
    turns: rows.map(r => ({ round: r.round, who: r.who, text: r.text, pass: !!r.pass })),
  });
}
const out = JSON.stringify(runs);
fs.writeFileSync(path.join(here, 'runs.json'), out);
console.log(`${runs.length} runs, ${(out.length / 1024).toFixed(0)} KB -> viewer/runs.json`);
for (const r of runs) console.log(`${r.id}  ${r.model.padEnd(7)} ${String(r.turns.filter(t => !t.pass).length).padStart(3)} msgs  ${r.rounds}r  ${r.ended}  ${r.topic ? r.topic.slice(0, 40) : 'open'}`);

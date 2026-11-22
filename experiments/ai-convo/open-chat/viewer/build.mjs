// Reads every runs/<timestamp>/log.jsonl and writes viewer/runs.json (newest first) for index.html.
import fs from 'fs'; import path from 'path';
const here = import.meta.dirname, runsDir = path.join(here, '..', 'runs');
const arg = (argv, flag) => argv[argv.indexOf(flag) + 1];
const MARK = ' Something that\'s been on your mind: ', SECRET = ' Only you know this: ';
const split = (s, mark) => { const i = s.indexOf(mark); return i < 0 ? [s, null] : [s.slice(0, i), s.slice(i + mark.length)]; };
const SINCE = '2026-11-22T16-37'; // earlier runs were tests: kept in runs/, left out of the viewer
const ORACLE_LINE = ' There is also an oracle that can look things up online: start a line with @oracle and your question.';
const runs = [];
for (const id of fs.readdirSync(runsDir).sort().reverse()) {
  const file = path.join(runsDir, id, 'log.jsonl');
  if (!fs.existsSync(file)) continue;
  const all = fs.readFileSync(file, 'utf8').split('\n').filter(Boolean).map(l => JSON.parse(l)).filter(r => !r.error); // oracle failures are logged but not shown
  const rows = all.filter(r => !r.oracle && !r.clock); // agent turns; Oracle and Clock rows stay in turns only
  if (!rows.length) continue;
  const m = id.match(/^(\d{4}-\d\d-\d\d)T(\d\d)-(\d\d)-(\d\d)-(\d{3})Z$/);
  const started = m ? `${m[1]}T${m[2]}:${m[3]}:${m[4]}.${m[5]}Z` : null;
  const byWho = w => rows.find(r => r.who === w)?.argv;
  const names = [...new Set(rows.map(r => r.who))], secrets = {};
  const brief = w => { const [b, sec] = split(arg(byWho(w) || rows[0].argv, '--system-prompt'), SECRET); if (sec) secrets[w] = sec; return b.replace(ORACLE_LINE, ''); };
  const oracle = arg(rows[0].argv, '--system-prompt').includes(ORACLE_LINE);
  const [, topic] = split(brief(names[0]), MARK);
  const briefB = brief(names[1]); names.slice(2).forEach(brief);
  if (id < SINCE) continue;
  // New runs (rows carry `step`, no rounds): turns are the posted messages, clock notes and oracle answers; unsent replies and passes are only counted.
  const isNew = rows[0].step != null, lastRows = rows.filter(r => r.round === rows.at(-1).round);
  runs.push({
    id, started, model: arg(rows[0].argv, '--model'), brief: briefB,
    names, people: names.length, oracle, topic, secrets: Object.keys(secrets).length ? secrets : null,
    ...(isNew ? { passes: rows.filter(r => r.pass).length, unsent: rows.filter(r => r.posted === false && !r.pass).length } : { rounds: rows.at(-1).round }),
    ended: isNew ? (all.filter(r => r.step === all.at(-1).step && !r.clock).every(r => r.pass) ? 'everyone passed' : 'message limit') : !all.at(-1).clock && lastRows.length === names.length && lastRows.every(r => r.pass) ? 'everyone passed' : 'round limit',
    turns: all.filter(r => r.posted !== false).map(r => ({ ...(r.round != null && { round: r.round }), who: r.who, text: r.text, pass: !!r.pass, ...(r.oracle && { oracle: true }), ...(r.clock && { clock: true }), ...(r.at && { at: r.at }) })),
  });
}
const out = JSON.stringify(runs);
fs.writeFileSync(path.join(here, 'runs.json'), out);
console.log(`${runs.length} runs, ${(out.length / 1024).toFixed(0)} KB -> viewer/runs.json`);
for (const r of runs) console.log(`${r.id}  ${r.model.padEnd(7)} ${String(r.turns.filter(t => !t.pass).length).padStart(3)} msgs  ${r.rounds != null ? r.rounds + 'r' : 'new'}  ${r.ended}  ${r.topic ? r.topic.slice(0, 40) : 'open'}`);

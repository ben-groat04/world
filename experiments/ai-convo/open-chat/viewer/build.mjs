// Reads every runs/<timestamp>/log.jsonl, and every writer-runs/<timestamp>/live/log.jsonl (single-writer runs started from the viewer: `writer.mjs --live`), and writes viewer/runs.json (newest first) for index.html.
import fs from 'fs'; import path from 'path';
const here = import.meta.dirname, runsDir = path.join(here, '..', 'runs');
const arg = (argv, flag) => argv[argv.indexOf(flag) + 1];
const MARK = / Something (?:that's been|on your) (?:on your )?mind(?: \(put it your own way, not in these words\))?: /, STYLE = / How you text: .*$/s, SECRET = / Only you know this(?:, at least at first)?: /;
const split = (s, mark) => { const m = typeof mark === 'string' ? (s.includes(mark) ? { index: s.indexOf(mark), 0: mark } : null) : s.match(mark); return m ? [s.slice(0, m.index), s.slice(m.index + m[0].length)] : [s, null]; };
const SINCE = '2026-11-23T07-12'; // earlier runs were tests: kept in runs/ and writer-runs/, left out of the viewer
const ORACLE_LINES = [' There is also an oracle that can look things up online: start a line with @oracle and your question.', // runs before 2026-11-22 18:00
  ' You can also ask Claude, an AI assistant that can search the web and read pages: start a line with @claude and your question. Claude sees only your question, not this chat, and remembers what you asked it before. Its answer is shared here.', // until the answer went to the asker alone
  ' You can also ask Claude, an AI assistant that can search the web and read pages: start a line with @claude and your question. Claude sees only your question, not this chat, and remembers what you asked it before. Its answer comes back to you alone.'];
const PRIVATE = / What's going on with you at the moment: .*?(?: Today: .*?)?(?= Something that's been on your mind: | Something on your mind \(| Only you know this|$)/s; // EXP_PRIVATE line, per person: kept out of the shared brief
const PERSON = /^(?:You are [^.(]+?(?: \([^)]*\))?|You write [A-Z][a-z]+'s messages in this chat)\. /u; // runs from 2026-11-22 evening put the name first in the system prompt, per person (EXP_FICTION: "You write <Name>'s messages"); the cast runs add "(age, gender, role)"
const FICTION = / [A-Z][a-z]+'s life outside the chat is yours to decide: .*? and how things went\./; // EXP_FICTION sentence, per person
const dayLabel = at => { const d = new Date(at); return `(It's now ${['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'][d.getDay()]} ${d.getDate()} ${['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'][d.getMonth()]}.)`; };
const runs = [];
for (const id of fs.readdirSync(runsDir).sort().reverse()) {
  const file = path.join(runsDir, id, 'log.jsonl');
  if (!fs.existsSync(file)) continue;
  const every = fs.readFileSync(file, 'utf8').split('\n').filter(Boolean).map(l => JSON.parse(l)), endRow = every.find(r => r.end);
  const all = every.filter(r => !r.error && !r.end && !r.private_lines && !r.config_dir); // oracle failures are logged but not shown; the end row only sets `ended`; the private_lines and config_dir rows are meta
  const rows = all.filter(r => !r.oracle && !r.clock); // agent turns; Oracle and Clock rows stay in turns only
  if (!rows.length) continue;
  const m = id.match(/^(\d{4}-\d\d-\d\d)T(\d\d)-(\d\d)-(\d\d)-(\d{3})Z$/);
  const started = m ? `${m[1]}T${m[2]}:${m[3]}:${m[4]}.${m[5]}Z` : null;
  const byWho = w => rows.find(r => r.who === w && r.argv)?.argv; // later messages of one reply carry no argv
  const names = [...new Set(rows.map(r => r.who))], secrets = {};
  const brief = w => { const [b, sec] = split(arg(byWho(w) || rows[0].argv, '--system-prompt').replace(STYLE, ''), SECRET); if (sec) secrets[w] = sec; return ORACLE_LINES.reduce((s, l) => s.replace(l, ''), b.replace(PERSON, '').replace(FICTION, '').replace(PRIVATE, '')); };
  const oracle = ORACLE_LINES.some(l => arg(byWho(names[0]), '--system-prompt').includes(l));
  const cast = every.find(r => r.cast), [, topic0] = split(brief(names[0]), MARK), topic = cast ? cast.topic : topic0; // cast runs log the topic: it is only in the opener's first turn
  const briefB = brief(names[1]); names.slice(2).forEach(brief);
  if (id < SINCE) continue;
  // Three log formats: events (rows carry `checkin`: one row per posted message or PASS, in time order, plus an end row), steps (`step`: clock rows, unsent replies) and rounds (`round`). Turns are the posted messages and oracle answers (plus clock rows, or a day marker where an events run enters a new day); passes and unsent replies are only counted.
  const events = rows[0].checkin != null, isNew = events || rows[0].step != null, lastRows = rows.filter(r => r.round === rows.at(-1).round);
  const turns = all.filter(r => r.posted !== false || r.private).flatMap((r, i, a) => [...(events && r.at && (i ? a[i - 1].at.slice(0, 10) !== r.at.slice(0, 10) : false) ? [{ who: 'Clock', text: dayLabel(r.at), pass: false, clock: true, at: r.at }] : []), { ...(r.round != null && { round: r.round }), who: r.private ? `Claude \u2192 ${r.to} (private)` : r.who, text: r.text, pass: !!r.pass, ...(r.oracle && { oracle: true }), ...(r.clock && { clock: true }), ...(r.at && { at: r.at }) }]);
  const msgs = turns.filter(t => !t.clock); // EXP_REACT rows (react, to = index among the posted messages) become turn.reactions, not turns
  for (const r of all.filter(r => r.react)) (msgs[r.to].reactions ??= []).push({ who: r.who, emoji: r.react });
  runs.push({
    id, started, model: arg(rows[0].argv, '--model'), brief: briefB,
    names, people: names.length, oracle, topic, secrets: Object.keys(secrets).length ? secrets : null, ...(every.find(r => r.private_lines)?.private_lines && { privateLines: every.find(r => r.private_lines).private_lines }),
    ...(isNew ? { passes: rows.filter(r => r.pass).length, unsent: rows.filter(r => r.posted === false && !r.pass && !r.react && !r.failed).length } : { rounds: rows.at(-1).round }),
    ended: events ? (endRow?.end === 'date' ? 'end date' : 'message limit') : isNew ? (all.filter(r => r.step === all.at(-1).step && !r.clock).every(r => r.pass) ? 'everyone passed' : 'message limit') : !all.at(-1).clock && lastRows.length === names.length && lastRows.every(r => r.pass) ? 'everyone passed' : 'round limit',
    turns,
  });
}
// Single-writer live runs (writer.mjs --live): the log has a header row with `live: true`, the cast row, one row per message (oracle rows are @claude answers) and reactions as rows with `to` = index among the non-oracle messages.
const writerDir = path.join(here, '..', 'writer-runs');
for (const id of fs.existsSync(writerDir) ? fs.readdirSync(writerDir).sort().reverse() : []) {
  const file = path.join(writerDir, id, 'live', 'log.jsonl'); if (id < SINCE || !fs.existsSync(file)) continue;
  const every = fs.readFileSync(file, 'utf8').split('\n').filter(Boolean).map(l => JSON.parse(l)), head = every[0], cast = every.find(r => r.cast);
  if (!head.live || !cast) continue;
  const posted = every.filter(r => r.posted === true && r.text), people = posted.filter(r => !r.oracle), m = id.match(/^(\d{4}-\d\d-\d\d)T(\d\d)-(\d\d)-(\d\d)-(\d{3})Z$/), secrets = every.find(r => r.secrets)?.secrets;
  const turns = posted.flatMap((r, i, a) => [...(i && a[i - 1].at.slice(0, 10) !== r.at.slice(0, 10) ? [{ who: 'Clock', text: dayLabel(r.at + ':00'), pass: false, clock: true, at: r.at }] : []), { who: r.who, text: r.text, pass: false, ...(r.oracle && { oracle: true }), at: r.at }]);
  const msgs = turns.filter(t => !t.clock && !t.oracle); for (const r of every.filter(r => r.react)) (msgs[r.to].reactions ??= []).push({ who: r.who, emoji: r.react });
  runs.push({ id: `${id}-live`, started: m ? `${m[1]}T${m[2]}:${m[3]}:${m[4]}.${m[5]}Z` : null, model: head.model, brief: cast.setting, names: cast.names, people: cast.names.length, oracle: !!head.oracle, topic: cast.topic, secrets: secrets ?? null, privateLines: cast.private_lines, passes: 0, unsent: 0, ended: head.complete ? 'end date' : 'message limit', turns });
}
runs.sort((a, b) => (b.started || '').localeCompare(a.started || ''));
const out = JSON.stringify(runs);
fs.writeFileSync(path.join(here, 'runs.json'), out);
console.log(`${runs.length} runs, ${(out.length / 1024).toFixed(0)} KB -> viewer/runs.json`);
for (const r of runs) console.log(`${r.id}  ${r.model.padEnd(7)} ${String(r.turns.filter(t => !t.pass).length).padStart(3)} msgs  ${r.rounds != null ? r.rounds + 'r' : 'new'}  ${r.ended}  ${r.topic ? r.topic.slice(0, 40) : 'open'}`);

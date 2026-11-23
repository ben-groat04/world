// eval-prep.mjs: prepare blind, length-matched chat windows for judging, and tally the judges' scores.
// Prep:   node eval-prep.mjs <list file> <out dir> [real-text files...]
//   list file: one run per line, "<label> <run folder>" (label like BASE-T21: arm, scenario, one seed digit).
//   Per run, from log.jsonl: posted messages (posted:true with text) and reactions (react/to; `to` indexes the posted
//   messages). Oracle rows (private), private_lines, config, PASS/failed rows and the end row are never used, so the
//   windows hold nothing but chat. Windows are all exactly W = 25 posted messages and never overlap:
//     A = the run's first W messages (needs >= W);
//     B = the run's last W messages (needs >= 2W, so that B starts after A ends; otherwise skipped for that run).
//   Runs that die early are not padded or squeezed into shorter windows: <out>/runs.tsv records, per run, its message count
//   and status (dead = 0 messages, short = 1..W-1, A-only = W..2W-1, full = >= 2W), and --tally prints them separately.
//   A reaction is counted if its target is in the window and it was logged between the window's first and last message.
//   Anchors: any further arguments are files of real chat text (same "--- Sun 19:41, ..." block format; a header may have no
//   name). The first W blocks of each are mixed in blind as window "real", label REAL-<file name>, and tallied as arm REAL.
//   Output, in transcript.txt format ("--- Sun 19:41, Name", text, blank line); a message's reactions are a count under it, "(👍 2, 😂 1)", as a phone screen shows them (not timestamped "X reacted" lines):
//     <out>/A/<id>.txt, <out>/B/<id>.txt, <out>/real/<id>.txt   id = random 6 hex chars, no label in the name or text
//     <out>/key.tsv                        id, label, window, message count
//     <out>/runs.tsv                       label, messages, status
//     <out>/judge-note.txt                 the plain fact to tell every judge: a window is an excerpt from a longer chat
//     <out>/judges/j1..jN/<id>.txt         each file goes to 3 distinct judges (about 8 files per judge, N >= 6 so that
//                                          the A and B windows of one run never share a judge)
// Judging: each judge scores every file in its folder 0-10; collect all judgements as scores.tsv, lines "id<TAB>score"
//   (one per judgement, so each id appears 3 times). The join with key.tsv is by id.
// Tally:  node eval-prep.mjs --tally <out dir> <scores.tsv>
//   prints n and mean score per arm (label prefix before '-') by window, by scenario (label after '-' minus the trailing
//   seed digit; REAL is one scenario, "anchor"), and overall; n counts judgements. Then the runs per arm by status.
import fs from 'node:fs'; import path from 'node:path'; import { randomBytes } from 'node:crypto';
const W = 25, PER_JUDGE = 8, COPIES = 3; // design parameters: window length, files per judge, judges per file
const shuffle = a => { for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; };
const stamp = at => `${['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'][new Date(at + ':00Z').getUTCDay()]} ${at.slice(11, 16)}`;
const hm = at => at.slice(11, 16);

if (process.argv[2] === '--tally') {
  const [, , , out, scores] = process.argv, key = {};
  for (const l of fs.readFileSync(path.join(out, 'key.tsv'), 'utf8').trim().split('\n').slice(1)) { const [id, label, win] = l.split('\t'); key[id] = { label, win }; }
  const groups = {};
  for (const l of fs.readFileSync(scores, 'utf8').trim().split('\n')) {
    const [id, s] = l.split('\t'), k = key[id], v = parseFloat(s); if (!k || isNaN(v)) { console.error('skipped:', l); continue; }
    const [arm, scen] = k.label.split('-'), sc = arm === 'REAL' ? 'anchor' : scen.replace(/\d$/, '');
    for (const g of [`window ${k.win}\t${arm}`, `scenario ${sc}\t${arm}`, `overall\t${arm}`]) (groups[g] ??= []).push(v);
  }
  const runs = {};
  for (const l of fs.readFileSync(path.join(out, 'runs.tsv'), 'utf8').trim().split('\n').slice(1)) { const [label, , status] = l.split('\t'), arm = label.split('-')[0]; ((runs[arm] ??= {})[status] ??= []).push(label); }
  console.log('group\tarm\tn\tmean');
  for (const g of Object.keys(groups).sort()) { const v = groups[g]; console.log(`${g}\t${v.length}\t${(v.reduce((a, b) => a + b, 0) / v.length).toFixed(2)}`); }
  console.log('\nruns by status (dead = 0 messages, short = fewer than one window, A-only = no second window, full = both)\narm\tdead\tshort\tA-only\tfull\tdead and short runs');
  for (const arm of Object.keys(runs).sort()) { const r = runs[arm], c = k => (r[k] ?? []).length; console.log([arm, c('dead'), c('short'), c('A-only'), c('full'), [...(r.dead ?? []), ...(r.short ?? [])].join(' ')].join('\t')); }
} else {
  const [, , list, out, ...anchors] = process.argv, files = [], runStatus = ['label\tmessages\tstatus'];
  for (const line of fs.readFileSync(list, 'utf8').split('\n').filter(l => l.trim())) {
    const [label, dir] = line.trim().split(/\s+/);
    const rows = fs.readFileSync(path.join(dir, 'log.jsonl'), 'utf8').split('\n').filter(Boolean).map(l => JSON.parse(l));
    const msgs = []; // posted messages in order: {row index, who, text, at}
    rows.forEach((r, i) => { if (r.posted === true && !r.private && typeof r.text === 'string') msgs.push({ i, ...r }); });
    const n = msgs.length, status = n === 0 ? 'dead' : n < W ? 'short' : n < 2 * W ? 'A-only' : 'full';
    runStatus.push([label, n, status].join('\t'));
    for (const [win, start] of [['A', 0], ['B', n - W]]) {
      if (n < (win === 'A' ? W : 2 * W)) continue;
      const m = msgs.slice(start, start + W), idx = new Set(m.map(x => msgs.indexOf(x))), lo = m[0].i, hi = m.at(-1).i, out_ = [], counts = {}; // counts: window message index -> {emoji: n}
      for (let i = lo; i <= hi; i++) { const r = rows[i]; if (r.react && idx.has(r.to) && msgs[r.to]) { const c = counts[r.to] ??= {}; c[r.react] = (c[r.react] ?? 0) + 1; } }
      for (let i = lo; i <= hi; i++) {
        const r = rows[i];
        if (r.posted === true && !r.private && typeof r.text === 'string') { const c = counts[msgs.findIndex(x => x.i === i)]; out_.push(`--- ${stamp(r.at)}, ${r.who}\n${r.text.trim()}${c ? `\n(${Object.entries(c).map(([e, k]) => `${e} ${k}`).join(', ')})` : ''}\n`); } // reactions as a count under the message, as a phone screen (and the agents) show them
      }
      files.push({ label, win, n: m.length, text: out_.join('\n') });
    }
  }
  for (const f of anchors) { const blocks = fs.readFileSync(f, 'utf8').trim().split(/^(?=--- )/m).filter(Boolean).slice(0, W); files.push({ label: 'REAL-' + path.basename(f, path.extname(f)).replace(/-/g, '_'), win: 'real', n: blocks.length, text: blocks.map(x => x.trim() + '\n').join('\n') }); }
  const ids = new Set(); for (const f of files) { do f.id = randomBytes(3).toString('hex'); while (ids.has(f.id)); ids.add(f.id); }
  for (const f of files) { fs.mkdirSync(path.join(out, f.win), { recursive: true }); fs.writeFileSync(path.join(out, f.win, f.id + '.txt'), f.text); }
  fs.mkdirSync(out, { recursive: true });
  fs.writeFileSync(path.join(out, 'runs.tsv'), runStatus.join('\n') + '\n');
  fs.writeFileSync(path.join(out, 'key.tsv'), 'id\tlabel\twindow\tmessages\n' + files.map(f => [f.id, f.label, f.win, f.n].join('\t')).join('\n') + '\n');
  // Judge split: each file to COPIES distinct judges, least-loaded first, never a judge who already has a window of the same run.
  const N = Math.max(2 * COPIES, Math.ceil(files.length * COPIES / PER_JUDGE)), load = Array(N).fill(0), used = {};
  for (const f of shuffle([...files])) {
    const taken = used[f.label] ??= new Set();
    const pick = shuffle([...load.keys()]).filter(j => !taken.has(j)).sort((a, b) => load[a] - load[b]).slice(0, COPIES);
    for (const j of pick) { taken.add(j); load[j]++; const d = path.join(out, 'judges', 'j' + (j + 1)); fs.mkdirSync(d, { recursive: true }); fs.writeFileSync(path.join(d, f.id + '.txt'), f.text); }
  }
  fs.writeFileSync(path.join(out, 'judge-note.txt'), 'Each file is an excerpt from a longer chat: it may start or end in the middle of a conversation. A line like "(\u{1F44D} 2)" under a message shows the reactions that message got.\n'); // give this to every judge with the usual neutral "score 0-10, explain" ask
  console.log(`${files.length} files, ${N} judges, loads ${load.join(',')}`);
}

// eval-prep.mjs: prepare blind, length-matched chat windows for judging, and tally the judges' scores.
// Prep:   node eval-prep.mjs <list file> <out dir>
//   list file: one run per line, "<label> <run folder>" (label like BASE-T21: arm, scenario, one seed digit).
//   Per run, from log.jsonl: posted messages (posted:true with text) and reactions (react/to; `to` indexes the posted
//   messages). Oracle rows (private), private_lines, config, PASS/failed rows and the end row are never used, so the
//   windows hold nothing but chat. Windows (skipped if too short, never padded):
//     A = first 25 posted messages (run skipped for A if it has < 8);
//     B = 25 posted messages from the first message of the run's last in-story calendar day with >= 8 messages.
//   A reaction is included if its target is in the window and it was logged between the window's first and last message.
//   Output, in transcript.txt format ("--- Sun 19:41, Name", text, blank line; "--- Sun 20:01, Sam reacted 👍 to Tom's 19:50 message"):
//     <out>/A/<id>.txt, <out>/B/<id>.txt   id = random 6 hex chars, no label in the name or text
//     <out>/key.tsv                        id, label, window, message count
//     <out>/judges/j1..jN/<id>.txt         each file goes to 3 distinct judges (about 8 files per judge, N >= 6 so that
//                                          the A and B windows of one run never share a judge)
// Judging: each judge scores every file in its folder 0-10; collect all judgements as scores.tsv, lines "id<TAB>score"
//   (one per judgement, so each id appears 3 times). The join with key.tsv is by id.
// Tally:  node eval-prep.mjs --tally <out dir> <scores.tsv>
//   prints n and mean score per arm (label prefix before '-') by window, by scenario (label after '-' minus the trailing
//   seed digit), and overall; n counts judgements.
import fs from 'node:fs'; import path from 'node:path'; import { randomBytes } from 'node:crypto';
const W = 25, MIN_A = 8, MIN_DAY = 8, PER_JUDGE = 8, COPIES = 3;
const shuffle = a => { for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; };
const stamp = at => `${['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'][new Date(at + ':00Z').getUTCDay()]} ${at.slice(11, 16)}`;
const hm = at => at.slice(11, 16);

if (process.argv[2] === '--tally') {
  const [, , , out, scores] = process.argv, key = {};
  for (const l of fs.readFileSync(path.join(out, 'key.tsv'), 'utf8').trim().split('\n').slice(1)) { const [id, label, win] = l.split('\t'); key[id] = { label, win }; }
  const groups = {};
  for (const l of fs.readFileSync(scores, 'utf8').trim().split('\n')) {
    const [id, s] = l.split('\t'), k = key[id], v = parseFloat(s); if (!k || isNaN(v)) { console.error('skipped:', l); continue; }
    const [arm, scen] = k.label.split('-'), sc = scen.replace(/\d$/, '');
    for (const g of [`window ${k.win}\t${arm}`, `scenario ${sc}\t${arm}`, `overall\t${arm}`]) (groups[g] ??= []).push(v);
  }
  console.log('group\tarm\tn\tmean');
  for (const g of Object.keys(groups).sort()) { const v = groups[g]; console.log(`${g}\t${v.length}\t${(v.reduce((a, b) => a + b, 0) / v.length).toFixed(2)}`); }
} else {
  const [, , list, out] = process.argv, files = [];
  for (const line of fs.readFileSync(list, 'utf8').split('\n').filter(l => l.trim())) {
    const [label, dir] = line.trim().split(/\s+/);
    const rows = fs.readFileSync(path.join(dir, 'log.jsonl'), 'utf8').split('\n').filter(Boolean).map(l => JSON.parse(l));
    const msgs = []; // posted messages in order: {row index, who, text, at}
    rows.forEach((r, i) => { if (r.posted === true && !r.private && typeof r.text === 'string') msgs.push({ i, ...r }); });
    const starts = { A: msgs.length >= MIN_A ? 0 : -1, B: -1 };
    const days = {}; msgs.forEach((m, k) => (days[m.at.slice(0, 10)] ??= []).push(k));
    const day = Object.keys(days).sort().filter(d => days[d].length >= MIN_DAY).pop();
    if (day) starts.B = days[day][0];
    for (const win of ['A', 'B']) {
      if (starts[win] < 0) continue;
      const m = msgs.slice(starts[win], starts[win] + W), idx = new Set(m.map(x => msgs.indexOf(x))), lo = m[0].i, hi = m.at(-1).i, out_ = [];
      for (let i = lo; i <= hi; i++) {
        const r = rows[i];
        if (r.posted === true && !r.private && typeof r.text === 'string') out_.push(`--- ${stamp(r.at)}, ${r.who}\n${r.text.trim()}\n`);
        else if (r.react && idx.has(r.to) && msgs[r.to]) out_.push(`--- ${stamp(r.at)}, ${r.who} reacted ${r.react} to ${msgs[r.to].who}'s ${hm(msgs[r.to].at)} message\n`);
      }
      files.push({ label, win, n: m.length, text: out_.join('\n') });
    }
  }
  const ids = new Set(); for (const f of files) { do f.id = randomBytes(3).toString('hex'); while (ids.has(f.id)); ids.add(f.id); }
  for (const f of files) { fs.mkdirSync(path.join(out, f.win), { recursive: true }); fs.writeFileSync(path.join(out, f.win, f.id + '.txt'), f.text); }
  fs.writeFileSync(path.join(out, 'key.tsv'), 'id\tlabel\twindow\tmessages\n' + files.map(f => [f.id, f.label, f.win, f.n].join('\t')).join('\n') + '\n');
  // Judge split: each file to COPIES distinct judges, least-loaded first, never a judge who already has a window of the same run.
  const N = Math.max(2 * COPIES, Math.ceil(files.length * COPIES / PER_JUDGE)), load = Array(N).fill(0), used = {};
  for (const f of shuffle([...files])) {
    const taken = used[f.label] ??= new Set();
    const pick = shuffle([...load.keys()]).filter(j => !taken.has(j)).sort((a, b) => load[a] - load[b]).slice(0, COPIES);
    for (const j of pick) { taken.add(j); load[j]++; const d = path.join(out, 'judges', 'j' + (j + 1)); fs.mkdirSync(d, { recursive: true }); fs.writeFileSync(path.join(d, f.id + '.txt'), f.text); }
  }
  console.log(`${files.length} files, ${N} judges, loads ${load.join(',')}`);
}

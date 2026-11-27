// eval-prep.mjs: prepare blind, length-matched chat windows for judging, and tally the judges' scores.
// Prep:   node eval-prep.mjs <list file> <out dir> [real-text files...]
//   list file: one run per line, "<label> <run folder>" (label like BASE-T21: arm, scenario, one seed digit).
//   Per run, from log.jsonl: posted messages (posted:true with text) and reactions (react/to; `to` indexes the posted
//   messages). Oracle rows (private), private_lines, config, PASS/failed rows and the end row are never used, so the
//   windows hold nothing but chat. Windows are cut by in-story time, not by message count (round 19: a count window
//   skipped every run that stopped talking, and the runs that died were the ones that most needed judging):
//     A = the run's first SPAN_H = 36 in-story hours (from its first message), at most MAX_W = 40 messages;
//     B = the next SPAN_H hours (36-72 h after the first message), at most MAX_W messages. The two never overlap.
//   A window is judged when it holds at least MIN_W = 8 messages. <out>/runs.tsv records, per run, its message count,
//   the counts of A and B and a status (dead = 0 messages, short = 1..MIN_W-1 in A, A-only = A judged but not B, full =
//   both judged); --tally prints those separately, with the share of runs judged, so short and dead runs are reported
//   next to the mean instead of dropping out of it.
//   A reaction is counted if its target is in the window and it was logged between the window's first and last message.
//   Anchors: any further arguments are files of real chat text (same "--- Sun 19:41, ..." block format; a header may have no
//   name). The first MAX_W blocks of each are mixed in blind as window "real", label REAL-<file name>, and tallied as arm REAL.
//   Output, in transcript.txt format ("--- Sun 19:41, Name", text, blank line); a message's reactions are a count under it, "(👍 2, 😂 1)", as a phone screen shows them (not timestamped "X reacted" lines):
//     <out>/A/<id>.txt, <out>/B/<id>.txt, <out>/real/<id>.txt   id = random 6 hex chars, no label in the name or text
//     <out>/key.tsv                        id, label, window, message count
//     <out>/runs.tsv                       label, messages, messages in A, messages in B, status
//     <out>/judge-note.txt                 the plain fact to tell every judge: a window is an excerpt from a longer chat
//     <out>/judges/j1..jN/<id>.txt         each file goes to 3 distinct judges (about 8 files per judge, N >= 6 so that
//                                          the A and B windows of one run never share a judge)
// Judging: each judge scores every file in its folder 0-10 (the neutral "score 0-10, explain" ask, first); collect all judgements as scores.tsv, lines "id<TAB>score" or
//   "id<TAB>score<TAB>p_real" (one per judgement, so each id appears 3 times). The join with key.tsv is by id. p_real is the detection question (judge.mjs asks it every time), asked
//   after the score: "how likely, 0-100, is it that this is real people texting?" (judge.mjs asks it itself, every time); the tally then prints its mean per group
//   next to the score, so "AI windows score like real windows" can be read as a detection rate too, not only a score.
// Tally:  node eval-prep.mjs --tally <out dir> <scores.tsv>   (an optional <out dir>/classes.json {scenario: class} adds a "class" group, plain and judge-centred)
//   prints n and mean score per arm (label prefix before '-') by window, by scenario (label after '-' minus the trailing
//   seed digit; REAL is one scenario, "anchor"), and overall; n counts judgements. Then the runs per arm by status.
import fs from 'node:fs'; import path from 'node:path'; import { randomBytes } from 'node:crypto';
const SPAN_H = 36, MAX_W = 40, MIN_W = 8, PER_JUDGE = 8, COPIES = +process.env.COPIES || 3; // (COPIES=2 env: 2 judges per file) design parameters: window span (in-story hours), most messages in a window, fewest for a window to be judged, files per judge, judges per file
const shuffle = a => { for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; };
const stamp = at => `${['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'][new Date(at + ':00Z').getUTCDay()]} ${at.slice(11, 16)}`;
const hm = at => at.slice(11, 16), ms = at => Date.parse(at + ':00Z');

if (process.argv[2] === '--tally') {
  const [, , , out, scores] = process.argv, key = {};
  for (const l of fs.readFileSync(path.join(out, 'key.tsv'), 'utf8').trim().split('\n').slice(1)) { const [id, label, win] = l.split('\t'); key[id] = { label, win }; }
  const clsFile = path.join(out, 'classes.json'), cls = fs.existsSync(clsFile) ? JSON.parse(fs.readFileSync(clsFile, 'utf8')) : {}, clsOf = label => cls[label.split('-').slice(1).join('-').replace(/\d$/, '')]; // optional <out>/classes.json {scenario: class}: the tally also splits by brief class
  const groups = {}, real = {}; // real: the optional third column of scores.tsv, a judge's chance (0-100) that the chat is real people texting
  for (const l of fs.readFileSync(scores, 'utf8').trim().split('\n')) {
    const [id, s, pr] = l.split('\t'), k = key[id], v = parseFloat(s), p = parseFloat(pr); if (!k || isNaN(v)) { console.error('skipped:', l); continue; }
    const [arm, scen] = k.label.split('-'), sc = arm === 'REAL' ? 'anchor' : scen.replace(/\d$/, '');
    for (const g of [`window ${k.win}\t${arm}`, `scenario ${sc}\t${arm}`, ...(clsOf(k.label) ? [`class ${clsOf(k.label)}\t${arm}`] : []), `overall\t${arm}`]) { (groups[g] ??= []).push(v); if (!isNaN(p)) (real[g] ??= []).push(p); }
  }
  const runs = {}, mean = a => a.reduce((x, y) => x + y, 0) / a.length;
  for (const l of fs.readFileSync(path.join(out, 'runs.tsv'), 'utf8').trim().split('\n').slice(1)) { const c = l.split('\t'), arm = c[0].split('-')[0]; ((runs[arm] ??= {})[c.at(-1)] ??= []).push(c[0]); } // status is the last column (older runs.tsv had three)
  const anyReal = Object.keys(real).length > 0;
  console.log(`group\tarm\tn\tmean${anyReal ? '\tn_p_real\tmean_p_real' : ''}`);
  for (const g of Object.keys(groups).sort()) { const v = groups[g], r = real[g]; console.log(`${g}\t${v.length}\t${mean(v).toFixed(2)}${anyReal ? `\t${r?.length ?? 0}\t${r ? mean(r).toFixed(0) : '-'}` : ''}`); }
  // Judge-centred p_real (and score): each judge's mean over all the files they scored is taken off their own numbers, so a judge who is generous or harsh to everyone does not move an arm. The judge of a row comes from the SCORES block of <out>/judges/jN.md.
  const jdir = path.join(out, 'judges'), cen = {}, jrows = [];
  if (fs.existsSync(jdir)) for (const f of fs.readdirSync(jdir).filter(f => /^j\d+\.md$/.test(f))) { const rows = []; for (const l of fs.readFileSync(path.join(jdir, f), 'utf8').split(/^SCORES\s*$/m).at(-1).split('\n')) { const m = l.match(/^\W*([0-9a-f]{6})\W+(\d+(?:\.\d+)?)\W+(\d+(?:\.\d+)?)/); if (m && key[m[1]]) rows.push([m[1], +m[2], +m[3]]); } const ms_ = mean(rows.map(r => r[1])), mp = mean(rows.map(r => r[2])); for (const [id, v, p] of rows) jrows.push([id, v - ms_, p - mp]); }
  for (const [id, dv, dp] of jrows) { const [arm] = key[id].label.split('-'); for (const g of [`window ${key[id].win}\t${arm}`, ...(clsOf(key[id].label) ? [`class ${clsOf(key[id].label)}\t${arm}`] : []), `overall\t${arm}`]) ((cen[g] ??= { v: [], p: [] }).v.push(dv), cen[g].p.push(dp)); }
  if (jrows.length) { console.log('\njudge-centred (judge mean taken off)\ngroup\tarm\tn\tscore_centred\tp_real_centred'); for (const g of Object.keys(cen).sort()) { const x = cen[g], f = v => { const m = mean(v); return (m >= 0 ? '+' : '') + m.toFixed(2); }; console.log(`${g}\t${x.v.length}\t${f(x.v)}\t${f(x.p)}`); } }
  console.log('\nruns by status (dead = 0 messages, short = fewer than MIN_W in the first window, A-only = no judged second window, full = both)\narm\tdead\tshort\tA-only\tfull\tjudged share\tdead and short runs');
  for (const arm of Object.keys(runs).sort()) { const r = runs[arm], c = k => (r[k] ?? []).length, tot = c('dead') + c('short') + c('A-only') + c('full'); console.log([arm, c('dead'), c('short'), c('A-only'), c('full'), `${c('A-only') + c('full')}/${tot}`, [...(r.dead ?? []), ...(r.short ?? [])].join(' ')].join('\t')); }
} else {
  const [, , list, out, ...anchors] = process.argv, files = [], runStatus = ['label\tmessages\tmessages_A\tmessages_B\tstatus'];
  for (const line of fs.readFileSync(list, 'utf8').split('\n').filter(l => l.trim())) {
    const [label, dir] = line.trim().split(/\s+/);
    const rows = fs.readFileSync(path.join(dir, 'log.jsonl'), 'utf8').split('\n').filter(Boolean).map(l => JSON.parse(l));
    const msgs = []; // posted messages in order: {row index, who, text, at}
    rows.forEach((r, i) => { if (r.posted === true && !r.private && typeof r.text === 'string') msgs.push({ i, ...r }); });
    const n = msgs.length, t0 = n ? ms(msgs[0].at) : 0, cut = k => msgs.filter(m => ms(m.at) >= t0 + k * SPAN_H * 36e5 && ms(m.at) < t0 + (k + 1) * SPAN_H * 36e5).slice(0, MAX_W); // window k: the k-th span of SPAN_H hours from the first message
    const nA = cut(0).length, nB = cut(1).length, status = n === 0 ? 'dead' : nA < MIN_W ? 'short' : nB < MIN_W ? 'A-only' : 'full';
    runStatus.push([label, n, nA, nB, status].join('\t'));
    for (const [win, k] of [['A', 0], ['B', 1]]) {
      const m = cut(k); if (m.length < MIN_W) continue;
      const idx = new Set(m.map(x => msgs.indexOf(x))), lo = m[0].i, hi = m.at(-1).i, out_ = [], counts = {}; // counts: run message index -> {emoji: n}
      for (let i = lo; i <= hi; i++) { const r = rows[i]; if (r.react && idx.has(r.to) && msgs[r.to]) { const c = counts[r.to] ??= {}; c[r.react] = (c[r.react] ?? 0) + 1; } }
      for (let i = lo; i <= hi; i++) {
        const r = rows[i];
        if (r.posted === true && !r.private && typeof r.text === 'string') { const c = counts[msgs.findIndex(x => x.i === i)]; out_.push(`--- ${stamp(r.at)}, ${r.who}\n${r.text.trim()}${c ? `\n(${Object.entries(c).map(([e, k]) => `${e} ${k}`).join(', ')})` : ''}\n`); } // reactions as a count under the message, as a phone screen (and the agents) show them
      }
      files.push({ label, win, n: m.length, text: out_.join('\n') });
    }
  }
  for (const f of anchors) { const blocks = fs.readFileSync(f, 'utf8').trim().split(/^(?=--- )/m).filter(Boolean).slice(0, MAX_W); files.push({ label: 'REAL-' + path.basename(f, path.extname(f)).replace(/-/g, '_'), win: 'real', n: blocks.length, text: blocks.map(x => x.trim() + '\n').join('\n') }); }
  const ids = new Set(); for (const f of files) { do f.id = randomBytes(3).toString('hex'); while (ids.has(f.id)); ids.add(f.id); }
  for (const f of files) { fs.mkdirSync(path.join(out, f.win), { recursive: true }); fs.writeFileSync(path.join(out, f.win, f.id + '.txt'), f.text); }
  fs.mkdirSync(out, { recursive: true });
  fs.writeFileSync(path.join(out, 'runs.tsv'), runStatus.join('\n') + '\n');
  fs.writeFileSync(path.join(out, 'key.tsv'), 'id\tlabel\twindow\tmessages\n' + files.map(f => [f.id, f.label, f.win, f.n].join('\t')).join('\n') + '\n');
  // Judge split: each file to COPIES distinct judges, least-loaded first, never a judge who already has a window of the same run. PAIR=1: the key is the brief (label W7-R11 is brief R1, seed 1), so a judge never sees two windows of one brief across seeds and arms (a user sees one chat, and judges scored the repeats as "templated"); there are then at least COPIES x (most windows of one brief) judges, so every file can be placed.
  const briefOf = l => process.env.PAIR ? l.split('-').slice(1).join('-').match(/^[A-Za-z]+\d/)?.[0] ?? l : l, perBrief = {}; for (const f of files) perBrief[briefOf(f.label)] = (perBrief[briefOf(f.label)] ?? 0) + 1;
  const N = Math.max(2 * COPIES, Math.ceil(files.length * COPIES / PER_JUDGE), process.env.PAIR ? COPIES * Math.max(...Object.values(perBrief)) : 0), load = Array(N).fill(0), used = {};
  for (const f of shuffle([...files])) {
    const taken = used[briefOf(f.label)] ??= new Set();
    const pick = shuffle([...load.keys()]).filter(j => !taken.has(j)).sort((a, b) => load[a] - load[b]).slice(0, COPIES);
    for (const j of pick) { taken.add(j); load[j]++; const d = path.join(out, 'judges', 'j' + (j + 1)); fs.mkdirSync(d, { recursive: true }); fs.writeFileSync(path.join(d, f.id + '.txt'), f.text); }
  }
  fs.writeFileSync(path.join(out, 'judge-note.txt'), 'Each file is an excerpt from a longer chat: it may start or end in the middle of a conversation. A line like "(\u{1F44D} 2)" under a message shows the reactions that message got. A line like [photo: ...] stands for a photo, link or file sent in the chat.\n'); // give this to every judge with the usual neutral "score 0-10, explain" ask
  console.log(`${files.length} files, ${N} judges, loads ${load.join(',')}`);
}

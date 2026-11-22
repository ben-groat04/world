#!/usr/bin/env node
// Cheap checks of prompt changes against logged turns, without running a conversation.
//   node replay.mjs turns <run> [<run> ...] [--kind opener|look|notif|all] [--logged quiet|any] [--n 5] [--rows 3,7]
//       Re-issues the logged check-in turns (first row of each check-in: `user` and the brief in `argv`) with the CURRENT NOTE (prompts.mjs) and
//       the current system-prompt shape (no wants, no topic, no examples; an old run's style card is kept as the "How you text" line), N samples
//       each, then the current polish prompt on every reply. Kinds: opener (the first look of the person who opens: the cue is the logged one, or a
//       few words from the run's `opener` / the logged "want"), look (an unprompted look with a life-events block: the old "(You've opened the chat
//       to <reason>.)" line is dropped, nobody is told why to look), notif (a notification look). Default: opener and notif turns that were quiet
//       when logged (--logged any: notif turns whatever happened). Old reaction lines "(Tom reacted E to ...)" are turned into counts under the
//       message, as the current screen shows them. Prints per turn how often the agent posted (raw reply is not PASS/REACT), reacted, and still posts
//       after polish (not DROP), and the overall rates, the REACT rate and the emoji used. A notification turn where someone put a question to the
//       agent is flagged "asked".
//       Limits: stateful runs resumed a saved session at each check-in; a replay is a fresh call with the logged screen only (the last 6
//       messages and the new ones), so it tests the prompts, not the memory. The setting and life lines in the logged brief are the old ones.
//   node replay.mjs polish <run> [<run> ...] [--show 5]
//       Re-polishes each logged raw draft (rows with `raw`, the chat as it was, the person's description and examples, their last 4 posted messages)
//       with the CURRENT polish prompt. Counts tokens in the result that are not in the raw (words, emoji, slang), against the same count for the
//       polish that ran then; and per person (4+ posts) the share of posts carrying their most frequent habit marker (ending "...", "um"/"hmm",
//       a final emoji, a final "x", "!!", leading lowercase, an abbreviation) and the share naming someone (a participant's name or @), then and now.
//   node replay.mjs session <run> <person> <fromISO> [--n 5]
//       F3: copies <person>'s last saved CLI session of <run> (its config_dir must still exist), removes every PASS look from the copy
//       (the look's user turn and the PASS reply) and replays that person's later logged check-ins on the original and on the copy.
import fs from 'fs'; import crypto from 'crypto'; import os from 'os'; import path from 'path'; import { spawn } from 'child_process';
import { noteFor, topicCue, POLISH_SYS, polishAsk, isPass, lastLine, REACT_RE, added } from './prompts.mjs';
const args = process.argv.slice(2), mode = args.shift(), opt = (k, d) => { const i = args.indexOf('--' + k); if (i < 0) return d; const v = args[i + 1]; args.splice(i, 2); return v; };
const N = +opt('n', 5), KIND = opt('kind', 'all'), LOGGED = opt('logged', 'quiet'), ROWS = opt('rows', '')?.split(',').filter(Boolean).map(Number), SHOW = +opt('show', 5), CONC = +opt('conc', 8);
const cwd = fs.mkdtempSync(path.join(os.tmpdir(), 'open-chat-replay-')), cfg = fs.mkdtempSync(path.join(os.tmpdir(), 'open-chat-replay-'));
const env = Object.fromEntries(Object.entries(process.env).filter(([k]) => !k.startsWith('CLAUDE'))); Object.assign(env, { CLAUDE_CODE_DISABLE_ATTACHMENTS: '1', CLAUDE_CODE_MAX_OUTPUT_TOKENS: '4000', CLAUDE_CONFIG_DIR: cfg });
async function claude(argv, input, e = env, dir = cwd) {
  const proc = spawn('claude', argv, { cwd: dir, env: e, stdio: ['pipe', 'pipe', 'pipe'] }); let out = '', err = ''; proc.stdout.on('data', d => out += d); proc.stderr.on('data', d => err += d); proc.stdin.end(input);
  const code = await new Promise(res => { proc.on('error', () => res(-1)); proc.on('close', res); });
  const ev = out.split('\n').filter(Boolean).map(l => JSON.parse(l)), res = ev.find(x => x.type === 'result'); if (code !== 0 || !res || res.is_error) throw new Error(res?.result || err.trim() || `exit ${code}`);
  const blocks = ev.filter(x => x.type === 'assistant').flatMap(x => x.message.content);
  return blocks.filter(c => c.type === 'text').map(c => c.text.trim()).filter(Boolean).join('\n\n');
}
const pool = async (jobs, f) => { const out = []; let i = 0; await Promise.all(Array.from({ length: CONC }, async () => { while (i < jobs.length) { const k = i++; out[k] = await f(jobs[k], k).catch(e => ({ error: e.message })); } })); return out; };
const read = r => fs.readFileSync(path.join(r, 'log.jsonl'), 'utf8').split('\n').filter(Boolean).map(l => JSON.parse(l));
const sysOf = row => row.argv[row.argv.indexOf('--system-prompt') + 1], withSys = (argv, sys) => argv.map((a, i) => argv[i - 1] === '--system-prompt' ? sys : a);
// The person's way of texting and example texts: from the run's cast row, or (an older run, which had style cards) from the logged brief.
function styleOf(rows, row) {
  const c = rows.find(r => r.cast)?.cast[row.who]; if (c) return { how: c.texts, ex: c.ex };
  const b = sysOf(row), i = b.indexOf(' How you text: '), j = b.indexOf(" Some texts you've sent before"), k = b.indexOf(':', j), e = b.indexOf(' You put an emoji on a message', k);
  return { how: b.slice(i + 15, j).trim(), ex: b.slice(k + 1, e < 0 ? undefined : e).split(' / ').map(x => x.trim()).filter(Boolean) };
}
const WD = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'], stampIso = s => { const d = new Date(s); return `${WD[d.getDay()]} ${s.slice(11, 16)}`; };
// The logged brief in today's shape: no "want", no topic (the topic is only in the opener's cue), no example texts (the rewrite pass has them); the card of an older run stays as the "How you text" line.
const TOPIC_RE = /Something (?:that's been|on your) (?:on your )?mind(?: \([^)]*\))?: /;
function newSystem(row) {
  let b = sysOf(row);
  b = b.replace(/ What you want right now: .*?(?= Something (?:that's been|on your)| Only you know| How you text:)/s, '').replace(new RegExp(` ${TOPIC_RE.source}.*?(?= Only you know| How you text:)`, 's'), '');
  const j = b.indexOf(" Some texts you've sent before"); if (j >= 0) b = b.slice(0, j);
  return `${noteFor(true)} ${b}`;
}
// The opener's cue: the topic when the run had one, else the logged one, else the cast call's "opens with" line, else (older runs) asked of the model from the person's logged "want", in a few words starting with a verb.
const topicOf = brief => brief.match(new RegExp(`${TOPIC_RE.source}(.*?) (?:Only you know|How you text:)`))?.[1], wantOf = brief => brief.match(/What you want right now: (.*?)(?: Something (?:that's been|on your)| Only you know| How you text:)/)?.[1];
const GEN_SYS = `${noteFor(false).split(' The relay')[0]} You write short background details about characters for a story.`;
async function cueFor(rows, row) { const brief = sysOf(row), t = topicOf(brief); if (t) return topicCue(t); const logged = row.user.match(CUE)?.[1]; if (logged && logged !== 'send something' && !/^bring up what's on your mind/.test(logged)) return logged; const o = rows.find(r => r.opener)?.opener; if (o) return o.replace(/\.$/, ''); const w = wantOf(brief); if (!w) return 'send the group something';
  return (await claude(['-p', '--output-format', 'stream-json', '--verbose', '--system-prompt', GEN_SYS, '--tools', '', '--setting-sources', '', '--system-prompt-snapshot', 'off', '--effort', 'low', '--model', 'haiku', '--no-session-persistence'], `${w}\n\nSay in a few words, starting with a verb, what this person picks up the phone to send the group tonight. Reply with only those words.`)).replace(/\.$/, ''); }
const CUE = /\n\n\(You've opened the chat to ([\s\S]*)\.\)\s*$/;
// Old screens show a reaction as a line "(Tom reacted E to Maya's 19:42 message)" (or "to your ..."); today's show a count under the message.
function reactionCounts(u, me) {
  const re = /\n\n\((\w+) reacted (\S+) to (your|\w+'s) (\d\d:\d\d) message\)/g, hits = [...u.matchAll(re)]; if (!hits.length) return u;
  u = u.replace(re, ''); const at = new Map();
  for (const [, , emoji, to, hm] of hits) { const m = u.match(new RegExp(`\\n\\n\u2014 ${to === 'your' ? me : to.slice(0, -2)}(?: \\(you\\))?, \\w{3} ${hm}\\n`)); if (!m) continue; const from = m.index + m[0].length, rest = u.slice(from).search(/\n\n(?:\u2014 |\(new\))/), end = rest < 0 ? u.length : from + rest, c = at.get(end) ?? {}; c[emoji] = (c[emoji] ?? 0) + 1; at.set(end, c); }
  for (const [end, c] of [...at].sort((a, b) => b[0] - a[0])) u = u.slice(0, end) + `\n(${Object.entries(c).map(([e, k]) => `${e} ${k}`).join(', ')})` + u.slice(end);
  return u;
}
// The logged user turn in today's shape: no reason line for a look (the opener's cue stays), the events header, reactions as counts.
function newUser(u, kind, cue, me) {
  u = u.replace('[Not on your phone. Only you know this: your own day since you last looked. Nobody in the chat has seen it.]', '[Not on your phone: your own day, which you lived yourself. Nobody sent you this.]');
  u = u.replace(CUE, ''); // cueFor has already taken the logged cue into account
  return reactionCounts(kind === 'opener' ? u + `\n\n(You've opened the chat to ${cue}.)` : u, me);
}
const screenOf = u => (u.split('[The chat on your screen:]')[1] ?? u.replace(/^\([^)]*\)\s*/, '')).replace(/\(You've opened the chat[^)]*\)/, '').trim();
// What a person had posted before check-in `at` (their last 4 texts, as the rewrite pass is shown them).
const mineOf = (rows, row) => rows.filter(r => r.posted && r.who === row.who && r.at <= row.checkin && r.checkin !== row.checkin && !r.oracle).slice(-4).map(r => r.text); // not the reply being re-polished: a short one posts in the same minute as its check-in
async function polishOf(rows, row, draft, last) { return (await claude(['-p', '--output-format', 'stream-json', '--verbose', '--system-prompt', POLISH_SYS, '--tools', '', '--setting-sources', '', '--exclude-dynamic-system-prompt-sections', '--system-prompt-snapshot', 'off', '--effort', 'low', '--model', 'haiku', '--no-session-persistence'], polishAsk(row.who, styleOf(rows, row), last, draft, mineOf(rows, row)))).trim(); }
const outcome = t => isPass(t) ? 'pass' : REACT_RE.test(lastLine(t)) ? 'react' : 'post';
const pct = (a, b) => b ? `${a}/${b} = ${Math.round(100 * a / b)}%` : '-';

if (mode === 'turns') {
  const jobs = [];
  for (const run of args) { const rows = read(run); rows.forEach((row, i) => {
    if (!row.user || !row.argv || row.failed) return;
    const first = !/You last looked/.test(row.user), opener = first && /opened the chat to/.test(row.user), look = !first && /Not on your phone/.test(row.user), notif = !first && !look && /\(new\)/.test(row.user) && (LOGGED === 'any' || row.posted === false);
    if (ROWS.length ? !ROWS.includes(i) : KIND === 'opener' ? !opener : KIND === 'look' ? !look : KIND === 'notif' ? !notif : !(opener || notif)) return;
    const newMsgs = screenOf(row.user).split('(new)')[1] ?? '', asked = notif && /\?\s*(\n|$)/.test(newMsgs.replace(/\n\u2014 [^\n]*\n/g, '\n$&'));
    jobs.push({ run: path.basename(run), rows, row, i, kind: opener ? 'opener' : look ? 'look' : 'notif', asked }); }); }
  console.log(`${jobs.length} logged turns x ${N} samples`);
  const all = jobs.flatMap(j => Array.from({ length: N }, () => j));
  const res = await pool(all, async j => { const sys = newSystem(j.row), cue = j.kind === 'opener' ? await cueFor(j.rows, j.row) : '', user = newUser(j.row.user, j.kind, cue, j.row.who), raw = await claude(withSys(j.row.argv, sys), user), o = outcome(raw); let kept = o === 'post';
    if (kept) { const d = (await polishOf(j.rows, j.row, raw, screenOf(user))); kept = !/^drop[\s.!?]*$/i.test(d); return { o, raw, polished: d, kept }; } return { o, raw, kept }; });
  const by = {}; all.forEach((j, k) => (by[`${j.run}#${j.i}`] ??= { j, r: [] }).r.push(res[k]));
  const tot = {}, emo = {};
  for (const { j, r } of Object.values(by)) { const ok = r.filter(x => !x.error), post = ok.filter(x => x.o === 'post').length, react = ok.filter(x => x.o === 'react').length, fin = ok.filter(x => x.kept).length, k = j.kind + (j.asked ? '+asked' : ''); (tot[k] ??= [0, 0, 0, 0]); tot[k][0] += post; tot[k][1] += fin; tot[k][2] += ok.length; tot[k][3] += react;
    ok.filter(x => x.o === 'react').forEach(x => { const e = lastLine(x.raw).match(REACT_RE)[1].trim(); emo[e] = (emo[e] ?? 0) + 1; });
    console.log(`${j.kind.padEnd(6)} ${j.run.slice(11, 22)} #${j.i} ${j.row.who}${j.asked ? ' [asked]' : ''}: raw post ${post}/${ok.length}, react ${react}, after polish ${fin}/${ok.length}; ${r.filter(x => x.error).length ? 'errors ' + r.filter(x => x.error).length + '; ' : ''}e.g. ${JSON.stringify((ok.find(x => x.kept)?.polished ?? ok[0]?.raw ?? '').slice(0, 90))}`); }
  for (const [k, [p, f, n, rc]] of Object.entries(tot)) console.log(`TOTAL ${k}: raw post ${pct(p, n)}, REACT ${pct(rc, n)}, after polish ${pct(f, n)}`);
  console.log(`REACT emoji: ${Object.entries(emo).sort((a, b) => b[1] - a[1]).map(([e, c]) => `${e} ${c}`).join(', ') || '-'}`);
  fs.writeFileSync(path.join(cfg, 'replay.json'), JSON.stringify(Object.values(by).map(({ j, r }) => ({ run: j.run, i: j.i, who: j.row.who, kind: j.kind, asked: j.asked, screen: screenOf(j.row.user), r })), null, 1)); console.log('details:', path.join(cfg, 'replay.json'));
} else if (mode === 'polish') {
  const stat = { raw: 0, then: { words: 0, emoji: 0, slang: 0, total: 0 }, now: { words: 0, emoji: 0, slang: 0, total: 0 }, drops: [0, 0] }, pairs = [];
  const jobs = [];
  for (const run of args) { const rows = read(run); rows.forEach(row => { if (!row.raw || row.draft != null) return; // rows whose posted text is the polish of raw (a re-check's draft is skipped)
    const at = row.checkin, convo = rows.filter(r => r.posted && r.at <= at && r.who).slice(-12), last = convo.map(m => `\u2014 ${m.who}${m.who === row.who ? ' (you)' : ''}, ${stampIso(m.at)}\n${m.text}`).join('\n\n') || '(nothing yet)'; jobs.push({ run: path.basename(run), rows, row, last, names: [...new Set(rows.filter(r => r.who && r.posted !== undefined).map(r => r.who))] }); }); }
  console.log(`${jobs.length} logged drafts`);
  const res = await pool(jobs, j => polishOf(j.rows, j.row, j.row.raw, j.last));
  jobs.forEach((j, k) => { const now = res[k]; if (now?.error || now == null) return; stat.raw++; const dn = /^drop[\s.!?]*$/i.test(now); stat.drops[0] += j.row.pass ? 1 : 0; stat.drops[1] += dn ? 1 : 0;
    if (!j.row.pass) for (const f of ['words', 'emoji', 'slang', 'total']) stat.then[f] += added(j.row.raw, j.row.text)[f];
    if (!dn) for (const f of ['words', 'emoji', 'slang', 'total']) stat.now[f] += added(j.row.raw, now)[f]; pairs.push({ run: j.run, raw: j.row.raw, then: j.row.pass ? 'DROP' : j.row.text, now, who: j.row.who, names: j.names, a: dn ? null : added(j.row.raw, now) }); });
  const f = s => `emoji ${s.emoji}, slang ${s.slang}, other new words ${s.words - s.emoji}, of ${s.total} tokens`;
  console.log(`re-polished ${stat.raw}; DROPs then ${stat.drops[0]}, now ${stat.drops[1]}\nadded then: ${f(stat.then)}\nadded now:  ${f(stat.now)}`);
  // Habit markers per person (posts that were neither DROPped then nor now): each person's most frequent marker among the posts as they were posted, its share then and now; and how often a post names someone.
  const ABBR = /^(rn|idk|tmrw|tmr|thx|ty|pls|plz|wknd|np|u|ur|r|ppl|obv|hbu|tbh|ngl|lol|lmao|omg|tbf|imo|prob|abt|b4)$/i;
  const MARK = { dots: t => /(\.{2,}|\u2026)\s*\p{Extended_Pictographic}?\uFE0F?\s*$/u.test(t), um: t => /\b(um+|erm|hmm+|so yeah)\b/i.test(t), endEmoji: t => /\p{Extended_Pictographic}\uFE0F?\s*$/u.test(t), endX: t => /(^|\s)xx?\s*$/i.test(t), bang: t => /!!/.test(t), lower: t => /^[a-z]/.test(t.trim()), abbr: t => (t.match(/[\p{L}']+/gu) ?? []).some(w => ABBR.test(w)) };
  const named = (t, names, me) => /@\w/.test(t) || names.some(n => n !== me && new RegExp(`\\b${n}\\b`, 'i').test(t));
  const by = {}; pairs.filter(p => p.a).forEach(p => (by[p.run + p.who] ??= []).push(p));
  const rows4 = Object.values(by).filter(v => v.length >= 4).map(v => { const top = Object.entries(MARK).map(([k, fn]) => [k, v.filter(p => fn(p.then)).length]).sort((a, b) => b[1] - a[1])[0][0], sh = key => v.filter(p => MARK[top](p[key])).length / v.length, nm = key => v.filter(p => named(p[key], p.names, p.who)).length / v.length; return { who: v[0].who, n: v.length, top, then: sh('then'), now: sh('now'), nThen: nm('then'), nNow: nm('now') }; });
  const avg = k => rows4.reduce((a, r) => a + r[k], 0) / (rows4.length || 1);
  console.log(`habit marker, ${rows4.length} people with 4+ posts: top marker share of posts then ${avg('then').toFixed(2)}, now ${avg('now').toFixed(2)}; names someone then ${avg('nThen').toFixed(2)}, now ${avg('nNow').toFixed(2)}`);
  console.log(rows4.map(r => `${r.who}(${r.n}) ${r.top} ${r.then.toFixed(2)}->${r.now.toFixed(2)}`).join('; '));
  const pick = [...pairs.filter(p => p.a && /\?/.test(p.raw)).slice(0, 2), ...pairs.filter(p => p.a && !/\?/.test(p.raw) && p.raw.split(/\s+/).length > 12).slice(0, SHOW)].slice(0, SHOW);
  for (const p of pick) console.log(`\n[${p.who}] raw: ${p.raw.slice(0, 300)}\n  then: ${p.then.slice(0, 200)}\n  now:  ${p.now.slice(0, 200)}`);
  fs.writeFileSync(path.join(cfg, 'polish.json'), JSON.stringify(pairs, null, 1)); console.log('\ndetails:', path.join(cfg, 'polish.json'));
} else if (mode === 'session') { // F3: late looks of one person, replayed on their real session and on a copy without the PASS looks (and a screen from the first message the copy has not seen)
  const [run, who] = args, rows = read(run), mine = rows.filter(r => r.who === who && r.user && r.argv), cdir = rows.find(r => r.config_dir).config_dir, root = path.join(cdir, 'projects');
  const files = fs.readdirSync(root).flatMap(d => fs.readdirSync(path.join(root, d)).map(f => path.join(root, d, f)).filter(f => f.endsWith('.jsonl')));
  const parse = f => fs.readFileSync(f, 'utf8').split('\n').filter(Boolean).map(l => JSON.parse(l)), txt = r => [].concat(r.message.content).map(c => typeof c === 'string' ? c : c.text ?? '').join('');
  const lastU = mine.at(-1).user.slice(0, 60), file = files.map(f => [f, parse(f)]).filter(([, p]) => p.some(r => r.type === 'user' && txt(r).startsWith(lastU))).sort((a, b) => b[1].length - a[1].length)[0];
  if (!file) throw new Error('no session file for ' + who); const [src, ses] = file, cwd0 = ses.find(r => r.cwd).cwd, projDir = path.basename(path.dirname(src));
  const uIdx = ses.map((r, k) => r.type === 'user' ? k : -1).filter(k => k >= 0), aOf = k => ses.findIndex((r, j) => j > k && r.type === 'assistant');
  const isP = k => isPass(txt(ses[aOf(k)]));
  const msgs = rows.filter(r => r.posted && r.who).map(r => ({ who: r.who, text: r.text, at: r.at })), K = +opt('last', 6), probes = uIdx.slice(-K);
  const sysFor = newSystem(mine.at(-1));
  const header = u => u.slice(0, u.indexOf('\n\n') < 0 ? u.length : u.indexOf('\n\n')), evs = u => u.includes('[The chat on your screen:]') ? u.slice(u.indexOf('\n\n'), u.indexOf('[The chat on your screen:]') + '[The chat on your screen:]'.length) : '';
  const jobsS = [];
  for (const k of probes) { const logged = mine.find(m => txt(ses[k]).startsWith(m.user.slice(0, 60)) && m.checkin); if (!logged) continue;
    const cut = ses.slice(0, k), drop = new Set(); cut.forEach((r, j) => { if (r.type === 'user' && j >= 5) { const a = aOf(j); if (a < k && isPass(txt(ses[a]))) for (let x = j; x <= a; x++) drop.add(x); } });
    const kept = cut.filter((_, j) => !drop.has(j)).map((r, j, arr) => r); // relink parents across removed pairs
    const byU = new Map(cut.map(r => [r.uuid, r])), alive = new Set(kept.map(r => r.uuid)), up = id => { let p = id; while (p && !alive.has(p)) p = byU.get(p)?.parentUuid; return p ?? null; };
    kept.forEach(r => { if (r.parentUuid && !alive.has(r.parentUuid)) r.parentUuid = up(r.parentUuid); });
    const own = msgs.filter(m => m.who === who && m.at <= logged.checkin).at(-1), keptIdx = own ? msgs.findIndex(m => m === own) + 1 : 0, upto = msgs.filter(m => m.at <= logged.checkin), mark = m => `— ${m.who}${m.who === who ? ' (you)' : ''}, ${stampIso(m.at)}\n${m.text}`;
    const scr = [...upto.slice(Math.max(0, keptIdx - 6), keptIdx).map(mark), ...(keptIdx ? ['(new)'] : []), ...upto.slice(keptIdx).map(mark)].join('\n\n'), probeB = header(logged.user) + evs(logged.user) + `\n\n${scr}`;
    jobsS.push({ k, logged, A: cut, B: kept, probeA: logged.user, probeB, dropped: drop.size / 2 }); }
  const wr = (rowsX, tag) => { const d = fs.mkdtempSync(path.join(os.tmpdir(), 'open-chat-replay-')), sid = crypto.randomUUID(), pd = path.join(d, 'projects', projDir); fs.mkdirSync(pd, { recursive: true }); fs.writeFileSync(path.join(pd, sid + '.jsonl'), rowsX.map(r => JSON.stringify({ ...r, sessionId: sid })).join('\n') + '\n'); return { d, sid }; };
  fs.mkdirSync(cwd0, { recursive: true });
  const calls = jobsS.flatMap(j => ['A', 'B'].flatMap(c => Array.from({ length: N }, () => ({ j, c }))));
  const prepared = new Map(); jobsS.forEach(j => ['A', 'B'].forEach(c => prepared.set(j.k + c, wr(j[c], c))));
  const out = await pool(calls, async ({ j, c }) => { const { d, sid } = prepared.get(j.k + c); return outcome(await claude(withSys(j.logged.argv, sysFor).concat(['--resume', sid, '--fork-session']), newUser(c === 'A' ? j.probeA : j.probeB, 'notif', '', who), { ...env, CLAUDE_CONFIG_DIR: d }, cwd0)); });
  const tally = {}; calls.forEach(({ j, c }, n) => { const t = (tally[j.k] ??= { A: [0, 0], B: [0, 0], j }); if (out[n].error) return; t[c][1]++; if (out[n] === 'post') t[c][0]++; });
  let ta = [0, 0], tb = [0, 0];
  for (const t of Object.values(tally)) { console.log(`look ${t.j.logged.checkin} (logged: ${t.j.logged.posted ? 'post' : 'pass'}), PASS pairs removed in B: ${t.j.dropped}: with PASS history ${t.A[0]}/${t.A[1]}, without ${t.B[0]}/${t.B[1]}`); ta = [ta[0] + t.A[0], ta[1] + t.A[1]]; tb = [tb[0] + t.B[0], tb[1] + t.B[1]]; }
  console.log(`TOTAL ${who}: with PASS history ${pct(...ta)}, PASS looks removed ${pct(...tb)}`);
}

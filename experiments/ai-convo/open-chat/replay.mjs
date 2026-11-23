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
//       Limits: a replay is a fresh call with the logged screen only (runs before round 17 may have shown only the last 6 messages and the new ones);
//       the setting and life lines in the logged brief are the old ones.
//   node replay.mjs refresh <run> [<run> ...] [--rows 12,40] [--n 5]
//       Re-issues the logged daily-refresh calls (rows with `private_lines` and `small`) with the CURRENT refresh prompt (prompts.mjs dayAsk):
//       the person's fixed life, their previous Day as background, the chat since their previous refresh, as it was. (The first refresh's start
//       is approximated: the logged one was a random part of 6 h before the run.) Prints each sample's Day and the share of samples whose Small
//       thing is "nothing", against the logged one. Read the Days for unfinished statuses.
//   node replay.mjs quiet <run> [<run> ...] [--n 3] [--rows ...]
//       Round 16 item 2: the refresh looks that older runs skipped (the Small thing said "nothing", nothing new in the chat, so no turn and no row).
//       Each is put in front of that person's screen (the last 30 messages) at that time, with the logged Day, and replayed as a turn: post rate raw
//       and after polish, and the posts.
//   node replay.mjs recheck <run> [<run> ...] [--n 5]
//       Round 19 item 5: the logged re-check turns (rows with `recheck.user`: the crossed messages and the agent's own unsent draft) re-issued N times with the logged closing line
//       (arm "logged") and with today's (RECHECK_END in prompts.mjs, arm "new"). Per arm: SEND / PASS / rewritten answers, and how many rewritten answers comment on the draft itself
//       (crude: /draft|unsent|not sent|didn't send|wrong one|nobody has seen|scrap that/ and the like; read the answers printed under it).
//   node replay.mjs polish <run> [<run> ...] [--show 5]
//       Re-polishes each logged raw draft (rows with `raw`, the chat as it was, the person's description and examples, their last 4 posted messages)
//       with the CURRENT polish prompt. Counts tokens in the result that are not in the raw (words, emoji, slang), against the same count for the
//       polish that ran then; and per person (4+ posts) the share of posts carrying their most frequent habit marker (ending "...", "um"/"hmm",
//       a final emoji, a final "x", "!!", leading lowercase, an abbreviation) and the share naming someone (a participant's name or @), then and now.
import fs from 'fs'; import os from 'os'; import path from 'path'; import { spawn } from 'child_process';
import { ENV_NOTE, dayAsk, noteFor, topicCue, likeSpec, hhmm, parseNext, RECHECK_END, POLISH_SYS, polishAsk, isPass, lastLine, REACT_RE, added } from './prompts.mjs';
const args = process.argv.slice(2), mode = args.shift(), opt = (k, d) => { const i = args.indexOf('--' + k); if (i < 0) return d; const v = args[i + 1]; args.splice(i, 2); return v; };
const N = +opt('n', 5), KIND = opt('kind', 'all'), LOGGED = opt('logged', 'quiet'), ROWS = opt('rows', '')?.split(',').filter(Boolean).map(Number), SHOW = +opt('show', 5), CONC = +opt('conc', 8), REP = +opt('rep', 1);
const flag = k => { const i = args.indexOf('--' + k); if (i < 0) return false; args.splice(i, 1); return true; };
const LIKE = opt('like', ''), CUT_REACT = flag('cut-react'), MAX = +opt('max', 0);
const cwd = fs.mkdtempSync(path.join(os.tmpdir(), 'open-chat-replay-')), cfg = fs.mkdtempSync(path.join(os.tmpdir(), 'open-chat-replay-'));
const env = Object.fromEntries(Object.entries(process.env).filter(([k]) => !k.startsWith('CLAUDE'))); Object.assign(env, { CLAUDE_CODE_DISABLE_ATTACHMENTS: '1', CLAUDE_CODE_MAX_OUTPUT_TOKENS: '4000', CLAUDE_CONFIG_DIR: cfg });
const think = { n: 0, with: 0, tokens: 0 }; // thinking tokens over the calls of this replay (usage.output_tokens_details.thinking_tokens)
async function claude(argv, input, e = env, dir = cwd) {
  const proc = spawn('claude', argv, { cwd: dir, env: e, stdio: ['pipe', 'pipe', 'pipe'] }); let out = '', err = ''; proc.stdout.on('data', d => out += d); proc.stderr.on('data', d => err += d); proc.stdin.end(input);
  const code = await new Promise(res => { proc.on('error', () => res(-1)); proc.on('close', res); });
  const ev = out.split('\n').filter(Boolean).map(l => JSON.parse(l)), res = ev.find(x => x.type === 'result'); if (code !== 0 || !res || res.is_error) throw new Error(res?.result || err.trim() || `exit ${code}`);
  think.n++; think.tokens += res.usage?.output_tokens_details?.thinking_tokens ?? 0; if (res.usage?.output_tokens_details?.thinking_tokens > 0) think.with++;
  const blocks = ev.filter(x => x.type === 'assistant').flatMap(x => x.message.content);
  return blocks.filter(c => c.type === 'text').map(c => c.text.trim()).filter(Boolean).join('\n\n');
}
const pool = async (jobs, f) => { const out = []; let i = 0; await Promise.all(Array.from({ length: CONC }, async () => { while (i < jobs.length) { const k = i++; out[k] = await f(jobs[k], k).catch(e => ({ error: e.message })); } })); return out; };
const read = r => fs.readFileSync(path.join(r, 'log.jsonl'), 'utf8').split('\n').filter(Boolean).map(l => JSON.parse(l));
const sysOf = row => row.argv[row.argv.indexOf('--system-prompt') + 1], withSys = (argv, sys) => argv.map((a, i) => argv[i - 1] === '--system-prompt' ? sys : a);
// The person's way of texting and example texts: from the run's cast row, or (an older run, which had style cards) from the logged brief.
function styleOf(rows, row) {
  const c = rows.find(r => r.cast)?.cast[row.who]; if (c) return { how: c.style ?? c.texts, ex: c.ex };
  const b = sysOf(row), i = b.indexOf(' How you text: '), j = b.indexOf(" Some texts you've sent before"), k = b.indexOf(':', j), e = b.indexOf(' You put an emoji on a message', k);
  return { how: b.slice(i + 15, j).trim(), ex: b.slice(k + 1, e < 0 ? undefined : e).split(' / ').map(x => x.trim()).filter(Boolean) };
}
const WD = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'], stampIso = s => { const d = new Date(s); return `${WD[d.getDay()]} ${s.slice(11, 16)}`; };
// The logged brief in today's shape: no "want", no topic (the topic is only in the opener's cue), no example texts (the rewrite pass has them); the card of an older run stays as the "How you text" line.
const TOPIC_RE = /Something (?:that's been|on your) (?:on your )?mind(?: \([^)]*\))?: /;
function newSystem(row, run) {
  let b = sysOf(row);
  const k = b.indexOf(" What you're like: "), own = k >= 0 ? b.slice(k) : ''; if (k >= 0) b = b.slice(0, k); // a run made since round 19 carries its own personality line
  b = b.replace(/ What you want right now: .*?(?= Something (?:that's been|on your)| Only you know| How you text:)/s, '').replace(new RegExp(` ${TOPIC_RE.source}.*?(?= Only you know| How you text:)`, 's'), '');
  const j = b.indexOf(" Some texts you've sent before"); if (j >= 0) b = b.slice(0, j);
  const h = b.indexOf(' How you text: '); if (h >= 0) b = b.slice(0, h) + b.slice(h).replace(/^( How you text: .*?[.!?])\s.*$/s, '$1'); // today's "texts" is the frequency sentence only: an older run's longer description is cut to its first sentence (the cast call asked for the frequency first)
  const how = b.match(/ How you text: (.*)$/s)?.[1]; if (how && HOWCUT.has(how)) b = b.replace(how, HOWCUT.get(how)); // --cut-react
  const like = LIKES[run]?.[row.who]; // --like: a generated line for a cast that has none
  return `${noteFor(true)} ${b}${like ? ` What you're like: ${like}` : own}`;
}
const LIKES = {}, HOWCUT = new Map(); // --like <file>: run -> {name: personality line}; --cut-react: "How you text" sentence -> the same without its reaction clause
async function likesOf(c) { // the casting call's personality line (likeSpec) for people whose cast has none, given what the cast says about them
  const list = a => a.length < 2 ? a.join('') : a.slice(0, -1).join(', ') + ' and ' + a.at(-1), t = await claude(genArgv, `These people are in a ${c.names.length > 2 ? 'group chat' : 'chat'}: ${list(c.names.map(m => `${m} (${c.cast[m].who})`))}. ${c.situation || 'They are friends.'}\nSetting: ${c.setting}\n\n${c.names.map(m => `${m}. ${c.cast[m].knows} ${c.private_lines[m]}`).join('\n')}\n\nFor each person in turn, one line starting with that person's name:\n"<name> is like:" ${likeSpec}\nReply with only these lines.`), out = {};
  for (const m of c.names) { out[m] = fieldOf(t, `${m} is like`); if (!out[m]) throw new Error(`no "is like" line for ${m}`); } return out;
}
const cutReact = async how => (await claude(genArgv, `A sentence from a character sheet: "${how}"\n\nRemove only the part that says how often the person reacts to messages with an emoji instead of replying. Keep everything else word for word, as one sentence. If nothing in it is about reacting, give it back unchanged. Reply with only the sentence.`)).replace(/^"|"$/g, '').trim();
async function prepare(jobs) { // before the calls: personality lines (--like) and cut sentences (--cut-react), each generated once
  if (LIKE) { let saved = {}; try { saved = JSON.parse(fs.readFileSync(LIKE, 'utf8')); } catch {}
    for (const j of jobs) { if (LIKES[j.run]) continue; const c = j.rows.find(r => r.cast); if (c.cast[c.names[0]].like) { LIKES[j.run] = {}; continue; } saved[j.run] ??= await likesOf(c); LIKES[j.run] = saved[j.run]; }
    fs.writeFileSync(LIKE, JSON.stringify(saved, null, 1)); console.log(`personality lines: ${LIKE}`); }
  if (CUT_REACT) for (const j of jobs) { const how = newSystem(j.row ?? j.prevTurn, j.run).match(/ How you text: (.*?)(?= What you're like: |$)/s)?.[1]; if (how && !HOWCUT.has(how)) { HOWCUT.set(how, await cutReact(how)); console.log(`cut: ${how}\n  -> ${HOWCUT.get(how)}`); } }
}
// The opener's cue: the topic when the run had one, else the logged one, else the cast call's "opens with" line, else (older runs) asked of the model from the person's logged "want", in a few words starting with a verb.
const topicOf = brief => brief.match(new RegExp(`${TOPIC_RE.source}(.*?) (?:Only you know|How you text:)`))?.[1], wantOf = brief => brief.match(/What you want right now: (.*?)(?: Something (?:that's been|on your)| Only you know| How you text:)/)?.[1];
const GEN_SYS = `${noteFor(false).split(' The relay')[0]} You write short background details about characters for a story.`;
async function cueFor(rows, row) { const brief = sysOf(row), t = topicOf(brief); if (t) return topicCue(t); const logged = row.user.match(CUE)?.[1]; if (logged?.startsWith('send something about this:')) return logged; const o = rows.find(r => r.opener)?.opener; if (o) return topicCue(o); const w = wantOf(brief); if (!w) return 'send the group something';
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
const CLOCK_HEAD = /^(\([^)\n]*phone, [^)\n]*\))\n\n/, CLOCK_ANY = /\n\n\([^)\n]*phone, [^)\n]*\)(?=\n\n|$)/g;
// The logged user turn in today's shape (the clock line last): no reason line for a look (the opener's cue stays), the events header, reactions as counts.
function newUser(u, kind, cue, me) {
  u = u.replace('[Not on your phone. Only you know this: your own day since you last looked. Nobody in the chat has seen it.]', '[Not on your phone: your own day, which you lived yourself. Nobody sent you this.]');
  u = u.replace(CUE, ''); // cueFor has already taken the logged cue into account
  const head = u.match(CLOCK_HEAD); if (head) u = u.slice(head[0].length) + `\n\n${head[1]}`; // an older run's user turn opens with the clock line; today's ends with it, after the chat
  u = reactionCounts(kind === 'opener' ? u + `\n\n(You've opened the chat to ${cue}.)` : u, me);
  return process.env.STRIP_COUNTS === '1' ? u.replace(/\n\((?:\p{Extended_Pictographic}\uFE0F?[^\n()]*? \d+)(?:, [^\n()]*? \d+)*\)(?=\n\n|$)/gu, '') : u; // STRIP_COUNTS=1: reaction counts under the messages removed (round 18 item 4)
}
const screenOf = u => (u.split('[The chat on your screen:]')[1] ?? u.replace(/^\([^)]*\)\s*/, '')).replace(CLOCK_ANY, '').replace(/\(You've opened the chat[^)]*\)/, '').trim();
// What a person had posted before check-in `at` (their last 4 texts, as the rewrite pass is shown them).
const mineOf = (rows, row) => rows.filter(r => r.posted && r.who === row.who && r.at <= row.checkin && r.checkin !== row.checkin && !r.oracle).slice(-4).map(r => r.text); // not the reply being re-polished: a short one posts in the same minute as its check-in
// POLISH_EFFORT=low|medium|... (default medium, as run.mjs); POLISH_NOECHO=1 removes the echo-cut sentence from the polish prompt (a check of whether it does anything)
const POLISH_EFFORT = process.env.POLISH_EFFORT || 'medium', withoutEcho = a => process.env.POLISH_NOECHO === '1' ? a.replace(/ If the draft opens by handing back[^\n]*?cut that opening and keep only what follows it\./, '') : a;
async function polishOf(rows, row, draft, last) { return (await claude(['-p', '--output-format', 'stream-json', '--verbose', '--system-prompt', POLISH_SYS, '--tools', '', '--setting-sources', '', '--exclude-dynamic-system-prompt-sections', '--system-prompt-snapshot', 'off', '--effort', POLISH_EFFORT, '--model', 'haiku', '--no-session-persistence'], withoutEcho(polishAsk(row.who, styleOf(rows, row), last, draft, mineOf(rows, row))))).trim(); }
const outcome = t => isPass(t) ? 'pass' : REACT_RE.test(lastLine(t)) ? 'react' : 'post';
const NOTHING = /^(nothing|none|n\/a|no\b)/i, stampOf = s => stampIso(s), fullOf = s => `${stampIso(s).slice(0, 3)} ${s.slice(0, 10)} ${s.slice(11, 16)}`;
const GEN = `${ENV_NOTE} You write short background details about characters for a story.`, genArgv = ['-p', '--output-format', 'stream-json', '--verbose', '--system-prompt', GEN, '--tools', '', '--setting-sources', '', '--exclude-dynamic-system-prompt-sections', '--system-prompt-snapshot', 'off', '--effort', 'low', '--model', process.env.MODEL || 'haiku', '--no-session-persistence'];
const fieldOf = (text, k) => text.match(new RegExp(`^\\W*${k}[*_\\s]*:[*_\\s]*(.+)$`, 'im'))?.[1].trim();
const isMsg = r => r.posted === true && !r.private && typeof r.text === 'string' && r.who;
const msgLine = (m, me) => `\u2014 ${m.who}${m.who === me ? ' (you)' : ''}, ${stampIso(m.at)}\n${m.text}`;
const pct = (a, b) => b ? `${a}/${b} = ${Math.round(100 * a / b)}%` : '-';

if (mode === 'turns') {
  const jobs = [];
  for (const run of args) { const rows = read(run); rows.forEach((row, i) => {
    if (!row.user || !row.argv || row.failed) return;
    const first = !/You last looked/.test(row.user), opener = first && /opened the chat to/.test(row.user), look = !first && /Not on your phone/.test(row.user), notif = !first && !look && /\(new\)/.test(row.user) && (LOGGED === 'any' || row.posted === false);
    if (ROWS.length ? !ROWS.includes(i) : KIND === 'opener' ? !opener : KIND === 'look' ? !look : KIND === 'notif' ? !notif : !(opener || notif)) return;
    const newMsgs = screenOf(row.user).split('(new)')[1] ?? '', asked = notif && /\?\s*(\n|$)/.test(newMsgs.replace(/\n\u2014 [^\n]*\n/g, '\n$&'));
    jobs.push({ run: path.basename(run), rows, row, i, kind: opener ? 'opener' : look ? 'look' : 'notif', asked }); });
    if (MAX) { const mine = jobs.filter(j => j.run === path.basename(run)), keep = new Set(mine.filter((_, k) => k * MAX % mine.length < MAX).slice(0, MAX)); for (let k = jobs.length; k--;) if (jobs[k].run === path.basename(run) && !keep.has(jobs[k])) jobs.splice(k, 1); } } // --max k: at most k turns per run, evenly spaced
  console.log(`${jobs.length} logged turns x ${N} samples`); await prepare(jobs);
  const all = jobs.flatMap(j => Array.from({ length: N }, () => j));
  const res = await pool(all, async j => { const sys = newSystem(j.row, j.run), cue = j.kind === 'opener' ? await cueFor(j.rows, j.row) : '', user = newUser(j.row.user, j.kind, cue, j.row.who), raw = await claude(withSys(j.row.argv, sys), user), o = outcome(raw); let kept = o === 'post';
    if (kept) { const d = (await polishOf(j.rows, j.row, raw, screenOf(user))); kept = !/^drop[\s.!?]*$/i.test(d); return { o, raw, polished: d, kept }; } return { o, raw, kept }; });
  const by = {}; all.forEach((j, k) => (by[`${j.run}#${j.i}`] ??= { j, r: [] }).r.push(res[k]));
  const tot = {}, emo = {};
  for (const { j, r } of Object.values(by)) { const ok = r.filter(x => !x.error), post = ok.filter(x => x.o === 'post').length, react = ok.filter(x => x.o === 'react').length, fin = ok.filter(x => x.kept).length, k = (j.rows.find(r => r.cast)?.names.length > 2 ? 'group ' : '1:1 ') + j.kind + (j.asked ? '+asked' : ''); (tot[k] ??= [0, 0, 0, 0, 0]); tot[k][0] += post; tot[k][1] += fin; tot[k][2] += ok.length; tot[k][3] += react; tot[k][4] += ok.filter(x => x.kept && /\?/.test(x.polished)).length;
    ok.filter(x => x.o === 'react').forEach(x => { const e = lastLine(x.raw).match(REACT_RE)[1].trim(); emo[e] = (emo[e] ?? 0) + 1; });
    console.log(`${j.kind.padEnd(6)} ${j.run.slice(11, 22)} #${j.i} ${j.row.who}${j.asked ? ' [asked]' : ''}: raw post ${post}/${ok.length}, react ${react}, after polish ${fin}/${ok.length}; ${r.filter(x => x.error).length ? 'errors ' + r.filter(x => x.error).length + '; ' : ''}e.g. ${JSON.stringify((ok.find(x => x.kept)?.polished ?? ok[0]?.raw ?? '').slice(0, 90))}`); }
  for (const [k, [p, f, n, rc, q]] of Object.entries(tot)) console.log(`TOTAL ${k}: raw post ${pct(p, n)}, REACT ${pct(rc, n)}, after polish ${pct(f, n)}, final posts with a "?" ${pct(q, f)}`);
  console.log(`REACT emoji: ${Object.entries(emo).sort((a, b) => b[1] - a[1]).map(([e, c]) => `${e} ${c}`).join(', ') || '-'}`);
  fs.writeFileSync(path.join(cfg, 'replay.json'), JSON.stringify(Object.values(by).map(({ j, r }) => ({ run: j.run, i: j.i, who: j.row.who, kind: j.kind, asked: j.asked, screen: screenOf(j.row.user), r })), null, 1)); console.log('details:', path.join(cfg, 'replay.json'));
} else if (mode === 'refresh') {
  const jobs = [];
  for (const run of args) { const rows = read(run), cast = rows.find(r => r.cast), CHAT = cast.names.length > 2 ? 'group chat' : 'chat';
    rows.forEach((r, i) => { if (!r.private_lines || r.small == null || r.cast) return; if (ROWS.length && !ROWS.includes(i)) return;
      const n = Object.keys(r.private_lines)[0], prev = rows.slice(0, i).filter(x => x.small != null && x.private_lines?.[n]).at(-1), first = rows.find(x => x.who === n && x.checkin),
        from = prev ? prev.at : new Date(+new Date(first.checkin) - 3 * 36e5).toISOString().slice(0, 16), list = a => a.length < 2 ? a.join('') : a.slice(0, -1).join(', ') + ' and ' + a.at(-1);
      const chat = rows.slice(0, i).filter(x => isMsg(x) && x.at > from && x.at <= r.at).map(m => msgLine(m)).join('\n\n') || '(nothing)', smalls = rows.slice(0, i).filter(x => x.small && !NOTHING.test(x.small)).map(x => x.small).slice(-10);
      const ask = dayAsk({ cast: `These people are in a ${CHAT}: ${list(cast.names.map(m => `${m} (${cast.cast[m].who})`))}. ${cast.situation || 'They are friends.'}`, setting: cast.setting, now: fullOf(r.at), n, life: cast.private_lines[n], sleeps: `${hhmm(cast.sleep[n][0])} to ${hhmm(cast.sleep[n][1])}`, bg: prev?.private_lines[n], bgAt: fullOf(from), since: stampOf(from), chat, hours: Math.round((new Date(r.at) - new Date(from)) / 36e5), smalls });
      jobs.push({ run: path.basename(run), i, n, r, ask, cast, chat }); }); }
  console.log(`${jobs.length} logged refreshes x ${N} samples`);
  const all = jobs.flatMap(j => Array.from({ length: N }, () => j)), res = await pool(all, async j => { const t = await claude(genArgv, j.ask); return { day: fieldOf(t, 'Day'), small: fieldOf(t, 'Small thing'), next: fieldOf(t, 'Next') }; });
  // Chat reuse: content words (4+ letters, not a stop word or a cast name) in the chat since the previous refresh that are not in the person's fixed life line, found in a Day. Crude, for comparing two prompts on the same rows.
  const STOP = new Set('that this with have from they them then than were been will would could should what when where which there their about just very some more also into your yours like only over after before still really going gonna want need make made does done said says each much many here well back even know think thing things time today tonight cant dont didnt wont isnt wasnt youre thats theyre ive youve been being because while though both other another around away down until once ever never always'.split(' '));
  const cw = t => new Set((t.toLowerCase().match(/\p{L}{4,}/gu) ?? []).filter(w => !STOP.has(w)));
  const reuse = (j, day) => { const cast = j.cast, ban = new Set([...cast.names.map(x => x.toLowerCase()), ...cw(cast.private_lines[j.n])]), chatW = [...cw(j.chat.replace(/^\u2014 [^\n]*$/gm, ''))].filter(w => !ban.has(w)), dw = cw(day); return chatW.filter(w => dw.has(w)); };
  const rs = (day, j) => day ? reuse(j, day) : null; let reused = 0, reusedN = 0, loggedReused = 0;
  const by = {}; all.forEach((j, k) => (by[`${j.run}#${j.i}`] ??= { j, r: [] }).r.push(res[k]));
  let noth = 0, tot = 0, lnoth = 0, unusable = 0; const nexts = []; // nexts: the parsed "Next:" of every sample (a Date), null where the line is missing or has no day and time
  for (const { j, r } of Object.values(by)) { const ok = r.filter(x => x.day && x.small); ok.forEach(x => { x.at = parseNext(x.next, new Date(j.r.at)); }); nexts.push(...ok.map(x => x.at)); unusable += r.length - ok.filter(x => x.at).length; noth += ok.filter(x => NOTHING.test(x.small)).length; tot += ok.length; lnoth += NOTHING.test(j.r.small) ? 1 : 0;
    console.log(`\n== ${j.run.slice(11, 22)} #${j.i} ${j.n} ${j.r.at} (logged small: ${j.r.small.slice(0, 40)})\nLOGGED DAY: ${j.r.private_lines[j.n]}`); const lw = rs(j.r.private_lines[j.n], j); loggedReused += lw.length ? 1 : 0; console.log(`chat words in logged Day: ${lw.join(', ') || '-'}`); ok.forEach((x, k) => { const w = rs(x.day, j); reusedN++; reused += w.length ? 1 : 0; console.log(`NEW ${k + 1}: ${x.day}${NOTHING.test(x.small) ? '  [small: nothing]' : ''}  [next: ${x.next ?? '-'}${x.at ? ` = +${((x.at - new Date(j.r.at)) / 36e5).toFixed(1)}h` : ''}]${w.length ? `  [chat words: ${w.join(', ')}]` : ''}`); }); }
  const hrs = a => { const h = Array(24).fill(0); a.forEach(d => d && h[d.getHours()]++); return h; }, share = (h, lo, hi) => { const t = h.reduce((x, y) => x + y, 0); return t ? `${h.slice(lo, hi + 1).reduce((x, y) => x + y, 0)}/${t} = ${Math.round(100 * h.slice(lo, hi + 1).reduce((x, y) => x + y, 0) / t)}%` : '-'; };
  const loggedAt = args.flatMap(run => read(run).filter(r => r.private_lines && r.small != null && !r.cast).map(r => new Date(r.at))), nh = hrs(nexts), lh = hrs(loggedAt);
  console.log(`\nNext: unusable ${unusable} of ${all.length} samples; hour histogram of Next ${nh.join(' ')}\nlogged look hours (all refresh rows of these runs, n=${loggedAt.length}) ${lh.join(' ')}\nshare at 06:00-07:59: logged ${share(lh, 6, 7)}, Next ${share(nh, 6, 7)}; Next at 22:00-05:59: ${share(nh.map((v, i) => i >= 22 || i < 6 ? v : 0), 0, 23)}`);
  console.log(`\nSmall thing "nothing": logged ${pct(lnoth, jobs.length)}, now ${pct(noth, tot)}\nDays containing a chat word not in the life line: logged ${pct(loggedReused, jobs.length)}, now ${pct(reused, reusedN)}`);
} else if (mode === 'quiet') {
  const jobs = [];
  for (const run of args) { const rows = read(run);
    rows.forEach((r, i) => { if (!r.private_lines || r.small == null || r.cast || !NOTHING.test(r.small)) return; if (ROWS.length && !ROWS.includes(i)) return;
      const n = Object.keys(r.private_lines)[0]; if (rows.some(x => x.who === n && x.checkin === r.at && x.argv)) return; // a turn was taken at that look: not a skipped one
      const prevTurn = rows.slice(0, i).filter(x => x.who === n && x.argv && x.user).at(-1); if (!prevTurn) return;
      const msgs = rows.slice(0, i).filter(x => isMsg(x) && x.at <= r.at).slice(-30); if (!msgs.length) return;
      const user = [`[Not on your phone: your own day, which you lived yourself. Nobody sent you this.]\n${r.private_lines[n]}\n\n[The chat on your screen:]`, msgs.map(m => msgLine(m, n)).join('\n\n'), `(${n}'s phone, ${stampIso(r.at)}. You last looked ${stampIso(prevTurn.checkin)}.)`].join('\n\n');
      jobs.push({ run: path.basename(run), rows, i, n, r, user, row: { who: n, checkin: r.at, argv: prevTurn.argv }, prevTurn }); }); }
  console.log(`${jobs.length} skipped "nothing" looks x ${N} samples`); await prepare(jobs);
  const all = jobs.flatMap(j => Array.from({ length: N }, () => j));
  const res = await pool(all, async j => { const raw = await claude(withSys(j.prevTurn.argv, newSystem(j.prevTurn, j.run)), j.user), o = outcome(raw); if (o !== 'post') return { o, raw, kept: false }; const d = await polishOf(j.rows, j.row, raw, screenOf(j.user)); return { o, raw, polished: d, kept: !/^drop[\s.!?]*$/i.test(d) }; });
  const by = {}; all.forEach((j, k) => (by[`${j.run}#${j.i}`] ??= { j, r: [] }).r.push(res[k]));
  let p = 0, f = 0, rc = 0, t = 0;
  for (const { j, r } of Object.values(by)) { const ok = r.filter(x => !x.error), post = ok.filter(x => x.o === 'post').length, fin = ok.filter(x => x.kept).length; p += post; f += fin; rc += ok.filter(x => x.o === 'react').length; t += ok.length;
    console.log(`\n== ${j.run.slice(11, 22)} #${j.i} ${j.n} ${j.r.at}: raw post ${post}/${ok.length}, after polish ${fin}/${ok.length}\nDAY: ${j.r.private_lines[j.n].slice(0, 200)}`); ok.filter(x => x.kept).forEach(x => console.log(`  POST: ${JSON.stringify(x.polished.slice(0, 160))}`)); }
  console.log(`\nTOTAL: raw post ${pct(p, t)}, REACT ${pct(rc, t)}, after polish ${pct(f, t)}`);
} else if (mode === 'recheck') {
  const ON_DRAFT = /\b(draft|unsent|not sent|isn'?t sent|hasn'?t (gone|been sent)|didn'?t send|haven'?t sent|wrong (one|file|draft)|nobody (has )?seen|scrap that|ignore (that|this|my)|hang on|hold on|sending (it|that|mine|my)|send(ing)? it|as (is|written)|I'll send|fine reply|already (sent|posted))\b/i, jobs = [];
  for (const run of args) { const rows = read(run); rows.forEach((row, i) => { if (!row.recheck?.user || !row.argv) return; jobs.push({ run: path.basename(run), row, i, who: row.who }); }); }
  console.log(`${jobs.length} logged re-check turns x ${N} samples x 2 closing lines`);
  const arms = ['logged', 'new'], all = jobs.flatMap(j => arms.flatMap(a => Array.from({ length: N }, () => ({ j, a }))));
  const res = await pool(all, async ({ j, a }) => { const user = a === 'new' ? j.row.recheck.user.replace(/\(Your message isn't sent yet\. SEND[^)]*\)\s*$/, RECHECK_END) : j.row.recheck.user; return (await claude(withSys(j.row.argv, newSystem(j.row, j.run)), user)).trim(); });
  const by = {}; all.forEach(({ j, a }, k) => ((by[a] ??= {})[`${j.run}#${j.i}`] ??= []).push(res[k]));
  for (const a of arms) { const answers = Object.values(by[a]).flat().filter(x => typeof x === 'string'), send = answers.filter(x => /^send[\s.!?,;:]*$/i.test(lastLine(x))), pass = answers.filter(x => isPass(x)), rew = answers.filter(x => !send.includes(x) && !pass.includes(x)), on = rew.filter(x => ON_DRAFT.test(x));
    console.log(`\n== ${a}: ${answers.length} answers: SEND ${send.length}, PASS ${pass.length}, rewritten ${rew.length}, of which comment on the draft itself ${on.length}`); on.forEach(x => console.log(`  ON DRAFT: ${JSON.stringify(x.slice(0, 200))}`)); }
  fs.writeFileSync(path.join(cfg, 'recheck.json'), JSON.stringify(jobs.map(j => ({ run: j.run, i: j.i, who: j.who, draft: j.row.draft, logged: by.logged[`${j.run}#${j.i}`], new: by.new[`${j.run}#${j.i}`] })), null, 1)); console.log('details:', path.join(cfg, 'recheck.json'));
  for (const j of jobs) { console.log(`\n#${j.i} ${j.who} (${j.run.slice(11, 22)}) draft: ${JSON.stringify(j.row.draft.slice(0, 120))}`); for (const a of arms) console.log(`  ${a}: ${by[a][`${j.run}#${j.i}`].map(x => typeof x === 'string' ? JSON.stringify(x.slice(0, 100)) : 'ERR').join(' | ')}`); }
} else if (mode === 'polish') {
  const stat = { raw: 0, then: { words: 0, emoji: 0, slang: 0, total: 0 }, now: { words: 0, emoji: 0, slang: 0, total: 0 }, drops: [0, 0] }, pairs = [];
  const jobs = [];
  for (const run of args) { const rows = read(run); rows.forEach((row, ri) => { if (!row.raw || row.draft != null || (ROWS.length && !ROWS.includes(ri))) return; // rows whose posted text is the polish of raw (a re-check's draft is skipped)
    const at = row.checkin, convo = rows.filter(r => r.posted && r.at <= at && r.who && !(r.who === row.who && r.checkin === row.checkin)).slice(-12) /* not the reply being re-polished: a short one posts in its check-in's minute and showed up as already in the chat, inflating DROPs */, last = convo.map(m => `\u2014 ${m.who}${m.who === row.who ? ' (you)' : ''}, ${stampIso(m.at)}\n${m.text}`).join('\n\n') || '(nothing yet)'; for (let rep = 0; rep < REP; rep++) jobs.push({ run: path.basename(run), rows, row, last, names: [...new Set(rows.filter(r => r.who && r.posted !== undefined).map(r => r.who))] }); }); }
  console.log(`${jobs.length} logged drafts`);
  const res = await pool(jobs, j => polishOf(j.rows, j.row, j.row.raw, j.last));
  jobs.forEach((j, k) => { const now = res[k]; if (now?.error || now == null) return; stat.raw++; const dn = /^drop[\s.!?]*$/i.test(now); stat.drops[0] += j.row.pass ? 1 : 0; stat.drops[1] += dn ? 1 : 0;
    if (!j.row.pass) for (const f of ['words', 'emoji', 'slang', 'total']) stat.then[f] += added(j.row.raw, j.row.text)[f];
    if (!dn) for (const f of ['words', 'emoji', 'slang', 'total']) stat.now[f] += added(j.row.raw, now)[f]; pairs.push({ run: j.run, mine: mineOf(j.rows, j.row), raw: j.row.raw, then: j.row.pass ? 'DROP' : j.row.text, now, who: j.row.who, names: j.names, a: dn ? null : added(j.row.raw, now) }); });
  // Leaks of the instruction into the text, and emoji already in the person's last 4 posts (a repeat), among outputs that were posted (then) / that are not DROPs (now).
  const LEAK = /rewrit|draft|wait,|I need to|opener/i, EMO = t => t.match(/\p{Extended_Pictographic}/gu) ?? [], rep_ = (t, mine) => EMO(t).some(e => mine.some(m => m.includes(e))), live = pairs.filter(p => p.a), thenP = pairs.filter(p => p.then !== 'DROP');
  console.log(`leaks (/${LEAK.source}/i): then ${thenP.filter(p => LEAK.test(p.then)).length}/${thenP.length}, now ${live.filter(p => LEAK.test(p.now)).length}/${live.length}; emoji repeated from their last 4 posts: then ${thenP.filter(p => rep_(p.then, p.mine)).length}/${thenP.length}, now ${live.filter(p => rep_(p.now, p.mine)).length}/${live.length}`);
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
  fs.writeFileSync(path.join(cfg, 'polish.json'), JSON.stringify(pairs, null, 1)); console.log(`polish calls ${think.n}, with thinking tokens ${think.with}, mean thinking tokens ${(think.tokens / (think.n || 1)).toFixed(0)}`); console.log('\ndetails:', path.join(cfg, 'polish.json'));
}

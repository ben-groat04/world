// Four agents (Haiku by default) talk to each other through the `claude -p` CLI (no HTTP API). Each agent is a saved CLI session that holds everything it has read and written: every check-in forks the agent's session (--resume <id> --fork-session) and the fork is always kept as its session. Nothing is ever discarded: a PASS stays in its history as "looked and stayed quiet", and every other reply is posted, so no agent remembers saying something nobody saw, and none loses what it read. The system prompt is NOTE + BRIEF (which starts "You are <name>.") and nothing else.
// What reaches the model: the CLI's one-line identity ("You are a Claude agent, built on Anthropic's Claude Agent SDK."), the brief, and the CLI's fixed "# Environment" note (temp cwd, platform, shell, date), which can't be removed without CLAUDE_CODE_SIMPLE (that needs an API key). A temp cwd outside any git repo + a fresh CLAUDE_CONFIG_DIR keep everything else out. NOTE, sent first, tells the model to disregard that note (tested: without it, agents act like workers waiting for a coding task). Agents have no tools: with WebFetch they tried to look things up (venues, hours), failed, and said so ("I can't book from here", "I only have a web lookup tool"), which blind judges named as the main tell. Replies are capped at 1000 tokens (CLAUDE_CODE_MAX_OUTPUT_TOKENS).
// Event-driven clock: no global steps. Every agent has its own next check-in time, and the loop takes the earliest pending event (a check-in, a message finishing being typed, an @claude answer arriving), moves the in-story clock to it and handles it. At a check-in the agent is shown the time and what is new since it last looked (header line "\u2014 Name, Sun 19:42", then the text; on its first look, the whole conversation). Its reply is posted when finished: check-in time + time to read the new messages + time to type it (each agent has its own typing speed). A reply may be several messages (split on blank lines, except that a part ending with ':', a list (lines starting -, *, \u2022 or a number and . or )) and a lone --- stay joined with the neighbouring part), each posted after its own typing time. Just before a reply's first message posts, an agent who sees that others posted since its check-in is shown them (in a real app they arrive while you type) and may send its draft, change it or drop it with PASS (one re-check per reply, so crossed replies are rarer but still happen with later parts; the answer replaces the draft; a changed draft gets its own typing time, an unchanged one posts on schedule; the re-check is a further fork, which becomes the agent's session, so memory holds what was actually posted or passed). Check-ins come from notifications: when an agent goes from nothing unread to something unread, one check-in is scheduled after a single delay from NOTIFY, drawn at the first unread message (Pielot's delay is from the first unread message); later messages while it is pending don't reschedule it (an earlier pending spontaneous check-in is kept). An agent mid-reply is notified once it has posted, if something unread is waiting. Spontaneous check-ins (nothing new, so someone can start a new conversation) come OFFLINE_MIN after a PASS or after finishing a reply. Experimental, off by default (to compare variants): EXP_AWAY=1 lets an agent end a reply with AWAY (phone put away: notifications schedule no check-ins for it until its next spontaneous check-in, and the log row has away: true); EXP_LIFE=1 adds "You each have your own life outside this chat." to the situation; EXP_QUIET=1 rewords the PASS sentence in NOTE so that silence is normal ("You don't need to answer every message; ..."): an explicit behaviour nudge, to compare with the default wording. Private lines are on by default (PRIVATE=0 turns them off, for comparison): one call at the start, from the situation, topic and names, generates a shared SETTING (where everyone lives, how they know each other; fitting the brief) that goes into every system prompt right after the situation sentence, and a line per person (who has no SECRETS entry) about their life this week, added to their system prompt; logged in the first row {private_lines, setting}. Once per in-story day, at a person's first check-in after waking, their line is regenerated carrying on from the previous day's (one call per person per day) and replaces the old one in their system prompt (log row {private_lines: {name: line}, day}), so there are new things to bring up after lulls. EXP_REACT=1 lets an agent reply with just REACT and an emoji (REACT \u{1F44D}): it is not posted as a message but attached to the latest posted message, notifies nobody, counts like a PASS for scheduling (log row {react, to: index of that message, posted: false}), and agents see it at their next check-in as a line "(Tom reacted \u{1F44D} to Maya's 19:42 message)" among the new messages. Agents don't check in while asleep (SLEEP_START..SLEEP_END): such a check-in moves to their wake time. Maya (first name, gets the topic) opens at START; the others first look at some point in FIRST_SPREAD_MIN after it. Nobody is told to take turns and nothing makes the days pass: a quiet chat is just agents who are all offline.
// The relay note (NOTE) says an agent may reply just PASS, which nobody sees (with EXP_AWAY it also describes AWAY, which the relay strips, and with EXP_REACT, REACT). The @claude oracle gets only ENV_NOTE, the disregard-the-environment-note part (it saw PASS in NOTE and answered "PASS"). The note is not in the chat prompts, where agents took PASS up as a word. Ends at MESSAGES posted messages (Claude's private answers don't count; replies already being typed still post, no new check-ins start) or when the in-story clock passes START + DAYS days; the last log row is {end: 'limit'|'date', at}.
// In-story clock: starts at 19:00 today (env START='YYYY-MM-DDTHH:MM' overrides).
// Run: [MODEL=sonnet] [TOPIC='...'] [PEOPLE=2-8] [ORACLE=1] [EXP_AWAY=1] [EXP_LIFE=1] [EXP_REACT=1] [EXP_QUIET=1] [PRIVATE=0] [SECRETS='{...}'] [START=...] [DAYS=3] [MESSAGES=120] node run.mjs [messages] [brief]. Output: runs/<timestamp>/{transcript.txt,log.jsonl}: log.jsonl has a row per posted message and per PASS (posted: true|false, `at` = post time, or check-in time for a PASS, `checkin` = the check-in it came from; usage/user/argv on the first message of a check-in), oracle rows (posted: false, private: true, to), and the end row. A recheck adds `draft` (the reply as first written) and `recheck` ({user, usage}) to the reply's first row; a draft dropped at the re-check is logged as a PASS row with the draft. transcript.txt has posted messages, private Claude answers ("Claude → Maya (private)") and the end.
import fs from 'fs'; import os from 'os'; import path from 'path'; import { spawn } from 'child_process';
// Timing (all in-story).
// Typing on a phone: mean 36.17 words/min, SD 13.22 (Palin, Feit, Kim, Kristensson, Oulasvirta, "How do People Type on Mobile Devices? Observations from a Study with 37,000 Volunteers", MobileHCI 2019, https://doi.org/10.1145/3338286.3340120). It was a copy-typing task, so composing a reply may be slower. Drawn once per agent from a normal truncated below at TYPE_WPM_FLOOR.
const TYPE_WPM = [36.17, 13.22], TYPE_WPM_FLOOR = 10; // floor: design parameter, unsourced (about the mean minus 2 SD)
// Silent reading: 238 words/min for non-fiction (Brysbaert, "How many words do we read per minute?", Journal of Memory and Language 109, 104047, 2019, https://doi.org/10.1016/j.jml.2019.104047). Measured on continuous text.
const READ_WPM = 238;
// Delay from a message arriving to the user opening it: log-normal with median 6.15 min and a quarter opened within 60 s (Pielot, de Oliveira, Kwak, Oliver, "Didn't You See My Message? Predicting Attentiveness to Mobile Instant Messages", CHI 2014, https://doi.org/10.1145/2556288.2556973). Hence mu = ln 6.15, sigma = ln(6.15/1)/0.6745 (0.6745 = the 75th-percentile z).
const NOTIFY = { mu: Math.log(6.15), sigma: Math.log(6.15) / 0.6745 };
const OFFLINE_MIN = [30, 600]; // minutes until a spontaneous check-in (nothing new) after a PASS or a finished reply. design parameter, unsourced (TODO: source)
const SLEEP_START = [22.5, 24], SLEEP_END = [6, 8]; // hours of day, drawn once per agent. design parameter, unsourced (TODO: source)
const FIRST_SPREAD_MIN = [5, 120]; // minutes after START at which the agents other than Maya first look. design parameter, unsourced (TODO: source)
// NOTE is sent as part of the system prompt but left out of log.jsonl, which logs only BRIEF.
const AWAY = process.env.EXP_AWAY === '1', LIFE = process.env.EXP_LIFE === '1', REACT = process.env.EXP_REACT === '1', QUIET = process.env.EXP_QUIET === '1'; // experiments, off by default
const PRIVATE = process.env.PRIVATE !== '0'; // on by default; PRIVATE=0 for comparison
const ENV_NOTE = 'The software relaying this conversation adds an automatic note about a working directory, platform and shell. Disregard it: it is plumbing, not your situation.'; // the oracle gets only this
const NOTE = ENV_NOTE + ' The relay shows you the chat whenever you look at it.' + (QUIET ? ' You don\'t need to answer every message; when you have nothing to add, reply with just the word PASS: the relay drops it and nobody in the chat sees it.' : ' To stay quiet, reply with only the word PASS: the relay drops it and nobody in the chat ever sees it.') + (AWAY ? ' To put your phone away for a while, add a final line with just the word AWAY (on its own, or after your message): the relay drops the word, and you won\'t see new messages until you next pick the phone up.' : '') + (REACT ? ' To react to the latest message with an emoji instead of writing a reply, reply with REACT and the emoji (e.g. REACT \u{1F44D}): it shows on that message and doesn\'t notify anyone.' : '');
// The brief describes the situation, not behaviour: who you are, what this chat is, who's in it. (Earlier briefs were behaviour instructions: "talk as you would with friends", "keep messages short", "skip disclaimers about being an AI"; agents that didn't know they were friends texting on phones wrote polished, assistant-like prose.)
const list = a => a.length < 2 ? a.join('') : a.slice(0, -1).join(', ') + ' and ' + a.at(-1);
// The medium (a group chat on your phone, and who's in it) is always stated; an argv[3] brief describes who these people are to you (e.g. colleagues, siblings) in place of the default friends.
const BRIEF = process.argv[3], situation = n => { const others = list(NAMES.filter(x => x !== n)); return (BRIEF ? `This is a group chat on your phone with ${others}. ${BRIEF}` : `This is a group chat on your phone with your friends ${others}.`) + (LIFE ? ' You each have your own life outside this chat.' : ''); };
const TOPIC = process.env.TOPIC; // optional discussion point: only A gets it, as something on their mind, so it comes up the way a friend would raise it
const SECRETS = JSON.parse(process.env.SECRETS || '{}'); // optional {A?,B?,C?,D?}: a fact only that agent is told
// Optional (ORACLE=1): agents can ask Claude the way a person would. A line starting @claude goes to that agent's own Claude chat (one saved session per agent, so it remembers their earlier questions), which can search the web and open pages. Claude sees only the question, not the group chat; its answer goes only to the asker: it shows up in their next check-in as "(Claude replied to you:)" and they decide what to share, in their own words. The asker gets a check-in after the usual attention delay, since they are waiting for it. ORACLE_MODEL picks its model (default sonnet).
const ORACLE = process.env.ORACLE === '1', ORACLE_MODEL = process.env.ORACLE_MODEL || 'sonnet';
const ORACLE_LINE = ' You can also ask Claude, an AI assistant that can search the web and read pages: start a line with @claude and your question. Claude sees only your question, not this chat, and remembers what you asked it before. Its answer comes back to you alone.';
// System prompt order: BRIEF (with the setting after the situation sentence), oracle line, private line, A's topic, the agent's secret.
const lines = {}; let setting = ''; // PRIVATE: name -> generated line; the shared setting
const briefFor = n => `You are ${n}. ` + situation(n) + (setting && ` ${setting}`) + (ORACLE ? ORACLE_LINE : '') + (lines[n] ? ` What's going on with you at the moment: ${lines[n]}` : '') + (TOPIC && n === NAMES[0] ? ` Something that's been on your mind: ${TOPIC}` : '') + (SECRETS[n] ? ` Only you know this, at least at first: ${SECRETS[n]}` : '');
const MODEL = process.env.MODEL || 'haiku';
const NAMES = ['Maya', 'Tom', 'Jo', 'Sam', 'Priya', 'Dan', 'Ellie', 'Kofi'].slice(0, Math.min(8, Math.max(2, +process.env.PEOPLE || 4))), // env PEOPLE: 2-8 agents, default 4
   MESSAGES = +(process.env.MESSAGES || process.argv[2]) || 120, DAYS = +process.env.DAYS || 3, convo = [], seen = {}, looked = {};
const WD = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const p2 = x => String(x).padStart(2, '0'), hm = d => `${p2(d.getHours())}:${p2(d.getMinutes())}`, rf = ([a, b]) => a + Math.random() * (b - a), randn = () => Math.sqrt(-2 * Math.log(1 - Math.random())) * Math.cos(2 * Math.PI * Math.random()), words = t => t.trim().split(/\s+/).length;
const stamp = d => `${WD[d.getDay()]} ${hm(d)}`, iso = d => `${d.getFullYear()}-${p2(d.getMonth() + 1)}-${p2(d.getDate())}T${hm(d)}`, MIN = 60000;
const START = process.env.START ? new Date(process.env.START) : new Date(new Date().setHours(19, 0, 0, 0)), END = new Date(+START + DAYS * 864e5);
let clock = START;
const typeWpm = {}, sleep = {}, busy = {}; // per agent: own typing speed, [sleep start, wake] hours, replies still being typed
NAMES.forEach(n => { typeWpm[n] = Math.max(TYPE_WPM_FLOOR, TYPE_WPM[0] + TYPE_WPM[1] * randn()); sleep[n] = [rf(SLEEP_START), rf(SLEEP_END)]; busy[n] = 0; });
const line = m => `\u2014 ${m.who}, ${stamp(m.at)}\n${m.text}`; // header line, then the text: no "Name: text" pattern for agents to copy
const dir = path.join(import.meta.dirname, 'runs', new Date().toISOString().replace(/[:.]/g, '-'));
fs.mkdirSync(dir, { recursive: true });
const cwd = fs.mkdtempSync(path.join(os.tmpdir(), 'open-chat-'));
// Agents inherit none of the calling Claude session's CLAUDE* variables: CLAUDE_CODE_SESSION_ID alone made every agent's CLI write to and resume one shared session file, so each agent read everyone's replies as its own.
const env = Object.fromEntries(Object.entries(process.env).filter(([k]) => !k.startsWith('CLAUDE')));
env.CLAUDE_CODE_MAX_OUTPUT_TOKENS = '1000'; env.CLAUDE_CONFIG_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'open-chat-'));
const mkArgv = sys => ['-p', '--output-format', 'stream-json', '--verbose', '--system-prompt', sys, '--tools', '', '--setting-sources', '', '--settings', '{"attribution":{"commit":"","pr":""},"includeCoAuthoredBy":false}',
  '--exclude-dynamic-system-prompt-sections', '--model', MODEL]; // sessions are saved (no --no-session-persistence) so they can be forked; they live in the temp CLAUDE_CONFIG_DIR
// One CLI call with `input` on stdin. stream-json, not json: the reply is the text after the last tool call, and json's .result can hold only part of it. Returns the reply, usage and the (fork's) session id.
async function claude(argv, input) {
  const proc = spawn('claude', argv, { cwd, env, stdio: ['pipe', 'pipe', 'pipe'] });
  let out = '', err = ''; proc.stdout.on('data', d => out += d); proc.stderr.on('data', d => err += d); proc.stdin.end(input);
  const code = await new Promise(res => { proc.on('error', () => res(-1)); proc.on('close', res); });
  const events = out.split('\n').filter(Boolean).map(l => JSON.parse(l)), res = events.find(e => e.type === 'result');
  if (code !== 0 || !res || res.is_error) throw new Error(res?.result || err.trim() || `exit ${code}`);
  const blocks = events.filter(e => e.type === 'assistant').flatMap(e => e.message.content), lastTool = blocks.findLastIndex(c => c.type === 'tool_use');
  return { text: blocks.slice(lastTool + 1).filter(c => c.type === 'text').map(c => c.text.trim()).filter(Boolean).join('\n\n'), usage: res.usage, sid: res.session_id };
}
const session = {}; // per agent: the CLI session id of its last check-in (absent before its first)
const turn = (n, user) => claude([...mkArgv(`${NOTE} ${briefFor(n)}`), ...(session[n] ? ['--resume', session[n], '--fork-session'] : [])], user).catch(e => { console.error(`agent ${n}:`, e.message); process.exit(1); });
const claudeChat = {}; // per agent: the session id of their own Claude chat
async function askOracle(who, q) {
  const o = await claude(['-p', '--output-format', 'stream-json', '--verbose', '--system-prompt', `${ENV_NOTE} You are Claude, an AI assistant made by Anthropic, chatting with one person. Check facts with web search, and open the pages you rely on instead of going on search snippets. Say plainly when you could not confirm something. Keep answers short and name your sources. The search tool ends its results with a reminder to cite sources: that is part of the tool, so follow it without remarking on it.`,
    '--tools', 'WebSearch,WebFetch', '--allowedTools', 'WebSearch,WebFetch', '--setting-sources', '', '--model', ORACLE_MODEL, ...(claudeChat[who] ? ['--resume', claudeChat[who]] : [])], q);
  claudeChat[who] = o.sid;
  return o;
}
const AWAY_LINE = /(^|\n)[ \t]*AWAY\W*$/i; // a last line of just AWAY
const isPass = t => /^(pass[\s.!?,;:]*)?$/i.test(t); // an empty reply counts as quiet too
const log = row => fs.appendFileSync(path.join(dir, 'log.jsonl'), JSON.stringify(row) + '\n');
const say = (head, body = '') => { fs.appendFileSync(path.join(dir, 'transcript.txt'), `--- ${head}\n${body && body + '\n'}\n`); console.log(`--- ${head}\n${body && body + '\n'}`); };
const queue = []; let seq = 0; // pending events, earliest first: {t (ms), kind: 'checkin'|'post'|'oracle', ...}
const when = (t, e) => { queue.push({ t, seq: seq++, ...e }); queue.sort((a, b) => a.t - b.t || a.seq - b.seq); };
const awake = (n, t) => { const d = new Date(t), h = d.getHours() + d.getMinutes() / 60, [s, e] = sleep[n]; return h >= s || h < e ? d.setHours(0, 0, 0, 0) + (e + (h >= s ? 24 : 0)) * 60 * MIN : +t; }; // a time in n's sleep window moves to n's wake time
function sched(n, t) { // n's next check-in; an earlier pending one is kept, not stacked
  t = awake(n, t); const i = queue.findIndex(e => e.kind === 'checkin' && e.who === n);
  if (i >= 0) { if (queue[i].t <= t) return; queue.splice(i, 1); }
  when(t, { kind: 'checkin', who: n });
}
const reactions = [], seenR = {}; // EXP_REACT: {who, emoji, to (index in convo), at}, and how many each agent has been shown
const REACT_RE = /^react\s+([\p{Extended_Pictographic}\uFE0F\u200D\u{1F3FB}-\u{1F3FF}\s]{1,16})$/iu; // a reply of only REACT and a short emoji string
const away = new Set(); // EXP_AWAY: agents with their phone put away until their next check-in
const waiting = new Set(), ans = {}; // agents with a notification check-in pending since their first unread message; per agent: Claude's private answers not yet shown {at, s}
const unread = n => convo.slice(seen[n] ?? 0).some(m => m.who !== n) || ans[n]?.length > 0;
// n opens the first unread message after one log-normal delay, drawn when nothing was unread before; later messages don't redraw it. For an agent finishing a reply the first unread message is the earliest one posted while it typed, but it could not open it before it stopped typing, so the delay runs from now.
const notify = n => { if (away.has(n) || waiting.has(n)) return; waiting.add(n); sched(n, +clock + Math.exp(NOTIFY.mu + NOTIFY.sigma * randn()) * MIN); };
async function checkin(n) {
  if (lines[n] && lineDay[n] !== clock.toDateString()) await refresh(n);
  away.delete(n); waiting.delete(n); // picks the phone up
  const t = clock, fresh = convo.slice(seen[n] ?? 0).filter(m => m.who !== n), now = `It's now ${stamp(t)}`; // own messages are already in its session
  const items = [...fresh.map(m => ({ at: m.at, s: line(m) })), ...(ans[n] ?? []), ...reactions.slice(seenR[n] ?? 0).filter(x => x.who !== n).map(x => ({ at: x.at, s: `(${x.who} reacted ${x.emoji} to ${convo[x.to].who}'s ${hm(convo[x.to].at)} message)` }))].sort((a, b) => a.at - b.at).map(x => x.s).join('\n\n');
  const readWords = fresh.reduce((s, m) => s + words(m.text), 0) + (ans[n] ?? []).reduce((s, a) => s + words(a.s), 0); ans[n] = [];
  const user = !(n in session) ? `(${now}.)\n\nConversation so far:\n${items || '(nothing yet)'}`
    : items ? `(${now}.)\n\nNew messages:\n${items}` : `(${now}. Nothing new since you last looked, ${stamp(looked[n])}.)`;
  const j = await turn(n, user), gone = AWAY && AWAY_LINE.test(j.text), text = (gone ? j.text.replace(AWAY_LINE, '') : j.text).trim(); // a reply of only AWAY becomes empty, i.e. a PASS
  session[n] = j.sid; seen[n] = convo.length; seenR[n] = reactions.length; looked[n] = t; // the fork is always the agent's session
  const meta = { usage: j.usage, user, argv: mkArgv(briefFor(n)), ...(gone && { away: true }) };
  if (gone) away.add(n);
  const emoji = REACT && convo.length && text.match(REACT_RE)?.[1].trim();
  if (emoji) { // a reaction goes on the latest posted message: no notifications, and the agent goes quiet like after a PASS
    const to = convo.length - 1; reactions.push({ who: n, emoji, to, at: t });
    log({ who: n, react: emoji, to, posted: false, at: iso(t), checkin: iso(t), ...meta }); say(`${stamp(t)}, ${n} reacted ${emoji} to ${convo[to].who}'s ${hm(convo[to].at)} message`);
    return sched(n, +t + rf(OFFLINE_MIN) * MIN);
  }
  if (isPass(text)) { log({ who: n, text, pass: true, posted: false, at: iso(t), checkin: iso(t), ...meta }); return sched(n, +t + rf(OFFLINE_MIN) * MIN); }
  reply(n, splitReply(text), +t + readWords / READ_WPM * MIN, t, meta, true);
}
const BULLET = /^\s*([-*\u2022]|\d+[.)])\s/, joins = (a, p) => a.endsWith(':') || p === '---' || /(^|\n)---$/.test(a) || p.split('\n').every(l => BULLET.test(l)); // p belongs with the part a before it
const splitReply = text => { const parts = text.split(/\n\s*\n/).map(p => p.trim()).filter(Boolean).reduce((o, p) => { if (o.length && joins(o.at(-1), p)) o[o.length - 1] += '\n\n' + p; else o.push(p); return o; }, []), k = ORACLE ? parts.findIndex(p => ASK.test(p)) : -1; return k >= 0 ? [...parts.slice(0, k), parts.slice(k).join('\n\n')] : parts; }; // the @claude question runs to the end of the reply
function reply(n, parts, at, t, meta, first) { // queue the messages of n's reply, each posted after its own typing time; the first one of a fresh reply carries the draft to re-check
  busy[n] = parts.length;
  parts.forEach((p, i) => when(at += words(p) / typeWpm[n] * MIN, { kind: 'post', who: n, text: p, checkin: t, ...(i === 0 && { meta, ...(first && { draft: parts.join('\n\n') }) }) }));
}
const done = n => { sched(n, +clock + rf(OFFLINE_MIN) * MIN); if (unread(n)) notify(n); }; // finished a reply (or dropped it): next spontaneous check-in, and a check-in for what came meanwhile
// Re-check before a reply's first message posts: n sees what others posted since its check-in and answers with the message to send (same, changed) or PASS. Reading the new messages adds no time (they showed up as it typed). Only the first message triggers it, and only once per reply, to bound cost. A changed reply is typed again from now (design choice: an unchanged one has already been typed, so it posts on schedule). Returns true if e is not to be posted now (dropped, or requeued).
async function recheck(e) {
  const n = e.who, fresh = convo.slice(seen[n]).filter(m => m.who !== n), user = `(While you were typing, new messages arrived:)\n${fresh.map(line).join('\n\n')}\n\n(Your message isn't sent yet:)\n${e.draft}\n\n(Reply with the message you send now (your draft as is, or changed), or PASS to send nothing.)`;
  const j = await turn(n, user), text = j.text.trim(), parts = isPass(text) ? [] : splitReply(text);
  session[n] = j.sid; seen[n] = convo.length; // the fork whose answer was posted or passed is the one kept
  e.meta = { ...e.meta, draft: e.draft, recheck: { user, usage: j.usage } };
  if (parts.join('\n\n') === e.draft) return false;
  for (let i = queue.length; i--;) if (queue[i].kind === 'post' && queue[i].who === n) queue.splice(i, 1);
  if (parts.length) reply(n, parts, +clock, e.checkin, e.meta);
  else { log({ who: n, text, pass: true, posted: false, at: iso(clock), checkin: iso(new Date(e.checkin)), ...e.meta }); busy[n] = 0; done(n); }
  return true;
}
const ASK = /^\s*@claude\b[:,]?\s*([\s\S]+)/im; // everything after @claude, across lines
async function posted(e) {
  if (e.draft && convo.slice(seen[e.who]).some(m => m.who !== e.who) && await recheck(e)) return;
  convo.push({ who: e.who, text: e.text, at: clock });
  log({ who: e.who, text: e.text, posted: true, at: iso(clock), checkin: iso(new Date(e.checkin)), ...e.meta });
  say(`${stamp(clock)}, ${e.who}`, e.text);
  const others = NAMES.filter(n => n !== e.who);
  others.filter(n => !busy[n]).forEach(notify);
  if (!--busy[e.who]) done(e.who); // done typing: sees what came meanwhile
  const q = ORACLE && e.text.match(ASK)?.[1].trim();
  if (q) try { const t0 = Date.now(), o = await askOracle(e.who, q); when(+clock + Date.now() - t0, { kind: 'oracle', who: e.who, text: o.text, question: q, usage: o.usage }); } // answer lands after the real duration of the call
  catch (x) { console.error('oracle error:', x.message); log({ who: 'Claude', oracle: true, question: q, error: x.message }); }
}
// Private lines. The generator prompt is a design choice: it asks for lives (place and job first, then what is going on), not chat behaviour, and for varied, specific, ordinary circumstances because without that it kept choosing the same ones (a broken boiler in 6 of 12 runs, a 10K in 7 of 12).
const who = NAMES.filter(n => !SECRETS[n]); // those with a SECRETS entry get no line: the secret takes priority
const GEN = `${ENV_NOTE} You write short background details about characters for a story.`, FORM = "in the second person ('You ...'): where you are and your job or occupation first, then what is going on. Choose varied, specific, ordinary circumstances rather than stock ones. Describe the life, not how you behave in the chat.";
const cast = () => `These people are in a group chat: ${list(NAMES)}. ${BRIEF || 'They are friends.'}${TOPIC ? ` ${NAMES[0]} has this on their mind: ${TOPIC}` : ''}${NAMES.filter(n => SECRETS[n]).map(n => ` ${n} already has this going on: ${SECRETS[n]}`).join('')}`;
const gen = (input, what) => claude(mkArgv(GEN), input).catch(e => { console.error(what, e.message); process.exit(1); });
if (PRIVATE) { // one call: the shared setting and a line per person
  const j = await gen(`${cast()}\n\nWrite a JSON object with "setting": one sentence in the second person for the whole group, saying where you all live (a real or plausible town, city or area) and how you know each other, fitting the situation; and "lines": for ${list(who)}, one line each about their life this week, ${FORM} Make the people clearly different from each other. Reply with only the JSON.`, 'private lines:');
  const g = JSON.parse(j.text.match(/\{[\s\S]*\}/)[0]); setting = g.setting; for (const n of who) lines[n] = g.lines[n];
  log({ private_lines: lines, setting, usage: j.usage });
}
const lineDay = Object.fromEntries(NAMES.map(n => [n, START.toDateString()]));
async function refresh(n) { // a new in-story day (the first check-in after waking): n's line carries on from yesterday's
  lineDay[n] = clock.toDateString();
  const j = await gen(`${cast()}\nSetting: ${setting}\n\nIt is a new day. Yesterday ${n}'s line was: ${lines[n]}\n\nWrite ${n}'s line for today, ${FORM} Carry on from yesterday's: some things move on or resolve, and new ordinary things come up. Reply with only the line.`, `private line ${n}:`);
  lines[n] = j.text.trim(); log({ private_lines: { [n]: lines[n] }, day: iso(clock).slice(0, 10), usage: j.usage });
}
NAMES.forEach((n, i) => sched(n, +START + (i ? rf(FIRST_SPREAD_MIN) * MIN : 0)));
let end;
while (!end) {
  const closing = convo.length >= MESSAGES; // at the limit no new check-ins start; replies already being typed still post
  if (closing && queue.every(e => e.kind === 'checkin')) end = 'limit';
  else if (queue[0].t > END) { end = 'date'; clock = END; }
  else {
    const e = queue.shift(); clock = new Date(e.t);
    if (e.kind === 'checkin') { if (!closing) await checkin(e.who); }
    else if (e.kind === 'post') await posted(e);
    else { (ans[e.who] ??= []).push({ at: clock, s: `(Claude replied to you:)\n${e.text}` }); log({ who: 'Claude', to: e.who, text: e.text, oracle: true, private: true, posted: false, question: e.question, at: iso(clock), usage: e.usage }); say(`${stamp(clock)}, Claude \u2192 ${e.who} (private)`, e.text); if (!busy[e.who]) notify(e.who); } // only the asker sees it, at their next check-in
  }
}
log({ end, at: iso(clock) }); say(end === 'limit' ? 'message limit reached' : 'end date reached', stamp(clock));
console.log('Done. Saved transcript.txt and log.jsonl in', dir);

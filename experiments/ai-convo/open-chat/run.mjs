// Four agents (Haiku by default) talk to each other through the `claude -p` CLI (no HTTP API). Each agent is a saved CLI session that holds everything it has read and written: every check-in forks the agent's session (--resume <id> --fork-session) and the fork is always kept as its session. Nothing is ever discarded: a PASS stays in its history as "looked and stayed quiet", and every other reply is posted, so no agent remembers saying something nobody saw, and none loses what it read. The system prompt is NOTE + BRIEF (which starts "You are <name>.") and nothing else.
// What reaches the model: the CLI's one-line identity ("You are a Claude agent, built on Anthropic's Claude Agent SDK."), the brief, and the CLI's fixed "# Environment" note (temp cwd, platform, shell, date), which can't be removed without CLAUDE_CODE_SIMPLE (that needs an API key). A temp cwd outside any git repo + a fresh CLAUDE_CONFIG_DIR keep everything else out. NOTE, sent first, tells the model to disregard that note (tested: without it, agents act like workers waiting for a coding task). Agents have WebFetch (links in the chat can be opened); a reply is the text after its last tool call. Replies are capped at 1000 tokens (CLAUDE_CODE_MAX_OUTPUT_TOKENS).
// Event-driven clock: no global steps. Every agent has its own next check-in time, and the loop takes the earliest pending event (a check-in, a message finishing being typed, an @claude answer arriving), moves the in-story clock to it and handles it. At a check-in the agent is shown the time and what is new since it last looked (header line "\u2014 Name, Sun 19:42", then the text; on its first look, the whole conversation). Its reply is posted when finished: check-in time + time to read the new messages + time to type it (each agent has its own typing speed). A reply may be several messages (split on blank lines), each posted after its own typing time. Messages posted while an agent is typing are seen only at its next check-in, so replies can cross, and anyone can post twice in a row. Check-ins come from notifications: whenever a message posts (Claude's answers too), every other agent who is not mid-reply gets a check-in scheduled after a delay from NOTIFY (an earlier pending check-in is kept, not stacked); an agent mid-reply is notified once it has posted. Spontaneous check-ins (nothing new, so someone can start a new conversation) come OFFLINE_MIN after a PASS or after finishing a reply. Experimental, off by default (to compare variants): EXP_AWAY=1 lets an agent end a reply with AWAY (phone put away: notifications schedule no check-ins for it until its next spontaneous check-in, and the log row has away: true); EXP_LIFE=1 adds "You each have your own life outside this chat." to the situation. Agents don't check in while asleep (SLEEP_START..SLEEP_END): such a check-in moves to their wake time. Maya (first name, gets the topic) opens at START; the others first look at some point in FIRST_SPREAD_MIN after it. Nobody is told to take turns and nothing makes the days pass: a quiet chat is just agents who are all offline.
// The relay note (NOTE) says an agent may reply just PASS, which nobody sees (with EXP_AWAY it also describes AWAY, which the relay strips); it is not in the chat prompts, where agents took it up as a word. Ends at MESSAGES posted messages (Claude answers count; replies already being typed still post, no new check-ins start) or when the in-story clock passes START + DAYS days; the last log row is {end: 'limit'|'date', at}.
// In-story clock: starts at 19:00 today (env START='YYYY-MM-DDTHH:MM' overrides).
// Run: [MODEL=sonnet] [TOPIC='...'] [PEOPLE=2-8] [ORACLE=1] [EXP_AWAY=1] [EXP_LIFE=1] [SECRETS='{...}'] [START=...] [DAYS=3] [MESSAGES=120] node run.mjs [messages] [brief]. Output: runs/<timestamp>/{transcript.txt,log.jsonl}: log.jsonl has a row per posted message and per PASS (posted: true|false, `at` = post time, or check-in time for a PASS, `checkin` = the check-in it came from; usage/user/argv on the first message of a check-in), oracle rows, and the end row. transcript.txt has only posted messages and the end.
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
const AWAY = process.env.EXP_AWAY === '1', LIFE = process.env.EXP_LIFE === '1'; // experiments, off by default
const NOTE = 'The software relaying this conversation adds an automatic note about a working directory, platform and shell. Disregard it: it is plumbing, not your situation. The relay shows you the chat whenever you look at it. To stay quiet, reply with only the word PASS: the relay drops it and nobody in the chat ever sees it.' + (AWAY ? ' To put your phone away for a while, add a final line with just the word AWAY (on its own, or after your message): the relay drops the word, and you won\'t see new messages until you next pick the phone up.' : '');
// The brief describes the situation, not behaviour: who you are, what this chat is, who's in it. (Earlier briefs were behaviour instructions: "talk as you would with friends", "keep messages short", "skip disclaimers about being an AI"; agents that didn't know they were friends texting on phones wrote polished, assistant-like prose.)
const list = a => a.length < 2 ? a.join('') : a.slice(0, -1).join(', ') + ' and ' + a.at(-1);
// The medium (a group chat on your phone, and who's in it) is always stated; an argv[3] brief describes who these people are to you (e.g. colleagues, siblings) in place of the default friends-in-one-city.
const BRIEF = process.argv[3], situation = n => { const others = list(NAMES.filter(x => x !== n)); return (BRIEF ? `This is a group chat on your phone with ${others}. ${BRIEF}` : `This is a group chat on your phone with your friends ${others}. You all live in the same city.`) + (LIFE ? ' You each have your own life outside this chat.' : ''); };
const TOPIC = process.env.TOPIC; // optional discussion point: only A gets it, as something on their mind, so it comes up the way a friend would raise it
const SECRETS = JSON.parse(process.env.SECRETS || '{}'); // optional {A?,B?,C?,D?}: a fact only that agent is told
// Optional (ORACLE=1): agents can ask Claude the way a person would. A line starting @claude goes to that agent's own Claude chat (one saved session per agent, so it remembers their earlier questions), which can search the web and open pages. Claude sees only the question, not the group chat; its answer is posted to the group as 'Claude', as if the asker pasted it in. ORACLE_MODEL picks its model (default sonnet).
const ORACLE = process.env.ORACLE === '1', ORACLE_MODEL = process.env.ORACLE_MODEL || 'sonnet';
const ORACLE_LINE = ' You can also ask Claude, an AI assistant that can search the web and read pages: start a line with @claude and your question. Claude sees only your question, not this chat, and remembers what you asked it before. Its answer is shared here.';
// System prompt order: BRIEF, oracle line, A's topic, the agent's secret.
const briefFor = n => `You are ${n}. ` + situation(n) + (ORACLE ? ORACLE_LINE : '') + (TOPIC && n === NAMES[0] ? ` Something that's been on your mind: ${TOPIC}` : '') + (SECRETS[n] ? ` Only you know this, at least at first: ${SECRETS[n]}` : '');
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
const mkArgv = sys => ['-p', '--output-format', 'stream-json', '--verbose', '--system-prompt', sys, '--tools', 'WebFetch', '--allowedTools', 'WebFetch', '--setting-sources', '', '--settings', '{"attribution":{"commit":"","pr":""},"includeCoAuthoredBy":false}',
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
  const o = await claude(['-p', '--output-format', 'stream-json', '--verbose', '--system-prompt', `${NOTE} You are Claude, an AI assistant made by Anthropic, chatting with one person. Check facts with web search, and open the pages you rely on instead of going on search snippets. Say plainly when you could not confirm something. Keep answers short and name your sources.`,
    '--tools', 'WebSearch,WebFetch', '--allowedTools', 'WebSearch,WebFetch', '--setting-sources', '', '--model', ORACLE_MODEL, ...(claudeChat[who] ? ['--resume', claudeChat[who]] : [])], q);
  claudeChat[who] = o.sid;
  return o;
}
const AWAY_LINE = /(^|\n)[ \t]*AWAY\W*$/i; // a last line of just AWAY
const isPass = t => /^(pass[\s.!?,;:]*)?$/i.test(t); // an empty reply counts as quiet too
const log = row => fs.appendFileSync(path.join(dir, 'log.jsonl'), JSON.stringify(row) + '\n');
const say = (head, body) => { fs.appendFileSync(path.join(dir, 'transcript.txt'), `--- ${head}\n${body}\n\n`); console.log(`--- ${head}\n${body}\n`); };
const queue = []; let seq = 0; // pending events, earliest first: {t (ms), kind: 'checkin'|'post'|'oracle', ...}
const when = (t, e) => { queue.push({ t, seq: seq++, ...e }); queue.sort((a, b) => a.t - b.t || a.seq - b.seq); };
const awake = (n, t) => { const d = new Date(t), h = d.getHours() + d.getMinutes() / 60, [s, e] = sleep[n]; return h >= s || h < e ? d.setHours(0, 0, 0, 0) + (e + (h >= s ? 24 : 0)) * 60 * MIN : +t; }; // a time in n's sleep window moves to n's wake time
function sched(n, t) { // n's next check-in; an earlier pending one is kept, not stacked
  t = awake(n, t); const i = queue.findIndex(e => e.kind === 'checkin' && e.who === n);
  if (i >= 0) { if (queue[i].t <= t) return; queue.splice(i, 1); }
  when(t, { kind: 'checkin', who: n });
}
const away = new Set(); // EXP_AWAY: agents with their phone put away until their next check-in
const notify = n => away.has(n) || sched(n, +clock + Math.exp(NOTIFY.mu + NOTIFY.sigma * randn()) * MIN); // n opens the new message after a log-normal delay
async function checkin(n) {
  away.delete(n); // picks the phone up
  const t = clock, fresh = convo.slice(seen[n] ?? 0).filter(m => m.who !== n), now = `It's now ${stamp(t)}`; // own messages are already in its session
  const user = !(n in session) ? `(${now}.)\n\nConversation so far:\n${fresh.length ? fresh.map(line).join('\n\n') : '(nothing yet)'}`
    : fresh.length ? `(${now}.)\n\nNew messages:\n${fresh.map(line).join('\n\n')}` : `(${now}. Nothing new since you last looked, ${stamp(looked[n])}.)`;
  const j = await turn(n, user), gone = AWAY && AWAY_LINE.test(j.text), text = (gone ? j.text.replace(AWAY_LINE, '') : j.text).trim(); // a reply of only AWAY becomes empty, i.e. a PASS
  session[n] = j.sid; seen[n] = convo.length; looked[n] = t; // the fork is always the agent's session
  const meta = { usage: j.usage, user, argv: mkArgv(briefFor(n)), ...(gone && { away: true }) };
  if (gone) away.add(n);
  if (isPass(text)) { log({ who: n, text, pass: true, posted: false, at: iso(t), checkin: iso(t), ...meta }); return sched(n, +t + rf(OFFLINE_MIN) * MIN); }
  let parts = text.split(/\n\s*\n/).map(p => p.trim()).filter(Boolean);
  const k = ORACLE ? parts.findIndex(p => ASK.test(p)) : -1;
  if (k >= 0) parts = [...parts.slice(0, k), parts.slice(k).join('\n\n')]; // the question runs to the end of the reply
  let at = +t + fresh.reduce((s, m) => s + words(m.text), 0) / READ_WPM * MIN;
  busy[n] = parts.length;
  parts.forEach((p, i) => when(at += words(p) / typeWpm[n] * MIN, { kind: 'post', who: n, text: p, checkin: t, ...(i === 0 && { meta }) }));
}
const ASK = /^\s*@claude\b[:,]?\s*([\s\S]+)/im; // everything after @claude, across lines
async function posted(e) {
  convo.push({ who: e.who, text: e.text, at: clock });
  log({ who: e.who, text: e.text, posted: true, at: iso(clock), checkin: iso(new Date(e.checkin)), ...e.meta });
  say(`${stamp(clock)}, ${e.who}`, e.text);
  const others = NAMES.filter(n => n !== e.who);
  others.filter(n => !busy[n]).forEach(notify);
  if (!--busy[e.who]) { sched(e.who, +clock + rf(OFFLINE_MIN) * MIN); if (convo.slice(seen[e.who]).some(m => m.who !== e.who)) notify(e.who); } // done typing: sees what came meanwhile
  const q = ORACLE && e.text.match(ASK)?.[1].trim();
  if (q) try { const t0 = Date.now(), o = await askOracle(e.who, q); when(+clock + Date.now() - t0, { kind: 'oracle', who: e.who, text: o.text, question: q, usage: o.usage }); } // answer lands after the real duration of the call
  catch (x) { console.error('oracle error:', x.message); log({ who: 'Claude', oracle: true, question: q, error: x.message }); }
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
    else { convo.push({ who: 'Claude', text: e.text, at: clock }); log({ who: 'Claude', text: e.text, oracle: true, question: e.question, at: iso(clock), usage: e.usage }); say(`${stamp(clock)}, Claude`, e.text); NAMES.filter(n => !busy[n]).forEach(notify); }
  }
}
log({ end, at: iso(clock) }); say(end === 'limit' ? 'message limit reached' : 'end date reached', stamp(clock));
console.log('Done. Saved transcript.txt and log.jsonl in', dir);

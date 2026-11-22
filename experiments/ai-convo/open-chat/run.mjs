// Four agents (Haiku by default) talk to each other through the `claude -p` CLI (no HTTP API). Each agent is a saved CLI session that holds everything it has read and written: every check-in forks the agent's session (--resume <id> --fork-session) and the fork is always kept as its session. Nothing is ever discarded: a PASS stays in its history as "looked and stayed quiet", and every other reply is posted, so no agent remembers saying something nobody saw, and none loses what it read. The system prompt is NOTE + BRIEF (which starts "You are <name>.") and nothing else.
// What reaches the model: the CLI's one-line identity ("You are a Claude agent, built on Anthropic's Claude Agent SDK."), the brief, and the CLI's fixed "# Environment" note (temp cwd, platform, shell, date), which can't be removed without CLAUDE_CODE_SIMPLE (that needs an API key). A temp cwd outside any git repo + a fresh CLAUDE_CONFIG_DIR keep everything else out. NOTE, sent first, tells the model to disregard that note (tested: without it, agents act like workers waiting for a coding task). Agents have no tools: with WebFetch they tried to look things up (venues, hours), failed, and said so ("I can't book from here", "I only have a web lookup tool"), which blind judges named as the main tell. Replies are capped at 4000 tokens (CLAUDE_CODE_MAX_OUTPUT_TOKENS; hard-coded design setting): at 1000, runaway replies hit the cap and the CLI injected "Output token limit hit. Resume directly...", which claude() joined to the reply; a turn whose stream shows that injection is a failed turn: not posted, logged {who, failed: 'continuation'} and treated as a PASS for scheduling. Agent and generator calls use `--effort low` (hard-coded design setting; env EFFORT=<level> overrides it, EFFORT=default omits the flag to compare) and `--system-prompt-snapshot off`: the CLI otherwise keeps a session's first system prompt on every resume and fork, so the daily private-line refresh never reached the model. CLAUDE_CODE_DISABLE_ATTACHMENTS=1 stops the CLI adding its "<total_tokens>15000000 tokens left</total_tokens>" reminder to every turn (the model-identity line, the date and the environment note, including its curl and untrusted-file advice, cannot be turned off, nor can the SDK identity line: the CLI picks it when run non-interactively). Each run keeps its CLAUDE_CONFIG_DIR (the CLI's session files, to audit what the models saw) and logs its path in the first row {config_dir}.
// Event-driven clock: no global steps. Every agent has its own next check-in time, and the loop takes the earliest pending event (a check-in, a message finishing being typed, an @claude answer arriving), moves the in-story clock to it and handles it. At a check-in the agent is shown its phone, the time and when it last looked ("(Jo's phone, Wed 17:03. You last looked Wed 12:10.)"), any "Since you last looked: ..." life events, then the phone screen: the last RECENT messages it had already seen, then what is new, each as header line "\u2014 Name, Sun 19:42" and the text, its own messages as "\u2014 Jo (you), Sun 19:42" (on its first look, the whole conversation). Its reply is posted when finished: check-in time + time to read the new messages + time to type it (each agent has its own typing speed). A reply may be several messages (split on blank lines, except that a part ending with ':', a list (lines starting -, *, \u2022 or a number and . or )) and a lone --- stay joined with the neighbouring part), each posted after its own typing time. Just before a reply's first message posts, an agent who sees that others posted since its check-in is shown them (in a real app they arrive while you type) on the phone screen (the recent chat, own messages marked "(you)") followed by its own unsent draft under a header like theirs ("\u2014 Tom (you, not sent yet)") and may send it unchanged with SEND, replace it by writing a new message, or drop it with PASS (one re-check per reply; the draft is always re-checked, because telling whether a crossed message is a reply to the same thing would need another model call, so crossed replies are rarer but still happen with later parts; the answer replaces the draft; a changed draft gets its own typing time, a SEND posts the draft on schedule; the re-check is a further fork, which becomes the agent's session, so memory holds what was actually posted or passed). Check-ins come from notifications: when an agent goes from nothing unread to something unread, one check-in is scheduled after a single delay from NOTIFY, drawn at the first unread message (Pielot's delay is from the first unread message); later messages while it is pending don't reschedule it (an earlier pending spontaneous check-in is kept). An agent mid-reply is notified once it has posted, if something unread is waiting. Spontaneous check-ins (nothing new, so someone can start a new conversation) come OFFLINE_MIN after a PASS or after finishing a reply. Private lines are on by default (PRIVATE=0 turns them off, for comparison): one call at the start, from the situation, topic and names, generates a shared SETTING (where everyone lives, how they know each other, what everyone already knows about each other and, when the brief implies earlier contact, what they last talked about; fitting the brief) that goes into every system prompt right after the situation sentence, and a line per person (secret-holders too; their line must not restate the secret) about their life this week (where they live, their occupation, what is going on), added to their system prompt; logged in the first row {private_lines, setting}. That day-0 line is the person's fixed identity. Life moves with elapsed time, not calendar days: at a person's check-in, if at least REFRESH_HOURS of in-story time have passed since their last refresh (their first is at START), one call generates what has happened to them since, from the cast without TOPIC and SECRETS, the identity, the weekday, date and time, what was going on at the last refresh (background only) and everyone's messages since then (asking how the things they said they'd do went, and what is different now). The result is not in the system prompt: it opens that check-in's user turn, after the phone header, as "Since you last looked: ..." (log row {private_lines: {name: events}, day, at}), so there are new things to bring up after lulls. LINES_FROM=<earlier run folder> loads the setting and day-0 lines (and any other fields of that run's first private_lines row) from it instead of generating, so arms of one seed share a world; GEN_ONLY=1 runs only the generator, writes the folder with that row and exits. Reactions are on by default (REACT=0 turns them off, for comparison): an agent may reply with just REACT and an emoji (REACT \u{1F44D}): it is not posted as a message but attached to the latest message from someone else, which must be one first shown at this very check-in (never its own, never one already seen: with nothing new, a REACT is just quiet and is logged as a PASS), notifies nobody, counts like a PASS for scheduling (log row {react, to: index of that message, posted: false}), and agents see it at their next check-in as a line "(Tom reacted \u{1F44D} to Maya's 19:42 message)" among the new messages ("to your 19:42 message" when it is on the viewer's own). Agents don't check in while asleep (SLEEP_START..SLEEP_END): such a check-in moves to their wake time. Maya (first name, gets the topic) opens at START; the others first look at some point in FIRST_SPREAD_MIN after it. Nobody is told to take turns and nothing makes the days pass: a quiet chat is just agents who are all offline.
// A reply line of the form [file: name.ext], [photo], [photo: what it shows] or [link: what it is] on its own posts as a separate attachment message (no real files; log row attachment:true). The relay note (NOTE) says an agent may reply just PASS, which nobody sees (and, unless REACT=0, REACT), and how to send a file, photo or link. The @claude oracle gets only ENV_NOTE, the disregard-the-environment-note part (it saw PASS in NOTE and answered "PASS"). The note is not in the chat prompts, where agents took PASS up as a word. Ends at MESSAGES posted messages (Claude's private answers don't count; replies already being typed still post, no new check-ins start) or when the in-story clock passes START + DAYS days; the last log row is {end: 'limit'|'date', at}.
// In-story clock: starts at 19:00 today (env START='YYYY-MM-DDTHH:MM' overrides).
// Run: [MODEL=sonnet] [TOPIC='...'] [PEOPLE=2-8] [ORACLE=1] [EFFORT=low|default|...] [REACT=0] [PRIVATE=0] [LINES_FROM=<run folder>] [GEN_ONLY=1] [SECRETS='{...}'] [START=...] [DAYS=3] [MESSAGES=120] node run.mjs [messages] [brief]. Output: runs/<timestamp>/{transcript.txt,log.jsonl}: log.jsonl starts with {config_dir} and has a row per posted message and per PASS (posted: true|false, `at` = post time, or check-in time for a PASS, `checkin` = the check-in it came from; usage/user/argv on the first message of a check-in; a failed turn is {who, failed: 'continuation', posted: false, ...}), oracle rows (posted: false, private: true, to), and the end row. A recheck (SEND or a rewrite or PASS) adds `draft` (the reply as first written) and `recheck` ({user, usage}) to the reply's first row; a draft dropped at the re-check is logged as a PASS row with the draft. transcript.txt has posted messages, private Claude answers ("Claude → Maya (private)") and the end.
import fs from 'fs'; import os from 'os'; import path from 'path'; import { spawn } from 'child_process';
// Timing (all in-story).
// Typing on a phone: mean 36.17 words/min, SD 13.22 (Palin, Feit, Kim, Kristensson, Oulasvirta, "How do People Type on Mobile Devices? Observations from a Study with 37,000 Volunteers", MobileHCI 2019, https://doi.org/10.1145/3338286.3340120). It was a copy-typing task, so composing a reply may be slower. Drawn once per agent from a normal truncated below at TYPE_WPM_FLOOR.
const TYPE_WPM = [36.17, 13.22], TYPE_WPM_FLOOR = 10; // floor: design parameter, unsourced (about the mean minus 2 SD)
// Silent reading: 238 words/min for non-fiction (Brysbaert, "How many words do we read per minute?", Journal of Memory and Language 109, 104047, 2019, https://doi.org/10.1016/j.jml.2019.104047). Measured on continuous text.
const READ_WPM = 238;
// Delay from a message arriving to the user opening it: log-normal with median 6.15 min and a quarter opened within 60 s (Pielot, de Oliveira, Kwak, Oliver, "Didn't You See My Message? Predicting Attentiveness to Mobile Instant Messages", CHI 2014, https://doi.org/10.1145/2556288.2556973). Hence mu = ln 6.15, sigma = ln(6.15/1)/0.6745 (0.6745 = the 75th-percentile z).
const NOTIFY = { mu: Math.log(6.15), sigma: Math.log(6.15) / 0.6745 };
const OFFLINE_MIN = [30, 600]; // minutes until a spontaneous check-in (nothing new) after a PASS or a finished reply. design parameter, unsourced (TODO: source)
const SLEEP_START = [22.5, 24], SLEEP_END = [6, 8]; // hours of day, drawn once per agent when the generated identity gives no sleeping hours (a PRIVATE=0 run, or LINES_FROM an older run). design parameter, unsourced (TODO: source)
const FIRST_SPREAD_MIN = [5, 120]; // minutes after START at which the agents other than Maya first look. design parameter, unsourced (TODO: source)
// NOTE is sent as part of the system prompt but left out of log.jsonl, which logs only BRIEF.
const PRIVATE = process.env.PRIVATE !== '0', REACT = process.env.REACT !== '0'; // on by default; =0 for comparison
const ENV_NOTE = 'The software relaying this conversation adds an automatic note about a working directory, platform and shell. Disregard it: it is plumbing, not your situation.'; // the oracle gets only this
const NOTE = ENV_NOTE + ' The relay shows you the chat whenever you look at it.' + ' To stay quiet, reply with only the word PASS: the relay drops it and nobody in the chat ever sees it.' + (REACT ? ' To react to the latest message with an emoji instead of writing a reply, reply with REACT and the emoji (e.g. REACT \u{1F44D}): it shows on that message and doesn\'t notify anyone.' : '') + ' To send a file, photo or link, put it on its own line as [file: name], [photo: what it shows] or [link: what it is].';
// The brief describes the situation, not behaviour: who you are, what this chat is, who's in it. (Earlier briefs were behaviour instructions: "talk as you would with friends", "keep messages short", "skip disclaimers about being an AI"; agents that didn't know they were friends texting on phones wrote polished, assistant-like prose.)
const list = a => a.length < 2 ? a.join('') : a.slice(0, -1).join(', ') + ' and ' + a.at(-1);
// The medium (a group chat on your phone, and who's in it) is always stated; an argv[3] brief describes who these people are to you (e.g. colleagues, siblings) in place of the default friends.
const BRIEF = process.argv[3], situation = n => { const others = list(NAMES.filter(x => x !== n)); return (BRIEF ? `This is a ${CHAT} on your phone with ${others}. ${BRIEF}` : `This is a ${CHAT} on your phone with your ${NAMES.length > 2 ? 'friends' : 'friend'} ${others}.`) ; };
const TOPIC = process.env.TOPIC; // optional discussion point: only A gets it, as something on their mind, so it comes up the way a friend would raise it
const SECRETS = JSON.parse(process.env.SECRETS || '{}'); // optional {A?,B?,C?,D?}: a fact only that agent is told
// Optional (ORACLE=1): agents can ask Claude the way a person would. A line starting @claude goes to that agent's own Claude chat (one saved session per agent, so it remembers their earlier questions), which can search the web and open pages. Claude sees only the question, not the group chat; its answer goes only to the asker: it shows up in their next check-in as "(Claude replied to you:)" and they decide what to share, in their own words. The asker gets a check-in after the usual attention delay, since they are waiting for it. ORACLE_MODEL picks its model (default sonnet).
const ORACLE = process.env.ORACLE === '1', ORACLE_MODEL = process.env.ORACLE_MODEL || 'sonnet';
const ORACLE_LINE = ' You can also ask Claude, an AI assistant that can search the web and read pages: start a line with @claude and your question. Claude sees only your question, not this chat, and remembers what you asked it before. Its answer comes back to you alone.';
// System prompt order: BRIEF (with the setting after the situation sentence), oracle line, private line (fixed day-0 identity), A's topic, the agent's secret.
const lines = {}, events = {}; let setting = ''; // PRIVATE: name -> generated day-0 line (fixed); name -> the latest generated events (background for the next refresh, shown to the agent in its check-in); the shared setting
const briefFor = n => `You are ${n}. ` + situation(n) + (setting && ` ${setting}`) + (ORACLE ? ORACLE_LINE : '') + (lines[n] ? ` What's going on with you at the moment: ${lines[n]}` : '')  + (TOPIC && n === NAMES[0] ? ` Something that's been on your mind: ${TOPIC}` : '') + (SECRETS[n] ? ` Only you know this, at least at first: ${SECRETS[n]}` : '');
const MODEL = process.env.MODEL || 'haiku', EFFORT = process.env.EFFORT || 'low';
const NAMES = ['Maya', 'Tom', 'Jo', 'Sam', 'Priya', 'Dan', 'Ellie', 'Kofi'].slice(0, Math.min(8, Math.max(2, +process.env.PEOPLE || 4))), // env PEOPLE: 2-8 agents, default 4
   MESSAGES = +(process.env.MESSAGES || process.argv[2]) || 120, DAYS = +process.env.DAYS || 3, convo = [], seen = {}, looked = {};
const CHAT = NAMES.length > 2 ? 'group chat' : 'chat'; // two people: a 1:1 chat, not a group
const WD = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const p2 = x => String(x).padStart(2, '0'), hm = d => `${p2(d.getHours())}:${p2(d.getMinutes())}`, rf = ([a, b]) => a + Math.random() * (b - a), randn = () => Math.sqrt(-2 * Math.log(1 - Math.random())) * Math.cos(2 * Math.PI * Math.random()), words = t => t.trim().split(/\s+/).length;
const stamp = d => `${WD[d.getDay()]} ${hm(d)}`, iso = d => `${d.getFullYear()}-${p2(d.getMonth() + 1)}-${p2(d.getDate())}T${hm(d)}`, MIN = 60000;
const START = process.env.START ? new Date(process.env.START) : new Date(new Date().setHours(19, 0, 0, 0)), END = new Date(+START + DAYS * 864e5);
let clock = START;
const typeWpm = {}, sleep = {}, busy = {}; // per agent: own typing speed, [sleep start, wake] hours, replies still being typed
NAMES.forEach(n => { typeWpm[n] = Math.max(TYPE_WPM_FLOOR, TYPE_WPM[0] + TYPE_WPM[1] * randn()); sleep[n] = [rf(SLEEP_START), rf(SLEEP_END)]; busy[n] = 0; });
const line = m => `\u2014 ${m.who}, ${stamp(m.at)}\n${m.text}`; // header line, then the text: no "Name: text" pattern for agents to copy
const RECENT = 6; // messages of earlier chat shown above the new ones: design parameter (compact, enough to see one's own last few messages)
const dir = path.join(import.meta.dirname, 'runs', new Date().toISOString().replace(/[:.]/g, '-'));
fs.mkdirSync(dir, { recursive: true });
const cwd = fs.mkdtempSync(path.join(os.tmpdir(), 'open-chat-'));
// Agents inherit none of the calling Claude session's CLAUDE* variables: CLAUDE_CODE_SESSION_ID alone made every agent's CLI write to and resume one shared session file, so each agent read everyone's replies as its own.
const env = Object.fromEntries(Object.entries(process.env).filter(([k]) => !k.startsWith('CLAUDE')));
env.CLAUDE_CODE_DISABLE_ATTACHMENTS = '1'; env.CLAUDE_CODE_MAX_OUTPUT_TOKENS = '4000'; env.CLAUDE_CONFIG_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'open-chat-')); // output cap: design setting
const CONTINUATION = /Output token limit hit/; // the CLI's injected "Output token limit hit. Resume directly..." after a reply hit the cap
const mkArgv = sys => ['-p', '--output-format', 'stream-json', '--verbose', '--system-prompt', sys, '--tools', '', '--setting-sources', '', '--settings', '{"attribution":{"commit":"","pr":""},"includeCoAuthoredBy":false}',
  '--exclude-dynamic-system-prompt-sections', '--system-prompt-snapshot', 'off', ...(EFFORT === 'default' ? [] : ['--effort', EFFORT]), '--model', MODEL]; // effort: hard-coded design setting (low), env EFFORT overrides, EFFORT=default omits the flag; snapshot off so a changed system prompt (the daily line) reaches resumed sessions // sessions are saved (no --no-session-persistence) so they can be forked; they live in the temp CLAUDE_CONFIG_DIR
// One CLI call with `input` on stdin. stream-json, not json: the reply is the text after the last tool call, and json's .result can hold only part of it. Returns the reply, usage and the (fork's) session id.
async function claude(argv, input) {
  const proc = spawn('claude', argv, { cwd, env, stdio: ['pipe', 'pipe', 'pipe'] });
  let out = '', err = ''; proc.stdout.on('data', d => out += d); proc.stderr.on('data', d => err += d); proc.stdin.end(input);
  const code = await new Promise(res => { proc.on('error', () => res(-1)); proc.on('close', res); });
  const events = out.split('\n').filter(Boolean).map(l => JSON.parse(l)), res = events.find(e => e.type === 'result');
  if (code !== 0 || !res || res.is_error) throw new Error(res?.result || err.trim() || `exit ${code}`);
  const blocks = events.filter(e => e.type === 'assistant').flatMap(e => e.message.content), lastTool = blocks.findLastIndex(c => c.type === 'tool_use');
  return { text: blocks.slice(lastTool + 1).filter(c => c.type === 'text').map(c => c.text.trim()).filter(Boolean).join('\n\n'), usage: res.usage, sid: res.session_id, cont: CONTINUATION.test(out) };
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
const isPass = t => /^(pass[\s.!?,;:]*)?$/i.test(t); // an empty reply counts as quiet too
const log = row => fs.appendFileSync(path.join(dir, 'log.jsonl'), JSON.stringify(row) + '\n');
const say = (head, body = '') => { fs.appendFileSync(path.join(dir, 'transcript.txt'), `--- ${head}\n${body && body + '\n'}\n`); console.log(`--- ${head}\n${body && body + '\n'}`); };
const queue = []; let seq = 0; // pending events, earliest first: {t (ms), kind: 'checkin'|'post'|'oracle', ...}
const when = (t, e) => { queue.push({ t, seq: seq++, ...e }); queue.sort((a, b) => a.t - b.t || a.seq - b.seq); };
const awake = (n, t) => { const d = new Date(t), h = d.getHours() + d.getMinutes() / 60, [s, e] = sleep[n], wraps = s > e; return (wraps ? h >= s || h < e : h >= s && h < e) ? d.setHours(0, 0, 0, 0) + (e + (wraps && h >= s ? 24 : 0)) * 60 * MIN : +t; }; // a time in n's sleep window (it may wrap midnight, or not: a night worker sleeps by day) moves to n's wake time
function sched(n, t) { // n's next check-in; an earlier pending one is kept, not stacked
  t = awake(n, t); const i = queue.findIndex(e => e.kind === 'checkin' && e.who === n);
  if (i >= 0) { if (queue[i].t <= t) return; queue.splice(i, 1); }
  when(t, { kind: 'checkin', who: n });
}
const reactions = [], seenR = {}; // REACT: {who, emoji, to (index in convo), at}, and how many each agent has been shown
const REACT_RE = /^react\s+([\p{Extended_Pictographic}\uFE0F\u200D\u{1F3FB}-\u{1F3FF}\s]{1,16})$/iu; // a reply of only REACT and a short emoji string
const waiting = new Set(), ans = {}; // agents with a notification check-in pending since their first unread message; per agent: Claude's private answers not yet shown {at, s}
const unread = n => convo.slice(seen[n] ?? 0).some(m => m.who !== n) || ans[n]?.length > 0;
// n opens the first unread message after one log-normal delay, drawn when nothing was unread before; later messages don't redraw it. For an agent finishing a reply the first unread message is the earliest one posted while it typed, but it could not open it before it stopped typing, so the delay runs from now.
const notify = n => { if (waiting.has(n)) return; waiting.add(n); sched(n, +clock + Math.exp(NOTIFY.mu + NOTIFY.sigma * randn()) * MIN); };
// The phone screen: a few earlier messages, then everything from index `from` on (own messages marked "(you)"), plus extra {at, s} lines (reactions, Claude's answers) among the new ones; '(new)' between them when both exist.
function screen(n, from, extra = []) {
  const mark = m => m.who === n ? `\u2014 ${n} (you), ${stamp(m.at)}\n${m.text}` : line(m), old = convo.slice(Math.max(0, from - RECENT), from).map(mark),
    nu = [...convo.slice(from).map(m => ({ at: m.at, s: mark(m) })), ...extra].sort((a, b) => a.at - b.at).map(x => x.s);
  return [...old, ...(old.length && nu.length ? ['(new)'] : []), ...nu].join('\n\n');
}
async function checkin(n) {
  const news = lines[n] && clock - since[n] >= REFRESH_HOURS * 60 * MIN ? await refresh(n) : ''; // what has happened to n since its last refresh
  waiting.delete(n);
  const t = clock, firstShown = seen[n] ?? 0, fresh = convo.slice(firstShown).filter(m => m.who !== n), now = `${n}'s phone, ${stamp(t)}`;
  const extra = [...(ans[n] ?? []), ...reactions.slice(seenR[n] ?? 0).filter(x => x.who !== n).map(x => ({ at: x.at, s: `(${x.who} reacted ${x.emoji} to ${convo[x.to].who === n ? 'your' : convo[x.to].who + "'s"} ${hm(convo[x.to].at)} message)` }))];
  const readWords = fresh.reduce((s, m) => s + words(m.text), 0) + (ans[n] ?? []).reduce((s, a) => s + words(a.s), 0); ans[n] = []; // reading time: what is new from others
  const chat = screen(n, firstShown, extra), user = `(${now}.${n in looked ? ` You last looked ${stamp(looked[n])}.` : ''})` + (news ? `\n\nSince you last looked: ${news}` : '') + `\n\n${chat || '(nothing in the chat yet)'}` + (n === NAMES[0] && !(n in looked) ? `\n\n(You've opened the chat to send something.)` : '') /* hard-coded: the opener's first look says why they picked up the phone (the design has them open the chat; without this, Sonnet openers passed on an empty chat for 3 days) */ + (n in session && !fresh.length && !extra.length ? '\n\n(Nothing new since you last looked.)' : '');
  const j = await turn(n, user), text = j.text.trim();
  seen[n] = convo.length; seenR[n] = reactions.length; looked[n] = t;
  const keep = () => { session[n] = j.sid; }; // only a check-in that posts something is kept as the agent's session: a PASS (or reaction, or failed turn) fork is discarded, so a history of looking and staying quiet doesn't build up and make quiet the habit (it did: after a few PASSes agents passed on everything). The header's 'You last looked' and the phone screen still show what was seen.
  const meta = { usage: j.usage, user, argv: mkArgv(briefFor(n)) };
  if (j.cont) { log({ who: n, failed: 'continuation', text, posted: false, at: iso(t), checkin: iso(t), ...meta }); return sched(n, +t + rf(OFFLINE_MIN) * MIN); } // not posted; like a PASS for scheduling
  const to = convo.findLastIndex(m => m.who !== n), emoji = REACT && to >= firstShown && text.match(REACT_RE)?.[1].trim(); // a reaction needs a message first shown now
  if (emoji) { // a reaction goes on the latest message from someone else, shown to n at this check-in: no notifications, and the agent goes quiet like after a PASS
    reactions.push({ who: n, emoji, to, at: t });
    log({ who: n, react: emoji, to, posted: false, at: iso(t), checkin: iso(t), ...meta }); say(`${stamp(t)}, ${n} reacted ${emoji} to ${convo[to].who}'s ${hm(convo[to].at)} message`);
    return sched(n, +t + rf(OFFLINE_MIN) * MIN);
  }
  if (isPass(text) || REACT && REACT_RE.test(text)) { // a REACT with nothing new to react to is quiet
    log({ who: n, text, pass: true, posted: false, at: iso(t), checkin: iso(t), ...meta }); return sched(n, +t + rf(OFFLINE_MIN) * MIN); }
  keep(); reply(n, splitReply(text), +t + readWords / READ_WPM * MIN, t, meta, true);
}
const ATT = /^\[(file|photo|link)(:[^\]]*)?\]$/i; // an attachment line: [file: name.ext], [photo], [photo: what it shows], [link: what it is]
const BULLET = /^\s*([-*\u2022]|\d+[.)])\s/, joins = (a, p) => !ATT.test(p) && !ATT.test(a) && (a.endsWith(':') || p === '---' || /(^|\n)---$/.test(a) || p.split('\n').every(l => BULLET.test(l))); // p belongs with the part a before it
const splitReply = text => { const parts = text.replace(/^[ \t]*(\[(?:file|photo|link)(?::[^\]\n]*)?\])[ \t]*$/gim, '\n\n$1\n\n').split(/\n\s*\n/).map(p => p.trim()).filter(Boolean).reduce((o, p) => { if (o.length && joins(o.at(-1), p)) o[o.length - 1] += '\n\n' + p; else o.push(p); return o; }, []), k = ORACLE ? parts.findIndex(p => ASK.test(p)) : -1; return k >= 0 ? [...parts.slice(0, k), parts.slice(k).join('\n\n')] : parts; }; // the @claude question runs to the end of the reply
function reply(n, parts, at, t, meta, first) { // queue the messages of n's reply, each posted after its own typing time; the first one of a fresh reply carries the draft to re-check
  busy[n] = parts.length;
  parts.forEach((p, i) => when(at += words(p) / typeWpm[n] * MIN, { kind: 'post', who: n, text: p, checkin: t, ...(i === 0 && { meta, ...(first && { draft: parts.join('\n\n') }) }) }));
}
const done = n => { sched(n, +clock + rf(OFFLINE_MIN) * MIN); if (unread(n)) notify(n); }; // finished a reply (or dropped it): next spontaneous check-in, and a check-in for what came meanwhile
// Re-check before a reply's first message posts: n sees what others posted since its check-in and answers SEND (the draft unchanged), PASS or the message to send instead. Reading the new messages adds no time (they showed up as it typed). Only the first message triggers it, and only once per reply, to bound cost. A changed reply is typed again from now (design choice: an unchanged one (SEND) has already been typed, so it posts on schedule). Returns true if e is not to be posted now (dropped, or requeued).
async function recheck(e) {
  const n = e.who, user = `(${n}'s phone, ${stamp(clock)}.)\n\n${screen(n, seen[n])}\n\n\u2014 ${n} (you, not sent yet)\n${e.draft}\n\n(Your message isn't sent yet. SEND sends it, PASS deletes it, or type what you send instead.)`; // the crossed messages and the unsent draft on one screen
  const j = await turn(n, user), text = /^send[\s.!?,;:]*$/i.test(j.text.trim()) ? e.draft : j.text.trim(), parts = isPass(text) || j.cont ? [] : splitReply(text); // SEND: the draft, unchanged
  session[n] = j.sid; seen[n] = convo.length; // the fork whose answer was posted or passed is the one kept
  e.meta = { ...e.meta, draft: e.draft, recheck: { user, usage: j.usage } };
  if (parts.join('\n\n') === e.draft) return false;
  for (let i = queue.length; i--;) if (queue[i].kind === 'post' && queue[i].who === n) queue.splice(i, 1);
  if (parts.length) reply(n, parts, +clock, e.checkin, e.meta);
  else { log({ who: n, text, ...(j.cont ? { failed: 'continuation' } : { pass: true }), posted: false, at: iso(clock), checkin: iso(new Date(e.checkin)), ...e.meta }); busy[n] = 0; done(n); }
  return true;
}
const ASK = /^\s*@claude\b[:,]?\s*([\s\S]+)/im; // everything after @claude, across lines
async function posted(e) {
  if (e.draft && convo.slice(seen[e.who]).some(m => m.who !== e.who) && await recheck(e)) return;
  convo.push({ who: e.who, text: e.text, at: clock });
  log({ who: e.who, text: e.text, ...(ATT.test(e.text) && { attachment: true }), posted: true, at: iso(clock), checkin: iso(new Date(e.checkin)), ...e.meta });
  say(`${stamp(clock)}, ${e.who}`, e.text);
  const others = NAMES.filter(n => n !== e.who);
  others.filter(n => !busy[n]).forEach(notify);
  if (!--busy[e.who]) done(e.who); // done typing: sees what came meanwhile
  const q = ORACLE && e.text.match(ASK)?.[1].trim();
  if (q) try { const t0 = Date.now(), o = await askOracle(e.who, q); when(+clock + Date.now() - t0, { kind: 'oracle', who: e.who, text: o.text, question: q, usage: o.usage }); } // answer lands after the real duration of the call
  catch (x) { console.error('oracle error:', x.message); log({ who: 'Claude', oracle: true, question: q, error: x.message }); }
}
// Private lines. The generator prompt is a design choice: it asks for lives, not chat behaviour, and for varied, ordinary circumstances because without that it kept choosing the same ones (a broken boiler in 6 of 12 runs, a 10K in 7 of 12). (It once also said "specific"; that was dropped: it is not needed for variety and pushed the details into postcodes and named cafes.)
const GEN = `${ENV_NOTE} You write short background details about characters for a story.`, FORM = "in the second person ('You ...'). Choose varied, ordinary circumstances (place, occupation, what is going on) rather than stock ones. Describe the life, not how you behave in the chat.";
const cast = full => `These people are in a ${CHAT}: ${list(NAMES)}. ${BRIEF || 'They are friends.'}${full && TOPIC ? ` ${NAMES[0]} has this on their mind: ${TOPIC}` : ''}${full ? NAMES.filter(n => SECRETS[n]).map(n => ` ${n} already has this going on: ${SECRETS[n]} (Nothing in the setting or ${n}'s line may restate it.)`).join('') : ''}`; // the daily refresh gets no topic or secrets
const gen = (input, what) => claude(mkArgv(GEN), input).catch(e => { console.error(what, e.message); process.exit(1); });
log({ config_dir: env.CLAUDE_CONFIG_DIR }); // kept after the run: the CLI's session files show what the models saw
const twice = async (f, what) => { for (let i = 0; i < 2; i++) { const r = await f(); if (r) return r; console.error(what, i ? 'unusable again, giving up' : 'unusable, retrying'); } process.exit(1); }; // the generator must give every line: one retry, then fail the run (never run with empty lines)
if (PRIVATE && process.env.LINES_FROM) { // the setting, day-0 lines and any other fields come from an earlier run's first private_lines row: arms of one seed share a world
  const { usage, ...row } = fs.readFileSync(path.join(process.env.LINES_FROM, 'log.jsonl'), 'utf8').split('\n').filter(Boolean).map(l => JSON.parse(l)).find(r => r.private_lines && r.setting);
  setting = row.setting; Object.assign(lines, row.private_lines); Object.assign(sleep, row.sleep); // earlier runs have no sleeping hours: those keep the drawn ones
  if (!NAMES.every(n => lines[n])) { console.error('LINES_FROM has no line for', NAMES.filter(n => !lines[n]).join(', ')); process.exit(1); }
  log({ ...row, lines_from: process.env.LINES_FROM });
} else if (PRIVATE) { const generated = {}; // one call: the shared setting and a line per person
  const j = await twice(async () => { const j = await gen(`${cast(true)}\n\nFirst write one line starting "Setting:": a few sentences in the second person for ${NAMES.length > 2 ? 'the whole group' : 'both of them'}, saying where you ${NAMES.length > 2 ? 'all ' : 'both '}live (a real or plausible town, city or area), how you know each other and what you ${NAMES.length > 2 ? 'all ' : 'both '}already know about each other, fitting the situation; if the situation implies you have been in touch before, also what you last talked about. Then for each of ${list(NAMES)}, one line starting with their name and a colon, about their life this week, ${FORM} Each line must agree with the setting (the same town or area, the same way of knowing each other). Then for each of them a line starting with their name, the word "sleeps" and a colon, with the hours they usually sleep as HH:MM-HH:MM, following from their life. Reply with only these lines.`, 'private lines:');
  // Labelled lines, not JSON: free text inside model-written JSON broke parsing (raw line breaks, unescaped quotes).
  const field = k => j.text.match(new RegExp(`^\\W*${k}[*_\\s]*:[*_\\s]*(.+)$`, 'im'))?.[1].trim();
  setting = field('Setting'); for (const n of NAMES) { lines[n] = field(n); const h = field(`${n} sleeps`)?.match(/(\d{1,2})(?::(\d\d))?\s*(?:-|\u2013|to)\s*(\d{1,2})(?::(\d\d))?/); if (h) generated[n] = [+h[1] + +(h[2] ?? 0) / 60, +h[3] + +(h[4] ?? 0) / 60]; }
  return setting && NAMES.every(n => lines[n] && generated[n]) && j; }, 'private lines:');
  Object.assign(sleep, generated); log({ private_lines: lines, setting, sleep: generated, usage: j.usage });
}
if (process.env.GEN_ONLY === '1') { console.log('Generated only. Saved log.jsonl in', dir); process.exit(0); }
const REFRESH_HOURS = 2; // in-story hours between a person's refreshes of what has happened to them: design parameter, unsourced (short enough that a person picking up their phone after a few hours has had something happen since, which a 6-hour gap often didn't; long enough that a back-and-forth, minutes apart, is not interrupted by new events)
const since = Object.fromEntries(NAMES.map(n => [n, START])); // per person: the in-story time of their last refresh
const full = d => `${WD[d.getDay()]} ${iso(d).slice(0, 10)} ${hm(d)}`;
async function refresh(n) { // what has happened to n since its last refresh; n's day-0 line stays as their identity. Returns the text, which opens the check-in turn.
  const from = since[n], chat = convo.filter(m => m.at > from); since[n] = clock;
  const j = await twice(async () => { const j = await gen(`${cast(false)}\nSetting: ${setting}\n\nIt is now ${full(clock)}. ${n}'s life (fixed): ${lines[n]}${events[n] ? `\nWhat was going on with ${n} on ${full(from)} (background: how things stood then): ${events[n]}` : ''}\n\n${chat.length ? `What was posted in the chat since ${stamp(from)}:\n${chat.map(line).join('\n\n')}\n\n` : ''}Write what has happened to ${n} since ${stamp(from)}, in the second person ('You ...'): how the things ${n} said they would do outside the chat went, what has happened since, and what is different now from then: what actually happened, in two or three short sentences, not how ${n} feels about it. Keep where ${n} lives and their occupation as in their life. Reply with only this.`, `events ${n}:`); return j.text.trim() && j; }, `events ${n}:`);
  events[n] = j.text.trim(); log({ private_lines: { [n]: events[n] }, day: iso(clock).slice(0, 10), at: iso(clock), usage: j.usage });
  return events[n];
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

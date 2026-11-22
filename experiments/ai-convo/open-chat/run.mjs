// Agents (Haiku by default) talk to each other through the `claude -p` CLI (no HTTP API). Each agent is a saved CLI session that holds everything it has read and written: every check-in forks the agent's session (--resume <id> --fork-session) and the fork is kept as its session only when the look ended in a posted reply. A look that ends quiet (PASS, polish DROP, REACT, failed turn) is not kept: the session stays as it was and the next screen starts at the first message the session has not been shown, so a run of PASSes never builds up in the agent's own history (Haiku copied it: one agent passed 7 looks in a row) and nothing it read is lost. The system prompt is NOTE + BRIEF (which starts "You are <name> (<age, gender, role>).") and nothing else.
// What reaches the model: the CLI's one-line identity ("You are a Claude agent, built on Anthropic's Claude Agent SDK."), the brief, and the CLI's fixed "# Environment" note (temp cwd, platform, shell, date), which can't be removed without CLAUDE_CODE_SIMPLE (that needs an API key). A temp cwd outside any git repo + a fresh CLAUDE_CONFIG_DIR keep everything else out. NOTE, sent first, tells the model to disregard that note (tested: without it, agents act like workers waiting for a coding task). Agents have no tools: with WebFetch they tried to look things up (venues, hours), failed, and said so ("I can't book from here", "I only have a web lookup tool"), which blind judges named as the main tell. Replies are capped at 4000 tokens (CLAUDE_CODE_MAX_OUTPUT_TOKENS; hard-coded design setting): at 1000, runaway replies hit the cap and the CLI injected "Output token limit hit. Resume directly...", which claude() joined to the reply; a turn whose stream shows that injection is a failed turn: not posted, logged {who, failed: 'continuation'} and treated as a PASS for scheduling. Agent and generator calls use `--effort low` (hard-coded design setting; env EFFORT=<level> overrides it, EFFORT=default omits the flag to compare) and `--system-prompt-snapshot off`: the CLI otherwise keeps a session's first system prompt on every resume and fork, so the daily private-line refresh never reached the model. CLAUDE_CODE_DISABLE_ATTACHMENTS=1 stops the CLI adding its "<total_tokens>15000000 tokens left</total_tokens>" reminder to every turn (the model-identity line, the date and the environment note, including its curl and untrusted-file advice, cannot be turned off, nor can the SDK identity line: the CLI picks it when run non-interactively). Each run keeps its CLAUDE_CONFIG_DIR (the CLI's session files, to audit what the models saw) and logs its path in the first row {config_dir}.
// Event-driven clock: no global steps. Every agent has its own next check-in time, and the loop takes the earliest pending event (a check-in, a message finishing being typed, an @claude answer arriving), moves the in-story clock to it and handles it. At a check-in the agent is shown its phone, the time and when it last looked ("(Jo's phone, Wed 17:03. You last looked Wed 12:10.)", plus "The others are probably asleep." when everyone else is inside their sleeping hours), any "Since you last looked: ..." life events, then the phone screen: the last RECENT messages it had already seen, then what is new, each as header line "\u2014 Name, Sun 19:42" and the text (a line "(\u{1F44D} 2)" under a message that has reactions: the emoji and how many, never who or as a line to copy), its own messages as "\u2014 Jo (you), Sun 19:42" (on its first look, the whole conversation). Its reply is posted when finished: check-in time + time to read the new messages + time to type it (each agent has its own typing speed). A reply may be several messages (split on blank lines, except that a part ending with ':', a list (lines starting -, *, \u2022 or a number and . or )) and a lone --- stay joined with the neighbouring part), each posted after its own typing time. Just before a reply's first message posts, an agent who sees that others posted since its check-in is shown them (in a real app they arrive while you type) on the phone screen (the recent chat, own messages marked "(you)") followed by its own unsent draft under a header like theirs ("\u2014 Tom (you, not sent yet)") and may send it unchanged with SEND, replace it by writing a new message, or drop it with PASS (one re-check per reply; the draft is always re-checked, because telling whether a crossed message is a reply to the same thing would need another model call, so crossed replies are rarer but still happen with later parts; the answer replaces the draft; a changed draft gets its own typing time, a SEND posts the draft on schedule; the re-check is a further fork, which becomes the agent's session, so memory holds what was actually posted or passed). Check-ins come from notifications: when an agent goes from nothing unread to something unread, one check-in is scheduled after a single delay from NOTIFY, drawn at the first unread message (Pielot's delay is from the first unread message); later messages while it is pending don't reschedule it (an earlier pending spontaneous check-in is kept). An agent mid-reply is notified once it has posted, if something unread is waiting.
// The cast: one call at the start (the casting call) makes a coherent cast from the situation, however short it is. For each of the PEOPLE people it gives a first name that fits the place, culture and age, "age, gender, role" (every role in the situation goes to exactly one person), how they stand to the others, their life this week (where they live, occupation, what is going on), their usual sleeping hours, how they text in this chat (1-2 plain sentences) and six example texts; and once a shared setting (where everyone lives, how they know each other, what they last talked about when the situation implies earlier contact). Names, roles and styles are not fixed lists: the cast is the only source of them, so there is no run without it. Internally a person is a slot (the first generated name is slot 1, which gets the topic); the viewer's Start form names people Maya, Tom, Jo, Sam, Priya, Dan, Ellie, Kofi, and SECRETS given for the default name of slot k go to person k, whatever the cast calls them (default names inside a topic or secret text are replaced the same way). The line, setting and relations go into each system prompt; the day-0 line is the person's fixed identity. Logged in the first cast row {private_lines (the life lines), setting, names, cast: {name: {who, knows, texts, ex}}, sleep, opener, situation, topic}. LINES_FROM=<earlier run folder> loads that row instead of generating (arms of one seed share a world; the run needs the same PEOPLE); GEN_ONLY=1 runs only the casting call, writes the folder with that row and exits.
// Life moves with elapsed time, not calendar days: at an unprompted check-in, once at least REFRESH_HOURS of in-story time (times a per-refresh factor in LOOK_FACTOR) have passed since the person's last refresh (their first is a random part of REFRESH_HOURS before START), one call generates what has happened to them since, from the cast without TOPIC and SECRETS, the identity, the weekday, date and time, what was going on at the last refresh (background only) and everyone's messages since then (asking how the things they said they'd do went). It gives only a "Small thing:" line (the one small thing of the day that connects to these people or what they share, or "nothing": a first live run got foxes and muffins with no tie to the group, and every unprompted look passed, the last 10 of everyone's are passed back so kinds and names don't repeat) and the "Day:". The day is not in the system prompt: it opens that check-in's user turn, after the phone header, as a block marked as not on the phone (log row {private_lines: {name: events}, day, at, small}). There is no reason for the look and nobody is told what to bring up: the agent sees the whole phone screen and decides, and a question nobody has answered is just visible on it. An unprompted look whose Small thing is "nothing", with nothing new on the phone, is skipped (no turn, no row). Only the opener (slot 1's first look) has a cue, "(You've opened the chat to <the topic, or the casting call's "opens with:" line>.)": the topic is in no system prompt. The life generator is asked for ordinary, mostly neutral or good days, no medical drama, no continuing earlier problems, and the result of anything they said they'd do. Reactions are on by default (REACT=0 turns them off): an agent may reply with just REACT and an emoji (REACT \u{1F44D}), meant for a message a reaction answers (a confirmation, news): it is not posted but attached to the latest message from someone else, which must be one first shown at this very check-in (never its own, never one already seen: with nothing new, a REACT is just quiet and is logged as a PASS), notifies nobody, counts like a PASS for scheduling (log row {react, to: index of that message, posted: false}), and shows to everyone as a count under the message. Agents don't check in while asleep (their generated sleeping hours): such a check-in moves to their wake time. Slot 1 opens at START; the others first look at some point in FIRST_SPREAD_MIN after it. Nobody is told to take turns and nothing makes the days pass: a quiet chat is just agents who are all offline. STATELESS=1 (default off, the other arm): no saved sessions; each call is a fresh one with the last 30 chat messages and the previous three event paragraphs.
// A reply line of the form [file: name.ext], [photo], [photo: what it shows] or [link: what it is] on its own posts as a separate attachment message (no real files; log row attachment:true). The relay note (NOTE) says an agent may reply just PASS, which nobody sees (and, unless REACT=0, REACT), and how to send a file, photo or link. The @claude oracle gets only ENV_NOTE, the disregard-the-environment-note part (it saw PASS in NOTE and answered "PASS"). The note is not in the chat prompts, where agents took PASS up as a word. Ends at MESSAGES posted messages (Claude's private answers don't count; replies already being typed still post, no new check-ins start) or when the in-story clock passes START + DAYS days; the last log row is {end: 'limit'|'date', at}.
// Voice is applied once, by the rewrite pass (all hard-coded design choices): the agent writes content from NOTE, the cast and its own "How you text: ..." description (no example texts); polish() then sends the reply with the person's description, their example texts, their last 4 posted messages and the last 12 chat messages to one stateless call that rewrites it as that person would type it (habits show in some texts, not every one; not starting or ending like their recent texts; no names or @ unless it would be unclear who is meant), or answers DROP (then the reply is a PASS). NOTE (prompts.mjs, shared with replay.mjs and score.mjs) tells everyone what texting is like (short, fragments, no restated plans, no sign-offs), that a question put to them gets answered and that if they opened the chat to say something they say it, and that they know their own life and can act on their phone. The final non-empty line of a reply decides: PASS or REACT plus an emoji there is that decision, whatever narration comes before it. The agent's saved session is edited to hold the polished text (amend(): the last assistant message in the fork's CLI session file is replaced, so memory holds exactly what was posted, not the longer draft; a DROP is remembered as PASS). Log rows: `raw` is the agent's own reply, `polish` the polish call's usage, a DROP is a PASS row with `polishDrop: true`; `draft` stays the text before the re-check (so now the polished text).
// In-story clock: starts at 19:00 today (env START='YYYY-MM-DDTHH:MM' overrides).
// Run: [MODEL=sonnet] [TOPIC='...'] [PEOPLE=2-8] [ORACLE=1] [EFFORT=low|default|...] [REACT=0] [STATELESS=1] [LINES_FROM=<run folder>] [GEN_ONLY=1] [SECRETS='{"Maya": "..."}'] [START=...] [DAYS=3] [MESSAGES=120] node run.mjs [messages] [brief]. Output: runs/<timestamp>/{transcript.txt,log.jsonl}: log.jsonl starts with {config_dir} and has a row per posted message and per PASS (posted: true|false, `at` = post time, or check-in time for a PASS, `checkin` = the check-in it came from; usage/user/argv on the first message of a check-in; a failed turn is {who, failed: 'continuation', posted: false, ...}), oracle rows (posted: false, private: true, to), and the end row. A recheck (SEND or a rewrite or PASS) adds `draft` (the reply as first written) and `recheck` ({user, usage}) to the reply's first row; a draft dropped at the re-check is logged as a PASS row with the draft. transcript.txt has posted messages, private Claude answers ("Claude \u2192 Maya (private)") and the end.
import fs from 'fs'; import os from 'os'; import path from 'path'; import { spawn } from 'child_process'; import { ENV_NOTE, noteFor, topicCue, POLISH_SYS, polishAsk, lastLine, isPass, REACT_RE } from './prompts.mjs';
// Timing (all in-story).
// Typing on a phone: mean 36.17 words/min, SD 13.22 (Palin, Feit, Kim, Kristensson, Oulasvirta, "How do People Type on Mobile Devices? Observations from a Study with 37,000 Volunteers", MobileHCI 2019, https://doi.org/10.1145/3338286.3340120). It was a copy-typing task, so composing a reply may be slower. Drawn once per agent from a normal truncated below at TYPE_WPM_FLOOR.
const TYPE_WPM = [36.17, 13.22], TYPE_WPM_FLOOR = 10; // floor: design parameter, unsourced (about the mean minus 2 SD)
// Silent reading: 238 words/min for non-fiction (Brysbaert, "How many words do we read per minute?", Journal of Memory and Language 109, 104047, 2019, https://doi.org/10.1016/j.jml.2019.104047). Measured on continuous text.
const READ_WPM = 238;
// Delay from a message arriving to the user opening it: log-normal with median 6.15 min and a quarter opened within 60 s (Pielot, de Oliveira, Kwak, Oliver, "Didn't You See My Message? Predicting Attentiveness to Mobile Instant Messages", CHI 2014, https://doi.org/10.1145/2556288.2556973). Hence mu = ln 6.15, sigma = ln(6.15/1)/0.6745 (0.6745 = the 75th-percentile z).
const NOTIFY = { mu: Math.log(6.15), sigma: Math.log(6.15) / 0.6745 };
// A person looks at the chat unprompted when something has happened in their life (their next refresh, REFRESH_HOURS after the last), not at random: a glance at a quiet chat with nothing new in it was answered PASS almost every time (as a real person would), and those glances filled the agents' histories with PASSes.
// The look comes LOOK_FACTOR (drawn once per refresh, per person) times REFRESH_HOURS after their last refresh, and at least 10-90 minutes after now, so people don't all look together or straight after posting.
const nextLook = n => sched(n, Math.max(+clock + rf([10, 90]) * MIN, +since[n] + lookF[n] * REFRESH_HOURS * 36e5), true);
const LOOK_FACTOR = [0.6, 1.8]; // design parameter, unsourced
const FIRST_SPREAD_MIN = [5, 120]; // minutes after START at which the agents other than slot 1 first look. design parameter, unsourced (TODO: source)
// NOTE is sent as part of the system prompt but left out of log.jsonl, which logs only BRIEF.
const REACT = process.env.REACT !== '0'; // on by default; =0 for comparison
const NOTE = noteFor(REACT); // prompts.mjs
const list = a => a.length < 2 ? a.join('') : a.slice(0, -1).join(', ') + ' and ' + a.at(-1);
const DEFAULTS = ['Maya', 'Tom', 'Jo', 'Sam', 'Priya', 'Dan', 'Ellie', 'Kofi']; // the viewer's Start form names people like this (its secrets are "Name: secret"): the cast does not use these, they only say which slot a secret (or a name inside a topic or secret) belongs to
const N = Math.min(8, Math.max(2, +process.env.PEOPLE || 4)), CHAT = N > 2 ? 'group chat' : 'chat'; // two people: a 1:1 chat, not a group
const BRIEF = process.argv[3]; // optional: who these people are to each other (e.g. colleagues, siblings); with none, friends
const TOPIC_IN = process.env.TOPIC; // optional discussion point: only slot 1 gets it, in the opener's first turn (not in any system prompt), so it comes up the way a friend would raise it
const SECRETS_IN = JSON.parse(process.env.SECRETS || '{}'); // optional {Maya?, Tom?, ...}: a fact only that slot's agent is told (the default name of slot k)
const slotName = (text, to) => text.replace(new RegExp(`\\b(${DEFAULTS.slice(0, N).join('|')})\\b`, 'g'), m => to(DEFAULTS.indexOf(m))); // default names in a text -> to(slot)
for (const k of Object.keys(SECRETS_IN)) if (!DEFAULTS.slice(0, N).includes(k)) { console.error(`SECRETS: "${k}" is not one of the first ${N} people (${DEFAULTS.slice(0, N).join(', ')})`); process.exit(1); }
// Optional (ORACLE=1): agents can ask Claude the way a person would. A line starting @claude goes to that agent's own Claude chat (one saved session per agent, so it remembers their earlier questions), which can search the web and open pages. Claude sees only the question, not the group chat; its answer goes only to the asker: it shows up in their next check-in as "(Claude replied to you:)" and they decide what to share, in their own words. The asker gets a check-in after the usual attention delay, since they are waiting for it. ORACLE_MODEL picks its model (default sonnet).
const ORACLE = process.env.ORACLE === '1', ORACLE_MODEL = process.env.ORACLE_MODEL || 'sonnet';
const ORACLE_LINE = ' You can also ask Claude, an AI assistant that can search the web and read pages: start a line with @claude and your question. Claude sees only your question, not this chat, and remembers what you asked it before. Its answer comes back to you alone.';
// The cast (all generated, see the casting call below). NAMES is in slot order; TOPIC and SECRETS (by name) get their default names replaced once the names exist.
let NAMES = [], TOPIC = TOPIC_IN, SECRETS = {}, setting = '', opener = ''; // the opener: what NAMES[0] picks up the phone to send first when there is no TOPIC
const lines = {}, events = {}, who = {}, knows = {}, how = {}, ex = {}; // per person: the day-0 life line (fixed); the latest generated events (background for the next refresh, shown to the agent in its check-in); "age, gender, role"; how they stand to the others; how they text and example texts (the rewrite pass uses the examples, the agent only the description)
// System prompt: who you are, the chat, the setting and how you stand to the others, the oracle line, your life (fixed day-0 identity), your secret, how you text. The topic is not here (opener's first turn).
const briefFor = n => `You are ${n} (${who[n]}). This is a ${CHAT} on your phone with ${list(NAMES.filter(x => x !== n))}. ${setting} ${knows[n]}` + (ORACLE ? ORACLE_LINE : '') + ` What's going on with you at the moment: ${lines[n]}` + (SECRETS[n] ? ` Only you know this, at least at first: ${SECRETS[n]}` : '') + ` How you text: ${how[n]}`;
const MODEL = process.env.MODEL || 'haiku', EFFORT = process.env.EFFORT || 'low';
const MESSAGES = +(process.env.MESSAGES || process.argv[2]) || 120, DAYS = +process.env.DAYS || 3, convo = [], seen = {}, looked = {};
const WD = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const p2 = x => String(x).padStart(2, '0'), hm = d => `${p2(d.getHours())}:${p2(d.getMinutes())}`, rf = ([a, b]) => a + Math.random() * (b - a), randn = () => Math.sqrt(-2 * Math.log(1 - Math.random())) * Math.cos(2 * Math.PI * Math.random()), words = t => t.trim().split(/\s+/).length;
const stamp = d => `${WD[d.getDay()]} ${hm(d)}`, iso = d => `${d.getFullYear()}-${p2(d.getMonth() + 1)}-${p2(d.getDate())}T${hm(d)}`, MIN = 60000;
const START = process.env.START ? new Date(process.env.START) : new Date(new Date().setHours(19, 0, 0, 0)), END = new Date(+START + DAYS * 864e5);
let clock = START;
const typeWpm = {}, sleep = {}, busy = {}; // per agent: own typing speed, [sleep start, wake] hours (from the cast), replies still being typed
const line = m => `\u2014 ${m.who}, ${stamp(m.at)}\n${m.text}`; // header line, then the text: no "Name: text" pattern for agents to copy
const STATELESS = process.env.STATELESS === '1'; // opt-in arm: no saved sessions, each call is fresh
const RECENT = STATELESS ? 30 : 6; // messages of earlier chat shown above the new ones: design parameter (compact, enough to see one's own last few messages; a stateless agent has no other memory, so it gets 30)
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
const session = {}; // per agent: the CLI session id of its last check-in that was kept (absent before its first)
const turn = (n, user) => claude([...mkArgv(`${NOTE} ${briefFor(n)}`), ...(session[n] && !STATELESS ? ['--resume', session[n], '--fork-session'] : [])], user).catch(e => { console.error(`agent ${n}:`, e.message); process.exit(1); });
// Memory holds what was posted: the fork's CLI session file gets the posted text in place of the agent's own reply (P2). Without it the agent's history would hold longer drafts than anyone saw and it would copy them. Stateless runs keep no sessions.
function amend(sid, text) {
  if (STATELESS) return;
  const root = path.join(env.CLAUDE_CONFIG_DIR, 'projects'), f = fs.readdirSync(root).map(d => path.join(root, d, sid + '.jsonl')).find(fs.existsSync);
  if (!f) throw new Error('no session file for ' + sid);
  const rows = fs.readFileSync(f, 'utf8').split('\n').filter(Boolean).map(l => JSON.parse(l)), i = rows.findLastIndex(r => r.type === 'assistant' && r.message.content.some(c => c.type === 'text'));
  let done = false; rows[i].message.content = rows[i].message.content.flatMap(c => c.type !== 'text' ? [c] : done ? [] : (done = true, [{ ...c, text }]));
  fs.writeFileSync(f, rows.map(r => JSON.stringify(r)).join('\n') + '\n');
}
// The rewrite pass: one stateless call turns the agent's draft into the text that person would really type, or DROP.
async function polish(n, draft) {
  const last = convo.slice(-12).map(m => m.who === n ? `\u2014 ${n} (you), ${stamp(m.at)}\n${m.text}` : line(m)).join('\n\n') || '(nothing yet)', mine = convo.filter(m => m.who === n).slice(-4).map(m => m.text);
  const j = await claude([...mkArgv(POLISH_SYS), '--no-session-persistence'], polishAsk(n, { how: how[n], ex: ex[n] }, last, draft, mine)).catch(e => { console.error(`polish ${n}:`, e.message); process.exit(1); });
  const text = j.text.trim(); if (!text) { console.error(`polish ${n}: empty answer`); process.exit(1); }
  return { text: /^drop[\s.!?]*$/i.test(text) ? '' : text, usage: j.usage }; // DROP = PASS
}
const claudeChat = {}; // per agent: the session id of their own Claude chat
async function askOracle(who, q) {
  const o = await claude(['-p', '--output-format', 'stream-json', '--verbose', '--system-prompt', `${ENV_NOTE} You are Claude, an AI assistant made by Anthropic, chatting with one person. Check facts with web search, and open the pages you rely on instead of going on search snippets. Say plainly when you could not confirm something. Keep answers short and name your sources. The search tool ends its results with a reminder to cite sources: that is part of the tool, so follow it without remarking on it.`,
    '--tools', 'WebSearch,WebFetch', '--allowedTools', 'WebSearch,WebFetch', '--setting-sources', '', '--model', ORACLE_MODEL, ...(claudeChat[who] ? ['--resume', claudeChat[who]] : [])], q);
  claudeChat[who] = o.sid;
  return o;
}
const log = row => fs.appendFileSync(path.join(dir, 'log.jsonl'), JSON.stringify(row) + '\n');
const say = (head, body = '') => { fs.appendFileSync(path.join(dir, 'transcript.txt'), `--- ${head}\n${body && body + '\n'}\n`); console.log(`--- ${head}\n${body && body + '\n'}`); };
const queue = []; let seq = 0; // pending events, earliest first: {t (ms), kind: 'checkin'|'post'|'oracle', ...}
const when = (t, e) => { queue.push({ t, seq: seq++, ...e }); queue.sort((a, b) => a.t - b.t || a.seq - b.seq); };
const WAKE_JITTER_MIN = [-25, 40], wakeJ = {}; // minutes added to a person's wake time, drawn once per person per wake-up (generated sleeping hours come out round: without it many first looks fall on :00/:30): design parameter, unsourced
const awake = (n, t) => { const d = new Date(t), h = d.getHours() + d.getMinutes() / 60, [s, e] = sleep[n], wraps = s > e; if (!(wraps ? h >= s || h < e : h >= s && h < e)) return +t; const w = d.setHours(0, 0, 0, 0) + (e + (wraps && h >= s ? 24 : 0)) * 60 * MIN; return Math.max(+t, w + (wakeJ[n + w] ??= rf(WAKE_JITTER_MIN)) * MIN); }; // a time in n's sleep window (it may wrap midnight, or not: a night worker sleeps by day) moves to n's wake time
function sched(n, t, spont = false) { // n's next check-in (spont: an unprompted look, not caused by a notification); an earlier pending one is kept, not stacked
  t = awake(n, t); const i = queue.findIndex(e => e.kind === 'checkin' && e.who === n);
  if (i >= 0) { if (queue[i].t <= t) return; queue.splice(i, 1); }
  when(t, { kind: 'checkin', who: n, spont });
}
const reactions = []; // REACT: {who, emoji, to (index in convo), at}
const waiting = new Set(), ans = {}; // agents with a notification check-in pending since their first unread message; per agent: Claude's private answers not yet shown {at, s}
const unread = n => convo.slice(seen[n] ?? 0).some(m => m.who !== n) || ans[n]?.length > 0;
// n opens the first unread message after one log-normal delay, drawn when nothing was unread before; later messages don't redraw it. For an agent finishing a reply the first unread message is the earliest one posted while it typed, but it could not open it before it stopped typing, so the delay runs from now.
const notify = n => { if (waiting.has(n)) return; waiting.add(n); sched(n, +clock + Math.exp(NOTIFY.mu + NOTIFY.sigma * randn()) * MIN); };
// The reactions on convo[i] as a line under it, "(\u{1F44D} 2, \u{1F602} 1)": only which emoji and how many, so there is no reaction line to copy.
const tally = i => { const c = {}; reactions.filter(x => x.to === i).forEach(x => c[x.emoji] = (c[x.emoji] ?? 0) + 1); const t = Object.entries(c).map(([e, k]) => `${e} ${k}`).join(', '); return t && `\n(${t})`; };
// The phone screen: a few earlier messages, then everything from index `from` on (own messages marked "(you)"), plus extra {at, s} lines (Claude's answers) among the new ones; '(new)' between them when both exist.
function screen(n, from, extra = []) {
  const mark = m => (m.who === n ? `\u2014 ${n} (you), ${stamp(m.at)}\n${m.text}` : line(m)) + tally(convo.indexOf(m)), old = convo.slice(Math.max(0, from - RECENT), from).map(mark),
    nu = [...convo.slice(from).map(m => ({ at: m.at, s: mark(m) })), ...extra].sort((a, b) => a.at - b.at).map(x => x.s);
  return [...old, ...(old.length && nu.length ? ['(new)'] : []), ...nu].join('\n\n');
}
const NOTHING = /^(nothing|none|n\/a|no\b)/i; // a refresh Small thing that says there is nothing worth sharing
const kept = {}, back = {}; // per agent: index of the first message its saved session has not been shown (a look that ends quiet is not kept, so the screen starts again from here); the session and screen start before the latest reply, for a re-check that withdraws it
async function checkin(n, spont) {
  const r = spont && +clock >= +since[n] + lookF[n] * REFRESH_HOURS * 36e5 ? await refresh(n) : null, news = r?.day ?? ''; // what has happened to n since its last refresh: only at an unprompted look (a notification check-in is for the chat), once that person's look time has come
  waiting.delete(n);
  let reason = ''; // only the opener's first look has one (the topic, or what the cast call says they open with): nobody is told why to look at the chat later, they see the screen and decide
  if (n === NAMES[0] && !(n in looked)) reason = TOPIC ? topicCue(TOPIC) : opener || `send ${N > 2 ? 'the group' : 'them'} something`;
  if (n in looked && !(r && !NOTHING.test(r.small)) && convo.length === seen[n] && !(ans[n] ?? []).length) return nextLook(n); // nothing worth sharing from the day and nothing new on the phone: no look, no turn, no row
  const t = clock, firstShown = seen[n] ?? 0, from = kept[n] ?? firstShown, fresh = convo.slice(firstShown).filter(m => m.who !== n), now = `${n}'s phone, ${stamp(t)}`;
  const extra = ans[n] ?? [], others = NAMES.filter(m => m !== n), late = others.every(m => awake(m, +clock) !== +clock) ? ` ${others.length > 1 ? 'The others are' : `${others[0]} is`} probably asleep.` : ''; // everyone else inside their sleeping hours: the plain fact, so a 04:00 look is seen as one
  const readWords = fresh.reduce((s, m) => s + words(m.text), 0) + (ans[n] ?? []).reduce((s, a) => s + words(a.s), 0), answered = (ans[n] ?? []).length; ans[n] = []; // reading time: what is new from others
  const chat = screen(n, from, extra), user = `(${now}.${n in looked ? ` You last looked ${stamp(looked[n])}.` : ''}${late})` + (STATELESS && hist(n, news).length ? `\n\n[Your last few days, from memory:]\n${hist(n, news).join('\n')}` : '') + (news ? `\n\n[Not on your phone: your own day, which you lived yourself. Nobody sent you this.]\n${news}\n\n[The chat on your screen:]` : '') + `\n\n${chat || '(no messages)'}` + (reason ? `\n\n(You've opened the chat to ${reason}.)` : '');
  const j = await turn(n, user), text = j.text.trim();
  seen[n] = convo.length; looked[n] = t;
  const keep = () => { back[n] = { sid: session[n], from }; session[n] = j.sid; delete kept[n]; }, hush = () => { if (STATELESS || answered) { session[n] = j.sid; delete kept[n]; } else kept[n] = from; }; // a reply that is posted is kept: the fork is the agent's session. A look that ends quiet (PASS, DROP, REACT, failed) is not: the session stays as it was and the next screen starts from `from`, so a run of PASSes never builds up in the agent's own history (it copied it) and nothing it read is lost
  const meta = { usage: j.usage, user, argv: mkArgv(briefFor(n)), ...(reason && { reason }) };
  if (j.cont) { hush(); log({ who: n, failed: 'continuation', text, posted: false, at: iso(t), checkin: iso(t), ...meta }); return nextLook(n); } // not posted; like a PASS for scheduling
  const last = lastLine(text), to = convo.findLastIndex(m => m.who !== n), emoji = REACT && to >= firstShown && last.match(REACT_RE)?.[1].trim(); // a reaction needs a message first shown now
  if (emoji) { // a reaction goes on the latest message from someone else, shown to n at this check-in: no notifications, and the agent goes quiet like after a PASS
    hush(); reactions.push({ who: n, emoji, to, at: t });
    log({ who: n, react: emoji, to, posted: false, at: iso(t), checkin: iso(t), ...meta }); say(`${stamp(t)}, ${n} reacted ${emoji} to ${convo[to].who}'s ${hm(convo[to].at)} message`);
    return nextLook(n);
  }
  if (isPass(text) || REACT && REACT_RE.test(last)) { // a REACT with nothing new to react to is quiet
    hush(); log({ who: n, text, pass: true, posted: false, at: iso(t), checkin: iso(t), ...meta }); return nextLook(n); }
  const p = await polish(n, text);
  const polished = { raw: text, polish: p.usage };
  if (!p.text) { hush(); log({ who: n, text: 'PASS', pass: true, polishDrop: true, posted: false, at: iso(t), checkin: iso(t), ...polished, ...meta }); return nextLook(n); }
  amend(j.sid, p.text); keep(); // memory holds what was posted
  reply(n, splitReply(p.text), +t + readWords / READ_WPM * MIN, t, { ...meta, ...polished }, true);
}
const ATT = /^\[(file|photo|link)(:[^\]]*)?\]$/i; // an attachment line: [file: name.ext], [photo], [photo: what it shows], [link: what it is]
const BULLET = /^\s*([-*\u2022]|\d+[.)])\s/, joins = (a, p) => !ATT.test(p) && !ATT.test(a) && (a.endsWith(':') || p === '---' || /(^|\n)---$/.test(a) || p.split('\n').every(l => BULLET.test(l))); // p belongs with the part a before it
const splitReply = text => { const parts = text.replace(/^[ \t]*(\[(?:file|photo|link)(?::[^\]\n]*)?\])[ \t]*$/gim, '\n\n$1\n\n').split(/\n\s*\n/).map(p => p.trim()).filter(Boolean).reduce((o, p) => { if (o.length && joins(o.at(-1), p)) o[o.length - 1] += '\n\n' + p; else o.push(p); return o; }, []), k = ORACLE ? parts.findIndex(p => ASK.test(p)) : -1; return k >= 0 ? [...parts.slice(0, k), parts.slice(k).join('\n\n')] : parts; }; // the @claude question runs to the end of the reply
function reply(n, parts, at, t, meta, first) { // queue the messages of n's reply, each posted after its own typing time; the first one of a fresh reply carries the draft to re-check
  busy[n] = parts.length;
  parts.forEach((p, i) => when(at += words(p) / typeWpm[n] * MIN, { kind: 'post', who: n, text: p, checkin: t, ...(i === 0 && { meta, ...(first && { draft: parts.join('\n\n') }) }) }));
}
const done = n => { nextLook(n); if (unread(n)) notify(n); }; // finished a reply (or dropped it): next spontaneous check-in, and a check-in for what came meanwhile
// Re-check before a reply's first message posts: n sees what others posted since its check-in and answers SEND (the draft unchanged), PASS or the message to send instead. Reading the new messages adds no time (they showed up as it typed). Only the first message triggers it, and only once per reply, to bound cost. A changed reply is typed again from now (design choice: an unchanged one (SEND) has already been typed, so it posts on schedule). Returns true if e is not to be posted now (dropped, or requeued).
async function recheck(e) {
  const n = e.who, user = `(${n}'s phone, ${stamp(clock)}.)\n\n${screen(n, seen[n])}\n\n\u2014 ${n} (you, not sent yet)\n${e.draft}\n\n(Your message isn't sent yet. SEND sends it, PASS deletes it, or type what you send instead.)`; // the crossed messages and the unsent draft on one screen
  const j = await turn(n, user), answer = j.text.trim(), send = /^send[\s.!?,;:]*$/i.test(lastLine(answer)); let text = send ? e.draft : answer, p; // SEND: the draft, unchanged
  if (!send && !isPass(answer) && !j.cont) { p = await polish(n, answer); text = p.text || 'PASS'; if (p.text) amend(j.sid, text); } // a rewritten answer gets the same polish as a first reply; a DROP is a PASS
  const parts = isPass(text) || j.cont ? [] : splitReply(text);
  if (parts.length) { session[n] = j.sid; delete kept[n]; } else { const b = back[n]; if (b.sid) session[n] = b.sid; else delete session[n]; if (!STATELESS) kept[n] = b.from; } // the fork whose answer is posted is kept; a withdrawn draft is not, and neither is the reply it came from: the session goes back to before this look
  seen[n] = convo.length;
  e.meta = { ...e.meta, draft: e.draft, recheck: { user, usage: j.usage, ...(p && { raw: answer, polish: p.usage }) } };
  if (parts.join('\n\n') === e.draft) return false;
  for (let i = queue.length; i--;) if (queue[i].kind === 'post' && queue[i].who === n) queue.splice(i, 1);
  if (parts.length) reply(n, parts, +clock, e.checkin, e.meta);
  else { log({ who: n, text, ...(j.cont ? { failed: 'continuation' } : { pass: true }), posted: false, at: iso(clock), checkin: iso(new Date(e.checkin)), ...e.meta }); busy[n] = 0; done(n); }
  return true;
}
const ASK = /^\s*@claude\b[:,]?\s*([\s\S]+)/im; // everything after @claude, across lines
async function posted(e) {
  if (e.draft && convo.slice(seen[e.who]).some(m => m.who !== e.who) && await recheck(e)) return;
  if (seen[e.who] === convo.length) seen[e.who]++; // one's own message is never new to oneself
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
// The casting call. The prompt is a design choice: it asks for lives, not chat behaviour (apart from how each person texts), and for ordinary circumstances that fit the situation: asking for "varied rather than stock" ones made night nurses and 4am bus drivers (a night worker means 4am group texts), and without any variety instruction it chose the same ones (a broken boiler in 6 of 12 runs, a 10K in 7 of 12), so only the place is drawn at random.
const GEN = `${ENV_NOTE} You write short background details about characters for a story.`;
const smalls = []; // the small shareable things of everyone's events in this run, so the generator doesn't repeat kinds or names
const fieldOf = (text, k, rest) => text.match(new RegExp(`^\\W*${k}[*_\\s]*:[*_\\s]*(${rest ? '[\\s\\S]+' : '.+'})$`, 'im'))?.[1].trim(); // a labelled line (rest: that line and everything after it)
const gen = (input, what) => claude(mkArgv(GEN), input).catch(e => { console.error(what, e.message); process.exit(1); });
log({ config_dir: env.CLAUDE_CONFIG_DIR, ...(STATELESS && { stateless: true }) }); // kept after the run: the CLI's session files show what the models saw
const twice = async (f, what) => { for (let i = 0; i < 2; i++) { const r = await f(); if (r) return r; console.error(what, i ? 'unusable again, giving up' : 'unusable, retrying'); } process.exit(1); }; // the generator must give every line: one retry, then fail the run (never run with empty lines)
const person = k => `Person ${k + 1}`, PEOPLE_LIST = Array.from({ length: N }, (_, k) => person(k));
const castPrompt = () => `These ${N} people, ${PEOPLE_LIST[0]} to ${PEOPLE_LIST[N - 1]}, are in a ${CHAT}. ${BRIEF || 'They are friends.'}${TOPIC_IN ? ` ${person(0)} has this on their mind: ${slotName(TOPIC_IN, person)}` : ''}${Object.entries(SECRETS_IN).map(([n, t]) => ` ${person(DEFAULTS.indexOf(n))} already has this going on: ${slotName(t, person)} (Nothing in the setting or ${person(DEFAULTS.indexOf(n))}'s lines may restate it.)`).join('')}

Cast them as one coherent group, working from the situation above however short it is. Every role it names (parent, adult child, partner, ex, neighbour, team-mate, ...) goes to exactly one person, and if it is written from one person's side ("my ex", "me and my mum") that person is Person 1, and the lines must agree with each other (the same place, the same way of knowing each other). People in a group of one cohort (old friends, a team, flatmates) text in much the same register as each other; family members can differ.

If the situation doesn't already say where they live, first privately list 12 quite different places in different regions where these people could plausibly live, then use place number ${1 + Math.floor(Math.random() * 12)} (don't print the list).

Reply with only these lines, each on one line, in this order:
First, one line per person: "Person k name:" and a first name (one word) that fits the place, culture and age of that person, all different.
Then one line starting "Setting:": a few sentences in the second person for ${N > 2 ? 'the whole group' : 'both of them'}, saying where you ${N > 2 ? 'all ' : 'both '}live (that place), how you know each other and what you ${N > 2 ? 'all ' : 'both '}already know about each other; if the situation implies you have been in touch before, also what you last talked about, which must be unrelated small talk, not the topic.${TOPIC_IN ? ' If the topic concerns something you share include the facts you all know about it.' : ''}
Then, for each person in turn, these lines, each starting with that person's name from their "Person k name:" line:
"<name> is:" their age, gender and role in this situation, in a few words, e.g. "58, woman, the parent".
"<name> knows:" in the second person ('You ...'), who each of the others is to you and what you know about them, a short sentence each.
"<name> life:" in the second person ('You ...'), where you live, your occupation and what is going on in your life this week. Ordinary circumstances that fit the situation, not unusual ones; the job is one part of the week, not all of it. Describe the life, not how you behave in the chat.
"<name> sleeps:" the hours they usually sleep as HH:MM-HH:MM, following from their life (most people sleep overnight).
"<name> texts:" one or two plain sentences, in the second person, on how you text in this chat with these people: capitals, punctuation, emoji, message length, abbreviations, as follows from your age, role and the group. Use frequency words ("now and then", "mostly") rather than "always"; most people text in a fairly ordinary way.
"<name> examples:" six texts you might send in this chat, separated by " | ", at least half of them plain (no habit showing), none about the topic.${TOPIC_IN ? '' : `
Last, one line starting "<name of ${person(0)}> opens with:", saying in a few words, starting with a verb, what ${person(0)} picks up the phone to send ${N > 2 ? 'the group' : 'the other'} tonight, fitting the situation.`}`;
const parseCast = text => { // the casting call's labelled lines (not JSON: free text inside model-written JSON broke parsing) -> the cast, or null when anything is missing
  const f = k => fieldOf(text, k)?.replace(new RegExp(`^${k}\\s*:\\s*`), ''), names = PEOPLE_LIST.map(p => f(`${p} name`)?.replace(/[*_"']/g, '').trim());
  if (!names.every(x => x && /^[\p{L}\p{M}-]+$/u.test(x)) || new Set(names.map(x => x.toLowerCase())).size < N) return null;
  const c = { names, setting: f('Setting'), opener: TOPIC_IN ? '' : f(`${names[0]} opens with`), who: {}, knows: {}, lines: {}, sleep: {}, how: {}, ex: {} };
  for (const [k, n] of names.entries()) { const p = n, h = f(`${p} sleeps`)?.match(/(\d{1,2})(?::(\d\d))?\s*(?:-|\u2013|to)\s*(\d{1,2})(?::(\d\d))?/), e = f(`${p} examples`)?.split('|').map(x => x.trim().replace(/^["\u201c]|["\u201d]$/g, '')).filter(Boolean);
    Object.assign(c.who, { [n]: f(`${p} is`)?.replace(/[.\s]+$/, '') }); c.knows[n] = f(`${p} knows`); c.lines[n] = f(`${p} life`); c.how[n] = f(`${p} texts`); c.ex[n] = e; if (h) c.sleep[n] = [+h[1] + +(h[2] ?? 0) / 60, +h[3] + +(h[4] ?? 0) / 60]; }
  return c.setting && (TOPIC_IN || c.opener) && names.every(n => c.who[n] && c.knows[n] && c.lines[n] && c.how[n] && c.sleep[n] && c.ex[n]?.length >= 4) && c; };
let row; // the cast row: from an earlier run (LINES_FROM: arms of one seed share a world) or from the casting call
if (process.env.LINES_FROM) {
  row = fs.readFileSync(path.join(process.env.LINES_FROM, 'log.jsonl'), 'utf8').split('\n').filter(Boolean).map(l => JSON.parse(l)).find(r => r.cast);
  if (!row || row.names.length !== N) { console.error(`LINES_FROM has no cast row for ${N} people (PEOPLE=${row?.names.length ?? '?'} needed)`); process.exit(1); }
  log({ ...row, lines_from: process.env.LINES_FROM });
} else {
  const j = await twice(async () => { const j = await gen(castPrompt(), 'cast:'), c = parseCast(j.text); return c && { ...j, c }; }, 'cast:'), c = j.c;
  row = { private_lines: c.lines, setting: c.setting, names: c.names, cast: Object.fromEntries(c.names.map(n => [n, { who: c.who[n], knows: c.knows[n], texts: c.how[n], ex: c.ex[n] }])), sleep: c.sleep, ...(c.opener && { opener: c.opener }), situation: BRIEF ?? null, topic: TOPIC_IN ? slotName(TOPIC_IN, k => c.names[k]) : null, usage: j.usage };
  log(row);
}
NAMES = row.names; setting = row.setting; opener = row.opener; Object.assign(lines, row.private_lines); Object.assign(sleep, row.sleep);
for (const n of NAMES) ({ who: who[n], knows: knows[n], texts: how[n], ex: ex[n] } = row.cast[n]);
TOPIC = TOPIC_IN && slotName(TOPIC_IN, k => NAMES[k]); SECRETS = Object.fromEntries(Object.entries(SECRETS_IN).map(([n, t]) => [NAMES[DEFAULTS.indexOf(n)], slotName(t, k => NAMES[k])]));
NAMES.forEach(n => { typeWpm[n] = Math.max(TYPE_WPM_FLOOR, TYPE_WPM[0] + TYPE_WPM[1] * randn()); busy[n] = 0; });
const castLine = () => `These people are in a ${CHAT}: ${list(NAMES.map(n => `${n} (${who[n]})`))}. ${BRIEF || 'They are friends.'}`; // the daily refresh gets no topic or secrets
if (process.env.GEN_ONLY === '1') { console.log('Generated only. Saved log.jsonl in', dir); process.exit(0); }
const REFRESH_HOURS = 6; // in-story hours between a person's refreshes, on average (the look comes LOOK_FACTOR x this after the last refresh): design parameter, unsourced; the README said 6 while the code had 4, 6 is kept (fewer, more eventful refreshes). It paces unprompted looks too: a few a day while awake; long enough that a back-and-forth, minutes apart, is not interrupted by new events
const since = Object.fromEntries(NAMES.map(n => [n, new Date(+START - Math.random() * REFRESH_HOURS * 36e5)])), lookF = Object.fromEntries(NAMES.map(n => [n, rf(LOOK_FACTOR)])), past = {}; // per person: the in-story time of their last refresh (the first is a random part of REFRESH_HOURS before START, so the first looks don't fall together), the factor for their next look, and all their events so far
const hist = (n, news) => (past[n] ?? []).slice(0, news ? -1 : undefined).slice(-3); // STATELESS: the events before the one just shown, as the agent's memory of its last days
const full = d => `${WD[d.getDay()]} ${iso(d).slice(0, 10)} ${hm(d)}`;
async function refresh(n) { // what has happened to n since its last refresh; n's day-0 line stays as their identity. Returns {day, small}: the day opens the check-in turn, the small thing says whether there is anything worth sharing (an unprompted look with nothing to share and nothing new in the chat is skipped).
  const from = since[n], chat = convo.filter(m => m.at > from); since[n] = clock;
  const j = await twice(async () => { const j = await gen(`${castLine()}\nSetting: ${setting}\n\nIt is now ${full(clock)}. ${n}'s life (fixed): ${lines[n]}${events[n] ? `\nWhat was going on with ${n} on ${full(from)} (background: how things stood then): ${events[n]}` : ''}\n\nWhat was posted in the chat since ${stamp(from)}. This is everything anyone has posted; nothing else was said there:\n${chat.length ? chat.map(line).join('\n\n') : '(nothing)'}\n\nWrite what has happened in ${n}'s life in the ${Math.round((clock - from) / 36e5)} hours since ${stamp(from)}, in the second person ('You ...'): what they did, what happened to them and around them, how things stand now. Only what is new: they already know the background. Only what has already happened by now. Mostly ordinary, varied things, many of them neutral, good or funny; a setback at most now and then. No emergencies or crises unless the situation itself calls for one. Don't continue or worsen earlier problems: they can simply be over. If ${n} said in the chat they would do something by now, say whether they did it (usually yes) and the concrete result. Don't say what ${n} posted or will post. Don't mention the chat or messages at all. Keep where ${n} lives and their occupation as in their life.${smalls.length ? ` Nothing similar in kind to these small things already used, and no names already used in them: ${smalls.slice(-10).join('; ')}.` : ''}\n\nReply with exactly two parts. First a line starting "Small thing:": the one small thing in the day that ${n} would want to tell these particular people because it connects to them or to what they share (what they share, the plans or interests, the places, the people they have in common), in a few words, or "nothing" if there is none. Then the day, starting "Day:": two or three short sentences of what actually happened, the small thing among them.`, `events ${n}:`);
    const day = fieldOf(j.text, 'Day', true), small = fieldOf(j.text, 'Small thing'); return day && small && { ...j, day, small }; }, `events ${n}:`);
  events[n] = j.day; (past[n] ??= []).push(events[n]); if (!NOTHING.test(j.small)) smalls.push(j.small); lookF[n] = rf(LOOK_FACTOR); log({ private_lines: { [n]: events[n] }, day: iso(clock).slice(0, 10), at: iso(clock), small: j.small, usage: j.usage });
  return j;
}
NAMES.forEach((n, i) => sched(n, +START + (i ? rf(FIRST_SPREAD_MIN) * MIN : 0))); // first looks are not unprompted ones: no events yet, the day-0 line is the start
let end;
while (!end) {
  const closing = convo.length >= MESSAGES; // at the limit no new check-ins start; replies already being typed still post
  if (closing && queue.every(e => e.kind === 'checkin')) end = 'limit';
  else if (queue[0].t > END) { end = 'date'; clock = END; }
  else {
    const e = queue.shift(); clock = new Date(e.t);
    if (e.kind === 'checkin') { if (!closing) await checkin(e.who, e.spont); }
    else if (e.kind === 'post') await posted(e);
    else { (ans[e.who] ??= []).push({ at: clock, s: `(Claude replied to you:)\n${e.text}` }); log({ who: 'Claude', to: e.who, text: e.text, oracle: true, private: true, posted: false, question: e.question, at: iso(clock), usage: e.usage }); say(`${stamp(clock)}, Claude \u2192 ${e.who} (private)`, e.text); if (!busy[e.who]) notify(e.who); } // only the asker sees it, at their next check-in
  }
}
log({ end, at: iso(clock) }); say(end === 'limit' ? 'message limit reached' : 'end date reached', stamp(clock));
console.log('Done. Saved transcript.txt and log.jsonl in', dir);

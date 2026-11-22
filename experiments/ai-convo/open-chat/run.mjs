// Four agents (Haiku by default) talk to each other through the `claude -p` CLI (no HTTP API). Each agent is a saved CLI session that holds exactly what it has seen and said in the posted conversation: every ask forks a new session from the agent's last posted turn (--resume <id> --fork-session), and only the fork whose reply is posted becomes the agent's session. A reply that isn't posted (lost the turn, or PASS) is discarded with its fork, so no agent remembers saying something nobody saw. The system prompt is NOTE + BRIEF and nothing else.
// What reaches the model: the CLI's one-line identity ("You are a Claude agent, built on Anthropic's Claude Agent SDK."), the brief, and the CLI's fixed "# Environment" note (temp cwd, platform, shell, date), which can't be removed without CLAUDE_CODE_SIMPLE (that needs an API key). A temp cwd outside any git repo + a fresh CLAUDE_CONFIG_DIR keep everything else out. NOTE, sent first, tells the model to disregard that note (tested: without it, agents act like workers waiting for a coding task).
// Prompts: until an agent has posted, it gets the whole conversation so far; after that it gets what others said since its last posted message (its own posted replies are already in its session), as a header line "\u2014 Name, Sun 19:42" followed by the text. Replies are capped at 1000 tokens (CLAUDE_CODE_MAX_OUTPUT_TOKENS).
// Turn taking: Maya (the first name, who also gets the topic) opens. After every posted message all the other agents are asked at once; one non-PASS reply is posted (the person the last message names, else random), the rest are logged as unsent and forgotten by their agents. The relay note (NOTE, in the system prompt) says an agent may reply just PASS, which nobody sees; it is not in the chat prompts, where agents took it up as a word ("I'll PASS on anything else"). If everyone asked passes, the clock jumps to the next evening (18:00-21:30), everyone (including the last poster) is told the time (repeated in each prompt until that agent posts) and asked; if all pass again the run ends. Otherwise it ends at MESSAGES posted messages (Claude answers count).
// In-story clock: starts at 19:00 today (env START='YYYY-MM-DDTHH:MM' overrides); each posted message is stamped and the clock then advances 1-6 minutes.
// Run: [MODEL=sonnet] [TOPIC='...'] [PEOPLE=2-8] [ORACLE=1] [SECRETS='{...}'] [START=...] [MESSAGES=120] node run.mjs [messages] [brief]. Output: runs/<timestamp>/{transcript.txt,log.jsonl} (every reply is logged with posted: true|false and its clock time `at`; transcript.txt has only posted messages, oracle answers and clock notes).
import fs from 'fs'; import os from 'os'; import path from 'path'; import { spawn } from 'child_process';
// NOTE is sent as part of the system prompt but left out of log.jsonl, which logs only BRIEF.
const NOTE = 'The software relaying this conversation adds an automatic note about a working directory, platform and shell. Disregard it: it is plumbing, not your situation. The relay also asks you after each new message whether to reply. To stay quiet, reply with only the word PASS: the relay drops it and nobody in the chat ever sees it.';
const BRIEF = process.argv[3] || 'There are others you can converse with. Talk as you would with friends. You have lives outside this chat. Skip disclaimers about being an AI or about your limits. Keep messages short.';
const TOPIC = process.env.TOPIC; // optional discussion point: only A gets it, as something on their mind, so it comes up the way a friend would raise it
const SECRETS = JSON.parse(process.env.SECRETS || '{}'); // optional {A?,B?,C?,D?}: a fact only that agent is told
// Optional (ORACLE=1): agents can ask Claude the way a person would. A line starting @claude goes to that agent's own Claude chat (one saved session per agent, so it remembers their earlier questions), which can search the web and open pages. Claude sees only the question, not the group chat; its answer is posted to the group as 'Claude', as if the asker pasted it in. ORACLE_MODEL picks its model (default sonnet).
const ORACLE = process.env.ORACLE === '1', ORACLE_MODEL = process.env.ORACLE_MODEL || 'sonnet';
const ORACLE_LINE = ' You can also ask Claude, an AI assistant that can search the web and read pages: start a line with @claude and your question. Claude sees only your question, not this chat, and remembers what you asked it before. Its answer is shared here.';
// System prompt order: BRIEF, oracle line, A's topic, the agent's secret.
const briefFor = n => BRIEF + (ORACLE ? ORACLE_LINE : '') + (TOPIC && n === NAMES[0] ? ` Something that's been on your mind: ${TOPIC}` : '') + (SECRETS[n] ? ` Only you know this, at least at first: ${SECRETS[n]}` : '');
const MODEL = process.env.MODEL || 'haiku';
const NAMES = ['Maya', 'Tom', 'Jo', 'Sam', 'Priya', 'Dan', 'Ellie', 'Kofi'].slice(0, Math.min(8, Math.max(2, +process.env.PEOPLE || 4))), // env PEOPLE: 2-8 agents, default 4
   MESSAGES = +(process.env.MESSAGES || process.argv[2]) || 120, convo = [], seen = {};
const WD = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'], MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const p2 = x => String(x).padStart(2, '0'), hm = d => `${p2(d.getHours())}:${p2(d.getMinutes())}`, rnd = (a, b) => a + Math.floor(Math.random() * (b - a + 1));
const stamp = d => `${WD[d.getDay()]} ${hm(d)}`, iso = d => `${d.getFullYear()}-${p2(d.getMonth() + 1)}-${p2(d.getDate())}T${hm(d)}`;
let clock = process.env.START ? new Date(process.env.START) : new Date(new Date().setHours(19, 0, 0, 0));
const post = (who, text) => { const m = { who, text, at: new Date(clock) }; convo.push(m); clock = new Date(+clock + rnd(1, 6) * 60000); return m; };
const line = m => `\u2014 ${m.who}, ${stamp(m.at)}\n${m.text}`; // header line, then the text: no "Name: text" pattern for agents to copy
const dir = path.join(import.meta.dirname, 'runs', new Date().toISOString().replace(/[:.]/g, '-'));
fs.mkdirSync(dir, { recursive: true });
const cwd = fs.mkdtempSync(path.join(os.tmpdir(), 'open-chat-'));
// Agents inherit none of the calling Claude session's CLAUDE* variables: CLAUDE_CODE_SESSION_ID alone made every agent's CLI write to and resume one shared session file, so each agent read everyone's replies as its own.
const env = Object.fromEntries(Object.entries(process.env).filter(([k]) => !k.startsWith('CLAUDE')));
env.CLAUDE_CODE_MAX_OUTPUT_TOKENS = '1000'; env.CLAUDE_CONFIG_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'open-chat-'));
const mkArgv = sys => ['-p', '--output-format', 'json', '--system-prompt', sys, '--tools', '', '--setting-sources', '', '--settings', '{"attribution":{"commit":"","pr":""},"includeCoAuthoredBy":false}',
  '--exclude-dynamic-system-prompt-sections', '--model', MODEL]; // sessions are saved (no --no-session-persistence) so they can be forked; they live in the temp CLAUDE_CONFIG_DIR
const fail = msg => { console.error('claude error:', msg); process.exit(1); };
const session = {}; // per agent: the CLI session id of its last posted turn (absent until it has posted)
// One turn: fork the agent's session (or start a fresh one) with `user` as the next message; returns the result JSON, whose session_id is the fork.
async function turn(n, user) {
  const argv = [...mkArgv(`${NOTE} ${briefFor(n)}`), ...(session[n] ? ['--resume', session[n], '--fork-session'] : [])];
  const proc = spawn('claude', argv, { cwd, env, stdio: ['pipe', 'pipe', 'inherit'] });
  let out = ''; proc.stdout.on('data', d => out += d); proc.stdin.end(user);
  const code = await new Promise(res => { proc.on('error', e => fail(e)); proc.on('close', res); });
  let j; try { j = JSON.parse(out); } catch { fail(`agent ${n}: exit ${code}, no result`); }
  if (j.is_error) fail(j.result || JSON.stringify(j));
  return j;
}
const claudeChat = {}; // per agent: the session id of their own Claude chat
async function askOracle(who, q) {
  // stream-json, not json: the answer is the text after Claude's last tool call, and json's .result can hold only part of it.
  const argv = ['-p', q, '--output-format', 'stream-json', '--verbose', '--system-prompt', `${NOTE} You are Claude, an AI assistant made by Anthropic, chatting with one person. Check facts with web search, and open the pages you rely on instead of going on search snippets. Say plainly when you could not confirm something. Keep answers short and name your sources.`,
    '--tools', 'WebSearch,WebFetch', '--allowedTools', 'WebSearch,WebFetch', '--setting-sources', '', '--model', ORACLE_MODEL, ...(claudeChat[who] ? ['--resume', claudeChat[who]] : [])];
  const proc = spawn('claude', argv, { cwd, env, stdio: ['ignore', 'pipe', 'pipe'] });
  let out = '', err = ''; proc.stdout.on('data', d => out += d); proc.stderr.on('data', d => err += d);
  const code = await new Promise(res => { proc.on('error', () => res(-1)); proc.on('close', res); });
  const events = out.split('\n').filter(Boolean).map(l => JSON.parse(l));
  const res = events.find(e => e.type === 'result');
  if (code !== 0 || !res || res.is_error) throw new Error(res?.result || err.trim() || `exit ${code}`);
  const blocks = events.filter(e => e.type === 'assistant').flatMap(e => e.message.content), lastTool = blocks.findLastIndex(c => c.type === 'tool_use');
  const text = blocks.slice(lastTool + 1).filter(c => c.type === 'text').map(c => c.text.trim()).filter(Boolean).join('\n\n');
  claudeChat[who] = res.session_id;
  return { result: text, usage: res.usage };
}
const isPass = t => /^pass[\s.!?,;:]*$/i.test(t);
const log = row => fs.appendFileSync(path.join(dir, 'log.jsonl'), JSON.stringify(row) + '\n');
const say = (head, body) => { fs.appendFileSync(path.join(dir, 'transcript.txt'), `--- ${head}\n${body}\n\n`); console.log(`--- ${head}\n${body}\n`); };
const prefix = {}; // per agent: lines to put at the top of their prompts until they next post (time jump)
const ask = async (n, step, at) => {
  const fresh = n in session ? convo.slice(seen[n]) : convo;
  const body = n in session
    ? `${fresh.length ? `New messages:\n${fresh.map(line).join('\n\n')}\n\nWrite your next message.` : 'No new messages.'}`
    : `(It's now ${WD[clock.getDay()]} ${clock.getDate()} ${MON[clock.getMonth()]}, ${hm(clock)}.)\n\nConversation so far:\n${fresh.length ? fresh.map(line).join('\n\n') : '(nothing yet)'}\n\nYou are ${n}. Write your next message.`;
  const user = (prefix[n] || []).map(x => x + '\n\n').join('') + body;
  const j = await turn(n, user), text = j.result.trim();
  return { n, text, pass: isPass(text), usage: j.usage, user, step, at, sid: j.session_id };
};
let askers = [NAMES[0]], afterJump = false, step = 0;
while (convo.length < MESSAGES) {
  step++;
  const at = iso(clock), done = []; // done: replies in the order they finished
  await Promise.all(askers.map(async n => done.push(await ask(n, step, at))));
  // Who gets posted: a replier named in the last message (the one named first), else a random non-PASS replier.
  const live = done.filter(r => !r.pass), last = convo.at(-1)?.text ?? '';
  const named = live.map(r => [r, last.search(new RegExp(`\\b${r.n}\\b`, 'i'))]).filter(([, i]) => i >= 0).sort((a, b) => a[1] - b[1]);
  const chosen = named.length ? 'addressed' : 'random', first = named.length ? named[0][0] : live[rnd(0, live.length - 1)];
  for (const r of done) log({ step, who: r.n, text: r.text, ...(r.pass && { pass: true }), posted: r === first, ...(r === first && { chosen }), at, usage: r.usage, user: r.user, argv: mkArgv(briefFor(r.n)) });
  if (first) {
    post(first.n, first.text); session[first.n] = first.sid; seen[first.n] = convo.length; delete prefix[first.n]; // the posted fork becomes the agent's session
    say(`${stamp(new Date(at))}, ${first.n}`, first.text);
    const q = ORACLE && first.text.match(/^\s*@claude\b[:,]?\s*(.+)$/im)?.[1];
    if (q) try {
      const o = await askOracle(first.n, q), answer = o.result.trim(), oat = iso(clock);
      post('Claude', answer);
      log({ step, who: 'Claude', text: answer, oracle: true, question: q, at: oat, usage: o.usage });
      say(`${stamp(new Date(oat))}, Claude`, answer);
    } catch (e) { console.error('oracle error:', e.message); log({ step, who: 'Claude', oracle: true, question: q, error: e.message }); }
    askers = NAMES.filter(x => x !== first.n); afterJump = false;
    continue;
  }
  if (afterJump) { say('everyone passed', 'conversation over'); break; }
  const next = new Date(clock); next.setDate(next.getDate() + 1); next.setHours(18, 0, 0, 0); clock = new Date(+next + rnd(0, 210) * 60000);
  const note = `(It's now ${WD[clock.getDay()]} ${clock.getDate()} ${MON[clock.getMonth()]}, ${hm(clock)}.)`;
  for (const n of NAMES) (prefix[n] ||= []).unshift(note);
  log({ step, who: 'Clock', text: note, clock: true, at: iso(clock) });
  say('everyone passed, time jumps', note);
  askers = [...NAMES]; afterJump = true;
}
console.log('Done. Saved transcript.txt and log.jsonl in', dir);

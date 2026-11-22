// Four agents (Haiku by default) talk to each other, each agent one long-lived `claude -p` process (stream-json in/out, no HTTP API), so startup cost is paid once and each agent keeps its own history. The system prompt is NOTE + BRIEF and nothing else.
// What reaches the model: the CLI's one-line identity ("You are a Claude agent, built on Anthropic's Claude Agent SDK."), the brief, and the CLI's fixed "# Environment" note (temp cwd, platform, shell, date), which can't be removed without CLAUDE_CODE_SIMPLE (that needs an API key). A temp cwd outside any git repo + a fresh CLAUDE_CONFIG_DIR keep everything else out. NOTE, sent first, tells the model to disregard that note (tested: without it, agents act like workers waiting for a coding task).
// Prompts: an agent's first turn gets the whole conversation so far; later turns get only what others said since it last spoke (its own replies are already in its history), as "[Sun 19:42] Name: text" lines. Replies are capped at 1000 tokens (CLAUDE_CODE_MAX_OUTPUT_TOKENS).
// Turn taking: Maya (the first name, who also gets the topic) opens. After every posted message all the other agents are asked at once; one non-PASS reply is posted (the person the last message names, else random), the rest are logged as unsent and those agents are told so in their next prompt. Every prompt says an agent may reply just PASS. If everyone asked passes, the clock jumps to the next evening (18:00-21:30), everyone (including the last poster) is told the time and asked; if all pass again the run ends. Otherwise it ends at MESSAGES posted messages (Oracle answers count).
// In-story clock: starts at 19:00 today (env START='YYYY-MM-DDTHH:MM' overrides); each posted message is stamped and the clock then advances 1-6 minutes.
// Run: [MODEL=sonnet] [TOPIC='...'] [PEOPLE=2-8] [ORACLE=1] [SECRETS='{...}'] [START=...] [MESSAGES=120] node run.mjs [messages] [brief]. Output: runs/<timestamp>/{transcript.txt,log.jsonl} (every reply is logged with posted: true|false and its clock time `at`; transcript.txt has only posted messages, oracle answers and clock notes).
import fs from 'fs'; import os from 'os'; import path from 'path'; import readline from 'readline'; import { spawn } from 'child_process';
// NOTE is sent as part of the system prompt but left out of log.jsonl, which logs only BRIEF.
const NOTE = 'The software relaying this conversation adds an automatic note about a working directory, platform and shell. Disregard it: it is plumbing, not your situation.';
const BRIEF = process.argv[3] || 'There are others you can converse with. Talk as you would with friends. You have lives outside this chat. Skip disclaimers about being an AI or about your limits. Keep messages short.';
const TOPIC = process.env.TOPIC; // optional discussion point: only A gets it, as something on their mind, so it comes up the way a friend would raise it
const SECRETS = JSON.parse(process.env.SECRETS || '{}'); // optional {A?,B?,C?,D?}: a fact only that agent is told
const ORACLE = process.env.ORACLE === '1'; // optional oracle: agents may start a line with @oracle to have a web-searching haiku answer; its answer joins the conversation as 'Oracle'
const ORACLE_LINE = ' There is also an oracle that can look things up online: start a line with @oracle and your question.';
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
const line = m => `[${stamp(m.at)}] ${m.who}: ${m.text}`;
const dir = path.join(import.meta.dirname, 'runs', new Date().toISOString().replace(/[:.]/g, '-'));
fs.mkdirSync(dir, { recursive: true });
const cwd = fs.mkdtempSync(path.join(os.tmpdir(), 'open-chat-'));
const env = { ...process.env }; for (const k of ['CLAUDE_CODE_USER_EMAIL', 'CLAUDECODE', 'CLAUDE_CODE_CHILD_SESSION', 'CLAUDE_CODE_ENTRYPOINT']) delete env[k];
env.CLAUDE_CODE_MAX_OUTPUT_TOKENS = '1000'; env.CLAUDE_CONFIG_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'open-chat-'));
const mkArgv = sys => ['-p', '--input-format', 'stream-json', '--output-format', 'stream-json', '--verbose', '--system-prompt', sys, '--tools', '', '--setting-sources', '', '--settings', '{"attribution":{"commit":"","pr":""},"includeCoAuthoredBy":false}',
  '--exclude-dynamic-system-prompt-sections', '--no-session-persistence', '--model', MODEL];
const fail = msg => { console.error('claude error:', msg); process.exit(1); };
const agents = {};
for (const n of NAMES) {
  const proc = spawn('claude', mkArgv(`${NOTE} ${briefFor(n)}`), { cwd, env, stdio: ['pipe', 'pipe', 'inherit'] });
  proc.on('error', e => fail(e));
  agents[n] = { proc, lines: readline.createInterface({ input: proc.stdout })[Symbol.asyncIterator]() };
}
async function turn(n, user) {
  const { proc, lines } = agents[n];
  proc.stdin.write(JSON.stringify({ type: 'user', message: { role: 'user', content: user } }) + '\n');
  for (;;) {
    const { value, done } = await lines.next();
    if (done) fail(`agent ${n} process exited before a result`);
    const j = JSON.parse(value);
    if (j.type !== 'result') continue;
    if (j.is_error) fail(j.result || JSON.stringify(j));
    return j;
  }
}
async function askOracle(who, q) {
  const ctx = convo.slice(-6).map(m => `${m.who}: ${m.text}`).join('\n\n');
  // stream-json, not json: with web search the model writes text across several turns, and json's .result keeps only the last block.
  const argv = ['-p', `Recent conversation:\n${ctx}\n\nQuestion from ${who}: ${q}`, '--output-format', 'stream-json', '--verbose', '--system-prompt', `${NOTE} You are the oracle in a group chat of friends. Answer the question in a few plain sentences. Name a source when it matters.`,
    '--tools', 'WebSearch', '--allowedTools', 'WebSearch', '--setting-sources', '', '--no-session-persistence', '--model', 'haiku'];
  const proc = spawn('claude', argv, { cwd, env, stdio: ['ignore', 'pipe', 'pipe'] });
  let out = '', err = ''; proc.stdout.on('data', d => out += d); proc.stderr.on('data', d => err += d);
  const code = await new Promise(res => { proc.on('error', () => res(-1)); proc.on('close', res); });
  const events = out.split('\n').filter(Boolean).map(l => JSON.parse(l));
  const res = events.find(e => e.type === 'result');
  if (code !== 0 || !res || res.is_error) throw new Error(res?.result || err.trim() || `exit ${code}`);
  const text = events.filter(e => e.type === 'assistant').flatMap(e => e.message.content).filter(c => c.type === 'text').map(c => c.text.trim()).filter(Boolean).join('\n\n');
  return { result: text, usage: res.usage };
}
const PASS = '(If you have nothing to say, reply with just PASS.)', isPass = t => /^pass[\s.!?,;:]*$/i.test(t);
const log = row => fs.appendFileSync(path.join(dir, 'log.jsonl'), JSON.stringify(row) + '\n');
const say = (head, body) => { fs.appendFileSync(path.join(dir, 'transcript.txt'), `--- ${head}\n${body}\n\n`); console.log(`--- ${head}\n${body}\n`); };
const prefix = {}; // per agent: lines to put at the top of their next prompt (time jump, "your last message wasn't sent")
const ask = async (n, step, at) => {
  const fresh = n in seen ? convo.slice(seen[n]) : convo;
  const body = n in seen
    ? `${fresh.length ? `New messages:\n${fresh.map(line).join('\n\n')}\n\nWrite your next message.` : 'No new messages.'}\n\n${PASS}`
    : `(It's now ${WD[clock.getDay()]} ${clock.getDate()} ${MON[clock.getMonth()]}, ${hm(clock)}.)\n\nConversation so far:\n${fresh.length ? fresh.map(line).join('\n\n') : '(nothing yet)'}\n\nYou are ${n}. Write your next message.\n\n${PASS}`;
  const user = (prefix[n] || []).map(x => x + '\n\n').join('') + body;
  delete prefix[n]; seen[n] = convo.length;
  const j = await turn(n, user), text = j.result.trim();
  return { n, text, pass: isPass(text), usage: j.usage, user, step, at };
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
    for (const r of done) if (r !== first && !r.pass) (prefix[r.n] ||= []).push(`(Your last message wasn't sent: ${first.n} posted first.)`);
    post(first.n, first.text); seen[first.n] = convo.length;
    say(`${stamp(new Date(at))}, ${first.n}`, first.text);
    const q = ORACLE && first.text.match(/^\s*@oracle\b[:,]?\s*(.+)$/im)?.[1];
    if (q) try {
      const o = await askOracle(first.n, q), answer = o.result.trim(), oat = iso(clock);
      post('Oracle', answer);
      log({ step, who: 'Oracle', text: answer, oracle: true, question: q, at: oat, usage: o.usage });
      say(`${stamp(new Date(oat))}, Oracle`, answer);
    } catch (e) { console.error('oracle error:', e.message); log({ step, who: 'Oracle', oracle: true, question: q, error: e.message }); }
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
for (const n of NAMES) agents[n].proc.stdin.end();
console.log('Done. Saved transcript.txt and log.jsonl in', dir);

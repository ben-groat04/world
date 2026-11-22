// Four agents (Haiku by default) talk to each other, each agent one long-lived `claude -p` process (stream-json in/out, no HTTP API), so startup cost is paid once and each agent keeps its own history. The system prompt is NOTE + BRIEF and nothing else.
// What reaches the model: the CLI's one-line identity ("You are a Claude agent, built on Anthropic's Claude Agent SDK."), the brief, and the CLI's fixed "# Environment" note (temp cwd, platform, shell, date), which can't be removed without CLAUDE_CODE_SIMPLE (that needs an API key). A temp cwd outside any git repo + a fresh CLAUDE_CONFIG_DIR keep everything else out. NOTE, sent first, tells the model to disregard that note (tested: without it, agents act like workers waiting for a coding task).
// Prompts: an agent's first turn gets the whole conversation so far; later turns get only what others said since it last spoke (its own replies are already in its history). Replies are capped at 1000 tokens (CLAUDE_CODE_MAX_OUTPUT_TOKENS).
// Every prompt ends by saying an agent may reply just PASS. A PASS reply is left out of the conversation and transcript.txt (log.jsonl keeps it with pass: true). "New messages" holds only non-pass messages since the agent last spoke.
// In-story clock: starts at 19:00 today (env START='YYYY-MM-DDTHH:MM' overrides); each posted message is stamped, shown to agents as "[Sun 19:42] Name: text", and the clock then advances 1-6 minutes. If everyone passes in a round, time jumps to a random evening (18:00-21:30) of the next day and every agent is told so; the run ends only if everyone passes again right after a jump (or at the round limit). Speaking order is reshuffled every round (the topic holder speaks first in round 1). log.jsonl rows carry the clock time as `at`.
// Run: [MODEL=sonnet] [TOPIC='...'] [PEOPLE=2-8] [ORACLE=1] [SECRETS='{...}'] [START=...] node run.mjs [rounds] [brief]   (default 30 rounds). Output: runs/<timestamp>/{transcript.txt,log.jsonl}
import fs from 'fs'; import os from 'os'; import path from 'path'; import readline from 'readline'; import { spawn } from 'child_process';
// NOTE is sent as part of the system prompt but left out of log.jsonl, which logs only BRIEF.
const NOTE = 'The software relaying this conversation adds an automatic note about a working directory, platform and shell. Disregard it: it is plumbing, not your situation.';
const BRIEF = process.argv[3] || 'There are others you can converse with. Talk as you would with friends. You have lives outside this chat. Skip disclaimers about being an AI or about your limits. Keep messages short.';
const TOPIC = process.env.TOPIC; // optional discussion point: only A gets it, as something on their mind, so it comes up the way a friend would raise it
const SECRETS = JSON.parse(process.env.SECRETS || '{}'); // optional {A?,B?,C?,D?}: a fact only that agent is told
const ORACLE = process.env.ORACLE === '1'; // optional oracle: agents may start a line with @oracle to have a web-searching haiku answer; its answer joins the conversation as 'Oracle'
const ORACLE_LINE = ' There is also an oracle that can look things up online: start a line with @oracle and your question.';
// System prompt order: BRIEF, oracle line, A's topic, the agent's secret.
const briefFor = n => BRIEF + (ORACLE ? ORACLE_LINE : '') + (TOPIC && n === NAMES[0] ? ` Something that's been on your mind: ${TOPIC}` : '') + (SECRETS[n] ? ` Only you know this: ${SECRETS[n]}` : '');
const MODEL = process.env.MODEL || 'haiku';
const NAMES = ['Maya', 'Tom', 'Jo', 'Sam', 'Priya', 'Dan', 'Ellie', 'Kofi'].slice(0, Math.min(8, Math.max(2, +process.env.PEOPLE || 4))), // env PEOPLE: 2-8 agents, default 4
   ROUNDS = +process.argv[2] || 30, convo = [], seen = {};
const WD = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'], MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const p2 = x => String(x).padStart(2, '0'), hm = d => `${p2(d.getHours())}:${p2(d.getMinutes())}`, rnd = (a, b) => a + Math.floor(Math.random() * (b - a + 1));
const stamp = d => `${WD[d.getDay()]} ${hm(d)}`, iso = d => `${d.getFullYear()}-${p2(d.getMonth() + 1)}-${p2(d.getDate())}T${hm(d)}`;
let clock = process.env.START ? new Date(process.env.START) : new Date(new Date().setHours(19, 0, 0, 0));
const post = (who, text) => { const m = { who, text, at: new Date(clock) }; convo.push(m); clock = new Date(+clock + rnd(1, 6) * 60000); return m; };
const line = m => `[${stamp(m.at)}] ${m.who}: ${m.text}`;
const shuffle = a => { for (let i = a.length - 1; i > 0; i--) { const j = rnd(0, i); [a[i], a[j]] = [a[j], a[i]]; } return a; };
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
let jumped = false, notes = {}; // jumped: the previous round ended in a time jump; notes: pending "it's now ..." line per agent
rounds: for (let r = 1; r <= ROUNDS; r++) {
  let passes = 0; const afterJump = jumped; jumped = false;
  const order = r === 1 ? [NAMES[0], ...shuffle(NAMES.slice(1))] : shuffle([...NAMES]);
  for (const n of order) {
    const fresh = n in seen ? convo.slice(seen[n]) : convo;
    const user = (notes[n] ? `${notes[n]}\n\n` : '') + (n in seen
      ? `${fresh.length ? `New messages:\n${fresh.map(line).join('\n\n')}\n\nWrite your next message.` : 'No new messages.'}\n\n${PASS}`
      : `Conversation so far:\n${fresh.length ? fresh.map(line).join('\n\n') : '(nothing yet)'}\n\nYou are ${n}. Write your next message.\n\n${PASS}`);
    delete notes[n];
    const t0 = Date.now(), at = iso(clock);
    const j = await turn(n, user);
    const text = j.result.trim(), pass = isPass(text);
    if (!pass) post(n, text);
    seen[n] = convo.length;
    fs.appendFileSync(path.join(dir, 'log.jsonl'), JSON.stringify({ round: r, who: n, text, ...(pass && { pass }), at, usage: j.usage, user, argv: mkArgv(briefFor(n)) }) + '\n');
    if (pass) { passes++; console.log(`--- round ${r}, ${n} (passed)\n`); continue; }
    fs.appendFileSync(path.join(dir, 'transcript.txt'), `--- round ${r}, ${n}, ${stamp(new Date(at))}\n${text}\n\n`);
    console.log(`--- round ${r}, ${n} (${((Date.now() - t0) / 1000).toFixed(1)}s)\n${text}\n`);
    const q = ORACLE && text.match(/^\s*@oracle\b[:,]?\s*(.+)$/im)?.[1];
    if (q) try {
      const o = await askOracle(n, q), answer = o.result.trim(), oat = iso(clock);
      post('Oracle', answer);
      fs.appendFileSync(path.join(dir, 'log.jsonl'), JSON.stringify({ round: r, who: 'Oracle', text: answer, oracle: true, question: q, at: oat, usage: o.usage }) + '\n');
      fs.appendFileSync(path.join(dir, 'transcript.txt'), `--- round ${r}, Oracle\n${answer}\n\n`);
      console.log(`--- round ${r}, Oracle\n${answer}\n`);
    } catch (e) { console.error('oracle error:', e.message); fs.appendFileSync(path.join(dir, 'log.jsonl'), JSON.stringify({ round: r, who: 'Oracle', oracle: true, question: q, error: e.message }) + '\n'); }
  }
  if (passes === NAMES.length) {
    if (afterJump) {
      fs.appendFileSync(path.join(dir, 'transcript.txt'), `--- round ${r}: all agents passed, conversation over\n`);
      console.log(`--- round ${r}: all agents passed, conversation over\n`);
      break rounds;
    }
    const next = new Date(clock); next.setDate(next.getDate() + 1); next.setHours(18, 0, 0, 0); clock = new Date(+next + rnd(0, 210) * 60000);
    const note = `(It's now ${WD[clock.getDay()]} ${clock.getDate()} ${MON[clock.getMonth()]}, ${hm(clock)}.)`;
    for (const n of NAMES) notes[n] = note;
    jumped = true;
    fs.appendFileSync(path.join(dir, 'log.jsonl'), JSON.stringify({ round: r, who: 'Clock', text: note, clock: true, at: iso(clock) }) + '\n');
    fs.appendFileSync(path.join(dir, 'transcript.txt'), `--- round ${r}: everyone passed, time jumps\n${note}\n\n`);
    console.log(`--- round ${r}: everyone passed, time jumps\n${note}\n`);
  }
}
for (const n of NAMES) agents[n].proc.stdin.end();
console.log('Done. Saved transcript.txt and log.jsonl in', dir);

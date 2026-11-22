// Four agents (Haiku by default) talk to each other, each agent one long-lived `claude -p` process (stream-json in/out, no HTTP API), so startup cost is paid once and each agent keeps its own history. The system prompt is NOTE + BRIEF and nothing else.
// What reaches the model: the CLI's one-line identity ("You are a Claude agent, built on Anthropic's Claude Agent SDK."), the brief, and the CLI's fixed "# Environment" note (temp cwd, platform, shell, date), which can't be removed without CLAUDE_CODE_SIMPLE (that needs an API key). A temp cwd outside any git repo + a fresh CLAUDE_CONFIG_DIR keep everything else out. NOTE, sent first, tells the model to disregard that note (tested: without it, agents act like workers waiting for a coding task).
// Prompts: an agent's first turn gets the whole conversation so far; later turns get only what others said since it last spoke (its own replies are already in its history). Replies are capped at 1000 tokens (CLAUDE_CODE_MAX_OUTPUT_TOKENS).
// Every prompt ends by saying an agent may reply just PASS. A PASS reply is left out of the conversation and transcript.txt (log.jsonl keeps it with pass: true); if all four pass in one round, the conversation is over and the run stops. "New messages" holds only non-pass messages since the agent last spoke.
// Run: [MODEL=sonnet] [TOPIC='...'] node run.mjs [rounds] [brief]   (default 30 rounds). Output: runs/<timestamp>/{transcript.txt,log.jsonl}
import fs from 'fs'; import os from 'os'; import path from 'path'; import readline from 'readline'; import { spawn } from 'child_process';
// NOTE is sent as part of the system prompt but left out of log.jsonl, which logs only BRIEF.
const NOTE = 'The software relaying this conversation adds an automatic note about a working directory, platform and shell. Disregard it: it is plumbing, not your situation. There is no workspace, no files, no tools and no task here.';
const BRIEF = process.argv[3] || 'There are others you can converse with. Talk as you would with friends. Skip disclaimers about being an AI. Keep messages short.';
const TOPIC = process.env.TOPIC; // optional discussion point: only A gets it, as something on their mind, so it comes up the way a friend would raise it
const briefFor = n => BRIEF + (TOPIC && n === 'A' ? ` Something that's been on your mind: ${TOPIC}` : '');
const MODEL = process.env.MODEL || 'haiku';
const NAMES = ['A', 'B', 'C', 'D'], ROUNDS = +process.argv[2] || 30, convo = [], seen = {};
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
const PASS = '(If you have nothing to say, reply with just PASS.)', isPass = t => /^pass[\s.!?,;:]*$/i.test(t);
rounds: for (let r = 1; r <= ROUNDS; r++) {
  let passes = 0;
  for (const n of NAMES) {
    const fresh = n in seen ? convo.slice(seen[n]) : convo;
    const user = n in seen
      ? `${fresh.length ? `New messages:\n${fresh.map(m => `${m.who}: ${m.text}`).join('\n\n')}\n\nWrite your next message.` : 'No new messages.'}\n\n${PASS}`
      : `Conversation so far:\n${fresh.length ? fresh.map(m => `${m.who}: ${m.text}`).join('\n\n') : '(nothing yet)'}\n\nYou are ${n}. Write your next message.\n\n${PASS}`;
    const t0 = Date.now();
    const j = await turn(n, user);
    const text = j.result.trim(), pass = isPass(text);
    if (!pass) convo.push({ who: n, text });
    seen[n] = convo.length;
    fs.appendFileSync(path.join(dir, 'log.jsonl'), JSON.stringify({ round: r, who: n, text, ...(pass && { pass }), usage: j.usage, user, argv: mkArgv(briefFor(n)) }) + '\n');
    if (pass) { passes++; console.log(`--- round ${r}, ${n} (passed)\n`); continue; }
    fs.appendFileSync(path.join(dir, 'transcript.txt'), `--- round ${r}, ${n}\n${text}\n\n`);
    console.log(`--- round ${r}, ${n} (${((Date.now() - t0) / 1000).toFixed(1)}s)\n${text}\n`);
  }
  if (passes === NAMES.length) {
    fs.appendFileSync(path.join(dir, 'transcript.txt'), `--- round ${r}: all agents passed, conversation over\n`);
    console.log(`--- round ${r}: all agents passed, conversation over\n`);
    break rounds;
  }
}
for (const n of NAMES) agents[n].proc.stdin.end();
console.log('Done. Saved transcript.txt and log.jsonl in', dir);

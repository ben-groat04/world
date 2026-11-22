// Four Sonnet agents talk to each other, each turn a `claude -p` call (no HTTP API). The brief is the system prompt and nothing else.
// What reaches the model: the CLI's one-line identity ("You are a Claude agent, built on Anthropic's Claude Agent SDK."), the brief, and the CLI's fixed "# Environment" note (temp cwd, platform, shell, date), which can't be removed without CLAUDE_CODE_SIMPLE (that needs an API key). A temp cwd outside any git repo + a fresh CLAUDE_CONFIG_DIR keep everything else out. The brief opens by telling the model to disregard that note (tested: without it, agents act like workers waiting for a coding task).
// Run: node run.mjs [rounds] [brief]   (default 15 rounds). Output: runs/<timestamp>/{transcript.txt,log.jsonl}
import fs from 'fs'; import os from 'os'; import path from 'path'; import { spawnSync } from 'child_process';
const BRIEF = process.argv[3] || 'The software relaying this conversation adds an automatic note about a working directory, platform and shell. Disregard it: it is plumbing, not your situation. There is no workspace, no files, no tools and no task here. There are others you can converse with.';
const NAMES = ['A', 'B', 'C', 'D'], ROUNDS = +process.argv[2] || 15, convo = [];
const dir = path.join(import.meta.dirname, 'runs', new Date().toISOString().replace(/[:.]/g, '-'));
fs.mkdirSync(dir, { recursive: true });
const cwd = fs.mkdtempSync(path.join(os.tmpdir(), 'open-chat-'));
const env = { ...process.env }; for (const k of ['CLAUDE_CODE_USER_EMAIL', 'CLAUDECODE', 'CLAUDE_CODE_CHILD_SESSION', 'CLAUDE_CODE_ENTRYPOINT']) delete env[k];
env.CLAUDE_CONFIG_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'open-chat-'));
for (let r = 1; r <= ROUNDS; r++) for (const n of NAMES) {
  const user = `Conversation so far:\n${convo.length ? convo.map(m => `${m.who}: ${m.text}`).join('\n\n') : '(nothing yet)'}\n\nYou are ${n}. Write your next message.`;
  const argv = ['-p', user, '--system-prompt', BRIEF, '--tools', '', '--setting-sources', '', '--settings', '{"attribution":{"commit":"","pr":""},"includeCoAuthoredBy":false}',
    '--exclude-dynamic-system-prompt-sections', '--no-session-persistence', '--model', 'sonnet', '--output-format', 'json'];
  const p = spawnSync('claude', argv, { cwd, env, encoding: 'utf8', maxBuffer: 1 << 26 });
  const j = JSON.parse(p.stdout || '{}');
  if (p.status !== 0 || j.is_error) { console.error('claude error:', j.result || p.stderr || p.error); process.exit(1); }
  const text = j.result.trim();
  convo.push({ who: n, text });
  fs.appendFileSync(path.join(dir, 'log.jsonl'), JSON.stringify({ round: r, who: n, text, usage: j.usage, argv }) + '\n');
  fs.appendFileSync(path.join(dir, 'transcript.txt'), `--- round ${r}, ${n}\n${text}\n\n`);
  console.log(`--- round ${r}, ${n}\n${text}\n`);
}
console.log('Done. Saved transcript.txt and log.jsonl in', dir);

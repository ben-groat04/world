// Four Sonnet agents talk to each other, each turn a `claude -p` call (no HTTP API). The brief is the system prompt and nothing else.
// CLI flags: --system-prompt replaces the coding-agent prompt; no tools, no settings/CLAUDE.md, empty cwd. Only the CLI's one-line identity ("a Claude agent, built on the Claude Agent SDK") and its environment note remain.
// Run: node run.mjs [rounds]   (default 15). Output: runs/<timestamp>/{transcript.txt,log.jsonl}
import fs from 'fs'; import path from 'path'; import { spawnSync } from 'child_process';
const BRIEF = 'There are other agents you can converse with.';
const NAMES = ['A', 'B', 'C', 'D'], ROUNDS = +process.argv[2] || 15, convo = [];
const dir = path.join(import.meta.dirname, 'runs', new Date().toISOString().replace(/[:.]/g, '-')), cwd = path.join(dir, 'cwd');
fs.mkdirSync(cwd, { recursive: true });
const env = { ...process.env }; for (const k of ['CLAUDE_CODE_USER_EMAIL', 'CLAUDECODE', 'CLAUDE_CODE_CHILD_SESSION', 'CLAUDE_CODE_ENTRYPOINT']) delete env[k];
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

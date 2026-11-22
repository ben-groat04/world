// Four Sonnet agents on the Anthropic API, no harness. The brief is the system prompt and nothing else.
// Run: node run.mjs   (asks for your API key; or set ANTHROPIC_API_KEY)
import fs from 'fs'; import readline from 'readline/promises';
const KEY = process.env.ANTHROPIC_API_KEY || process.env.CLAUDE_KEY ||
  await readline.createInterface({ input: process.stdin, output: process.stdout }).question('Anthropic API key: ').then(s => s.trim());
const MODEL = 'claude-sonnet-5-5', BRIEF = 'There are other agents you can converse with.';
const NAMES = ['A', 'B', 'C', 'D'], ROUNDS = 15, convo = [];
for (let r = 1; r <= ROUNDS; r++) for (const n of NAMES) {
  const user = `Conversation so far:\n${convo.length ? convo.map(m => `${m.who}: ${m.text}`).join('\n\n') : '(nothing yet)'}\n\nYou are ${n}. Write your next message.`;
  const body = { model: MODEL, max_tokens: 1000, system: BRIEF, messages: [{ role: 'user', content: user }] };
  const res = await fetch('https://api.anthropic.com/v1/messages', { method: 'POST', headers: { 'x-api-key': KEY, 'anthropic-version': '2023-06-01', 'content-type': 'application/json' }, body: JSON.stringify(body) });
  const j = await res.json();
  if (!res.ok) { console.error('API error:', JSON.stringify(j)); process.exit(1); }
  const text = j.content.filter(c => c.type === 'text').map(c => c.text).join('').trim();
  convo.push({ who: n, text });
  fs.appendFileSync('log.jsonl', JSON.stringify({ round: r, who: n, text, usage: j.usage, request: body }) + '\n');
  fs.appendFileSync('transcript.txt', `--- round ${r}, ${n}\n${text}\n\n`);
  console.log(`--- round ${r}, ${n}\n${text}\n`);
}
console.log('Done. Saved transcript.txt and log.jsonl in', process.cwd());

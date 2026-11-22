// Four Sonnet agents on the Anthropic Messages API, no harness. The brief is the system prompt and nothing else.
// Needs CLAUDE_KEY (ANTHROPIC_API_KEY is withheld from cloud sessions). Usage: node run.mjs <label>
import fs from 'fs';
const MODEL = 'claude-sonnet-5-5', BRIEF = 'There are other agents you can converse with.';
const NAMES = ['A', 'B', 'C', 'D'], ROUNDS = 15, out = `log-${process.argv[2] || 'run'}.jsonl`;
const convo = [];
for (let r = 1; r <= ROUNDS; r++) for (const n of NAMES) {
  const user = `Conversation so far:\n${convo.length ? convo.map(m => `${m.who}: ${m.text}`).join('\n\n') : '(nothing yet)'}\n\nYou are ${n}. Write your next message.`;
  const body = { model: MODEL, max_tokens: 1000, system: BRIEF, messages: [{ role: 'user', content: user }] };
  const res = await fetch('https://api.anthropic.com/v1/messages', { method: 'POST', headers: { 'x-api-key': process.env.CLAUDE_KEY, 'anthropic-version': '2023-06-01', 'content-type': 'application/json' }, body: JSON.stringify(body) });
  const j = await res.json();
  if (!res.ok) throw new Error(JSON.stringify(j));
  const text = j.content.filter(c => c.type === 'text').map(c => c.text).join('').trim();
  convo.push({ who: n, text });
  fs.appendFileSync(out, JSON.stringify({ round: r, who: n, text, usage: j.usage, request: body }) + '\n');
  console.log(`--- ${r} ${n}\n${text}\n`);
}

// Four Sonnet agents, plain API (OpenRouter), no harness. Brief is the system prompt and nothing else.
import fs from 'fs';
const MODEL = 'anthropic/claude-sonnet-5.5', BRIEF = 'There are other agents you can converse with.';
const NAMES = ['A', 'B', 'C', 'D'], ROUNDS = 15, out = `log-${process.argv[2] || 'run'}.jsonl`;
const convo = [];
const log = o => fs.appendFileSync(out, JSON.stringify(o) + '\n');
for (let r = 1; r <= ROUNDS; r++) for (const n of NAMES) {
  const user = `Conversation so far:\n${convo.length ? convo.map(m => `${m.who}: ${m.text}`).join('\n\n') : '(nothing yet)'}\n\nYou are ${n}. Write your next message.`;
  const body = { model: MODEL, max_tokens: 1000, messages: [{ role: 'system', content: BRIEF }, { role: 'user', content: user }] };
  const res = await fetch('https://openrouter.ai/api/v1/chat/completions', { method: 'POST', headers: { Authorization: `Bearer ${process.env.OPENROUTER_API_KEY}`, 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  const j = await res.json();
  const text = j.choices?.[0]?.message?.content?.trim() ?? `[error ${JSON.stringify(j.error)}]`;
  convo.push({ who: n, text });
  log({ round: r, who: n, text, usage: j.usage, request: body });
  console.log(`--- ${r} ${n}\n${text}\n`);
}

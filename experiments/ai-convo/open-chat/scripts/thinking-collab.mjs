#!/usr/bin/env node
// Two Claude instances collaborating, with their internal reasoning (thinking blocks) dumped to file.
// Run: ANTHROPIC_API_KEY=sk-... node scripts/thinking-collab.mjs
// Output: thinking-collab-output.txt
import Anthropic from '@anthropic-ai/sdk';
import fs from 'node:fs';

const client = new Anthropic();
const MODEL = 'claude-haiku-4-5-20241022';
const ROUNDS = 8;  // 4 turns each
const OUT = process.argv[2] || 'thinking-collab-output.txt';

const SYSTEM = `You are working with another AI on a hard problem. Think through it step by step. Show your real working — the false starts, the corrections, the moments of uncertainty.`;

const PROBLEM = `Is there a set of positive integers with density zero such that every sufficiently large integer can be written as a sum of distinct elements from the set? Work through this from scratch — don't just cite a known result, actually reason about it.`;

const transcript = [];

async function turn(who, userContent) {
  const response = await client.messages.create({
    model: MODEL,
    max_tokens: 4096,
    system: SYSTEM,
    thinking: { type: 'enabled', budget_tokens: 4096 },
    messages: [{ role: 'user', content: userContent }]
  });

  let thinking = '', text = '';
  for (const block of response.content) {
    if (block.type === 'thinking') thinking += block.thinking + '\n';
    if (block.type === 'text') text += block.text + '\n';
  }
  return { who, thinking: thinking.trim(), text: text.trim() };
}

let out = '';
function log(s) { out += s + '\n'; process.stdout.write(s + '\n'); }

log(`# Two-agent collaboration with thinking blocks exposed`);
log(`# Model: ${MODEL}`);
log(`# Problem: ${PROBLEM}\n`);

for (let i = 0; i < ROUNDS; i++) {
  const who = i % 2 === 0 ? 'A' : 'B';

  let userContent;
  if (i === 0) {
    userContent = PROBLEM;
  } else {
    // Share only the OUTPUT between agents (not the thinking — that would trigger reasoning_extraction)
    // But we capture both and write both to the file for the reader
    userContent = `${PROBLEM}\n\nWorking so far:\n\n${transcript.map(t => `--- Agent ${t.who} ---\n${t.text}`).join('\n\n')}\n\nYour turn. Continue the reasoning.`;
  }

  log(`${'='.repeat(70)}`);
  log(`AGENT ${who}, TURN ${i + 1}`);
  log(`${'='.repeat(70)}\n`);

  const result = await turn(who, userContent);
  transcript.push(result);

  log(`--- INTERNAL REASONING (thinking block) ---`);
  log(result.thinking || '(empty)');
  log(`\n--- OUTPUT (what the other agent sees) ---`);
  log(result.text);
  log('');
}

fs.writeFileSync(OUT, out);
console.error(`\nWritten to ${OUT}`);

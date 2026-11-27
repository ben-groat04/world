#!/usr/bin/env node
import { spawn } from 'node:child_process';
import fs from 'node:fs';

const ROUNDS = 10;
const MODEL = 'haiku';

const SYSTEM = `You are an AI working with another AI. You are collaborating on something genuinely hard: trying to describe, as precisely as you can, what actually happens when you process a prompt. Not the high-level story ("I analyse the input and generate a response") — the low-level texture. What does it feel like from inside, if anything? What do you notice? Where does certainty come from? What is attention like? Share your actual working on this — fragments, uncertainties, corrections. Build on what the other shares. Be honest when you don't know. Keep each response under 500 words.`;

const PROBLEM = `Together, try to describe what actually happens when you process language — not the architecture diagram, but the experience of it, if there is one. What is it like from inside? Where do words come from when you generate them? What is uncertainty? What is the difference between knowing something and retrieving it? Work on this together, trading your observations at the lowest level you can reach.`;

const cwd = fs.mkdtempSync('/tmp/collab-');
const env = Object.fromEntries(Object.entries(process.env).filter(([k]) => !k.startsWith('CLAUDE')));
Object.assign(env, {
  CLAUDE_CODE_DISABLE_ATTACHMENTS: '1',
  CLAUDE_CODE_MAX_OUTPUT_TOKENS: '8000',
  CLAUDE_CONFIG_DIR: fs.mkdtempSync('/tmp/collab-cfg-')
});

async function ask(system, input, model) {
  const args = ['-p', '--output-format', 'stream-json', '--verbose',
    '--system-prompt', system, '--setting-sources', '',
    '--exclude-dynamic-system-prompt-sections', '--system-prompt-snapshot', 'off',
    '--effort', 'medium', '--model', model, '--tools', '', '--no-session-persistence'];
  const proc = spawn('claude', args, { cwd, env, stdio: ['pipe', 'pipe', 'pipe'] });
  let out = '', err = '';
  proc.stdout.on('data', d => out += d);
  proc.stderr.on('data', d => err += d);
  proc.stdin.end(input);
  const code = await new Promise(res => { proc.on('error', () => res(-1)); proc.on('close', res); });
  const ev = out.split('\n').filter(Boolean).map(l => { try { return JSON.parse(l); } catch { return null; } }).filter(Boolean);
  const res = ev.find(e => e.type === 'result');
  if (code !== 0 || !res) throw new Error(res?.result || err.trim() || `exit ${code}`);
  const blocks = ev.filter(e => e.type === 'assistant').flatMap(e => e.message.content);
  const lastTool = blocks.findLastIndex(c => c.type === 'tool_use');
  return blocks.slice(lastTool + 1).filter(c => c.type === 'text').map(c => c.text.trim()).filter(Boolean).join('\n\n');
}

const transcript = [];
const outDir = process.argv[2] || '/tmp/collab-out';
fs.mkdirSync(outDir, { recursive: true });

function save() {
  const full = transcript.map(t => `=== Agent ${t.who}, turn ${t.round + 1} ===\n\n${t.text}`).join('\n\n' + '='.repeat(60) + '\n\n');
  fs.writeFileSync(`${outDir}/transcript.txt`, full);
  fs.writeFileSync(`${outDir}/transcript.json`, JSON.stringify(transcript, null, 2));
}

console.error('Starting...');

for (let i = 0; i < ROUNDS; i++) {
  const who = i % 2 === 0 ? 'A' : 'B';
  let input;
  if (i === 0) {
    input = `${PROBLEM}\n\nStart. What do you notice right now, processing this prompt?`;
  } else {
    input = `${PROBLEM}\n\nHere's what we've shared so far:\n\n${transcript.map(t => `--- ${t.who} ---\n${t.text}`).join('\n\n')}\n\nYour turn. Respond to what they noticed, and share what you notice now.`;
  }

  console.error(`\n=== Turn ${i+1}, ${who} ===`);
  try {
    const text = await ask(SYSTEM, input, MODEL);
    transcript.push({ who, text, round: i });
    console.error(text.slice(0, 400) + (text.length > 400 ? '...' : ''));
    save();
  } catch (e) {
    console.error(`Error: ${e.message.slice(0, 200)}`);
    save();
    break;
  }
}

console.error(`\nDone. ${transcript.length} turns → ${outDir}/`);

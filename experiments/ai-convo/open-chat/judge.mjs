#!/usr/bin/env node
// Blind judging with Sonnet (the neutral ask: score 0-10, explain). node judge.mjs <eval dir> [--model sonnet] [--conc 6]
// Each <eval dir>/judges/jN/ folder is one judge: one call with the judge-note and all its files, which scores each file; writes <eval dir>/judges/jN.md (the reply) and <eval dir>/scores.tsv ("id<TAB>score"); tally with eval-prep.mjs --tally.
import fs from 'node:fs'; import os from 'node:os'; import path from 'node:path'; import { spawn } from 'node:child_process';
const argv = process.argv.slice(2), opt = (k, d) => { const i = argv.indexOf('--' + k); if (i < 0) return d; const v = argv[i + 1]; argv.splice(i, 2); return v; };
const MODEL = opt('model', 'sonnet'), CONC = +opt('conc', 6), dir = argv[0], note = fs.readFileSync(path.join(dir, 'judge-note.txt'), 'utf8').trim();
const cwd = fs.mkdtempSync(path.join(os.tmpdir(), 'open-chat-judge-')), env = Object.fromEntries(Object.entries(process.env).filter(([k]) => !k.startsWith('CLAUDE'))); Object.assign(env, { CLAUDE_CODE_DISABLE_ATTACHMENTS: '1', CLAUDE_CONFIG_DIR: fs.mkdtempSync(path.join(os.tmpdir(), 'open-chat-judge-')) });
async function ask(input) {
  const proc = spawn('claude', ['-p', '--output-format', 'stream-json', '--verbose', '--system-prompt', 'You read text chats and judge them.', '--tools', '', '--setting-sources', '', '--model', MODEL, '--no-session-persistence'], { cwd, env, stdio: ['pipe', 'pipe', 'pipe'] });
  let out = '', err = ''; proc.stdout.on('data', d => out += d); proc.stderr.on('data', d => err += d); proc.stdin.end(input);
  const code = await new Promise(res => { proc.on('error', () => res(-1)); proc.on('close', res); });
  const ev = out.split('\n').filter(Boolean).map(l => JSON.parse(l)), res = ev.find(e => e.type === 'result'); if (code !== 0 || !res || res.is_error) throw new Error(res?.result || err.trim() || `exit ${code}`);
  return ev.filter(e => e.type === 'assistant').flatMap(e => e.message.content).filter(c => c.type === 'text').map(c => c.text.trim()).join('\n\n');
}
const judges = fs.readdirSync(path.join(dir, 'judges')).filter(j => fs.statSync(path.join(dir, 'judges', j)).isDirectory()).sort((a, b) => +a.slice(1) - +b.slice(1)); let k = 0; const rows = [];
await Promise.all(Array.from({ length: CONC }, async () => { while (k < judges.length) {
  const j = judges[k++], d = path.join(dir, 'judges', j), files = fs.readdirSync(d).filter(f => f.endsWith('.txt')).sort(), ids = files.map(f => f.slice(0, -4));
  const input = `${note}\n\nBelow are ${files.length} chats, each in a block "=== FILE <id> ===". Score each file from 0 to 10 and explain briefly. After the explanations, end with a block that starts with a line "SCORES" and has one line per file: "<id> <score>".\n\n${files.map(f => `=== FILE ${f.slice(0, -4)} ===\n${fs.readFileSync(path.join(d, f), 'utf8').trim()}\n`).join('\n')}`;
  let text = null; for (let a = 0; a < 3 && !text; a++) { try { const t = await ask(input), blk = t.split(/^SCORES\s*$/m).at(-1), got = {}; for (const l of blk.split('\n')) { const m = l.match(/^\W*([0-9a-f]{6})\W+(\d+(?:\.\d+)?)/); if (m) got[m[1]] = +m[2]; } if (ids.every(id => id in got)) { text = t; for (const id of ids) rows.push(`${id}\t${got[id]}`); } else console.error(`${j}: missing scores, retrying`); } catch (e) { console.error(`${j}: ${e.message}`); } }
  if (text) fs.writeFileSync(path.join(dir, 'judges', j + '.md'), text); console.log(`${j}: ${text ? 'done' : 'FAILED'}`);
} }));
fs.writeFileSync(path.join(dir, 'scores.tsv'), rows.join('\n') + '\n'); console.log(`${rows.length} scores -> ${path.join(dir, 'scores.tsv')}`);

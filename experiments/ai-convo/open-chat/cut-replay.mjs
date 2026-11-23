#!/usr/bin/env node
// W4 item 5 check: node cut-replay.mjs <list file> [--prefix CUT] [--conc 6]
// Runs the delete-only pass (cut.mjs) day by day (04:00 to 04:00, as the writer's chunks) over existing writer chats and writes the cut chats as run folders
// writer-runs/<timestamp>/<label>/{log.jsonl, transcript.txt, cuts.txt} plus list.txt, as eval-prep.mjs reads them. Prints the deletion share and the cut messages' sender mix per chat.
import fs from 'node:fs'; import os from 'node:os'; import path from 'node:path'; import { spawn } from 'node:child_process'; import { ENV_NOTE } from './prompts.mjs'; import { cutDay } from './cut.mjs';
const argv = process.argv.slice(2), opt = (k, d) => { const i = argv.indexOf('--' + k); if (i < 0) return d; const v = argv[i + 1]; argv.splice(i, 2); return v; };
const PREFIX = opt('prefix', 'CUT'), CONC = +opt('conc', 6), MODEL = opt('model', 'haiku'), listFile = argv[0];
const cwd = fs.mkdtempSync(path.join(os.tmpdir(), 'open-chat-cut-')), env = Object.fromEntries(Object.entries(process.env).filter(([k]) => !k.startsWith('CLAUDE'))); Object.assign(env, { CLAUDE_CODE_DISABLE_ATTACHMENTS: '1', CLAUDE_CODE_MAX_OUTPUT_TOKENS: '8000', CLAUDE_CONFIG_DIR: fs.mkdtempSync(path.join(os.tmpdir(), 'open-chat-cut-')) });
async function call(input, sys, effort) {
  const proc = spawn('claude', ['-p', '--output-format', 'stream-json', '--verbose', '--system-prompt', sys, '--tools', '', '--setting-sources', '', '--exclude-dynamic-system-prompt-sections', '--system-prompt-snapshot', 'off', '--effort', effort, '--model', MODEL, '--no-session-persistence'], { cwd, env, stdio: ['pipe', 'pipe', 'pipe'] });
  let out = '', err = ''; proc.stdout.on('data', d => out += d); proc.stderr.on('data', d => err += d); proc.stdin.end(input);
  const code = await new Promise(res => { proc.on('error', () => res(-1)); proc.on('close', res); });
  const ev = out.split('\n').filter(Boolean).map(l => JSON.parse(l)), res = ev.find(e => e.type === 'result'); if (code !== 0 || !res || res.is_error) throw new Error(res?.result || err.trim() || `exit ${code}`);
  return { text: ev.filter(e => e.type === 'assistant').flatMap(e => e.message.content).filter(c => c.type === 'text').map(c => c.text.trim()).join('\n\n'), usage: res.usage };
}
const WD = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'], stampOf = at => `${WD[new Date(at + ':00Z').getUTCDay()]} ${at.slice(11, 16)}`;
const out = path.join(import.meta.dirname, 'writer-runs', new Date().toISOString().replace(/[:.]/g, '-')); fs.mkdirSync(out, { recursive: true });
const items = fs.readFileSync(listFile, 'utf8').split('\n').filter(l => l.trim()).map(l => l.trim().split(/\s+/)); let k = 0; const listOut = [], stats = [];
await Promise.all(Array.from({ length: CONC }, async () => { while (k < items.length) {
  const [label0, dir] = items[k++], rows = fs.readFileSync(path.join(dir, 'log.jsonl'), 'utf8').split('\n').filter(Boolean).map(l => JSON.parse(l)), head = rows[0], cast = rows.find(r => r.cast || r.names);
  const msgs = []; for (const r of rows) { if (r.posted === true && r.text) msgs.push({ who: r.who, text: r.text, at: r.at, oracle: !!r.oracle, question: r.question, reacts: [] }); else if (r.react) msgs[r.to]?.reacts.push([r.react]); }
  const t0 = +new Date(msgs[0].at + ':00Z'), d4 = new Date(t0); d4.setUTCHours(4, 0, 0, 0); let e = +d4; while (e <= t0) e += 864e5; if (e - t0 < 6 * 36e5) e += 864e5;
  const days = []; let cur = [], end = e; for (const m of msgs) { while (+new Date(m.at + ':00Z') > end) { days.push(cur); cur = []; end += 864e5; } cur.push(m); } days.push(cur);
  const kept = [], cut = []; for (const d of days) { if (!d.length) continue; const x = await cutDay(call, ENV_NOTE, cast.names, kept, d, /^@claude\b/i, label0); kept.push(...x.dm); cut.push(...x.cut); }
  const label = `${PREFIX}-${label0.split('-').slice(1).join('-')}`, od = path.join(out, label); fs.mkdirSync(od);
  const log = [{ ...head, source: dir, cutReplay: true }, ...rows.filter(r => r.cast || r.names || r.secrets)]; let j = 0;
  for (const m of kept) { log.push({ who: m.who, text: m.text, ...(m.oracle && { oracle: true, question: m.question }), posted: true, at: m.at, checkin: m.at }); if (!m.oracle) { for (const [emoji] of m.reacts) log.push({ who: '', react: emoji, to: j, posted: false, at: m.at }); j++; } }
  fs.writeFileSync(path.join(od, 'log.jsonl'), log.map(r => JSON.stringify(r)).join('\n') + '\n'); fs.writeFileSync(path.join(od, 'transcript.txt'), kept.map(m => `--- ${stampOf(m.at)}, ${m.who}\n${m.text}\n`).join('\n'));
  fs.writeFileSync(path.join(od, 'cuts.txt'), cut.map(m => `${stampOf(m.at)}, ${m.who}: ${m.text}`).join('\n') + '\n'); listOut.push(`${label} ${od}`); stats.push({ label, n: msgs.length, cut: cut.length }); console.log(`${label}: ${cut.length}/${msgs.length} cut`);
} }));
fs.writeFileSync(path.join(out, 'list.txt'), listOut.sort().join('\n') + '\n'); const N = stats.reduce((a, s) => a + s.n, 0), C = stats.reduce((a, s) => a + s.cut, 0);
console.log(`total ${C}/${N} cut (${(100 * C / N).toFixed(1)}%), ${stats.filter(s => s.cut === 0).length} chats with none; list: ${path.join(out, 'list.txt')}`);

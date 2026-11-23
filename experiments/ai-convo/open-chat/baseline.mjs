#!/usr/bin/env node
// Round 19 item 6, a one-off diagnostic: is the multi-agent machinery buying any realism? One Haiku call per cast writes the whole first 36 hours of the chat at once, with timestamps, in the transcript format eval-prep reads; judge those windows blind against the multi-agent windows of the same casts. If they score as well, the agent machinery isn't buying realism; if worse, the architecture is justified.
//   node baseline.mjs <list file> [--messages 35] [--conc 3]
//     list file: "<label> <run folder>" lines as for eval-prep.mjs (the runs whose cast rows are used: cast, setting, topic or opener, start time; nothing else of those runs is read).
//   Writes baselines/<timestamp>/<ONE-scenario+seed>/{transcript.txt, log.jsonl} per cast and baselines/<timestamp>/list.txt ("ONE-T41 <folder>"): log.jsonl has the cast row and one row per message {who, text, posted: true, at} plus one {react, to} row per reaction, so eval-prep.mjs and score.mjs read it as a run. To judge:
//     cat <multi-agent list> baselines/<timestamp>/list.txt > both.txt; node eval-prep.mjs both.txt <out dir>
//   The prompt gives the call everything a run's agents and rewrite pass get (who each person is, how they stand to the others, their week, sleeping hours, how often they message, how they type, example texts, setting, topic or what the first person opens with) and asks for the chat in the format below; it says nothing about how to write it realistically.
import fs from 'node:fs'; import os from 'node:os'; import path from 'node:path'; import { spawn } from 'node:child_process'; import { ENV_NOTE, hhmm } from './prompts.mjs';
const argv = process.argv.slice(2), opt = (k, d) => { const i = argv.indexOf('--' + k); if (i < 0) return d; const v = argv[i + 1]; argv.splice(i, 2); return v; };
const MESSAGES = +opt('messages', 35), CONC = +opt('conc', 3), listFile = argv[0];
if (!listFile) { console.error('usage: node baseline.mjs <list file> [--messages 35] [--conc 3]'); process.exit(1); }
const cwd = fs.mkdtempSync(path.join(os.tmpdir(), 'open-chat-base-')), env = Object.fromEntries(Object.entries(process.env).filter(([k]) => !k.startsWith('CLAUDE'))); Object.assign(env, { CLAUDE_CODE_DISABLE_ATTACHMENTS: '1', CLAUDE_CODE_MAX_OUTPUT_TOKENS: '8000', CLAUDE_CONFIG_DIR: fs.mkdtempSync(path.join(os.tmpdir(), 'open-chat-base-')) });
const SYS = `${ENV_NOTE} You write the message history of a chat for a story.`;
async function claude(input) {
  const proc = spawn('claude', ['-p', '--output-format', 'stream-json', '--verbose', '--system-prompt', SYS, '--tools', '', '--setting-sources', '', '--exclude-dynamic-system-prompt-sections', '--system-prompt-snapshot', 'off', '--effort', 'low', '--model', 'haiku', '--no-session-persistence'], { cwd, env, stdio: ['pipe', 'pipe', 'pipe'] });
  let out = '', err = ''; proc.stdout.on('data', d => out += d); proc.stderr.on('data', d => err += d); proc.stdin.end(input);
  const code = await new Promise(res => { proc.on('error', () => res(-1)); proc.on('close', res); });
  const ev = out.split('\n').filter(Boolean).map(l => JSON.parse(l)), res = ev.find(e => e.type === 'result'); if (code !== 0 || !res || res.is_error) throw new Error(res?.result || err.trim() || `exit ${code}`);
  return { text: ev.filter(e => e.type === 'assistant').flatMap(e => e.message.content).filter(c => c.type === 'text').map(c => c.text.trim()).join('\n\n'), usage: res.usage };
}
const WD = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'], p2 = x => String(x).padStart(2, '0'), list = a => a.length < 2 ? a.join('') : a.slice(0, -1).join(', ') + ' and ' + a.at(-1);
const read = dir => fs.readFileSync(path.join(dir, 'log.jsonl'), 'utf8').split('\n').filter(Boolean).map(l => JSON.parse(l));
function promptFor(c, startAt) {
  const chat = c.names.length > 2 ? 'group chat' : 'chat', first = c.names[0], d = new Date(startAt + ':00Z'), head = `${WD[d.getUTCDay()]} ${startAt.slice(11, 16)}`;
  const people = c.names.map(n => { const p = c.cast[n]; return `${n} (${p.who}). ${p.knows} ${c.private_lines[n]} Sleeps ${hhmm(c.sleep[n][0])} to ${hhmm(c.sleep[n][1])}. ${p.texts} How ${n} types: ${p.style} Some of ${n}'s texts: ${p.ex.join(' / ')}`; }).join('\n\n');
  return `These people are in a ${chat}: ${list(c.names.map(n => `${n} (${c.cast[n].who})`))}. ${c.situation || 'They are friends.'}\nSetting: ${c.setting}\n\n${people}\n\n${c.topic ? `${first} has this on their mind: ${c.topic}` : `${first} picks up the phone to ${c.opener.replace(/\.$/, '')}.`}\n\nWrite the first 36 hours of this ${chat}'s message history, starting ${head}: about ${MESSAGES} messages in all, in the order they were sent. Write each message as a header line "--- Mon 19:41, Name" (weekday, 24-hour time, the sender), then the message text, then a blank line. If a message got emoji reactions, put a line like "(\u{1F44D} 2, \u{1F602} 1)" directly under it. Reply with only the message history.`;
}
// The model's message history -> messages {who, text, wd, hm, reacts}, or null if it is not in the format (a header that is not a cast name, a time that is not HH:MM).
function parse(text, names) {
  const msgs = []; for (const b of text.split(/^(?=--- )/m).filter(x => x.startsWith('--- '))) {
    const m = b.match(/^--- (\w{3}) (\d{1,2}):(\d\d), ([^\n]+)\n([\s\S]*)$/); if (!m || !WD.includes(m[1]) || !names.includes(m[4].trim()) || +m[2] > 23) return null;
    const body = m[5].trim().split('\n'), last = body.at(-1)?.trim(), rc = last?.match(/^\(((?:\p{Extended_Pictographic}️?[^,()]*? \d+)(?:, \p{Extended_Pictographic}️?[^,()]*? \d+)*)\)$/u);
    msgs.push({ who: m[4].trim(), text: (rc ? body.slice(0, -1) : body).join('\n').trim(), wd: WD.indexOf(m[1]), hm: `${p2(m[2])}:${m[3]}`, reacts: rc ? rc[1].split(', ').map(x => { const k = x.lastIndexOf(' '); return [x.slice(0, k), +x.slice(k + 1)]; }) : [] });
  } return msgs.length >= 5 && msgs.every(m => m.text) ? msgs : null;
}
// Stamps -> in-story dates from the start date: the weekday of each message, never going back in time (a stamp earlier than the last moves to the next day it names).
function dated(msgs, startAt) {
  const day0 = new Date(startAt.slice(0, 10) + 'T00:00:00Z'); let last = +new Date(startAt + ':00Z') - 1;
  return msgs.map(m => { let t = +day0 + (((m.wd - day0.getUTCDay()) + 7) % 7) * 864e5 + (+m.hm.slice(0, 2) * 60 + +m.hm.slice(3)) * 6e4; while (t < last) t += 7 * 864e5; last = t; return { ...m, at: new Date(t).toISOString().slice(0, 16) }; });
}
const items = fs.readFileSync(listFile, 'utf8').split('\n').filter(l => l.trim()).map(l => { const [label, dir] = l.trim().split(/\s+/); return { label: 'ONE-' + label.split('-')[1], dir }; });
const out = path.join(import.meta.dirname, 'baselines', new Date().toISOString().replace(/[:.]/g, '-')); fs.mkdirSync(out, { recursive: true });
let k = 0; const listOut = [];
await Promise.all(Array.from({ length: CONC }, async () => { while (k < items.length) {
  const it = items[k++], rows = read(it.dir), c = rows.find(r => r.cast), startAt = rows.find(r => r.posted === true && r.at)?.at; if (!c || !startAt) { console.error(`${it.label}: no cast row or no posted message`); continue; }
  let msgs = null, raw = '', usage; for (let a = 0; a < 2 && !msgs; a++) { ({ text: raw, usage } = await claude(promptFor(c, startAt)).catch(e => { console.error(`${it.label}: ${e.message}`); return { text: '' }; })); msgs = parse(raw, c.names); if (!msgs) console.error(`${it.label}: not in the format${a ? ', giving up' : ', retrying'}`); }
  if (!msgs) continue;
  const dir = path.join(out, it.label); fs.mkdirSync(dir); const dm = dated(msgs, startAt), log = [{ baseline: true, source: it.dir, model: 'haiku', usage }, c];
  dm.forEach((m, i) => { log.push({ who: m.who, text: m.text, posted: true, at: m.at, checkin: m.at }); for (const [emoji, n] of m.reacts) for (let j = 0; j < n; j++) log.push({ who: '', react: emoji, to: i, posted: false, at: m.at }); });
  fs.writeFileSync(path.join(dir, 'log.jsonl'), log.map(r => JSON.stringify(r)).join('\n') + '\n');
  fs.writeFileSync(path.join(dir, 'transcript.txt'), dm.map(m => `--- ${WD[new Date(m.at + ':00Z').getUTCDay()]} ${m.at.slice(11, 16)}, ${m.who}\n${m.text}${m.reacts.length ? `\n(${m.reacts.map(([e, n]) => `${e} ${n}`).join(', ')})` : ''}\n`).join('\n'));
  listOut.push(`${it.label} ${dir}`); console.log(`${it.label}: ${dm.length} messages, ${dm[0].at} to ${dm.at(-1).at}`);
} }));
fs.writeFileSync(path.join(out, 'list.txt'), listOut.sort().join('\n') + '\n'); console.log(`list: ${path.join(out, 'list.txt')}`);

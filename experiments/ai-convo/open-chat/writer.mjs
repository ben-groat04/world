#!/usr/bin/env node
// W2 single writer (plans: notes/diagnoses/w1-diagnosis.md, w2-diagnosis.md; the W1 version is writer-w1.mjs). W2 changes: style is typing only, no appointments in the cast, secrets outside the background, chunks break at 04:00, no "for a story", effort option. Like baseline.mjs (same cast rows in, same log.jsonl / transcript.txt out, same parse/dated), but:
//  - one Haiku call per chunk (first: start to the next 04:00, then 04:00 to 04:00; --days sets the full chunks after it), given the chat so far (item 5): the structure the live app needs;
//  - the cast's example texts are not passed (item 1);
//  - the people block is background: a person's week/habits come up only sometimes (item 2);
//  - a texting block replaces "about N messages"; volume floats (item 3), and in groups of 5+ a few people carry the chat (item 4);
//  - a secret goes after the background (W2 item 3): "Only X knows this, at least at first ... on X's mind";
//  - casting (item 9, `--gen`): the casting call without examples and with a one-sentence style.
//   node writer.mjs <list file> [--days 2] [--conc 3] [--secrets secrets.json] [--prefix W1]
//     list file: "<label> <folder with log.jsonl>" lines (the cast row, setting, topic or opener, start time are read from it, as baseline.mjs does); label "ONE-T11" gives "W1-T11".
//     secrets.json: {"T11": {"Ross": "text"}, ...} keyed by scenario+seed, e.g. T11 (an extra {secrets} row goes in the log).
//   node writer.mjs --gen briefs.json [--days 2]   briefs.json: [{"label": "G1", "people": 3, "brief": "...", "topic": "..."}]: casts first (GEN_ONLY with --days 0), then writes the chats.
//   Writes writer-runs/<timestamp>/<label>/{transcript.txt, log.jsonl} and writer-runs/<timestamp>/list.txt.
import fs from 'node:fs'; import os from 'node:os'; import path from 'node:path'; import { spawn } from 'node:child_process'; import { ENV_NOTE, hhmm } from './prompts.mjs';
const argv = process.argv.slice(2), opt = (k, d) => { const i = argv.indexOf('--' + k); if (i < 0) return d; const v = argv[i + 1]; argv.splice(i, 2); return v; };
const DAYS = +opt('days', 2), CONC = +opt('conc', 3), PREFIX = opt('prefix', 'W1'), EFFORT = opt('effort', process.env.EFFORT || 'low'), SF = opt('secrets'), SECRETS = SF ? JSON.parse(fs.readFileSync(SF, 'utf8')) : {}, GEN = opt('gen'), listFile = argv[0];
if (!listFile && !GEN) { console.error('usage: node writer.mjs <list file> [--days 2] [--conc 3] [--effort low] [--secrets file] | --gen briefs.json'); process.exit(1); }
const cwd = fs.mkdtempSync(path.join(os.tmpdir(), 'open-chat-w1-')), env = Object.fromEntries(Object.entries(process.env).filter(([k]) => !k.startsWith('CLAUDE'))); Object.assign(env, { CLAUDE_CODE_DISABLE_ATTACHMENTS: '1', CLAUDE_CODE_MAX_OUTPUT_TOKENS: '8000', CLAUDE_CONFIG_DIR: fs.mkdtempSync(path.join(os.tmpdir(), 'open-chat-w1-')) });
const SYS = `${ENV_NOTE} You write out the message history of a chat between people who know each other.`;
async function claude(input, sys = SYS) {
  const proc = spawn('claude', ['-p', '--output-format', 'stream-json', '--verbose', '--system-prompt', sys, '--tools', '', '--setting-sources', '', '--exclude-dynamic-system-prompt-sections', '--system-prompt-snapshot', 'off', '--effort', EFFORT, '--model', 'haiku', '--no-session-persistence'], { cwd, env, stdio: ['pipe', 'pipe', 'pipe'] });
  let out = '', err = ''; proc.stdout.on('data', d => out += d); proc.stderr.on('data', d => err += d); proc.stdin.end(input);
  const code = await new Promise(res => { proc.on('error', () => res(-1)); proc.on('close', res); });
  const ev = out.split('\n').filter(Boolean).map(l => JSON.parse(l)), res = ev.find(e => e.type === 'result'); if (code !== 0 || !res || res.is_error) throw new Error(res?.result || err.trim() || `exit ${code}`);
  return { text: ev.filter(e => e.type === 'assistant').flatMap(e => e.message.content).filter(c => c.type === 'text').map(c => c.text.trim()).join('\n\n'), usage: { ...res.usage, thinking_chars: ev.filter(e => e.type === 'assistant').flatMap(e => e.message.content).filter(c => c.type === 'thinking').reduce((n, c) => n + c.thinking.length, 0) } };
}
const WD = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'], p2 = x => String(x).padStart(2, '0'), list = a => a.length < 2 ? a.join('') : a.slice(0, -1).join(', ') + ' and ' + a.at(-1);
const read = dir => fs.readFileSync(path.join(dir, 'log.jsonl'), 'utf8').split('\n').filter(Boolean).map(l => JSON.parse(l));
const iso = t => new Date(t).toISOString().slice(0, 16), stampOf = at => `${WD[new Date(at + ':00Z').getUTCDay()]} ${at.slice(11, 16)}`;

// ---- the writer prompt (items 1-4, 6) ----
// Design wording, not data. The texting block is the plan's item 3 text; the group sentence is item 4; the background sentence is item 2.
const TEXTING = 'This is texting between people who know each other. Messages are short, often fragments. No names unless it would be unclear who is meant, no greetings, thanks or sign-offs as a habit, and nobody restates a plan or repeats what someone just said. Not everyone answers everything: some people say little for hours, a question can sit unanswered, a thread gets dropped, someone goes off on something unrelated. Nobody texts while asleep, and people they are with in person they talk to there. Quiet stretches of hours are normal. Someone who types with capitals and full stops still talks as plainly as everyone else: no polite padding, no full explanations. Write as many messages as these people would really send in this time.';
const BACKGROUND = 'This is background you know as the writer. Their days are ordinary and you know what happens in them; now and then something from someone\'s day comes up, unplanned. A person\'s typing habits show in some messages, not all; most messages are plain.';
const BIGGROUP = 'In a group this size most messages come from two or three people; the others chime in once in a while or say nothing for long stretches.';
const block = c => c.names.map(n => { const p = c.cast[n]; return `${n} (${p.who}). ${p.knows} ${c.private_lines[n]}${p.like ? ' ' + p.like : ''} Usually asleep ${hhmm(c.sleep[n][0])} to ${hhmm(c.sleep[n][1])}. ${p.texts} How ${n} types, when it shows: ${p.style}`; }).join('\n\n');
const secretLines = secrets => Object.entries(secrets ?? {}).map(([n, s]) => `Only ${n} knows this, at least at first: ${s.replace(/\s*$/, '')} It is on ${n}'s mind; ${n} may hint at it or tell someone in the chat when it fits, or not yet. Nobody else knows it until ${n} says it in the chat.`).join('\n');
const transcript = ms => ms.map(m => `--- ${stampOf(m.at)}, ${m.who}\n${m.text}${m.reacts.length ? `\n(${m.reacts.map(([e, n]) => `${e} ${n}`).join(', ')})` : ''}\n`).join('\n');
const spanHours = (from, to) => Math.round((+new Date(to + ':00Z') - +new Date(from + ':00Z')) / 36e5);
function promptFor(c, secrets, so_far, from, to) {
  const group = c.names.length > 2, chat = group ? 'group chat' : 'chat', first = c.names[0];
  const opening = so_far.length ? '' : `\n\n${c.topic ? `${first} has this on their mind and starts the chat with it: ${c.topic}` : `${first} picks up the phone to ${c.opener.replace(/\.$/, '')}.`}`;
  const span = so_far.length ? `Continue the chat. Write the messages from ${stampOf(from)} to ${stampOf(to)} (${spanHours(from, to)} hours), in the order they were sent, picking up after the last message above. The chat goes on after that and is written separately: stop at ${stampOf(to)}.` : `Write the messages from ${stampOf(from)} to ${stampOf(to)} (${spanHours(from, to)} hours), in the order they were sent, starting with ${first}'s first message at ${stampOf(from)}. The chat goes on after that and is written separately: stop at ${stampOf(to)}.`;
  return `These people are in a ${chat}: ${list(c.names.map(n => `${n} (${c.cast[n].who})`))}. ${c.situation || 'They are friends.'}\nSetting: ${c.setting}\n\n${block(c)}\n\n${BACKGROUND}${secrets ? '\n\n' + secretLines(secrets) : ''}${opening}\n\nThe chat so far:\n${so_far.length ? transcript(so_far) : '(nothing yet)'}\n\n${span}\n\n${TEXTING}${c.names.length >= 5 ? ' ' + BIGGROUP : ''}\n\nWrite each message as a header line "--- Mon 19:41, Name" (weekday, 24-hour time, the sender), then the message text, then a blank line. If a message got emoji reactions, put a line like "(\u{1F44D} 2, \u{1F602} 1)" directly under it. Reply with only the new messages.`;
}
// baseline.mjs's parse/dated (same format), with a minimum count: a later day may be quiet.
function parse(text, names, min) {
  const msgs = []; for (const b of text.split(/^(?=--- )/m).filter(x => x.startsWith('--- '))) {
    const m = b.match(/^--- (\w{3}) (\d{1,2}):(\d\d), ([^\n]+)\n([\s\S]*)$/); if (!m || !WD.includes(m[1]) || !names.includes(m[4].trim()) || +m[2] > 23) return null;
    const body = m[5].trim().split('\n'), last = body.at(-1)?.trim(), rc = last?.match(/^\(((?:\p{Extended_Pictographic}️?[^,()]*? \d+)(?:, \p{Extended_Pictographic}️?[^,()]*? \d+)*)\)$/u);
    msgs.push({ who: m[4].trim(), text: (rc ? body.slice(0, -1) : body).join('\n').trim(), wd: WD.indexOf(m[1]), hm: `${p2(m[2])}:${m[3]}`, reacts: rc ? rc[1].split(', ').map(x => { const k = x.lastIndexOf(' '); return [x.slice(0, k), +x.slice(k + 1)]; }) : [] });
  } return msgs.length >= min && msgs.every(m => m.text) ? msgs : null;
}
function dated(msgs, startAt) {
  const day0 = new Date(startAt.slice(0, 10) + 'T00:00:00Z'); let last = +new Date(startAt + ':00Z') - 1;
  return msgs.map(m => { let t = +day0 + (((m.wd - day0.getUTCDay()) + 7) % 7) * 864e5 + (+m.hm.slice(0, 2) * 60 + +m.hm.slice(3)) * 6e4; while (t < last) t += 7 * 864e5; last = t; return { ...m, at: iso(t) }; });
}
// Chunks break at 04:00, when the chat is quietest: the first runs from the start to the next 04:00 (the one after, if that is under 6 h away), then 04:00 to 04:00; DAYS full chunks follow the first.
function chunkEnds(startAt, days) {
  const t0 = +new Date(startAt + ':00Z'), d = new Date(t0); d.setUTCHours(4, 0, 0, 0); let t = +d; while (t <= t0) t += 864e5; if (t - t0 < 6 * 36e5) t += 864e5;
  return Array.from({ length: days + 1 }, (_, k) => iso(t + k * 864e5));
}
// One day: the parsed messages must fall inside [from, to] (a stamp before `from` or going back in time jumps a week ahead in dated(): reject and retry; a few stamps past `to` are dropped).
async function writeDay(c, secrets, so_far, from, to, label) {
  const min = so_far.length ? 2 : 5, usages = [];
  for (let a = 0; a < 3; a++) {
    const r = await claude(promptFor(c, secrets, so_far, from, to)).catch(e => { console.error(`${label}: ${e.message}`); return null; }); if (!r) continue; usages.push(r.usage);
    const ms = parse(r.text, c.names, min); if (!ms) { console.error(`${label}: not in the format, ${a < 2 ? 'retrying' : 'giving up'}`); continue; }
    const dm = dated(ms, from), limit = +new Date(to + ':00Z');
    if (dm.some(m => +new Date(m.at + ':00Z') > limit + 12 * 36e5)) { console.error(`${label}: stamps out of order or before the span, ${a < 2 ? 'retrying' : 'giving up'}`); continue; }
    return { dm: dm.filter(m => +new Date(m.at + ':00Z') <= limit), usages };
  } return null;
}

// ---- casting (item 9): run.mjs's casting call without examples, one plain sentence of style ----
const GENSYS = `${ENV_NOTE} You write short background details about characters for a story.`;
const likeSpec = 'in the second person, one or two short sentences: your temperament and sense of humour, and what you have opinions about. An ordinary person, not a type.';
const castPrompt = (N, brief, topic) => { const P = k => `Person ${k + 1}`, chat = N > 2 ? 'group chat' : 'chat';
  return `These ${N} people, ${P(0)} to ${P(N - 1)}, are in a ${chat}. ${brief || 'They are friends.'}${topic ? ` ${P(0)} has this on their mind: ${topic}` : ''}

Cast them as one coherent group, working from the situation above however short it is. Every role it names (parent, adult child, partner, ex, neighbour, team-mate, ...) goes to exactly one person, and if it is written from one person's side ("my ex", "me and my mum") that person is Person 1, and the lines must agree with each other (the same place, the same way of knowing each other). People in a group of one cohort (old friends, a team, flatmates) text in much the same register as each other; family members can differ.

If the situation doesn't already say where they live, first privately list 12 quite different places in different regions where these people could plausibly live, then use place number ${1 + Math.floor(Math.random() * 12)} (don't print the list).

Reply with only these lines, each on one line, in this order:
First, one line per person: "Person k name:" and a first name (one word) that fits the place, culture and age of that person, all different.
Then one line starting "Setting:": a few sentences in the second person for ${N > 2 ? 'the whole group' : 'both of them'}, saying where you ${N > 2 ? 'all ' : 'both '}live (that place), how you know each other and what you ${N > 2 ? 'all ' : 'both '}already know about each other; if the situation implies you have been in touch before, also what you last talked about, which must be unrelated small talk, not the topic.${topic ? ' If the topic concerns something you share include the facts you all know about it.' : ''}
Then, for each person in turn, these lines, each starting with that person's name from their "Person k name:" line:
"<name> is:" their age, gender and role in this situation, in a few words, e.g. "58, woman, the parent".
"<name> knows:" in the second person ('You ...'), who each of the others is to you and what you know about them, a short sentence each.
"<name> life:" in the second person ('You ...'), where you live, your occupation, who you live with and how your days usually go. Ordinary circumstances that fit the situation; no appointments or events for this week. Describe the life, not how you behave in the chat.
"<name> is like:" ${likeSpec}
"<name> sleeps:" the hours they usually sleep as HH:MM-HH:MM, following from their life (most people sleep overnight).
"<name> texts:" one plain sentence, in the second person, on how often you message in this chat without being asked anything, as follows from your life and the group. Use frequency words ("now and then", "mostly") rather than "always".
"<name> style:" one plain sentence, in the second person, on how you type: capitals, punctuation, emoji, abbreviations. Only the typing, not tone, length or politeness; most people type in a fairly ordinary way.${topic ? '' : `
Last, one line starting "<name of ${P(0)}> opens with:", saying in a few words, starting with a verb, what ${P(0)} picks up the phone to send ${N > 2 ? 'the group' : 'the other'} tonight, fitting the situation.`}`; };
const fieldOf = (text, k) => text.match(new RegExp(`^\\W*${k}[*_\\s]*:[*_\\s]*(.+)$`, 'im'))?.[1].trim();
function parseCast(text, N, topic) {
  const f = k => fieldOf(text, k)?.replace(new RegExp(`^${k}\\s*:\\s*`), ''), names = Array.from({ length: N }, (_, k) => f(`Person ${k + 1} name`)?.replace(/[*_"']/g, '').trim());
  if (!names.every(x => x && /^[\p{L}\p{M}-]+$/u.test(x)) || new Set(names.map(x => x.toLowerCase())).size < N) return null;
  const c = { names, setting: f('Setting'), opener: topic ? '' : f(`${names[0]} opens with`), cast: {}, private_lines: {}, sleep: {} };
  for (const n of names) { const h = f(`${n} sleeps`)?.match(/(\d{1,2})(?::(\d\d))?\s*(?:-|–|to)\s*(\d{1,2})(?::(\d\d))?/); if (h) c.sleep[n] = [+h[1] + +(h[2] ?? 0) / 60, +h[3] + +(h[4] ?? 0) / 60];
    c.cast[n] = { who: f(`${n} is`)?.replace(/[.\s]+$/, ''), knows: f(`${n} knows`), like: f(`${n} is like`), texts: f(`${n} texts`), style: f(`${n} style`), ex: [] }; c.private_lines[n] = f(`${n} life`); }
  return c.setting && (topic || c.opener) && names.every(n => Object.values(c.cast[n]).every(v => v !== undefined) && c.private_lines[n] && c.sleep[n]) && c;
}

// ---- run ----
const out = path.join(import.meta.dirname, 'writer-runs', new Date().toISOString().replace(/[:.]/g, '-')); fs.mkdirSync(out, { recursive: true });
let items;
if (GEN) items = JSON.parse(fs.readFileSync(GEN, 'utf8')).map(b => ({ label: b.label, gen: b })); else items = fs.readFileSync(listFile, 'utf8').split('\n').filter(l => l.trim()).map(l => { const [label, dir] = l.trim().split(/\s+/); return { label: `${PREFIX}-${label.split('-')[1]}`, scen: label.split('-')[1], dir }; });
let k = 0, listOut = [];
await Promise.all(Array.from({ length: CONC }, async () => { while (k < items.length) {
  const it = items[k++]; let c, startAt, source = it.dir;
  if (it.gen) { let r = null; for (let a = 0; a < 2 && !r; a++) { const j = await claude(castPrompt(it.gen.people, it.gen.brief, it.gen.topic), GENSYS).catch(e => (console.error(`${it.label}: ${e.message}`), null)); r = j && parseCast(j.text, it.gen.people, it.gen.topic); if (r) r.usage = j.usage; } if (!r) { console.error(`${it.label}: casting failed`); continue; }
    c = { ...r, situation: it.gen.brief ?? null, topic: it.gen.topic ?? null }; startAt = '2026-11-23T19:00'; }
  else { const rows = read(it.dir); c = rows.find(r => r.cast); startAt = rows.find(r => r.posted === true && r.at)?.at; if (!c || !startAt) { console.error(`${it.label}: no cast row or no posted message`); continue; } }
  const secrets = it.scen && SECRETS[it.scen] || null, dir = path.join(out, it.label); fs.mkdirSync(dir);
  const all = [], usage = []; let ok = true;
  const cuts = chunkEnds(startAt, DAYS);
  for (let d = 0; d < cuts.length; d++) { const from = d ? cuts[d - 1] : startAt, to = cuts[d], r = await writeDay(c, secrets, all, from, to, it.label); if (!r) { ok = false; break; } all.push(...r.dm); usage.push(...r.usages); console.log(`${it.label}: day ${d + 1}: ${r.dm.length} messages`); }
  if (!ok && !all.length) continue;
  const log = [{ writer: 'w2', source, model: 'haiku', effort: EFFORT, days: DAYS, complete: ok, usage }, c, ...(secrets ? [{ secrets }] : [])];
  all.forEach((m, i) => { log.push({ who: m.who, text: m.text, posted: true, at: m.at, checkin: m.at }); for (const [emoji, n] of m.reacts) for (let j = 0; j < n; j++) log.push({ who: '', react: emoji, to: i, posted: false, at: m.at }); });
  fs.writeFileSync(path.join(dir, 'log.jsonl'), log.map(r => JSON.stringify(r)).join('\n') + '\n'); fs.writeFileSync(path.join(dir, 'transcript.txt'), transcript(all));
  listOut.push(`${it.label} ${dir}`); console.log(`${it.label}: ${all.length} messages, ${all[0].at} to ${all.at(-1).at}`);
} }));
fs.writeFileSync(path.join(out, 'list.txt'), listOut.sort().join('\n') + '\n'); console.log(`list: ${path.join(out, 'list.txt')}`);

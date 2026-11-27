#!/usr/bin/env node
// W10 single writer (plan: notes/diagnoses/w10-diagnosis.md; the W9 version is writer-w9.mjs). W10 changes: the Setting names shared current business; no sleep line; lives-with only for real households; parse stops at the @claude message and attaches a reaction-only block to the message before it.
// W9 single writer (plan: notes/diagnoses/w9-diagnosis.md; the W8 version is writer-w8.mjs). W9 changes: the writing unit is a day again (W7's, @claude cuts and resumes it); emoji are kept or dropped per message in code (emojiKeep per person); the life line is one plain sentence and knows is the relation only; people who are in the same place stop texting each other; eight work options to pick from. W8 single writer (plan: notes/diagnoses/w8-diagnosis.md; the W7 version is writer-w7.mjs). W8 changes: a call writes the next stretch of the chat (until it goes quiet), not a day, and each stretch is released as soon as it is written; chat volume is drawn per person in code and the cast has no texts or style line; the background says the others know each other's lives and carries no daily routine; topic briefs get opener options too; @claude gives the answer, not its search (effort medium). W7 single writer (plan: notes/diagnoses/w7-diagnosis.md; the W6 version is writer-w6.mjs). W7 changes: list fields split on commas and semicolons; the place is decided in casting call 1 from the situation and topic (the code's draw is only the fallback); style says how much, not which tokens; knows is the relation, texts is how often, the setting no longer says what they know about each other; the opener is picked in code from four options; spans name the day and night the chunk ends on and messages past the chunk end are kept; @claude gives no Sources line; a family's names fit one family. W6 single writer (the W5 version is writer-w5.mjs). W6 changes: no silent-day allowance and no offline-note channel; stamps are read as written and sorted (no clamp); the writer and Claude are told today's date; casting in two calls (who they are, names and work picked in code; then the lives), no type labels or temperament line, a style line only when there is one; the topic is on the opener's mind, not pasted in as the first message; batch runs draw their own start; @claude is a text-message answer from found pages only, and characters get by when it can't find something; a photo, link or file sent is a message like "[photo: the bill]". W5 single writer (plan: notes/diagnoses/w5-diagnosis.md; the W4 version is writer-w4.mjs). W5 changes: casting keeps what the situation says the participants are and invents no world facts; the writer says nothing untrue about the world, @claude gets the chat and answers as a chat message; capitals are applied by code from a per-person yes/no; days are not episodes (a day may be silent, no bedtime close); later days do not restate the opening situation; bracketed offline lines [..] for what happens off the phone; a same-weekday backwards stamp is an ordering slip, not a week jump. W4 single writer (plan: notes/diagnoses/w4-diagnosis.md). W4 changes: the span lines name the weekday after midnight, a later day continues from the last message (not from a fixed 04:00) and rejected chunks are saved (rejects.txt); (the style line stays: dropping it was tried and aborted, see ITERATIONS); the log is written after every day; --live runs one brief from the viewer's Start form and releases turns on the story clock (see README "Viewer"); with oracle on, a message starting "@claude" cuts the day and Claude's answer is posted before the day resumes; (a delete-only pass, cut.mjs, was tried and lost the blind check: see ITERATIONS, W4). W3 single writer (plans: notes/diagnoses/w1..w3-diagnosis.md; the W2 version is writer-w2.mjs, the W1 version writer-w1.mjs). W3 changes: each call writes one waking day with no end time to fill, effort medium by default, no "last talked about" in the setting, plain content (temperament-only like-line, unremarkable messages). W2 notes:. W2 changes: style is typing only, no appointments in the cast, secrets outside the background, chunks break at 04:00, no "for a story", effort option. Like baseline.mjs (same cast rows in, same log.jsonl / transcript.txt out, same parse/dated), but:
//  - one Haiku call per chunk (first: start to the next 04:00, then 04:00 to 04:00; --days sets the full chunks after it), given the chat so far (item 5): the structure the live app needs;
//  - the cast's example texts are not passed (item 1);
//  - the people block is background: a person's week/habits come up only sometimes (item 2);
//  - a texting block replaces "about N messages"; volume floats (item 3), and in groups of 5+ a few people carry the chat (item 4);
//  - a secret goes after the background (W2 item 3): "Only X knows this, at least at first ... on X's mind";
//  - casting (`--gen`): the casting call without examples; no style or texts line (volume is drawn in code).
//   node writer.mjs <list file> [--days 2] [--conc 3] [--secrets secrets.json] [--prefix W1]
//     list file: "<label> <folder with log.jsonl>" lines (the cast row, setting, topic or opener, start time are read from it, as baseline.mjs does); label "ONE-T11" gives "W1-T11".
//     secrets.json: {"T11": {"Ross": "text"}, ...} keyed by scenario+seed, e.g. T11 (an extra {secrets} row goes in the log).
//   node writer.mjs --gen briefs.json [--days 2]   briefs.json: [{"label": "G1", "people": 3, "brief": "...", "topic": "..."}]: casts first (GEN_ONLY with --days 0), then writes the chats.
//   node writer.mjs --live spec.json [--out dir] [--speed 60]   spec.json: {situation, topic, people, secrets: {"Maya": "..."}, model, oracle, start?, days?}; writes the run as --gen does and releases it to <out> (default <run dir>/export): run.json and turn-XXXX.json files in the viewer's live format, each turn at its story time / speed (1 story minute = 60/speed s); prints RUN/TURN/DONE <file> lines.
//   Other options: --model haiku|sonnet (the writer and the casting call), --oracle (the @claude line; answers by ORACLE_MODEL, default sonnet).
//   Writes writer-runs/<timestamp>/<label>/{transcript.txt, log.jsonl} and writer-runs/<timestamp>/list.txt.
import fs from 'node:fs'; import os from 'node:os'; import path from 'node:path'; import { spawn } from 'node:child_process'; import { ENV_NOTE } from './prompts.mjs';
const argv = process.argv.slice(2), opt = (k, d) => { const i = argv.indexOf('--' + k); if (i < 0) return d; const v = argv[i + 1]; argv.splice(i, 2); return v; };
const flag = k => { const i = argv.indexOf('--' + k); if (i < 0) return false; argv.splice(i, 1); return true; };
const ORACLE_FLAG = flag('oracle'), LIVE = opt('live'), LIVE_OUT = opt('out'), SPEED = +opt('speed', 60), MODEL0 = opt('model', 'haiku'), ORACLE_MODEL = process.env.ORACLE_MODEL || 'sonnet';
const DAYS = +opt('days', 2), CONC = +opt('conc', 3), PREFIX = opt('prefix', 'W1'), EFFORT = opt('effort', process.env.EFFORT || 'medium'), SF = opt('secrets'), SECRETS = SF ? JSON.parse(fs.readFileSync(SF, 'utf8')) : {}, GEN = opt('gen'), listFile = argv[0];
if (!listFile && !GEN && !LIVE) { console.error('usage: node writer.mjs <list file> [--days 2] [--conc 3] [--effort medium] [--secrets file] | --gen briefs.json | --live spec.json'); process.exit(1); }
let MODEL = MODEL0, ORACLE = ORACLE_FLAG;
const cwd = fs.mkdtempSync(path.join(os.tmpdir(), 'open-chat-w1-')), env = Object.fromEntries(Object.entries(process.env).filter(([k]) => !k.startsWith('CLAUDE'))); Object.assign(env, { CLAUDE_CODE_DISABLE_ATTACHMENTS: '1', CLAUDE_CODE_MAX_OUTPUT_TOKENS: '8000', CLAUDE_CONFIG_DIR: fs.mkdtempSync(path.join(os.tmpdir(), 'open-chat-w1-')) });
const SYS = `${ENV_NOTE} You write out the message history of a chat between people who know each other.`;
async function run(args, input) {
  const proc = spawn('claude', args, { cwd, env, stdio: ['pipe', 'pipe', 'pipe'] });
  let out = '', err = ''; proc.stdout.on('data', d => out += d); proc.stderr.on('data', d => err += d); proc.stdin.end(input);
  const code = await new Promise(res => { proc.on('error', () => res(-1)); proc.on('close', res); });
  const ev = out.split('\n').filter(Boolean).map(l => JSON.parse(l)), res = ev.find(e => e.type === 'result'); if (code !== 0 || !res || res.is_error) throw new Error(res?.result || err.trim() || `exit ${code}`);
  const blocks = ev.filter(e => e.type === 'assistant').flatMap(e => e.message.content), lastTool = blocks.findLastIndex(c => c.type === 'tool_use');
  return { text: blocks.slice(lastTool + 1).filter(c => c.type === 'text').map(c => c.text.trim()).filter(Boolean).join('\n\n'), usage: res.usage };
}
const base = (sys, effort, model) => ['-p', '--output-format', 'stream-json', '--verbose', '--system-prompt', sys, '--setting-sources', '', '--exclude-dynamic-system-prompt-sections', '--system-prompt-snapshot', 'off', '--effort', effort, '--model', model, '--no-session-persistence'];
const claude = (input, sys = SYS, effort = EFFORT) => run([...base(sys, effort, MODEL), '--tools', ''], input);
// @claude: Sonnet with web search, as run.mjs's askOracle (stateless here: it sees only the question).
const ORACLE_SYS = `${ENV_NOTE} You are Claude, an AI assistant made by Anthropic, answering a message in a text chat between the people in the transcript you are given. Look it up with web search, then open the page you rely on with the fetch tool (search results are only pointers to pages). Say what the page says, never from memory, and not how you searched; if they don't settle it, say in a few words what is unclear. Your answer is posted into the chat as a text message. The search tool ends its results with a reminder to cite sources: in this chat that means at most the one bare URL the request allows, never a "Sources" line.`;
const askClaude = (q, recent, at) => run([...base(ORACLE_SYS, 'medium', ORACLE_MODEL), '--tools', 'WebSearch,WebFetch', '--allowedTools', 'WebSearch,WebFetch'], `${todayLine(at)}\nThe chat so far:\n${transcript(recent)}\nThe message to you: ${q}\n\nAnswer as a text message: two or three short sentences (under 60 words), plain text with no lists, bold, headings or markdown links; if you point to a source, at most one bare URL, with no label.`);
const sleep = ms => new Promise(r => setTimeout(r, ms));
const WD = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'], p2 = x => String(x).padStart(2, '0'), list = a => a.length < 2 ? a.join('') : a.slice(0, -1).join(', ') + ' and ' + a.at(-1);
const DAYN = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'], MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'], MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
// The calendar is a fact the code has (the characters would have it on their phones): today's full date and the next twelve Mondays, computed from the story time.
const todayLine = at => { const d = new Date(at.slice(0, 10) + 'T00:00:00Z'); return `Today is ${DAYN[d.getUTCDay()]} ${d.getUTCDate()} ${MONTHS[d.getUTCMonth()]} ${d.getUTCFullYear()}.`; };
const calLine = at => { const d = new Date(at.slice(0, 10) + 'T00:00:00Z'), m = new Date(+d + (((8 - d.getUTCDay()) % 7) || 7) * 864e5); return `${todayLine(at)} The next Mondays: ${Array.from({ length: 12 }, (_, k) => { const x = new Date(+m + k * 7 * 864e5); return `${x.getUTCDate()} ${MON[x.getUTCMonth()]}`; }).join(', ')}.`; };
const read = dir => fs.readFileSync(path.join(dir, 'log.jsonl'), 'utf8').split('\n').filter(Boolean).map(l => JSON.parse(l));
const iso = t => new Date(t).toISOString().slice(0, 16), stampOf = at => `${WD[new Date(at + ':00Z').getUTCDay()]} ${at.slice(11, 16)}`;

// ---- the writer prompt (items 1-4, 6) ----
// Design wording, not data. The texting block is the plan's item 3 text; the group sentence is item 4; the background sentence is item 2.
const TEXTING = 'This is texting between people who know each other. Messages are short, often fragments. No names unless it would be unclear who is meant, no greetings, thanks or sign-offs as a habit, and nobody restates a plan or repeats what someone just said. Not everyone answers everything: some people say little for hours, a question can sit unanswered, a thread gets dropped, someone goes off on something unrelated. What anyone says about the real world is true or plainly unsure. Quiet stretches of hours are normal. Most messages are unremarkable (a plain answer, a time, ok, a half-thought); nobody is writing for an audience, so jokes are occasional and often fall flat. Once people are in the same place they stop texting each other until they are apart again. Write as many messages as these people would really send in this time.';
const BACKGROUND = 'This is background you know as the writer. The others know about each other\'s lives what people who know each other this way would, so nobody tells them what they already know. Their days are ordinary; now and then something from someone\'s day comes up, unplanned. A person\'s typing habits show in some messages, not all; most messages are plain.';
const block = c => c.names.map(n => { const p = c.cast[n]; return `${n} (${p.who}). ${p.knows} ${c.private_lines[n]}${p.texts ? ' ' + p.texts : ''}${p.lives?.length ? ` ${n} lives with ${list(p.lives)}.` : ''}${p.style && !/^\W*none\b/i.test(p.style) ? ` How ${n} types, when it shows: ${p.style}` : ''}`; }).join('\n\n');
const secretLines = secrets => Object.entries(secrets ?? {}).map(([n, s]) => `Only ${n} knows this, at least at first: ${s.replace(/\s*$/, '')} It is on ${n}'s mind; ${n} may hint at it or tell someone in the chat when it fits, or not yet. Nobody else knows it until ${n} says it in the chat.`).join('\n');
const transcript = ms => ms.map(m => `--- ${stampOf(m.at)}, ${m.who}\n${m.text}${m.reacts.length ? `\n(${m.reacts.map(([e, n]) => `${e} ${n}`).join(', ')})` : ''}\n`).join('\n');
const ASK = 'Anyone can ask Claude, an AI assistant in this chat that reads it and searches the web, by putting "@claude" in a message, written like any other message; stop right after such a message. Nobody states a fact about the real world (news, research, timetables, prices, opening hours, rules, history) that they would not know offhand unless Claude has posted it; if Claude couldn\'t find it, they get by without it.';
// resume: the stamp after Claude's answer, when the day is being continued after an @claude question.
function promptFor(c, secrets, so_far, from, to, resume, dayStart) {
  const night = WD[new Date(to + ':00Z').getUTCDay()], last = DAYN[new Date(+new Date(to + ':00Z') - 864e5).getUTCDay()], through = `${last} and ${last} night (a message after midnight on ${last} night is headed ${night}`, group = c.names.length > 2, chat = group ? 'group chat' : 'chat', first = c.names[0], h = +from.slice(11, 13);
  const opening = so_far.length ? '' : `\n\n${c.topic ? `${first} has this on their mind: ${c.topic}${c.opener ? ` ${first} picks up the phone to ${c.opener.replace(/\.$/, '')}.` : ''}` : `${first} picks up the phone to ${c.opener.replace(/\.$/, '')}.`}`;
  const span = resume ? `Continue the chat from ${stampOf(from)}, through ${through}). The next day is written separately.`
    : so_far.length ? `Continue the chat from after the last message above, in the order the messages were sent, through ${through}). The next day is written separately.`
    : `Write the messages in the order they were sent, starting with ${first}'s first message at ${stampOf(from)}, through ${last === DAYN[new Date(from + ':00Z').getUTCDay()] ? `tonight (a message after midnight is headed ${night}` : `tomorrow, ${through}`}, e.g. "${night} 00:40"). The next day is written separately.`;
  return `These people are in a ${chat}: ${list(c.names.map(n => `${n} (${c.cast[n].who})`))}.${so_far.length ? '' : ` ${c.situation || 'They are friends.'}`}\nSetting: ${c.setting}\n\n${block(c)}\n\n${BACKGROUND}${secrets ? '\n\n' + secretLines(secrets) : ''}${opening}\n\nThe chat so far:\n${so_far.length ? transcript(so_far) : '(nothing yet)'}\n\n${calLine(dayStart)}\n${span}\n\n${TEXTING}${ORACLE ? ' ' + ASK : ''}\n\nWrite each message as a header line "--- Mon 19:41, Name" (weekday, 24-hour time, the sender), then the message text, then a blank line. If a message got emoji reactions, put a line like "(\u{1F44D} 2, \u{1F602} 1)" directly under it. Something sent that isn't text (a photo, screenshot, voice note, link or file) is a message of its own, like "[photo: the bill]" or "[link: the cabin listing]". Reply with only the new messages.`;
}
// baseline.mjs's parse/dated (same format). An empty or unparseable reply is retried like any bad reply.
const ASKS = /@claude\b/i;
function parse(text, names, min, stop) {
  const msgs = [], blocks = text.split(/^(?=--- )/m); if (!blocks[0].startsWith('--- ')) blocks.shift();
  for (const b of blocks) {
    const m = b.match(/^--- (\w{3}) (\d{1,2}):(\d\d), ([^\n]+)\n([\s\S]*)$/); if (!m || !WD.includes(m[1]) || !names.includes(m[4].trim()) || +m[2] > 23) return null;
    const body = m[5].trim().split('\n'), last = body.at(-1)?.trim(), rc = last?.match(/^\(((?:\p{Extended_Pictographic}\uFE0F?[^,()]*? \d+)(?:, \p{Extended_Pictographic}\uFE0F?[^,()]*? \d+)*)\)$/u);
    const text = (rc ? body.slice(0, -1) : body).join('\n').trim(), reacts = rc ? rc[1].split(', ').map(x => { const k = x.lastIndexOf(' '); return [x.slice(0, k), +x.slice(k + 1)]; }) : [];
    if (!text && reacts.length && msgs.length) { msgs.at(-1).reacts.push(...reacts); continue; } // a block of only a reaction line belongs to the message before it
    msgs.push({ who: m[4].trim(), text, wd: WD.indexOf(m[1]), hm: `${p2(m[2])}:${m[3]}`, reacts });
    if (stop && ASKS.test(msgs.at(-1).text)) break;
  }
  return msgs.length && msgs.length >= min && msgs.every(m => m.text) ? msgs : null;
}
// Stamps are read as written (weekday and time; a message after midnight carries the next weekday) and the chunk is sorted by time: the writer sometimes goes back to a thread, and the time it wrote is the time it meant. A stamp before the chunk's start is a header slip and takes the start (never earlier than what is already released). A weekday that lands too far ahead is caught in chunk().
function dated(msgs, startAt) {
  const day0 = new Date(startAt.slice(0, 10) + 'T00:00:00Z'), t0 = +new Date(startAt + ':00Z');
  return msgs.map(m => ({ ...m, at: iso(Math.max(t0, +day0 + (((m.wd - day0.getUTCDay()) + 7) % 7) * 864e5 + (+m.hm.slice(0, 2) * 60 + +m.hm.slice(3)) * 6e4)) })).sort((a, b) => a.at < b.at ? -1 : a.at > b.at ? 1 : 0);
}
// Capitals are what the phone does to the letters, not a register: for a person cast with capitals "yes" the code capitalises the first letter of the message and of each sentence and a standalone "i"; everything else stays as written (casts without the field are left alone).
const caps = t => t.replace(/^\p{Ll}/u, x => x.toUpperCase()).replace(/([.!?]\s+)(\p{Ll})/gu, (_, a, x) => a + x.toUpperCase()).replace(/(?<![\p{L}\p{N}'’.-])i(?![\p{L}\p{N}.-])/gu, 'I');
// Emoji are decided per message here, like capitals: a person cast with emojiKeep (a design parameter drawn in parseCast) keeps the emoji in a message with that probability and otherwise has them taken out (with a joiner, variation selector or skin tone after them) and the spaces tidied. A message that is only emoji stays as written. Casts without the field are left alone. Asked for per-person levels, the writer put the same emoji on every message.
const EMOJI = /\p{Extended_Pictographic}(?:\uFE0F|\u200D\p{Extended_Pictographic}|[\u{1F3FB}-\u{1F3FF}])*/gu;
const emojiDrop = (t, keep) => { const o = t.replace(EMOJI, '').replace(/\uFE0F/g, '').replace(/[^\S\n]{2,}/g, ' ').replace(/[^\S\n]+([,.!?;:])/g, '$1').replace(/[^\S\n]+$/gm, '').replace(/^[^\S\n]+/gm, '').trim(); return o && Math.random() >= keep ? o : t; };
// Chunks break at 04:00, when the chat is quietest: the first runs from the start to the next 04:00 (the one after, if that is under 6 h away), then 04:00 to 04:00; DAYS full chunks follow the first.
function chunkEnds(startAt, days) {
  const t0 = +new Date(startAt + ':00Z'), d = new Date(t0); d.setUTCHours(4, 0, 0, 0); let t = +d; while (t <= t0) t += 864e5; if (t - t0 < 6 * 36e5) t += 864e5;
  return Array.from({ length: days + 1 }, (_, k) => iso(t + k * 864e5));
}
// One chunk (an @claude message ends it early, so the usual minimum count is lowered to 1 when one is present): the parsed messages must fall inside [from, to] (a stamp more than 12 h past `to`, such as a week ahead after dated(), is rejected and retried; stamps up to 12 h past `to` are kept and the next day starts after them). Rejected texts are kept in rejects.txt.
async function chunk(c, secrets, so_far, from, to, label, min, resume, dayStart, stop) {
  const usages = [];
  for (let a = 0; a < 3; a++) {
    const r = await claude(promptFor(c, secrets, so_far, from, to, resume, dayStart)).catch(e => { console.error(`${label}: ${e.message}`); return null; }); if (!r) continue; usages.push(r.usage);
    const ms = parse(r.text, c.names, ORACLE && ASKS.test(r.text) ? Math.min(min, 1) : min, stop); if (!ms) { console.error(`${label}: not in the format, ${a < 2 ? 'retrying' : 'giving up'}`); fs.appendFileSync(path.join(out, 'rejects.txt'), `=== ${label} ${from} to ${to}, attempt ${a + 1} (format)\n${r.text}\n\n`); continue; }
    const dm = dated(ms, from).map(m => { const p = c.cast[m.who]; return { ...m, text: (p?.capitals ? caps : x => x)(p?.emojiKeep !== undefined ? emojiDrop(m.text, p.emojiKeep) : m.text) }; }), limit = +new Date(to + ':00Z');
    if (dm.some(m => +new Date(m.at + ':00Z') > limit + 12 * 36e5)) { console.error(`${label}: stamps out of order or before the span, ${a < 2 ? 'retrying' : 'giving up'}`); fs.appendFileSync(path.join(out, 'rejects.txt'), `=== ${label} ${from} to ${to}, attempt ${a + 1}\n${r.text}\n\n`); usages.rejected = (usages.rejected ?? 0) + 1; continue; }
    return { dm, usages };
  } return usages.length ? { dm: null, usages } : null;
}
const MAX_ASKS = 5; // design parameter: questions answered per day
// One day. With the oracle on, a message starting "@claude" ends the chunk there: Claude's answer is posted (stamped after the real call time), and the same day is resumed from that stamp.
async function writeDay(c, secrets, so_far, from, to, label, dayStart) {
  const day = [], usages = []; let resume = null, rejects = 0;
  for (let asks = 0; ; asks++) {
    const r = await chunk(c, secrets, [...so_far, ...day], resume ?? from, to, label, resume ? 1 : so_far.length ? 0 : 5, !!resume, dayStart, ORACLE && asks < MAX_ASKS);
    if (!r) return day.length ? { dm: day, usages, rejects } : null; usages.push(...r.usages); rejects += r.usages.rejected ?? 0;
    if (!r.dm) return day.length ? { dm: day, usages, rejects } : null;
    const i = ORACLE && asks < MAX_ASKS ? r.dm.findIndex(m => ASKS.test(m.text)) : -1;
    if (i < 0) { day.push(...r.dm); return { dm: day, usages, rejects }; }
    const q = r.dm[i], t0 = Date.now(); day.push(...r.dm.slice(0, i + 1));
    const a = await askClaude(q.text.trim().replace(ASKS, '').trim(), [...so_far, ...day].slice(-30), q.at).catch(e => (console.error(`${label}: @claude failed: ${e.message}`), null));
    const at = iso(Math.max(+new Date(q.at + ':00Z') + 6e4, +new Date(q.at + ':00Z') + Math.ceil((Date.now() - t0) / 6e4) * 6e4));
    day.push({ who: 'Claude', text: a?.text || "I couldn't look that up just now.", oracle: true, question: q.text, wd: new Date(at + ':00Z').getUTCDay(), hm: at.slice(11, 16), reacts: [], at }); if (a) usages.push(a.usage); resume = at;
    console.log(`${label}: @claude at ${stampOf(q.at)}`);
  }
}
// ---- casting: two calls, no examples ----
const GENSYS = `${ENV_NOTE} You write short background details about the participants of a simulated chat.`;
// Where people live when the brief doesn't say: drawn in code from this list (a design choice for variety, not data about the places). Asked to list places and pick the r-th, the model gave the same few places over and over (Porto in 11 of 46 casts).
const PLACES = ['Manchester, England', 'Leeds, England', 'Bristol, England', 'Cardiff, Wales', 'Glasgow, Scotland', 'Belfast, Northern Ireland', 'Dublin, Ireland', 'Galway, Ireland', 'Lyon, France', 'Lille, France', 'Toulouse, France', 'Madrid, Spain', 'Seville, Spain', 'Bilbao, Spain', 'Lisbon, Portugal', 'Porto, Portugal', 'Naples, Italy', 'Turin, Italy', 'Bologna, Italy', 'Munich, Germany', 'Hamburg, Germany', 'Leipzig, Germany', 'Vienna, Austria', 'Zurich, Switzerland', 'Rotterdam, the Netherlands', 'Antwerp, Belgium', 'Copenhagen, Denmark', 'Gothenburg, Sweden', 'Oslo, Norway', 'Helsinki, Finland', 'Tallinn, Estonia', 'Warsaw, Poland', 'Krakow, Poland', 'Prague, Czechia', 'Budapest, Hungary', 'Bucharest, Romania', 'Athens, Greece', 'Thessaloniki, Greece', 'Istanbul, Turkey', 'Zagreb, Croatia', 'Lagos, Nigeria', 'Accra, Ghana', 'Nairobi, Kenya', 'Kampala, Uganda', 'Johannesburg, South Africa', 'Cape Town, South Africa', 'Cairo, Egypt', 'Casablanca, Morocco', 'Tunis, Tunisia', 'Addis Ababa, Ethiopia', 'Beirut, Lebanon', 'Amman, Jordan', 'Mumbai, India', 'Delhi, India', 'Bengaluru, India', 'Chennai, India', 'Kolkata, India', 'Karachi, Pakistan', 'Dhaka, Bangladesh', 'Colombo, Sri Lanka', 'Kathmandu, Nepal', 'Bangkok, Thailand', 'Hanoi, Vietnam', 'Ho Chi Minh City, Vietnam', 'Manila, the Philippines', 'Jakarta, Indonesia', 'Kuala Lumpur, Malaysia', 'Singapore', 'Seoul, South Korea', 'Osaka, Japan', 'Sapporo, Japan', 'Taipei, Taiwan', 'Hong Kong', 'Chengdu, China', 'Auckland, New Zealand', 'Wellington, New Zealand', 'Sydney, Australia', 'Melbourne, Australia', 'Perth, Australia', 'Brisbane, Australia', 'Toronto, Canada', 'Vancouver, Canada', 'Montreal, Canada', 'Halifax, Canada', 'Chicago, USA', 'Houston, USA', 'Atlanta, USA', 'Seattle, USA', 'Boston, USA', 'Phoenix, USA', 'Mexico City, Mexico', 'Monterrey, Mexico', 'Bogota, Colombia', 'Medellin, Colombia', 'Lima, Peru', 'Santiago, Chile', 'Buenos Aires, Argentina', 'Sao Paulo, Brazil', 'Recife, Brazil', 'Kingston, Jamaica'];
// Casting is two calls. Call 1 says who they are (age, gender, what they are in the situation, no traits) and offers names and work to pick from; the code picks (asked to pick one, the model gives its mode: the same few names and jobs in every cast). Call 2 writes the lives of the people so named.
const placeLine = place => `If they are people and the situation doesn't already say where they live, they live in ${place}.`;
const peoplePrompt = (N, brief, topic, secretText, place) => { const P = k => `Person ${k + 1}`, chat = N > 2 ? 'group chat' : 'chat';
  return `These ${N} participants, ${P(0)} to ${P(N - 1)}, are in a ${chat}. ${brief || 'They are friends.'}${topic ? ` ${P(0)} has this on their mind: ${topic}` : ''}${secretText}

Cast them as what the situation says they are (people, unless it says otherwise), as one coherent group, working from the situation above however short it is. Every role it names (e.g. parent, partner, ex, team-mate) goes to exactly one participant, and if it is written from one participant's side ("my ex", "me and my mum") that one is Person 1.

If they are people, first one line "Place: " and where they live: the place the situation or topic says or implies, or else ${place}. If they are not people, "Place: none".

Reply with only the Place line, then one line per participant, in order: "Person k: " then what they are, in a few words: age, gender and what they are in this situation, e.g. "58, woman, the parent" (no character traits); then " | names: " and eight different first names that would fit them (in a family, names that fit the same family); then " | work: " and eight different things that could fill their days (an occupation, study, retired ...) that fit the situation and their age, or the one the situation gives them.`; };
const pick = a => a[Math.floor(Math.random() * a.length)];
// The Place line, then one line per person; the code picks a name nobody before has and a work entry. null if a line is missing or the names run out. place is null for "none" (not people).
function parsePeople(text, N) {
  const people = [], taken = new Set(), pl = text.match(/^\W*Place\W*:\s*(.+)$/im)?.[1].replace(/[*_"]/g, '').replace(/[.\s]+$/, '').trim(); if (!pl) return null;
  for (let k = 1; k <= N; k++) {
    const parts = text.match(new RegExp(`^\\W*Person ${k}\\W*:\\s*(.+)$`, 'im'))?.[1].split('|').map(x => x.trim()), part = key => parts?.find(x => new RegExp(`^\\W*${key}\\s*:`, 'i').test(x))?.replace(/^\W*\w+\s*:\s*/, '').split(/[,;]/).map(x => x.replace(/[*_"'.]/g, '').trim()).filter(Boolean) ?? [];
    const names = part('names').filter(x => /^[\p{L}\p{M}\d-]+$/u.test(x) && !taken.has(x.toLowerCase())), work = part('work'), who = parts?.[0]?.replace(/[.\s]+$/, '');
    if (!who || !names.length || !work.length) return null; const name = pick(names); taken.add(name.toLowerCase()); people.push({ name, who, work: pick(work) });
  } return { people, place: /^none\b/i.test(pl) ? null : pl };
}
const castPrompt = (people, brief, topic, secretText, place) => { const N = people.length, chat = N > 2 ? 'group chat' : 'chat';
  return `These ${N} participants are in a ${chat}: ${people.map(p => `${p.name} (${p.who}; ${p.work})`).join(', ')}. ${brief || 'They are friends.'}${topic ? ` ${people[0].name} has this on their mind: ${topic}` : ''}${secretText}

Their lines must agree with each other (the same place, the same way of knowing each other). People in a group of one cohort text in much the same register as each other; family members can differ.

${place ? `They live in ${place}.\n\n` : ''}Reply with only these lines, each on one line, in this order:
One line starting "Setting:": a few sentences in the second person for ${N > 2 ? 'the whole group' : 'both of them'}, saying where you ${N > 2 ? 'all ' : 'both '}are (for people, where they live: that place), how you know each other, and one or two ordinary things you have going on together at the moment that this chat gets used for. Do not invent public facts or events (news, publications, research results, records): only what these participants would really know, true in the real world.${topic ? ' If the topic concerns something you share include the facts you all know about it.' : ''}
Then, for each person in turn, these lines, each starting with that person's name:
"<name> knows:" in the second person ('You ...'), who each of the others is to you and how you know them, a few words each, taken from the situation and the participant lines above (kinship or a partnership only where they name it), nothing about what they are like or what they do for you.
"<name> life:" in the second person ('You ...'), one plain sentence: where you live, what fills your days (given above) and who you live with. No other details.
"<name> lives with:" the names of the others in this chat who share your home because of what they are to you above (family, partner, housemate), or "nobody".
"<name> style:" in a few plain words, how much <name> uses emoji and texting abbreviations, without naming any, or "none".
"<name> capitals:" yes or no, whether <name>'s messages start with a capital letter.
Last, one line starting "${people[0].name} opens with:", four different things, each a short phrase starting with a verb (what is sent, not just the verb) and separated by " | ", that ${people[0].name} might send ${N > 2 ? 'the group' : 'the other'}${topic ? ' to start on this' : ', fitting the situation'}.`; };
const fieldOf = (text, k) => text.match(new RegExp(`^\\W*${k}[*_\\s]*:[*_\\s]*(.+)$`, 'im'))?.[1].trim();
// Chat volume is drawn here, not written by the model (any model-written line about how a person texts came back as a role, and asked for a frequency the model gives its mode): in a group one person texts a lot and the others now and then or only now and again (equal odds); in a 1:1 there is no line. Design choice, like PLACES.
const textsFor = names => { const o = names.length < 3 ? names.map(() => '') : [...names].sort(() => Math.random() - .5).reduce((m, n, k) => ({ ...m, [n]: `${n} texts in this chat ${k === 0 ? 'a lot' : pick(['now and then', 'only now and again'])}.` }), {}); return names.map(n => o[n] ?? ''); };
function parseCast(text, people, topic) {
  const f = k => fieldOf(text, k)?.replace(new RegExp(`^${k}\\s*:\\s*`), ''), names = people.map(p => p.name), texts = textsFor(names);
  const openers = (f(`${names[0]} opens with`) ?? '').split('|').map(x => x.trim()).filter(Boolean), c = { names, setting: f('Setting'), openers, opener: pick(openers) ?? '', cast: {}, private_lines: {} };
  for (const [i, n] of names.entries()) {
    c.cast[n] = { who: people[i].who, work: people[i].work, knows: f(`${n} knows`), texts: texts[i], style: f(`${n} style`), emojiKeep: pick([0.15, 0.35, 0.6]), capitals: (v => v && /^\W*(yes|no)\b/i.test(v) ? /^\W*yes/i.test(v) : undefined)(f(`${n} capitals`)), lives: c.names.filter(o => o !== n && new RegExp(`\\b${o}\\b`, 'u').test(f(`${n} lives with`) ?? '')), ex: [] }; c.private_lines[n] = f(`${n} life`); }
  return c.setting && openers.length >= 2 && names.every(n => Object.values(c.cast[n]).every(v => v !== undefined) && c.private_lines[n]) && c;
}

// ---- run ----
const DEFAULTS = ['Maya', 'Tom', 'Jo', 'Sam', 'Priya', 'Dan', 'Ellie', 'Kofi']; // the viewer's Start form names people like this (README "Viewer"): a secret or topic names a slot by its default name
const slotName = (text, N, to) => text.replace(new RegExp(`\\b(${DEFAULTS.slice(0, N).join('|')})\\b`, 'g'), m => to(DEFAULTS.indexOf(m)));
const randomStart = () => { const d = new Date(); return iso(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate() + Math.floor(Math.random() * 7), 7 + Math.floor(Math.random() * 16), 5 * Math.floor(Math.random() * 12))); }; // batch runs: a day within the week and a 5-minute slot from 07:00 to 22:55 (a design choice), not the launch time
const nowLocal = () => { const d = new Date(); return iso(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate(), d.getHours(), Math.round(d.getMinutes() / 5) * 5)); }; // story time starts at the current local time unless the brief or form gives one
const ts = new Date().toISOString().replace(/[:.]/g, '-'), out = path.join(import.meta.dirname, 'writer-runs', ts); fs.mkdirSync(out, { recursive: true });
const dayLabel = at => { const d = new Date(at + ':00Z'); return `(It's now ${WD[d.getUTCDay()]} ${d.getUTCDate()} ${['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'][d.getUTCMonth()]}.)`; };
// Live export in the viewer's format (viewer/live.mjs): turns are released on the story clock, one story minute per 60/SPEED real seconds.
function liveSink(dir, meta) {
  fs.mkdirSync(dir, { recursive: true }); let n = 0, prev = null, chain = Promise.resolve(); const runFile = path.join(dir, 'run.json');
  const put = (status, ended) => { fs.writeFileSync(runFile, JSON.stringify({ ...meta, status, ...(ended && { ended }) })); console.log(`${status === 'done' ? 'DONE' : 'RUN'} ${runFile}`); };
  const emit = t => { const f = path.join(dir, `turn-${String(n).padStart(4, '0')}.json`); fs.writeFileSync(f, JSON.stringify({ run: meta.id, i: n++, pass: false, ...t })); console.log(`TURN ${f}`); };
  return { start: () => put('running'), play(ms, label) { chain = chain.then(async () => { for (const m of ms) {
      if (prev) await sleep(Math.max(0, +new Date(m.at + ':00Z') - +new Date(prev + ':00Z')) / SPEED);
      if (prev && prev.slice(0, 10) !== m.at.slice(0, 10)) emit({ who: 'Clock', text: dayLabel(m.at), clock: true, at: m.at });
      emit({ who: m.who, text: m.text, at: m.at, ...(m.oracle && { oracle: true }), ...(m.reacts?.length && { reactions: m.reacts.flatMap(([emoji, k]) => Array(k).fill({ who: '', emoji })) }) }); prev = m.at; } }); }, done: async ended => { await chain; put('done', ended); } };
}
let items;
if (LIVE) { const sp = JSON.parse(fs.readFileSync(LIVE, 'utf8')); MODEL = sp.model || MODEL; ORACLE = ORACLE || !!sp.oracle; items = [{ label: 'live', live: true, gen: { people: sp.people, brief: sp.situation || null, topic: sp.topic || null, secrets: sp.secrets || null, start: sp.start, days: sp.days } }]; }
else if (GEN) items = JSON.parse(fs.readFileSync(GEN, 'utf8')).map(b => ({ label: b.label, gen: b })); else items = fs.readFileSync(listFile, 'utf8').split('\n').filter(l => l.trim()).map(l => { const [label, dir] = l.trim().split(/\s+/); return { label: `${PREFIX}-${label.split('-')[1]}`, scen: label.split('-')[1], dir }; });
let k = 0, listOut = [];
await Promise.all(Array.from({ length: CONC }, async () => { while (k < items.length) {
  const it = items[k++]; let c, startAt, source = it.dir, secrets = null;
  if (it.gen) { const g = it.gen, N = g.people, person = j => `Person ${j + 1}`, place = pick(PLACES), t0 = Date.now(); let ppl = null, r = null, where = null; const usage1 = [];
    const sec = Object.entries(g.secrets ?? {}).filter(([n]) => DEFAULTS.slice(0, N).includes(n)), fail = e => (console.error(`${it.label}: ${e.message}`), null);
    for (let a = 0; a < 2 && !ppl; a++) { const j = await claude(peoplePrompt(N, g.brief, g.topic && slotName(g.topic, N, person), sec.map(([n, t]) => ` ${person(DEFAULTS.indexOf(n))} already has this going on: ${slotName(t, N, person)}`).join(''), place), GENSYS).catch(fail); if (j) { usage1.push(j.usage); const pp = parsePeople(j.text, N); if (pp) ({ people: ppl, place: where } = pp); } }
    if (!ppl) { console.error(`${it.label}: casting failed`); continue; }
    const names = ppl.map(p => p.name), topic = g.topic && slotName(g.topic, N, j => names[j]);
    secrets = sec.length ? Object.fromEntries(sec.map(([n, t]) => [names[DEFAULTS.indexOf(n)], slotName(t, N, j => names[j])])) : null;
    for (let a = 0; a < 2 && !r; a++) { const j = await claude(castPrompt(ppl, g.brief, topic, Object.entries(secrets ?? {}).map(([n, t]) => ` ${n} already has this going on: ${t} (Nothing in the setting or ${n}'s lines may restate it.)`).join(''), where), GENSYS).catch(fail); r = j && parseCast(j.text, ppl, topic); if (r) r.usage = [...usage1, j.usage]; }
    if (!r) { console.error(`${it.label}: casting failed`); continue; }
    c = { ...r, place: where, castMs: Date.now() - t0, situation: g.brief ?? null, topic: topic || null }; startAt = g.start || (LIVE ? nowLocal() : randomStart()); }
  else { const rows = read(it.dir); c = rows.find(r => r.cast); startAt = rows.find(r => r.posted === true && r.at)?.at; if (!c || !startAt) { console.error(`${it.label}: no cast row or no posted message`); continue; } secrets = it.scen && SECRETS[it.scen] || null; }
  const dir = path.join(out, it.label); fs.mkdirSync(dir);
  const days = it.gen?.days ?? DAYS, all = [], usage = []; let ok = true, rejects = 0;
  const sink = it.live ? liveSink(LIVE_OUT || path.join(out, 'export'), { id: `${ts}-${it.label}`, started: new Date().toISOString(), model: MODEL, people: c.names.length, names: c.names, brief: c.situation || '', topic: c.topic, secrets, oracle: ORACLE }) : null; sink?.start();
  const flush = complete => { // the log after every day, so a run in progress can be read
    const log = [{ writer: 'w10', ...(it.live && { live: true }), source, model: MODEL, effort: EFFORT, days, oracle: ORACLE, start: startAt, complete, rejects, usage }, c, ...(secrets ? [{ secrets }] : [])]; let j = 0;
    for (const m of all) { if (m.oracle) { log.push({ who: m.who, text: m.text, oracle: true, question: m.question, posted: true, at: m.at, checkin: m.at }); continue; }
      log.push({ who: m.who, text: m.text, posted: true, at: m.at, checkin: m.at }); for (const [emoji, n] of m.reacts) for (let q = 0; q < n; q++) log.push({ who: '', react: emoji, to: j, posted: false, at: m.at }); j++; }
    fs.writeFileSync(path.join(dir, 'log.jsonl'), log.map(r => JSON.stringify(r)).join('\n') + '\n'); fs.writeFileSync(path.join(dir, 'transcript.txt'), transcript(all)); };
  const cs = chunkEnds(startAt, days);
  for (let d = 0; d < cs.length; d++) { const dayStart = d ? cs[d - 1] : startAt, from = d ? all.at(-1).at : startAt, r = await writeDay(c, secrets, all, from, cs[d], it.label, dayStart); if (!r) { ok = false; break; } rejects += r.rejects; usage.push(...r.usages);
    all.push(...r.dm); flush(false); sink?.play(r.dm); console.log(`${it.label}: day ${d + 1}: ${r.dm.length} messages`); }
  if (!ok && !all.length) { await sink?.done('message limit'); continue; }
  flush(ok); await sink?.done(ok ? 'end date' : 'message limit');
  listOut.push(`${it.label} ${dir}`); console.log(`${it.label}: ${all.length} messages, ${all[0].at} to ${all.at(-1).at}`);
} }));
fs.writeFileSync(path.join(out, 'list.txt'), listOut.sort().join('\n') + '\n'); console.log(`list: ${path.join(out, 'list.txt')}`);

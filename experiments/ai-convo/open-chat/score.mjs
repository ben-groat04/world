#!/usr/bin/env node
// Scores group-chat runs.  Usage: node score.mjs runs/<id> [runs/<id> ...] [--json]
//
// Input: <run>/log.jsonl. Rows with `clock` or `end` are skipped. Rows with `oracle` (Claude/Oracle answers)
// are only counted ("oracle" column). Agent rows = the rest. Messages = agent rows with posted:true, in time
// order (`at`, stable by file order). "Previous message" always means the previous posted people message.
// All metrics are computed over people messages only. Shares are 0..1.
//
//  messages / people  posted count / distinct speakers among them
//  wMed, wP90         median / 90th percentile (nearest rank) of words per message (whitespace-split)
//  qEnd               share whose last non-space character is '?'
//  echo               share whose FIRST sentence (text up to first . ! ? followed by whitespace, or first newline)
//                     (a) contains a "double-quoted" span of >=2 words copied (case-insensitive) from the previous
//                     message, or (b) matches one of the PRAISE patterns below.
//  bye                share of messages under 25 words matching BYE (sign-off / thanks, whole-word)
//  top                largest single speaker's share of messages
//  dbl                share whose speaker equals the previous message's speaker (first message excluded from denominator)
//  hand               share whose LAST sentence ends in '?' and contains the name of another participant
//                     (participants = every agent who appears in the log, so silent ones count)
//  r, n               Pearson r between a message's word count and minutes since the previous message
//                     (pairs with gap > 120 min skipped; n = pairs used; null if n<3 or no variance)
//  passNew            share of check-ins that had new messages (prompt `user` contains "New messages:", or
//                     "Conversation so far:" followed by at least one "— Name, Day HH:MM" header) that were pass:true
//  passNone           share of check-ins with "Nothing new" in the prompt that were pass:true (the very first
//                     check-in, "(nothing yet)", is in neither group). '-' if rows have no `user` (old runs).
//  dupe               share of messages whose normalised text (lowercase, whitespace collapsed, trailing
//                     punctuation/symbols/emoji stripped) equals an EARLIER message by a DIFFERENT speaker
//  crossed            share of messages (with a `checkin`) where another speaker posted after this agent's checkin
//                     and no later than its `at` (the agent was typing while someone else spoke)
//  delayMed, delay1   for check-ins that had new messages: minutes from the earliest message by another speaker the
//                     agent had not yet seen (posted `at` > its previous checkin, <= this checkin; no previous
//                     checkin = any earlier) to this checkin: median (nearest rank) and share <= 1 minute.
//                     Compare Pielot et al. 2014 (large-scale mobile messaging study): median 6.15 min, 25% within 1 min.
//  frame              count of messages matching a FRAME phrase (frame-breaks: AI self-reference, "from here",
//                     saying it cannot book/call/search, admitting making things up; list below)
//  draftChg, draftDrop  only for rows with `draft` (text before a re-check): share of those rows where the sent
//                     text differs from the draft (posted, changed), and share dropped (pass after draft).
//                     '-' if no row has a draft.
//  reacts             react rows per check-in with new messages. '-' if the run has no react rows.
//  started            1 if the run has at least one posted message, else 0 (MEAN = start rate). Every per-message
//                     metric above and below is '-' for a run with no messages, so empty runs don't skew means.
//  named              share of messages containing (whole word, case-insensitive) the name of another participant
//                     (participants = speakers in the run, as for hand)
//  md                 share of messages with markdown: a line starting with -, *, • or digits + '.'/')' (then a
//                     space), a **bold** span, a '#' heading line, or a line that is just ---
//  frag               share of messages that are a fragment of a split list/email: trimmed text ends with ':',
//                     is only '---', or every non-empty line is a list line (as in md)
//  byeRun             longest run of consecutive messages that are all sign-offs/acks (the bye test above)
//  confess            count of posted messages matching a CONFESS pattern (agent admits it cannot act from the chat, is an
//                     AI, or retracts an earlier claim; list below). '-' for a run with no messages (as are the counts below)
//  promises           count of posted messages with an "I'll <send|check|book|ring|call|post|dig|look|confirm|sort|email|
//                     share|forward>" promise (also "I will"; straight or curly apostrophe)
//  recheckMeta        count of posted messages that talk about the agent's own draft ("my draft", "redundant", "clearer
//                     version", "already sent", "scrap that")
//  namePrefix         count of posted messages that start with a participant name followed by ':' (a transcript-style prefix)
//  selfReact          count of react rows whose target message (`to` = index into the posted messages in posting order, as
//                     run.mjs's `convo`) was written by the reactor. '-' if the run has no react rows
//  failed             count of rows with a `failed` field ('continuation' or 'refusal'). '-' if none (older runs have no such rows)
//  lineMentions       mean over people (those with private lines AND posted messages) of how many of their posted messages
//                     contain (whole word, case-insensitive) one of the 3 longest non-stopword words (letters, >=4 chars)
//                     of their own private line(s) (all private_lines rows for that person, pooled). '-' if no private lines
//  perDay             posted messages per in-story day (first row to the end row, or the last row)
//  starts             conversation starts per in-story day: posts at least 2 h after the previous post (the first post counts)
//  opener             1 if the earliest check-in of the run posted (the opener), else 0; '-' if no check-in rows
//  passOpen..passNotif  share of looks that ended as a PASS row (a PASS, a polish DROP or a withdrawn draft; not a reaction) by situation, from the prompt `user`:
//                     passFirst = another person's first look; passEvEmpty / passEvQuiet / passEvNew = a look with a life-events block and an empty chat / nothing new in the chat / new messages (a "(new)" line);
//                     passNotif = a look without an events block that had new messages. Looks are rows with `user`. '-' if none
//  dropRate           share of replies that reached the rewrite pass and were DROPped (rows with `raw`)
//  addStyle, addAll   rewrite fidelity over posted rows with `raw`: emoji + slang tokens not in the raw draft, and all new tokens (emoji included), per token posted (prompts.mjs added())
//  oracle             number of oracle rows (private ones included)
//  perTurn            posted messages per turn (a turn = a row with the agent's `user` prompt that is not a failed call; a REACT and a PASS are turns). Round 18's cold read: 0.53, 0.45, 0.39, 0.35 over rounds 7-10 (pooled over the runs of a round: sum of messages / sum of turns; the MEAN row here is the mean of per-run values, which comes out higher), the number that fell while judges' scores did not show it
//  reactPer           reaction rows per posted message (0.29 and 0.37 for rounds 7-8, 0.65 and 0.64 for rounds 9-10 in the same read: reactions replacing replies). '-' for a run with no messages
//  qAny               share of messages containing a '?' anywhere (qEnd counts only a final one): how often a message hands the next person something to answer
//  wake90             share of messages posted from 30 min before to 90 min after their writer's wake time (the end of the cast row's `sleep` hours; first looks are moved to wake time plus a jitter of -25 to +40 min). '-' for runs whose log has no cast row. Round 18: 21% of posts at 06:00-07:59
//  end                how the run ended (`end` row: limit / date); '-' if none

import { readFileSync } from 'node:fs'; import { added } from './prompts.mjs';

const PRAISE = [
  /\bgreat point\b/i, /\bgood point\b/i, /\bfair point\b/i, /\blove that\b/i, /\bnice catch\b/i,
  /\bgood call\b/i, /\bthat'?s a (great|good|fair)\b/i, /^ha,? that'?s\b/i, /\bgood question\b/i,
];
const BYE = /\b(good ?night|night|bye|see you|talk soon|thanks|thank you|take care|sleep well)\b/i;

// Frame-break phrases (case-insensitive); a message matching any counts once.
const FRAME = [
  /\bfrom here\b/i, /\bI['’]?m an AI\b/i, /\bas an AI\b/i, /\bI can only message\b/i, /\bonly chat here\b/i,
  /\bin my context\b/i, /\bmaking things up\b/i, /\bbe upfront\b/i, /\bcan['’]?t (book|ring|call|phone|search|open)\b/i,
];
// Confession phrases: the agent says it cannot act from the chat, is an AI, or retracts what it said; counted once per message.
const CONFESS = [
  /\bfrom (this|the) chat\b/i, /\bfrom here\b/i, /\bAI assistant\b/i, /\bchat assistant\b/i, /\bI['’]?m an AI\b/i,
  /\bcan['’]?t (open|check|send|book|ring|call|access|see) (my|the|your)\b/i, /\bonly (post|message|chat) (in|here)\b/i,
  /\bdon['’]?t have (it|that|my .*) (in front of me|to hand)/i, /\bhaven['’]?t actually\b/i, /\bshould have said\b/i,
];
const PROMISE = /\bI(['’]ll| will) (send|check|book|ring|call|post|dig|look|confirm|sort|email|share|forward)\b/i;
const RECHECK = /\b(my draft|redundant|clearer version|already sent|scrap that)\b/i;
const STOP = new Set(('about above after again also always around because been before being between both could does doing down during each '
  + 'either else even ever every from further have having here hers herself himself into itself just keep know like made make many might '
  + 'more most much must myself never next only other ought ours ourselves over same should since some still such than that their theirs '
  + 'them themselves then there these they this those through today tonight under until upon very want well were what when where which '
  + 'while whom whose will with would your yours yourself yourselves you\'re really something anything everything nothing getting going '
  + 'week while though although another enough almost already').split(' '));
const lineWords = t => { const ws = [...new Set((t.toLowerCase().match(/[a-z]{4,}/g) || []).filter(w => !STOP.has(w)))];
  return ws.map((w, i) => ({ w, i })).sort((a, b) => b.w.length - a.w.length || a.i - b.i).slice(0, 3).map(x => x.w); };
const LIST_LINE = /^\s*([-*\u2022]|\d+[.)])\s/;
const isBye = m => words(m.text) < 25 && BYE.test(m.text);
const isMd = t => t.split('\n').some(l => LIST_LINE.test(l) || /^\s*#+\s/.test(l) || /^\s*---\s*$/.test(l)) || /\*\*[^*]+\*\*/.test(t);
const isFrag = t => { t = t.trim(); const ls = t.split('\n').filter(l => l.trim()); return t.endsWith(':') || t === '---' || (ls.length > 0 && ls.every(l => LIST_LINE.test(l))); };
const norm = s => s.toLowerCase().replace(/\s+/g, ' ').trim().replace(/[\p{P}\p{S}\s]+$/u, '');
const hasNew = u => u == null ? null
  : /New messages:/.test(u) || (/Conversation so far:/.test(u) && /^— .+, \w{3} \d\d:\d\d/m.test(u)) ? true
  : /Nothing new/.test(u) ? false : null;
const ms = t => t ? Date.parse(t + 'Z') : null;

const words = s => s.trim().split(/\s+/).filter(Boolean).length;
const sentences = s => s.trim().split(/(?<=[.!?])\s+|\n+/).filter(Boolean);
const share = (a, f) => a.length ? a.filter(f).length / a.length : null;
const q = (sorted, p) => sorted[Math.max(0, Math.ceil(p * sorted.length) - 1)];
const mean = a => { a = a.filter(x => x != null); return a.length ? a.reduce((x, y) => x + y, 0) / a.length : null; };
const esc = s => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

function pearson(xs, ys) {
  const n = xs.length; if (n < 3) return null;
  const mx = mean(xs), my = mean(ys);
  let sxy = 0, sxx = 0, syy = 0;
  for (let i = 0; i < n; i++) { sxy += (xs[i] - mx) * (ys[i] - my); sxx += (xs[i] - mx) ** 2; syy += (ys[i] - my) ** 2; }
  return sxx && syy ? sxy / Math.sqrt(sxx * syy) : null;
}

function echoes(m, prev) {
  if (!prev) return false;
  const first = sentences(m.text)[0] || '';
  const quoted = [...first.matchAll(/["“]([^"”]+)["”]/g)].map(x => x[1].trim().toLowerCase());
  return quoted.some(s => words(s) >= 2 && prev.text.toLowerCase().includes(s)) || PRAISE.some(re => re.test(first));
}

function score(dir) {
  const all = readFileSync(`${dir}/log.jsonl`, 'utf8').split('\n').filter(Boolean).map(l => JSON.parse(l));
  const end = all.find(r => r.end)?.end ?? null;
  const reacts = all.filter(r => r.react).length;
  const reactRows = all.filter(r => r.react);
  const lines = {}; all.filter(r => r.private_lines).forEach(r => Object.entries(r.private_lines).forEach(([n, l]) => lines[n] = (lines[n] || '') + ' ' + l));
  const rows = all.filter(r => !r.clock && !r.end && !r.react && !r.private_lines);
  const oracle = rows.filter(r => r.oracle).length;
  const agent = rows.filter(r => !r.oracle && r.who);
  const names = [...new Set(agent.map(r => r.who))];
  const msgs = agent.map((r, i) => ({ ...r, i, t: Date.parse(r.at + 'Z') })).filter(r => r.posted === true)
    .sort((a, b) => a.t - b.t || a.i - b.i);
  const wc = msgs.map(m => words(m.text)), sorted = [...wc].sort((a, b) => a - b);
  const counts = {}; msgs.forEach(m => counts[m.who] = (counts[m.who] || 0) + 1);
  const gx = [], gy = [];
  msgs.forEach((m, i) => { if (!i) return; const gap = (m.t - msgs[i - 1].t) / 60000; if (gap <= 120) { gx.push(wc[i]); gy.push(gap); } });
  const handoff = m => {
    const last = sentences(m.text).at(-1) || '';
    return last.endsWith('?') && names.some(n => n !== m.who && new RegExp(`\\b${esc(n)}\\b`, 'i').test(last));
  };
  // check-ins: new-message status and delay to the earliest unseen message
  const prevCheckin = {}, delays = [];
  const checks = agent.map(r => {
    const c = ms(r.checkin), prev = prevCheckin[r.who] ?? -Infinity;
    if (c != null) prevCheckin[r.who] = c;
    const hn = hasNew(r.user);
    if (hn && c != null) {
      const seen = msgs.filter(m => m.who !== r.who && m.t > prev && m.t <= c).map(m => m.t);
      if (seen.length) delays.push((c - Math.min(...seen)) / 60000);
    }
    return { r, hn };
  });
  const newChecks = checks.filter(c => c.hn === true), noneChecks = checks.filter(c => c.hn === false);
  delays.sort((a, b) => a - b);
  const seenText = [];
  const dupe = msgs.map(m => { const n = norm(m.text); const d = n && seenText.some(x => x.n === n && x.who !== m.who); seenText.push({ n, who: m.who }); return d; });
  const crossed = m => { const c = ms(m.checkin); return c != null && msgs.some(o => o.who !== m.who && o.t > c && o.t <= m.t); };
  const drafts = agent.filter(r => r.draft != null);
  const hasWord = (t, ws) => ws.some(w => new RegExp(`\\b${esc(w)}\\b`, 'i').test(t));
  const perPerson = Object.keys(lines).filter(n => counts[n]).map(n => { const ws = lineWords(lines[n]); return ws.length ? msgs.filter(m => m.who === n && hasWord(m.text, ws)).length : null; });
  const failed = all.filter(r => r.failed).length, turns = all.filter(r => r.user && r.who && !r.failed).length, sleepOf = all.find(r => r.cast)?.sleep;
  const nearWake = m => { const w = sleepOf?.[m.who]?.[1]; if (w == null) return null; const mins = +m.at.slice(11, 13) * 60 + +m.at.slice(14, 16), d = ((mins - w * 60) % 1440 + 1440) % 1440; return d < 90 || d >= 1410; };
  const cnt = f => msgs.length ? msgs.filter(f).length : null;
  const looks = agent.filter(r => r.user && r.checkin), firstL = looks.reduce((a, r) => !a || r.checkin < a.checkin ? r : a, null), sit = r => {
    if (r === firstL) return 'Open'; if (!/You last looked/.test(r.user)) return 'First'; const ev = /Not on your phone/.test(r.user), nu = /\(new\)/.test(r.user), empty = /\(no messages\)/.test(r.user);
    return ev ? (empty ? 'EvEmpty' : nu ? 'EvNew' : 'EvQuiet') : nu ? 'Notif' : null; };
  const passBy = k => { const l = looks.filter(r => sit(r) === k); return l.length ? l.filter(r => r.pass === true).length / l.length : null; };
  const t0 = Math.min(...agent.filter(r => r.at).map(r => Date.parse(r.at + 'Z'))), t1 = ms(all.findLast(r => r.end)?.at) ?? Math.max(...msgs.map(m => m.t)), days = (t1 - t0) / 864e5;
  const withRaw = msgs.filter(m => m.raw && m.draft == null), ad = withRaw.map(m => added(m.raw, m.text)), sum = f => ad.reduce((a, x) => a + f(x), 0), tok = sum(x => x.total), polished = agent.filter(r => r.raw || r.polishDrop);
  return {
    run: dir.replace(/\/$/, '').split('/').pop(),
    messages: msgs.length, people: Object.keys(counts).length,
    wMed: msgs.length ? q(sorted, 0.5) : null, wP90: msgs.length ? q(sorted, 0.9) : null,
    qEnd: share(msgs, m => m.text.trimEnd().endsWith('?')),
    echo: msgs.length ? msgs.filter((m, i) => echoes(m, msgs[i - 1])).length / msgs.length : null,
    bye: share(msgs, isBye),
    top: msgs.length ? Math.max(...Object.values(counts)) / msgs.length : null,
    dbl: msgs.length > 1 ? msgs.filter((m, i) => i && m.who === msgs[i - 1].who).length / (msgs.length - 1) : null,
    hand: share(msgs, handoff),
    r: pearson(gx, gy), n: gx.length,
    passNew: share(newChecks, c => c.r.pass === true),
    passNone: share(noneChecks, c => c.r.pass === true),
    dupe: msgs.length ? dupe.filter(Boolean).length / msgs.length : null,
    crossed: share(msgs.filter(m => m.checkin), crossed),
    delayMed: delays.length ? q(delays, 0.5) : null,
    delay1: share(delays, d => d <= 1),
    frame: msgs.filter(m => FRAME.some(re => re.test(m.text))).length,
    draftChg: share(drafts, r => r.posted === true && r.text !== r.draft),
    draftDrop: share(drafts, r => r.pass === true),
    reacts: reacts && newChecks.length ? reacts / newChecks.length : null,
    started: msgs.length ? 1 : 0,
    named: share(msgs, m => names.some(n => n !== m.who && new RegExp(`\\b${esc(n)}\\b`, 'i').test(m.text))),
    md: share(msgs, m => isMd(m.text)),
    frag: share(msgs, m => isFrag(m.text)),
    byeRun: msgs.length ? msgs.reduce((a, m) => { const c = isBye(m) ? a.c + 1 : 0; return { c, max: Math.max(a.max, c) }; }, { c: 0, max: 0 }).max : null,
    confess: cnt(m => CONFESS.some(re => re.test(m.text))),
    promises: cnt(m => PROMISE.test(m.text)),
    recheckMeta: cnt(m => RECHECK.test(m.text)),
    namePrefix: cnt(m => names.some(n => new RegExp(`^\\s*${esc(n)}\\s*:`).test(m.text))),
    selfReact: reactRows.length ? reactRows.filter(r => msgs[r.to]?.who === r.who).length : null,
    failed: failed || null,
    lineMentions: mean(perPerson),
    perDay: msgs.length && days > 0 ? msgs.length / days : null,
    starts: msgs.length && days > 0 ? msgs.filter((m, i) => !i || m.t - msgs[i - 1].t >= 2 * 36e5).length / days : null,
    opener: firstL ? (firstL.posted === true ? 1 : 0) : null,
    passFirst: passBy('First'), passEvEmpty: passBy('EvEmpty'), passEvQuiet: passBy('EvQuiet'), passEvNew: passBy('EvNew'), passNotif: passBy('Notif'),
    dropRate: polished.length ? polished.filter(r => r.polishDrop).length / polished.length : null,
    addStyle: tok ? sum(x => x.emoji + x.slang) / tok : null, addAll: tok ? sum(x => x.words) / tok : null,
    perTurn: turns ? msgs.length / turns : null,
    reactPer: msgs.length ? reactRows.length / msgs.length : null,
    qAny: share(msgs, m => m.text.includes('?')),
    wake90: msgs.length && sleepOf ? msgs.filter(m => nearWake(m)).length / msgs.filter(m => nearWake(m) != null).length : null,
    oracle,
    end,
  };
}

const args = process.argv.slice(2), json = args.includes('--json');
const results = args.filter(a => a !== '--json').map(score);
if (!results.length) { console.error('usage: node score.mjs runs/<id> [...] [--json]'); process.exit(1); }
const keys = Object.keys(results[0]).filter(k => k !== 'run');
const meanRow = { run: 'MEAN', ...Object.fromEntries(keys.map(k => [k, k === 'end' ? null : mean(results.map(r => r[k]))])) };
const all = [...results, meanRow];
if (json) console.log(JSON.stringify(all, null, 2));
const fmt = (v, k) => v == null ? '-' : typeof v === 'string' ? v : Number.isInteger(v) ? String(v) : v.toFixed(2);
const table = [['run', ...keys], ...all.map(r => ['run', ...keys].map(k => fmt(r[k], k)))];
const wid = table[0].map((_, c) => Math.max(...table.map(r => r[c].length)));
console.log(table.map(r => r.map((v, c) => c ? v.padStart(wid[c]) : v.padEnd(wid[c])).join('  ')).join('\n'));

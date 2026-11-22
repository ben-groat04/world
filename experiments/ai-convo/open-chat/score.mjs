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
//  oracle             number of oracle rows (private ones included)
//  end                how the run ended (`end` row: limit / date); '-' if none

import { readFileSync } from 'node:fs';

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
  return {
    run: dir.replace(/\/$/, '').split('/').pop(),
    messages: msgs.length, people: Object.keys(counts).length,
    wMed: msgs.length ? q(sorted, 0.5) : null, wP90: msgs.length ? q(sorted, 0.9) : null,
    qEnd: share(msgs, m => m.text.trimEnd().endsWith('?')),
    echo: msgs.length ? msgs.filter((m, i) => echoes(m, msgs[i - 1])).length / msgs.length : null,
    bye: share(msgs, m => words(m.text) < 25 && BYE.test(m.text)),
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

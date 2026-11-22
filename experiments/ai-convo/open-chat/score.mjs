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
//  pass               share of agent rows (posted or not) that were pass:true
//  oracle             number of oracle rows

import { readFileSync } from 'node:fs';

const PRAISE = [
  /\bgreat point\b/i, /\bgood point\b/i, /\bfair point\b/i, /\blove that\b/i, /\bnice catch\b/i,
  /\bgood call\b/i, /\bthat'?s a (great|good|fair)\b/i, /^ha,? that'?s\b/i, /\bgood question\b/i,
];
const BYE = /\b(good ?night|night|bye|see you|talk soon|thanks|thank you|take care|sleep well)\b/i;

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
  const rows = readFileSync(`${dir}/log.jsonl`, 'utf8').split('\n').filter(Boolean).map(l => JSON.parse(l))
    .filter(r => !r.clock && !r.end);
  const oracle = rows.filter(r => r.oracle).length;
  const agent = rows.filter(r => !r.oracle);
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
    pass: share(agent, r => r.pass === true),
    oracle,
  };
}

const args = process.argv.slice(2), json = args.includes('--json');
const results = args.filter(a => a !== '--json').map(score);
if (!results.length) { console.error('usage: node score.mjs runs/<id> [...] [--json]'); process.exit(1); }
const keys = Object.keys(results[0]).filter(k => k !== 'run');
const meanRow = { run: 'MEAN', ...Object.fromEntries(keys.map(k => [k, mean(results.map(r => r[k]))])) };
const all = [...results, meanRow];
if (json) console.log(JSON.stringify(all, null, 2));
const fmt = (v, k) => v == null ? '-' : k === 'run' ? v : Number.isInteger(v) ? String(v) : v.toFixed(2);
const table = [['run', ...keys], ...all.map(r => ['run', ...keys].map(k => fmt(r[k], k)))];
const wid = table[0].map((_, c) => Math.max(...table.map(r => r[c].length)));
console.log(table.map(r => r.map((v, c) => c ? v.padStart(wid[c]) : v.padEnd(wid[c])).join('  ')).join('\n'));

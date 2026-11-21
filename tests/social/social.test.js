// W1-E tests: node --test tests/social/social.test.js
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { createLarkfieldWorld, restoreLarkfieldWorld } from '../../sim/larkfield.js';

const D = 144;
const hashSoc = (w) => { const S = w.soc; let h = 7; for (const [id, ps] of S.ppl) { h = (h * 31 + id + ps.T.size * 7 + ps.B.size * 13) >>> 0; for (const t of ps.T.values()) h = (h * 17 + Math.round(t.c * 1000) + Math.round(t.t * 100)) >>> 0; } return [h, S.stats.conv, S.stats.rum.told, S.facts.size, S.posts.length, S.chats.length, S.forum.posts.length].join('/'); };

test('runs 120 days under strictEvents; plugins registered; stats move', () => {
  const w = createLarkfieldWorld(1, { strictEvents: true }); w.run(D * 120);
  assert.ok(w.sys.social && w.sys.comms);
  assert.ok(w.soc.stats.conv > 500 && w.soc.stats.rum.told > 200 && w.soc.stats.posts.forum > 20);
  assert.ok(w.soc.chats.length > 20);
  const ev = w.events.stats.byType; assert.ok(ev['social.acquaint'] > 0, 'acquaintances form at venues');
});
test('deterministic: same seed twice gives identical social state', () => {
  const a = createLarkfieldWorld(3); a.run(D * 60); const b = createLarkfieldWorld(3); b.run(D * 60);
  assert.equal(hashSoc(a), hashSoc(b));
});
test('snapshot-resume equals straight run (social state)', () => {
  const a = createLarkfieldWorld(2); a.run(D * 50);
  const snap = JSON.parse(JSON.stringify(a.snapshot())); const b = restoreLarkfieldWorld(snap);
  assert.equal(hashSoc(a), hashSoc(b));
  a.run(D * 30); b.run(D * 30);
  assert.equal(hashSoc(a), hashSoc(b));
  assert.equal(a.stateHash(), b.stateHash());
});
test('queries are read-only data and commands work', () => {
  const w = createLarkfieldWorld(1); w.run(D * 20);
  const ids = [...w.people.keys()].filter((i) => w.ageOf(w.people.get(i)) > 20 && w.soc.ppl.get(i)); const [a, b, c] = ids;
  const q = w.sys.social.query; assert.ok(Array.isArray(q.ties(a, { layer: 2 })));
  assert.equal(q.layers(a).length, 4);
  w.cmd('social.feud', { a, b }); assert.ok(q.tie(a, b).l < -0.3); assert.ok(q.tie(b, a).cf > 0.5);
  w.cmd('social.introduce', { a: ids[5], b: ids[9] }); assert.ok(q.knows(ids[5], ids[9]));
  const n = w.cmd('social.spreadRumour', { about: c, claim: { kind: 'affair' }, seeds: 3 }); assert.ok(n > 0);
  w.cmd('social.fact', { kind: 'in_debt', about: a, secret: true }); assert.ok(q.secrets(a).length >= 1);
  assert.ok(w.cmd('social.revealSecret', { person: a }) >= 1);
  assert.ok(w.cmd('comms.message', { from: a, to: ids[2] })); w.cmd('comms.call', { from: a, to: ids[2] });
  assert.ok(w.cmd('comms.post', { author: a, kind: 'daily' })); w.cmd('comms.forumPost', { author: a, kind: 'parking' });
  assert.ok(w.sys.comms.query.forum(3).length && w.sys.comms.query.feed(3).length);
  assert.ok(w.sys.comms.query.feed(3).every((p) => typeof p.text === 'string' && !/[#{}]/.test(p.text)), 'no unresolved template markers');
  w.cmd('comms.viralPost', { author: a }); assert.ok(w.sys.comms.query.stats().viral >= 1);
});
test('beliefs: cap 48, truth flag, hops recorded; no decision reads facts', () => {
  const w = createLarkfieldWorld(1); w.run(D * 90);
  for (const ps of w.soc.ppl.values()) assert.ok(ps.B.size <= 48);
  const R = w.soc.stats.rum; assert.ok(R.byHop[2] > 0);
  const src = ['acts.js', 'encounters.js', 'index.js', 'norms.js'].map((f) => fs.readFileSync(new URL('../../sim/systems/social/' + f, import.meta.url), 'utf8')).join('\n');
  assert.ok(!/S\.facts\.get\([^)]*\)\.(?:t|sec)\s*[<>]/.test(src), 'decisions must not branch on world truth');
  assert.ok((src.match(/S\.facts\.get/g) || []).length <= 6, 'facts are only touched for bookkeeping');
});
test('perf counters: no O(N) per-tick scan (hour clock cost bounded)', () => {
  const w = createLarkfieldWorld(1); w.run(D * 7); w.enableProfile(); w.run(D * 14);
  const ms = (w.prof.sys.social + w.prof.sys.comms) / 14; assert.ok(ms < 12, 'social+comms ms/day ' + ms);
});

// Social/comms text pack (owned by W1-E). Merged by comms init on top of the base pack grammar.
// Variety layer (forumx.js): every forum post gets optional lead/tail wrappers and extra cores; every reply gets prefix/suffix wrappers.
import forum from './forum.js';
import chats from './chats.js';
import rumours from './rumours.js';
import { wrap, cores } from './forumx.js';
import replies2 from './replies2.js';
const rules = {};
const fixLead = (v) => (Array.isArray(v) ? v.map((x) => (typeof x === 'string' ? x.replace(/,? but$/, '.').replace(/,$/, '.') : x)) : v);
for (const g of [forum, chats, rumours, replies2]) for (const [k, v] of Object.entries(g)) rules[k] = (rules[k] || []).concat(v);
for (const [k, v] of Object.entries(wrap)) rules[k] = (rules[k] || []).concat(/^(fp\.lead|fr\.pre)/.test(k) ? fixLead(v) : v);
for (const [k, v] of Object.entries(cores)) rules[k] = (rules[k] || []).concat(v);
// wrap: move each feed.<topic> / feedreply.<topic>.<tone> into core.<key> and put wrapper alternatives in its place
const TONES = ['agree', 'help', 'joke', 'argue', 'interest'];
for (const k of Object.keys(rules)) {
  if (/^feed\.[a-z_]+$/.test(k) && k !== 'feed.goal') {
    const core = 'core.' + k; rules[core] = rules[k]; rules[k] = [{ t: `#${core}#`, w: 3 }, { t: `#fp.lead# #${core}#`, w: 2 }, { t: `#${core}# #fp.tail#`, w: 2.5 }, { t: `#fp.lead# #${core}# #fp.tail#`, w: 1.5 }];
  } else { const m = /^feedreply\.[a-z_]+\.(agree|help|joke|argue|interest)$/.exec(k); if (m) { const t = m[1], core = 'core.' + k; rules[core] = rules[k]; rules[k] = [{ t: `#${core}#`, w: 1 }, { t: `#fr.pre.${t}# #${core}#`, w: 2 }, { t: `#${core}# #fr.post.${t}#`, w: 2 }, { t: `#fr.pre.${t}# #${core}# #fr.post.${t}#`, w: 4 }]; } }
}
for (const t of TONES) { const k = 'feedreply.' + t; if (rules[k]) { const core = 'core.' + k; rules[core] = rules[k]; rules[k] = [{ t: `#${core}#`, w: 1 }, { t: `#fr.pre.${t}# #${core}#`, w: 2 }, { t: `#${core}# #fr.post.${t}#`, w: 2 }, { t: `#fr.pre.${t}# #${core}# #fr.post.${t}#`, w: 4 }]; } }
export default { rules };
export { rules };

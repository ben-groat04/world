// Social/comms text pack (owned by W1-E). Merged by comms init on top of the base pack grammar.
import forum from './forum.js';
import chats from './chats.js';
import rumours from './rumours.js';
const rules = {};
for (const g of [forum, chats, rumours]) for (const [k, v] of Object.entries(g)) rules[k] = (rules[k] || []).concat(v);
export default { rules };
export { rules };

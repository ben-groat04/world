// Larkfield text grammar pack: merges every file under this folder into one { rules } object. Add files here to extend.
import lexicon from './lexicon.js';
import social from './social.js';
import news from './news.js';
import news2 from './news2.js';
import messages from './messages.js';
import thoughts from './thoughts.js';
import lives from './lives.js';
import daily from './daily.js';
import daily2 from './daily2.js';
import lines from './lines.js';
import news3 from './news3.js';
import thoughts2 from './thoughts2.js';
const rules = {};
for (const g of [lexicon, social, news, news2, messages, thoughts, lives, daily, daily2, lines, news3, thoughts2]) for (const [k, v] of Object.entries(g)) rules[k] = (rules[k] || []).concat(v);
const sentiment = { 'life.birth': 'pos', 'life.marriage': 'pos', 'life.couple': 'pos', 'life.engaged': 'pos', 'life.graduate': 'pos', 'work.hired': 'pos', 'work.promoted': 'pos', 'biz.open': 'pos', 'money.windfall': 'pos', 'health.recovered': 'pos', 'social.reconcile': 'pos', 'social.friendship': 'pos', 'school.result': 'pos',
  'life.death': 'neg', 'life.breakup': 'neg', 'work.fired': 'neg', 'biz.close': 'neg', 'home.eviction': 'neg', 'home.rent_rise': 'neg', 'money.debt': 'neg', 'crime.burglary': 'neg', 'crime.bike_theft': 'neg', 'health.diagnosis': 'neg', 'social.fallout': 'neg' };
export default { rules, sentiment };
export { rules };

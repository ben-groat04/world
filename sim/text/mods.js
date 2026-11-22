// String modifiers + UK number/money/date/time phrasing. Pure.
const ONES = ['zero', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten', 'eleven', 'twelve', 'thirteen', 'fourteen', 'fifteen', 'sixteen', 'seventeen', 'eighteen', 'nineteen'];
const TENS = ['', '', 'twenty', 'thirty', 'forty', 'fifty', 'sixty', 'seventy', 'eighty', 'ninety'];
export function words(n) {
  n = Math.round(n); if (n < 0) return 'minus ' + words(-n);
  if (n < 20) return ONES[n];
  if (n < 100) return TENS[Math.floor(n / 10)] + (n % 10 ? '-' + ONES[n % 10] : '');
  if (n < 1000) return ONES[Math.floor(n / 100)] + ' hundred' + (n % 100 ? ' and ' + words(n % 100) : '');
  if (n < 1e6) return words(Math.floor(n / 1000)) + ' thousand' + (n % 1000 ? (n % 1000 < 100 ? ' and ' : ' ') + words(n % 1000) : '');
  return String(n);
}
export const ord = (n) => { n = Math.round(n); const s = ['th', 'st', 'nd', 'rd'], v = n % 100; return n + (s[(v - 20) % 10] || s[v] || s[0]); };
export const commas = (n) => Math.round(n).toString().replace(/\B(?=(\d{3})+(?!\d))/g, ',');
export const gbp = (n) => (n < 0 ? '-' : '') + '£' + (Math.abs(n) % 1 ? Math.abs(n).toFixed(2) : commas(Math.abs(n)));
export const quid = (n) => { n = Math.round(n); return n === 1 ? 'a quid' : n < 100 ? `${n} quid` : n >= 1000 ? `${commas(n)} quid` : `${n} quid`; };
export const DAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];
export const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
export const daypart = (h) => (h < 5 ? 'in the small hours' : h < 12 ? 'this morning' : h < 17 ? 'this afternoon' : h < 21 ? 'this evening' : 'tonight');
export function timePhrase(h, m = 0) {
  m = Math.round(m / 5) * 5; if (m === 60) { m = 0; h = (h + 1) % 24; }
  const h12 = (x) => { x = ((x % 24) + 24) % 24; return x === 0 ? 'midnight' : x === 12 ? 'midday' : ONES[x % 12 || 12]; };
  const nxt = h12(h + 1);
  if (m === 0) return h === 0 || h === 12 ? h12(h) : `${h12(h)} o'clock`;
  if (m === 30) return `half ${h12(h) === 'midday' || h12(h) === 'midnight' ? 'twelve' : h12(h)}`;
  if (m === 15) return `quarter past ${h12(h)}`;
  if (m === 45) return `quarter to ${nxt}`;
  return m < 30 ? `${words(m)} past ${h12(h)}` : `${words(60 - m)} to ${nxt}`;
}
export const datePhrase = (d) => (d ? `${d.weekday != null ? DAYS[d.weekday] + ' ' : ''}${ord(d.day)} ${MONTHS[d.month]}` : '');
/** "a" or "an" for a phrase: by SOUND, not spelling. Acronyms go by their first letter's name (an HR, an HGV, an NHS, a GP), "hour/honest/heir/honour" take "an", "uni-/use/eu-/one" take "a". The one rule everything shares. */
export const articleFor = (s) => { const w = String(s).trim().split(/[\s-]/)[0]; if (/^[A-Z]{2,}\b/.test(w)) return /^[AEFHILMNORSX]/.test(w) ? 'an' : 'a'; return /^(hour|honest|heir|honou?r)/i.test(w) || (/^[aeiou]/i.test(w) && !/^(uni([^nm]|$)|use|usu|uti|ute|ura|uro|eu|one|once|ubiq|ufo)/i.test(w)) ? 'an' : 'a'; };
export const a_an = (s) => articleFor(s) + ' ' + s;
export const plural = (s) => s.replace(/(\w+)$/, (w) => (/(s|x|z|ch|sh)$/i.test(w) ? w + 'es' : /[^aeiou]y$/i.test(w) ? w.slice(0, -1) + 'ies' : /^(man)$/.test(w) ? 'men' : /^woman$/.test(w) ? 'women' : /^child$/.test(w) ? 'children' : w + 's'));
export const cap = (s) => (s ? s[0].toUpperCase() + s.slice(1) : s);
export const sent = (s) => s.replace(/(^|[.!?]\s+|\n)([a-z])/g, (m, a, b) => a + b.toUpperCase());
export const MODS = {
  cap, upper: (s) => s.toUpperCase(), lower: (s) => s.toLowerCase(), sent, trim: (s) => s.trim(), a: a_an, s: plural,
  title: (s) => s.replace(/\b([a-z])/g, (m, c) => c.toUpperCase()),
  gbp: (s) => gbp(+s), quid: (s) => quid(+s), words: (s) => (isNaN(+s) ? s : words(+s)), ord: (s) => (isNaN(+s) ? s : ord(+s)), num: (s) => (isNaN(+s) ? s : commas(+s)),
  pct: (s) => `${Math.round(+s * (+s <= 1 ? 100 : 1))}%`, nowords: (s) => (isNaN(+s) ? s : +s < 13 ? words(+s) : String(s)),
};
/** Final tidy: spacing, punctuation, stray articles. */
function tidyBase(s) {
  return s.replace(/\u0001/g, '#').replace(/[ \t]+/g, ' ').replace(/ +([,.!?;:])/g, '$1').replace(/([,;:])\1+/g, '$1').replace(/ ?\n ?/g, '\n').replace(/\.\.(?!\.)/g, '.').replace(/,\./g, '.').replace(/\b(an?) (an?) (?=[A-Za-z])/gi, (m, a1, a2) => (a1[0] === 'A' ? 'A' : 'a') + ' ').replace(/\b(an?|An?) ([A-Za-z][\w'-]*)/g, (m, art, w) => { const want = articleFor(w), up = art[0] === 'A'; const ok = art.toLowerCase() === want; return ok ? m : (up ? want[0].toUpperCase() + want.slice(1) : want) + ' ' + w; }).replace(/\b(the|The) The\b/g, '$1').replace(/\b(the|The) the\b/g, '$1').replace(/(^|[.!?]\s+)the /g, (m, a) => a + 'The ').trim();
}

const SING = { days: 'day', weeks: 'week', months: 'month', years: 'year', hours: 'hour', minutes: 'minute', mins: 'min', replies: 'reply', times: 'time', messages: 'message', likes: 'like', comments: 'comment', posts: 'post', things: 'thing', visits: 'visit', people: 'person', neighbours: 'neighbour', households: 'household', residents: 'resident', notices: 'notice', letters: 'letter' };
/** "hearing/sight loss" -> "hearing or sight loss": taxonomy slashes never belong in prose (and/or, w/, 24/7, s/he excepted). */
export const deslash = (s) => String(s).replace(/(?<![\w/])([A-Za-z]{2,})\/([A-Za-z]{2,})(?![\w/])/g, (m, a, b) => (/^(and|w|n|a|s|he|him|his|they|yes)$/i.test(a) && /^(or|c|a|e|she|her|them|their|no)$/i.test(b) ? m : `${a} or ${b}`));
/** Final tidy: spacing, punctuation, articles by sound, doubled words, and number agreement ("1 replies" -> "1 reply", "for 0 days" -> "for less than a day"). */
export function tidy(s) {
  return deslash(tidyBase(s)).replace(/\bfor 0 (day|week|month|year|hour)s\b/g, 'for less than a $1').replace(/(^|[^\d.,£/:-])1 (days|weeks|months|years|hours|minutes|mins|replies|times|messages|likes|comments|posts|things|visits|people|neighbours|households|residents|notices|letters)\b/g, (m, pre, n) => pre + '1 ' + SING[n]);
}

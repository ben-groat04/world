// W4 item 5, the delete-only pass: one call is given the day's messages, numbered, and the last CONTEXT earlier ones, and returns the numbers of the messages that read as written for an audience. It writes no text, so nothing can leak into the chat. Code drops them: at most a quarter of the day (a design parameter); a question to Claude and Claude's answers stay.
// Used by writer.mjs (--cut) and cut-replay.mjs.
const CAP = 4, CONTEXT = 20; // design parameters: at most 1/CAP of a day's messages are cut; earlier messages shown
const WD = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'], stampOf = at => `${WD[new Date(at + ':00Z').getUTCDay()]} ${at.slice(11, 16)}`;
const plain = m => `${stampOf(m.at)}, ${m.who}: ${m.text.replace(/\n+/g, ' / ')}`, numbered = ms => ms.map((m, i) => `${i + 1}. ${plain(m)}`).join('\n');
// call(input, system, effort) -> {text, usage}; names: the people; asks: regex of a question to Claude. Returns {dm: kept messages, cut: dropped messages, usage}.
export async function cutDay(call, envNote, names, so_far, dm, asks, label) {
  const keep = dm.map(m => !!m.oracle || asks.test(m.text.trim())), cap = Math.floor(dm.length / CAP); if (cap < 1) return { dm, cut: [] };
  const earlier = so_far.slice(-CONTEXT), list = names.length < 2 ? names.join('') : names.slice(0, -1).join(', ') + ' and ' + names.at(-1);
  const ask = `This is a text chat between ${list}.\n\nEarlier messages:\n${earlier.length ? earlier.map(plain).join('\n') : '(none)'}\n\nThe day's messages:\n${numbered(dm)}\n\nWhich of the numbered messages of the day read as written for an audience rather than typed by the person: a punchline, a callback to an earlier joke, a line that neatly closes a thread, an over-complete message? Reply with their numbers only, or none.`;
  const r = await call(ask, `${envNote} You read text chats and say which messages do not read as really typed.`, 'low').catch(e => (console.error(`${label}: cut pass failed: ${e.message}`), null)); if (!r) return { dm, cut: [] };
  const nums = [...new Set((r.text.match(/\d+/g) ?? []).map(Number))].filter(n => n >= 1 && n <= dm.length && !keep[n - 1]).slice(0, cap);
  return { dm: dm.filter((_, i) => !nums.includes(i + 1)), cut: nums.map(n => dm[n - 1]), usage: r.usage };
}

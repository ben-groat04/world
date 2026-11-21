// Web Worker entry: runs the Larkfield sim off the UI thread. Messages: {cmd:'init',seed} then Host.command messages.
import { Host } from './host.js';
let host = null, last = 0, lastFlush = 0;
const send = (m, tr) => (tr ? self.postMessage(m, tr) : self.postMessage(m));
const pending = [];
function loop() {
  const now = performance.now(), dt = Math.min(0.25, (now - last) / 1000); last = now;
  try {
    host.advance(dt, host.tps === Infinity ? 24 : 12);
    if (now - lastFlush >= (host.tps === Infinity ? 90 : 40)) { lastFlush = now; host.frame(now); }
  } catch (e) { send({ t: 'error', error: String((e && e.stack) || e) }); host.setTier('pause'); }
  setTimeout(loop, host.tps === 0 ? 30 : 2);
}
self.onmessage = (e) => {
  const m = e.data;
  if (m.cmd === 'init' && !host) {
    try { host = new Host(m.seed || 1, send); host.hello(); } catch (err) { send({ t: 'error', error: String((err && err.stack) || err) }); return; }
    last = performance.now(); loop(); for (const q of pending.splice(0)) host.command(q);
  } else if (host) { try { host.command(m); } catch (err) { send({ t: 'error', error: String((err && err.stack) || err) }); } } else pending.push(m);
};

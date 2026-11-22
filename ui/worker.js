// Web Worker entry: runs the Larkfield sim off the UI thread. Messages: {cmd:'init',seed} then Host.command messages.
import { Host } from './host.js';
let host = null, last = 0, lastFlush = 0;
const send = (m, tr) => (tr ? self.postMessage(m, tr) : self.postMessage(m));
const pending = [];
// Cadence: Scene shows people walking (40 ms frames); the time-lapse tiers teleport people between frames, so 10 frames/s is plenty
// and spares the main thread (fewer messages, redraws, feed renders). Max yields through a MessageChannel instead of setTimeout so the
// worker never idles between slices (setTimeout clamps to 4 ms), while still reading incoming taps/commands between slices.
const mc = new MessageChannel(); let yielding = false; mc.port1.onmessage = () => { yielding = false; loop(); };
function loop() {
  const now = performance.now(), dt = Math.min(0.25, (now - last) / 1000); last = now;
  const max = host.tps === Infinity, lapse = host.tps > 100;
  try {
    host.advance(dt, max ? 30 : 12);
    if (now - lastFlush >= (max ? 130 : lapse ? 100 : 40)) { lastFlush = now; host.frame(now); }
  } catch (e) { send({ t: 'error', error: String((e && e.stack) || e) }); host.setTier('pause'); }
  if (max) { if (!yielding) { yielding = true; mc.port2.postMessage(0); } } else setTimeout(loop, host.tps === 0 ? 30 : 2);
}
self.onmessage = (e) => {
  const m = e.data;
  if (m.cmd === 'init' && !host) {
    try { host = new Host(m.seed || 1, send); host.hello(); } catch (err) { send({ t: 'error', error: String((err && err.stack) || err) }); return; }
    last = performance.now(); loop(); for (const q of pending.splice(0)) host.command(q);
  } else if (host) { try { host.command(m); } catch (err) { send({ t: 'error', error: String((err && err.stack) || err) }); } } else pending.push(m);
};

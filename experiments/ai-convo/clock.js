// Shared simulated clock: 1 real second = 5 sim minutes. Writes clock.txt; exits at END.
import { writeFileSync } from 'node:fs';
const start = new Date('2026-10-29T18:00:00'), end = new Date('2026-11-01T23:00:00'), RATE = 300; // sim seconds per real second
const t0 = Date.now(), days = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'];
const tick = () => { const t = new Date(start.getTime() + (Date.now() - t0) * RATE);
  const s = t >= end ? 'END' : `${days[t.getDay()]} ${String(t.getHours()).padStart(2,'0')}:${String(t.getMinutes()).padStart(2,'0')}`;
  writeFileSync(new URL('./clock.txt', import.meta.url), s + '\n'); if (s === 'END') process.exit(0); };
tick(); setInterval(tick, 1000);

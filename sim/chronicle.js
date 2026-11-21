// The town's record: notable events + per-person biographies.
import { formatDate, formatDateTime, formatTime } from './time.js';
export { formatDate, formatDateTime, formatTime };

export class Chronicle {
  constructor(world) {
    this.world = world;
    this.entries = [];          // append-only, ordered by tick
    this.byPerson = new Map();  // personId -> entry[]
    this.nextId = 1;
  }
  // add({tick?, type, importance 1-5, text, people:[ids]}) -> entry. Emits 'chronicle'.
  add({ tick, type = 'event', importance = 2, text, people = [], buildingId = null }) {
    const e = { id: this.nextId++, tick: tick ?? this.world.tick, type, importance, text, people, buildingId };
    this.entries.push(e);
    for (const id of people) {
      let l = this.byPerson.get(id);
      if (!l) this.byPerson.set(id, (l = []));
      l.push(e);
    }
    this.world.emit('chronicle', e);
    return e;
  }
  // newest-first list of the last n entries with importance >= minImportance
  recent(n = 20, minImportance = 1) {
    const out = [];
    for (let i = this.entries.length - 1; i >= 0 && out.length < n; i--) if (this.entries[i].importance >= minImportance) out.push(this.entries[i]);
    return out;
  }
  // query({sinceTick, untilTick, type, minImportance, person, limit}) -> newest-first
  query({ sinceTick = -Infinity, untilTick = Infinity, type, minImportance = 1, person, limit = 50 } = {}) {
    const src = person != null ? (this.byPerson.get(person) || []) : this.entries;
    const out = [];
    for (let i = src.length - 1; i >= 0 && out.length < limit; i--) {
      const e = src[i];
      if (e.tick < sinceTick) break;
      if (e.tick > untilTick || e.importance < minImportance || (type && e.type !== type)) continue;
      out.push(e);
    }
    return out;
  }
  format(e) { return `${formatDate(e.tick)}: ${e.text}`; }
  // Biography lines for a person (oldest-first): [{tick, date, text, source, importance}]
  // Merges the person's memories (weight>=minWeight) with chronicle entries that mention them.
  biography(personId, minWeight = 0.3) {
    const p = this.world.people.get(personId);
    const lines = [];
    if (p) lines.push({ tick: p.birthTick, date: formatDate(p.birthTick), text: 'Born.', source: 'birth', importance: 3 });
    const seen = new Set();
    if (p) for (const m of p.memories) {
      if (Math.abs(m.weight) < minWeight && (m.importance ?? 0) < 3) continue;
      seen.add(m.text);
      lines.push({ tick: m.tick, date: formatDate(m.tick), text: m.text, source: 'memory', importance: m.importance ?? Math.max(1, Math.round(Math.abs(m.weight) * 5)) });
    }
    for (const e of this.byPerson.get(personId) || []) {
      if (seen.has(e.text)) continue;
      lines.push({ tick: e.tick, date: formatDate(e.tick), text: e.text, source: 'chronicle', importance: e.importance });
    }
    if (p && !p.alive && p.deathTick != null) lines.push({ tick: p.deathTick, date: formatDate(p.deathTick), text: `Died${p.causeOfDeath ? ' (' + p.causeOfDeath + ')' : ''}.`, source: 'death', importance: 4 });
    lines.sort((a, b) => a.tick - b.tick);
    return lines;
  }
  biographyText(personId) { return this.biography(personId).map((l) => `${l.date}: ${l.text}`).join('\n'); }
  // most important entries in a tick range, for newspapers / summaries
  digest(sinceTick, untilTick = Infinity, limit = 10, minImportance = 3) {
    return this.query({ sinceTick, untilTick, minImportance, limit: 5000 }).sort((a, b) => b.importance - a.importance || b.tick - a.tick).slice(0, limit);
  }
}

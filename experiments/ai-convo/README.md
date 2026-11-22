# AI conversation test

Four AI agents, each a separate Sonnet instance holding one persona and its own memory, share a flat in a UK city.
They talk in a WhatsApp group and in person. The orchestrator only sets time and place ("scene direction") and says whose turn it is; it never writes their lines.

Files
- `transcript.md` — everything said, in order (group chat + in person). Agents append their own lines.
- `private/<name>.md` — each agent's private thoughts after each turn (what they didn't say).
- `director.md` — every instruction the orchestrator gave, verbatim, for audit.

Rules given to every agent: stay in character; only know what your persona knows plus what's in the transcript; you may stay silent; text like a real person (length, typos, emoji as fits the character); British register; no therapy-speak or tidy resolutions.
- Note: non-agent characters (e.g. Kuba) are voiced by the persona present with them.

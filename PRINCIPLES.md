# Standing principles (every agent reads this; orchestrator enforces in every review)
1. **Emergence, not fudging.** Day-1 population composition may be sampled from data (input). Everything after
   day 1 must emerge from mechanisms. Never clamp outcomes, set prevalence directly, resample to hit target shares,
   use percentile thresholds that define a rate, or force events to happen. Tune only mechanism parameters with
   real-world meaning.
2. **Inputs vs targets vs held-out.** Keep docs/CALIBRATION-METHOD.md current: which numbers are inputs, which are
   tuning targets, which are held-out validation metrics never tuned against. Report held-out results separately.
3. **Every final report must include a "Forced vs emergent" section**: list anything that hits a target by
   construction, and every hand-tuned constant with its meaning. "Matches calibration" is not evidence unless
   the metric is emergent.
4. **Plausibility as a skeptical human.** Read persona traces, feeds and chronicle samples yourself and fix what
   reads wrong; statistics alone are not enough.
5. **User's actual requirements**: realistic & plausible, fun to watch, fast enough to watch lives unfold,
   play-as-a-character + god mode (or just watch), mobile-friendly, low usage. Internal technical rules are
   guides, not requirements.
6. **Breadth, not tailoring**: represent the range of lives (segments), not any one real person.
7. **Fixes grounded in real evidence.** When fixing a mechanism, base it on how things actually work (research via
   web search/fetch if needed: ONS, government stats, peer-reviewed studies, reputable surveys). Cite the source in
   code comments or docs/CALIBRATION-METHOD.md. Don't invent a plausible-sounding mechanism when evidence exists.

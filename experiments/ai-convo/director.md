# Director log (orchestrator instructions, verbatim)
- T1 → Dami: "Tuesday 19:40, you're on the bus home from a long shift. The quarterly energy bill just came in: £412 (last quarter was £268). Your share would normally be due by Friday as the direct debit leaves your account Monday. You open the group chat. Do what you'd do."
- T2 → Tom: "Tuesday 21:50, you're on your break out the back of the restaurant kitchen, first look at your phone since 4pm."
- T3 → Magda: "Tuesday 22:30, in bed in your room; Kuba is here, watching something on his laptop next to you."
- T4 → Raj: "Wednesday 07:10, kitchen, making coffee before a 9am interview call for a contract. Nobody else up yet. You see the group chat."
- T5 → Dami: "Thursday 18:05, home after an early shift, sofa. Your banking app shows £103 in from Magda (Wed 14:20) and £103 from Raj (Wed 08:02). Nothing from Tom."
# Live mode started 11:33 real time; clock Thu 18:00 -> Sun 23:00, 1s = 5min
- External event rolled: OFFER: recruiter calls Fri 11:30 — they want him, start in 2 weeks, good day rate. (delivered to Raj only)
- 11:36 Director told all four: loop wait 20s -> 5s (they were checking only every ~3 sim hours)
- 11:36 Stopped by user. Clock at Fri 09:31.

## Run 3: event-driven workflow (started after user said "A")
- Scheduler jumps to the next moment someone acts; one Sonnet call per decision (location, chat 0-3, private thought, when they next check) or per in-person utterance.
- People due within 10 min act in parallel; co-located people in kitchen/living room get a scene (sequential speech, anyone may stay quiet or leave).
- Period: Thu 18:30 -> Sun 23:00, cap 140 decisions.
- External events (pre-set, private): Raj — recruiter offer Fri 11:30 (from earlier coin flip). Tom — payday Sat 09:00, ~£180 spare after card minimum.
- Raj's 'Fri 08:15' note from the stopped run was dropped (it was ahead of the restart time).

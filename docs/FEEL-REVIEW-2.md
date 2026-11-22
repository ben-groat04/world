# Feel review, round 2 (seed 1/3, iPhone 13 via Playwright; ~3 game-years watched at Lifetime/x5/x20/Max, 2 play sessions, 3 god presets)

Method: cold first-time user on a phone. Evidence is quoted from the live feed/sheets. "FIXED" = changed this round.

## What improved since round 1
- Newcomers now get knocks on the door; storylines have headlines and a "Who to follow"; human durations; clamped map; hiring has interview lag; god rent shock/heatwave have visible chains. Cold start is calmer and the street map at dusk is still the best moment.

## Ranked problems
1. **Sim stalled at 1 Sep 2034 in a 10-year watch**: `TypeError ... setting 'post16'` in `septemberTransitions` (an arrival with no `ext.life`). x20 froze on the same date for 3 samples. FIXED with a 1-line guard in sim/systems/life/stages.js (perf agent: please verify the root cause, which is arrivals created without a life record).
2. **Gossip dumps**: every Wednesday 7-8 identical-shaped items ("A secret about Amelia gets out", "Did you hear? Word spreads about Dean", no body) = ~12% of the feed. FIXED: first item per day shows, the rest fold into one "Talk of the town" line; bodies written ("Nobody will say what it is, but X has been taking the long way round...").
3. **Broken copy**: "Rahul Pandya and someone are now seeing each other", "ended their relationship after zero years", weddings "married on NaNth undefined", every "on Monday" (date fields mismatched the grammar). FIXED: solo headline/body variants when the partner is not a resident, "a few months/about a year" spans, real weekday/date mapping.
4. **Churn reads as nonsense**: "Goodbye to Jamie King, off to elsewhere in the area" + "Welcome to Larkfield, Jamie" on the same day. FIXED: a leave followed by an arrival within 5 days becomes one "changes address" item (moves are held 5 days before showing).
5. **Fast-forward has no payoff**: at x20/Max a year goes by with nothing to hold on to. FIXED: "While you were fast-forwarding" digest card (period, counts of babies/weddings/break-ups/jobs..., six varied headlines, tap to open the person). Skipped when "Next event" was used.
6. **No onboarding**: first screen is a time-lapse with an unlabelled triangle (play) and a hidden sheet. FIXED: first-visit welcome card (Watch / Play a resident / God mode), pauses until chosen, remembered in localStorage.
7. **Play: walls of options**. Life admin opened on a 50-row job list (Doctor, Solicitor for a 27-year-old with no CV) with "Start a business" below it; Go somewhere listed "10 Cutting Road / arch unit" x25 alphabetically. FIXED: jobs = 8 nearest/approachable, the rest folded ("42 more jobs, mostly professional"); places grouped (Meet people, Parks/sport/worship, Eating out, Shops, Getting about) and workshops/arches/schools hidden; duplicate "Say hello to X" rows removed; hint that a side-hustle goal exists when a unit is unaffordable.
8. **Play feedback was flat**: every chat ended "X took it in their stride, and nothing much changed". FIXED: the other person now says something ("Terrible weather, isn't it? Honestly though..."), outcome text varies by act and reaction; "You are acquaintance" grammar fixed.
9. **Forum replies off-topic**: kids/dogs/goal posts had no pools; "Where is the best fish and chips?" -> "Try Steve (the plumber)"; toddler-group question -> "number 14 bus". FIXED: new topic pools (kids, dogs, goal), neutral recommend/question replies.
10. **Mental health named in public feed** ("Layla struggling with depression"). FIXED: individual episodes/substance items no longer appear in the Watch feed (still in the person's profile and storylines).
11. Storylines repeated beats ("fell behind on rent" x3). FIXED: consecutive repeats collapse ("again x3").
12. Outbreak had no news ("An epidemic wave or heatwave started / ended" raw). FIXED: proper outbreak/heat headlines (listed under Town), deduped.

## Still open (not in my ownership or too big)
- **Pandemic preset has almost no personal consequences**: tracker shows "Pandemic: 2 events, 0 people" 4 months on; flu/colds are not linked to the wave. Library cut likewise: 2 events, 0 people. Shop closure works well (12 events, 5 people). Needs sim/systems/health to attribute `health.ill` to the wave.
- No market stall / pop-up: the smallest business is a high-street unit with tens of thousands of set-up. Needs a sim command for low-cost stalls (side-hustle goal is the stopgap).
- Café scene at 03:30 on a Monday: "Lena's Kitchen" had customers (opening hours not respected by routine/places).
- Heavy repetition remains in templated feed lines (job moves, "falls behind on the rent" ~15% of items); second-job/accident items have no body.
- Dating works only through the Phone menu; getting a first date in a session of ~10 game-days is unlikely (needs weeks of talking). That is realistic but should be signposted ("matches arrive ~1-2/week").
- Take-over-a-resident not re-tested in depth; gossip about the player still only in Me > reputation.

Screens: docs/screenshots/feel2-watch.png, feel2-play.png (iPhone 13 @2x).

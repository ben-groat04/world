# Iteration log

One entry per round: what changed, what happened, what we learned. Read this before proposing or making changes, so failed ideas aren't retried and fixes aren't undone.

Goal: blind judges can't tell runs from real people texting (target 8/10), Haiku characters, any situation the user types (often minimal), no overfitting to the test scenarios.

## Process lessons
- Change one coherent set at a time, and check each change cheaply first (replay logged turns with `replay.mjs`, generator-only runs, re-polishing logged drafts) before any batch. Round 11 changed many things with one smoke test, and nothing showed which change silenced the chats.
- Workflow: runs → Opus cold read → Sonnet coder → cheap checks → runs. Don't launch runs or change code between those steps on a hunch (rounds 10 and 12 wasted runs that way).
- Don't steer the cold read or the judges: give them all the evidence, no priorities or specific questions. Pass the user's observations on neutrally, labelled as theirs.
- Keep briefs to coders short; don't pile follow-up notes onto a running agent.
- Judge prompt: neutral ("score 0-10, explain"). Pairwise judging failed (position and length bias: second or shorter file won ~30/37).
- Real-chat anchors only if format-matched (names, multiple speakers); single-speaker NUS SMS streams are spotted by format. For now, compare versions against each other.
- Real-world facts must be sourced; design choices and example text need not be.

## Rounds

**1-3 (early).** Behaviour-instruction briefs ("talk as you would with friends", "keep it short") → polished assistant prose. Situation brief instead → better. WebFetch on characters → "I can't book from here" confessions; tools removed. Inherited `CLAUDE_CODE_SESSION_ID` made agents share memory; all `CLAUDE*` env stripped.

**4-5.** Away/life flags; private lines per person (helped, 13-5 pairwise). Nobody knew their own city → "I don't have the city" loops. Generated shared setting added.

**6.** Reactions (helped). Re-check before sending. Tool-call junk and `<result>hi</result>` loops from output caps → failed turns dropped.

**7.** `--system-prompt-snapshot off` (daily lines never reached resumed sessions). Fiction framing arm: no clear gain, removed. Re-check prompt leaks ("Sending it as is") → SEND token.

**8 (batch 8, 36 runs).** Effort low vs default: no difference (3.5 vs 3.6). Chats died: PASS on 98% of "nothing new" looks, mean 26 messages, all ended on date. Daily refresh froze the world (no date, only own messages, "some done, some slipping" → promise/miss/confess loops). No common ground → everyone announces their job.
- Sonnet characters on the same worlds: worse (14 messages/run, 6/18 empty). Model size isn't the fix.

**9.** Refresh every 6h from the whole chat, as "Since you last looked:"; phone screen with own messages; common ground in setting; per-person sleep; equal non-overlapping eval windows. Chats still died: life events played out the chat moves offstage ("you sent the budget") or wrote reticence in ("you haven't told her").

**10.** Life events leave the chat out; unprompted looks tied to life refresh; descriptive relay note; own-message-not-new fix. Pilots: 46 msgs/run, no dead runs. But judged ~1-3.5: assistant register, disaster-spiral events, agents answer their own events, can't act ("I don't want to guess figures" → tried running bash in the chat), lockstep clocks.
- Mistake: I made my own fixes and launched pilots before the cold read came back.

**11.** Style cards (14 fixed), polish rewrite pass, events marked off-screen, agents know their own lives, texting norms in NOTE, de-locked clock, wants, STATELESS arm. Texting looked real, but chats went silent: openers posted 1/14 (NOTE norms read as "hold back"), PASS lock-in in memory, wants were favours for others.
- Mistake: launched 12 pilots after the coder already reported quietness; stopped them.

**12.** Every look has a reason (or is skipped); opener cue from topic; NOTE rewrite; quiet forks not kept; faithful polish; place variety (a stated place wins); last line decides PASS; run metrics; replay.mjs. Mini batch (14 runs): 43 msgs/run, median 11 words, names in 29%, openers all posted. Judges 4.4/10 (memory 4.5, stateless 4.3: memory isn't the bottleneck).
- Remaining: the "reason" plus "wants" act as a hidden director (re-asks settled things, e.g. a swim invite ×4, because the reason generator only sees recent chat); style cards are caricatures applied twice (agent + polish); styles random, not fitted to person (clashing registers); roles not mapped ("parent and adult child" → two young adults); reactions pushed and copied; lots of lowercase and abbreviations (7/14 cards); shift-worker drift → 4am texts.

**13 (in progress).** Remove wants and reasons; topic only in the opener's first turn; one casting call builds names, ages, roles, relations and a per-person texting description with own examples (replaces fixed cards); voice applied once in polish with recent-message awareness; reactions only where a reaction is the answer, others' shown as counts; fewer names.
- Watch: removing the reason must not bring back silent chats (it fixed openers in round 12).
- Coder checks: re-asks 25/25 → 0/25; openers 99% after rewording the topic cue (first wording 80%); notification replay 69% → 65%; casting maps roles (needed a first-person clause for briefs like "my ex"); night workers 3/71; names cluster (Priya, Tom). Polish replay showed no big drop in tics (drafts were written under the old cards, so it can't show the change).
- Live smoke run (allotment, 3 people): 7 messages, then silent for 3 days. Coder thought 'small things' lacked a tie to the group and made them connect to these people.
- Check runs on unseen briefs: housemates 11 msgs, old school friends 1:1 9, cousins with topic 37 (2 days). Cold read: a bug, not restraint. The 'Small thing' was generated but never shown to the agent (only Day went into the turn): 47 small things, 0 reached the agent, 0 texted. The 'no tie to the group' diagnosis was wrong.
- Also found: polish cuts decisions and commitments ('restated plans or promises' rule) leaving orphan fragments; emoji echo (polish only forbade adding emoji); 'group' wording in 1:1 chats (hard-coded); life generator narrates the chat again (round 9 failure creeping back).

**14 (in progress).** Small thing inside the Day the agent reads (unlabelled, not a reason); polish cuts filler only and keeps decisions/offers/times; no repeated emoji; group/1:1 wording; Day never mentions the chat. Order: item 1 alone and checked, then polish items, then wording.
- Coder checks (round 14): small thing reached the Day in ~85% by eye (plan's wording did worse; "Day begins with the small thing" best); replay of look turns: post rate 27% → 53%, posts mentioning the small thing 3/27 → 25/56, register leans show-and-tell. Polish: emoji repeats 15/22 → 2/11, added words 39 → 27 (needed "changing as few words as needed"), decisions kept; a stricter "restates a plan" rule dropped real content, reverted. 1:1 wording clean. Day mentions of chat 8/47 → 3/47.
- Batch (9 runs, DAYS=2): mean 20 msgs (round 12: 43). Too few long runs to judge. Cold read: partly realistic (coworkers, cousins), partly mechanism: (1) quiet looks not kept (round 12) made the screen show already-seen messages as "(new)" in 45% of turns → stale re-reactions and replies; (2) Small thing still missing from the Day in ~half of refreshes (model writes Small thing first, then treats it as said); (3) agents won't text twice in a row (26% post rate when own message is last) and nothing says how often a person messages unprompted; (4) DAYS=2 cut timelines. Also: "PASS\n</br>" posted as "Pass."; polish framing leaked once; assistant cadence kept by "change as few words".

**15 (in progress).** "(new)" at the last real look (memory rule unchanged); Day written first, Small thing copied from it; cast says how often each person messages unprompted (per person, not a NOTE norm); tag lines ignored when reading the last line; use sc.sh DAYS. Plus a fresh-session replay diagnostic.
- Coder checks (round 15): "(new)" now marks only unseen messages (61% of R14 turns had seen ones under it). Small thing as the Day's first sentence, copied: in the Day 15/15 (old prompt 7/13); a yes/nothing flag made the model say "nothing" 22/27, dropped. Per-person unprompted frequency: varies across casts; replay post rate with own message last 36% → 47% (small n, unproven). Fresh-session replay of quiet looks: 39% vs 29% live, so memory may hold agents back a little.
- Batch (18 runs, full scenario lengths, memory vs stateless): mean 35 msgs (round 14: 20). Judges (6 Sonnet, 16 windows): memory 4.9, stateless 5.2, overall ~5.0 (round 12: 4.4). Best windows 7 (Scottish boiler chat, Auckland group, French family tart). One run crashed: an API refusal ("can't help with this") on a harmless polish call stopped the whole run. Judges named: polish instruction leaking into a message ("wait, I need to leave out the emoji and opener already used. Rewriting:"), reactions on nearly every message, running jokes repeated, status loops, timestamps contradicting content ("by 3:15" said at 15:44), people echoing each other.
- Cold read: status loops because the world only moves at refreshes (every 3.6-11h), so anything in progress stays unfinished; clock far from the reply point; reactions licensed by "such as a confirmation or news"; 362/658 refreshes said "nothing" and those looks were skipped, cancelling per-person unprompted frequency; polish's three overlapping no-repeat rules made it check itself in the output; refusal crash. Recommends stateless default (5.2 vs 4.9, fresh replays post more, loops occur in both).

**16 (in progress).** Life goes on between looks (in-progress things are over by the next refresh, promises resolve); every refresh look is a turn; clock moved next to the reply; reactions only where a reaction answers, per-person reaction habit in cast; one polish no-repeat rule; refusal = failed turn; (last, risky) don't carry on someone else's joke. Stateless default, memory kept as an arm for one more batch.

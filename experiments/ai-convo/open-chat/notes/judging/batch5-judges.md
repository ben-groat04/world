# Batch 5 blind pairwise judgements (four Sonnet judges, verbatim)

Design: BASE (attention delay from first unread per Pielot; re-check before sending if others posted; @claude answers private to asker) vs PRIV (BASE + EXP_PRIVATE generated private line per person). Haiku characters, 4 people, ORACLE on, default brief "This is a group chat on your phone with your friends A, B and C." Scenarios A (open), B (weekend plan topic), C (moving-away topic), D (Tom's bike secret), seeds 1-3. Key: pairs5-key.txt; run map: r5/map.txt (same scratchpad folder). Order balanced (odd pairs X=base). Each pair judged by two judges (j1: P01-06, j2: P07-12, j3: odd, j4: even). Runner end markers stripped from judge copies.
Note: BASE-C1, BASE-C2, BASE-D2 produced zero messages (everyone passed at "Conversation so far: (nothing yet)" for 3 days). Judges saw those as empty files.

Tally excluding the 3 forced pairs: PRIV 13 judgements, BASE 5.

## j1 (P01-P06)
- P01: Y, clear. Y has specific detail ("the starter died again", boiler, Thursday cardiology) and people reacting to each other. X is an emoji-heavy loop ("Night Tom! 🌙"), Maya replying to "Night" the next morning, and "Bye for now" chains. Y still has therapy-speak ("nothing you have to say tonight needs to be neat").
- P02: X, slight. X has concrete stakes (cold radiator, deck, landlord wording) and Maya skipping the call twice is plausible. Y has Jo's fake "almost there" and a ramen plan that never materialises. Both end in "See you at 7/Wednesday" loops. X's Maya double-posts a dangling "my draft…:" line.
- P03: Y, clear. "Which conclusion?" margin note, biscuits and Mum's dinner feel real. X is bland and nobody ever names the show. Y still has a "See you soon" ping-pong ending.
- P04: X, clear. X has real detail (nights, flat viewings, takeaway at hers). Y has the unreal "nobody knows what area we're in" and Sam's "The group chat has wrapped up, so I'll stop here", which is assistant-voice.
- P05: Y, strong. X is a 16KB loop where Maya won't pick a place and nobody can name their own town ("I can't check my location from here"). Y is short, plausible (head cold, Thursday confirm), though its "Night!/Night, Sam!" tail is stiff.
- P06: X, clear. X has the lopsided mug, plumber, pharmacy nights and banter. Y is generic logistics followed by a long "See you Saturday" loop.
Scores: P01 3/5, P02 5/4, P03 4/6, P04 6/2, P05 1/6, P06 7/4.
Tells: (1) endless mutual sign-off loops, every message answered, nobody goes quiet; (2) uniform politeness and over-validation, name addressed each time, no teasing/typos/fragments/disagreement; (3) characters don't know basic facts about their own lives (city, location, whether they own a laptop); promises don't match behaviour (fake "almost there", "I'll host" then nothing); assistant-like apologies ("I should have been straight with you").

## j2 (P07-P12)
- P07: Y, strong (X empty). Y has real moments ("Biscuit says thanks, or at least he's too sleepy to argue") but a bulleted bold advice list from Tom and a long "Night... give Biscuit a scratch" chain.
- P08: X, strong (Y empty). X is stiff, endless "See you Wednesday, Sam!" / "See you Wednesday, Tom!" loop, no typos.
- P09: X, slight. Y: mid-sentence split ("a few things might help:" then the list next message), Jo pasting an email line by line with "---" separators, 20-message loop of "send the draft when ready". X bland and loopy ("Talk later, everyone!" x4) but shorter.
- P10: Y, slight. X has banter ("towel duty", "rustic mug") and emojis but every line a "See you Wednesday 🍻" echo. Y has "I'm sorry, just seeing this now"; Maya's "Is anyone still at the table?" is odd.
- P11: Y, strong (X empty). Y has a "Cheers, Jo." / "Cheers, Sam." tail and "Night" at 17:11.
- P12: Y, slight-clear. Y lively film-night chat, bike-in-hallway jokes, then a "See you tonight 🐻" loop; Tom's pizza lie handled well. X grinding loop: Tom never names the neighbourhood, Sam never checks his hours, "No need to apologise" repeats.
Scores: P07 1/4, P08 3/1, P09 4/3, P10 4/5, P11 1/3, P12 3/5.
Tells: (1) endless sign-off/echo loops; (2) relentless politeness, no tangents/disagreement/typos, evenly paced complete sentences; (3) paste/list mechanics: messages split mid-sentence, emails pasted line by line with "---", bold bullet lists, restating others at length ("Sam's added two good points: ...").

## j3 (odd pairs)
- P01: Y, clear. X 100-message emoji loop ("See you tomorrow, Jo! 🎮"), Jackbox room never made. Y specific ("the boiler's still not fixed", "cereal for dinner"), over-supportive/therapy-like.
- P03: Y, clear. Y texture ("Which conclusion?", "the good biscuits"). X generic ("decision paralysis all round!"), thank-you ping-pong.
- P05: Y, clear. X all four repeating "I'm not sure of my exact town", "I can't check my location from here". Y shorter, ends in "Night!" chains.
- P07: Y (X empty).
- P09: Y, slight. Y concrete (bathroom ceiling, contractor deposits) but Tom posts a bullet list and an email template and says "I can ask Claude". X vague, half goodnights.
- P11: Y (X empty).
Scores: P01 2/5, P03 3/6, P05 2/5, P07 1/4, P09 3/5, P11 1/5.
Tells: (1) mirrored sign-off loops; (2) relentlessly agreeable ("Sounds good, Maya!", "You've got this"), names on every message; (3) long polished paragraphs and assistant formatting (bold bullets), "I can ask Claude" offers, restating; implausible timing (replies hours apart, messages overnight).

## j4 (even pairs)
- P02: Y, slight. X ~25-line "See you at 7, Tom!" loop; Maya and Tom both "7pm works for me". Y same loop but Jo's "Sorry, Tom, I should have been straight with you" and Sam's late "I went quiet".
- P04: X, clear. X texture ("running on coffee", "chaotic kitchen", flat viewings), short ending. Y uniform 🎳 sign-offs, Sam "The group chat has wrapped up, so I'll stop here", Jo "Thanks for the Claude tips!" then asks where everyone lives.
- P06: X, slight. X lopsided-mug banter, "🤞". Y stiff scheduling loop.
- P08: X (Y empty). X "holding is different from hiding", "Biscuit's packed".
- P10: X, slight. X over-repeated towel joke, matching emoji, "Night all 🛁". Y no-show "should we check on him" worry loop, Jo's "I'm almost there" scripted.
- P12: Y, slight. Y bike gag, "Paddington 2", Jo asleep on the couch; Tom's pizza story. X stiff "Night!" chain, "Hope the plumber shows up" repeated, Sam "I'll confirm tonight".
Scores: P02 3/4, P04 6/3, P06 5/4, P08 5/1, P10 5/4, P12 4/5.
Tells: (1) endless "See you X!"/"Night!" echo loops; (2) everyone replies to everyone in full warm grammatical sentences with names, no fragments/typos/lowercase/ignored messages; (3) formulaic: sudden confessions from the flaker, perfect agreement, emoji mirrored across people, chat-wrap-up meta lines.

Scorecard: batch5-score.txt (same folder).

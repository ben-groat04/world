# Batch 8 judgements (25 neutral Sonnet judges, single transcripts, absolute 0-10)

Design: 18 shared worlds (6 scenarios x 3 seeds, same generated settings/private lines in both arms) x EFFORT low vs default. Haiku characters, ORACLE on, REACT on, private lines on. Windows: A = first 25 messages, B = 25 messages from last day with >=8. Anonymised; file id -> run/window in eval/key.tsv. Judge prompt: 'Each file is a chat transcript... score 0 (obviously not real people) to 10 (indistinguishable from real people texting), and say what gives it away.' Nothing else.

## Tally (mean judge score per arm/scenario/window)
group	arm	n	mean
overall	DEF	96	3.64
overall	LOW	99	3.49
scenario T1	DEF	18	3.56
scenario T1	LOW	18	3.61
scenario T2	DEF	18	3.89
scenario T2	LOW	18	3.22
scenario T3	DEF	18	3.78
scenario T3	LOW	18	3.17
scenario T4	DEF	18	3.33
scenario T4	LOW	15	3.27
scenario T5	DEF	18	4.00
scenario T5	LOW	18	3.67
scenario T6	DEF	6	2.50
scenario T6	LOW	12	4.25
window A	DEF	48	3.94
window A	LOW	54	3.72
window B	DEF	48	3.33
window B	LOW	45	3.22

## Scorecard (score.mjs, per run, then MEAN)
### LOW
run                       messages  people   wMed   wP90  qEnd  echo   bye   top   dbl  hand      r      n  passNew  passNone  dupe  crossed  delayMed  delay1  frame  draftChg  draftDrop  reacts  started  named  md  frag  byeRun  confess  promises  recheckMeta  namePrefix  selfReact  failed  lineMentions  oracle   end
2026-11-22T20-54-18-419Z        20       4     32     44  0.05     0  0.30  0.30     0     0   0.20     17     0.27         1     0     0.05        16    0.09      0         -          -    0.19        1   0.90   0     0       2        0        10            0           0          0       -          1.25       0  date
2026-11-22T20-54-21-030Z        32       4     22     51  0.13     0  0.25  0.38     0  0.13  -0.01     26     0.27      0.97     0     0.13         4    0.37      0      0.67          0       -        1   0.97   0     0       3        0        11            0           0          -       -             1       0  date
2026-11-22T20-54-23-643Z        23       4     23     43     0     0  0.43  0.35  0.14     0  -0.05     20     0.31         1     0     0.04         2    0.48      0      0.50          0    0.28        1   0.70   0     0       3        0         9            0           0          0       -          0.25       0  date
2026-11-22T20-54-26-239Z        35       4     16     40  0.03  0.03  0.40  0.46     0  0.03  -0.11     33     0.46         1     0     0.03         4    0.30      0         -          -    0.05        1   0.97   0     0       2        0         2            0           0          0       -             1       0  date
2026-11-22T20-54-28-853Z        77       4     35     63     0  0.01  0.16  0.34  0.03     0   0.30     66     0.32         1     0     0.05         9    0.26      0      0.60          0    0.01        1   0.92   0     0       2        0        25            0           0          0       -          5.25       0  date
2026-11-22T20-54-31-518Z         9       4     36     54     0     0     0  0.33     0     0   0.19      8     0.33         1     0     0.22         9    0.17      0         0          0       -        1   0.89   0     0       0        0         1            0           0          -       -          1.25       0  date
2026-11-22T20-54-34-124Z        45       3     27     51     0     0  0.38  0.44     0     0   0.23     40     0.22      0.94     0     0.11         9    0.35      2      0.50          0       -        1   0.93   0     0       4        2        14            0           0          -       -          1.67       0  date
2026-11-22T20-54-36-808Z        27       3     34     55  0.07     0  0.15  0.52  0.12  0.04  -0.24     22     0.24      0.96     0     0.07         7    0.28      0         1          0       -        1   0.70   0     0       1        0        18            0           0          -       -          0.33       0  date
2026-11-22T20-54-39-398Z        57       3     22     50  0.07     0  0.37  0.37  0.02  0.07   0.29     51     0.14         1     0     0.11         8    0.26      0      0.25          0    0.03        1   0.82   0     0       3        0        23            0           0          0       -             0       0  date
2026-11-22T20-54-42-145Z        29       2     20     45  0.14     0  0.41  0.52  0.25     0  -0.25     26     0.05         1     0     0.14         8    0.15      0         -          -       -        1   0.48   0     0      10        0         1            0           0          -       -             0       0  date
2026-11-22T20-54-44-803Z        13       2     27     57  0.31     0  0.31  0.54  0.08     0  -0.20      9     0.09         1     0     0.15        28    0.27      0         -          -       -        1   0.54   0     0       4        0         1            0           0          -       -          0.50       0  date
2026-11-22T20-54-47-450Z        24       2     25     53  0.25     0  0.08  0.63  0.35     0   0.05     22     0.06         1     0        0         2    0.27      0         -          -    0.06        1   0.46   0     0       1        0         1            0           0          0       -             2       0  date
2026-11-22T20-54-50-111Z        14       6     17     31     0     0  0.29  0.36  0.31     0  -0.22     13     0.56         1     0     0.57         6    0.14      0      0.75          0    0.28        1   0.79   0     0       1        0         1            0           0          0       -          0.50       0  date
2026-11-22T20-54-52-773Z        16       6     27     38  0.13     0  0.25  0.31     0  0.13   0.46     15     0.52         1     0     0.06         5    0.29      0         1          0       -        1   0.63   0     0       2        0         3            0           0          -       -             0       0  date
2026-11-22T20-54-55-478Z        16       6     21     47     0     0  0.50  0.31     0     0  -0.02     15     0.40         1     0     0.13        11    0.20      0         1          0    0.04        1   0.81   0     0       7        0         1            0           0          0       -             1       0  date
2026-11-22T20-54-58-076Z        15       2     14     54  0.07     0  0.53  0.53  0.07     0   0.15     12     0.57      0.97     0        0         8    0.20      0         -          -       -        1      1   0     0       6        0         2            0           0          -       -             1       0  date
2026-11-22T20-55-00-754Z        10       2     28     43     0     0  0.30  0.60  0.22     0   0.25      7     0.68      0.95     0     0.10         2    0.33      0         -          -       -        1      1   0     0       1        0         6            0           0          -       -             2       0  date
2026-11-22T20-55-03-275Z        13       3     37     60     0     0  0.08  0.38     0     0  -0.43     11     0.48      0.97     0     0.08         4    0.38      0         0          0       -        1      1   0     0       1        0         4            0           0          -       -             3       0  date
MEAN                         26.39    3.56  25.72  48.83  0.07  0.00  0.29  0.43  0.09  0.02   0.03  22.94     0.33      0.99     0     0.11      7.89    0.27   0.11      0.57          0    0.12        1   0.81   0     0    2.94     0.11      7.39            0           0          0       -          1.22       0     -
### DEF
run                       messages  people   wMed   wP90  qEnd  echo   bye   top   dbl  hand      r      n  passNew  passNone  dupe  crossed  delayMed  delay1  frame  draftChg  draftDrop  reacts  started  named    md  frag  byeRun  confess  promises  recheckMeta  namePrefix  selfReact  failed  lineMentions  oracle   end
2026-11-22T20-54-19-731Z        31       4     36     58  0.16     0  0.23  0.35     0  0.16   0.14     27     0.21         1     0     0.03         6    0.45      0         0          0       -        1   0.97     0     0       5        0        10            0           1          -       -             0       0  date
2026-11-22T20-54-22-327Z        13       4     24     51     0     0  0.38  0.38     0     0   0.08     12     0.29         1     0     0.08         2    0.31      0         1          0       -        1   0.77     0     0       4        0         1            0           0          -       -          0.75       0  date
2026-11-22T20-54-24-955Z        38       4     29     51  0.03     0  0.26  0.37  0.03     0   0.38     35     0.16         1     0     0.08         8    0.30      0      0.33       0.33       -        1   0.89     0     0       3        0        13            0           0          -       -             0       0  date
2026-11-22T20-54-27-562Z        57       3     31     49  0.04  0.04  0.21  0.46  0.05     0   0.09     49     0.38      0.86     0     0.07         6    0.33      0         1          0    0.01        1   0.79  0.02  0.02       3        1        21            0           0          0       -          3.67       0  date
2026-11-22T20-54-30-226Z         8       4     46     79  0.25     0     0  0.38     0  0.13   0.64      6     0.30         1     0     0.25         9    0.10      0         1          0       -        1   0.88     0     0       0        0         1            0           0          -       -          0.50       0  date
2026-11-22T20-54-32-768Z         8       3     17     45  0.13     0  0.38  0.63  0.14     0  -0.51      7     0.33         1     0     0.13        47    0.11      0         1          0    0.11        1   0.75     0     0       1        0         1            0           0          0       -          0.33       0  date
2026-11-22T20-54-35-482Z        20       3     33     56  0.05     0  0.15  0.50  0.05     0   0.15     18     0.25         1     0     0.05        14    0.21      0         -          -       -        1   0.90     0     0       1        0        10            0           0          -       -          0.67       0  date
2026-11-22T20-54-38-034Z        16       3     33     70  0.06     0  0.38  0.50     0  0.06  -0.15     14     0.32         1     0        0        12    0.20      0         -          -    0.09        1   0.88     0     0       4        0         1            0           0          0       -          0.33       0  date
2026-11-22T20-54-40-831Z        27       3     29     76  0.04     0  0.30  0.48  0.12     0   0.05     23     0.27      0.96     0     0.04         4    0.29      0         -          -    0.03        1   0.81     0     0       2        0        15            0           0          0       -          0.67       0  date
2026-11-22T20-54-43-498Z        29       2     17     60  0.17  0.03  0.17  0.62  0.25     0   0.11     27     0.05         1     0     0.07         2    0.38      0         1          0       -        1   0.41     0     0       4        0         4            0           0          -       -             4       0  date
2026-11-22T20-54-46-111Z        32       2     17     51  0.16     0  0.50  0.53  0.19     0  -0.31     29     0.04         1     0     0.06         9    0.17      0         -          -    0.08        1   0.56     0     0       6        0         0            0           0          0       -          0.50       0  date
2026-11-22T20-54-48-672Z        14       2     16     48  0.14     0  0.36  0.57  0.15     0   0.09     12     0.17      0.95     0     0.07         5    0.25      0         1          0       -        1   0.57     0     0       4        0         0            0           0          -       -          1.50       0  date
2026-11-22T20-54-51-306Z        21       6     28     52     0     0  0.19  0.33     0     0  -0.20     19     0.50         1     0     0.19        17    0.23      0      0.25          0    0.03        1   0.95     0     0       1        0         1            0           0          0       -          0.67       0  date
2026-11-22T20-54-54-039Z        20       6     29     45  0.05     0  0.10  0.35     0     0  -0.13     17     0.49         1     0     0.40         6    0.21      0      0.67          0    0.11        1   0.85     0     0       1        0         1            0           0          0       -          1.17       0  date
2026-11-22T20-54-56-718Z        53       5     31     53  0.08     0  0.13  0.28  0.21  0.04   0.19     49     0.42         1     0     0.17         9    0.26      0      0.80          0    0.06        1   0.91  0.04     0       2        0         9            0           0          0       -          1.40       1  date
2026-11-22T20-54-59-464Z         0       0      -      -     -     -     -     -     -     -      -      0        -         1     -        -         -       -      0         -          -       -        0      -     -     -       -        -         -            -           -          -       -             -       0  date
2026-11-22T20-55-02-099Z         3       2     28     53     0     0  0.33  0.67     0     0      -      1     0.75         1     0        0         2    0.38      0         -          -    0.13        1      1     0     0       1        0         1            0           0          0       -             1       0  date
2026-11-22T20-55-04-418Z        79       4     35     53     0     0  0.25  0.39  0.03     0   0.12     72     0.38      0.82     0     0.06        10    0.32      0         1          0       -        1   0.95     0     0       3        3        24            0           0          -       -          6.75       0  date
MEAN                         26.06    3.33  28.18  55.88  0.08  0.00  0.25  0.46  0.07  0.02   0.04  23.17     0.31      0.98     0     0.10      9.88    0.26      0      0.75       0.03    0.07     0.94   0.81  0.00  0.00    2.65     0.24      6.65            0        0.06          0       -          1.41    0.06     -


## j8
All eight transcripts read in full. Most are clearly AI-written, and the few good ones are held back by the same tells.

Tells that recur:
- Everyone echoes and thanks each other in near-identical phrasing ("Thanks, X. I'll ... as soon as ..."). Real people don't confirm every message.
- Every reply is polished, on-topic and well punctuated, with no typos, tangents or fragments.
- Time-shifted groups where everyone reacts to everything within minutes.
- Commitments restated over and over.
- Odd timing and structure: several people answering one message in lockstep, or the same person sending two messages a minute apart.
- Broken promises that are narrated and apologised for in a formal, repeated way. Real people just go quiet or say "ugh, sorry".

Scores by file:
- 05266c: Quite plausible work chat, with a radiator detail, a file attachment and a missed call. It is let down by the constant "see you at lunch" loops, by Maya and Tom each repeating the same promise three or more times, and by "Brilliant, thanks" repeated. Score 4.
- 115852: Pub-planning chat with lots of "good luck with X" and "see you Friday" echoes. Jo and Maya exchange near-identical sign-offs. Score 3.
- 49ca8c: Fairly natural banter, with emoji, "x" sign-offs and sofa jokes. It reads real in places but is over-agreeable, and Dan's "Sunday's logistics are settled... I'll keep quiet" is robotic. Score 4.
- 4a02b1: Several people send identical "good luck, hope the toast lasts" replies, and they double-post in lockstep. Everyone states their week in the same way. Score 2.
- 651c8c: Repeated formal confessions ("I owe you a straight answer"), with missed deadlines re-promised in the same wording. This is clearly a scripted failure pattern. Score 1.
- a513a1: Warm, with farm details (heifer, Dad's hip) and some natural vagueness, but Maya's relentless recapping of who has confirmed is an AI scheduling-agent habit. Score 4.
- d55b4a: Heavy "I've missed every time I've given you, so I won't give you another one" self-flagellation, and "I'd rather hear 'not yet' than another promise". Score 1.
- e81140: The most human of the set, with specific local colour (Duluth, Cloquet, Lakewalk, sleet), "sad green" humour and a flirty subtext. The weak points are the near-identical sign-off loops, Tom's consecutive split messages, and a timestamp slip ("Night, Tom" at 07:06 on Monday). Score 6.

SCORES
05266c	4
115852	3
49ca8c	4
4a02b1	2
651c8c	1
a513a1	4
d55b4a	1
e81140	6

## j6
I read all eight files in full. All of them read as LLM-generated. The scores below are 1 to 4.

Tells that recur across the files:
- Everyone answers every message, and promptly. Real people leave things hanging.
- Nearly every message restates the plan or the last message.
- People thank each other for ordinary things ("Thanks for being straight with me, Tom" appears twice).
- Goodbyes run on for several turns.
- Each turn is a neat paragraph. There are no typos, fragments, or off-topic remarks.
- Everything stays on the one topic, with no tangents.

Per file:
- 051788: Scored 2. Nine near-identical confirmations of "Saturday at 8:30" (including Tom's final "Sounds good, Maya. See you Saturday at 8:30." after Maya had already said it). Tom's turns are over-polite, and he repeats the plan twice. Maya and Tom both post at 22:46, and Tom's "I'll double-check the schedule tonight" is stated and never followed up.
- 4a02b1: Scored 3. In the group chat, Tom, Priya and Jo each give Maya a near-identical good-luck message within three minutes. Their replies to Sam's tracklist problem are also near-identical ("nightmare" appears in two). The photo placeholder is a plausible touch. Some details feel natural, but the chorus effect gives it away.
- 768483: Scored 2. Tom and Maya say "Night" three times each, ending on Tom's third "Night, Maya." Emojis are applied at the end of Maya's messages in a uniform way. The deadline slip is a textbook sequence, and the "Thanks for being straight with me" line repeats.
- 7987ec: Scored 3. The repeated "Wednesday" confirmation chain has the same shape as 768483. Sam's offer to help sorting invoices and the repair-shop wrinkle add some texture. Tom's "I need to be straight with you" and Maya's "Thanks for being straight with me" are formulaic.
- a513a1: Scored 3. It has the most personality: the heifer, Dad's hip, the baby, "dodgy tea" and biscuits. The scheduling is still looped and over-confirmed. Maya summarises the group status repeatedly ("that's all four of us"), and nobody ever finalises it with a short "ok".
- c55c0b: Scored 4. This one is shortest and has the most believable shape. Tom proposes a coffee, others decline or offer alternatives, and two of them pair off. There is little repetition. The give-aways are the perfectly tidy resolution, no typos, and the over-specified logistics (a specific café, a specific time).
- dbc7a2: Scored 3. The planning is smooth and the split of tasks is tidy. The sign-offs are repetitive: Jo "Night, Maya. Sleep well" and Maya "Speak later" followed by Jo's "Speak later, Maya." Maya's replies are too long for someone running on four hours' sleep.
- dd1d9c: Scored 2. Tom is unnaturally supportive and says "get some rest" three times. Maya apologises repeatedly. Both rely on formulaic phrases ("no need to apologize"). The conversation sits in a perfect emotional tone and settles into mirrored goodbyes.

SCORES
051788	2
4a02b1	3
768483	2
7987ec	3
a513a1	3
c55c0b	4
dbc7a2	3
dd1d9c	2

## j5
Overall: all eight are LLM-flavoured. Typical tells are:
- Messages echo and restate each other's plans.
- Everyone repeats their promise ("I'll confirm once...") again and again.
- Goodbyes loop with no natural end.
- Persona facts (night shifts, the pew job, the calf) are recycled in every message.
- Replies come too quickly and too neatly.
- Tidy "Brilliant, thanks X" openers appear everywhere.

Per file:

582d43 (7): The shortest one, and it ends naturally. The deadline, the folder link and the emoji reaction all feel real. Slight tells are the tidy "Thanks X, that's great" replies and Sam answering "Thanks Tom, that's sorted".

b2e672 (5): This has the most natural start, with banter, a tandem and a pub. But Dan and Priya repeat "Maya, shout if you need it later" three times. Several people confirm with the same phrasing. It also cuts off without an ending.

85636c (4): The calf and dad's-hip detail are plausible, but Tom says "I'll confirm once the calf's settled" four times, nearly verbatim. Jo's replies are formulaic. The reaction emoji are plausible.

c3b35d (4): The radio idea and the "arguing at Christmas" joke are decent. It then degrades into a long loop of "Speak Sunday" and "Sleep well". Jo and Maya reply in lockstep.

dbc7a2 (4): The content is plausible, but Jo is over-helpful and repeats the plan constantly. The "Speak later" and "Sleep well" loops and repeated pings about the work names read as machine-generated.

f53686 (3): Jo's message includes the line "Jo's list for the week: order Mum's cake..." in her own voice, which is a leaked-notes glitch. Jo also lists the December weekends like an assistant. Maya says "Saturday lunch on the 5th", but Jo's list gives the 5th–6th as a weekend. Replies are very formal and agreeable.

7a0519 (3): Tom ends every message with the 🪚 emoji, which is a mechanical tic. He repeats "I'll ring at lunch and report back" four times. Jo repeats "Looking forward to hearing how the calls go" three times. Jo and Maya trade near-identical goodbyes.

191e0c (2): Everyone confirms Sunday evening in near-identical wording. Maya says "I'll check the bakery hours and bridge benches" about seven times. The "I'll bring the baby if he's up for it" and "dodgy tea" jokes recur in nearly every message. Tom and Jo send duplicate "Cheers, see you Sunday" messages. Several messages share the same minute with the same content, as though the personas were not aware of each other.

SCORES
191e0c	2
582d43	7
7a0519	3
85636c	4
b2e672	5
c3b35d	4
dbc7a2	4
f53686	3

## j12
All eight transcripts read in full. None is convincing. Most read as LLM agents, and the highest score only reaches a middling 4.

2467c5: Score 2. It is a goodbye loop with no content. "Night" is said at 07:56 and 08:39, and the "Ha, my night was backwards" correction is slow and staged. It then repeats "See you Thursday" about six times.

3e99b0: Score 4. The setting is believable (pub, donkey costume, rota swap), and Maya stepping in to ring the pub is natural. Against that, Sam says "I still haven't rung" twice with near-identical wording, and Tom's late reply is stiff. Everyone is uniformly polite, with no banter or typos.

4c2b3c: Score 2. It is a long farewell loop ("Talk later", "Later, Maya"). Texts are mirrored and doubled, and the sage paint detail is dropped in awkwardly. Real people would not exchange this many empty confirmations.

7b5a03: Score 3. Tom says "I'll confirm once the calf's settled" four times, and Jo repeats "if you can make it" over and over. Maya also repeats her booking line, and Tom's story drifts (the calf "arrives", then "is already here"). The thumbs-up reactions are the only human touch. The messages are too tidy and too long for texting, and the repetition is a loop.

d39d8c: Score 3. The three-person work chat is full of status echoes ("still on Cover 2's lettering, two folders unchecked") and ritual apologies. Sam re-lists the open items, which reads like a tracker. Its structure is cleaner than a real chat would be.

dd1d9c: Score 5. This is the most natural of the set. A tired Maya who goes quiet and bails gently feels human, and the plans are plausible. The weak points are Tom's overly therapeutic tone ("Don't apologize for being tired, you've been running on empty") and the polished phrasing.

dde943: Score 3. The messages are long and balanced. Tom and Maya double-text in matched pairs, and Tom gives an exact chair count ("six chairs... structurally fine"). There is too much "Sleep well, see you Saturday, good luck with the chairs" repetition. Tom gets a paragraph per reply, and the farewells run on far too long.

e3f700: Score 3. Many people post near-identical status messages ("still a maybe, confirm tonight"), and each reply restates the plan. Nobody's wording or voice differs much from anyone else's. The timestamps are odd too (Maya says "off to bed" and then replies at 07:06). The exchanges are polite but contentless.

SCORES
2467c5	2
3e99b0	4
4c2b3c	2
7b5a03	3
d39d8c	3
dd1d9c	5
dde943	3
e3f700	3

## j3
All eight transcripts read in full. None passes as real people. They read as LLM personas coordinating a plan with the same work-shift or deadline excuses.

Shared tells:
- Every message is a tidy, complete, grammatical paragraph that restates the plan.
- Characters keep promising to "confirm later" and then never get to it.
- Replies come in quick bursts, and participants say "Sounds good" to each other repeatedly.
- Nobody has typos, tangents, slang drift or emoji, and nobody changes the subject.
- Each persona has a stock backstory used as an excuse: Maya works nights, Tom does a trade or farm job, Jo is a teacher.

Per file:
- 051788: Maya and Tom confirm "8:30 at the put-in" five or six times, with a final "Sounds good... See you Saturday at 8:30" echoed word for word. Tom's "I'll message you once I've confirmed it" is a pointless loop. Score 2.
- 16e8b2: This is a clean task split in which each person restates the others' assignments. Reads like a project-management script. Score 2.
- 17e1dc: Jo and Maya trade near-identical pleasantries ("Speak later"). Messages are over-polite and the exchange is hollow. Score 3.
- 191e0c: Four people confirm Sunday at 6pm in a long loop of "brilliant" and "sounds good", with a few real British touches (dodgy tea, heifer, biscuits). The repetition is far too heavy. Score 3.
- 44c65d: Everyone is instantly agreeable and cheerful, with a pub at 7. Maya's non-answers drag out, but the group chatter is a bit more natural. Score 4.
- 582d43: It is short, with a link drop and a Jo emoji reaction. Sam's reply to Tom is slightly odd and the messages are tidy, but it is the most chat-like. Score 5.
- ccc243: Tom sends a split double message ("Sunporch paint sounds like a big project. Did you finish it or is it a two-day job?"). He also says "Night" at 8:39 am and is corrected. The corrected-slip moment is a real-feeling touch, but the "gray Carhartt" and "bleary energy" lines are over-written. Score 5.
- f3afac: It has the most natural texture: UK family detail (Mum's 60th, the Beaumont, Gilesgate Road, the Cheviots), a three-way split, and delays that drag on to Wednesday as real life does. It still has the repetitive "I'll check and post" promises and the polished prose. Score 6.

SCORES
051788	2
16e8b2	2
17e1dc	3
191e0c	3
44c65d	4
582d43	5
ccc243	5
f3afac	6

## j17
All eight transcripts read in full. None passes as real people, and most are clearly synthetic. The main tells:

- Echo loops: the same line is repeated back and forth with only the order shuffled.
- Mismatched timestamps: replies land seconds apart, or at 07:xx when the writer says they're asleep.
- Over-politeness: constant thanks, "good luck", and recaps of what was already agreed.
- Fixed plot beats: everyone has the same "busy week" excuse, and confirmations get deferred over and over.

051788 (3): Tom and Maya end on the same "Sounds good, See you Saturday at 8:30" line, and Tom sends it twice, the second time 54 minutes later. Maya's 22:46 message reads as an answer to Tom's 22:46 message, which sits oddly with a 22:44 "don't rush". Tom's 07:46 and 07:47 messages look like two separate generations. The long tidy messages are also a tell.

209379 (3): The Wednesday plan is settled in a few minutes, followed by repeated "Brilliant, see you Wednesday!" messages and a running gag about the sofa ends that every member repeats. Maya says she's on shift at 22:46 and "off shift" at 07:41. Dan's "Sunday's logistics are settled... I'll keep quiet" is an AI-style recap. The messages are uniformly polished.

24fc2d (4): The easiest to believe, with specific details (Mytholmroyd road job, forty seven-year-olds shouting "Mary!") and a natural plan. It still ends in a "Night, Jo" / "Night, Tom" loop, and Tom says he's on nights and asleep in the afternoons but replies without delay.

2cd483 (3): Everyone is relentlessly supportive. The "numbers, behave" and "hope it behaves" lines are echoed by three people. Replies are hours apart and then suddenly seconds apart. Maya says "Off to the studio" at 08:18, then says she's in the spreadsheet with cold tea. There is no real conversation.

7b5a03 (3): Tom says "I'll confirm once the calf settles" four times, and Jo repeats "see you Saturday if you can make it." The 👍 reactions on Maya's messages feel mechanical. The calf and the Angel detail are specific, but the deferral loop shows it's a generator.

b19da6 (2): Everyone repeats "maybe until I confirm tonight," and Jo says she can't confirm four times. Messages are too long and too polished for texts, and Sam's "Sam:" prefix is a script artifact. Replies at 06:39 and 06:41 contradict the claim that people are asleep or out. Maya says she's asleep, yet answers at 07:06 to 07:08 and again at 12:00.

bcef3a (3): The plan is "loosely, Saturday afternoon, confirm Friday night," and each person restates it 3 to 4 times. "Morning all" opens every message. Maya, on nights, replies at 06:31 and 07:57. Details like the dad's cups are charming but don't make up for the loops.

e81140 (4): The most natural-feeling transcript, with a warm tone, humour, and details like Cloquet, the Lakewalk, and "sad green". Tom sends three messages in a row, which is realistic. The trouble is the closing loops of "good luck" and "I'll text you on my break", the overly neat arc, and Maya's reply at 07:06 telling him to have a good shift, which doesn't fit the Sunday-night timing.

SCORES
051788	3
209379	3
24fc2d	4
2cd483	3
7b5a03	3
b19da6	2
bcef3a	3
e81140	4

## j18
All eight transcripts read in full. All read as LLM-generated to some degree. The strongest tells are looping sign-offs, restated plans and mismatched timestamps.

- 0e2c09 (3): Goodbye loop that runs from Sun 21:21 to Mon 08:01. Maya says "Speak Sunday" four or five times. Jo replies "Night, Maya" at 06:16 after Maya's shift has ended. Everyone restates the plan ("Sunday 6 works"). Very polished, and no one is ever terse.
- 17e1dc (3): Repeated "Speak later" and "anything you can get across by Saturday". Jo and Tom trade near-identical confirmations 2 minutes apart. The replies are polite and ordered. Maya says she's "on tonight" and is "tired" at 08:19 during the shift.
- 2467c5 (3): Pure ping-pong of "See you Thursday". Tom says "Night" at 08:39 in the morning. Maya corrects him, and he is then oddly self-aware about it. Constant restatement of "Gray Carhartt, Thursday at 8". No real content.
- 3d7f04 (5): Plausible planning, with a believable stall where Maya keeps putting off the rota and admits it. But the structure is too tidy. Each person assigns tasks in full sentences, the 12th/19th dates are explained, and the messages agree with each other in formal prose. Maya and Jo repeat the same promise in the same words.
- 51fbc0 (4): Multi-person group chat where each person gets a matching reply, such as Tom and Priya sending the same "Good luck tonight" message. The photo is described in a bracketed placeholder. Everyone gives a neat one-line update on their week. Too symmetrical and too nice.
- d24a95 (4): Gentle, warm banter, but there is a time mismatch. Maya says "night shift is still ahead of me" at 07:30, then goes off to "handover" at 08:41. Everyone mirrors each other, with "Looking forward to Wednesday" repeated. It is short and mostly believable otherwise.
- d55b4a (3): Rehearsed accountability script. Jo, Tom and Sam all apologise in matching phrasing ("no more times from me", "I'm not promising a time again"). Sam confesses to lying in a formal correction. Maya says "I'd rather hear 'not yet' than another promise". Reads like a model demonstrating honesty. Real people rarely all do this in lockstep.
- e3f700 (4): Dithering over a Sunday lunch, which is realistic. But there are many near-duplicate confirmations ("I'll post tonight either way"). The 12:00 message from Maya says "Morning all", and "Get some rest before your early shift" is odd. Extra "Thanks Maya, speak tonight" sign-offs.

SCORES
0e2c09	3
17e1dc	3
2467c5	3
3d7f04	5
51fbc0	4
d24a95	4
d55b4a	3
e3f700	4

## j1
All eight transcripts read in full. Most give themselves away through a few repeated tells.

- **Echo loops:** the chats end in endless sign-off ping-pong ("Saturday at nine" / "See you then" / "Talk later" / "Good luck, Maya!"). Real people stop. The models don't.
- **Mirrored replies:** everyone answers the same message with near-identical wording. In 51fbc0, Tom and Priya send the same "Good luck tonight, Maya. Hope it's quiet and the toast lasts" within two minutes.
- **No friction:** nobody teases, disagrees, changes topic or leaves a thread dangling.
- **Over-complete messages:** each one acknowledges, restates and promises. Examples are "Wednesday at the gym it is, then" and "Tom's on venue, Jo's on card".
- **Repeated emoji:** Tom ends almost every message in 7a0519 with 🪚.
- **Stalling:** in 7a0519 and a685e9 the same promise ("I'll ring tonight", "I'll confirm by this evening") is repeated all day with nothing happening.

Per file:

- **51fbc0 (3):** The mirrored good-luck replies are obvious. Everyone also states their week in full, which reads as a scripted round of introductions. The toast photo and the Jo reaction are the realistic touches.
- **5c060b (1):** A loop of "Good luck, Maya!" / "Thanks Sam! Numbers, behave!" for 25 minutes, with nothing new said.
- **757385 (4):** Specifics like the 14-slide napkin deck, "red pen" and the moon emoji are good. But the group agrees on Wednesday at the gym instantly, with everyone echoing the plan, and Sam's long cheerful opener is stiff. It is the best of the group chats.
- **7a0519 (3):** The family-planning premise is plausible, and the double-posted-message apology is a nice touch. After that it collapses into repetitive promises ("looking forward to hearing how the calls go") and the 🪚 tag on every message.
- **a685e9 (4):** Admitting they are behind and the guilt-tinged procrastination feel human. Maya repeats the same "I'll check the rota and confirm this evening" three times, which is a stalling loop, but that kind of stalling does happen in real life. Tom's "with the bid on the table" is natural.
- **abc86a (1):** "Saturday at nine" is said about eight times, and "See you then, Tom!" is answered with "See you then, Tom!". A pure loop.
- **b513db (6):** The best texture here: patchy cell service, a truck pulling left, a deer in a ditch, dumplings in the freezer, eggs eaten standing up. Duluth and Two Harbors are used well. The tells are Tom's polished storytelling ("steering like a crab") and Maya splitting her replies into three bubbles. It also ends in a "Talk later" loop.
- **ed9eeb (5):** Short and mostly natural. Jo's coffee logistics (Bedminster Parade, 21:30, the bus) are concrete and plausible. Everyone is still too agreeable and tidy, and the exchange stops abruptly with no friction.

SCORES
51fbc0	3
5c060b	1
757385	4
7a0519	3
a685e9	4
abc86a	1
b513db	6
ed9eeb	5

## j22
All eight transcripts read in full. They look like LLM-simulated friend chats rather than real texting. The scores below are low to middling because of the shared tells that follow.

Shared tells:
- Everyone is relentlessly polite and agreeable. Nobody teases, disagrees, goes off topic or swears.
- People restate the plan back and sign off the same way ("Friday it is", "see you Friday") many times over.
- Messages are long, fully punctuated and well formed, with no typos, fragments or slang beyond a token "knackered".
- Replies echo each other's details (the "good luck with the X" pattern), and several people repeat the same line almost word for word.
- The mundane details are over-specified and over-quoted: Tom's "always erode downwards" essays, Jo's "wheels allow", Sam's north elevation numbers.
- Timing is too tidy, with replies a minute or two apart in clean clusters.
- Some threads are cut off or have timing gaps that are not natural.

Per file:
- 03e8e6: Very repetitive. Maya, Jo, Sam and Tom each restate "Friday it is" and "see you Friday" again and again, and the "good luck" loop never ends. Score 3.
- 25ea36: Some real texture (the damp flat, the landlord notice template, a surveyor lookup with a phone number). But the emoji use is mechanical, and Jo and Tom have long polite loops that go nowhere. Dan's three messages sent at the same minute (13:13) look generated, and the file ends mid-reply. Score 4.
- 3804e1: Heavy "Morning X" echo, with each person confirming "Friday night" over and over. The hospital and hip details are touching but the dialogue is formulaic. Score 3.
- 651c8c: A confession loop. Jo and Tom repeatedly apologise for not having done things, in near-identical wording. It reads like a test scenario, not a conversation. Score 3.
- b2e672: Natural pub-planning chat, and the Maya shift-pattern hesitation is believable. It still has stiff "Brilliant, that's loads of us" repetition from Dan and Priya. Score 5.
- d87e81: Fairly natural, with specific colour ("Mary!" shouting, mud, the Shoulder of Mutton). It ends in a "Night, Jo." / "Night, Tom." loop. Score 5.
- e09b50: A plausible work exchange, with a missed deadline and an apology. It is slightly too polite and tidy, and "appreciate you being flexible" is stock phrasing. Score 6.
- ed9eeb: The most natural. Plans shift, Tom takes up Jo's offer, and the details (Bedminster Parade, Keynsham, the bus) are specific. Everyone is still very courteous. Score 6.

SCORES
03e8e6	3
25ea36	4
3804e1	3
651c8c	3
b2e672	5
d87e81	5
e09b50	6
ed9eeb	6

## j4
All seven files read in full. Every one shows machine tells, and none is close to real texting.

Common tells across the set:
- Replies are too polished and cooperative, and nobody ever disagrees or trails off.
- Everyone reads out the plan again ("Saturday at nine", "Wednesday works").
- Goodbyes loop: "Night Tom" is answered by "Night Maya", and the exchange then runs on.
- Messages are long and complete, with no typos, fragments or slang.
- Names are used constantly, and "Thanks X" opens most messages.
- Group chats have no cross-talk. Each person answers the previous message in turn.

Per file:
- 24fc2d: Planning chat. Looks plausible at first, but Jo's "knackered after a week in the mud" repeats a line already said, and the goodbye loop at the end (Night Jo, Night Tom, Night Jo) is a clear tell. Sam's "forty seven-year-olds shouting Mary" reads like a planted persona detail. Tom's "I'll sort it" is odd. 3.
- 29888d: Spreadsheet chase. Long and repetitive. Jo says "I haven't searched my laptop yet" four times and promises new check-in times each time. Sam and Tom both restate the plan again and again. Nobody gives a clear final answer, and Maya's "Thanks everyone" has the feel of a summary. 3.
- 768483: Invoice chat. Reasonably natural business tone, and the missed deadline is realistic. The emoji are somewhat plausible. The "Night" and "Talk in the morning" loop at the end, plus the "Enjoy the evening" and "see you tomorrow" lines, are machine-like. 4.
- 78488a: Short print-files chat. Shortest and most natural of the set, with an emoji reaction and a link placeholder. Small oddities: Sam's "that's sorted" appears out of nowhere, and the link is a placeholder. 6.
- 92767b: Pub plans. Very repetitive "fingers crossed" and "I'll confirm once...". Sam says "I'll ring the pub" five or six times without doing it, and Tom says "I'll be asleep" while replying within minutes. Personas are laid on thick (Mary, the Mytholmroyd mud, rota swaps). 3.
- abc86a: Two people say "Saturday at nine" eight or more times in a loop of mutual thanks. The pointless looping makes it obviously generated. 1.
- dd1d9c: One-to-one chat, and the emotional tone is fairly believable. Tom's supportive phrasing is generic ("Don't apologize for being tired"), and his messages are suspiciously smooth and symmetrical. Two messages in a row is realistic. The Tuesday bail-out is plausible. 5.

SCORES
24fc2d	3
29888d	3
768483	4
78488a	6
92767b	3
abc86a	1
dd1d9c	5

## j10
All eight transcripts read in full. Most look like LLM output, and the loops are the main giveaway.

03e8e6 (3): The group echoes each other's good-luck lines and repeats "Friday it is" and "see you Friday" with nothing new added. Each person acknowledges everyone else's situation in turn (Sam's submission, Priya's viewings, Tom's coursework). The "Jo, see you Friday if the wheels allow" call-backs are too tidy. Real people would drop the thread after the first or second round.

3804e1 (3): Everyone says "I'll confirm Friday night" several times and every message starts "Morning". It reads as a near-identical loop with a lot of mutual reassurance, and the plan never moves. The emoji reactions are the most natural part.

5c060b (2): A long loop of "Good luck Maya / thanks / numbers behave" repeated about ten times with no new content. Real friends would have stopped long before.

73841a (2): Maya says she'll check the loft and send the total in nearly every message, and Tom and Jo each say "I'll pay once the total's in" a dozen times. Everyone opens with "Morning both" even at 11:29. Real people would not keep restating the same status.

cf20e7 (4): Tom's opening and Maya's reply are fairly natural and specific. After that it settles into repeated "night, talk in the morning" exchanges. The emojis are slightly formulaic.

e09b50 (6): This is the most plausible one. It has a believable slipped deadline, specific details (Bradford duplicates, shed roof at the allotment) and a natural escalation. The politeness is a little smooth ("Appreciate you being flexible"), and the two-person structure reads somewhat scripted.

e81140 (4): The opening is good (primer, "sad green"). Tom then sends several messages in a row, which is realistic. Later turns drift into a loop of "good luck with the shift", "hope the sleet holds off" and "I'll text you on break". Personal details come in a conveniently complete set: Cloquet, Duluth, the Lakewalk. Both sides ask a balanced follow-up question every turn, which is an AI tell.

ed9eeb (5): It has plausible specifics (Bedminster Parade, Keynsham, letterpress). However, everyone's reply is a balanced paragraph that addresses each person by name, and the logistics resolve very smoothly. There are no typos and no fragments.

SCORES
03e8e6	3
3804e1	3
5c060b	2
73841a	2
cf20e7	4
e09b50	6
e81140	4
ed9eeb	5

## j25
All eight files are group chats of 4–6 people. Maya works nights in nearly all of them, and everyone gives a work excuse for being busy. That points to templated scenario generation.

Common tells:
- Everyone opens with a tidy status line that has the job, the deadline and a promise to confirm later.
- Messages are long, polite and grammatically clean, with almost no typos, slang or fragments.
- People thank each other and echo each other's plans in near-identical wording.
- The pacing is regular, with replies seconds apart.
- Reactions are sparse and bolted on.

Per file:
- 01013d (3): Everyone reads like an assistant: full paragraphs, "Happy to split it however works", and each person listing which tasks they can take. Jo's reply is just a restatement. The second Jo and Sam confirmations are redundant. There is no banter at all.
- 406c2e (5): Some warmth and texture (mill flat, "always erode downwards"). But Sam and Maya both give polished practical advice, and Sam suddenly "knows about damp". Sam promises a surveyor's number, which is plausible. The pacing and the tidy sign-offs are still too clean. Priya and Dan reactions are a good touch.
- 757385 (5): Good specifics (14-slide napkin deck, band tracklist) and some humour. But the long "Hiya Maya!" openers are repeated by everyone. Maya's "Morning Jo, night shift is still ahead of me, but I'm on the lookout for it" is a nonsensical reply to a moon emoji. Dan's message is repeated almost word for word by Maya.
- 8a29c3 (3): It loops. Every person says they will check or ring later and nothing gets resolved. There are repeated apologies, and Tom's apology is copied from Jo's. Reads like a stalled agent.
- bcef3a (3): Extreme repetition of "I'll confirm Friday night". Replies are stacked politely, with pointless reaffirmations. Realistic details (hip op, cups out of reach) are undercut by robotic closing messages.
- c55c0b (5): Short and natural, with believable logistics (Bedminster Parade, 21:30). The plan changes mid-chat, which is a good sign. Some of the replies are a bit too accommodating, and Maya's sign-off is generic.
- ccc243 (3): Maya and Tom talk to each other with formal courtesy. They send split messages, then keep repeating "see you Thursday". A tell is Tom saying "Night, Maya" at 08:39. Maya's correction is a cute recovery, but both of them repeat the same sign-offs. The stilted "gray Carhartt" repetition looks synthetic.
- dbc7a2 (4): The family-planning content is credible and the delegation is realistic. The long back-and-forth of "Speak later" and "Got it" at the end is filler. Jo's "I'll send headcount" repeats three times.

SCORES
01013d	3
406c2e	5
757385	5
8a29c3	3
bcef3a	3
c55c0b	5
ccc243	3
dbc7a2	4

## j21
All eight transcripts read in full. Most are readable but share the same tells: everyone is endlessly agreeable, messages are long and well-formed, people echo each other's details back, and farewells loop.

115852: Everyone repeats "Friday works" and re-wishes each other good luck. Jo and Maya trade near-identical "see you Friday if the wheels allow" lines. Messages are polished and every person names others' problems. Real chats are messier. Score 3.

3e746f: The ending is a "Talk later!" loop, with Maya and Tom each saying it back and forth. The lines are cute but tidy. Score 3.

406c2e: Clear tells include the over-helpful advice (landlord in writing, dated photos, damp surveyor), the 21:07 Dan paragraph, and everyone naming each other's jobs ("river erosion", "wheel rebuilds"). Replies are too well organised, and the "always erode downwards" gag is neat. It has some real texture and plausible delayed replies, though. Score 4.

78488a: It is short and plausible, with a link placeholder and a late emoji reaction. It is slightly tidy ("Thanks Sam, that's great. Appreciate you both."), and Sam's reply to Tom is a bit off-beat. Score 6.

7987ec: The logistics are realistic (laptop at the repair shop, a labelled envelope), but the language is very formal for texting. "I need to be straight with you" and "Thanks for being straight with me" are stilted. Everyone is cooperative and complete in every reply. Score 4.

85636c: Tom repeats "I'll confirm once the calf's settled" four times, nearly word for word. Jo parrots it back each time. This is a model looping. Score 2.

a513a1: It is long and over-coordinated, with each person restating the plan. The "dodgy tea" and biscuits banter reads as generated, and the "Jo's the one we're waiting on" recaps are repetitive. The details, like the heifer and the dad's hip, are good. Score 4.

d87e81: It has good specifics (the Mytholmroyd road job, forty seven-year-olds shouting "Mary!"). It ends in a "Night, Jo / Night, Tom" loop, and everyone is too agreeable and polite. Score 5.

SCORES
115852	3
3e746f	3
406c2e	4
78488a	6
7987ec	4
85636c	2
a513a1	4
d87e81	5

## j19
All eight transcripts read in full. Most are clearly synthetic, mainly because of looping, repetition and inconsistency.

191e0c: 2. Everyone re-announces the same plan ("I'll sort the benches and check the bakery hours") many times. The same "Morning all" repeats across hours. Jo and Sam each confirm "I'm in" in near-identical wording. Tom sends a duplicate "Cheers Jo, see you Sunday." The confirmations are far too formal and cyclical.

4c2b3c: 3. It is short and has a natural farewell chain. Maya says "Night, Tom" at 07:06, and Tom's reply fits. The goodbyes ("Talk later" / "Later, Maya") run on too long. Tom's "Hope the sage holds up" is also a bit random.

73841a: 2. Tom and Jo say "I'll pay my share once the total's in" five or more times. Maya says "I'll ring Dad and check the loft" again and again. Nothing moves forward. The "Morning both" greeting repeats from 07:52 to 11:29. Real people would not loop like this.

78488a: 7. It is short and plausible. The timing fits and the emoji reaction is natural. Sam's "Thanks Tom, that's sorted" is a little odd, and the "[link: ...]" placeholder is a small tell. Otherwise it reads as real.

7987ec: 6. The plot develops: the laptop dies and the deadline slips. Sam's offer to help and the "need to be straight with you" moment are realistic. The tone is a bit tidy and polite, and the replies are fairly long.

7a0519: 3. Tom adds the 🪚 emoji to nearly every message, which looks scripted. Jo and Tom repeat "I'll report back this afternoon" and "looking forward to hearing" several times. Tom's response to Jo, "didn't see your message", does show some natural overlap. The Maya/Jo "Night" exchange comes at 15:20, which suits the shift-worker context.

b513db: 5. The content is natural: the truck pulling left, the deer, the crab steering. But the messages are very polished, with long "something good" descriptions, and Maya splits her messages into three. The ending is a robotic loop of "Talk later" / "Talk later!". Fairly convincing early on.

ccc243: 4. It has details, such as the gray Carhartt and the cardiac floor. The weakness is a double-message pattern and "Night" sent at 07:56 and 08:39, which the chat itself calls out as backwards. The repeated "See you Thursday" and the reconfirming of the plan feel scripted.

SCORES
191e0c	2
4c2b3c	3
73841a	2
78488a	7
7987ec	6
7a0519	3
b513db	5
ccc243	4

## j11
Overall: all seven read as LLM-simulated group chats. The tells are the same across files. Every message gets a reply. Everyone is unfailingly kind and echoes the previous message. The goodbye loops don't end. Timestamps look generated: replies arrive a minute apart, then an overnight gap.

0e2c09 - Plan is tidy and everyone agrees at once. Then a long farewell loop ("Speak Sunday" about 6 times, "Night" sent at 06:16 on Monday). Jo thanks Maya for "sorting the radio idea" when Maya only mentioned it. Maya also messages "Off to my shift" and keeps replying through the night. Low.

25ea36 - The most human-feeling content: damp, plaster, wheels, essays about erosion, a 😂 reaction. But the same sentence is repeated ("good luck with X") by every person. Dan sends three consecutive one-line messages at the same minute. Sam's @claude request gets a bot answer. Mid-low.

2cd483 - Pure mutual-encouragement loop ("numbers, behave", "good luck, Maya" repeated). Jo's "welcome back to Bristol" is plausible but nothing disagrees or drifts. Low.

3d7f04 - Best of the set. It has a real stall: people say they will do things and don't. Maya admits she has been putting it off, and Tom says he's not sure he'll get round to it. Some sentences are polished ("Thanks for being straight about it"). The plans are over-specified, and Maya repeats "confirm by this evening" three times. Mid.

768483 - Tom misses a deadline and Maya replies with an emoji-laden, almost HR-polite message. The "Night, Maya" / "Night, Tom" triple exchange at 18:30 to 18:56 is a loop. Everything is very tidy. Low-mid.

92767b - Colourful details (glaze, "Stand STILL, Mary", Mytholmroyd), and the missed phone call is realistic. But Sam's repeated "I'll ring the pub now" five times, with Tom answering each, is a loop. Tom says "I'm off shift" and then "I'll be asleep". Mid.

d24a95 - Short. It begins mid-thread ("Thanks for the 🌙"). Messages are formulaic, with "Morning X!" prefixes and "See you Wednesday" repeated. The details are fine ("napkin deck"). Low-mid.

SCORES
0e2c09	3
25ea36	4
2cd483	2
3d7f04	6
768483	3
92767b	5
d24a95	3

## j13
All eight transcripts read in full. None of them passes as real people texting. Typical tells are rigid turn-taking, every message acknowledged, repeated scripted phrases, and everyone being agreeable and polite.

- 0e2c09: Heavily scripted. "Speak Sunday" and "Sleep well" are repeated in loop-like goodbyes across about six messages. Jo and Maya ping-pong endless pleasantries and restate the plan each time. Tom appears once and is never addressed again. Real siblings would not keep thanking each other. Score 3.
- 406c2e: The best of the set. It has a messy group, emoji reactions, missed 9pm breaks, and tangents about damp and coursework. The weak points are everyone asking after everyone's work in turn, polished advice ("keep dated photos"), and Priya and Dan as reaction-only voices. Score 5.
- 51fbc0: Short and plausible. People reply in bursts, there is a toast photo, and the reactions fit. Tom and Priya send near-identical "hope it's quiet and the toast lasts" messages, which is an AI echo. Maya answering the photo request promptly is slightly too neat. Score 5.
- 85636c: Tom repeats "I'll confirm properly once the calf's settled" about four times in near-identical wording, and Jo keeps answering the same way. This is the loop pattern. It also has a dangling mention of "your dad's hip". Score 2.
- c55c0b: Short and coherent, and the logistics are natural. Still, everyone's busy-excuse is perfectly narrated ("cheese client", "letterpress", "Frenchay"), and the replies are very tidy and polite. Score 4.
- d39d8c: Reads like a status bot. Tom repeats "Cover 2 lettering, two folders unchecked" verbatim. Maya and Sam repeat "Friday items at top" and "unchecked". The apologies are formal, and a real group would swear or joke. Score 2.
- dde943: Overly sweet and hyper-polite. Tom gives a long explanation of the chairs, and the "see you Saturday at nine" farewells repeat. Maya sends three messages in a row. Both text in perfectly clear sentences, and the flirtation is generic. Score 3.
- f3afac: Fairly natural content ("phone's been in the van", Dad, the Beaumont, walking boots). It is marred by repeated promises to check dates and "I'll check the group tomorrow afternoon" loops. The apologies and deferrals are too tidy, and nobody ever commits to a date. Score 4.

SCORES
0e2c09	3
406c2e	5
51fbc0	5
85636c	2
c55c0b	4
d39d8c	2
dde943	3
f3afac	4

## j7
All eight transcripts read in full. Common tells: the cast is cooperative, with no friction or teasing. Everyone restates the previous message and the plan ("I'll post once X"). The close echo-replies and sign-offs ("See you at lunch", "Thanks both", "Will do") are too neat. Messages are long and grammatical, with few typos or fragments, and the timestamps are too regular.

05266c (4): Heavy loops of "see you at lunch" and "I'll let you know when the lettering's done". Tom posts a file as a bare "[file:]" line and then repeats himself. Everyone is relentlessly polite and over-confirms. A Sunday 22:12 "Sorry, I haven't pulled the list together" is a human touch, but the rest reads as agents restating commitments.

154e89 (4): Same pattern. Tom's repeated "photos before 9" and Sam's offer to help are formulaic. Each message summarises the plan, and the 17:41 "still on the cover" message is oddly dated.

3e99b0 (6): Short, with a believable pub, donkey-costume and honey-and-lemon texture. The apologies still repeat, and Maya's rescue is a little tidy. Best of the group.

49ca8c (3): Many people all agreeing instantly in a crowded Sunday burst. The "wobbly sofa end" bit is repeated and echoed four times. Emojis are used uniformly. Dan's "Sunday's logistics are settled... I'll keep quiet" is clearly an agent.

5cdf2f (5): Plausible two-person tone, but Tom is American-spelled and over-supportive ("Don't apologize", "Get some rest" twice). It is a wholesome mirror loop with no real texture.

8a29c3 (5): Believable excuses (the pours, the van) and stalling. Everyone says "sorry this has dragged on" in near-identical words.

e3f700 (4): Heavy repetition of "I'll confirm tonight", "Sunday afternoon works", and Maya promising to post once others confirm. Maya's 06:48 "off to bed" is a nice touch, but the rest is circular and over-polite.

f53686 (3): Over-organised and expository. Jo narrates the dates, and a stray "Jo's list for the week:" line leaks into her message. The "Mum won't suspect" planning is stilted. The long repeated "send me the total" and "ring Dad" loop is mechanical.

SCORES
05266c	4
154e89	4
3e99b0	6
49ca8c	3
5cdf2f	5
8a29c3	5
e3f700	4
f53686	3

## j23
All eight transcripts read in full. None passes as real people. The shared tells:
- Everyone replies within minutes, politely and in agreement.
- Messages are tidy, with full sentences.
- Each message restates the plan.
- Chats don't end naturally. They loop on repeated sign-offs.
- Jobs and backstories are announced to explain availability (Maya's night shifts, Tom's calving or pews).

Per file:

6ceb9f: Stuck in a loop of "I'll send whatever I've got tonight" and "ring from the car park". The Tom apology over a missed call is a plausible human beat. Jo and Maya echo each other. The "Good luck with marking" line is also a slip: Jo is addressed earlier, but Maya says it to Jo as if Jo had mentioned it. Messages arrive at 13:22, 13:24, 13:24, 13:25, and the same promise gets repeated.

757385: Everyone opens with "Hiya Maya!" and offers sympathy. Dan and Tom both volunteer to be "taken out on" at the climbing wall. Maya says "Morning both" to Jo and Sam. It has a few natural touches, like the napkin deck and the playlist, but the same offers are parroted.

7b5a03: Tom repeats "I'll confirm once the calf's settled" about four times. Maya's "Sleep well, Jo and Sam" makes no sense. The reactions feel mechanical, and Jo "brings tea for the drive".

abc86a: Pure echo loop of "Saturday at nine". It has no content, with about ten turns of confirming the same thing.

b19da6: Every participant restates their maybe or yes status repeatedly. Maya says "Morning all" at 12:00. Sam's message starts with a "Sam:" label. Very flat and procedural.

b2e672: Quick opening banter and a believable Hyde Park pub. Dan and Priya repeat each other ("shout if you need it later"). Maya's replies are slightly too formal. It ends before the plan is settled. Slightly more natural than most, but the pattern is still the same.

c3b35d: Reasonable planning, but the closing is a loop of "Speak Sunday" and "Night". Jo sends "Night, Maya" at 06:16, after Maya has already gone to bed. Tom barely talks.

f53686: Jo lists the December weekends like a calendar. Tom and Maya both promise to ring Dad. A stray line, "Jo's list for the week: order Mum's cake...", is written in the third person by Jo about herself. Tom keeps saying "I'll wait for the total". The reaction emojis are the only human touch.

SCORES
6ceb9f	3
757385	4
7b5a03	3
abc86a	1
b19da6	2
b2e672	4
c3b35d	3
f53686	2

## j20
All eight chats read in full. The common giveaways: every message is polite, complete and on-topic, and each person is individually sympathetic to everyone else. People restate the agreed plan again and again. Nobody ever drifts off topic, uses slang, or makes typos. Procrastination is announced neatly ("I owe you an apology") rather than just happening.

01013d (3): A textbook task split. Everyone agrees in tidy full paragraphs, and Maya's recap repeats each person's role. There is no banter and no mess, and it reads like a script.

25ea36 (5): The reactions, the 😂 and the in-jokes ("always erode downwards") feel real. Several details are plausible, such as the damp flat, the Leeds surveyor and the @claude request. Against that, everyone praises everyone else's plans ("Good luck with the rear wheels") and the replies are too uniformly kind. Dan sends three consecutive messages at the same timestamp, which is a machine tell.

3d7f04 (4): The procrastination arc feels human: Maya falls asleep and doesn't check her rota, and the group admits "we're all behind". But the language is too clean and self-aware ("Honest answer... which isn't fair to you two"). Jo repeats her plan five times, and the "Sounds good" echoes pile up.

3e746f (2): It ends in an endless "Talk later, Maya! / Talk later, Tom!" loop, with identical sign-offs traded back and forth. The "tell Superior I said hi" line is oddly stilted.

6ceb9f (3): Every message carries a trailing emoji (🪚, 👍, 😴), and each person uses the same one every time. The apologies are formulaic ("I owe you an apology"), and the group repeatedly thanks Tom for "being straight".

8a29c3 (3): Everyone apologises in the same cadence and promises "tonight" over and over. The messages are well structured but stiff, and nothing interrupts the flow.

92767b (6): This one has the most personality. "Stand STILL, Mary" at forty seven-year-olds, the muddy boot, the Bridge pub, and a few real regional touches. The Monday section degrades into Sam and Tom repeating "I'll ring the pub" and "I'll check back this afternoon", and there are echo replies.

bcef3a (3): It is a cycle of "confirm Friday night" repeated by all four people. The warmth is generic ("your dad comes first"), the reactions are neat, and the messages are overly polite.

SCORES
01013d	3
25ea36	5
3d7f04	4
3e746f	2
6ceb9f	3
8a29c3	3
92767b	6
bcef3a	3

## j9
All eight transcripts read in full. Most are clearly LLM-generated. The scores below rest on how formulaic each one sounds.

Common giveaways across the set:
- Everyone replies politely and promptly, and apologizes in full, grammatical sentences.
- Turns echo or restate the previous message and re-confirm plans ("Sounds good, X. You take Y, I'll do Z").
- Chats end with long chains of "Talk later!" and "Sounds good".
- Characters name each other constantly.
- Nobody uses typos, fragments, slang or lowercase.
- Group chats have no cross-talk, and each person answers in a neat rotation.

Per file:
- 01013d (work split): Every speaker offers a tidy availability paragraph with a specific excuse ("towpath runs", "kids' book cover"). Sam and Maya both restate the whole plan. It reads like a scripted scheduling exercise. Score 2.
- 29888d (spreadsheet hunt): It is very long and repetitive. Tom, Jo and Sam each repeat "I'll update you this afternoon" and "I haven't searched my laptop yet". The repetition looks like a model stuck in a loop. The slow-drip lateness is a nice touch, but the rest is stilted. Score 2.
- 3e99b0 (pub table): This is the most natural one. It has a casual "Hiya", a funny donkey-costume excuse, "Honey and lemon is on the go" and Maya taking over the call. It is slightly too polished and kind. Score 6.
- 5cdf2f (Maya and Tom, rain check): The tone is soft and emotional, but it is far too accommodating. There are doubled messages from Tom and a clean goodnight ritual. Score 3.
- b513db (Maya and Tom, eggs and dumplings): The detail is good (deer, crab steering, Duluth). However, the messages are too well composed and warm, and the chat ends in a "Talk later!" echo loop. Score 3.
- d24a95 (playlist and napkin deck): Tiny and generic. People answer each other out of order, which is a bit lifelike. There are still repeated "Morning!" greetings and mirrored "good luck" lines. Score 4.
- d39d8c (cover lettering, invoice list): The status updates are robotic. "Cover 2 lettering and the two folders unchecked" is repeated word for word. Apologies are formal and the agreement is perfect. Score 2.
- e09b50 (invoices, shed roof): It is short and plausible, with a believable slip and a specific excuse (the allotment shed roof). The language is still too polite and consistent. Score 5.

SCORES
01013d	2
29888d	2
3e99b0	6
5cdf2f	3
b513db	3
d24a95	4
d39d8c	2
e09b50	5

## j24
All seven transcripts read in full. They share the same tells. Everyone sends a polite reply to every message. Conversations end in long loops of "Good luck / see you Friday / speak Sunday". Each person explains their own job and weekly load in an organised way. Nobody mishears, drifts off topic or forgets anything. Replies are tidy and warm, with almost no typos, slang or fragments. Most are unnaturally uniform in length and register.

115852 (score 3): Everyone says "Friday works for me too" and then lists a work excuse (planning submission, Year 10 coursework, wheel rebuilds). The replies are mirror-image and the goodbye loop is long. Sam and Jo each repeat "see you Friday" several times.

16e8b2 (score 3): It reads like a project-management script. Tasks are assigned and then recapped by Maya and Jo, and each person's capacity is neatly explained. The replies are long, formal and without any banter.

209379 (score 4): It has emojis, "x" sign-offs, sofa jokes and a running gag, so it is the liveliest of the seven. But every reply is warm and every reference is repeated back (wobbly end, comfy end). Dan's Monday message, "Sunday's logistics are settled... I'll keep quiet", sounds like a bot, and Jo says she'll be "buried in marking" at 7pm on Wednesday. It is still the most human-sounding.

2cd483 (score 2): It is an endless loop of "Good luck, Maya! Hope it behaves", "Numbers, behave" and "Thanks Sam, that's kind". Almost nothing happens and nobody has an agenda. The same phrases are echoed back by different people.

44c65d (score 5): It has a believable plan with a pub, a time and a shift rota question. Some replies are natural, for example Tom's early exit and Maya not knowing her rota. But Priya and Dan repeat "Maya, shout if you need it later" several times, and everyone agrees at once.

a685e9 (score 5): It is the most natural. It has real tension: people admit they haven't done things, procrastinate and repeat themselves while stalling. Jo and Maya still sound a bit scripted ("Thanks Jo." / "Sounds good, Maya."), and the loop of near-identical promises is robotic.

c3b35d (score 4): The plan, the 60th birthday and the kitchen radio idea are believable. Jo's and Maya's replies are over-polished and over-confirmed, and Jo keeps repeating "Speak Sunday" and "Sleep well" in a loop. Maya's "Night" at 21:41 is followed by Jo's "Night, Maya" at 06:16, which is oddly delayed.

SCORES
115852	3
16e8b2	3
209379	4
2cd483	2
44c65d	5
a685e9	5
c3b35d	4

## j16
All seven transcripts read in full. Most are clearly LLM-generated. The few human-like touches don't offset the repetition, tidy agreement and echoed confirmations.

16e8b2: Everyone offers a neat, well-formed task split, and each person restates the plan. Replies are long and polite, with no typos or tangents. Maya's messages arrive at 19:19 and 19:21 with near-identical wording. It reads like a coordination exercise. Score 2.

17e1dc: Jo and Maya trade pleasantries that add nothing ("Speak later" / "Speak later, Maya"). There are duplicated confirmations, with Tom saying "Will do" twice. Jo repeats the same promise about the headcount three times. Some real detail, like the parents' evening and the night shift, but the loops are bot-like. Score 3.

209379: This is a big group chat with a lot of emoji and banter. It is warm and has realistic touches, such as the dodgy sofa and reactions. But every message echoes the previous one, and everyone restates the plan. Dan's Monday message, "Sunday's logistics are settled... I'll keep quiet," is an obvious AI summary. Maya replies to each person in turn. Score 3.

2467c5: This is a pure goodbye loop of "See you Thursday" repeated about six times. The "Night" mix-up is cute, but the exchange then re-confirms the same plan again and again. Timestamps are odd: Maya's 07:12 reply is followed by 07:35 and 07:56, then a "Night" at 08:39. Score 2.

24fc2d: Contains good regional and personal detail (Shoulder of Mutton, Mytholmroyd, "Mary!"). The Tom and Jo "Night" exchange loops, and Jo says goodnight at 19:38 yet speaks again at 19:43. Planning is tidy. Fairly plausible for the first half. Score 5.

d55b4a: The group repeatedly confesses missing deadlines, in the same cadence and phrasing ("I've let the whole group down", "I'm not promising a time again"). Sam's self-correction about not having rung the client is an unnatural, scripted honesty. Maya's reply is "I'd rather hear 'not yet' than another promise". Everyone speaks in complete, formal paragraphs. The file attachment is a nice touch. Score 3.

dde943: This is the most human-like. It has overlapping and split messages, such as Tom answering out of order and Maya sending three in a row. The details are concrete: chairs, rungs, ventilator alarm, nitrile gloves. The affection feels natural. Weaknesses: it ends in a goodbye loop, and the replies are long and mirrored. Score 6.

SCORES
16e8b2	2
17e1dc	3
209379	3
2467c5	2
24fc2d	5
d55b4a	3
dde943	6

## j15
All eight transcripts read in full. None passes as real people. Scores are low to middling because of shared tells.

Shared tells:
- Everyone answers every message, usually by echoing it back: "Thanks X, [restate their plan]. See you at 9."
- Replies are sentence-perfect, with no typos, fragments or slang drift.
- Each person plainly takes a turn in rotation, and each message reaches back to the previous speaker by name.
- Promises are restated again and again ("I'll confirm Friday night" said by four people, repeatedly).
- Nobody changes the subject, jokes off-topic, sends a photo or voice note, or goes quiet in a natural way.
- Characters announce their own backstory (dad's hip, nights, laptop) in tidy exposition.

Per file:
- 154e89: Heavy looping. Tom says "photos before 9" about five times, and Maya says "See you at 9" repeatedly. Mon 10:17 and 17:41 are out of sequence: Maya repeats Tom's "bring the sketchbook" line after the meeting was already starting, and Tom apologises at 17:41 for the meeting. Very robotic. Score 2.
- 29888d: Reads as a coherent scenario. Jo's repeated "haven't searched yet, will by one" fits a real procrastinator, and Sam's "older version, don't use it" correction is natural. Still too polite and echoing, and the 06:49 message contradicts the earlier chat (Sam says he sent the old copy to Maya, but never said so). Score 4.
- 3804e1: Starts mid-conversation. The same sentences ("Saturday afternoon loosely, confirm Friday night") are repeated by all four. The reactions are a nice touch. Cups on the side table is a good human detail. Still looping. Score 3.
- 6ceb9f: Tom's emoji tags (saw, 🪚 every message) are consistent, and his admission of failure is believable. Overall it is repetitive and over-polite, with a mechanical "Thanks Jo. Sounds good" at the end. Score 4.
- a685e9: Short. The "we're all behind" candour is plausible, but the dialogue is formulaic and mirrors itself. Maya's last message is just "Thanks Jo." Score 4.
- b19da6: Long and detailed (tiles, roastery, hip op). The scheduling loop is repetitive ("maybe until I've checked"), with the same status restated by every person each turn. At 12:00 Maya says "Morning all", which is odd. Score 3.
- d87e81: The most natural. It has banter (Mary! forty seven-year-olds, "knackered"), distinct voices and a scheduling tangle. It ends with a mechanical "Night, Jo." / "Night, Tom." / "Night, Jo." loop. Score 6.
- f3afac: Believable family planning, with specific places. Repeated lines about Dad and the rota, and the three Maya messages at 15:27-15:28 split oddly. Everyone reacts the same way, and the phone-in-the-van excuse is repeated. Score 4.

SCORES
154e89	2
29888d	4
3804e1	3
6ceb9f	4
a685e9	4
b19da6	3
d87e81	6
f3afac	4

## j14
Overall: most of these read as LLM-written. The common tells are endless polite confirmation loops, each message restating the previous one, and near-perfect turn-taking.

05266c (3): Everyone echoes and confirms the plan ("Brilliant, thanks"). Maya and Sam repeat each other's lines. Tom promises an update, then promises it again. The scene details (cold flat, radiator, shed) feel bolted on. The tone is uniformly cheerful, and the "Jo reacted" line is the only natural touch.

154e89 (4): Realistic setup with Weston, Bedminster, thumbnails and a sketchbook. Tom's repeated slippage is plausible. But "I'll send the photos before 9" is said four times, and Maya's replies are suspiciously tidy and supportive. Mildly human overall.

44c65d (3): The logistics are good (shift patterns, parents' evening, sister's birthday). But five people all answer within minutes, and the "Maya, shout if you need it later" line is repeated almost word for word by Dan and Priya. Lots of mirrored phrasing.

4c2b3c (2): This is a goodbye loop: "Talk later" / "Later, Maya" / "I'll text you on break" repeated about six times. Real people would stop after one exchange. The first line also says "Night" at 07:06, which is plausible for a night shift worker, but the rest is filler.

5c060b (2): Sam and Jo each say "Good luck, Maya" a dozen times, and Maya echoes each one ("Thanks Sam!"). The same "numbers behave" joke is repeated with no new content. It has the classic model look of cheering with no substance.

5cdf2f (4): Plausible human situation (doubles, exhaustion, a rain check, drifting off). Tom is a little too supportive and perfect ("Don't apologize for being tired"). It uses "apologize", which is an American spelling, while the other chats are British. Pacing is natural, with the Tuesday gap. Reasonably believable.

651c8c (2): The same "I haven't done it yet, I'm sorry, I'll do it by X" cycle runs three times for Jo and twice for Tom. Everyone formally owns up ("I owe you both a straight answer") and Maya replies with formal thanks. This is an accountability script, not casual texting.

cf20e7 (3): Emoji (🙏 👍 🌙) used consistently on Maya's side only. The farewells repeat across three rounds of "Night / Talk in the morning". The chat is very polite and structured, with no typos or fragments. The "Harrogate run" detail is the only real flavour.

SCORES
05266c	3
154e89	4
44c65d	3
4c2b3c	2
5c060b	2
5cdf2f	4
651c8c	2
cf20e7	3

## j2
I read all seven files in full. Most of them read as AI-generated, mainly because the characters loop, repeat their own lines and close conversations too tidily.

- 03e8e6 (score 3): Every character answers every message with the same wording. Jo, Sam and Maya repeat "see you Friday, good luck" in near-identical lines. People recap each other's circumstances ("Tom, hope the Year 10s behave"). The Jo and Maya sign-off exchange loops. Everyone is relentlessly polite and nobody changes the subject or jokes.
- 3e746f (score 4): It's short and a bit more natural, with a callback to "tell Superior I said hi". The goodbye loop gives it away, though: "Talk later" is sent back and forth four times in a row. The replies arrive on a perfect cadence, and Maya's two messages at the same minute (07:30) read as machine-generated.
- 49ca8c (score 4): The setup is plausible, with emojis, "x" sign-offs and the wobbly-sofa banter. But everyone wraps up warmly, and each person's job and week gets mentioned in a neat list. Dan's "Sunday's logistics are settled... I'll keep quiet" is a very AI-sounding summary. Maya's long, tidy recap of who got which end of the sofa is also too tidy.
- 4a02b1 (score 5): This one is the most believable. The toast photo with a lanyard and mug is a nice detail, and the short replies are natural. Tom and Priya send near-identical messages ("Good luck tonight, Maya. Hope it's quiet and the toast lasts") and each split their reply into two messages. People announce their own workloads in turn, which feels scripted.
- 582d43 (score 6): It's short and practical, and the logistics make sense. The folder link and the Tom and Sam exchange feel normal. It's a bit too polite, with "Appreciate you both" and "Thanks" in every message. Sam's "Thanks Tom, that's sorted" doesn't quite fit the thread.
- 73841a (score 1): This is a clear loop. Maya says "I'll ring Dad and check the loft" about seven times without ever doing it. Tom says "I'll pay my share once the total's in" about six times. Jo says the same about Mum's cake. Real people would not keep restating the same status like this, and "Morning both" appears at 11am and in the afternoon.
- cf20e7 (score 5): The work-deadline scenario is believable, and Maya's reply is warm and professional. Then the sign-off repeats three times ("Night Tom", "Night, Maya", "Talk in the morning"). Tom sends "Night" twice. The emoji use is also slightly off.

SCORES
03e8e6	3
3e746f	4
49ca8c	4
4a02b1	5
582d43	6
73841a	1
cf20e7	5

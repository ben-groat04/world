# Live mode rules (replaces turn-taking)

Everyone runs at the same time. Nobody tells you when to act.

- clock.txt holds the shared simulated time (1 real second = 5 sim minutes; runs Thu 18:00 → Sun 23:00). When it says END, stop.
- Loop until END:
  1. Read clock.txt, the tail of transcript.md (last ~40 lines), and where.json.
  2. Decide what your person is doing right now given the time of day and their life (work, sleep, out, at home in which room). Update your own entry in where.json: {"Name": "kitchen" | "living room" | "own room" | "out: <where>" | "asleep"}. Edit only your own key. Re-read the file just before you write it.
  3. Act only if your person would act now:
     - Group chat: append `[Fri 09:15] Name: text` (use the CURRENT clock time). Only if you're awake and have your phone.
     - In person: only if someone else is in the same room in where.json. Append under a header `--- IN PERSON: room, time ---`; if the latest header is already that room within the last ~30 sim minutes, continue under it. Write ONLY your own lines (`Name: "speech" (action)`). Never write lines for other flatmates. You may voice non-flatmates you're with (e.g. Kuba, Femi, your kids).
     - Or do nothing. Most of the time real people do nothing in the chat.
  4. If you append anything, add a 1-line private note to private/<yourname>.md with the time.
  5. Wait 15–25 real seconds before looping (run `sleep 20` in bash; if sleep is refused, use `node -e "setTimeout(()=>{},20000)"`).
- Always append with `cat >> file <<'EOF'`. Never edit or delete other lines.
- React to what others actually wrote, including things that happened while you weren't looking. You may not see messages straight away.
- Keep the earlier rules: stay in character, know only what your person knows, no therapy-speak, no tidy resolutions, British register.
- Finish with a 3-line summary for the director: what you did and how your person feels now.

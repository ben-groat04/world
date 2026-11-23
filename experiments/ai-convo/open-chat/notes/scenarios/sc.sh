# usage: sc.sh <scenario> <extra env...>. START is the real date (default: today 19:00), because the CLI tells agents today's real date and that can't be turned off; DAYS (design parameter) is chosen so each topic's timeline (a weekend, a Friday deadline) falls inside the run. Caller env overrides.
S=$1; shift
case $S in
 T1) env DAYS=6.25 "$@" ORACLE=1 PEOPLE=4 TOPIC="You want to get everyone together this weekend, but nobody has said when they're free." node run.mjs 80 ;;
 T2) env DAYS=5.25 "$@" ORACLE=1 PEOPLE=4 TOPIC="A client has just moved a deadline up to Friday." node run.mjs 80 "You work together at a small design studio." ;;
 T3) env DAYS=3 "$@" ORACLE=1 PEOPLE=3 TOPIC="Mum's 60th birthday is next month and nobody has planned anything yet." node run.mjs 80 "You're siblings, and your parents still live in the town you grew up in." ;;
 T4) env DAYS=3 "$@" ORACLE=1 PEOPLE=2 node run.mjs 80 "You matched on a dating app last week and have been texting since." ;;
 T5) env DAYS=3 "$@" ORACLE=1 PEOPLE=6 SECRETS='{"Sam":"You have a crush on Jo and haven'"'"'t told anyone."}' node run.mjs 80 ;;
 T6) env DAYS=5.25 "$@" ORACLE=1 PEOPLE=4 TOPIC="You need Tom's spreadsheet of supplier invoices before the end of Friday." node run.mjs 80 "You work together in a small accounts team." ;;
esac

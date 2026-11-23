# usage: sc.sh <scenario> <extra env...> -- runs node run.mjs for scenario with given env
S=$1; shift
case $S in
 T1) env "$@" ORACLE=1 PEOPLE=4 DAYS=3 TOPIC="You want to get everyone together this weekend, but nobody has said when they're free." node run.mjs 80 ;;
 T2) env "$@" ORACLE=1 PEOPLE=4 DAYS=3 TOPIC="A client has just moved a deadline up to Friday." node run.mjs 80 "You work together at a small design studio." ;;
 T3) env "$@" ORACLE=1 PEOPLE=3 DAYS=3 TOPIC="Mum's 60th birthday is next month and nobody has planned anything yet." node run.mjs 80 "You're siblings, and your parents still live in the town you grew up in." ;;
 T4) env "$@" ORACLE=1 PEOPLE=2 DAYS=3 node run.mjs 80 "You matched on a dating app last week and have been texting since." ;;
 T5) env "$@" ORACLE=1 PEOPLE=6 DAYS=3 SECRETS='{"Sam":"You have a crush on Jo and haven'"'"'t told anyone."}' node run.mjs 80 ;;
 T6) env "$@" ORACLE=1 PEOPLE=4 DAYS=3 TOPIC="You need Tom's spreadsheet of supplier invoices before the end of Friday." node run.mjs 80 "You work together in a small accounts team." ;;
esac

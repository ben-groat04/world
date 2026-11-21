# Emergence layer: goals, plans, projects, groups, consequence chains
Purpose: avoid a fixed menu of events. Stories must come from people WANTING things and COMBINING primitive
moves to get them, colliding with other people's wants. Built as sim/goals/ (engine-level, not a "system" bolt-on).

## 1. Motivation model
- Each person has stable **drives** (derived from personality + values + life stage): security, status/achievement,
  belonging, love/intimacy, autonomy, creativity/expression, justice/fairness, pleasure, care-for-others, curiosity,
  legacy. Plus situational **pressures** (debt, loneliness, boredom, grievance, health scare, ageing, a new baby).
- **Goal generation** (daily scan, cheap): drives x pressures x opportunities x role models (what friends are
  doing — goals are socially contagious) produce candidate goals from a large **goal grammar**, not a list:
  `verb(object, [target person/group/place], [constraint])`, e.g. acquire(money, by:side-business),
  win(person), escape(job), avenge(person, wrong), improve(self:fitness), create(band|podcast|mural|app|garden),
  protect(place:park, from:development), belong(group:running-club), reconcile(person), expose(person, secret),
  care(for:parent), leave(city), find(partner), become(role:councillor|chef|manager), organise(event:street-party).
  Goals have intensity, deadline/patience, secrecy (some goals are hidden from others), and an origin memory
  ("since the redundancy").
- Goals persist for weeks to decades, can be abandoned, deferred, transformed (failed revenge -> self-destructive
  drinking; failed band -> becomes a music teacher), or completed (memory + moodlet + identity change).

## 2. Plans from primitives (HTN-lite)
Planner decomposes a goal into steps built from ~40 composable **primitive moves**, each executed as normal
actions in the world (so they're visible on the map and in the inspector):
ask(person, favour|money|date|help|join), persuade, recruit, befriend, flatter, confide, lie, threaten, sabotage,
gossip-about, spy/observe, save money, borrow, lend, buy, sell, rent(space), apply(job|course|grant|permit),
quit, train/practise(skill), learn(course), post(publicly online), petition, organise(meeting/event),
attend, volunteer, gift, apologise, confront, report(to police/landlord/council), move, avoid(person), wait.
Preconditions/effects on world state (money, skills, relationships, group membership, possessions, reputation).
Plans fail realistically: refusal, lack of money, competition, bad luck, losing interest (conscientiousness),
another person's opposing plan. Replanning picks alternative methods.

## 3. Groups & projects (collective agency)
- **Group** entity: {id, name, kind (band, club, team, business, association, friend-gang, campaign, faith group,
  gang/crew, family firm, online community), founderId, members+roles, purpose (a goal), meetingPlace & schedule,
  funds, cohesion, reputation, norms, history}. Created when a person's goal requires others (recruitment).
- Groups have their own goals and plans (decided by leader + member influence), internal politics (leadership
  challenges, factions, splits, members quitting, romances inside the group), and inter-group relations
  (rival pub quiz teams, café vs new chain café, residents' association vs developer, two bands).
- Groups can die, merge, become institutions (a festival that recurs; a business that outlives its founder).
- **Projects**: concrete multi-step undertakings with progress, resources, and a visible result in the world:
  open a business (claims a vacant unit, renames it, map updates), community garden (changes a lot tile),
  mural, street party, band gig at the pub, protest, renovation, a podcast/viral account, fundraiser.

## 4. Consequence chains & memory
- Every notable outcome creates **affordances** for others' goal generation: a burglary raises security drive
  for neighbours (-> neighbourhood watch group, -> vigilante, -> wrong suspect accused -> feud); a business
  closure -> unemployed staff goals; a viral post -> fame -> envy/goals of rivals; a death -> legacy goals in kin.
- Grudges, debts, promises and secrets are first-class objects that persist and can be called in years later.
- Story arcs are tracked explicitly: `world.arcs` {id, kind (rise, fall, rivalry, romance, redemption, revenge,
  underdog, scandal, coming-of-age, feud, rescue), protagonists, startTick, beats:[chronicle ids], status}
  so the UI can show "storylines" and the report can measure diversity.

## 5. Player & god mode hooks
- Player can join/leave/found groups, adopt goals, use primitive moves directly (ask, persuade, lend, confront...).
- NPC plans can target the player (ask them to join a band, borrow money, take revenge on them).
- God mode: plant a goal in someone, create a group, inject an affordance (a vacant shop, a lottery win, a secret).

## 6. Anticipated checks (build to pass these, don't wait for them)
- Variety: >= 25 distinct goal kinds actively pursued and >= 10 arc kinds per decade per seed; no single goal
  kind > 15% of active goals; distinct chronicle text >= 85%.
- Realism: most goals are mundane (save for a flat, get fit, find partner, career move); dramatic ones (revenge,
  crime, exposing secrets) rare and driven by strong grievance + personality. Success rates plausible (most
  bands fail, most new businesses close within a few years, most diets lapse).
- Divergence: different seeds produce clearly different neighbourhood histories (different groups, businesses,
  power structures); same seed reproduces exactly.
- Legibility: every goal/plan step has a human-readable description and appears in the inspector
  ("Goal: start a band — step 2/5: recruit a drummer (asked Priya, she said maybe)").
- Performance: goal generation & planning budgeted (daily, amortised across people); total sim speed target holds.

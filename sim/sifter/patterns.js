// Declarative storyline patterns, written against the event types Larkfield actually emits (checked on real 2-year logs, seed 1).
// Matchers are event types (wildcards 'life.*') or 'tag:<tag>'. window = days of silence before an arc lapses. min = beats needed to count as a confirmed arc.
// scope: 'pair' (two actors, order-free), 'person' (first actor; allActors = every actor up to 3 gets the arc), 'object', 'place'.
const BIG = (ev) => (ev.salience ?? 0) >= 0.2; // mundane goals (the weekly shop, a haircut) are emitted at 0.05 and never become storylines
export const PATTERNS = [
  { kind: 'romance', scope: 'person', allActors: true, window: 500, min: 2, stages: [
    { name: 'together', m: ['life.couple', 'social.flirt'] },
    { name: 'deepen', m: ['life.cohabit', 'life.engaged', 'life.pregnant', 'life.marriage', 'life.birth'], repeat: true },
    { name: 'end', m: ['life.breakup', 'life.divorce'], terminal: true, outcome: 'ended' }] },
  { kind: 'breakup', scope: 'person', allActors: true, window: 120, min: 2, stages: [
    { name: 'rupture', m: ['life.breakup', 'life.divorce'] },
    { name: 'fallout', m: ['housing.moved_out', 'life.move_out', 'social.fallout', 'money.arrears', 'health.episode', 'life.leave_home'], repeat: true },
    { name: 'new_start', m: ['life.couple', 'housing.moved_in', 'life.move_in', 'labour.hired'], terminal: true, outcome: 'moved on' }] },
  { kind: 'new_family', scope: 'person', allActors: true, window: 400, min: 2, stages: [
    { name: 'expecting', m: ['life.pregnant', 'life.birth'] },
    { name: 'adjusting', m: ['life.birth', 'money.cost_pressure', 'labour.quit', 'labour.went_inactive', 'housing.overcrowded', 'housing.moved_out', 'life.caring_start'], repeat: true }] },
  { kind: 'job_loss', scope: 'person', window: 300, min: 2, stages: [
    { name: 'loss', m: ['labour.job_lost', 'labour.quit', 'labour.firm_closed'] },
    { name: 'strain', m: ['money.arrears', 'money.debt_spiral', 'money.cost_pressure', 'housing.rent_rise', 'housing.notice_served', 'health.episode', 'labour.applied', 'money.benefit_claim'], repeat: true },
    { name: 'recovery', m: ['labour.hired', 'labour.promoted'], terminal: true, outcome: 'back at work' }] },
  { kind: 'money_squeeze', scope: 'person', allActors: true, window: 200, span: 400, min: 3, stages: [
    { name: 'squeeze', m: ['housing.rent_rise', 'money.cost_pressure', 'money.arrears'] },
    { name: 'strain', m: ['money.arrears', 'money.debt_spiral', 'money.benefit_claim', 'labour.second_job', 'social.fallout', 'health.episode', 'money.cost_pressure'], repeat: true },
    { name: 'out', m: ['housing.notice_served', 'housing.eviction', 'housing.homeless', 'housing.moved_out'], terminal: true, outcome: 'forced to move' },
    { name: 'clear', m: ['money.arrears_cleared'], terminal: true, outcome: 'got back on top of it' }] },
  { kind: 'newcomer', scope: 'person', allActors: true, window: 120, span: 180, min: 3, stages: [
    { name: 'arrive', m: ['housing.moved_in', 'life.move_in'] },
    { name: 'settle', m: ['social.acquaint', 'social.friendship', 'labour.hired', 'group.joined', 'social.kindness', 'life.couple', 'social.confide'], repeat: true },
    { name: 'leave', m: ['housing.moved_out', 'life.move_out'], terminal: true, outcome: 'left again' }] },
  { kind: 'falling_out', scope: 'pair', window: 120, span: 365, min: 2, stages: [
    { name: 'row', m: ['social.fallout', 'group.conflict'] },
    { name: 'escalation', m: ['social.fallout', 'group.conflict', 'civic.complaint'], repeat: true },
    { name: 'truce', m: ['social.reconcile'], terminal: true, outcome: 'made up' }] },
  { kind: 'illness', scope: 'person', allActors: true, window: 300, min: 2, stages: [
    { name: 'diagnosis', m: ['health.diagnosis', 'health.crisis', 'health.accident'] },
    { name: 'coping', m: ['life.caring_start', 'health.treatment', 'health.episode', 'labour.went_inactive', 'labour.quit', 'housing.moved_out'], repeat: true },
    { name: 'recovered', m: ['health.recovered', 'life.caring_end'], terminal: true, outcome: 'recovered' },
    { name: 'death', m: ['life.death'], terminal: true, outcome: 'died' }] },
  { kind: 'bereavement', scope: 'person', allActors: true, window: 300, min: 2, stages: [
    { name: 'loss', m: ['life.death', 'life.kin_death', 'life.funeral'] },
    { name: 'aftermath', m: ['life.funeral', 'life.will', 'money.estate', 'health.episode', 'labour.quit', 'housing.moved_out', 'social.kindness', 'life.move_in'], repeat: true }] },
  { kind: 'career', scope: 'person', window: 600, min: 2, stages: [
    { name: 'step', m: ['labour.hired', 'labour.promoted', 'labour.pay_rise', 'life.graduate', 'labour.second_job'], repeat: true }] },
  { kind: 'scandal', scope: 'person', window: 200, min: 2, stages: [
    { name: 'secret', m: ['social.secret'] },
    { name: 'out', m: ['social.scandal'], terminal: true, outcome: 'came out' }] },
  { kind: 'ambition', scope: 'person', window: 200, min: 2, stages: [
    { name: 'set_out', m: ['goal.formed'], guard: BIG },
    { name: 'attempt', m: ['goal.transformed', 'goal.invented', 'group.founded', 'project.started', 'goal.deferred'], repeat: true },
    { name: 'won', m: ['goal.completed'], terminal: true, outcome: 'pulled it off', guard: BIG },
    { name: 'gave_up', m: ['goal.failed', 'goal.abandoned'], terminal: true, outcome: 'gave up', guard: BIG }] },
  { kind: 'welcome', scope: 'pair', window: 100, span: 150, min: 2, stages: [
    { name: 'hello', m: ['tag:welcome'] },
    { name: 'friends', m: ['social.friendship', 'social.confide', 'social.kindness', 'social.acquaint'], repeat: true },
    { name: 'cooled', m: ['social.fallout'], terminal: true, outcome: 'fell out' }] },
  { kind: 'group_saga', scope: 'person', window: 300, min: 3, stages: [
    { name: 'found', m: ['group.founded'] },
    { name: 'run', m: ['group.joined', 'group.conflict', 'group.leader_changed', 'project.done', 'group.split'], repeat: true },
    { name: 'end', m: ['group.dissolved'], terminal: true, outcome: 'folded' }] },
];
export const KINDS = PATTERNS.map((p) => p.kind);

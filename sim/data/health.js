// SETTING DATA: diseases & injuries, injuries per job, job nouns, dusty trades. Edit for a new setting.
export const DIS = {
  cold: { id: 'cold', name: 'a head cold', contagious: true, beta: 0.008, incub: [1, 3], dur: [4, 9], sev: [0.1, 0.3], cfr: 0.0003, immune: 25, resp: true, causes: ['a cold that settled on the chest'] },
  flu: { id: 'flu', name: 'the winter flu', contagious: true, beta: 0.022, incub: [1, 3], dur: [6, 14], sev: [0.3, 0.65], cfr: 0.01, immune: 100, resp: true, notable: true, causes: ['the winter flu', 'a lung fever after the flu', 'a fever and a cough that would not lift'] },
  sweating: { id: 'sweating', name: 'the sweating fever', contagious: true, beta: 0.016, incub: [2, 5], dur: [4, 9], sev: [0.55, 0.9], cfr: 0.16, immune: 450, epi: true, causes: ['the sweating fever'] },
  pox: { id: 'pox', name: 'the pox', contagious: true, beta: 0.01, incub: [5, 10], dur: [14, 24], sev: [0.5, 0.9], cfr: 0.2, immune: 1e6, epi: true, scars: true, causes: ['the pox'] },
  flux: { id: 'flux', name: 'the bloody flux', contagious: true, beta: 0.006, incub: [1, 3], dur: [4, 10], sev: [0.4, 0.7], cfr: 0.02, immune: 30, hyg: true, notable: true, causes: ['the bloody flux', 'a flux of the bowels'] },
  plague: { id: 'plague', name: 'the black plague', contagious: true, beta: 0.05, incub: [2, 4], dur: [5, 10], sev: [0.7, 1.0], cfr: 0.45, immune: 1e6, epi: true, causes: ['the black plague'] },
  curse: { id: 'curse', name: 'a wasting sickness', contagious: false, beta: 0, incub: [0, 0], dur: [10, 16], sev: [0.55, 0.85], cfr: 0.15, immune: 0, causes: ['a wasting sickness'] },
  woundfever: { id: 'woundfever', name: 'a wound fever', contagious: false, beta: 0, incub: [0, 0], dur: [7, 14], sev: [0.5, 0.8], cfr: 0.2, immune: 0, causes: ['a festering wound', 'a wound fever'] },
  // injuries (non-contagious). incap = cannot work while it lasts; infect = chance of festering if untreated.
  cut: { id: 'cut', name: 'a deep cut', injury: true, dur: [6, 12], sev: [0.2, 0.4], cfr: 0.004, infect: 0.12, incap: false, causes: ['a cut that festered'] },
  burn: { id: 'burn', name: 'a bad burn', injury: true, dur: [8, 18], sev: [0.25, 0.5], cfr: 0.006, infect: 0.14, incap: true, causes: ['a burn that festered'] },
  arm: { id: 'arm', name: 'a broken arm', injury: true, dur: [20, 40], sev: [0.3, 0.5], cfr: 0.003, infect: 0.04, incap: true, maim: 0.08, causes: ['a broken arm that turned bad'] },
  leg: { id: 'leg', name: 'a broken leg', injury: true, dur: [30, 56], sev: [0.45, 0.7], cfr: 0.012, infect: 0.06, incap: true, maim: 0.3, causes: ['a broken leg that never mended'] },
  crush: { id: 'crush', name: 'a crushed hand', injury: true, dur: [25, 50], sev: [0.45, 0.7], cfr: 0.015, infect: 0.12, incap: true, maim: 0.35, causes: ['a crushed hand that mortified'] },
  back: { id: 'back', name: 'a wrenched back', injury: true, dur: [10, 28], sev: [0.2, 0.4], cfr: 0.0005, infect: 0, incap: true, maim: 0.1, causes: ['a wrenched back'] },
  fall: { id: 'fall', name: 'a bad fall', injury: true, dur: [8, 24], sev: [0.25, 0.55], cfr: 0.006, infect: 0.03, incap: true, maim: 0.05, causes: ['a bad fall'] },
};
export const INJ_JOB = { // injuries per working year, and what kinds with weights
  smith: [0.32, [['burn', 4, 'at the forge'], ['crush', 2, 'under a hammer'], ['cut', 2, 'on hot iron'], ['arm', 1, 'at the anvil']]],
  carpenter: [0.3, [['cut', 4, 'with a chisel'], ['crush', 2, 'beneath a beam'], ['fall', 2, 'from a scaffold'], ['arm', 1, 'on the site']]],
  farmer: [0.22, [['cut', 3, 'with a scythe'], ['back', 3, 'at the harvest'], ['leg', 1, 'kicked by an ox'], ['arm', 1, 'thrown from a cart']]],
  laborer: [0.3, [['back', 3, 'hauling sacks'], ['crush', 2, 'under a barrow of stone'], ['cut', 2, 'on the job'], ['leg', 1, 'in a fall from a wall']]],
  miller: [0.28, [['crush', 3, 'in the millwheel gears'], ['back', 3, 'lifting grain'], ['arm', 1, 'caught in the machinery']]],
  gravedigger: [0.12, [['back', 3, 'in the churchyard'], ['cut', 1, 'on a spade'], ['fall', 1, 'into a grave']]],
  guard: [0.1, [['cut', 3, 'on the night watch'], ['arm', 1, 'in a scuffle']]],
  baker: [0.1, [['burn', 4, 'at the ovens'], ['back', 1, 'kneading dough']]],
  tailor: [0.04, [['cut', 1, 'with the shears']]], gardener: [0.1, [['back', 2, 'in the beds'], ['cut', 1, 'with the shears']]],
  tavernkeeper: [0.05, [['burn', 1, 'at the hearth'], ['cut', 1, 'in the cellar']]], server: [0.05, [['burn', 1, 'carrying a pot'], ['fall', 1, 'on the stairs']]],
};
export const JOBNOUN = { farmer: 'farmer', baker: 'baker', smith: 'smith', tavernkeeper: 'tavernkeeper', merchant: 'merchant', doctor: 'physician', teacher: 'schoolteacher', priest: 'priest', guard: 'watchman', miller: 'miller', tailor: 'tailor', carpenter: 'carpenter', innkeeper: 'innkeeper', laborer: 'labourer', mayor: 'mayor', clerk: 'clerk', gardener: 'gardener', gravedigger: 'gravedigger', captain: 'captain of the watch', server: 'tavern hand', nurse: 'nurse' };
export const DUSTY = new Set(['miller', 'smith', 'baker', 'carpenter']);


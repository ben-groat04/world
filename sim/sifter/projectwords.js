// Plain-English phrases for group-project events, per project kind (content/larkfield/goal-templates.js PROJECT_KINDS). A kind is NOT a noun you can drop into "pulled off a X"
// ("pulled off a business" read like a bug), so every kind has its own verb phrases: start (got going), done (came off), flop (fell flat). Each is a list of variants.
const P = {
  business: { start: ['started getting a business off the ground', 'began setting up a business'], done: ['opened the doors of a new business', 'got a business up and running'], flop: ['watched a business venture fall flat', 'saw a business plan come to nothing'] },
  gig: { start: ['got a gig lined up', 'started rehearsing for a gig'], done: ['played a gig that went down well', 'got through a gig without a disaster'], flop: ['saw a gig fall flat', 'had a gig that did not come off'] },
  podcast: { start: ['started recording a podcast', 'began a podcast'], done: ['put out a podcast episode', 'got a podcast out'], flop: ['let a podcast fizzle out', 'saw a podcast stall after one episode'] },
  mural: { start: ['got a mural going', 'began planning a mural'], done: ['finished a mural', 'got a mural painted'], flop: ['saw a mural plan fall through', 'had a mural idea go nowhere'] },
  garden: { start: ['got a community garden going', 'started digging a garden plot'], done: ['got a garden planted', 'saw a garden come into flower'], flop: ['saw a garden plan fizzle out', 'watched a garden plot go to weeds'] },
  fixture: { start: ['started organising a match', 'began lining up a fixture'], done: ['got a match played', 'organised a fixture that went ahead'], flop: ['had a match called off', 'saw a fixture fall through'] },
  campaign: { start: ['got a campaign going', 'started a local campaign'], done: ['saw a campaign through', 'won something from a local campaign'], flop: ['saw a campaign run out of steam', 'watched a campaign come to nothing'] },
  watch: { start: ['got a neighbourhood watch started', 'started up a street watch'], done: ['got a neighbourhood watch running', 'saw a street watch up and working'], flop: ['saw a street watch fizzle out', 'watched a neighbourhood watch lose its volunteers'] },
  fundraiser: { start: ['started organising a fundraiser', 'began planning a fundraiser'], done: ['raised money at a fundraiser', 'pulled off a fundraiser'], flop: ['saw a fundraiser fall flat', 'had a fundraiser that barely covered its costs'] },
  cleanup: { start: ['started organising a clean-up', 'rounded up volunteers for a clean-up'], done: ['got a clean-up done', 'organised a clean-up that filled forty bags'], flop: ['saw a clean-up fall through', 'had a clean-up that hardly anyone came to'] },
  celebration: { start: ['started planning a celebration', 'began organising a party'], done: ['threw a celebration that went well', 'pulled off a celebration'], flop: ['saw a celebration fall flat', 'had a party plan come to nothing'] },
  street_party: { start: ['started planning a street party', 'began organising a street party'], done: ['pulled off a street party', 'got the street out for a party'], flop: ['saw a street party rained off', 'had a street party plan fall through'] },
};
const G = { start: ['got a project going', 'started a project'], done: ['finished a project', 'saw a project through'], flop: ['saw a project fall flat', 'had a project come to nothing'] };
export const projectWords = (kind, which) => (P[kind] || G)[which];
/** One variant, chosen by a stable number. */
export const projectPhrase = (kind, which, n = 0) => { const a = projectWords(kind, which); return a[Math.abs(n | 0) % a.length]; };

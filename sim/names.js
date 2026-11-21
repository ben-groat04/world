// Name generation: people, businesses, town.
export const MALE = ['Alder','Edmund','Tobias','Gideon','Harlan','Silas','Corwin','Barnaby','Osric','Wystan','Fenwick','Lucan','Ambrose','Jasper','Piers','Rowan','Thaddeus','Warrick','Leofric','Bertram','Cedric','Dunstan','Everard','Fulke','Godfrey','Hugh','Ivor','Jory','Kit','Lowell','Merrick','Nigel','Oswin','Percival','Quentin','Reginald','Stellan','Tristan','Ulric','Victor','Walter','Yorick','Aldous','Benedict','Conrad','Dorian','Emrys','Florian','Gareth','Henrik','Isaac','Jonah','Kendrick','Lorcan','Matthias','Nolan','Orrin','Phineas','Rufus','Samuel'];
export const FEMALE = ['Adela','Beatrix','Clara','Daphne','Elspeth','Fiona','Greta','Hester','Isolde','Juniper','Katrin','Lenora','Mara','Nell','Odette','Philippa','Rosalind','Sybil','Thea','Una','Vesper','Wilhelmina','Yvaine','Zora','Annis','Bryony','Cordelia','Dorothea','Eleanor','Freya','Gwen','Hannah','Ingrid','Joan','Kerstin','Lilith','Maud','Nora','Ottilie','Petra','Quinn','Rhea','Sabine','Tamsin','Ursula','Verity','Winifred','Ysolde','Agnes','Bridget','Celia','Delphine','Edith','Flora','Gisela','Hilda','Imogen','Lark','Margery','Opal'];
export const SURNAMES = ['Ashby','Bramwell','Cobb','Dunmore','Eldridge','Fairweather','Garrick','Hawthorne','Ingram','Jessop','Kettle','Lockwood','Marsh','Nettleton','Oakes','Pennywhistle','Quill','Rookwood','Sedgwick','Thistlewood','Underhill','Vane','Whitlock','Yarrow','Alderton','Bellamy','Crowley','Dray','Everhart','Fenn','Gable','Harrow','Ironside','Kemp','Lark','Mercer','Northcott','Osgood','Pike','Radley','Stowe','Tanner','Upton','Wren','Abbot','Blackwood','Cartwright','Dale','Elmsworth','Fletcher','Greaves','Hollis','Ketteridge','Lowry','Mallory','Nightingale','Orchard','Pelham','Rushworth','Sparrow','Thorne','Whitcombe','Wick','Bracken','Hobb','Corbin','Digby','Farrow','Gosling','Heron','Merriweather','Peverell','Tolliver'];
const ADJ = ['Gilded','Drowsy','Crooked','Laughing','Rusty','Merry','Wandering','Silver','Sleepy','Red','Jolly','Humble'];
const ANIMAL = ['Goose','Fox','Heron','Badger','Lantern','Anchor','Barrel','Stag','Crown','Plough','Owl','Kettle'];
const FIXED = {
  bakery: ['Hearth & Crumb', 'The Rising Loaf', 'Golden Crust Bakery', 'Sweet Wheat Bakery'],
  smithy: ['The Anvil & Ember', 'Ironhand Smithy', 'Cinder Forge', 'Hammerfall Smithy'],
  market: ['Hollowmere Market', 'The Corn Exchange', 'Marketside Hall', 'Stallholders\' Row'],
  inn: ['The Weary Traveller Inn', 'Millbridge Inn', 'The Lamplighter', 'Riverside Rest'],
  tailor: ['Needle & Thread', 'The Thimble', 'Bolt & Bobbin', 'Fine Stitch Tailors'],
  carpenter: ['Oakheart Carpentry', 'The Plane & Chisel', 'Joiners\' Yard', 'Timberline Workshop'],
  clinic: ['Willow Clinic'], school: ['Hollowmere Schoolhouse'], temple: ['Temple of the Quiet Light'],
  townhall: ['Town Hall'], jail: ['The Watch House'], mill: ['Riverbend Mill'], park: ['Elm Green'],
  cemetery: ['Hollowmere Rest'], square: ['Founders\' Square'], farm: ['Brightfield Farm', 'Meadowbrook Farm', 'Stonecrop Farm', 'Hillside Farm', 'Fallow Acres', 'Greenhollow Farm', 'Cloverleaf Farm', 'Windrow Farm'],
};
const OWNER_FMT = {
  farm: (l) => `${l} Farm`, bakery: (l) => `${l}'s Bakery`, smithy: (l) => `${l} Forge`,
  tailor: (l) => `${l} & Daughters Tailors`, carpenter: (l) => `${l} Joinery`, mill: (l) => `${l} Mill`, inn: (l) => `${l}'s Inn`,
};
export const TOWN_NAME = 'Hollowmere';
export function firstName(rng, sex) { return rng.pick(sex === 'M' ? MALE : FEMALE); }
export function surname(rng) { return rng.pick(SURNAMES); }
// `used` is a Set of names already taken. ownerLast optional (uses owner-style names ~50% of the time).
export function businessName(rng, type, ownerLast, used = new Set()) {
  for (let i = 0; i < 12; i++) {
    let n;
    if (type === 'tavern') n = `The ${rng.pick(ADJ)} ${rng.pick(ANIMAL)}`;
    else if (ownerLast && OWNER_FMT[type] && (type === 'farm' || rng.chance(0.5))) n = OWNER_FMT[type](ownerLast);
    else if (FIXED[type]) n = rng.pick(FIXED[type]);
    else n = type[0].toUpperCase() + type.slice(1);
    if (!used.has(n)) { used.add(n); return n; }
  }
  return type[0].toUpperCase() + type.slice(1) + ' ' + (used.size + 1);
}

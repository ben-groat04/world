// Building / unit archetypes for Larkfield. DATA ONLY.
// Footprint units are map tiles (1 tile = 2 m). `accommodationType` keys match calibration.accommodationType.
// `tenure` weights are the archetype's prior; the map generator then balances to calibration.tenure exactly (+-1 unit).
// Tenure keys: owned_outright, mortgage, shared_ownership, council, housing_assoc, private_rent.
export const TENURES = ['owned_outright', 'mortgage', 'shared_ownership', 'council', 'housing_assoc', 'private_rent'];

// calibration.tenure.composite label -> our key (private_rent merges landlord/agency + other + rent free)
export const TENURE_FROM_CALIBRATION = {
  'Owned outright': 'owned_outright', 'Owned with mortgage/loan': 'mortgage', 'Shared ownership': 'shared_ownership',
  'Social rent - council': 'council', 'Social rent - housing association/other': 'housing_assoc',
  'Private rent - landlord/agency': 'private_rent', 'Private rent - other': 'private_rent', 'Rent free': 'private_rent',
};

// Landlord kinds for rented units (every unit has an owner/landlord: occupier, private landlord, council, HA, developer BTR)
export const LANDLORDS = {
  private_rent: [
    { kind: 'small_landlord', w: 0.62, units: [1, 3], label: 'private landlord (1-3 properties)' },
    { kind: 'portfolio_landlord', w: 0.22, units: [4, 25], label: 'portfolio landlord' },
    { kind: 'letting_agent_managed', w: 0.10, units: [1, 6], label: 'agent-managed owner' },
    { kind: 'build_to_rent', w: 0.06, units: [20, 200], label: 'build-to-rent operator' },
  ],
  council: [{ kind: 'council', w: 1, label: 'city council housing' }],
  housing_assoc: [{ kind: 'housing_association', w: 1, label: 'housing association' }],
};

// Bedroom-count weights are per-archetype; floorAreaM2 is [min,max] gross internal.
export const BUILDING_ARCHETYPES = {
  // ---------- houses ----------
  terrace_2up2down: {
    id: 'terrace_2up2down', label: 'Victorian terrace, 2-up-2-down', accommodationType: 'terraced', storeys: 2,
    footprint: { w: 3, d: 5 }, plotDepth: [9, 10], frontGarden: [0, 1], roof: 'gable', material: ['red_brick', 'red_brick', 'yellow_stock'],
    year: [1880, 1905], units: [{ kind: 'house', bedrooms: { 2: 0.55, 3: 0.40, 4: 0.05 }, floorAreaM2: [62, 86] }],
    tenure: { owned_outright: 0.22, mortgage: 0.24, shared_ownership: 0, council: 0.04, housing_assoc: 0.05, private_rent: 0.45 },
    weight: 0.62,
  },
  terrace_bay_3bed: {
    id: 'terrace_bay_3bed', label: 'Edwardian bay-fronted terrace, 3 storeys incl. attic', accommodationType: 'terraced', storeys: 3,
    footprint: { w: 4, d: 6 }, plotDepth: [10, 11], frontGarden: [1, 1], roof: 'gable', material: ['red_brick', 'buff_brick'],
    year: [1900, 1914], units: [{ kind: 'house', bedrooms: { 3: 0.6, 4: 0.35, 5: 0.05 }, floorAreaM2: [95, 130] }],
    tenure: { owned_outright: 0.28, mortgage: 0.30, shared_ownership: 0, council: 0.02, housing_assoc: 0.03, private_rent: 0.37 },
    weight: 0.22,
  },
  terrace_interwar_council: {
    id: 'terrace_interwar_council', label: 'Interwar/post-war council terrace (now part right-to-buy)', accommodationType: 'terraced', storeys: 2,
    footprint: { w: 3, d: 5 }, plotDepth: [10, 10], frontGarden: [1, 1], roof: 'hip_row', material: ['render_cream', 'red_brick'],
    year: [1930, 1965], units: [{ kind: 'house', bedrooms: { 2: 0.4, 3: 0.55, 4: 0.05 }, floorAreaM2: [75, 95] }],
    tenure: { owned_outright: 0.2, mortgage: 0.16, shared_ownership: 0, council: 0.35, housing_assoc: 0.12, private_rent: 0.17 },
    weight: 0.16,
  },
  semi: {
    id: 'semi', label: 'Semi-detached house', accommodationType: 'semi', storeys: 2,
    footprint: { w: 4, d: 5 }, plotDepth: [10, 10], frontGarden: [1, 2], roof: 'hip', material: ['render_cream', 'red_brick', 'pebbledash'],
    year: [1920, 1938], units: [{ kind: 'house', bedrooms: { 2: 0.1, 3: 0.65, 4: 0.25 }, floorAreaM2: [88, 125] }],
    tenure: { owned_outright: 0.36, mortgage: 0.32, shared_ownership: 0.0, council: 0.04, housing_assoc: 0.04, private_rent: 0.24 },
    weight: 1,
  },
  detached_villa: {
    id: 'detached_villa', label: 'Detached Victorian/Edwardian villa', accommodationType: 'detached', storeys: 3,
    footprint: { w: 6, d: 7 }, plotDepth: [13, 15], frontGarden: [2, 3], roof: 'hip', material: ['yellow_stock', 'red_brick'],
    year: [1860, 1905], units: [{ kind: 'house', bedrooms: { 4: 0.5, 5: 0.4, 6: 0.1 }, floorAreaM2: [170, 260] }],
    tenure: { owned_outright: 0.52, mortgage: 0.30, shared_ownership: 0, council: 0, housing_assoc: 0, private_rent: 0.18 },
    weight: 1,
  },
  // ---------- converted / shared ----------
  converted_villa: {
    id: 'converted_villa', label: 'Large Victorian house converted to flats', accommodationType: 'convertedOrSharedHouse', storeys: 3,
    footprint: { w: 6, d: 7 }, plotDepth: [13, 14], frontGarden: [2, 3], roof: 'hip', material: ['yellow_stock', 'red_brick'],
    year: [1870, 1905],
    units: [ // 3-4 flats; floor field = which storey
      { kind: 'flat', floor: 0, bedrooms: { 1: 0.5, 2: 0.5 }, floorAreaM2: [42, 70] },
      { kind: 'flat', floor: 1, bedrooms: { 1: 0.6, 2: 0.4 }, floorAreaM2: [42, 65] },
      { kind: 'flat', floor: 2, bedrooms: { 0: 0.2, 1: 0.8 }, floorAreaM2: [30, 50] },
    ],
    tenure: { owned_outright: 0.10, mortgage: 0.20, shared_ownership: 0.02, council: 0.0, housing_assoc: 0.12, private_rent: 0.56 },
    weight: 0.6,
  },
  converted_terrace: {
    id: 'converted_terrace', label: 'Terraced house converted to two flats', accommodationType: 'convertedOrSharedHouse', storeys: 2,
    footprint: { w: 3, d: 6 }, plotDepth: [10, 10], frontGarden: [0, 1], roof: 'gable', material: ['red_brick', 'yellow_stock'],
    year: [1880, 1905],
    units: [
      { kind: 'flat', floor: 0, bedrooms: { 1: 0.7, 2: 0.3 }, floorAreaM2: [38, 52] },
      { kind: 'flat', floor: 1, bedrooms: { 1: 0.5, 2: 0.5 }, floorAreaM2: [38, 52] },
    ],
    tenure: { owned_outright: 0.06, mortgage: 0.16, shared_ownership: 0.03, council: 0, housing_assoc: 0.0, private_rent: 0.75 },
    weight: 0.25,
  },
  hmo_house: {
    id: 'hmo_house', label: 'Shared house / HMO (one household of sharers)', accommodationType: 'convertedOrSharedHouse', storeys: 3,
    footprint: { w: 4, d: 6 }, plotDepth: [10, 11], frontGarden: [1, 1], roof: 'gable', material: ['red_brick', 'buff_brick'],
    year: [1890, 1910], units: [{ kind: 'shared_house', bedrooms: { 4: 0.4, 5: 0.4, 6: 0.2 }, floorAreaM2: [110, 160], hmo: true }],
    tenure: { owned_outright: 0, mortgage: 0, shared_ownership: 0, council: 0, housing_assoc: 0, private_rent: 1 },
    weight: 0.12,
  },
  // ---------- purpose-built flats ----------
  council_slab: {
    id: 'council_slab', label: '1960s council slab block (4-5 storeys, deck/stair access)', accommodationType: 'purposeBuiltFlats', storeys: 5,
    footprint: { w: 30, d: 8 }, roof: 'flat', material: ['concrete_panel', 'brown_brick'], year: [1962, 1972],
    // generator repeats `unitsPerFloor` units on each floor, split across `cores` stair cores
    perFloor: { count: 6, cores: 2 }, floors: [4, 5], // floor 0 = ground; floors 0-4
    units: [{ kind: 'flat', bedrooms: { 1: 0.35, 2: 0.45, 3: 0.2 }, floorAreaM2: [46, 78] }],
    tenure: { owned_outright: 0.08, mortgage: 0.06, shared_ownership: 0, council: 0.62, housing_assoc: 0.04, private_rent: 0.20 },
    weight: 1,
  },
  council_maisonettes: {
    id: 'council_maisonettes', label: 'Low-rise maisonette block (3 storeys)', accommodationType: 'purposeBuiltFlats', storeys: 3,
    footprint: { w: 20, d: 7 }, roof: 'flat', material: ['brown_brick', 'render_cream'], year: [1955, 1970],
    perFloor: { count: 4, cores: 2 }, floors: [3, 3],
    units: [{ kind: 'flat', bedrooms: { 2: 0.5, 3: 0.4, 1: 0.1 }, floorAreaM2: [62, 88] }],
    tenure: { owned_outright: 0.04, mortgage: 0.05, shared_ownership: 0, council: 0.56, housing_assoc: 0.15, private_rent: 0.20 },
    weight: 1,
  },
  ha_lowrise: {
    id: 'ha_lowrise', label: 'Housing-association infill block (3-4 storeys)', accommodationType: 'purposeBuiltFlats', storeys: 4,
    footprint: { w: 18, d: 9 }, roof: 'flat', material: ['buff_brick', 'render_grey'], year: [1998, 2012],
    perFloor: { count: 4, cores: 1 }, floors: [3, 4],
    units: [{ kind: 'flat', bedrooms: { 1: 0.4, 2: 0.45, 3: 0.15 }, floorAreaM2: [50, 80] }],
    tenure: { owned_outright: 0, mortgage: 0, shared_ownership: 0.15, council: 0, housing_assoc: 0.85, private_rent: 0 },
    weight: 1,
  },
  newbuild_apartments: {
    id: 'newbuild_apartments', label: 'Recent canal/station-side apartment block (5-6 storeys)', accommodationType: 'purposeBuiltFlats', storeys: 6,
    footprint: { w: 22, d: 11 }, roof: 'flat', material: ['dark_brick', 'cladding_grey', 'render_white'], year: [2014, 2023],
    perFloor: { count: 5, cores: 1 }, floors: [5, 6],
    units: [{ kind: 'flat', bedrooms: { 0: 0.1, 1: 0.45, 2: 0.4, 3: 0.05 }, floorAreaM2: [37, 75] }],
    tenure: { owned_outright: 0.10, mortgage: 0.28, shared_ownership: 0.12, council: 0, housing_assoc: 0.06, private_rent: 0.44 },
    weight: 1,
  },
  // ---------- mixed use ----------
  shop_with_flat: {
    id: 'shop_with_flat', label: 'High-street shop unit (3 storeys), flat above in a minority', accommodationType: 'otherConvertedBuilding', storeys: 3,
    footprint: { w: 5, d: 6 }, roof: 'flat_parapet', material: ['red_brick', 'yellow_stock', 'render_cream'], year: [1885, 1910],
    // Upper floors are a flat (probability) or ancillary/office/storage/vacant: most shop uppers are NOT homes
    upperFlatProb: 0.30,
    units: [{ kind: 'flat', floor: 1, bedrooms: { 1: 0.5, 2: 0.5 }, floorAreaM2: [45, 75] }],
    tenure: { owned_outright: 0.08, mortgage: 0.06, shared_ownership: 0, council: 0, housing_assoc: 0, private_rent: 0.86 },
    weight: 1,
  },
  arch_unit: {
    id: 'arch_unit', label: 'Railway-arch business unit', accommodationType: 'commercialBuilding', storeys: 1,
    footprint: { w: 4, d: 6 }, roof: 'viaduct', material: ['soot_brick'], year: [1860, 1890], units: [], weight: 1,
  },
};

// Calibration -> archetype group mapping used by the generator's quota report
export const ACCOMMODATION_TYPES = ['detached', 'semi', 'terraced', 'purposeBuiltFlats', 'convertedOrSharedHouse', 'otherConvertedBuilding', 'commercialBuilding'];

// Quantised sub-shares of dwellings by archetype used when a block of a given use is filled (generator reads these).
export const TERRACE_MIX = { terrace_2up2down: 0.66, terrace_bay_3bed: 0.2, converted_terrace: 0.08, hmo_house: 0.06 };

// Interior abstraction: people inside are not on the grid; rooms/size only matter for crowding & rent.
export const ROOM_MODEL = {
  occupancyStandard: 'bedroom standard (ONS): 1 bedroom per couple, per adult, per 2 same-sex <10, etc.',
  overcrowdedBelow: 0, // occupancy rating -1 or lower counts as overcrowded (~6-9% in inner cities, estimate)
  rentPerMonthByBedrooms: { 0: 650, 1: 790, 2: 940, 3: 1090, 4: 1350, 5: 1700, 6: 2100 }, // private market, +-15% (calibration.incomeAndRent)
  socialRentFactor: 0.52, // council/HA rent as fraction of market
  housePriceByBedrooms: { 0: 120000, 1: 150000, 2: 190000, 3: 235000, 4: 310000, 5: 400000, 6: 480000 }, // inner-urban non-London, estimate
};

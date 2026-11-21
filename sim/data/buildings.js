// SETTING DATA: building types (label, footprint size, job slots, opening hours). Edit for a new setting.
// Building types. size: 'half' (5x4 slot) | 'wide' (11x4 slot) | 'block' | 'square'. hours = public opening [open, close] (close>24 wraps past midnight)
export const BUILDING_TYPES = {
  house: { label: 'House', size: 'half', jobs: [] },
  farm: { label: 'Farm', size: 'half', jobs: ['farmer', 'farmer', 'laborer', 'laborer', 'laborer'] },
  bakery: { label: 'Bakery', size: 'half', jobs: ['baker', 'baker', 'baker'], hours: [5, 17] },
  smithy: { label: 'Smithy', size: 'half', jobs: ['smith', 'smith'], hours: [8, 17] },
  tavern: { label: 'Tavern', size: 'wide', jobs: ['tavernkeeper', 'server', 'server'], hours: [12, 25] },
  market: { label: 'Market', size: 'wide', jobs: ['merchant', 'merchant', 'merchant'], hours: [7, 18] },
  clinic: { label: 'Clinic', size: 'half', jobs: ['doctor', 'nurse', 'nurse'], hours: [8, 18] },
  school: { label: 'School', size: 'wide', jobs: ['teacher', 'teacher', 'teacher'], hours: [8, 15] },
  temple: { label: 'Temple', size: 'wide', jobs: ['priest', 'laborer', 'laborer'], hours: [6, 21] },
  townhall: { label: 'Town Hall', size: 'wide', jobs: ['mayor', 'clerk', 'clerk', 'clerk'], hours: [9, 17] },
  jail: { label: 'Jail', size: 'half', jobs: ['captain', 'guard', 'guard'] },
  mill: { label: 'Mill', size: 'half', jobs: ['miller', 'miller', 'miller'], hours: [6, 15] },
  inn: { label: 'Inn', size: 'wide', jobs: ['innkeeper', 'laborer', 'laborer'] },
  tailor: { label: 'Tailor', size: 'half', jobs: ['tailor', 'tailor'], hours: [8, 17] },
  carpenter: { label: 'Carpenter', size: 'half', jobs: ['carpenter', 'carpenter', 'carpenter'], hours: [7, 16] },
  park: { label: 'Park', size: 'block', jobs: ['gardener'], open: true, hours: [5, 22] },
  cemetery: { label: 'Cemetery', size: 'block', jobs: ['gravedigger'], open: true, hours: [6, 20] },
  square: { label: 'Town Square', size: 'square', jobs: [], open: true },
};

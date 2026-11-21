// SETTING DATA: jobs (wage per worked day, primary skill, shift hours, service = works rest days). Edit for a new setting.
export const JOBS = {
  farmer: { wage: 11, skill: 'farming', shift: [6, 15] }, laborer: { wage: 8, skill: 'farming', shift: [7, 16] },
  baker: { wage: 12, skill: 'cooking', shift: [4.5, 12.5] }, smith: { wage: 14, skill: 'smithing', shift: [8, 17] },
  tavernkeeper: { wage: 13, skill: 'cooking', shift: [12, 24], service: true }, server: { wage: 8, skill: 'trade', shift: [16, 24], service: true },
  merchant: { wage: 12, skill: 'trade', shift: [8, 17], service: true },
  doctor: { wage: 22, skill: 'medicine', shift: [8, 17], service: true }, nurse: { wage: 12, skill: 'medicine', shift: [8, 17], service: true },
  teacher: { wage: 14, skill: 'teaching', shift: [8, 15] },
  priest: { wage: 12, skill: 'charisma', shift: [7, 17], service: true },
  mayor: { wage: 16, skill: 'scholarship', shift: [9, 17] }, clerk: { wage: 12, skill: 'scholarship', shift: [9, 17] },
  captain: { wage: 15, skill: 'athletics', shift: [8, 17], service: true }, guard: { wage: 12, skill: 'athletics', shift: [8, 17], service: true },
  miller: { wage: 13, skill: 'crafting', shift: [6, 15] }, innkeeper: { wage: 13, skill: 'cooking', shift: [9, 21], service: true },
  tailor: { wage: 12, skill: 'crafting', shift: [8, 17] }, carpenter: { wage: 13, skill: 'crafting', shift: [7, 16] },
  gardener: { wage: 8, skill: 'farming', shift: [8, 15] }, gravedigger: { wage: 8, skill: 'athletics', shift: [8, 14] },
};

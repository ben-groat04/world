// SETTING DATA: season names, rest weekday, festival calendar and festival flavour text. Edit for a new setting.
export const SEASON_NAMES = ['Spring', 'Summer', 'Autumn', 'Winter'];
export const REST_WEEKDAY = 6; // every 7th day is the rest day
export const CAL = [
  { id: 'planting', name: 'the Spring Planting Festival', short: 'Planting Festival', season: 0, dos: 14, startHour: 10, endHour: 21, contest: 'ploughing match', skill: 'farming', prize: 10 },
  { id: 'midsummer', name: 'the Midsummer Fair', short: 'Midsummer Fair', season: 1, dos: 14, startHour: 10, endHour: 23, contest: 'foot race', skill: 'athletics', prize: 14 },
  { id: 'harvest', name: 'the Harvest Feast', short: 'Harvest Feast', season: 2, dos: 21, startHour: 12, endHour: 22, contest: 'best-loaf contest', skill: 'cooking', prize: 12 },
  { id: 'midwinter', name: 'the Midwinter Lights', short: 'Midwinter Lights', season: 3, dos: 14, startHour: 16, endHour: 23, contest: 'lantern-making', skill: 'crafting', prize: 10 },
];
export const OPENERS = {
  planting: ['Seed-bags are blessed and ribbons tied to the plough-horses', 'Garlands go up on the square and the priest blesses the seed corn', 'Children carry green boughs through the lanes'],
  midsummer: ['Stalls crowd the market and a fiddler strikes up beside the fountain', 'The Midsummer Fair fills the square with ribbons, pedlars and the smell of roasting meat', 'Flags and bunting are strung between the lamp-posts'],
  harvest: ['Long tables are carried into the square and loaded with the season\'s bread, cheese and cider', 'A sheaf is carried in procession to the temple before the feasting starts', 'The last wagon of the year rolls in wreathed in barley'],
  midwinter: ['As dusk falls hundreds of lanterns are lit around the fountain', 'Candles flicker in every window and the square glows gold against the snow', 'Lantern-light threads down every street to the square'],
  spontaneous: ['Word spreads and tables are dragged out into the open', 'A fiddler starts up and folk drift in from every lane'],
};

// Larkfield report.   node tools/report.js [--seed 1] [--years 1] [--life-years N] [--personas a,b,c]
//   --years N        sim-years for the perf / material / social sections (default 1)
//   --life-years N   continue the perf world to N years before the 'life' section (steadier demographic rates)
//   --pack larkfield accepted and ignored (Larkfield is the only world)
import { runLarkfieldReport } from './report-larkfield.js';

export function parseArgs(argv) {
  const o = { seed: 1, years: 1, lifeYears: 0, personas: null };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--seed') o.seed = +argv[++i]; else if (a === '--years') o.years = +argv[++i]; else if (a === '--life-years') o.lifeYears = +argv[++i];
    else if (a === '--personas') o.personas = argv[++i]; else if (a === '--pack') i++;
    else throw new Error('unknown option ' + a);
  }
  return o;
}
if (process.argv[1] && process.argv[1].endsWith('report.js')) console.log((await runLarkfieldReport(parseArgs(process.argv.slice(2)))).join('\n'));

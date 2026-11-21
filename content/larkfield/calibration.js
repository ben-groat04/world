// Larkfield calibration: the Larkfield pack re-exports the shared calibration module (kept at sim/data/ until Wave 1 closes).
// Always read targets from here, never hard-code numbers in the pack.
export { default, NATIONAL, PROFILES, getProfile } from '../../sim/data/calibration.js';

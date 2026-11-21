// The slice of the Larkfield pack that the street-graph map generator consumes (sim/map/ never imports content directly).
import * as ARCH from './archetypes.js';
import * as VEN from './venues.js';
import calibration from './calibration.js';
export const mapPack = {
  archetypes: ARCH.BUILDING_ARCHETYPES, TENURES: ARCH.TENURES, TENURE_FROM_CALIBRATION: ARCH.TENURE_FROM_CALIBRATION, LANDLORDS: ARCH.LANDLORDS,
  ROOM_MODEL: ARCH.ROOM_MODEL, TERRACE_MIX: ARCH.TERRACE_MIX,
  venues: { VENUE_TEMPLATES: VEN.VENUE_TEMPLATES, PUBLIC_SPACES: VEN.PUBLIC_SPACES, GATEWAYS: VEN.GATEWAYS },
  calibration,
};
export default mapPack;

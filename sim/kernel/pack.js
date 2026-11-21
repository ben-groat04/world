// Content-pack loader. loadPack('larkfield') imports content/larkfield/index.js (default export = pack object), validates it against schema.js,
// and returns it. 
//   const pack = await loadPack('larkfield');  const world = createWorld({pack, seed: 1})   (see sim/index.js)
import { assertPack, validatePack } from './schema.js';
import { CONTRACT_VERSION } from './types.js';
export async function loadPack(id, opts = {}) {
  const mod = await import(new URL(`../../content/${id}/index.js`, import.meta.url).href);
  const pack = mod.default;
  if (opts.validate !== false) assertPack(pack);
  return pack;
}
export { validatePack, assertPack };

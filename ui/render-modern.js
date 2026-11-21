// Top-down renderer for the Larkfield street-graph map (sim/map). Pure canvas; no sim imports except tile codes. drawMap(ctx, map, opts) paints the whole map.
// opts: {scale=6, labels=true, graph=false, seed}
import { T } from '../sim/map/constants.js';
const GROUND = {
  [T.GRASS]: '#7da35a', [T.ROAD]: '#4a4d52', [T.PAVEMENT]: '#b9b4a8', [T.BUILDING]: '#8a5a48', [T.YARD]: '#a39d92', [T.GARDEN]: '#6f9a52', [T.PARK]: '#6aa04f',
  [T.PATH]: '#cdbf9b', [T.WATER]: '#3f6f8f', [T.RAIL]: '#3a3a3a', [T.WALL]: '#6b5b4f', [T.HARD]: '#8c8f94', [T.PLAY]: '#b0654f', [T.ALLEY]: '#8e8a82',
  [T.PLATFORM]: '#c9c3b5', [T.FARBANK]: '#6d8f4f', [T.CHURCHYARD]: '#799f5b', [T.ALLOTMENT]: '#8f8450', [T.BALLAST]: '#6a6760', [T.PITCH]: '#5f9a4a', [T.FOREC]: '#c0b9ab',
};
const MAT = { red_brick: '#a9523d', yellow_stock: '#c9ad6a', buff_brick: '#c4a77d', brown_brick: '#7b5136', render_cream: '#dcd0b0', pebbledash: '#c7bfae', concrete_panel: '#a7a9a8', dark_brick: '#5b4a44', cladding_grey: '#7d858c', render_white: '#e4e2dc', render_grey: '#9a9da0', soot_brick: '#4e4640' };
const CAT = { retail: '#d9a441', food_drink: '#c8573f', service: '#4f86a8', health: '#4faa86', civic: '#8d6bb0', worship: '#d9d2c3', education: '#e07b3c', business: '#6f7a85', leisure: '#3c9d9b', vacant: '#8a8478' };
function shade(hex, f) { const n = parseInt(hex.slice(1), 16); const c = (s) => Math.max(0, Math.min(255, Math.round(((n >> s) & 255) * f))); return `rgb(${c(16)},${c(8)},${c(0)})`; }
export function drawMap(ctx, M, opts = {}) {
  const S = opts.scale || 6, W = M.w, H = M.h;
  ctx.canvas.width = W * S; ctx.canvas.height = H * S; ctx.imageSmoothingEnabled = false;
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) { const t = M.tiles[y * W + x]; ctx.fillStyle = GROUND[t] || '#f0f'; ctx.fillRect(x * S, y * S, S, S); }
  // railway sleepers / water ripple / road centre-lines for texture
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const t = M.tiles[y * W + x];
    if (t === T.RAIL && ((x + y) % 2 === 0)) { ctx.fillStyle = '#8b8b8b'; ctx.fillRect(x * S, y * S + S / 2 - 1, S, 2); }
    if (t === T.WATER && ((x * 7 + y * 13) % 9 === 0)) { ctx.fillStyle = '#5b8aa8'; ctx.fillRect(x * S, y * S + 2, S, 1); }
    if (t === T.ROAD && ((x + y * 3) % 11 === 0) && M.tiles[y * W + x - 1] === T.ROAD && M.tiles[y * W + x + 1] === T.ROAD && M.tiles[(y - 1) * W + x] === T.ROAD && M.tiles[(y + 1) * W + x] === T.ROAD) { /* sparse marks */ }
  }
  // road centre lines on high street / collectors
  for (const s of M.streets) { if (s.kind !== 'high' && s.kind !== 'collector') continue; const r = s.rect; ctx.fillStyle = '#d8d0a0'; if (r.w >= r.h) { const cy = r.y + Math.floor(r.h / 2); for (let x = r.x; x < r.x + r.w; x += 3) ctx.fillRect(x * S, cy * S - 1, S * 1.5, 2); } else { const cx = r.x + Math.floor(r.w / 2); for (let y = r.y; y < r.y + r.h; y += 3) ctx.fillRect(cx * S - 1, y * S, 2, S * 1.5); } }
  // buildings (roof colour by material or venue category, drop shadow SE, ridge line)
  for (const b of M.buildings) {
    const r = b.rect; const v = b.venueId != null && b.venueId >= 0 ? M.venues[b.venueId] : null;
    let base = MAT[b.material] || '#a07060'; if (b.roof === 'gable' || b.roof === 'hip' || b.roof === 'hip_row') base = shade(base, 0.82); else base = shade(base, 0.95);
    ctx.fillStyle = 'rgba(0,0,0,0.28)'; ctx.fillRect((r.x + 0.5) * S, (r.y + 0.5) * S, r.w * S, r.h * S);
    ctx.fillStyle = base; ctx.fillRect(r.x * S, r.y * S, r.w * S, r.h * S);
    if (b.roof === 'gable' || b.roof === 'hip' || b.roof === 'hip_row') { ctx.fillStyle = 'rgba(0,0,0,0.18)'; if (b.ridge === 'x') ctx.fillRect(r.x * S, (r.y + r.h / 2) * S - 1, r.w * S, 2); else ctx.fillRect((r.x + r.w / 2) * S - 1, r.y * S, 2, r.h * S); }
    else if (b.storeys >= 4) { ctx.strokeStyle = 'rgba(255,255,255,0.25)'; ctx.lineWidth = 1; ctx.strokeRect(r.x * S + 2, r.y * S + 2, r.w * S - 4, r.h * S - 4); }
    if (v && v.category) { const hf = b.facing; ctx.fillStyle = CAT[v.category] || '#fff'; const t = Math.max(3, S * 0.9);
      if (hf === 'N') ctx.fillRect(r.x * S, r.y * S, r.w * S, t); else if (hf === 'S') ctx.fillRect(r.x * S, (r.y + r.h) * S - t, r.w * S, t); else if (hf === 'W') ctx.fillRect(r.x * S, r.y * S, t, r.h * S); else ctx.fillRect((r.x + r.w) * S - t, r.y * S, t, r.h * S); }
    ctx.strokeStyle = 'rgba(0,0,0,0.5)'; ctx.lineWidth = 1; ctx.strokeRect(r.x * S + 0.5, r.y * S + 0.5, r.w * S - 1, r.h * S - 1);
    for (const d of b.doors || []) { ctx.fillStyle = '#f4e9c8'; ctx.fillRect(d.x * S + S * 0.25, d.y * S + S * 0.25, S * 0.5, S * 0.5); }
  }
  // props
  for (const c of M.props.cars) { ctx.fillStyle = ['#c0c4c8', '#2f3a4a', '#a33', '#e8e8e8', '#4a6a8a', '#222'][(c.c | 0) % 6]; ctx.fillRect(c.x * S + 1, c.y * S + 1, c.w * S - 2, c.h * S - 2); }
  for (const t of M.props.trees) { ctx.fillStyle = 'rgba(0,0,0,0.25)'; ctx.beginPath(); ctx.arc((t.x + 0.6) * S, (t.y + 0.6) * S, t.r * S * 0.9, 0, 7); ctx.fill(); ctx.fillStyle = '#3e7a38'; ctx.beginPath(); ctx.arc(t.x * S, t.y * S, t.r * S * 0.9, 0, 7); ctx.fill(); ctx.fillStyle = '#58a04a'; ctx.beginPath(); ctx.arc(t.x * S - 1, t.y * S - 1, t.r * S * 0.5, 0, 7); ctx.fill(); }
  for (const l of M.props.lamps) { ctx.fillStyle = '#f2e6a0'; ctx.fillRect(l.x * S + S / 3, l.y * S + S / 3, S / 3, S / 3); }
  for (const b of M.props.benches) { ctx.fillStyle = '#6b4a2b'; ctx.fillRect(b.x * S, b.y * S, b.w * S, b.h * S); }
  for (const b of M.props.bins) { ctx.fillStyle = '#2d5a3a'; ctx.fillRect(b.x * S + 1, b.y * S + 1, S - 2, S - 2); }
  for (const b of M.props.busStops) { ctx.fillStyle = '#d33'; ctx.fillRect(b.x * S, b.y * S, b.w * S, b.h * S); }
  if (opts.graph && M.graph) { ctx.strokeStyle = 'rgba(255,0,200,0.6)'; ctx.lineWidth = 1; const g = M.graph; for (const e of g.edges) { const a = g.nodes[e.a], b = g.nodes[e.b]; ctx.beginPath(); ctx.moveTo((a.x + .5) * S, (a.y + .5) * S); ctx.lineTo((b.x + .5) * S, (b.y + .5) * S); ctx.stroke(); } }
  if (opts.labels !== false) {
    ctx.font = `bold ${Math.max(9, S + 3)}px system-ui,sans-serif`; ctx.textBaseline = 'middle';
    const lab = (txt, x, y, col = '#fff') => { ctx.lineWidth = 3; ctx.strokeStyle = 'rgba(0,0,0,.65)'; ctx.strokeText(txt, x, y); ctx.fillStyle = col; ctx.fillText(txt, x, y); };
    for (const v of M.venues) { if (v.category === 'business' || v.category === 'vacant' || v.template === 'estate_agent') continue; const r = v.rect; lab(v.name.length > 22 ? v.name.slice(0, 21) + '…' : v.name, r.x * S, (r.y + r.h / 2) * S); }
    for (const s of M.streets) { if (s.kind === 'alley') continue; const r = s.rect; ctx.fillStyle = '#e8e8e8'; const cx = (r.x + r.w / 2) * S, cy = (r.y + r.h / 2) * S; ctx.save(); ctx.translate(cx, cy); if (r.h > r.w) ctx.rotate(-Math.PI / 2); ctx.textAlign = 'center'; ctx.font = `${Math.max(8, S + 1)}px system-ui,sans-serif`; ctx.fillText(s.name, 0, 0); ctx.restore(); }
    for (const a of M.areas) { if (!a.name) continue; ctx.textAlign = 'center'; lab(a.name, (a.rect.x + a.rect.w / 2) * S, (a.rect.y + a.rect.h / 2) * S, '#e8f5d0'); }
    ctx.textAlign = 'left';
  }
}

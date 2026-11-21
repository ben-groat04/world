// Procedural face/bust portraits for Hollowmere. Browser-only ES module, no deps.
// drawPortrait(ctx, person, x, y, size, opts) and portraitDataURL(person, size).
// Everything visual is derived from person.genes (+age, sex, mood, job, health, alive);
// missing values come from a hash of person.id (never Math.random).

const clamp = (v, a = 0, b = 1) => Math.min(b, Math.max(a, v));
const lerp = (a, b, t) => a + (b - a) * t;

// ---------- hashing ----------
function hstr(s) {
  let h = 2166136261 >>> 0;
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); }
  h ^= h >>> 16; h = Math.imul(h, 2246822507); h ^= h >>> 13; h = Math.imul(h, 3266489909); h ^= h >>> 16;
  return h >>> 0;
}
const hu = (id, salt) => hstr(id + '|' + salt) / 4294967296;

// ---------- colour helpers (rgb arrays) ----------
const hex = h => [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16)];
const mix = (a, b, t) => [lerp(a[0], b[0], t), lerp(a[1], b[1], t), lerp(a[2], b[2], t)];
const css = (c, a = 1) => `rgba(${c[0] | 0},${c[1] | 0},${c[2] | 0},${a})`;
const shade = (c, k) => k < 1 ? [c[0] * k, c[1] * k, c[2] * k] : mix(c, [255, 255, 255], k - 1);
function ramp(stops, t) {
  t = clamp(t);
  for (let i = 1; i < stops.length; i++) {
    if (t <= stops[i][0]) {
      const [t0, c0] = stops[i - 1], [t1, c1] = stops[i];
      return mix(hex(c0), hex(c1), (t - t0) / (t1 - t0 || 1));
    }
  }
  return hex(stops[stops.length - 1][1]);
}
const SKIN = [[0, '#fbe1d0'], [.2, '#f2c9a8'], [.38, '#e4ab7c'], [.55, '#c98a58'], [.75, '#9a6240'], [.9, '#6e422b'], [1, '#4a2c1e']];
const HAIR = [[0, '#17110f'], [.2, '#2c1e16'], [.4, '#4b3121'], [.55, '#6e4a2c'], [.7, '#a67b44'], [.82, '#d8b66e'], [.92, '#b4502a'], [1, '#c8662f']];
const EYES = [[0, '#3a2315'], [.3, '#6b4423'], [.5, '#8a6a2f'], [.65, '#5a8040'], [.8, '#4a80b4'], [1, '#8d9eab']];
const WORDS = {
  skin: { pale: .02, fair: .12, light: .15, white: .05, olive: .4, tan: .45, medium: .5, brown: .7, dark: .88, black: .97 },
  hair: { black: .02, brown: .45, chestnut: .5, blond: .82, blonde: .82, red: .95, ginger: .95, auburn: .92, grey: .5, gray: .5 },
  eye: { brown: .15, hazel: .5, green: .65, blue: .8, grey: 1, gray: 1 },
};

// ---------- trait derivation ----------
function gene(genes, id, name, kind) {
  const v = genes[name];
  if (typeof v === 'number' && isFinite(v)) return v > 1 ? clamp(v / 255) : clamp(v);
  if (typeof v === 'string' && v) {
    const k = v.toLowerCase().trim();
    if (kind && WORDS[kind] && k in WORDS[kind]) return WORDS[kind][k];
    if (/^-?\d*\.?\d+$/.test(k)) return clamp(parseFloat(k));
    return hu(k, name);
  }
  return hu(id, name);
}

function jobStyle(job, id, child) {
  const j = String(job || '').toLowerCase();
  const pick = (...c) => hex(c[Math.floor(hu(id, 'cloth') * c.length)]);
  if (child || /child|kid|pupil|student|toddler|baby/.test(j))
    return { kind: 'child', c: pick('#e0675a', '#5aa0d8', '#e8b84a', '#7cc27a', '#b583d6', '#f08fb0'), collar: [250, 245, 235] };
  if (/farm|peasant|shepherd|herd/.test(j)) return { kind: 'farmer', c: hex('#6f8f4e'), collar: hex('#e9dfc4') };
  if (/smith|forge|mason|metal/.test(j)) return { kind: 'smith', c: hex('#7b7f86'), collar: hex('#d9d2c2'), apron: hex('#6a4528') };
  if (/bake|cook|mill/.test(j)) return { kind: 'baker', c: hex('#f1e7cf'), collar: [255, 255, 255] };
  if (/doctor|medic|healer|physician|nurse|apothec/.test(j)) return { kind: 'doctor', c: [248, 248, 250], collar: hex('#4aa6a8') };
  if (/teach|scholar|librar|clerk|scribe|mayor/.test(j)) return { kind: 'teacher', c: hex('#3d5078'), collar: [250, 250, 250] };
  if (/priest|cleric|monk|nun|chaplain|pastor/.test(j)) return { kind: 'priest', c: hex('#2a2a31'), collar: [250, 250, 250] };
  if (/guard|soldier|watch|constable|sheriff|knight/.test(j)) return { kind: 'guard', c: hex('#5c6b80'), collar: hex('#b8453a') };
  if (/merchant|trader|shop|vendor|tailor|banker/.test(j)) return { kind: 'merchant', c: hex('#6b3f80'), collar: hex('#d8b34a') };
  if (/tavern|inn|barkeep|brew|publican/.test(j)) return { kind: 'tavern', c: hex('#9a4a35'), collar: hex('#efe6d2'), apron: [244, 238, 224] };
  if (/carpent|wood|lumber|fisher|miner|labor|work/.test(j)) return { kind: 'worker', c: pick('#8a6b44', '#58728a', '#7a5a5a'), collar: hex('#e5dcc6') };
  return { kind: 'plain', c: pick('#8a6b44', '#58728a', '#7a8a58', '#a0624a', '#5f6f8f', '#8a5f7a'), collar: hex('#ece4d0') };
}

function analyze(p, opts) {
  const id = String(p.id != null ? p.id : ((p.firstName || '') + '_' + (p.lastName || '') || 'anon'));
  const genes = (p.genes && typeof p.genes === 'object') ? p.genes : {};
  const G = (n, k) => gene(genes, id, n, k);
  const sx = String(p.sex || p.gender || '').toLowerCase();
  const female = sx[0] === 'f' ? true : sx[0] === 'm' ? false : hu(id, 'sex') < .5;
  let age = opts.age != null ? opts.age : p.age;
  age = (typeof age === 'number' && isFinite(age)) ? Math.max(0, age) : 30;
  let mood = opts.mood != null ? opts.mood : p.mood;
  mood = (typeof mood === 'number' && isFinite(mood)) ? clamp(mood, -1, 1) : 0;
  const health = (typeof p.health === 'number' && isFinite(p.health)) ? clamp(p.health) : 1;
  const dead = p.alive === false || opts.dead === true;
  const fam = String(p.lastName || p.family || p.familyName || id);
  const famHue = hstr(fam.toLowerCase()) % 360;

  const t = clamp((age - 1) / 17);           // 0 baby .. 1 adult
  const old = clamp((age - 50) / 35);        // elderly factor
  const skinT = G('skinTone', 'skin'), hairT = G('hairColor', 'hair'), eyeT = G('eyeColor', 'eye');
  const build = G('build'), height = G('height'), looks = G('looks');
  const nz = n => hu(id, n);
  const mixg = (a, b, w) => clamp(a * w + b * (1 - w));

  let skin = ramp(SKIN, skinT);
  const pal = clamp((0.55 - health) * 1.6);
  if (pal > 0) skin = mix(skin, [205, 205, 190], pal * .5);

  let hair = ramp(HAIR, hairT);
  const greyOnset = 38 + nz('greyAge') * 22;
  const grey = clamp((age - greyOnset) / 30 + (nz('greyx') - .5) * .15);
  if (grey > 0) hair = mix(hair, hairT > .78 && hairT < .9 ? [225, 215, 190] : [200, 200, 205], clamp(grey * 1.15));

  const sexSalt = female ? 'F' : 'M';
  const styleU = G('hairStyle');
  const T = {
    id, female, age, mood, health, dead, famHue, t, old, pal, skin, hair, grey,
    eye: ramp(EYES, eyeT), eyeDark: eyeT < .3,
    build, height, looks,
    faceW: mixg(build, nz('fw'), .6),
    jaw: mixg(G('jaw'), mixg(build, 1 - looks, .5), .5),
    nose: mixg(G('nose'), height, .6),
    mouthW: G('mouth'), brow: mixg(G('brow'), female ? .25 : .65, .5), ears: G('ears'),
    eyeSz: mixg(G('eyeSize'), looks, .5),
    freckles: G('freckles') > .72 && skinT < .55 ? clamp((G('freckles') - .72) * 3 + (hairT > .88 ? .5 : 0)) : 0,
    beardV: G('beard'), glassesV: G('glasses'), hatV: nz('hat'),
    baldV: G('balding'), styleU, hairVol: .4 + nz('vol') * .6,
    glassSty: nz('gs') < .5 ? 0 : 1,
    job: jobStyle(p.job, id, age < 14),
    sexSalt,
  };
  return T;
}

// ---------- drawing ----------
function headPath(c, cx, cy, rx, ry, jaw) {
  const j = lerp(.45, .85, jaw);
  c.beginPath();
  c.moveTo(cx, cy - ry);
  c.bezierCurveTo(cx + rx * 1.18, cy - ry, cx + rx * 1.02, cy - ry * .15, cx + rx * .99, cy + ry * .1);
  c.bezierCurveTo(cx + rx * .96, cy + ry * .6, cx + rx * j * .75, cy + ry, cx, cy + ry);
  c.bezierCurveTo(cx - rx * j * .75, cy + ry, cx - rx * .96, cy + ry * .6, cx - rx * .99, cy + ry * .1);
  c.bezierCurveTo(cx - rx * 1.02, cy - ry * .15, cx - rx * 1.18, cy - ry, cx, cy - ry);
  c.closePath();
}

function render(c, T, opts) {
  const { skin, hair, t } = T;
  const cx = 50;
  const adultish = T.age >= 16;
  // geometry
  const rx = lerp(23, 19.5, t) * (.92 + .2 * T.faceW) * (T.female ? .96 : 1);
  const ry = lerp(22.5, 25, t) * (.96 + .08 * T.height);
  const cy = lerp(50, 43, t);
  const eyeY = cy + ry * lerp(.14, -.04, t);
  const eyeDx = rx * lerp(.46, .44, t);
  const eyeR = lerp(4.7, 3.3, t) * (.9 + .25 * T.eyeSz);
  const noseY = eyeY + ry * lerp(.28, .36, t);
  const mouthY = cy + ry * lerp(.55, .62, t);
  const browY = eyeY - eyeR - lerp(3.2, 3.6, t);
  const shY = lerp(86, 77, t) + (.5 - T.height) * 4;
  const shW = lerp(27, 38, t) * (.88 + .28 * T.build) * (T.female ? .93 : 1);
  const neckW = lerp(7, 9.5, t) * (.9 + .3 * T.build) * (T.female ? .88 : 1);
  const smile = clamp(T.mood * 1.15, -1, 1);

  // skin fills
  const skinG = c.createRadialGradient(cx - rx * .35, cy - ry * .4, 2, cx, cy, ry * 1.25);
  skinG.addColorStop(0, css(shade(skin, 1.07)));
  skinG.addColorStop(.7, css(skin));
  skinG.addColorStop(1, css(shade(skin, .9)));
  const skinDark = shade(mix(skin, [120, 40, 30], .25), .78);
  const blush = mix(skin, [230, 90, 90], .5);

  // ---- background ----
  const bgL = T.dead ? 60 : 80, bgS = T.dead ? 12 : 42;
  const bgG = c.createRadialGradient(35, 28, 4, 50, 50, 78);
  bgG.addColorStop(0, `hsl(${T.famHue},${bgS}%,${bgL + 8}%)`);
  bgG.addColorStop(1, `hsl(${T.famHue},${bgS + 8}%,${bgL - 12}%)`);
  c.save();
  const shape = opts.shape || 'circle';
  c.beginPath();
  if (shape === 'circle') c.arc(50, 50, 49, 0, Math.PI * 2);
  else if (shape === 'square') c.rect(0, 0, 100, 100);
  else if (c.roundRect) c.roundRect(1, 1, 98, 98, 20);
  else c.rect(1, 1, 98, 98);
  c.clip();
  if (opts.bg !== false) { c.fillStyle = bgG; c.fillRect(0, 0, 100, 100); }
  if (opts.bg !== false) {   // subtle family pattern band
    c.fillStyle = `hsla(${T.famHue},${bgS}%,${bgL - 20}%,.12)`;
    const k = T.famHue % 3;
    for (let i = 0; i < 6; i++) { c.beginPath(); if (k === 0) c.arc(10 + i * 18, 92, 9, 0, 7); else if (k === 1) c.rect(i * 20 - 6, 0, 8, 100); else { c.moveTo(i * 20, 0); c.lineTo(i * 20 + 10, 0); c.lineTo(i * 20 - 30, 100); c.lineTo(i * 20 - 40, 100); } c.fill(); }
  }

  // ---- hair (back layer) ----
  const style = hairStyleFor(T);
  const hairG = c.createLinearGradient(0, cy - ry - 6, 0, cy + ry);
  hairG.addColorStop(0, css(shade(hair, 1.18)));
  hairG.addColorStop(.5, css(hair));
  hairG.addColorStop(1, css(shade(hair, .8)));
  const hairAmt = T.age < 2 ? .25 : 1;
  const vol = (2.5 + 4 * T.hairVol) * lerp(.7, 1, t);
  const hairy = style !== 'bald';
  c.fillStyle = hairG;
  if (hairy && hairAmt === 1) backHair(c, style, cx, cy, rx, ry, vol, shY, T);

  // ---- neck, shoulders, clothing ----
  const J = T.job;
  // neck
  c.fillStyle = css(shade(skin, .93));
  c.beginPath();
  c.moveTo(cx - neckW, cy + ry * .5); c.lineTo(cx - neckW, shY + 4); c.lineTo(cx + neckW, shY + 4); c.lineTo(cx + neckW, cy + ry * .5);
  c.fill();
  // clothing body
  const cl = J.c, clG = c.createLinearGradient(0, shY, 0, 100);
  clG.addColorStop(0, css(shade(cl, 1.08))); clG.addColorStop(1, css(shade(cl, .82)));
  c.fillStyle = clG;
  c.beginPath();
  c.moveTo(cx - shW - 14, 104);
  c.lineTo(cx - shW - 8, shY + 14);
  c.bezierCurveTo(cx - shW, shY + 3, cx - neckW * 1.6, shY - 1, cx - neckW - 1, shY - 1);
  c.lineTo(cx + neckW + 1, shY - 1);
  c.bezierCurveTo(cx + neckW * 1.6, shY - 1, cx + shW, shY + 3, cx + shW + 8, shY + 14);
  c.lineTo(cx + shW + 14, 104);
  c.closePath(); c.fill();
  drawClothingDetail(c, J, cx, shY, shW, neckW, skin, T);
  // neck shadow under chin
  c.fillStyle = css(shade(skin, .72), .5);
  c.beginPath(); c.ellipse(cx, cy + ry + 1, rx * .62, 5.5, 0, 0, Math.PI); c.fill();

  // ---- ears ----
  const earY = eyeY + ry * .22, earS = lerp(3.8, 3.6, t) * (.85 + .4 * T.ears);
  for (const s of [-1, 1]) {
    c.fillStyle = css(shade(skin, .96));
    c.beginPath(); c.ellipse(cx + s * rx * .98, earY, earS * .8, earS * 1.2, 0, 0, 7); c.fill();
    c.fillStyle = css(skinDark, .35);
    c.beginPath(); c.ellipse(cx + s * rx * 1.0, earY, earS * .4, earS * .7, 0, 0, 7); c.fill();
  }

  // ---- head ----
  headPath(c, cx, cy, rx, ry, T.jaw);
  c.fillStyle = skinG; c.fill();
  c.save(); headPath(c, cx, cy, rx, ry, T.jaw); c.clip();
  // side shading
  const sh = c.createLinearGradient(cx - rx, 0, cx + rx, 0);
  sh.addColorStop(0, css(skinDark, .0)); sh.addColorStop(.75, css(skinDark, 0)); sh.addColorStop(1, css(skinDark, .22));
  c.fillStyle = sh; c.fillRect(cx - rx - 2, cy - ry, rx * 2 + 4, ry * 2 + 2);
  // cheeks blush
  const blushA = (.28 + .2 * Math.max(0, smile)) * (1 - T.pal);
  for (const s of [-1, 1]) {
    c.fillStyle = css(blush, blushA);
    c.beginPath(); c.ellipse(cx + s * rx * .55, noseY + ry * .1, rx * .24, ry * .13, 0, 0, 7); c.fill();
  }
  // forehead soft highlight
  c.fillStyle = 'rgba(255,255,255,.1)';
  c.beginPath(); c.ellipse(cx - rx * .1, cy - ry * .45, rx * .45, ry * .2, 0, 0, 7); c.fill();
  // freckles
  if (T.freckles > 0) {
    c.fillStyle = css(mix(skin, [140, 70, 30], .6), .45 * T.freckles + .15);
    const n = 14 + (T.freckles * 14 | 0);
    for (let i = 0; i < n; i++) {
      const u = hu(T.id, 'fr' + i), v = hu(T.id, 'fv' + i), sd = i % 2 ? 1 : -1;
      const fx = cx + sd * (1.5 + u * rx * .62), fy = noseY - 3 + v * 8;
      c.beginPath(); c.arc(fx, fy, .55 + (u * v) * .5, 0, 7); c.fill();
    }
  }
  // wrinkles / bags
  if (T.old > 0 || T.pal > .1 || T.age > 35) {
    const w = Math.max(clamp((T.age - 30) / 50) * .6, T.old);
    c.strokeStyle = css(skinDark, .35 * w + .02); c.lineWidth = .7; c.lineCap = 'round';
    if (T.age > 28) for (let i = 0; i < (T.old > .3 ? 3 : 1 + (T.age > 40 ? 1 : 0)); i++) {
      const y = cy - ry * .62 + i * 3.2;
      c.beginPath(); c.moveTo(cx - rx * .45, y); c.quadraticCurveTo(cx, y - 1.4, cx + rx * .45, y); c.stroke();
    }
    for (const s of [-1, 1]) {
      if (T.old > .05) {
        for (let k = -1; k <= 1; k++) { c.beginPath(); c.moveTo(cx + s * (eyeDx + eyeR + 1.5), eyeY + k * 1.8); c.lineTo(cx + s * (eyeDx + eyeR + 5), eyeY + k * 3); c.stroke(); }
        c.beginPath(); c.moveTo(cx + s * 4.5, noseY + 1); c.quadraticCurveTo(cx + s * (rx * .5), mouthY - 3, cx + s * (rx * .4), mouthY + 2); c.stroke();
      }
      if (T.pal > .1 || T.old > .4) {
        c.strokeStyle = css([110, 80, 110], .25 + T.pal * .4); c.lineWidth = 1.3;
        c.beginPath(); c.arc(cx + s * eyeDx, eyeY + eyeR * .9, eyeR * .9, .15 * Math.PI, .85 * Math.PI); c.stroke();
        c.strokeStyle = css(skinDark, .35 * w); c.lineWidth = .7;
      }
    }
  }
  c.restore();

  // ---- nose ----
  const nw = lerp(1.8, 2.6, t) + T.nose * 2.4;
  c.lineCap = 'round'; c.lineJoin = 'round';
  c.fillStyle = css(skinDark, .22);
  c.beginPath(); c.ellipse(cx + 1, noseY + 1.3, nw + .8, 1.8, 0, 0, 7); c.fill();
  c.strokeStyle = css(skinDark, .5); c.lineWidth = 1.1;
  c.beginPath(); c.moveTo(cx - nw, noseY); c.quadraticCurveTo(cx - nw * .3, noseY + 2.6, cx, noseY + 1.7); c.quadraticCurveTo(cx + nw * .3, noseY + 2.6, cx + nw, noseY); c.stroke();
  c.strokeStyle = css(skinDark, .22); c.lineWidth = 1;
  c.beginPath(); c.moveTo(cx - 1.2, noseY - 6 - T.nose * 2); c.quadraticCurveTo(cx - nw * .8, noseY - 2, cx - nw * .9, noseY - .2); c.stroke();
  c.fillStyle = css(skinDark, .7);
  c.beginPath(); c.ellipse(cx - nw * .55, noseY + 1.6, .6, .45, 0, 0, 7); c.ellipse(cx + nw * .55, noseY + 1.6, .6, .45, 0, 0, 7); c.fill();

  // ---- eyes ----
  const open = T.dead ? 0 : clamp(1 - .2 * Math.max(0, smile) - .12 * Math.max(0, -smile) - .15 * T.old - .2 * T.pal);
  for (const s of [-1, 1]) {
    const ex = cx + s * eyeDx;
    if (open <= .02) {
      c.strokeStyle = css(shade(skin, .45), .9); c.lineWidth = 1.4;
      c.beginPath(); c.moveTo(ex - eyeR, eyeY); c.quadraticCurveTo(ex, eyeY + 2.3, ex + eyeR, eyeY); c.stroke();
      continue;
    }
    const eh = eyeR * .86 * (.55 + .45 * open);
    c.save();
    c.beginPath(); c.ellipse(ex, eyeY, eyeR, eh, 0, 0, 7); c.clip();
    c.fillStyle = css(mix([250, 248, 244], skin, .1 + T.pal * .15)); c.fillRect(ex - eyeR, eyeY - eh, eyeR * 2, eh * 2);
    const ir = Math.min(eh * 1.02, eyeR * .62) * (T.t < .5 ? 1.12 : 1);
    const ig = c.createRadialGradient(ex, eyeY - ir * .3, ir * .2, ex, eyeY, ir);
    ig.addColorStop(0, css(shade(T.eye, 1.25))); ig.addColorStop(1, css(shade(T.eye, .7)));
    c.fillStyle = ig; c.beginPath(); c.arc(ex + s * -.2, eyeY + .15, ir, 0, 7); c.fill();
    c.fillStyle = '#16100e'; c.beginPath(); c.arc(ex - .2 * s, eyeY + .15, ir * .48, 0, 7); c.fill();
    c.fillStyle = 'rgba(255,255,255,.92)'; c.beginPath(); c.arc(ex - ir * .35, eyeY - ir * .35, ir * .26, 0, 7); c.fill();
    c.restore();
    // upper lid + lashes
    c.strokeStyle = css(shade(mix(hair, [30, 20, 20], .5), .6), .95); c.lineWidth = T.female ? 1.35 : 1.05;
    c.beginPath(); c.ellipse(ex, eyeY, eyeR, eh, 0, Math.PI * 1.04, Math.PI * 1.96); c.stroke();
    if (T.female && adultish) {
      c.lineWidth = .9; c.beginPath(); c.moveTo(ex + s * eyeR, eyeY - .5); c.lineTo(ex + s * (eyeR + 1.7), eyeY - 1.8); c.stroke();
    }
    // lower lid hint
    c.strokeStyle = css(skinDark, .3); c.lineWidth = .6;
    c.beginPath(); c.ellipse(ex, eyeY, eyeR, eh, 0, .1 * Math.PI, .9 * Math.PI); c.stroke();
  }

  // ---- eyebrows ----
  const bt = lerp(1.5, 1.2, t) + T.brow * 1.3 - (T.female ? .2 : 0);
  const bcol = css(shade(mix(hair, T.grey > .5 ? [150, 150, 150] : hair, .4), .75));
  c.strokeStyle = bcol; c.lineWidth = bt;
  for (const s of [-1, 1]) {
    const inX = cx + s * (eyeDx - eyeR * .8), outX = cx + s * (eyeDx + eyeR * 1.1);
    const inY = browY + (-smile) * 1.6 * (smile < 0 ? 1.2 : -.5) + (smile < 0 ? -smile * 1.8 : 0) - 0;
    const outY = browY + (smile < 0 ? smile * 1.5 + 0 : -smile * .8) + (T.female ? -.4 : 0);
    const arch = T.female ? 2.2 : 1.2;
    c.beginPath(); c.moveTo(inX, inY); c.quadraticCurveTo((inX + outX) / 2, Math.min(inY, outY) - arch, outX, outY + .6); c.stroke();
  }

  // ---- beard & mustache (under mouth) ----
  const bs = beardStyle(T);
  const beardCol = hair;
  if (bs === 'stubble') {
    c.save(); headPath(c, cx, cy, rx, ry, T.jaw); c.clip();
    c.fillStyle = css(beardCol, .3 + .1 * T.hairVol);
    beardShape(c, cx, cy, rx, ry, mouthY, 0); c.fill(); c.restore();
  } else if (bs === 'full' || bs === 'goatee') {
    c.fillStyle = css(shade(beardCol, .95));
    beardShape(c, cx, cy, rx, ry, mouthY, bs === 'goatee' ? 2 : 1); c.fill();
    c.fillStyle = css(mix(skin, [200, 100, 90], .35), .9);
    c.beginPath(); c.ellipse(cx, mouthY + .6, rx * .22 * (.8 + .4 * T.mouthW) + 1, 2.4 + Math.max(0, smile) * 1.2, 0, 0, 7); c.fill();
  }

  // ---- mouth ----
  const mw = rx * (.3 + .1 * T.mouthW) + 1.5 * t;
  const cornerY = mouthY - smile * 2.1, midY = mouthY + smile * 3.2 + (smile < 0 ? 0 : 0);
  const lip = T.female && adultish ? mix(skin, [200, 60, 80], .6) : shade(mix(skin, [190, 90, 85], .45), .88);
  if (smile > .55) {
    c.fillStyle = '#4a1d1d';
    c.beginPath(); c.moveTo(cx - mw, cornerY); c.quadraticCurveTo(cx, midY - 1.2, cx + mw, cornerY);
    c.quadraticCurveTo(cx, mouthY + 2 + smile * 5.8, cx - mw, cornerY); c.fill();
    c.save(); c.clip(); c.fillStyle = '#fbf8f2';
    c.fillRect(cx - mw, cornerY - 1, mw * 2, (mouthY - cornerY) + 3.6); c.restore();
    c.strokeStyle = css(shade(lip, .7)); c.lineWidth = 1.2;
    c.beginPath(); c.moveTo(cx - mw, cornerY); c.quadraticCurveTo(cx, midY - 1.2, cx + mw, cornerY); c.stroke();
  } else {
    if (!(T.female && adultish)) { c.strokeStyle = css(shade(lip, .72)); c.lineWidth = 1.5; }
    else { c.strokeStyle = css(shade(lip, .85)); c.lineWidth = 2.3; }
    c.beginPath(); c.moveTo(cx - mw, cornerY); c.quadraticCurveTo(cx, midY, cx + mw, cornerY); c.stroke();
    // lower lip
    c.fillStyle = css(lip, smile < -.1 ? .35 : .6);
    c.beginPath(); c.ellipse(cx, mouthY + 2.8 - Math.max(0, -smile) * 1.2, mw * .5, 1.5, 0, 0, 7); c.fill();
  }
  if (bs === 'mustache' || bs === 'full' || bs === 'goatee') {
    c.fillStyle = css(shade(beardCol, .95));
    c.beginPath(); c.moveTo(cx, noseY + 3.6);
    c.bezierCurveTo(cx + mw * .7, noseY + 2.4, cx + mw * 1.25, mouthY - 1.8, cx + mw * 1.15, mouthY + .6);
    c.bezierCurveTo(cx + mw * .6, mouthY - 2.2, cx + mw * .2, mouthY - 2.8, cx, mouthY - 2.4);
    c.bezierCurveTo(cx - mw * .2, mouthY - 2.8, cx - mw * .6, mouthY - 2.2, cx - mw * 1.15, mouthY + .6);
    c.bezierCurveTo(cx - mw * 1.25, mouthY - 1.8, cx - mw * .7, noseY + 2.4, cx, noseY + 3.6);
    c.fill();
  }
  // smile dimples
  if (smile > .3) { c.strokeStyle = css(skinDark, .4); c.lineWidth = .8; for (const s of [-1, 1]) { c.beginPath(); c.arc(cx + s * (mw + 1.8), mouthY - smile * 1.6, 1.8, s > 0 ? -1.2 : Math.PI - .4 - 1.0 + 0.2, s > 0 ? 1.2 : Math.PI + 1.2 - 0.2 + .2); c.stroke(); } }

  // ---- hair (front layer) ----
  if (hairy) {
    c.fillStyle = hairG;
    if (hairAmt === 1) frontHair(c, style, cx, cy, rx, ry, vol, T, skinG, T.jaw);
    else { // baby wisps
      c.strokeStyle = css(hair, .8); c.lineWidth = 1.3;
      c.beginPath(); c.moveTo(cx - 4, cy - ry + .5); c.quadraticCurveTo(cx - 1, cy - ry - 4, cx + 4, cy - ry + 1); c.stroke();
      c.beginPath(); c.moveTo(cx - 1, cy - ry + .3); c.quadraticCurveTo(cx + 3, cy - ry - 3, cx + 7, cy - ry + 2); c.stroke();
    }
  } else if (adultish) { // bald: fringe on sides
    c.fillStyle = hairG; sideFringe(c, cx, cy, rx, ry, eyeY);
  }

  // ---- hat ----
  if (opts.hats !== false && adultish) drawHat(c, J, T, cx, cy, rx, ry);

  // ---- glasses ----
  if (glassesFor(T)) {
    c.strokeStyle = T.glassSty ? '#9a7a3a' : '#2c2a2e'; c.lineWidth = 1.1;
    c.fillStyle = 'rgba(190,225,245,.2)';
    for (const s of [-1, 1]) {
      const ex = cx + s * eyeDx, gr = eyeR * 1.75;
      c.beginPath();
      if (T.glassSty) { if (c.roundRect) c.roundRect(ex - gr, eyeY - gr * .75, gr * 2, gr * 1.5, 2.2); else c.rect(ex - gr, eyeY - gr * .75, gr * 2, gr * 1.5); }
      else c.arc(ex, eyeY, gr * .95, 0, 7);
      c.fill(); c.stroke();
      c.beginPath(); c.moveTo(ex + s * gr, eyeY - .5); c.lineTo(cx + s * (rx * .99), eyeY - .2); c.stroke();
    }
    c.beginPath(); c.moveTo(cx - eyeDx + eyeR * 1.75, eyeY - .3); c.quadraticCurveTo(cx, eyeY - 2.2, cx + eyeDx - eyeR * 1.75, eyeY - .3); c.stroke();
  }
  c.restore(); // background clip

  // ring
  if (shape !== 'none' && opts.border !== false) {
    c.strokeStyle = `hsla(${T.famHue},${bgS + 10}%,${bgL - 28}%,.75)`; c.lineWidth = 2;
    c.beginPath();
    if (shape === 'circle') c.arc(50, 50, 49, 0, 7);
    else if (shape === 'square') c.rect(1, 1, 98, 98);
    else if (c.roundRect) c.roundRect(1, 1, 98, 98, 20); else c.rect(1, 1, 98, 98);
    c.stroke();
  }
}

function glassesFor(T) {
  if (T.age < 8) return false;
  const p = .09 + clamp((T.age - 40) / 40) * .35 + (T.job.kind === 'teacher' ? .3 : 0) + (T.job.kind === 'doctor' ? .15 : 0);
  return T.glassesV < p;
}
function beardStyle(T) {
  if (T.female || T.age < 17) return 'none';
  const v = T.beardV, ag = T.age < 21 ? .1 : 0;
  if (v < .5 + ag) return 'none';
  if (v < .68) return 'stubble';
  if (v < .8) return 'mustache';
  if (v < .94) return 'full';
  return 'goatee';
}
function beardShape(c, cx, cy, rx, ry, my, mode) {
  c.beginPath();
  const top = mode === 0 ? cy + ry * .25 : cy + ry * .12;
  c.moveTo(cx - rx * 1.0, top);
  c.bezierCurveTo(cx - rx * 1.02, cy + ry * .75, cx - rx * .55, cy + ry * 1.16, cx, cy + ry * 1.13);
  c.bezierCurveTo(cx + rx * .55, cy + ry * 1.16, cx + rx * 1.02, cy + ry * .75, cx + rx * 1.0, top);
  if (mode === 2) { // goatee: only chin
    c.closePath(); return;
  }
  c.lineTo(cx + rx * .8, top + ry * .12);
  c.quadraticCurveTo(cx + rx * .5, cy + ry * .38, cx + rx * .42, my - 3);
  c.quadraticCurveTo(cx, my - 5.5, cx - rx * .42, my - 3);
  c.quadraticCurveTo(cx - rx * .5, cy + ry * .38, cx - rx * .8, top + ry * .12);
  c.closePath();
}

function hairStyleFor(T) {
  const u = T.styleU;
  if (T.age < 2) return 'bald';
  if (T.female) {
    const list = T.age < 14 ? ['pigtails', 'long', 'bob', 'bangs', 'curly'] : ['long', 'bob', 'bun', 'ponytail', 'curly', 'bangs', 'long', 'pixie'];
    const s = list[Math.floor(u * list.length)];
    return (T.age > 70 && s === 'long') ? 'bun' : s;
  }
  if (T.age >= 30) { // male pattern baldness
    const bp = clamp((T.age - 28) / 40) * .8 + .05;
    if (T.baldV < bp * .6) return 'bald';
  }
  const list = T.age < 14 ? ['crop', 'side', 'curly', 'buzz'] : ['crop', 'side', 'buzz', 'curly', 'shaggy', 'side'];
  return list[Math.floor(u * list.length)];
}

function backHair(c, st, cx, cy, rx, ry, vol, shY, T) {
  const top = cy - ry - vol;
  const blob = () => { c.beginPath(); c.ellipse(cx, cy - ry * .15, rx + vol * .9, ry + vol * .9, 0, 0, 7); c.fill(); };
  if (st === 'long' || st === 'bangs') {
    blob();
    c.beginPath(); c.moveTo(cx - rx - vol * .9, cy - ry * .1);
    c.bezierCurveTo(cx - rx - vol - 3, cy + ry * 1.1, cx - rx - vol * .5, shY + 8, cx - rx - vol * .2, shY + 14);
    c.lineTo(cx + rx + vol * .2, shY + 14);
    c.bezierCurveTo(cx + rx + vol * .5, shY + 8, cx + rx + vol + 3, cy + ry * 1.1, cx + rx + vol * .9, cy - ry * .1);
    c.fill();
  } else if (st === 'bob') {
    blob();
    c.beginPath(); c.moveTo(cx - rx - vol, cy - ry * .1);
    c.bezierCurveTo(cx - rx - vol - 2, cy + ry * .9, cx - rx - 1, cy + ry * 1.1, cx - rx * .6, cy + ry * 1.05);
    c.lineTo(cx + rx * .6, cy + ry * 1.05);
    c.bezierCurveTo(cx + rx + 1, cy + ry * 1.1, cx + rx + vol + 2, cy + ry * .9, cx + rx + vol, cy - ry * .1);
    c.fill();
  } else if (st === 'bun') {
    blob(); c.beginPath(); c.arc(cx, top - 3, rx * .38, 0, 7); c.fill();
  } else if (st === 'ponytail') {
    blob();
    c.beginPath(); c.moveTo(cx + rx * .6, cy - ry * .6);
    c.bezierCurveTo(cx + rx + 14, cy - ry * .7, cx + rx + 14, cy + ry * .9, cx + rx + 5, cy + ry * 1.2);
    c.bezierCurveTo(cx + rx + 6, cy + ry * .5, cx + rx + 2, cy, cx + rx * .6, cy - ry * .2); c.fill();
  } else if (st === 'pigtails') {
    blob();
    for (const s of [-1, 1]) { c.beginPath(); c.ellipse(cx + s * (rx + 5), cy + ry * .35, 5, 9, s * .25, 0, 7); c.fill(); }
  } else if (st === 'curly') {
    const n = T.female ? 11 : 9;
    for (let i = 0; i < n; i++) {
      const a = Math.PI * (1.0 + i / (n - 1) * 1.0) + 0; // upper half arc
      const R = rx + vol * .7;
      c.beginPath(); c.arc(cx + Math.cos(a) * R, cy - ry * .1 + Math.sin(a) * (ry + vol * .7), 5.6 + T.hairVol * 1.6, 0, 7); c.fill();
    }
    if (T.female) for (const s of [-1, 1]) for (let k = 0; k < 3; k++) { c.beginPath(); c.arc(cx + s * (rx + vol * .8 + (k % 2)), cy + ry * (.0 + k * .35), 5.4, 0, 7); c.fill(); }
    blob();
  } else if (st === 'shaggy') {
    blob();
    for (const s of [-1, 1]) { c.beginPath(); c.ellipse(cx + s * (rx + 1), cy + ry * .15, vol + 2.2, ry * .6, s * .1, 0, 7); c.fill(); }
  } else if (st === 'pixie' || st === 'side' || st === 'crop') {
    c.beginPath(); c.ellipse(cx, cy - ry * .2, rx + vol * .8, ry + vol * .5, 0, 0, 7); c.fill();
  } else if (st === 'buzz') { /* nothing */ }
}

function frontHair(c, st, cx, cy, rx, ry, vol, T, skinG, jaw) {
  const top = cy - ry - vol * (st === 'buzz' ? .2 : 1);
  const L = cx - rx * 1.0, R = cx + rx * 1.0;
  c.save();
  c.beginPath();
  c.moveTo(L - vol * .5, cy - ry * .05);
  c.bezierCurveTo(L - vol * 1.2, cy - ry * 1.05, cx - rx * .7, top - 1, cx, top);
  c.bezierCurveTo(cx + rx * .7, top - 1, R + vol * 1.2, cy - ry * 1.05, R + vol * .5, cy - ry * .05);
  const hy = cy - ry; // top of the face
  if (st === 'long' || st === 'bun' || st === 'ponytail' || st === 'pigtails' || st === 'bob') {
    // centre/side part with curtains
    const px = cx + (st === 'bob' ? 0 : -4), py = hy + ry * .22;
    c.lineTo(R - 1, cy + ry * (st === 'bob' ? .15 : .25));
    c.bezierCurveTo(R - 1, cy - ry * .2, cx + rx * .7, hy + ry * .55, px + 2, py);
    c.bezierCurveTo(cx - rx * .5, hy + ry * .5, L + 1, cy - ry * .25, L + 1, cy + ry * (st === 'bob' ? .15 : .25));
  } else if (st === 'bangs') {
    c.lineTo(R - 1, cy + ry * .1);
    c.quadraticCurveTo(R - 1, cy - ry * .15, cx + rx * .85, cy - ry * .3);
    c.quadraticCurveTo(cx, cy - ry * .05, cx - rx * .85, cy - ry * .3);
    c.quadraticCurveTo(L + 1, cy - ry * .15, L + 1, cy + ry * .1);
  } else if (st === 'pixie') {
    c.lineTo(R - 1, cy - ry * .1);
    c.quadraticCurveTo(cx + rx * .6, cy - ry * .45, cx - rx * .05, cy - ry * .3);
    c.quadraticCurveTo(cx - rx * .8, cy - ry * .35, L + 1, cy - ry * .1);
  } else if (st === 'side') {
    c.lineTo(R - 1, cy - ry * .05);
    c.quadraticCurveTo(cx + rx * .9, cy - ry * .55, cx + rx * .1, cy - ry * .58);
    c.quadraticCurveTo(cx - rx * .7, cy - ry * .2, cx - rx * .98, cy - ry * .2);
    c.lineTo(L + 1, cy - ry * .05);
  } else if (st === 'curly') {
    c.lineTo(R - 1, cy - ry * .15);
    c.quadraticCurveTo(cx + rx * .6, cy - ry * .6, cx, cy - ry * .56);
    c.quadraticCurveTo(cx - rx * .6, cy - ry * .6, L + 1, cy - ry * .15);
  } else if (st === 'shaggy') {
    c.lineTo(R - 1, cy + ry * .1);
    c.quadraticCurveTo(cx + rx * .9, cy - ry * .45, cx + rx * .4, cy - ry * .4);
    c.lineTo(cx + rx * .25, cy - ry * .22); c.lineTo(cx, cy - ry * .45); c.lineTo(cx - rx * .25, cy - ry * .2); c.lineTo(cx - rx * .45, cy - ry * .45);
    c.quadraticCurveTo(cx - rx * .9, cy - ry * .45, L + 1, cy + ry * .1);
  } else if (st === 'buzz') {
    c.lineTo(R - 1, cy - ry * .15);
    c.quadraticCurveTo(cx, cy - ry * .72, L + 1, cy - ry * .15);
  } else { // crop
    c.lineTo(R - 1, cy - ry * .1);
    c.quadraticCurveTo(cx + rx * .8, cy - ry * .56, cx, cy - ry * .6);
    c.quadraticCurveTo(cx - rx * .8, cy - ry * .56, L + 1, cy - ry * .1);
  }
  c.closePath();
  if (st === 'buzz') c.globalAlpha = .75;
  c.fill();
  c.globalAlpha = 1;
  if (st === 'curly') {
    for (let i = 0; i < 7; i++) { const a = Math.PI * (1.08 + i / 6 * .84); c.beginPath(); c.arc(cx + Math.cos(a) * (rx * .85), cy - ry * .15 + Math.sin(a) * ry * .95, 5 + T.hairVol * 1.5, 0, 7); c.fill(); }
  }
  // highlight
  c.strokeStyle = 'rgba(255,255,255,.18)'; c.lineWidth = 1.6; c.lineCap = 'round';
  c.beginPath(); c.moveTo(cx - rx * .55, cy - ry * .78); c.quadraticCurveTo(cx - rx * .15, cy - ry - vol * .6, cx + rx * .35, cy - ry - vol * .55); c.stroke();
  c.restore();
  // balding thinning: handled by choosing 'bald'
}
function sideFringe(c, cx, cy, rx, ry, eyeY) {
  for (const s of [-1, 1]) {
    c.beginPath();
    c.moveTo(cx + s * (rx * .99), eyeY - 6); c.quadraticCurveTo(cx + s * (rx * 1.15), cy - ry * .35, cx + s * (rx * .8), cy - ry * .6);
    c.quadraticCurveTo(cx + s * (rx * .95), cy - ry * .2, cx + s * (rx * .88), eyeY - 5); c.fill();
  }
}

function drawClothingDetail(c, J, cx, shY, shW, neckW, skin, T) {
  const neckline = (depth, wide, col) => {
    c.fillStyle = css(shade(skin, .95));
    c.beginPath(); c.moveTo(cx - wide, shY - 1); c.quadraticCurveTo(cx, shY + depth * 1.6, cx + wide, shY - 1); c.fill();
    if (col) { c.strokeStyle = css(col); c.lineWidth = 1.8; c.beginPath(); c.moveTo(cx - wide, shY - 1); c.quadraticCurveTo(cx, shY + depth * 1.6, cx + wide, shY - 1); c.stroke(); }
  };
  const collarTri = (col, wide, depth) => {
    c.fillStyle = css(col);
    for (const s of [-1, 1]) { c.beginPath(); c.moveTo(cx + s * neckW * .7, shY - 2); c.lineTo(cx + s * (neckW + wide), shY + 2); c.lineTo(cx + s * 1, shY + depth); c.closePath(); c.fill(); }
    c.fillStyle = css(shade(skin, .93)); c.beginPath(); c.moveTo(cx - neckW * .7, shY - 1.5); c.lineTo(cx, shY + depth - 1); c.lineTo(cx + neckW * .7, shY - 1.5); c.fill();
  };
  const k = J.kind;
  if (k === 'child' || k === 'plain' || k === 'farmer' || k === 'worker') {
    neckline(3.4, neckW + 3, shade(J.c, .75));
    if (k === 'farmer' || k === 'worker') { c.strokeStyle = css(shade(J.c, .7)); c.lineWidth = 1; c.beginPath(); c.moveTo(cx, shY + 5); c.lineTo(cx, shY + 14); c.stroke(); }
  } else if (k === 'smith') {
    collarTri(J.collar, 4, 8);
    c.fillStyle = css(J.apron); c.beginPath(); c.moveTo(cx - neckW - 2, shY + 12); c.lineTo(cx + neckW + 2, shY + 12); c.lineTo(cx + shW * .9, 104); c.lineTo(cx - shW * .9, 104); c.fill();
    c.strokeStyle = css(shade(J.apron, .8)); c.lineWidth = 1.8; c.beginPath(); c.moveTo(cx - neckW - 2, shY + 12); c.lineTo(cx - neckW * .8, shY + 1); c.moveTo(cx + neckW + 2, shY + 12); c.lineTo(cx + neckW * .8, shY + 1); c.stroke();
  } else if (k === 'baker') {
    neckline(3, neckW + 3, shade(J.c, .85));
    c.fillStyle = 'rgba(210,190,150,.5)'; c.beginPath(); c.arc(cx - shW * .5, shY + 20, 2, 0, 7); c.arc(cx + shW * .45, shY + 17, 1.5, 0, 7); c.fill();
  } else if (k === 'doctor') {
    collarTri(J.collar, 3, 11);
    c.strokeStyle = css(shade(J.c, .85)); c.lineWidth = 1; c.beginPath(); c.moveTo(cx, shY + 11); c.lineTo(cx, 104); c.stroke();
    c.strokeStyle = '#3a4a56'; c.lineWidth = 1.2; c.beginPath(); c.moveTo(cx - neckW, shY + 1); c.quadraticCurveTo(cx - neckW - 2, shY + 16, cx - 3, shY + 17); c.moveTo(cx + neckW, shY + 1); c.quadraticCurveTo(cx + neckW + 2, shY + 16, cx + 3, shY + 17); c.stroke();
    c.fillStyle = '#3a4a56'; c.beginPath(); c.arc(cx, shY + 18, 2, 0, 7); c.fill();
  } else if (k === 'teacher') {
    collarTri(J.collar, 5, 9);
    c.fillStyle = css(shade(J.c, .75)); c.beginPath(); c.moveTo(cx - 1, shY + 8); c.lineTo(cx + 1, shY + 8); c.lineTo(cx + 2, shY + 22); c.lineTo(cx, shY + 25); c.lineTo(cx - 2, shY + 22); c.fill();
  } else if (k === 'priest') {
    neckline(2.4, neckW + 2.5, [255, 255, 255]);
    c.fillStyle = '#fff'; c.fillRect(cx - 2.4, shY + 1, 4.8, 2.8);
    c.fillStyle = '#d8b34a'; c.fillRect(cx - .5, shY + 12, 1, 8); c.fillRect(cx - 2.5, shY + 14, 5, 1);
  } else if (k === 'guard') {
    collarTri(J.c, 3, 6);
    c.fillStyle = css(J.collar); c.fillRect(cx - shW - 6, shY + 14, 16, 3); c.fillRect(cx + shW - 10, shY + 14, 16, 3);
    c.fillStyle = '#d8d8dc'; for (const s of [-1, 1]) { c.beginPath(); c.arc(cx + s * (shW - 2), shY + 9, 2.2, 0, 7); c.fill(); }
    c.strokeStyle = '#6a4a2c'; c.lineWidth = 2.4; c.beginPath(); c.moveTo(cx - shW * .85, shY + 8); c.lineTo(cx + shW * .8, 100); c.stroke();
  } else if (k === 'merchant') {
    collarTri(J.collar, 4, 10);
    c.strokeStyle = '#d8b34a'; c.lineWidth = 1.3; c.beginPath(); c.moveTo(cx - neckW - 1, shY + 2); c.quadraticCurveTo(cx, shY + 24, cx + neckW + 1, shY + 2); c.stroke();
    c.fillStyle = '#d8b34a'; c.beginPath(); c.arc(cx, shY + 17, 2.2, 0, 7); c.fill();
  } else if (k === 'tavern') {
    collarTri(J.collar, 4, 9);
    c.fillStyle = css(J.apron); c.beginPath(); c.moveTo(cx - shW * .55, shY + 15); c.lineTo(cx + shW * .55, shY + 15); c.lineTo(cx + shW * .75, 104); c.lineTo(cx - shW * .75, 104); c.fill();
    c.strokeStyle = css(shade(J.apron, .8)); c.lineWidth = 1.6; c.beginPath(); c.moveTo(cx - shW * .55, shY + 15); c.lineTo(cx - neckW, shY + 2); c.moveTo(cx + shW * .55, shY + 15); c.lineTo(cx + neckW, shY + 2); c.stroke();
  }
  // shoulder shading
  const sg = c.createLinearGradient(cx - shW, 0, cx + shW, 0);
  sg.addColorStop(0, 'rgba(0,0,0,0)'); sg.addColorStop(.8, 'rgba(0,0,0,0)'); sg.addColorStop(1, 'rgba(0,0,0,.14)');
  c.fillStyle = sg; c.fillRect(cx - shW - 14, shY, shW * 2 + 28, 30);
}

function drawHat(c, J, T, cx, cy, rx, ry) {
  const k = J.kind, top = cy - ry;
  if (k === 'farmer' && T.hatV < .55) {
    c.fillStyle = '#d9bb6a';
    c.beginPath(); c.ellipse(cx, top + ry * .38, rx * 1.55, 5, 0, 0, 7); c.fill();
    c.fillStyle = '#e8cd82';
    c.beginPath(); c.moveTo(cx - rx * .95, top + ry * .38); c.bezierCurveTo(cx - rx * .95, top - 9, cx + rx * .95, top - 9, cx + rx * .95, top + ry * .38); c.closePath(); c.fill();
    c.fillStyle = '#a8483a'; c.fillRect(cx - rx * .94, top + ry * .26, rx * 1.88, 2.6);
  } else if (k === 'guard') {
    c.fillStyle = '#8c929c';
    c.beginPath(); c.moveTo(cx - rx * 1.05, top + ry * .5); c.bezierCurveTo(cx - rx * 1.1, top - 10, cx + rx * 1.1, top - 10, cx + rx * 1.05, top + ry * .5); c.lineTo(cx + rx * 1.05, top + ry * .42); c.lineTo(cx - rx * 1.05, top + ry * .42); c.fill();
    c.fillStyle = '#6b717b'; c.fillRect(cx - rx * 1.08, top + ry * .4, rx * 2.16, 3);
    c.fillStyle = '#b8453a'; c.fillRect(cx - 1.2, top - 6, 2.4, 7);
    c.fillStyle = 'rgba(255,255,255,.25)'; c.beginPath(); c.ellipse(cx - rx * .4, top - 1, 6, 2, -.3, 0, 7); c.fill();
  } else if (k === 'baker') {
    c.fillStyle = '#fbf9f3';
    c.beginPath(); c.arc(cx - rx * .5, top - 1, rx * .5, 0, 7); c.arc(cx + rx * .5, top - 1, rx * .5, 0, 7); c.arc(cx, top - 6, rx * .6, 0, 7); c.fill();
    c.fillRect(cx - rx * .95, top, rx * 1.9, ry * .32);
    c.strokeStyle = 'rgba(0,0,0,.12)'; c.lineWidth = 1; c.beginPath(); c.moveTo(cx - rx * .95, top + ry * .32); c.lineTo(cx + rx * .95, top + ry * .32); c.stroke();
  }
}

// ---------- public API ----------
function applyMemorial(oc, px) {
  const x = oc.getContext('2d');
  const im = x.getImageData(0, 0, px, px), d = im.data;
  for (let i = 0; i < d.length; i += 4) {
    const g = d[i] * .3 + d[i + 1] * .59 + d[i + 2] * .11;
    d[i] = Math.min(255, g * 1.07 + 12); d[i + 1] = Math.min(255, g * .96 + 8); d[i + 2] = Math.min(255, g * .78 + 4);
  }
  x.putImageData(im, 0, 0);
}

export function drawPortrait(ctx, person, x, y, size, opts = {}) {
  person = person || {};
  const T = analyze(person, opts);
  if (T.dead) {
    let scale = 1;
    try { scale = Math.max(1, ctx.getTransform().a || 1); } catch (e) { /* ignore */ }
    const px = Math.max(8, Math.ceil(size * scale));
    const oc = document.createElement('canvas'); oc.width = oc.height = px;
    const c = oc.getContext('2d'); c.scale(px / 100, px / 100);
    render(c, T, opts);
    applyMemorial(oc, px);
    ctx.drawImage(oc, x, y, size, size);
    return;
  }
  ctx.save();
  ctx.translate(x, y); ctx.scale(size / 100, size / 100);
  render(ctx, T, opts);
  ctx.restore();
}

const cache = new Map();
export function portraitDataURL(person, size = 96) {
  person = person || {};
  const T = analyze(person, {});
  const ageB = T.age < 20 ? Math.floor(T.age) : 20 + Math.floor((T.age - 20) / 4);
  const key = [T.id, ageB, Math.round(T.mood * 3), T.dead ? 'd' : 'a', Math.round(T.health * 3), String(person.job || ''), size].join('|');
  let u = cache.get(key);
  if (u) return u;
  const cv = document.createElement('canvas'); cv.width = cv.height = size;
  drawPortrait(cv.getContext('2d'), person, 0, 0, size);
  u = cv.toDataURL('image/png');
  if (cache.size > 2000) cache.clear();
  cache.set(key, u);
  return u;
}

export default { drawPortrait, portraitDataURL };

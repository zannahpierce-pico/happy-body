// Original line-drawing figures for each exercise step and level, generated from
// simple pose kinematics. Angles are absolute degrees: 0 = right, 90 = up.
// Side-view figures face right. Returns inline SVG strings that use currentColor.

const rad = (a) => (a * Math.PI) / 180;
const pt = (p, a, len) => [p[0] + Math.cos(rad(a)) * len, p[1] - Math.sin(rad(a)) * len];
const L = { torso: 50, neck: 18, head: 10, upper: 30, fore: 28, thigh: 40, shin: 40, foot: 15 };

const f1 = (n) => Math.round(n * 10) / 10;

function line(a, b, w = 4, op = 1) {
  return `<line x1="${f1(a[0])}" y1="${f1(a[1])}" x2="${f1(b[0])}" y2="${f1(b[1])}" stroke-width="${w}" ${op < 1 ? `opacity="${op}"` : ''}/>`;
}
function dumbbell(p, a = 0, scale = 1) {
  const h = 9 * scale, r = 4 * scale;
  const a1 = pt(p, a, h), a2 = pt(p, a + 180, h);
  const disc = (c) => `<circle cx="${f1(c[0])}" cy="${f1(c[1])}" r="${r}" fill="var(--fig-accent, #b8923d)" stroke="currentColor" stroke-width="2"/>`;
  return `<g>${line(a1, a2, 3)}${disc(a1)}${disc(a2)}</g>`;
}

// Standing pose solved from the ankle so feet stay on the floor.
function standing({ torso = 90, neck, face = 0, arms, legs, squat = 0, heels = false, toes = false, lean = 0, hipBack = 0, db = [], props = [], floor = 200 }) {
  const A = [100, floor - 2 - (toes ? 8 : 0)];
  const t = -90 + 80 * squat, s = -90 - 70 * squat;
  const K = pt(A, s + 180, L.shin);
  const H = pt(K, t + 180, L.thigh);
  H[0] -= hipBack;
  const foot = heels ? 22 : toes ? -30 : 0;
  return {
    H, torso: torso + lean, neck, face,
    arms: arms || [{ u: -90, f: -90 }, { u: -90, f: -90 }],
    legs: legs || [{ t, s, foot }, { t, s, foot }],
    db, props, floor, heels, toes,
  };
}

function supine({ torso = 180, neck, face = 90, arms, legs, db = [], props = [] }) {
  return {
    H: [100, 170], torso, neck, face,
    arms: arms || [{ u: 180, f: 180 }, { u: 180, f: 180 }],
    legs: legs || [{ t: 0, s: 0, foot: 90 }, { t: 0, s: 0, foot: 90 }],
    db, props, floor: 181,
  };
}
function prone({ torso = 180, neck, face = -90, arms, legs, db = [], props = [] }) {
  return {
    H: [100, 170], torso, neck, face,
    arms: arms || [{ u: 0, f: 0 }, { u: 0, f: 0 }],
    legs: legs || [{ t: 0, s: 0, foot: -55 }, { t: 0, s: 0, foot: -55 }],
    db, props, floor: 181,
  };
}

function renderPose(p) {
  const S = pt(p.H, p.torso, L.torso);
  const neckA = p.neck ?? p.torso;
  const C = pt(S, neckA, L.neck);
  const parts = [];
  const pts = [p.H, S, C];
  // far limbs first (lighter)
  const arm = (a, near) => {
    const E = pt(S, a.u, L.upper), W = pt(E, a.f, L.fore);
    pts.push(E, W);
    parts.push(line(S, E, near ? 4 : 3.5, near ? 1 : 0.45), line(E, W, near ? 4 : 3.5, near ? 1 : 0.45));
    return W;
  };
  const leg = (l, near) => {
    const K = pt(p.H, l.t, L.thigh), A = pt(K, l.s, L.shin), F = pt(A, l.foot ?? 0, L.foot);
    pts.push(K, A, F);
    parts.push(line(p.H, K, near ? 4 : 3.5, near ? 1 : 0.45), line(K, A, near ? 4 : 3.5, near ? 1 : 0.45), line(A, F, near ? 3.5 : 3, near ? 1 : 0.45));
    return { A, F };
  };
  const wrists = [];
  if (p.legs[1]) leg(p.legs[1], false);
  if (p.arms[1]) wrists[1] = arm(p.arms[1], false);
  parts.push(line(p.H, S, 5));
  parts.push(line(S, pt(S, neckA, L.neck - L.head + 2), 4));
  leg(p.legs[0], true);
  wrists[0] = arm(p.arms[0], true);
  parts.push(`<circle cx="${f1(C[0])}" cy="${f1(C[1])}" r="${L.head}" fill="var(--fig-fill, #fff)" stroke-width="3.5"/>`);
  const nose1 = pt(C, p.face ?? 0, L.head), nose2 = pt(C, p.face ?? 0, L.head + 4);
  parts.push(line(nose1, nose2, 3));
  for (const d of p.db || []) {
    const at = Array.isArray(d.at) ? d.at : wrists[d.at === 'far' ? 1 : 0];
    if (at) parts.push(dumbbell(at, d.a ?? 0, d.scale ?? 1));
  }
  for (const pr of p.props || []) {
    if (pr.type === 'bench') parts.push(`<rect x="${pr.x}" y="${pr.y}" width="${pr.w}" height="${pr.h}" rx="2" fill="none" stroke-width="3" opacity="0.6"/>`);
    if (pr.type === 'db') parts.push(dumbbell([pr.x, pr.y], 0));
  }
  if (p.floor != null) {
    const xs = pts.map((q) => q[0]);
    const x0 = Math.min(...xs) - 22, x1 = Math.max(...xs) + 22;
    parts.push(line([x0, p.floor], [x1, p.floor], 2.5, 0.5));
    pts.push([x0, p.floor], [x1, p.floor]);
  }
  return wrap(parts.join(''), pts, p);
}

function wrap(inner, pts, p) {
  const xs = pts.map((q) => q[0]), ys = pts.map((q) => q[1]);
  let x0 = Math.min(...xs) - 14, x1 = Math.max(...xs) + 14, y0 = Math.min(...ys) - 14, y1 = Math.max(...ys) + 8;
  let w = x1 - x0, h = y1 - y0;
  const side = Math.max(w, h, 120);
  x0 -= (side - w) / 2; y0 -= (side - h) / 2;
  if (p?.floor != null && y0 + side < p.floor + 8) { /* keep floor visible */ }
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${f1(x0)} ${f1(y0)} ${f1(side)} ${f1(side)}" fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" role="img">${inner}</svg>`;
}

// Top-down view used for Working Hinges (forearm swing is invisible from the side).
function topView(openDeg, { back = false, palms = false } = {}) {
  const parts = [];
  const head = [100, 56];
  const S = [[72, 92], [128, 92]];
  const E = [[70, 130], [130, 130]];
  parts.push(`<ellipse cx="100" cy="124" rx="34" ry="44" fill="var(--fig-fill, #fff)" stroke-width="3.5"/>`);
  parts.push(`<circle cx="${head[0]}" cy="${head[1]}" r="${L.head + 2}" fill="var(--fig-fill, #fff)" stroke-width="3.5"/>`);
  parts.push(line([100, 44], [100, 40], 3));
  for (let i = 0; i < 2; i++) {
    const sgn = i === 0 ? -1 : 1;
    const ang = 90 + sgn * openDeg;              // 90 = forward (up), ±90 = out to the sides
    const W = pt(E[i], ang, L.fore + 4);
    parts.push(line(S[i], E[i], 4), line(E[i], W, 4));
    parts.push(dumbbell(W, ang + 90));
  }
  const label = [palms && 'palms up', back && 'on heels'].filter(Boolean).join(' · ');
  if (label) parts.push(`<text x="100" y="196" text-anchor="middle" font-size="11" fill="currentColor" stroke="none" opacity="0.7">${label}</text>`);
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="20 20 160 180" fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" role="img">${parts.join('')}</svg>`;
}

// ── Pose builders per exercise kind ──────────────────────────────────────
const DB2 = [{ at: 'near' }, { at: 'far' }];
const DB1 = [{ at: 'near' }];
const armsAt = (u, f) => [{ u, f }, { u, f }];

function bowPose(depth, { stance = 'wide', toes = false, db = true } = {}) {
  // depth 0..1: 1 = dumbbells on the floor
  const torso = 90 - depth * 116;
  const legs = stance === 'wide'
    ? [{ t: -82, s: -95, foot: 0 }, { t: -98, s: -85, foot: 0 }]
    : stance === 'hip' ? [{ t: -88, s: -91, foot: 0 }, { t: -92, s: -89, foot: 0 }] : undefined;
  const p = standing({ torso, face: depth > 0.3 ? -60 : 0, legs, hipBack: depth * 14, toes, db: db ? DB2 : [] });
  if (toes) p.arms = armsAt(-90, -90);
  return p;
}
function squatPose(depth, { arms, db = DB2, bench = false, face = 0 } = {}) {
  const props = [];
  if (bench) {
    // bench top sits just under the hips at this depth
    const tmp = standing({ squat: depth });
    props.push({ type: 'bench', x: 40, y: Math.round(tmp.H[1] + 6), w: 56, h: Math.max(8, 198 - tmp.H[1] - 6) });
  }
  return standing({ squat: depth, arms, db, props, face });
}

const KINDS = {
  standingTall: {
    steps: () => [
      standing({ db: DB2 }),
      standing({ arms: armsAt(-90, 90), db: DB2 }),
      standing({ arms: armsAt(90, 90), db: DB2 }),
      standing({ arms: armsAt(90, 90), heels: true, db: DB2 }),
      standing({ db: DB2 }),
    ],
    levels: () => [
      standing({ arms: armsAt(90, 90), db: DB2 }),
      standing({ arms: armsAt(-60, 95), db: DB2 }),
      standing({ arms: armsAt(-20, 100), db: DB2 }),
      standing({ arms: armsAt(90, 90), db: DB2 }),
      standing({ arms: armsAt(90, 90), heels: true, db: DB2 }),
    ],
  },
  tappingHammer: {
    steps: () => [
      standing({ arms: armsAt(95, -140), db: [{ at: 'near', a: 90 }] }),
      standing({ arms: armsAt(90, 90), db: [{ at: 'near', a: 90 }] }),
      standing({ arms: armsAt(90, 90), heels: true, db: [{ at: 'near', a: 90 }] }),
      standing({ arms: armsAt(95, -140), db: [{ at: 'near', a: 90 }] }),
    ],
    levels: () => [
      supine({ arms: armsAt(90, 90), db: [{ at: 'near', a: 0 }] }),
      standing({ arms: armsAt(90, 90), db: [{ at: 'near', a: 0 }] }),
      standing({ arms: armsAt(90, 90), db: [{ at: 'near', a: 90 }] }),
      standing({ arms: armsAt(90, 90), heels: true, db: [{ at: 'near', a: 0 }] }),
      standing({ arms: armsAt(90, 90), heels: true, db: [{ at: 'near', a: 90 }] }),
    ],
  },
  sittingTower: {
    steps: () => [
      squatPose(0, { arms: armsAt(-30, 125), db: [{ at: 'near', a: 90 }] }),
      squatPose(1, { arms: armsAt(-30, 125), db: [{ at: 'near', a: 90 }] }),
      squatPose(0, { arms: armsAt(-30, 125), db: [{ at: 'near', a: 90 }] }),
    ],
    levels: () => [0.25, 0.45, 0.65, 0.85, 1].map((d, i) => squatPose(d, { arms: armsAt(-30, 125), db: [{ at: 'near', a: 90 }], bench: i > 0 && i < 4 })),
  },
  risingTower: {
    steps: () => [
      standing({ db: DB2 }),
      standing({ arms: armsAt(-90, 0), db: DB2 }),
      standing({ arms: armsAt(-90, 75), db: DB2 }),
      standing({ arms: armsAt(-90, 90), db: DB2 }),
      standing({ arms: armsAt(90, 90), db: DB2 }),
      squatPose(1, { arms: armsAt(90, 90) }),
      standing({ arms: armsAt(90, 90), db: DB2 }),
      standing({ arms: armsAt(-90, 90), db: DB2 }),
      standing({ arms: armsAt(-90, 75), db: DB2 }),
      standing({ arms: armsAt(-90, 0), db: DB2 }),
      standing({ db: DB2 }),
    ],
    levels: () => [0.25, 0.45, 0.65, 0.85, 1].map((d, i) => squatPose(d, { arms: armsAt(90, 90), bench: i > 0 && i < 4 })),
  },
  powerTower: {
    steps: () => [
      standing({ db: DB2 }),
      standing({ arms: armsAt(-90, 0), db: DB2 }),
      standing({ arms: armsAt(-90, 75), db: DB2 }),
      standing({ arms: armsAt(-90, 90), db: DB2 }),
      squatPose(1, { arms: armsAt(-90, 90) }),
      squatPose(1, { arms: armsAt(90, 90) }),
      standing({ arms: armsAt(90, 90), db: DB2 }),
      standing({ arms: armsAt(-90, 90), db: DB2 }),
      standing({ arms: armsAt(-90, 75), db: DB2 }),
      standing({ arms: armsAt(-90, 0), db: DB2 }),
      standing({ db: DB2 }),
    ],
    levels: () => [0.25, 0.45, 0.65, 0.85, 1].map((d, i) => squatPose(d, { arms: armsAt(90, 90), bench: i > 0 && i < 4 })),
  },
  bow: {
    steps: (o) => [bowPose(0, o), bowPose(1, o), bowPose(0, o), bowPose(0, { ...o, toes: true }), bowPose(0, o)],
    levels: (o) => [0.4, 0.64, 0.8, 0.92, 1].map((d) => bowPose(d, o)),
  },
  crestingWave: {
    steps: () => [
      supine({ legs: [{ t: 90, s: 90, foot: 160 }, { t: 90, s: 90, foot: 160 }], arms: armsAt(180, 180) }),
      supine({ torso: 140, neck: 130, face: 60, legs: [{ t: 90, s: 90, foot: 160 }, { t: 90, s: 90, foot: 160 }], arms: armsAt(50, 50) }),
      supine({ torso: 136, neck: 126, face: 60, legs: [{ t: 90, s: 90, foot: 160 }, { t: 90, s: 90, foot: 160 }], arms: armsAt(46, 46) }),
      supine({ legs: [{ t: 90, s: 90, foot: 160 }, { t: 90, s: 90, foot: 160 }], arms: armsAt(180, 180) }),
    ],
    levels: () => [
      supine({ torso: 165, neck: 150, face: 80, legs: [{ t: 90, s: 90, foot: 160 }, { t: 92, s: 85, foot: 160 }], arms: [{ u: 110, f: 175 }, { u: 110, f: 175 }] }),
      supine({ torso: 160, neck: 150, face: 90, legs: [{ t: 90, s: 90, foot: 160 }, { t: 90, s: 90, foot: 160 }], arms: armsAt(90, 90) }),
      supine({ torso: 148, neck: 138, face: 65, legs: [{ t: 90, s: 90, foot: 160 }, { t: 90, s: 90, foot: 160 }], arms: armsAt(62, 62) }),
      supine({ torso: 140, neck: 130, face: 60, legs: [{ t: 90, s: 90, foot: 160 }, { t: 90, s: 90, foot: 160 }], arms: armsAt(50, 50) }),
      supine({ torso: 136, neck: 126, face: 60, legs: [{ t: 90, s: 90, foot: 160 }, { t: 90, s: 90, foot: 160 }], arms: armsAt(46, 46) }),
    ],
  },
  shiftingWave: {
    steps: () => [
      supine({ legs: [{ t: 90, s: 90, foot: 160 }, { t: 90, s: 90, foot: 160 }], arms: [{ u: 180, f: 180 }, { u: 180, f: 180 }] }),
      supine({ torso: 140, neck: 130, face: 60, legs: [{ t: 90, s: 90, foot: 160 }, { t: 90, s: 90, foot: 160 }], arms: [{ u: 50, f: 50 }, { u: 0, f: 0 }] }),
      supine({ torso: 136, neck: 126, face: 60, legs: [{ t: 90, s: 90, foot: 160 }, { t: 90, s: 90, foot: 160 }], arms: [{ u: 46, f: 46 }, { u: 0, f: 0 }] }),
      supine({ legs: [{ t: 90, s: 90, foot: 160 }, { t: 90, s: 90, foot: 160 }], arms: [{ u: 180, f: 180 }, { u: 180, f: 180 }] }),
    ],
    levels: () => [
      supine({ torso: 165, neck: 150, face: 80, legs: [{ t: 90, s: 90, foot: 160 }, { t: 92, s: 85, foot: 160 }], arms: [{ u: 110, f: 175 }, { u: 0, f: 0 }] }),
      supine({ torso: 160, neck: 150, face: 90, legs: [{ t: 90, s: 90, foot: 160 }, { t: 90, s: 90, foot: 160 }], arms: [{ u: 90, f: 90 }, { u: 0, f: 0 }] }),
      supine({ torso: 148, neck: 138, face: 65, legs: [{ t: 90, s: 90, foot: 160 }, { t: 90, s: 90, foot: 160 }], arms: [{ u: 62, f: 62 }, { u: 0, f: 0 }] }),
      supine({ torso: 140, neck: 130, face: 60, legs: [{ t: 90, s: 90, foot: 160 }, { t: 90, s: 90, foot: 160 }], arms: [{ u: 50, f: 50 }, { u: 0, f: 0 }] }),
      supine({ torso: 136, neck: 126, face: 60, legs: [{ t: 90, s: 90, foot: 160 }, { t: 90, s: 90, foot: 160 }], arms: [{ u: 46, f: 46 }, { u: 0, f: 0 }] }),
    ],
  },
  rollingWave: {
    steps: () => [
      supine({ arms: armsAt(180, 180), legs: [{ t: 0, s: 0, foot: 90 }, { t: 0, s: 0, foot: 90 }] }),
      supine({ torso: 52, neck: 22, face: -50, arms: armsAt(-30, -60) }),
      supine({ torso: 30, neck: 10, face: -40, arms: armsAt(-20, -30) }),
      supine({ torso: 26, neck: 6, face: -40, arms: armsAt(-18, -26) }),
      supine({ arms: armsAt(180, 180), legs: [{ t: 0, s: 0, foot: 90 }, { t: 0, s: 0, foot: 90 }] }),
    ],
    levels: () => [
      supine({ torso: 160, neck: 150, face: 90, arms: armsAt(90, 90) }),
      supine({ torso: 60, neck: 40, face: -20, arms: armsAt(-30, -70) }),
      supine({ torso: 42, neck: 22, face: -30, arms: armsAt(-22, -50) }),
      supine({ torso: 30, neck: 10, face: -40, arms: armsAt(-20, -30) }),
      supine({ torso: 26, neck: 6, face: -40, arms: armsAt(-18, -26) }),
    ],
  },
  takeOff: {
    steps: () => [
      prone({ arms: armsAt(0, 0) }),
      prone({ torso: 160, neck: 160, face: -60, arms: armsAt(5, 5) }),
      prone({ torso: 155, neck: 155, face: -55, arms: armsAt(5, 5) }),
      prone({ arms: armsAt(0, 0) }),
    ],
    levels: () => [
      prone({ torso: 173, neck: 165, face: -70, arms: [{ u: -25, f: 170 }, { u: -25, f: 170 }] }),
      prone({ torso: 175, neck: 172, face: -70, arms: armsAt(3, 3) }),
      prone({ torso: 168, neck: 166, face: -65, arms: armsAt(4, 4) }),
      prone({ torso: 160, neck: 160, face: -60, arms: armsAt(5, 5) }),
      prone({ torso: 155, neck: 155, face: -55, arms: armsAt(5, 5) }),
    ],
  },
  liftOff: {
    steps: () => [
      prone({ arms: armsAt(0, 0) }),
      prone({ torso: 158, neck: 130, face: 50, arms: armsAt(5, 5) }),
      prone({ torso: 153, neck: 125, face: 55, arms: armsAt(5, 5) }),
      prone({ arms: armsAt(0, 0) }),
    ],
    levels: () => [
      prone({ torso: 174, neck: 170, face: -70, arms: armsAt(3, 3) }),
      prone({ torso: 168, neck: 155, face: -20, arms: armsAt(4, 4) }),
      prone({ torso: 163, neck: 145, face: 10, arms: armsAt(4, 4) }),
      prone({ torso: 158, neck: 130, face: 50, arms: armsAt(5, 5) }),
      prone({ torso: 153, neck: 125, face: 55, arms: armsAt(5, 5) }),
    ],
  },
  flyUp: {
    steps: () => [
      prone({ arms: armsAt(165, 180) }),
      prone({ torso: 150, neck: 150, face: 180, arms: armsAt(-110, 180) }),
      prone({ torso: 146, neck: 136, face: 150, arms: armsAt(-110, 180) }),
      prone({ arms: armsAt(165, 180) }),
    ],
    levels: () => [
      prone({ torso: 160, neck: 160, face: -120, arms: armsAt(-120, 180) }),
      prone({ torso: 154, neck: 154, face: -150, arms: armsAt(-112, 180) }),
      prone({ torso: 150, neck: 150, face: -170, arms: armsAt(-110, 180) }),
      prone({ torso: 150, neck: 150, face: 180, arms: armsAt(-110, 180) }),
      prone({ torso: 146, neck: 136, face: 150, arms: armsAt(-110, 180) }),
    ],
  },
  openingWide: {
    steps: () => [
      supine({ arms: armsAt(-35, 95), db: [{ at: 'near', a: 0 }, { at: 'far', a: 0 }] }),
      supine({ arms: armsAt(90, 90), db: [{ at: 'near', a: 0 }, { at: 'far', a: 0 }] }),
      supine({ arms: armsAt(90, 90), torso: 176, db: [{ at: 'near', a: 0 }, { at: 'far', a: 0 }] }),
      supine({ arms: armsAt(-35, 95), db: [{ at: 'near', a: 0 }, { at: 'far', a: 0 }] }),
    ],
    levels: () => [
      supine({ arms: armsAt(-5, 90), db: [{ at: 'near', a: 90 }, { at: 'far', a: 90 }] }),
      supine({ arms: armsAt(-5, 90), torso: 176, db: [{ at: 'near', a: 90 }, { at: 'far', a: 90 }] }),
      supine({ arms: armsAt(75, 105), db: [{ at: 'near', a: 0 }, { at: 'far', a: 0 }] }),
      supine({ arms: armsAt(90, 90), db: [{ at: 'near', a: 0 }, { at: 'far', a: 0 }] }),
      supine({ arms: armsAt(90, 90), torso: 176, db: [{ at: 'near', a: 0 }, { at: 'far', a: 0 }] }),
    ],
  },
  lyingLong: {
    steps: () => [
      supine({ arms: armsAt(180, 180), db: [{ at: 'near', a: 0 }] }),
      supine({ arms: armsAt(90, 90), db: [{ at: 'near', a: 0 }] }),
      supine({ arms: armsAt(90, 90), torso: 176, db: [{ at: 'near', a: 0 }] }),
      supine({ arms: armsAt(180, 180), db: [{ at: 'near', a: 0 }] }),
    ],
    levels: () => [
      supine({ arms: armsAt(150, 55), db: [{ at: 'near', a: 0 }] }),
      supine({ arms: armsAt(120, 75), db: [{ at: 'near', a: 0 }] }),
      supine({ arms: armsAt(102, 84), db: [{ at: 'near', a: 0 }] }),
      supine({ arms: armsAt(94, 88), db: [{ at: 'near', a: 0 }] }),
      supine({ arms: armsAt(90, 90), db: [{ at: 'near', a: 0 }] }),
    ],
  },
  rockingTrunk: {
    steps: () => [
      standing({ torso: 0, face: -70, legs: [{ t: -95, s: -85, foot: 0 }, { t: -95, s: -85, foot: 0 }], arms: [{ u: -140, f: -115 }, { u: -92, f: -90 }], db: [{ at: 'far' }] }),
      standing({ torso: 0, face: -70, legs: [{ t: -95, s: -85, foot: 0 }, { t: -95, s: -85, foot: 0 }], arms: [{ u: -140, f: -115 }, { u: 180, f: -90 }], db: [{ at: 'far' }] }),
      standing({ torso: 8, face: -60, legs: [{ t: -95, s: -85, foot: 0 }, { t: -95, s: -85, foot: 0 }], arms: [{ u: -140, f: -115 }, { u: 175, f: -80 }], db: [{ at: 'far' }] }),
      standing({ torso: 0, face: -70, legs: [{ t: -95, s: -85, foot: 0 }, { t: -95, s: -85, foot: 0 }], arms: [{ u: -140, f: -115 }, { u: -92, f: -90 }], db: [{ at: 'far' }] }),
    ],
    levels: () => [
      standing({ torso: 20, face: -60, legs: [{ t: -95, s: -85, foot: 0 }, { t: -95, s: -85, foot: 0 }], arms: [{ u: -120, f: -100 }, { u: 180, f: -90 }], db: [{ at: 'far' }], props: [{ type: 'bench', x: 92, y: 160, w: 24, h: 38 }, { type: 'bench', x: 134, y: 178, w: 24, h: 20 }] }),
      standing({ torso: 10, face: -65, legs: [{ t: -95, s: -85, foot: 0 }, { t: -95, s: -85, foot: 0 }], arms: [{ u: -130, f: -108 }, { u: 180, f: -90 }], db: [{ at: 'far' }], props: [{ type: 'bench', x: 134, y: 178, w: 24, h: 20 }] }),
      standing({ torso: 10, face: -65, legs: [{ t: -95, s: -85, foot: 0 }, { t: -95, s: -85, foot: 0 }], arms: [{ u: -130, f: -108 }, { u: 175, f: -80 }], db: [{ at: 'far' }], props: [{ type: 'bench', x: 134, y: 178, w: 24, h: 20 }] }),
      standing({ torso: 0, face: -70, legs: [{ t: -95, s: -85, foot: 0 }, { t: -95, s: -85, foot: 0 }], arms: [{ u: -140, f: -115 }, { u: 180, f: -90 }], db: [{ at: 'far' }] }),
      standing({ torso: 8, face: -60, legs: [{ t: -95, s: -85, foot: 0 }, { t: -95, s: -85, foot: 0 }], arms: [{ u: -140, f: -115 }, { u: 175, f: -80 }], db: [{ at: 'far' }] }),
    ],
  },
  workingHinges: {
    stepsSVG: () => [topView(180), topView(0), topView(0, { palms: true }), topView(90, { palms: true }), topView(100, { back: true, palms: true }), topView(0, { palms: true }), topView(0), topView(180)],
    levelsSVG: () => [topView(15), topView(30), topView(60), topView(90), topView(100, { back: true })],
  },
};

export function stepImages(images) {
  const k = KINDS[images.kind];
  if (!k) return [];
  if (k.stepsSVG) return k.stepsSVG(images);
  return k.steps(images).map(renderPose);
}
export function levelImages(images) {
  const k = KINDS[images.kind];
  if (!k) return [];
  if (k.levelsSVG) return k.levelsSVG(images);
  return k.levels(images).map(renderPose);
}
export function heroImage(images) {
  const s = stepImages(images);
  return s[Math.floor((s.length - 1) / 2)] || s[0] || ''; // a mid-movement pose, not the start
}

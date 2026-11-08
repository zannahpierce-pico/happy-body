// Line-drawing figures for each exercise step and level, generated from simple
// pose kinematics. Returns inline SVG strings that use currentColor.
//
// Model space: x = forward (the way the figure faces), y = up, z = toward the
// far side of the body. Sagittal angles are degrees in the x/y plane:
// 0 = forward, 90 = up, -90 = down, 180 = backward. Each limb may also turn
// outward (`o`, degrees) toward its own side, which shows in the slight
// three-quarter projection below. Lying poses are mirrored so the head is on the
// right, as in the book's photos.

const rad = (a) => (a * Math.PI) / 180;
const deg = (r) => (r * 180) / Math.PI;
const f1 = (n) => Math.round(n * 10) / 10;

// Body proportions (about eight heads tall, legs half the height).
const LEN = { torso: 50, neck: 11, head: 11, upper: 31, fore: 29, thigh: 44, shin: 42, foot: 14, heel: 4 };
const HALF = { shoulder: 11, hip: 7 };
// How the far-side axis (z) lands on screen, per base: a slight three-quarter
// view for standing, a little from above for lying.
const PROJ = { stand: [0.82, 0.2], lie: [0.3, 0.5] };
const FRAME = 236; // viewBox side for a normal figure
const SW = 7;      // one stroke width for everything, at FRAME scale
const NEAR = -1, FAR = 1;

const v2 = (a, len) => [Math.cos(rad(a)) * len, Math.sin(rad(a)) * len];
const d3 = (a, o = 0, side = 1) => [Math.cos(rad(a)) * Math.cos(rad(o)), Math.sin(rad(a)) * Math.cos(rad(o)), side * Math.sin(rad(o))];
const add = (p, q, k = 1) => [p[0] + q[0] * k, p[1] + q[1] * k, (p[2] || 0) + (q[2] || 0) * k];

// Two-link reach in the sagittal plane: aim the hand at `t`, bending the elbow
// toward `bend` (+1 = counter-clockwise of the line to the target).
function reach(root, t, bend = 1) {
  const dx = t[0] - root[0], dy = t[1] - root[1];
  const base = deg(Math.atan2(dy, dx));
  let d = Math.hypot(dx, dy);
  const a = LEN.upper, b = LEN.fore;
  if (d >= a + b - 0.01) return { u: base, f: base };
  d = Math.max(d, Math.abs(a - b) + 0.5);
  const u = base + bend * deg(Math.acos((a * a + d * d - b * b) / (2 * a * d)));
  const e = [root[0] + v2(u, a)[0], root[1] + v2(u, a)[1]];
  return { u, f: deg(Math.atan2(t[1] - e[1], t[0] - e[0])) };
}

// ── Solve a pose into 3D joints ──────────────────────────────────────────
function solve(p) {
  const lie = p.base !== 'stand';
  const J = { lie, p };
  const H = [0, 0, 0];
  J.H = H;
  J.S = [H[0] + v2(p.torso, LEN.torso)[0], H[1] + v2(p.torso, LEN.torso)[1], 0];
  const neck = p.neck ?? p.torso;
  J.C = add(J.S, [...v2(neck, LEN.neck + LEN.head), 0]);
  J.neckTop = add(J.S, [...v2(neck, LEN.neck), 0]);
  J.headTop = add(J.S, [...v2(neck, LEN.neck + 2 * LEN.head), 0]);
  J.chin = add(J.C, [...v2((p.base === 'prone' ? p.torso + 90 : p.torso - 90) + 20, LEN.head + 4), 0]);
  J.face = p.face === null ? null : p.face ?? (p.base === 'prone' ? p.torso + 90 : p.torso - 90);
  J.floor = lie ? -HALF.hip * PROJ.lie[1] - SW * 0.5 : null; // model y of the floor for lying poses

  // Legs.
  J.legs = (p.legs || []).map((l, i) => {
    const side = i === 0 ? NEAR : FAR;
    const root = [H[0], H[1], side * HALF.hip];
    const o = l.o ?? 0;
    const K = add(root, d3(l.t, o, side), LEN.thigh);
    const A = add(K, d3(l.s, o, side), LEN.shin);
    const fd = d3(l.foot ?? 0, l.fo ?? o, side);
    return { side, root, K, A, heel: add(A, fd, -LEN.heel), toe: add(A, fd, LEN.foot) };
  });
  const L0 = J.legs[0] || {};
  J.knee = L0.K; J.toe = L0.toe; J.ankle = L0.A;
  J.shin = L0.K && [(L0.K[0] + L0.A[0]) / 2, (L0.K[1] + L0.A[1]) / 2];

  // Arms (after legs, so a hand can reach for a knee or a toe).
  J.arms = (p.arms || []).map((a, i) => {
    const side = i === 0 ? NEAR : FAR;
    const root = [J.S[0], J.S[1], side * HALF.shoulder];
    let { u, f } = a;
    if (a.to) ({ u, f } = reach(root, typeof a.to === 'function' ? a.to(J) : a.to, a.bend ?? 1));
    const o = a.o ?? 0;
    const E = add(root, d3(u, o, side), LEN.upper);
    const W = add(E, d3(f, a.fo ?? o, side), LEN.fore);
    return { side, root, E, W, u, f, fo: a.fo ?? o };
  });
  return J;
}

// ── Project and draw ─────────────────────────────────────────────────────
function render(p) {
  const J = solve(p);
  const [lx, ly] = J.lie ? PROJ.lie : PROJ.stand;
  const mx = J.lie ? -1 : 1;
  let dy = 0;
  const P = (q) => [mx * (q[0] + (q[2] || 0) * lx), -(q[1] + (q[2] || 0) * ly) + dy];

  // Standing poses rest on the lowest point of the feet; lying poses on the hips.
  let floor;
  if (J.lie) floor = -J.floor;
  else {
    const low = Math.max(...J.legs.flatMap((l) => [l.heel, l.toe, l.A].map((q) => P(q)[1])));
    floor = 200;
    dy = floor - SW * 0.9 - low;
  }

  const pts = [];
  const seg = (...qs) => {
    const s = qs.map(P);
    pts.push(...s);
    return `<polyline points="${s.map((q) => `${f1(q[0])},${f1(q[1])}`).join(' ')}"/>`;
  };
  const body = { far: [], torso: [], near: [] };

  for (const l of J.legs) {
    body[l.side === NEAR ? 'near' : 'far'].push(seg(l.root, l.K, l.A), seg(l.heel, l.toe));
  }
  for (const a of J.arms) body[a.side === NEAR ? 'near' : 'far'].push(seg(a.root, a.E, a.W));

  // Torso: a spine with a short shoulder line and hip line, so it has width.
  const sh = [[J.S[0], J.S[1], NEAR * HALF.shoulder], [J.S[0], J.S[1], FAR * HALF.shoulder]];
  const hp = [[0, 0, NEAR * HALF.hip], [0, 0, FAR * HALF.hip]];
  body.torso.push(seg(...sh), seg(...hp), seg(J.H, J.S));
  body.torso.push(seg(J.S, J.neckTop));
  const C = P(J.C);
  pts.push([C[0] - LEN.head, C[1] - LEN.head], [C[0] + LEN.head, C[1] + LEN.head]);
  body.torso.push(`<circle cx="${f1(C[0])}" cy="${f1(C[1])}" r="${LEN.head}" fill="var(--fig-fill, #fff)"/>`);
  if (J.face != null) {
    const n1 = P(add(J.C, [...v2(J.face, LEN.head), 0])), n2 = P(add(J.C, [...v2(J.face, LEN.head + 4), 0]));
    body.torso.push(`<line x1="${f1(n1[0])}" y1="${f1(n1[1])}" x2="${f1(n2[0])}" y2="${f1(n2[1])}"/>`);
  }

  // Dumbbells: a bar with a plate across each end.
  const bell = (c, dir) => {
    const a = P(add(c, dir, -9)), b = P(add(c, dir, 9));
    let ux = b[0] - a[0], uy = b[1] - a[1];
    const len = Math.hypot(ux, uy) || 1;
    ux /= len; uy /= len;
    const px = -uy * 6, py = ux * 6;
    // A bar pointing straight at the viewer still shows its plates.
    const ends = len < 6 ? [[a[0] - 3, a[1]], [a[0] + 3, a[1]]] : [a, b];
    pts.push(...ends.flatMap((e) => [[e[0] + px, e[1] + py], [e[0] - px, e[1] - py]]));
    const L = (q, r) => `<line x1="${f1(q[0])}" y1="${f1(q[1])}" x2="${f1(r[0])}" y2="${f1(r[1])}"/>`;
    return L(ends[0], ends[1]) + ends.map((e) => L([e[0] + px, e[1] + py], [e[0] - px, e[1] - py])).join('');
  };
  const wrist = (w) => (w === 'far' ? J.arms[1]?.W : w === 'mid' ? add(J.arms[0].W, J.arms[1].W, 1).map((x) => x / 2) : J.arms[0]?.W);
  const dbAt = {};
  for (const d of p.db || []) {
    const w = wrist(d.at || 'near');
    if (!w) continue;
    let dir = d.dir || [1, 0, 0];
    if (d.dir === 'across') {
      // Held palm up across a horizontal forearm.
      const a = J.arms[d.at === 'far' ? 1 : 0];
      const fd = d3(a.f, a.fo, a.side);
      dir = [-fd[2], 0, fd[0]];
    }
    const c = d.off ? add(w, d.off) : w;
    dbAt[d.at || 'near'] = c;
    const g = d.at === 'far' ? 'far' : 'near';
    body[g].push(bell(c, dir));
  }

  // Props: seats under the hips, blocks under a hand, all down to the floor.
  const props = [];
  const box = (x0, x1, top) => {
    pts.push([x0, top], [x1, floor]);
    return `<rect x="${f1(x0)}" y="${f1(top)}" width="${f1(x1 - x0)}" height="${f1(floor - top)}" fill="none" opacity="0.45"/>`;
  };
  for (const pr of p.props || []) {
    if (pr.type === 'seat') {
      const h = P(J.H);
      props.push(box(h[0] - 32, h[0] + 2, h[1] + SW * 1.1));
    }
    if (pr.type === 'block') {
      const at = pr.on === 'db' ? P(dbAt.near) : P(J.arms[pr.on === 'far' ? 1 : 0].W);
      props.push(box(at[0] - 13, at[0] + 13, at[1] + SW * (pr.on === 'db' ? 1.6 : 0.9)));
    }
  }

  // Floor line under everything.
  const xs = pts.map((q) => q[0]);
  const x0 = Math.min(...xs) - 12, x1 = Math.max(...xs) + 12;
  pts.push([x0, floor]);
  const ground = `<line x1="${f1(x0)}" y1="${f1(floor)}" x2="${f1(x1)}" y2="${f1(floor)}" opacity="0.35"/>`;

  return wrap(ground + props.join('') + body.far.join('') + body.torso.join('') + body.near.join(''), pts);
}

function wrap(inner, pts) {
  const xs = pts.map((q) => q[0]), ys = pts.map((q) => q[1]);
  const pad = 10;
  const bx0 = Math.min(...xs), bx1 = Math.max(...xs), by0 = Math.min(...ys), by1 = Math.max(...ys);
  const side = Math.max(FRAME, bx1 - bx0 + 2 * pad, by1 - by0 + 2 * pad);
  const x0 = (bx0 + bx1) / 2 - side / 2;
  // Sit the floor near the bottom so figures line up from one frame to the next.
  const y0 = Math.min(by1 + pad + 6 - side, by0 - pad);
  const sw = (SW * side) / FRAME;
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${f1(x0)} ${f1(y0)} ${f1(side)} ${f1(side)}" fill="none" stroke="currentColor" stroke-width="${f1(sw)}" stroke-linecap="round" stroke-linejoin="round" role="img">${inner}</svg>`;
}

// ── Pose builders ────────────────────────────────────────────────────────
const leg = (t, s, foot = 0, o = 3) => ({ t, s, foot, o });
const both = (x) => [x, x];

// Standing arms.
const A = {
  sides: both({ u: -86, f: -84, o: 13 }),
  shoulders: both({ u: -62, f: 100, o: 12 }),         // hands at the shoulders, elbows forward
  eye: both({ u: -5, f: 100, o: 10 }),
  aboveShoulder: both({ u: -35, f: 98, o: 12 }),
  overhead: both({ u: 88, f: 90, o: 15 }),
};

function stand({ arms = A.sides, torso = 90, neck, face, stance = 'hip', heels = false, toes = false, squat = 0, db = [], props = [] } = {}) {
  const o = { together: 1, hip: 3, wide: 10 }[stance];
  const fo = stance === 'wide' ? 22 : o;
  let legs;
  if (squat > 0) {
    const t = -90 + 100 * squat, s = -90 - 32 * squat;
    legs = both({ t, s, foot: 0, o: o + 4 * squat, fo });
  } else {
    const foot = heels ? 22 : toes ? -38 : 0;
    legs = both({ t: -90, s: -90, foot, o, fo });
  }
  return { base: 'stand', torso: torso - 22 * squat, neck: neck ?? 90, face, arms, legs, db, props };
}

const DB2 = [{ at: 'near' }, { at: 'far' }];
const UP = [0, 1, 0];

// Bow: straight legs, hips back, arms hanging. `wrist` is the hand height to
// reach, in model units above the floor (0 = dumbbells on the floor).
function bow(wrist, { stance = 'wide' } = {}) {
  const hipH = 84, sinT = (wrist + LEN.upper + LEN.fore - hipH) / LEN.torso;
  const torso = deg(Math.asin(Math.max(-0.9, Math.min(0.95, sinT))));
  const o = { together: 1, hip: 3, wide: 10 }[stance];
  const lean = (90 - torso) / 130;
  return {
    base: 'stand', torso, neck: torso + 10 + 30 * lean, face: torso - 70,
    arms: both({ u: -90, f: -90, o: 4 }),
    legs: both({ t: -82, s: -84, foot: 0, o, fo: stance === 'wide' ? 22 : o }),
    db: DB2,
  };
}
const bowStand = (stance, toes = false) => stand({ stance, toes, arms: both({ u: -80, f: -78, o: 5 }), db: DB2 });

// Lying poses (model: hips at the origin, head toward -x before mirroring).
const flatLegs = (foot = 95) => both({ t: 0, s: 0, foot, o: 2 });
const upLegs = both({ t: 88, s: 90, foot: 165, o: 2 });
const supine = (o) => ({ base: 'supine', torso: 180, legs: flatLegs(), ...o });
const prone = (o) => ({ base: 'prone', torso: 180, legs: both({ t: 4, s: 4, foot: -42, o: 2 }), ...o });

const toToe = (dx = 0) => (J) => [J.toe[0] + dx, J.toe[1] - 2];
const toShin = (J) => J.shin;
const toKnee = (J) => [J.knee[0], J.knee[1] + 4];
// Floor contact for a near-side hand (the near side sits lowest on screen).
const handFloor = (J) => J.floor + SW * 0.5 + HALF.shoulder * PROJ.lie[1];

// Wave family: torso curls up toward the vertical legs.
const wave = (torso, arms, extra = {}) => supine({ torso, neck: torso - 18, face: torso - 70, legs: upLegs, arms, ...extra });
const reachToes = (dx = 0) => both({ to: toToe(dx), bend: -1 });
const behindHead = both({ to: (J) => [J.C[0] + 2, J.C[1] + 4], bend: -1, o: 30 });

// Prone raise: arms back along the floor toward the hips.
const armsBack = both({ to: (J) => [J.H[0] + 16, handFloor(J)], bend: 1 });
// Fly Up: elbows on the floor under the shoulders, forearms ahead.
const SPHINX = both({ u: -96, f: 180, o: 4 });
const armsAlong = both({ u: 0, f: 0, o: 3 });
// One arm resting on the floor along the side while the other reaches.
const restArm = { to: (J) => [J.H[0] + 8, handFloor(J) + HALF.shoulder * PROJ.lie[1] * 2], bend: 1, o: 3 };

// Rocking Trunk: bent over, far hand on the knee, near hand to the dumbbell.
const trunk = { torso: 28, neck: 40, face: -40, legs: both({ t: -78, s: -96, foot: 0, o: 4 }) };
const handOnKnee = { to: (J) => [J.knee[0] + 6, J.knee[1] + 6], bend: -1, o: 4 };
const handOn = (h) => ({ to: (J) => [J.S[0] + 18, J.ankle[1] + h], bend: -1, o: 4 });
const toDumbbell = (h) => ({ to: (J) => [J.S[0] + 4, J.ankle[1] + h], bend: 1, o: 2 });
const rowed = (twist = 0) => ({ u: 132 + twist, f: -88, o: 6 });
const rock = (near, far, props = []) => ({ base: 'stand', ...trunk, arms: [near, far], db: [{ at: 'near' }], props });

// Working Hinges: forearms level, swinging outward by `open` degrees.
const hinge = (open, heels = false) => stand({ heels, arms: both({ u: -86, f: 0, o: 4, fo: open }), db: [{ at: 'near', dir: 'across' }, { at: 'far', dir: 'across' }] });

const SQUATS = [0.25, 0.45, 0.65, 0.85, 1];
const towerLevels = (arms, db) => SQUATS.map((d, i) => stand({ squat: d, stance: 'wide', arms, db, props: i > 0 && i < 4 ? [{ type: 'seat' }] : [] }));
const chin = both({ to: (J) => [J.chin[0] + 2, J.chin[1] - 4], bend: -1, o: 14 });
const CHIN_DB = [{ at: 'mid', dir: UP, off: [0, -2, 0] }];

const KINDS = {
  standingTall: {
    steps: () => [
      stand({ arms: A.overhead, db: DB2 }),
      stand({ arms: A.overhead, heels: true, db: DB2 }),
      stand({ arms: A.sides, db: DB2 }),
    ],
    levels: () => [
      stand({ arms: A.overhead, db: DB2 }),
      stand({ arms: A.eye, db: DB2 }),
      stand({ arms: A.aboveShoulder, db: DB2 }),
      stand({ arms: A.overhead, db: DB2 }),
      stand({ arms: A.overhead, heels: true, db: DB2 }),
    ],
  },
  tappingHammer: {
    steps: () => {
      const up = both({ u: 90, f: 90, o: 4 });
      const vert = [{ at: 'mid', dir: UP, off: [0, 10, 0] }];
      return [
        stand({ arms: up, db: vert }),
        stand({ arms: up, heels: true, db: vert }),
        stand({ arms: both({ u: 66, f: -150, o: 16 }), db: [{ at: 'mid', dir: UP, off: [0, -4, 0] }] }),
      ];
    },
    levels: () => {
      const up = both({ u: 90, f: 90, o: 4 });
      return [
        supine({ arms: both({ u: 90, f: 90, o: -9 }), db: [{ at: 'mid', dir: [1, 0, 0], off: [0, 6, 0] }] }),
        stand({ arms: up, db: [{ at: 'mid', dir: [1, 0, 0], off: [0, 6, 0] }] }),
        stand({ arms: up, db: [{ at: 'mid', dir: UP, off: [0, 10, 0] }] }),
        stand({ arms: up, heels: true, db: [{ at: 'mid', dir: [1, 0, 0], off: [0, 6, 0] }] }),
        stand({ arms: up, heels: true, db: [{ at: 'mid', dir: UP, off: [0, 10, 0] }] }),
      ];
    },
  },
  sittingTower: {
    steps: () => [
      stand({ squat: 1, stance: 'wide', arms: chin, db: CHIN_DB }),
      stand({ stance: 'wide', arms: chin, db: CHIN_DB }),
    ],
    levels: () => towerLevels(chin, CHIN_DB),
  },
  risingTower: {
    steps: () => [
      stand({ stance: 'wide', arms: A.shoulders, db: DB2 }),
      stand({ stance: 'wide', arms: A.overhead, db: DB2 }),
      stand({ squat: 1, stance: 'wide', arms: A.overhead, db: DB2 }),
      stand({ stance: 'wide', arms: A.sides, db: DB2 }),
    ],
    levels: () => towerLevels(A.overhead, DB2),
  },
  powerTower: {
    steps: () => [
      stand({ stance: 'wide', arms: A.shoulders, db: DB2 }),
      stand({ squat: 1, stance: 'wide', arms: A.shoulders, db: DB2 }),
      stand({ squat: 1, stance: 'wide', arms: A.overhead, db: DB2 }),
      stand({ stance: 'wide', arms: A.overhead, db: DB2 }),
    ],
    levels: () => towerLevels(A.shoulders, DB2),
  },
  bow: {
    steps: (o) => [bow(0, o), bowStand(o.stance), bowStand(o.stance, true), bowStand(o.stance)],
    levels: (o) => [62, 44, 24, 10, 0].map((w) => bow(w, o)),
  },
  crestingWave: {
    steps: () => [
      wave(142, reachToes()),
      wave(134, reachToes(-8)),
      supine({ legs: upLegs, arms: both({ u: 180, f: 180, o: 3 }) }),
    ],
    levels: () => [
      wave(162, behindHead, { legs: [{ t: 112, s: 20, foot: 40, o: 2 }, { t: 100, s: 30, foot: 40, o: 2 }] }),
      wave(158, both({ u: 82, f: 82, o: 3 })),
      wave(150, both({ to: toShin, bend: -1 })),
      wave(142, reachToes()),
      wave(134, reachToes(-8)),
    ],
  },
  shiftingWave: {
    steps: () => [
      wave(142, [{ to: toToe(), bend: -1 }, restArm]),
      wave(136, [{ to: toToe(-8), bend: -1 }, restArm]),
      supine({ legs: upLegs, arms: both({ u: 180, f: 180, o: 3 }) }),
    ],
    levels: () => [
      wave(162, [{ to: (J) => [J.C[0] + 2, J.C[1] + 4], bend: -1, o: 30 }, restArm], { legs: [{ t: 112, s: 20, foot: 40, o: 2 }, { t: 100, s: 30, foot: 40, o: 2 }] }),
      wave(158, [{ u: 82, f: 82, o: 3 }, restArm]),
      wave(150, [{ to: toShin, bend: -1 }, restArm]),
      wave(142, [{ to: toToe(), bend: -1 }, restArm]),
      wave(136, [{ to: toToe(-8), bend: -1 }, restArm]),
    ],
  },
  rollingWave: {
    steps: () => [
      supine({ torso: 58, neck: 40, face: -20, arms: reachToes() }),
      supine({ torso: 48, neck: 30, face: -30, arms: reachToes(8) }),
      supine({ arms: both({ u: 180, f: 180, o: 3 }) }),
    ],
    levels: () => [
      supine({ torso: 160, neck: 145, face: 80, arms: both({ u: 88, f: 88, o: 3 }) }),
      supine({ torso: 95, neck: 80, face: 10, arms: both({ to: toKnee, bend: -1 }) }),
      supine({ torso: 72, neck: 56, face: -10, arms: both({ to: toShin, bend: -1 }) }),
      supine({ torso: 58, neck: 40, face: -20, arms: reachToes() }),
      supine({ torso: 48, neck: 30, face: -30, arms: reachToes(8) }),
    ],
  },
  takeOff: {
    steps: () => [
      prone({ torso: 154, neck: 150, face: -150, arms: armsBack }),
      prone({ torso: 147, neck: 143, face: -150, arms: armsBack }),
      prone({ face: null, arms: armsAlong }),
    ],
    levels: () => [
      prone({ torso: 166, neck: 160, face: -140, arms: both({ u: 40, f: -115, o: 10 }) }),
      prone({ torso: 173, neck: 170, face: -140, arms: armsBack }),
      prone({ torso: 165, neck: 160, face: -145, arms: armsBack }),
      prone({ torso: 154, neck: 150, face: -150, arms: armsBack }),
      prone({ torso: 147, neck: 143, face: -150, arms: armsBack }),
    ],
  },
  liftOff: {
    steps: () => [
      prone({ torso: 154, neck: 128, face: 140, arms: armsBack }),
      prone({ torso: 147, neck: 120, face: 125, arms: armsBack }),
      prone({ face: null, arms: armsAlong }),
    ],
    levels: () => [
      prone({ torso: 172, neck: 168, face: -120, arms: armsBack }),
      prone({ torso: 166, neck: 160, face: 185, arms: armsBack }),
      prone({ torso: 160, neck: 145, face: 165, arms: armsBack }),
      prone({ torso: 154, neck: 128, face: 140, arms: armsBack }),
      prone({ torso: 147, neck: 120, face: 125, arms: armsBack }),
    ],
  },
  flyUp: {
    steps: () => [
      prone({ torso: 146, neck: 150, face: 178, arms: SPHINX }),
      prone({ torso: 144, neck: 128, face: 140, arms: SPHINX }),
      prone({ face: null, arms: both({ u: 180, f: 180, o: 4 }) }),
    ],
    levels: () => [
      prone({ torso: 148, neck: 168, face: -110, arms: SPHINX }),
      prone({ torso: 147, neck: 162, face: -140, arms: SPHINX }),
      prone({ torso: 146, neck: 156, face: -160, arms: SPHINX }),
      prone({ torso: 146, neck: 150, face: 178, arms: SPHINX }),
      prone({ torso: 144, neck: 128, face: 140, arms: SPHINX }),
    ],
  },
  openingWide: {
    steps: () => {
      const db = [{ at: 'near' }, { at: 'far' }];
      return [
        supine({ arms: both({ u: 90, f: 90, o: 6 }), db }),
        supine({ torso: 176, arms: both({ u: 90, f: 90, o: 6 }), db }),
        supine({ arms: both({ u: -2, f: -1, o: 6 }), db }),
      ];
    },
    levels: () => {
      const db = [{ at: 'near' }, { at: 'far' }];
      const bent = both({ u: -2, f: 90, o: 6 });
      const vert = [{ at: 'near', dir: UP, off: [0, 4, 0] }, { at: 'far', dir: UP, off: [0, 4, 0] }];
      return [
        supine({ arms: bent, db: vert }),
        supine({ torso: 176, arms: bent, db: vert }),
        supine({ arms: both({ u: 76, f: 104, o: 6 }), db }),
        supine({ arms: both({ u: 90, f: 90, o: 6 }), db }),
        supine({ torso: 176, arms: both({ u: 90, f: 90, o: 6 }), db }),
      ];
    },
  },
  lyingLong: {
    steps: () => {
      const db = [{ at: 'mid', dir: [0, 0, 1] }];
      return [
        supine({ arms: both({ u: 90, f: 90, o: -2 }), db }),
        supine({ torso: 176, arms: both({ u: 90, f: 90, o: -2 }), db }),
        supine({ arms: both({ u: 180, f: 180, o: -2 }), db }),
      ];
    },
    levels: () => {
      const db = [{ at: 'mid', dir: [0, 0, 1] }];
      return [
        supine({ arms: both({ to: (J) => [J.headTop[0] - 6, J.headTop[1] + 4], bend: -1, o: -2 }), db }),
        supine({ arms: both({ u: 116, f: 62, o: -2 }), db }),
        supine({ arms: both({ u: 102, f: 78, o: -2 }), db }),
        supine({ arms: both({ u: 95, f: 85, o: -2 }), db }),
        supine({ arms: both({ u: 90, f: 90, o: -2 }), db }),
      ];
    },
  },
  rockingTrunk: {
    steps: () => [
      rock(rowed(), handOnKnee),
      rock(rowed(16), handOnKnee),
      rock(toDumbbell(4), handOnKnee),
    ],
    levels: () => [
      rock(toDumbbell(26), handOn(48), [{ type: 'block', on: 'far' }, { type: 'block', on: 'db' }]),
      rock(rowed(), handOn(26), [{ type: 'block', on: 'far' }]),
      rock(rowed(16), handOn(26), [{ type: 'block', on: 'far' }]),
      rock(rowed(), handOnKnee),
      rock(rowed(16), handOnKnee),
    ],
  },
  workingHinges: {
    steps: () => [hinge(0), hinge(90), hinge(105, true), stand({ arms: A.sides, db: DB2 })],
    levels: () => [hinge(15), hinge(30), hinge(60), hinge(90), hinge(105, true)],
  },
};

export function stepImages(images) {
  const k = KINDS[images.kind];
  if (!k) return [];
  return k.steps(images).map(render);
}
export function levelImages(images) {
  const k = KINDS[images.kind];
  if (!k) return [];
  return k.levels(images).map(render);
}
export function heroImage(images) {
  const s = stepImages(images);
  return s[Math.min(1, s.length - 1)] || s[0] || '';
}

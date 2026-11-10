// The Happy Body — 18 exercises (chapter 8), captured as data.
// Phases: [label, seconds, kind]. kind drives the audio cue and colour:
//   in = inhale, move = positive movement, pause, stretch, hold, lower = negative, out = exhale

const P = {
  in: ['Inhale', 2, 'in'],
  out: ['Exhale', 2, 'out'],
  pause: ['Pause', 1, 'pause'],
  stretch: ['Stretch', 1, 'stretch'],
};
const hold = (s) => ['Hold', s, 'hold'];
const move = (label, s) => [label, s, 'move'];
const lower = (label, s) => [label, s, 'lower'];

// Shared text
const BOW_STEPS = [
  'Start position: dumbbell in each hand, arms hanging in front. Lift chest, breathe in, curl toes, lock knees, tighten abs.',
  'Holding your breath, knees locked, bend forward until the dumbbells touch the floor.',
  'Stand up without pausing, squeezing your glutes at the top.',
  'Rise onto your toes, pull shoulders up to your ears, hold for 2 seconds.',
  'In one continuous motion: release, lower, exhale, uncurl toes.',
];
const BOW_LEVELS = [
  'Bend only to mid-thigh.',
  'Bend to the knees.',
  'Bend to mid-shin.',
  'Bend to the ankles.',
  'Full bend: dumbbells touch the floor.',
];
const BOW_WHY = 'Hamstrings, lower back, calves; balance on the toes.';
const TOWER_LEVELS = [
  'Slight squat only.',
  'Squat down to a high bench or chair.',
  'Squat to a lower bench.',
  'Squat to a low bench, just above full depth.',
  'Full squat, no bench.',
];

export const EXERCISES = [
  // ───────────── Sequence 1 ─────────────
  {
    seq: 1, n: 1, name: 'Standing Tall', lift: true, pct: 100, hands: 'each hand',
    setup: 'Dumbbell in each hand, feet directly under hips, arms at your sides. Lift your chest, take a deep breath, curl your toes up, tighten abs and glutes.',
    steps: [
      'Start position: dumbbell in each hand, feet directly under hips, arms at your sides. Lift your chest, take a deep breath, curl your toes up, tighten abs and glutes.',
      'Holding your breath, bring hands to shoulder level without letting elbows go back.',
      'Without pausing, continue until arms are straight overhead: shoulder-width, dumbbells parallel, elbows locked. Pause.',
      'Shift onto your heels, stretch to the ceiling, tip wrists back, and hold for 2 seconds.',
      'In one continuous motion: release, feet flat, lower the dumbbells, exhale, uncurl toes.',
    ],
    levels: [
      'Steps 1, 2 and 5 only: lift, pause, lower. No heel balance, no stretch.',
      'Lift hands only to eye level.',
      'Lift hands slightly above the shoulders.',
      'Full lift overhead, but no heel balance.',
      'The full movement.',
    ],
    phases: [P.in, move('Lift', 1), P.pause, P.stretch, hold(2), lower('Lower', 2), P.out],
    why: 'Shoulders and thoracic posture; balance on the heels.',
    images: { kind: 'standingTall' },
  },
  {
    seq: 1, n: 2, name: 'Cresting Wave', lift: false,
    setup: 'On your back, arms overhead on the floor, legs straight up. Deep breath, curl toes toward your face, tighten abs.',
    steps: [
      'Start position: on your back, arms overhead on the floor, legs straight up. Deep breath, curl toes toward your face, tighten abs.',
      'Raise arms and head to touch your toes, then pause.',
      'Reach one more inch, tightening the lower abs.',
      'In one continuous motion: lower, exhale, release.',
    ],
    levels: [
      'Hands behind head, legs crossed; lift only head and shoulders.',
      'Look up, reach fingers to the ceiling.',
      'Look at your toes, reach to mid-calf.',
      'Touch the toes, but skip the extra inch.',
      'The full movement.',
    ],
    phases: [P.in, move('Raise', 1), P.pause, P.stretch, hold(1), lower('Lower', 1), P.out],
    why: 'Abdominals; back flexibility.',
    images: { kind: 'crestingWave' },
  },
  {
    seq: 1, n: 3, name: 'Take Off', lift: false,
    setup: 'On your belly, arms at your sides with palms up, head turned to one side. Inhale, tighten abs, glutes and hamstrings.',
    steps: [
      'Start position: on your belly, arms at your sides with palms up, head turned to one side. Inhale, tighten abs, glutes and hamstrings.',
      'Arms relaxed, hands and feet on the floor, raise your upper body while turning your face down. Pause for 1 second.',
      'Rise another inch or two, from the waist.',
      'In one continuous motion: lower, turn your head to the other side, exhale.',
    ],
    levels: [
      'Elbows bent 90°; use the arms to lift your nose a few inches.',
      'A quarter of the full raise, without the arms.',
      'Half of the full raise.',
      'Full raise, but skip the extra inch.',
      'The full movement.',
    ],
    phases: [P.in, move('Raise', 1), P.pause, move('Extend', 1), lower('Lower', 1), P.out],
    why: 'Lumbar spine; back flexibility and neck range.',
    images: { kind: 'takeOff' },
  },
  {
    seq: 1, n: 4, name: 'Tapping Hammer', lift: true, pct: 150, hands: 'one dumbbell, both hands',
    setup: 'One dumbbell held between your thumbs, raised over and behind your head so the lower end is at shoulder height. Lift chest, breathe in, curl toes, tighten abs and glutes.',
    steps: [
      'Start position: one dumbbell between your thumbs, raised over and behind your head so the lower end is at shoulder height. Lift chest, breathe in, curl toes, tighten abs and glutes.',
      'Holding your breath, press straight up and lock the elbows. Pause.',
      'Shift onto your heels, stretch to the ceiling, hold for 2 seconds.',
      'In one continuous motion: lower, exhale, release.',
    ],
    levels: [
      'Lying on your back, dumbbell horizontal.',
      'Standing, dumbbell horizontal, no heel balance.',
      'Standing, dumbbell vertical, no heel balance.',
      'The full movement with the dumbbell horizontal.',
      'The full movement with the dumbbell vertical.',
    ],
    phases: [P.in, move('Lift', 1), P.pause, P.stretch, hold(2), lower('Lower', 2), P.out],
    why: 'Triceps, shoulder blades and wrists; balance on the heels.',
    images: { kind: 'tappingHammer' },
  },
  {
    seq: 1, n: 5, name: 'Sitting Tower', lift: true, pct: 200, hands: 'one dumbbell at the chin',
    setup: 'Feet shoulder-width, toes turned out. One dumbbell held under the chin, resting on the shoulders, elbows forward. Lift chest, breathe in, flex abs, curl toes. Two dumbbells are allowed.',
    steps: [
      'Start position: feet shoulder-width, toes turned out, dumbbell under the chin resting on the shoulders, elbows forward. Lift chest, breathe in, flex abs, curl toes.',
      'Holding your breath, squat all the way down without leaning forward, dropping the elbows or lifting the heels.',
      'Stand up immediately. Exhale and release.',
    ],
    levels: TOWER_LEVELS,
    phases: [P.in, move('Squat & stand', 2), P.out],
    why: 'Thighs, glutes and lower back; joint flexibility.',
    images: { kind: 'sittingTower' },
  },
  {
    seq: 1, n: 6, name: 'Take a Bow', lift: true, pct: 150, hands: 'each hand',
    setup: 'Dumbbell in each hand, feet wide with toes out 45°, arms hanging in front. Lift chest, breathe in, curl toes, lock knees, tighten abs.',
    steps: BOW_STEPS,
    levels: BOW_LEVELS,
    phases: [P.in, move('Bend', 1), move('Lift', 1), P.stretch, hold(2), lower('Lower', 1), P.out],
    why: BOW_WHY,
    images: { kind: 'bow', stance: 'wide' },
  },

  // ───────────── Sequence 2 ─────────────
  {
    seq: 2, n: 1, name: 'Opening Wide', lift: true, pct: 50, hands: 'each hand',
    setup: 'Two dumbbells on the floor, parallel, an arm\'s length apart. Lie between them at shoulder level with one in each hand. Inhale, tighten abs and glutes, rotate ankles, curl toes toward your face.',
    steps: [
      'Start position: lying between the dumbbells at shoulder level, one in each hand. Inhale, tighten abs and glutes, rotate ankles, curl toes toward your face.',
      'Holding your breath, lock the elbows and lift the dumbbells straight up until they are shoulder-width apart. Pause.',
      'Stretch further toward the ceiling.',
      'In one continuous motion: return to the floor, uncurl toes, exhale.',
    ],
    levels: [
      'Dumbbells standing on end at the hips, elbows at 90°; press up and lower the elbows.',
      'The same, plus the stretch.',
      'The full movement without locking the elbows.',
      'Steps 1, 2 and 4: skip the stretch.',
      'The full movement.',
    ],
    phases: [P.in, move('Lift', 1), P.pause, P.stretch, hold(1), lower('Lower', 2), P.out],
    why: 'Front deltoids and chest; flexibility of deltoids, chest and biceps.',
    images: { kind: 'openingWide' },
  },
  {
    seq: 2, n: 2, name: 'Shifting Wave', lift: false, alternate: true,
    setup: 'On your back, arms overhead, legs straight up. Rotate ankles, curl toes, look at your toes, take a deep breath.',
    steps: [
      'Start position: on your back, arms overhead, legs straight up. Rotate ankles, curl toes, look at your toes, take a deep breath.',
      'One arm along the body, palm flat. Raise your head and the other arm to touch the toes of the opposite foot. Pause.',
      'Tighten abs and stretch both arms an inch or two.',
      'Release, lower, exhale. Alternate sides each rep.',
    ],
    levels: [
      'Hands behind head, legs crossed; raise head and one shoulder, elbow up.',
      'Arm straight up.',
      'Palm to the outside of the opposite calf.',
      'Steps 1, 2 and 4: skip the stretch.',
      'The full movement.',
    ],
    phases: [P.in, move('Raise', 1), P.pause, P.stretch, hold(1), lower('Lower', 1), P.out],
    why: 'Obliques; back flexibility.',
    images: { kind: 'shiftingWave' },
  },
  {
    seq: 2, n: 3, name: 'Fly Up', lift: false,
    setup: 'On your belly, head to one side, hands on the floor just above your head. Inhale.',
    steps: [
      'Start position: on your belly, head to one side, hands on the floor just above your head. Inhale.',
      'Elbows on the floor, raise your upper body until you look straight ahead. Pause for 1 second.',
      'Looking up, raise your head another inch or two.',
      'Lower, turning your face the other way, and exhale.',
    ],
    levels: [
      'Raise while looking down at the floor.',
      'Raise while looking at your fingertips.',
      'Raise while looking just in front of your fingertips.',
      'Steps 1, 2 and 4: skip the extra inch.',
      'The full movement.',
    ],
    phases: [P.in, move('Raise', 1), P.pause, move('Extend', 1), lower('Lower', 1), P.out],
    why: 'Upper back and rib cage; neck range.',
    images: { kind: 'flyUp' },
  },
  {
    seq: 2, n: 4, name: 'Rocking Trunk', lift: true, pct: 200, hands: 'one dumbbell, one arm', perArm: true,
    setup: 'Feet shoulder-width with the dumbbell on the floor between them. Bend until your back is parallel to the floor, one hand on the same-side knee, twist so the other hand reaches the dumbbell. Inhale, flex abs, curl toes.',
    steps: [
      'Start position: bent until your back is parallel to the floor, one hand on the same-side knee, twisted so the other hand reaches the dumbbell. Inhale, flex abs, curl toes.',
      'Holding your breath, lift the dumbbell by raising the arm and untwisting until its back end is level with the upper thigh. Pause.',
      'Keeping the arm fixed to the torso, twist up another 2–3 inches.',
      'In one continuous motion: return to the floor, exhale, release. Reps are split evenly between arms.',
    ],
    levels: [
      'Hand on a knee-height surface, dumbbell on a mid-calf surface; full movement.',
      'Hand on a mid-calf surface, no twist.',
      'Hand on a mid-calf surface, full movement.',
      'Steps 1, 2 and 4: skip the twist.',
      'The full movement.',
    ],
    phases: [P.in, move('Lift', 1), P.pause, move('Twist', 1), lower('Return', 2), P.out],
    why: 'Deltoids and lats; rib cage flexibility.',
    images: { kind: 'rockingTrunk' },
  },
  {
    seq: 2, n: 5, name: 'Rising Tower', lift: true, pct: 100, hands: 'each hand',
    setup: 'Dumbbells at your sides, feet shoulder-width, toes out. Lift chest, inhale, flex abs, curl toes.',
    steps: [
      'Start position: dumbbells at your sides, feet shoulder-width, toes out. Lift chest, inhale, flex abs, curl toes.',
      'Without the elbows going back, curl the dumbbells up, parallel, until the arms are at a right angle.',
      'Continue curling up to chin level.',
      'Rotate the arms backward until the dumbbells are directly above the shoulders.',
      'Press overhead to lockout.',
      'Squat without bending forward or lifting the heels.',
      'Stand up immediately, without leaning forward or lifting the heels.',
      'Lower to chin level.',
      'Rotate the arms forward.',
      'Lower in front until the arms are at a right angle.',
      'Lower to the start without the elbows going back. Exhale, release.',
    ],
    levels: TOWER_LEVELS,
    phases: [P.in, move('Curl & press', 1), move('Squat & stand', 2), lower('Lower', 2), P.out],
    why: 'Thighs, glutes, lower back and deltoids; ankle, knee, hip, shoulder and wrist flexibility.',
    images: { kind: 'risingTower' },
  },
  {
    seq: 2, n: 6, name: 'Encore Bow', lift: true, pct: 150, hands: 'each hand',
    setup: 'Same as Take a Bow, with feet directly under the hips. Lift chest, breathe in, curl toes, lock knees, tighten abs.',
    steps: BOW_STEPS,
    levels: BOW_LEVELS,
    phases: [P.in, move('Bend', 1), move('Lift', 1), P.stretch, hold(2), lower('Lower', 1), P.out],
    why: BOW_WHY,
    images: { kind: 'bow', stance: 'hip' },
  },

  // ───────────── Sequence 3 ─────────────
  {
    seq: 3, n: 1, name: 'Lying Long', lift: true, pct: 150, hands: 'one dumbbell, both hands',
    setup: 'One dumbbell on the floor. Lie face up with it above your head, one end in each hand. Inhale, tighten abs and glutes, rotate ankles, curl toes toward your face. If one dumbbell is awkward, use two at half the weight, palms up on the floor.',
    steps: [
      'Start position: face up, dumbbell on the floor above your head, one end in each hand. Inhale, tighten abs and glutes, rotate ankles, curl toes toward your face.',
      'Holding your breath, lock the elbows and lift the arms straight up over the chest. Pause.',
      'Stretch to the ceiling, and hold.',
      'In one continuous motion: return to the floor above your head, exhale, release.',
    ],
    levels: [
      'Elbows bent so the dumbbell touches the top of the head.',
      'Elbows bent.',
      'Elbows slightly bent.',
      'Elbows unlocked.',
      'Elbows locked: the full movement.',
    ],
    phases: [P.in, move('Lift', 1), P.pause, P.stretch, hold(1), lower('Lower', 2), P.out],
    why: 'Chest and lats; chest, rib cage and shoulder flexibility.',
    images: { kind: 'lyingLong' },
  },
  {
    seq: 3, n: 2, name: 'Rolling Wave', lift: false,
    setup: 'Flat on your back, legs on the floor, arms overhead on the floor. Inhale, tighten abs, rotate ankles, curl toes.',
    steps: [
      'Start position: flat on your back, legs on the floor, arms overhead on the floor. Inhale, tighten abs, rotate ankles, curl toes.',
      'In one continuous motion, raise arms and head, round the back, and roll up one vertebra at a time.',
      'Touch your toes, arching the back.',
      'Stretch an inch or two past the toes, arching slightly more.',
      'Continuously release: round the back, roll down one vertebra at a time, exhale, release.',
    ],
    levels: [
      'Shoulders off the floor, fingers to the ceiling.',
      'Touch the knees.',
      'Touch the shins.',
      'Touch the toes, but skip the extra stretch.',
      'The full movement.',
    ],
    phases: [P.in, move('Roll up', 2), P.pause, P.stretch, hold(1), lower('Roll down', 1), P.out],
    why: 'Abdominals; hip and back flexibility.',
    images: { kind: 'rollingWave' },
  },
  {
    seq: 3, n: 3, name: 'Lift Off', lift: false,
    setup: 'Same as Take Off: on your belly, palms up, head to one side. Inhale, tighten abs, glutes and hamstrings.',
    steps: [
      'Start position: on your belly, palms up, head to one side. Inhale, tighten abs, glutes and hamstrings.',
      'Arms relaxed, hands and feet on the floor, raise your upper body and lift your face until you can see the ceiling. Pause for 1 second.',
      'Rise another inch or two, from the waist.',
      'Lower, turning your head the other way, and exhale.',
    ],
    levels: [
      'Raise just enough to look down at the floor.',
      'Raise until you look several feet ahead.',
      'Raise until you look further ahead.',
      'Full raise, but skip the extra inch.',
      'The full movement.',
    ],
    phases: [P.in, move('Raise', 1), P.pause, move('Extend', 1), lower('Lower', 1), P.out],
    why: 'Lumbar, thoracic and cervical spine; neck and rib cage flexibility.',
    images: { kind: 'liftOff' },
  },
  {
    seq: 3, n: 4, name: 'Working Hinges', lift: true, pct: 50, hands: 'each hand',
    setup: 'Dumbbell in each hand, feet under hips, arms at your sides. Lift chest, breathe in, curl toes, tighten abs and glutes.',
    steps: [
      'Start position: dumbbell in each hand, feet under hips, arms at your sides. Lift chest, breathe in, curl toes, tighten abs and glutes.',
      'Holding your breath, lift the hands 90° in front so the forearms are parallel to the floor, without the elbows going back.',
      'Rotate the wrists palms up.',
      'Elbows pressed to the ribs, swing the hands outward 90° to the 3 o\'clock position. Pause.',
      'Shift onto your heels, take the hands slightly further back, hold for 1 second.',
      'Continuously release: feet flat (toes still curled), swing the hands inward 90°.',
      'Rotate the palms to face each other.',
      'Lower to the sides, exhale, release.',
    ],
    levels: [
      'Open the hands only slightly.',
      'Open to 1 o\'clock.',
      'Open to 2 o\'clock.',
      'Open fully, but no heel balance.',
      'The full movement.',
    ],
    phases: [P.in, move('Lift', 2), P.pause, P.stretch, hold(1), lower('Lower', 2), P.out],
    why: 'Rear deltoids; rotator cuff flexibility and balance on the heels.',
    images: { kind: 'workingHinges' },
  },
  {
    seq: 3, n: 5, name: 'Power Tower', lift: true, pct: 100, hands: 'each hand',
    setup: 'Same as Rising Tower: dumbbells at your sides, feet shoulder-width, toes out. Lift chest, inhale, flex abs, curl toes.',
    steps: [
      'Start position: dumbbells at your sides, feet shoulder-width, toes out. Lift chest, inhale, flex abs, curl toes.',
      'Without the elbows going back, curl the dumbbells up, parallel, until the arms are at a right angle.',
      'Continue curling up to chin level.',
      'Rotate the arms backward until the dumbbells are directly above the shoulders.',
      'Squat without bending forward or lifting the heels.',
      'At the bottom of the squat, press overhead to lockout.',
      'Stand straight up immediately.',
      'Lower to chin level.',
      'Rotate the arms forward.',
      'Lower in front until the arms are at a right angle.',
      'Lower to the start. Exhale, release.',
    ],
    levels: TOWER_LEVELS,
    phases: [P.in, move('Squat', 1), move('Press', 1), move('Stand', 1), lower('Lower', 2), P.out],
    why: 'Thighs, glutes, lower back and deltoids; joint flexibility. Unlike Rising Tower, the press happens at the bottom of the squat.',
    images: { kind: 'powerTower' },
  },
  {
    seq: 3, n: 6, name: 'Final Bow', lift: true, pct: 150, hands: 'each hand',
    setup: 'Same as Take a Bow, with feet together. Lift chest, breathe in, curl toes, lock knees, tighten abs.',
    steps: BOW_STEPS,
    levels: BOW_LEVELS,
    phases: [P.in, move('Bend', 1), move('Lift', 1), P.stretch, hold(2), lower('Lower', 1), P.out],
    why: BOW_WHY,
    images: { kind: 'bow', stance: 'together' },
  },
];

export const key = (e) => `${e.seq}:${e.n}`;
export const byKey = Object.fromEntries(EXERCISES.map((e) => [key(e), e]));
export const sequence = (s) => EXERCISES.filter((e) => e.seq === s);
export const repSeconds = (e) => e.phases.reduce((t, p) => t + p[1], 0);

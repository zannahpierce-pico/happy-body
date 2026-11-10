// Spoken phrases recorded as audio clips (audio/say/<file>.mp3), keyed by the
// exact text the app passes to audio.say(). Anything not listed here falls back
// to the browser's speech synthesis.
//
// Recorded with ElevenLabs, voice Daniel (onwK4e9ZLuTAKqWW03F9), model eleven_v3,
// each phrase sent with '&' read as 'and' and a full stop at the end ("Lift.").
// To re-record after a wording change, generate the phrase with that voice, save
// it as audio/say/<file>.mp3, add it to sw.js ASSETS and bump the version.

export const CLIPS = {
  // Phase names (data/exercises.js phases[0]; '&' is spoken as 'and')
  'Inhale': 'inhale',
  'Exhale': 'exhale',
  'Lift': 'lift',
  'Raise': 'raise',
  'Extend': 'extend',
  'Lower': 'lower',
  'Pause': 'pause',
  'Stretch': 'stretch',
  'Hold': 'hold',
  'Bend': 'bend',
  'Twist': 'twist',
  'Return': 'return',
  'Squat': 'squat',
  'Press': 'press',
  'Stand': 'stand',
  'Squat & stand': 'squat-and-stand',
  'Curl & press': 'curl-and-press',
  'Roll up': 'roll-up',
  'Roll down': 'roll-down',
  // Sides, before the first Inhale of a rep (program.js repSide)
  'Left arm': 'left-arm',
  'Right arm': 'right-arm',
  'Left': 'left',
  'Right': 'right',
  // Fixed lines (session.js)
  'Done': 'done',
  'Sequence complete. Time to relax.': 'sequence-complete',
  'Lie still. Breathe slowly. Let everything go.': 'lie-still',
  // Get-ready announcement, one per exercise
  'Next, Standing Tall': 'next-1-1',
  'Next, Cresting Wave': 'next-1-2',
  'Next, Take Off': 'next-1-3',
  'Next, Tapping Hammer': 'next-1-4',
  'Next, Sitting Tower': 'next-1-5',
  'Next, Take a Bow': 'next-1-6',
  'Next, Opening Wide': 'next-2-1',
  'Next, Shifting Wave': 'next-2-2',
  'Next, Fly Up': 'next-2-3',
  'Next, Rocking Trunk': 'next-2-4',
  'Next, Rising Tower': 'next-2-5',
  'Next, Encore Bow': 'next-2-6',
  'Next, Lying Long': 'next-3-1',
  'Next, Rolling Wave': 'next-3-2',
  'Next, Lift Off': 'next-3-3',
  'Next, Working Hinges': 'next-3-4',
  'Next, Power Tower': 'next-3-5',
  'Next, Final Bow': 'next-3-6',
};

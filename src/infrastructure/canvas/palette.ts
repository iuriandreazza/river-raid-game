const YELLOW = '#f4e04d';
const ORANGE = '#e8902a';

/** Colors sampled from a real console capture, nudged a little for contrast on modern screens. */
export const COLORS = {
  water: '#0044e0',
  landLight: '#008c04',
  landDark: '#004c00',

  jetYellow: YELLOW,
  jetOrange: ORANGE,
  missile: '#fff4a0',

  fuelBody: '#d2548c',
  fuelEdge: '#a43a6c',
  fuelLetter: '#fbe4f1',

  hullDark: '#25252d',
  deckGray: '#8a8a9a',
  cabinRed: '#9c2a44',

  rotor: '#c8d0e8',
  helicopterBody: '#1c2250',
  helicopterGlass: '#7fa0ff',
  helicopterDark: '#202030',

  enemyJetWing: '#2c2c3a',
  enemyJetBody: '#b4b4c4',

  bridgeLand: { rail: '#4c5054', deck: '#7a7e80', stripe: '#e0c890', shadow: '#34383a' },
  bridgeWater: { rail: '#4a1c00', deck: '#7c2c00', stripe: '#d08c30', shadow: '#3a1200' },

  dashboard: '#585860',
  dashboardEdge: '#3c3c44',
  gaugeFrame: '#101018',
  gaugeInside: '#74747f',
  gaugeMark: '#202028',
  hudText: '#e8b43a',
  hudAlert: '#e8402a',

  explosionCore: '#fff8c0',
  explosionYellow: YELLOW,
  explosionOrange: ORANGE,
  explosionRed: '#c02818',
  explosionEmber: '#601810',

  overlay: 'rgba(0, 0, 0, 0.6)',
} as const;

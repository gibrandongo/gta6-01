// Solmar Bay — every tuning number, colour and city constant in one place.
// A sun-soaked modern coastal city: golden-hour light, a beach and marina on the
// south edge, downtown towers in the middle, low houses and a park to the north.

export const STEP = 1 / 60;
export const SAVE_KEY = 'solmar-bay.save.v1';

// City layout: a grid of blocks. Roads run along the grid lines; buildings fill
// the blocks. Units are metres. The beach and the sea sit south of z = CITY_HALF.
export const CITY = {
  blocks: 7,          // blocks across (x) and deep (z)
  block: 46,          // block size
  road: 14,           // road width
  half: 0,            // (blocks * (block + road) + road) / 2
  beachZ: 0,          // z where sand starts
  seaZ: 0,            // z where the water starts
};
CITY.half = (CITY.blocks * (CITY.block + CITY.road) + CITY.road) / 2;
CITY.beachZ = CITY.half;
CITY.seaZ = CITY.half + 26;

export const PLAYER = {
  radius: 0.55,
  walkSpeed: 5.2,
  runSpeed: 8.6,
  accel: 34,
  health: 100,
};

export const CAR = {
  length: 4.4,
  width: 2.0,
  accel: 16,
  brake: 26,
  reverseAccel: 9,
  maxSpeed: 34,
  maxReverse: 9,
  steerMax: 0.55,
  grip: 6.5,
  health: 100,
};

export const TRAFFIC = { count: 26, speedMin: 7, speedMax: 13, followGap: 7 };
export const PEDS = { count: 34, speedMin: 1.0, speedMax: 1.9 };
export const POLICE = { maxCars: 6, ramDamage: 8, chaseSpeed: 30 };

export const WANTED = {
  // seconds of no police line-of-sight before one star cools off
  coolTime: 14,
  carsPerStar: 1,
  stealStars: 1,
  assaultStars: 2,
  killStars: 3,
};

export const COMBAT = {
  pistolDamage: 34,
  pistolRange: 55,
  pistolRate: 0.28,
  enemyHealth: 100,
  enemyDamage: 7,
  enemyRange: 34,
  enemyRate: 1.1,
  enemyAim: 0.42,
};

export const MISSION_REWARD = [400, 700, 900, 1400, 2500];
export const COLLECTIBLES = 20; // sun coins hidden around the city

export const PALETTE = {
  skyTop: [0.36, 0.62, 0.86],
  skyHorizon: [1.0, 0.78, 0.52],
  fog: [0.98, 0.76, 0.55],
  sunDir: [-0.45, 0.62, -0.38],
  sunColor: [1.0, 0.82, 0.58],
  ambient: [0.42, 0.38, 0.36],
  ground: '#8f8672',
  road: '#3a3f46',
  roadLine: '#e8d27a',
  sidewalk: '#9aa0a3',
  sand: '#e8cf9a',
  sea: '#2e7f9e',
  seaDeep: '#1d5a78',
  grass: '#5f8f4e',
  building: ['#c9a37e', '#b98a6e', '#d8b596', '#a8b7c4', '#c4b49a', '#8fa8b8', '#d9c9a8', '#b59a80'],
  towerGlass: '#7fb2d9',
  roof: '#6b5d4f',
  palmTrunk: '#8a6b4a',
  palmLeaf: '#3f7d3a',
  playerShirt: '#e85d3d',
  playerPants: '#2e3a4d',
  police: '#1d2f4d',
  taxi: '#f2c531',
};

export const FONT = 'system-ui, -apple-system, "Segoe UI", Roboto, sans-serif';

// District names shown on the HUD as the player moves around.
export const DISTRICTS = [
  { name: 'Marina Bay', x0: -220, z0: 120, x1: 220, z1: 260 },
  { name: 'Solmar Beach', x0: -220, z0: 180, x1: 220, z1: 260 },
  { name: 'Downtown', x0: -70, z0: -70, x1: 70, z1: 70 },
  { name: 'Old Town', x0: -220, z0: -220, x1: -70, z1: 70 },
  { name: 'Harbor Docks', x0: 70, z0: -220, x1: 220, z1: -70 },
  { name: 'Palm Heights', x0: -220, z0: -220, x1: 220, z1: -220 },
  { name: 'Coral Park', x0: -70, z0: 70, x1: 70, z1: 180 },
];

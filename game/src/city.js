// The city of Solmar Bay, generated once from the seed: a 7x7 block grid with
// roads, downtown towers, low houses, a park, a beach and the sea to the south,
// palms along the beach road, and the spots where cars park and sun coins hide.
// Everything the renderer and the simulation need comes out of here as plain
// data — no drawing in this file.

import { CITY, COLLECTIBLES, PALETTE } from './config.js';
import { pick, range, rangeInt } from './random.js';

function hexToRgb(hex) {
  const n = Number.parseInt(hex.slice(1), 16);
  return [(n >> 16 & 255) / 255, (n >> 8 & 255) / 255, (n & 255) / 255];
}

function shade(rgb, f) {
  return [rgb[0] * f, rgb[1] * f, rgb[2] * f];
}

// Road centre lines, from the grid: roads run at -210, -150, ..., 210.
export function roadLines() {
  const lines = [];
  for (let i = 0; i <= CITY.blocks; i += 1) {
    lines.push(-CITY.half + CITY.road / 2 + i * (CITY.block + CITY.road));
  }
  return lines;
}

export function buildCity(random) {
  const lines = roadLines();
  const boxes = [];       // static geometry: {cx, cy, cz, sx, sy, sz, color:[r,g,b]}
  const buildings = [];   // collision AABBs: {x0, z0, x1, z1, h}
  const palms = [];       // {x, z, s}
  const parkedSpots = []; // {x, z, angle}
  const coins = [];       // collectible spots {x, z}

  function box(cx, cy, cz, sx, sy, sz, color) {
    boxes.push({ cx, cy, cz, sx, sy, sz, color });
  }
  function flat(cx, cz, sx, sz, y, hex) {
    box(cx, y, cz, sx, 0.12, sz, hexToRgb(hex));
  }

  // Ground, beach and sea.
  flat(0, 0, CITY.half * 2 + 80, CITY.half * 2 + 80, -0.08, PALETTE.ground);
  flat(0, CITY.beachZ + 13, CITY.half * 2 + 80, 26, 0.02, PALETTE.sand);
  flat(0, CITY.seaZ + 40, CITY.half * 2 + 120, 90, -0.25, PALETTE.sea);
  // A pier reaching into the sea, and the marina boardwalk.
  flat(0, CITY.seaZ + 8, 30, 20, 0.06, '#8a7a5f');
  box(0, 0.5, CITY.seaZ + 16, 30, 1, 2, hexToRgb('#6b5d4f'));

  // Roads: dark strips along every grid line, with a pale centre dash line and
  // light sidewalk strips on both sides so the blocks read at a glance.
  for (const at of lines) {
    flat(at, 0, CITY.road, CITY.half * 2, 0.0, PALETTE.road);
    flat(0, at, CITY.half * 2, CITY.road, 0.0, PALETTE.road);
    flat(at - CITY.road / 2 - 1.8, 0, 3.6, CITY.half * 2, 0.01, PALETTE.sidewalk);
    flat(at + CITY.road / 2 + 1.8, 0, 3.6, CITY.half * 2, 0.01, PALETTE.sidewalk);
    flat(0, at - CITY.road / 2 - 1.8, CITY.half * 2, 3.6, 0.01, PALETTE.sidewalk);
    flat(0, at + CITY.road / 2 + 1.8, CITY.half * 2, 3.6, 0.01, PALETTE.sidewalk);
    for (let t = -CITY.half + 12; t < CITY.half; t += 16) {
      flat(at, t, 0.5, 4, 0.05, PALETTE.roadLine);
      flat(t, at, 4, 0.5, 0.05, PALETTE.roadLine);
    }
  }

  // Blocks: buildings, the park, and the docks.
  for (let bx = 0; bx < CITY.blocks; bx += 1) {
    for (let bz = 0; bz < CITY.blocks; bz += 1) {
      const x0 = lines[bx] + CITY.road / 2 + 2;
      const z0 = lines[bz] + CITY.road / 2 + 2;
      const x1 = lines[bx + 1] - CITY.road / 2 - 2;
      const z1 = lines[bz + 1] - CITY.road / 2 - 2;
      const cx = (x0 + x1) / 2;
      const cz = (z0 + z1) / 2;
      const distCentre = Math.max(Math.abs(cx), Math.abs(cz));
      // Coral Park: the two blocks just north of the beach road, centre column.
      if (bx === 3 && (bz === 5 || bz === 6)) {
        flat(cx, cz, x1 - x0, z1 - z0, 0.02, PALETTE.grass);
        for (let i = 0; i < 7; i += 1) {
          palms.push({ x: range(random, x0 + 4, x1 - 4), z: range(random, z0 + 4, z1 - 4), s: range(random, 0.9, 1.3) });
        }
        continue;
      }
      // Harbor Docks: north-east corner blocks hold low warehouses.
      const isDocks = bx >= 5 && bz <= 1;
      const count = isDocks ? 1 : rangeInt(random, 2, 4);
      for (let i = 0; i < count; i += 1) {
        const w = isDocks ? 30 : range(random, 15, 24);
        const d = isDocks ? 22 : range(random, 15, 24);
        const px = range(random, x0 + w / 2 + 1, x1 - w / 2 - 1);
        const pz = range(random, z0 + d / 2 + 1, z1 - d / 2 - 1);
        const tall = distCentre < 75 && random() < 0.55;
        const h = isDocks ? range(random, 7, 10) : tall ? range(random, 26, 58) : range(random, 8, 18);
        const color = tall && random() < 0.6 ? hexToRgb(PALETTE.towerGlass) : hexToRgb(pick(random, PALETTE.building));
        box(px, h / 2, pz, w, h, d, color);
        // Roof cap, a shade darker, so towers read at a glance.
        box(px, h + 0.3, pz, w * 0.92, 0.6, d * 0.92, shade(color, 0.72));
        // Glass band on tall towers.
        if (tall) box(px, h * 0.62, pz, w + 0.3, h * 0.2, d + 0.3, shade(hexToRgb(PALETTE.towerGlass), 1.15));
        buildings.push({ x0: px - w / 2, z0: pz - d / 2, x1: px + w / 2, z1: pz + d / 2, h });
      }
      // A few houses get a palm in the yard.
      if (random() < 0.5) palms.push({ x: range(random, x0 + 3, x1 - 3), z: range(random, z0 + 3, z1 - 3), s: range(random, 0.8, 1.2) });
    }
  }

  // Palms along the beach road and the marina.
  for (let x = -200; x <= 200; x += 18) {
    palms.push({ x: x + range(random, -3, 3), z: CITY.beachZ - 10, s: range(random, 1.0, 1.4) });
  }
  for (const palm of palms) {
    const h = 5.5 * palm.s;
    box(palm.x, h / 2, palm.z, 0.5, h, 0.5, hexToRgb(PALETTE.palmTrunk));
    box(palm.x, h + 0.9, palm.z, 4.6 * palm.s, 0.7, 4.6 * palm.s, hexToRgb(PALETTE.palmLeaf));
    box(palm.x, h + 0.9, palm.z, 2.2 * palm.s, 0.7, 5.6 * palm.s, shade(hexToRgb(PALETTE.palmLeaf), 0.8));
  }

  // Parked cars along the roads: spots the player can steal from.
  for (let i = 0; i < 40; i += 1) {
    const at = pick(random, lines);
    const along = range(random, -CITY.half + 16, CITY.half - 16);
    const vertical = random() < 0.5;
    parkedSpots.push({
      x: vertical ? at + (random() < 0.5 ? -4.6 : 4.6) : along,
      z: vertical ? along : at + (random() < 0.5 ? -4.6 : 4.6),
      angle: vertical ? 0 : Math.PI / 2,
    });
  }

  // Sun coins: on sidewalks, in the park, on the beach and the pier.
  for (let i = 0; i < COLLECTIBLES; i += 1) {
    const kind = random();
    if (kind < 0.35) {
      coins.push({ x: range(random, -200, 200), z: CITY.beachZ + range(random, 3, 22) });
    } else if (kind < 0.55) {
      coins.push({ x: range(random, -30, 30), z: range(random, 90, 170) });
    } else {
      const at = pick(random, lines);
      const along = range(random, -200, 200);
      coins.push({ x: at + (random() < 0.5 ? -8.5 : 8.5), z: along });
    }
  }

  return { boxes, buildings, palms, parkedSpots, coins, lines };
}

/** True when (x, z) is inside any building, with a small margin. */
export function insideBuilding(buildings, x, z, margin) {
  for (let i = 0; i < buildings.length; i += 1) {
    const b = buildings[i];
    if (x > b.x0 - margin && x < b.x1 + margin && z > b.z0 - margin && z < b.z1 + margin) return b;
  }
  return null;
}

/** Push a circle out of every building it overlaps; returns true if it moved. */
export function resolveBuildings(buildings, pos, radius) {
  let moved = false;
  for (let i = 0; i < buildings.length; i += 1) {
    const b = buildings[i];
    const nx = Math.max(b.x0, Math.min(pos.x, b.x1));
    const nz = Math.max(b.z0, Math.min(pos.z, b.z1));
    const dx = pos.x - nx;
    const dz = pos.z - nz;
    const d2 = dx * dx + dz * dz;
    if (d2 < radius * radius) {
      if (d2 > 0.0001) {
        const d = Math.sqrt(d2);
        pos.x = nx + (dx / d) * radius;
        pos.z = nz + (dz / d) * radius;
      } else {
        // Dead centre of a building: push out along the shortest side.
        const pushL = pos.x - b.x0 + radius;
        const pushR = b.x1 - pos.x + radius;
        const pushT = pos.z - b.z0 + radius;
        const pushB = b.z1 - pos.z + radius;
        const m = Math.min(pushL, pushR, pushT, pushB);
        if (m === pushL) pos.x = b.x0 - radius;
        else if (m === pushR) pos.x = b.x1 + radius;
        else if (m === pushT) pos.z = b.z0 - radius;
        else pos.z = b.z1 + radius;
      }
      moved = true;
    }
  }
  return moved;
}

// The city of Solmar Bay: a sun-soaked coastal grid with a downtown tower district, a
// marina, a beach and a pier. Everything is generated from one seeded stream, so the city
// is identical on every visit. Exports the collision boxes and the road network the
// traffic, pedestrians and police drive and walk on.

import { createRandom, clamp } from './utils.js';

export const PITCH = 60;          // distance between road centre lines
export const ROAD_HALF = 7;       // half the road width
export const CITY_HALF = 270;     // playable city edge (blocks end here)
export const BEACH_Z = 300;       // south of this the sand starts
export const WATER_Z = 340;       // south of this the bay starts

const ROAD_LINES = [-240, -180, -120, -60, 0, 60, 120, 180, 240];

const PALETTE = [
  0xe8d8c0, 0xd8c8b8, 0xc8b8a8, 0xb8c8d8, 0xd8a888, 0xe8c8a0,
  0xa8b8c8, 0xc8a8b8, 0x98a8b8, 0xe0b090, 0x8fb8a8, 0xd0b090,
];
const TOWER_COLORS = [0x9fb8cc, 0xb8c8d8, 0x8fa8c0, 0xc8d0d8, 0x7fa0b8];

function makeFacadeTexture(baseColor, litRatio, rng) {
  const canvas = document.createElement('canvas');
  canvas.width = 128;
  canvas.height = 256;
  const ctx = canvas.getContext('2d');
  const hex = '#' + baseColor.toString(16).padStart(6, '0');
  ctx.fillStyle = hex;
  ctx.fillRect(0, 0, 128, 256);
  ctx.fillStyle = 'rgba(0,0,0,0.12)';
  for (let y = 0; y < 256; y += 16) ctx.fillRect(0, y, 128, 2);
  for (let x = 0; x < 128; x += 16) {
    for (let y = 0; y < 256; y += 24) {
      const lit = rng.next() < litRatio;
      ctx.fillStyle = lit ? 'rgba(255,214,140,0.95)' : 'rgba(30,50,70,0.85)';
      ctx.fillRect(x + 3, y + 5, 10, 13);
    }
  }
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

function makeGroundTexture(rng) {
  const S = 1024;
  const canvas = document.createElement('canvas');
  canvas.width = S;
  canvas.height = S;
  const ctx = canvas.getContext('2d');
  const scale = S / 760; // world 760 wide maps onto the texture
  const toPx = (v) => (v + 380) * scale;
  // Sidewalk base.
  ctx.fillStyle = '#b8a894';
  ctx.fillRect(0, 0, S, S);
  // Beach sand at the south edge.
  ctx.fillStyle = '#e8d8a0';
  ctx.fillRect(0, toPx(BEACH_Z), S, S - toPx(BEACH_Z));
  ctx.fillStyle = '#d8c488';
  for (let i = 0; i < 260; i++) {
    ctx.fillRect(rng.next() * S, toPx(BEACH_Z) + rng.next() * (S - toPx(BEACH_Z)), 3, 3);
  }
  // Roads: dark asphalt strips along every road line.
  for (const line of ROAD_LINES) {
    ctx.fillStyle = '#3a3f46';
    ctx.fillRect(toPx(line - ROAD_HALF), 0, ROAD_HALF * 2 * scale, S);
    ctx.fillRect(0, toPx(line - ROAD_HALF), S, ROAD_HALF * 2 * scale);
    // Centre dashes.
    ctx.fillStyle = '#d8b83c';
    for (let v = -360; v < 360; v += 18) {
      ctx.fillRect(toPx(line) - 1, toPx(v), 2, 8 * scale);
      ctx.fillRect(toPx(v), toPx(line) - 1, 8 * scale, 2);
    }
    // Crosswalks at every intersection.
    for (const other of ROAD_LINES) {
      ctx.fillStyle = 'rgba(255,255,255,0.75)';
      for (let k = -2; k <= 2; k++) {
        ctx.fillRect(toPx(other - ROAD_HALF + 2 + k * 3), toPx(line - ROAD_HALF), 2, ROAD_HALF * 2 * scale);
        ctx.fillRect(toPx(line - ROAD_HALF), toPx(other - ROAD_HALF + 2 + k * 3), ROAD_HALF * 2 * scale, 2);
      }
    }
  }
  // Block centres: a touch of park green on a few blocks.
  ctx.fillStyle = '#7fa86a';
  const parks = [[-210, -210], [210, -210], [-210, 210], [30, 210], [-150, 30]];
  for (const [bx, bz] of parks) ctx.fillRect(toPx(bx), toPx(bz), 48 * scale, 48 * scale);
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  return tex;
}

export function createCity(scene, seed) {
  const rng = createRandom(seed);
  const colliders = [];
  const buildings = [];
  const waterMeshes = [];
  const group = new THREE.Group();
  group.name = 'SolmarBayCity';
  scene.add(group);

  // Sky, sun and fog: a warm late-afternoon bay.
  scene.background = new THREE.Color(0x87b8d8);
  scene.fog = new THREE.Fog(0x9fc0d8, 320, 900);
  const sun = new THREE.DirectionalLight(0xffe8b8, 2.4);
  sun.position.set(180, 260, 120);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  sun.shadow.camera.left = -320;
  sun.shadow.camera.right = 320;
  sun.shadow.camera.top = 320;
  sun.shadow.camera.bottom = -320;
  sun.shadow.camera.far = 800;
  scene.add(sun);
  const hemi = new THREE.HemisphereLight(0xbfd8ff, 0x8a7a5a, 0.9);
  scene.add(hemi);

  // Ground.
  const ground = new THREE.Mesh(
    new THREE.PlaneGeometry(760, 760),
    new THREE.MeshLambertMaterial({ map: makeGroundTexture(rng) }),
  );
  ground.rotation.x = -Math.PI / 2;
  ground.receiveShadow = true;
  group.add(ground);

  // The bay: a big blue plane south of the beach, plus a lighter animated shimmer sheet.
  const water = new THREE.Mesh(
    new THREE.PlaneGeometry(900, 260),
    new THREE.MeshLambertMaterial({ color: 0x2a7ab8 }),
  );
  water.rotation.x = -Math.PI / 2;
  water.position.set(0, -0.4, WATER_Z + 130);
  group.add(water);
  const shimmer = new THREE.Mesh(
    new THREE.PlaneGeometry(900, 260),
    new THREE.MeshLambertMaterial({ color: 0x6ab8e8, transparent: true, opacity: 0.35 }),
  );
  shimmer.rotation.x = -Math.PI / 2;
  shimmer.position.set(0, -0.2, WATER_Z + 130);
  group.add(shimmer);
  waterMeshes.push(shimmer);

  // Facade materials (shared).
  const facadeMats = [];
  for (let i = 0; i < 4; i++) {
    const color = PALETTE[rng.int(0, PALETTE.length - 1)];
    facadeMats.push(new THREE.MeshLambertMaterial({ map: makeFacadeTexture(color, 0.35, rng) }));
  }
  const towerMats = [];
  for (let i = 0; i < 3; i++) {
    const color = TOWER_COLORS[rng.int(0, TOWER_COLORS.length - 1)];
    towerMats.push(new THREE.MeshLambertMaterial({ map: makeFacadeTexture(color, 0.5, rng) }));
  }
  const roofMat = new THREE.MeshLambertMaterial({ color: 0x6a6a6a });
  const boxGeo = new THREE.BoxGeometry(1, 1, 1);

  function addBuilding(x, z, w, d, h, mat) {
    const mesh = new THREE.Mesh(boxGeo, mat);
    mesh.scale.set(w, h, d);
    mesh.position.set(x, h / 2, z);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    group.add(mesh);
    colliders.push({ minX: x - w / 2, maxX: x + w / 2, minZ: z - d / 2, maxZ: z + d / 2 });
    buildings.push(mesh);
    // Rooftop clutter on taller blocks.
    if (h > 20 && rng.chance(0.6)) {
      const ac = new THREE.Mesh(boxGeo, roofMat);
      ac.scale.set(3, 1.6, 3);
      ac.position.set(x + rng.range(-w / 4, w / 4), h + 0.8, z + rng.range(-d / 4, d / 4));
      group.add(ac);
    }
    return mesh;
  }

  // Buildings: one or two per block, tall towers downtown, low rows by the beach.
  for (let bi = -4; bi < 4; bi++) {
    for (let bj = -4; bj < 4; bj++) {
      const cx = (bi + 0.5) * PITCH;
      const cz = (bj + 0.5) * PITCH;
      const downtown = Math.abs(bi) <= 1 && Math.abs(bj) <= 1;
      const beachRow = bj === 3;
      if (rng.chance(0.12)) continue; // empty lot / park
      const count = downtown ? 1 : rng.chance(0.45) ? 2 : 1;
      for (let k = 0; k < count; k++) {
        const ox = count === 2 ? (k === 0 ? -11 : 11) : 0;
        const oz = count === 2 ? (k === 0 ? -11 : 11) : 0;
        const w = rng.range(16, 26);
        const d = rng.range(16, 26);
        let h;
        if (downtown) h = rng.range(42, 95);
        else if (beachRow) h = rng.range(8, 16);
        else h = rng.range(10, 30);
        const mat = downtown ? towerMats[rng.int(0, towerMats.length - 1)] : facadeMats[rng.int(0, facadeMats.length - 1)];
        addBuilding(cx + ox, cz + oz, w, d, h, mat);
      }
    }
  }

  // Solmar Tower: the landmark at the very centre of downtown.
  const tower = addBuilding(0, 0, 30, 30, 130, towerMats[0]);
  tower.material = new THREE.MeshLambertMaterial({ map: makeFacadeTexture(0x8fb8d8, 0.65, rng), emissive: 0x223344 });
  const spire = new THREE.Mesh(new THREE.CylinderGeometry(1.2, 2.4, 18, 8), new THREE.MeshLambertMaterial({ color: 0xffd94d, emissive: 0xaa7711 }));
  spire.position.set(0, 139, 0);
  group.add(spire);

  // The pier: planks out into the bay with a lighthouse at the end.
  const pierMat = new THREE.MeshLambertMaterial({ color: 0x8a6a4a });
  const pier = new THREE.Mesh(boxGeo, pierMat);
  pier.scale.set(10, 1.2, 90);
  pier.position.set(-120, 0.6, WATER_Z + 45);
  pier.castShadow = true;
  group.add(pier);
  colliders.push({ minX: -125, maxX: -115, minZ: WATER_Z, maxZ: WATER_Z + 90 });
  const lightMat = new THREE.MeshLambertMaterial({ color: 0xe8e8e8 });
  const redMat = new THREE.MeshLambertMaterial({ color: 0xd84a3a });
  const lighthouse = new THREE.Group();
  const lhBase = new THREE.Mesh(new THREE.CylinderGeometry(4, 5, 22, 12), lightMat);
  lhBase.position.y = 11;
  const lhTop = new THREE.Mesh(new THREE.CylinderGeometry(3, 3, 4, 12), redMat);
  lhTop.position.y = 24;
  const lhLamp = new THREE.Mesh(new THREE.SphereGeometry(2.2, 12, 8), new THREE.MeshLambertMaterial({ color: 0xfff2a0, emissive: 0xffd94d }));
  lhLamp.position.y = 27;
  lhBase.castShadow = true;
  lighthouse.add(lhBase, lhTop, lhLamp);
  lighthouse.position.set(-120, 1, WATER_Z + 88);
  group.add(lighthouse);
  colliders.push({ minX: -126, maxX: -114, minZ: WATER_Z + 82, maxZ: WATER_Z + 94 });

  // Palm trees along the beach and the avenues.
  const trunkMat = new THREE.MeshLambertMaterial({ color: 0x8a6a42 });
  const leafMat = new THREE.MeshLambertMaterial({ color: 0x3a9a4a });
  const trunkGeo = new THREE.CylinderGeometry(0.35, 0.55, 7, 6);
  const leafGeo = new THREE.ConeGeometry(3.2, 3.4, 6);
  const palmSpots = [];
  for (let x = -250; x <= 250; x += 25) palmSpots.push([x + rng.range(-3, 3), BEACH_Z - 8 + rng.range(-2, 2)]);
  for (const line of [-180, -60, 60, 180]) {
    for (let v = -240; v <= 240; v += 60) palmSpots.push([line + 9, v + rng.range(-4, 4)]);
  }
  for (const [px, pz] of palmSpots) {
    const trunk = new THREE.Mesh(trunkGeo, trunkMat);
    trunk.position.set(px, 3.5, pz);
    trunk.rotation.z = rng.range(-0.08, 0.08);
    trunk.castShadow = true;
    const leaves = new THREE.Mesh(leafGeo, leafMat);
    leaves.position.set(px, 8.2, pz);
    leaves.castShadow = true;
    group.add(trunk, leaves);
  }

  // Streetlights at intersections.
  const poleMat = new THREE.MeshLambertMaterial({ color: 0x3a3a3a });
  const lampMat = new THREE.MeshLambertMaterial({ color: 0xfff2b8, emissive: 0xccaa33 });
  const poleGeo = new THREE.CylinderGeometry(0.18, 0.22, 7, 6);
  const lampGeo = new THREE.SphereGeometry(0.7, 8, 6);
  for (const lx of [-180, -60, 60, 180]) {
    for (const lz of [-180, -60, 60, 180]) {
      const pole = new THREE.Mesh(poleGeo, poleMat);
      pole.position.set(lx + 8.5, 3.5, lz + 8.5);
      const lamp = new THREE.Mesh(lampGeo, lampMat);
      lamp.position.set(lx + 8.5, 7.2, lz + 8.5);
      group.add(pole, lamp);
    }
  }

  // Traffic lights at the four downtown intersections.
  const tlPoleGeo = new THREE.BoxGeometry(0.5, 6, 0.5);
  const tlBoxGeo = new THREE.BoxGeometry(1.2, 3, 1.2);
  const tlRed = new THREE.MeshLambertMaterial({ color: 0x331111, emissive: 0xff2222 });
  const tlGreen = new THREE.MeshLambertMaterial({ color: 0x113311, emissive: 0x22ff44 });
  for (const [tx, tz, on] of [[-60, -60, true], [60, -60, false], [-60, 60, false], [60, 60, true]]) {
    const pole = new THREE.Mesh(tlPoleGeo, poleMat);
    pole.position.set(tx + 8, 3, tz + 8);
    const box = new THREE.Mesh(tlBoxGeo, on ? tlGreen : tlRed);
    box.position.set(tx + 8, 6.4, tz + 8);
    group.add(pole, box);
  }

  // Spawn points the game uses: hideout, hospital, mission spots, pickups.
  const spawnPoints = {
    hideout: { x: -210, z: -210 },
    hospital: { x: 210, z: 210 },
    marina: { x: 210, z: 60 },
    pier: { x: -120, z: WATER_Z - 6 },
    beach: { x: 60, z: BEACH_Z - 6 },
    downtown: { x: 30, z: -30 },
    oldTown: { x: -210, z: 120 },
    northGate: { x: 0, z: -240 },
  };

  function nearestRoad(x, z) {
    let best = ROAD_LINES[0];
    let bestD = Infinity;
    for (const line of ROAD_LINES) {
      const d = Math.abs(line - x);
      if (d < bestD) { bestD = d; best = line; }
    }
    return { line: best, axis: 'x', dist: bestD };
  }

  function snapToRoad(x, z) {
    // Snap a point onto the nearest road centre line, keeping the other coordinate.
    const dx = nearestRoad(x, z);
    let bestZ = ROAD_LINES[0];
    let bestD = Infinity;
    for (const line of ROAD_LINES) {
      const d = Math.abs(line - z);
      if (d < bestD) { bestD = d; bestZ = line; }
    }
    if (dx.dist <= bestD) return { x: dx.line, z, axis: 'x' };
    return { x, z: bestZ, axis: 'z' };
  }

  function collideCircle(x, z, radius) {
    for (const c of colliders) {
      const cx = clamp(x, c.minX, c.maxX);
      const cz = clamp(z, c.minZ, c.maxZ);
      const dx = x - cx;
      const dz = z - cz;
      const d2 = dx * dx + dz * dz;
      if (d2 < radius * radius) {
        return { hit: true, pushX: dx, pushZ: dz, dist: Math.sqrt(d2) || 0.001 };
      }
    }
    return { hit: false };
  }

  function update(dt, time) {
    shimmer.position.x = Math.sin(time * 0.25) * 6;
    shimmer.material.opacity = 0.28 + Math.sin(time * 0.6) * 0.08;
  }

  return {
    group, colliders, buildings, spawnPoints, roadLines: ROAD_LINES,
    nearestRoad, snapToRoad, collideCircle, update,
  };
}

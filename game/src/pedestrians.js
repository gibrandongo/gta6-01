// The people of Solmar Bay: pedestrians stroll the sidewalks, cross at intersections,
// scatter when a gun goes off or a car comes at them, and sometimes call the police.
// A few stand around as taxi passengers and mission contacts.

import { createRandom, clamp, angleLerp, distance2D } from './utils.js';

const SHIRT_COLORS = [0xe8e8e8, 0x3a6ad8, 0xd8a83a, 0x4ad87a, 0xd84a3a, 0x8a4ad8, 0x3ad8d0, 0xe8a0c0];
const PANTS_COLORS = [0x2a2a2a, 0x3a4a6a, 0x6a5a3a, 0x4a4a4a];

export function createPedestrians(scene, city, rng) {
  const peds = [];
  const roadLines = city.roadLines;

  function buildMesh(shirt, pants, skin) {
    const group = new THREE.Group();
    const torso = new THREE.Mesh(new THREE.BoxGeometry(0.8, 0.95, 0.45), new THREE.MeshLambertMaterial({ color: shirt }));
    torso.position.y = 1.2;
    torso.castShadow = true;
    const head = new THREE.Mesh(new THREE.BoxGeometry(0.46, 0.46, 0.46), new THREE.MeshLambertMaterial({ color: skin }));
    head.position.y = 1.95;
    const legL = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.75, 0.34), new THREE.MeshLambertMaterial({ color: pants }));
    legL.position.set(-0.2, 0.38, 0);
    const legR = legL.clone();
    legR.position.x = 0.2;
    group.add(torso, head, legL, legR);
    group.userData.legL = legL;
    group.userData.legR = legR;
    return group;
  }

  function randomSidewalkPoint() {
    const axis = rng.chance(0.5) ? 'x' : 'z';
    const line = roadLines[rng.int(0, roadLines.length - 1)];
    const along = rng.range(-240, 240);
    const side = rng.chance(0.5) ? 9.5 : -9.5;
    if (axis === 'x') return { x: line + side, z: along, axis };
    return { x: along, z: line + side, axis };
  }

  function spawnPed(nearX, nearZ) {
    const p = nearX === undefined ? randomSidewalkPoint() : { x: nearX, z: nearZ, axis: rng.chance(0.5) ? 'x' : 'z' };
    const mesh = buildMesh(
      SHIRT_COLORS[rng.int(0, SHIRT_COLORS.length - 1)],
      PANTS_COLORS[rng.int(0, PANTS_COLORS.length - 1)],
      [0xc8906a, 0x8a5a3a, 0xe8b890, 0x6a3a22][rng.int(0, 3)],
    );
    scene.add(mesh);
    const ped = {
      mesh, x: p.x, z: p.z, axis: p.axis,
      heading: p.axis === 'x' ? (rng.chance(0.5) ? Math.PI / 2 : -Math.PI / 2) : (rng.chance(0.5) ? 0 : Math.PI),
      speed: rng.range(1.2, 2.4), walkPhase: rng.next() * 6,
      health: 100, dead: false, deadTimer: 0, fleeing: false, fleeTimer: 0,
      isPassenger: false, isOfficer: false,
    };
    mesh.position.set(p.x, 0, p.z);
    mesh.rotation.y = ped.heading;
    peds.push(ped);
    return ped;
  }

  for (let i = 0; i < 26; i++) spawnPed();

  function scareNearby(x, z, radius) {
    for (const ped of peds) {
      if (ped.dead || ped.isOfficer) continue;
      if (distance2D(x, z, ped.x, ped.z) < radius) {
        ped.fleeing = true;
        ped.fleeTimer = 4;
        ped.heading = Math.atan2(ped.x - x, ped.z - z);
      }
    }
  }

  function update(dt, playerX, playerZ, playerSpeed, playerInCar) {
    for (const ped of peds) {
      if (ped.dead) {
        ped.deadTimer += dt;
        if (ped.deadTimer > 6) {
          // Fade the fallen away and respawn a fresh face elsewhere.
          scene.remove(ped.mesh);
          const i = peds.indexOf(ped);
          if (i >= 0) peds.splice(i, 1);
          spawnPed();
        }
        continue;
      }
      if (ped.fleeTimer > 0) {
        ped.fleeTimer -= dt;
        if (ped.fleeTimer <= 0) ped.fleeing = false;
      }
      // Flee a fast car bearing down on them.
      if (playerInCar && playerSpeed > 8 && distance2D(playerX, playerZ, ped.x, ped.z) < 14) {
        ped.fleeing = true;
        ped.fleeTimer = 2;
        ped.heading = Math.atan2(ped.x - playerX, ped.z - playerZ);
      }
      const speed = ped.fleeing ? 5.5 : ped.speed;
      // Turn at intersections, or when blocked by a building.
      const onRoadX = roadLines.some((l) => Math.abs(ped.x - l) < 11);
      const onRoadZ = roadLines.some((l) => Math.abs(ped.z - l) < 11);
      if ((onRoadX && onRoadZ) && rng.next() < dt * 0.4 && !ped.fleeing) {
        ped.heading += rng.pick([-Math.PI / 2, Math.PI / 2, Math.PI]);
        ped.axis = Math.abs(Math.sin(ped.heading)) > 0.7 ? 'z' : 'x';
      }
      const nx = ped.x + Math.sin(ped.heading) * speed * dt;
      const nz = ped.z + Math.cos(ped.heading) * speed * dt;
      if (!city.collideCircle(nx, nz, 0.6).hit && Math.abs(nx) < 262 && Math.abs(nz) < 300) {
        ped.x = nx;
        ped.z = nz;
      } else {
        ped.heading += Math.PI / 2;
      }
      ped.walkPhase += dt * speed * 2.2;
      const swing = Math.sin(ped.walkPhase) * 0.5;
      ped.mesh.userData.legL.rotation.x = swing;
      ped.mesh.userData.legR.rotation.x = -swing;
      ped.mesh.position.set(ped.x, 0, ped.z);
      ped.mesh.rotation.y = ped.heading;
    }
  }

  function killPed(ped) {
    ped.dead = true;
    ped.deadTimer = 0;
    ped.mesh.rotation.x = -Math.PI / 2;
    ped.mesh.position.y = 0.4;
  }

  function nearestAlive(x, z, maxDist) {
    let best = null;
    let bestD = maxDist;
    for (const ped of peds) {
      if (ped.dead) continue;
      const d = distance2D(x, z, ped.x, ped.z);
      if (d < bestD) { bestD = d; best = ped; }
    }
    return best;
  }

  return { peds, spawnPed, update, scareNearby, killPed, nearestAlive };
}

// The Solmar Bay Police Department: a five-star wanted level, pursuit cars that ram and
// block, and officers on foot who chase the player down. Heat cools when the player stays
// out of sight; getting caught on foot at low health means BUSTED.

import { clamp, angleLerp, distance2D } from './utils.js';

const STAR_NAMES = ['Clean', 'One Star', 'Two Stars', 'Three Stars', 'Four Stars', 'Five Stars'];

export function createPolice(scene, city, vehicles, pedestrians, rng) {
  let wanted = 0;
  let heat = 0; // 0..100, drives the star count
  let hiddenTimer = 0;
  let spawnTimer = 0;
  let bustedTimer = 0;
  const officers = []; // on-foot police
  const MAX_CARS = [0, 1, 2, 3, 4, 5];

  function addHeat(amount) {
    heat = clamp(heat + amount, 0, 100);
    const newWanted = heat < 8 ? 0 : heat < 25 ? 1 : heat < 45 ? 2 : heat < 65 ? 3 : heat < 85 ? 4 : 5;
    const rose = newWanted > wanted;
    wanted = newWanted;
    return rose;
  }

  function officerMesh() {
    const group = new THREE.Group();
    const navy = new THREE.MeshLambertMaterial({ color: 0x1a2a4a });
    const torso = new THREE.Mesh(new THREE.BoxGeometry(0.85, 0.95, 0.45), navy);
    torso.position.y = 1.2;
    torso.castShadow = true;
    const head = new THREE.Mesh(new THREE.BoxGeometry(0.46, 0.46, 0.46), new THREE.MeshLambertMaterial({ color: 0xc8906a }));
    head.position.y = 1.95;
    const cap = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.14, 0.5), navy);
    cap.position.y = 2.2;
    const legL = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.75, 0.34), navy);
    legL.position.set(-0.2, 0.38, 0);
    const legR = legL.clone();
    legR.position.x = 0.2;
    group.add(torso, head, cap, legL, legR);
    group.userData.legL = legL;
    group.userData.legR = legR;
    return group;
  }

  function spawnOfficer(x, z) {
    const mesh = officerMesh();
    scene.add(mesh);
    const off = { mesh, x, z, heading: 0, speed: 6.5, health: 100, dead: false, walkPhase: 0, punchTimer: 0 };
    mesh.position.set(x, 0, z);
    officers.push(off);
    return off;
  }

  function spawnPursuitCar(playerX, playerZ) {
    // Appear on a road a little way off, so they arrive with sirens blaring.
    const angle = rng.next() * Math.PI * 2;
    const dist = 55 + rng.next() * 30;
    const p = city.snapToRoad(playerX + Math.sin(angle) * dist, playerZ + Math.cos(angle) * dist);
    const car = vehicles.spawnPoliceCar(p.x, p.z);
    car.heading = Math.atan2(playerX - p.x, playerZ - p.z);
    return car;
  }

  function update(dt, player, onBusted, onWasted) {
    const px = player.state.x;
    const pz = player.state.z;
    const inCar = player.isInCar();
    const playerCar = inCar ? player.state.car : null;

    // Wanted decay: out of every cop's sight for a while and the heat drops.
    const nearestCop = nearestCopDistance(px, pz);
    if (wanted > 0 && nearestCop > 70) {
      hiddenTimer += dt;
      if (hiddenTimer > 6) {
        heat = Math.max(0, heat - dt * 4);
        const nw = heat < 8 ? 0 : heat < 25 ? 1 : heat < 45 ? 2 : heat < 65 ? 3 : heat < 85 ? 4 : 5;
        wanted = nw;
      }
    } else {
      hiddenTimer = 0;
    }

    // Keep the right number of pursuit cars on the road.
    const wantCars = MAX_CARS[wanted];
    spawnTimer -= dt;
    if (vehicles.policeCars.length < wantCars && spawnTimer <= 0) {
      spawnPursuitCar(px, pz);
      spawnTimer = 2.5;
    }
    // Extra cars leave when the heat drops.
    while (vehicles.policeCars.length > wantCars) {
      const car = vehicles.policeCars[vehicles.policeCars.length - 1];
      vehicles.removePoliceCar(car);
    }

    // Pursuit cars chase the player's position and ram.
    for (const car of [...vehicles.policeCars]) {
      const targetX = inCar ? playerCar.x : px;
      const targetZ = inCar ? playerCar.z : pz;
      const d = distance2D(car.x, car.z, targetX, targetZ);
      const desired = Math.atan2(targetX - car.x, targetZ - car.z);
      car.heading = angleLerp(car.heading, desired, dt * 2.2);
      const wantSpeed = d > 6 ? 20 + wanted * 2.5 : 6;
      car.speed = THREE.MathUtils.lerp(car.speed, wantSpeed, dt * 1.2);
      car.x += Math.sin(car.heading) * car.speed * dt;
      car.z += Math.cos(car.heading) * car.speed * dt;
      car.mesh.position.set(car.x, 0, car.z);
      car.mesh.rotation.y = car.heading;
      car.sirenPhase += dt * 4;
      // Ram the player's car.
      if (inCar) {
        const cd = distance2D(car.x, car.z, playerCar.x, playerCar.z);
        if (cd < 4.4) {
          const push = (4.4 - cd) * 0.8;
          const dx = (playerCar.x - car.x) / (cd || 1);
          const dz = (playerCar.z - car.z) / (cd || 1);
          playerCar.x += dx * push;
          playerCar.z += dz * push;
          playerCar.speed *= 0.82;
          playerCar.health -= dt * 6;
          if (playerCar.health <= 0) {
            playerCar.health = 0;
            // The car is wrecked: the player is dragged out and the chase continues on foot.
            if (player.exitCar) player.exitCar(true);
          }
        }
      } else if (d < 5 && wanted >= 2) {
        // A patrol car at close range on foot: an officer gets out.
        if (officers.length < wanted && rng.next() < dt * 0.8) {
          spawnOfficer(car.x + 2, car.z + 2);
        }
      }
      if (car.health <= 0) {
        vehicles.removePoliceCar(car);
        addHeat(6);
      }
    }

    // Officers on foot chase and tackle.
    for (const off of [...officers]) {
      if (off.dead) continue;
      const d = distance2D(off.x, off.z, px, pz);
      const desired = Math.atan2(px - off.x, pz - off.z);
      off.heading = angleLerp(off.heading, desired, dt * 6);
      if (d > 1.4) {
        off.x += Math.sin(off.heading) * off.speed * dt;
        off.z += Math.cos(off.heading) * off.speed * dt;
        off.walkPhase += dt * 9;
      }
      const swing = Math.sin(off.walkPhase) * 0.5;
      off.mesh.userData.legL.rotation.x = swing;
      off.mesh.userData.legR.rotation.x = -swing;
      off.mesh.position.set(off.x, 0, off.z);
      off.mesh.rotation.y = off.heading;
      if (d < 1.6) {
        off.punchTimer -= dt;
        if (off.punchTimer <= 0) {
          off.punchTimer = 0.9;
          const died = player.damage(8);
          if (died) onWasted();
        }
        // Standing next to a cop for too long at low health is a bust.
        if (player.state.health < 25) {
          bustedTimer += dt;
          if (bustedTimer > 2.5) {
            bustedTimer = 0;
            onBusted();
          }
        }
      }
      if (off.health <= 0) {
        off.dead = true;
        off.mesh.rotation.x = -Math.PI / 2;
        off.mesh.position.y = 0.4;
        addHeat(10);
      }
    }
    // Clear fallen officers after a while.
    for (const off of [...officers]) {
      if (off.dead) {
        scene.remove(off.mesh);
        officers.splice(officers.indexOf(off), 1);
      }
    }
    return wanted;
  }

  function nearestCopDistance(px, pz) {
    let best = Infinity;
    for (const car of vehicles.policeCars) best = Math.min(best, distance2D(px, pz, car.x, car.z));
    for (const off of officers) if (!off.dead) best = Math.min(best, distance2D(px, pz, off.x, off.z));
    return best;
  }

  function clearAll() {
    for (const car of [...vehicles.policeCars]) vehicles.removePoliceCar(car);
    for (const off of officers) scene.remove(off.mesh);
    officers.length = 0;
    wanted = 0;
    heat = 0;
    hiddenTimer = 0;
  }

  function setWanted(stars) {
    wanted = clamp(stars, 0, 5);
    heat = [0, 12, 30, 50, 70, 90][wanted];
  }

  return {
    get wanted() { return wanted; },
    get heat() { return heat; },
    officers,
    addHeat, update, clearAll, setWanted,
    starName() { return STAR_NAMES[wanted]; },
  };
}

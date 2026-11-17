// Cars: the player's ride, traffic and the police fleet. One shared mesh builder makes
// every car from boxes and cylinders; traffic follows the road grid and turns at
// intersections; the player's car is simple arcade physics with building collision.

import { createRandom, clamp, angleDelta, angleLerp, distance2D } from './utils.js';
import { PITCH, ROAD_HALF } from './city.js';

const CAR_COLORS = [
  0xd84a3a, 0x3a6ad8, 0xe8c83a, 0x4ad87a, 0xe8e8e8, 0x2a2a2a, 0x8a4ad8,
  0xd88a3a, 0x3ad8d0, 0x9a9a9a, 0x5a3a2a, 0xc8d83a,
];
const CAR_NAMES = [
  'Comet GT', 'Sunrunner', 'Bayliner', 'Palm Cruiser', 'Vortex', 'Tide Runner',
  'Coral Coupe', 'Street Hawk', 'Lagoon LX', 'Sandstorm', 'Harbor Hauler', 'Neon Fox',
];

const bodyGeo = new THREE.BoxGeometry(2.0, 0.62, 4.2);
const cabinGeo = new THREE.BoxGeometry(1.7, 0.58, 2.0);
const wheelGeo = new THREE.CylinderGeometry(0.38, 0.38, 0.3, 10);
const lightGeo = new THREE.BoxGeometry(0.34, 0.16, 0.06);

export function buildCarMesh(color, isPolice) {
  const group = new THREE.Group();
  const bodyMat = new THREE.MeshLambertMaterial({ color });
  const body = new THREE.Mesh(bodyGeo, bodyMat);
  body.position.y = 0.55;
  body.castShadow = true;
  group.add(body);
  const cabin = new THREE.Mesh(cabinGeo, new THREE.MeshLambertMaterial({ color: 0x1c2836 }));
  cabin.position.set(0, 1.1, -0.25);
  cabin.castShadow = true;
  group.add(cabin);
  const wheelMat = new THREE.MeshLambertMaterial({ color: 0x141414 });
  for (const [wx, wz] of [[-0.95, 1.35], [0.95, 1.35], [-0.95, -1.35], [0.95, -1.35]]) {
    const wheel = new THREE.Mesh(wheelGeo, wheelMat);
    wheel.rotation.z = Math.PI / 2;
    wheel.position.set(wx, 0.38, wz);
    group.add(wheel);
  }
  const headMat = new THREE.MeshLambertMaterial({ color: 0xfff2b8, emissive: 0xaa8822 });
  for (const hx of [-0.6, 0.6]) {
    const light = new THREE.Mesh(lightGeo, headMat);
    light.position.set(hx, 0.62, 2.12);
    group.add(light);
  }
  if (isPolice) {
    const bar = new THREE.Mesh(new THREE.BoxGeometry(1.1, 0.18, 0.4), new THREE.MeshLambertMaterial({ color: 0x2233aa }));
    bar.position.set(0, 1.5, -0.25);
    group.add(bar);
    const beacon = new THREE.Mesh(new THREE.SphereGeometry(0.22, 8, 6), new THREE.MeshLambertMaterial({ color: 0xff2222, emissive: 0xff2222 }));
    beacon.position.set(-0.3, 1.62, -0.25);
    group.add(beacon);
    const beacon2 = new THREE.Mesh(new THREE.SphereGeometry(0.22, 8, 6), new THREE.MeshLambertMaterial({ color: 0x2244ff, emissive: 0x2244ff }));
    beacon2.position.set(0.3, 1.62, -0.25);
    group.add(beacon2);
  }
  return group;
}

export function createVehicles(scene, city, rng) {
  const cars = []; // traffic + parked cars
  const policeCars = [];
  const roadLines = city.roadLines;

  function randomRoadPoint() {
    const axis = rng.chance(0.5) ? 'x' : 'z';
    const line = roadLines[rng.int(0, roadLines.length - 1)];
    const along = rng.range(-CITY_EDGE(), CITY_EDGE());
    return axis === 'x' ? { x: line, z: along, axis } : { x: along, z: line, axis };
  }
  function CITY_EDGE() { return 240; }

  function spawnTrafficCar() {
    const p = randomRoadPoint();
    const color = CAR_COLORS[rng.int(0, CAR_COLORS.length - 1)];
    const name = CAR_NAMES[rng.int(0, CAR_NAMES.length - 1)];
    const mesh = buildCarMesh(color, false);
    scene.add(mesh);
    const car = {
      mesh, name, color, kind: 'traffic',
      x: p.x, z: p.z, heading: p.axis === 'x' ? (rng.chance(0.5) ? 0 : Math.PI) : (rng.chance(0.5) ? Math.PI / 2 : -Math.PI / 2),
      speed: 0, targetSpeed: rng.range(7, 13), health: 100, parked: false,
      axis: p.axis, lane: rng.chance(0.5) ? 3.2 : -3.2,
    };
    mesh.position.set(car.x, 0, car.z);
    mesh.rotation.y = car.heading;
    cars.push(car);
    return car;
  }

  function spawnParkedCar() {
    const p = randomRoadPoint();
    const color = CAR_COLORS[rng.int(0, CAR_COLORS.length - 1)];
    const mesh = buildCarMesh(color, false);
    scene.add(mesh);
    const car = {
      mesh, name: CAR_NAMES[rng.int(0, CAR_NAMES.length - 1)], color, kind: 'parked',
      x: p.x, z: p.z, heading: p.axis === 'x' ? (rng.chance(0.5) ? 0 : Math.PI) : (rng.chance(0.5) ? Math.PI / 2 : -Math.PI / 2),
      speed: 0, targetSpeed: 0, health: 100, parked: true,
      axis: p.axis, lane: rng.chance(0.5) ? 5.4 : -5.4,
    };
    // Parked cars sit at the road edge.
    if (p.axis === 'x') car.x = p.x + car.lane;
    else car.z = p.z + car.lane;
    mesh.position.set(car.x, 0, car.z);
    mesh.rotation.y = car.heading;
    cars.push(car);
    return car;
  }

  for (let i = 0; i < 14; i++) spawnTrafficCar();
  for (let i = 0; i < 8; i++) spawnParkedCar();

  function spawnPoliceCar(x, z) {
    const mesh = buildCarMesh(0xf0f0f0, true);
    scene.add(mesh);
    const car = {
      mesh, name: 'SBPD Interceptor', color: 0xf0f0f0, kind: 'police',
      x, z, heading: 0, speed: 0, targetSpeed: 0, health: 120, parked: false,
      axis: 'x', lane: 0, sirenPhase: rng.next() * 10,
    };
    mesh.position.set(x, 0, z);
    policeCars.push(car);
    return car;
  }

  function removePoliceCar(car) {
    scene.remove(car.mesh);
    const i = policeCars.indexOf(car);
    if (i >= 0) policeCars.splice(i, 1);
  }

  function nearestCar(x, z, maxDist, kinds) {
    let best = null;
    let bestD = maxDist;
    for (const car of cars) {
      if (kinds && !kinds.includes(car.kind)) continue;
      const d = distance2D(x, z, car.x, car.z);
      if (d < bestD) { bestD = d; best = car; }
    }
    return best;
  }

  function isAtIntersection(car) {
    const nearX = roadLines.some((l) => Math.abs(car.x - l) < 6);
    const nearZ = roadLines.some((l) => Math.abs(car.z - l) < 6);
    return nearX && nearZ;
  }

  function updateTraffic(dt, playerX, playerZ, playerCar) {
    for (const car of cars) {
      if (car.parked) continue;
      if (car === playerCar) continue; // the player's car is driven by drivePlayerCar, never by traffic
      // Slow for the car ahead on the same road.
      let ahead = Infinity;
      for (const other of cars) {
        if (other === car || other.parked) continue;
        const dx = other.x - car.x;
        const dz = other.z - car.z;
        const forward = Math.sin(car.heading) * dx + Math.cos(car.heading) * dz;
        const side = Math.abs(Math.cos(car.heading) * dx - Math.sin(car.heading) * dz);
        if (forward > 0 && forward < 14 && side < 3) ahead = Math.min(ahead, forward);
      }
      if (playerCar && playerCar !== car) {
        const dx = playerCar.x - car.x;
        const dz = playerCar.z - car.z;
        const forward = Math.sin(car.heading) * dx + Math.cos(car.heading) * dz;
        const side = Math.abs(Math.cos(car.heading) * dx - Math.sin(car.heading) * dz);
        if (forward > 0 && forward < 12 && side < 3) ahead = Math.min(ahead, forward);
      }
      const want = ahead < 10 ? 0 : car.targetSpeed;
      car.speed = THREE.MathUtils.lerp(car.speed, want, dt * 1.5);
      // Turn at intersections sometimes.
      if (isAtIntersection(car) && rng.next() < dt * 0.5) {
        const turn = rng.pick([-Math.PI / 2, 0, Math.PI / 2]);
        car.heading += turn;
        car.axis = Math.abs(Math.sin(car.heading)) > 0.7 ? 'z' : 'x';
        // Snap onto the road line after the turn.
        const snapped = city.snapToRoad(car.x, car.z);
        car.x = snapped.x;
        car.z = snapped.z;
      }
      car.heading = angleLerp(car.heading, Math.round(car.heading / (Math.PI / 2)) * (Math.PI / 2), dt * 2);
      car.x += Math.sin(car.heading) * car.speed * dt;
      car.z += Math.cos(car.heading) * car.speed * dt;
      // Keep inside the city; wrap around the far edge.
      if (Math.abs(car.x) > 255 || Math.abs(car.z) > 255) {
        const p = randomRoadPoint();
        car.x = p.x;
        car.z = p.z;
        car.heading = p.axis === 'x' ? 0 : Math.PI / 2;
      }
      // Building collision: stop and turn around.
      const hit = city.collideCircle(car.x, car.z, 2.2);
      if (hit.hit) {
        car.x -= Math.sin(car.heading) * car.speed * dt * 2;
        car.z -= Math.cos(car.heading) * car.speed * dt * 2;
        car.heading += Math.PI;
        car.speed = 0;
      }
      car.mesh.position.set(car.x, 0, car.z);
      car.mesh.rotation.y = car.heading;
      // Wheel spin is skipped: wheels are fixed cylinders, motion reads through the world.
    }
  }

  // Arcade driving for the player's car. Returns collision events.
  function drivePlayerCar(car, input, dt) {
    const events = { crashed: false, hitBuilding: false };
    const accel = input.forward ? 22 : input.back ? -14 : 0;
    car.speed += accel * dt;
    if (!input.forward && !input.back) car.speed *= Math.max(0, 1 - dt * 1.2);
    if (input.handbrake) car.speed *= Math.max(0, 1 - dt * 4);
    car.speed = clamp(car.speed, -10, 34);
    const steer = (input.left ? 1 : 0) - (input.right ? 1 : 0);
    const steerAmount = steer * 1.9 * dt * clamp(Math.abs(car.speed) / 10, 0, 1) * (car.speed < 0 ? -1 : 1);
    car.heading += steerAmount;
    const nx = car.x + Math.sin(car.heading) * car.speed * dt;
    const nz = car.z + Math.cos(car.heading) * car.speed * dt;
    const hit = city.collideCircle(nx, nz, 2.1);
    if (hit.hit) {
      const push = Math.hypot(hit.pushX, hit.pushZ) || 1;
      car.x += (hit.pushX / push) * 0.4;
      car.z += (hit.pushZ / push) * 0.4;
      if (Math.abs(car.speed) > 8) events.crashed = true;
      car.speed *= -0.25;
      events.hitBuilding = true;
    } else {
      car.x = nx;
      car.z = nz;
    }
    // Soft bump against traffic.
    for (const other of cars) {
      if (other === car || other.parked) continue;
      const d = distance2D(car.x, car.z, other.x, other.z);
      if (d < 4 && d > 0.01) {
        const push = (4 - d) * 0.5;
        const dx = (car.x - other.x) / d;
        const dz = (car.z - other.z) / d;
        car.x += dx * push;
        car.z += dz * push;
        other.x -= dx * push * 0.4;
        other.z -= dz * push * 0.4;
        if (Math.abs(car.speed) > 6) events.crashed = true;
        car.speed *= 0.7;
      }
    }
    // Beach and water bounds.
    car.x = clamp(car.x, -268, 268);
    car.z = clamp(car.z, -268, 296);
    car.mesh.position.set(car.x, 0, car.z);
    car.mesh.rotation.y = car.heading;
    // Body lean and tilt sell the speed.
    car.mesh.rotation.z = -steer * clamp(Math.abs(car.speed) / 34, 0, 1) * 0.06;
    car.mesh.rotation.x = clamp(-accel / 22, -1, 1) * 0.02;
    return events;
  }

  return {
    cars, policeCars, spawnTrafficCar, spawnParkedCar, spawnPoliceCar, removePoliceCar,
    nearestCar, updateTraffic, drivePlayerCar,
  };
}

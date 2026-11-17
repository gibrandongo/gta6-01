// The simulation: the player on foot and in cars, traffic, pedestrians, police
// and the wanted level, sun coins, the camera and the list of moving boxes the
// renderer draws. Missions and combat live in missions.js and work on this state.

import { CAR, CITY, COLLECTIBLES, COMBAT, PALETTE, PLAYER, POLICE, TRAFFIC, PEDS, WANTED } from './config.js';
import { hexToRgb, } from './util.js';
import { insideBuilding, resolveBuildings } from './city.js';

const CAR_COLORS = ['#d94f3d', '#3d7dd9', '#e8c832', '#e8e8e8', '#2e2e34', '#7a4fd9', '#3dd9a0', '#d97a2e', '#c4c9d1'];
const PED_COLORS = ['#e8e4d8', '#4a6fa5', '#c96a8a', '#7a9a5a', '#d9a03d', '#8a6fb8'];
const SKIN = ['#e8b98a', '#c98d5f', '#8a5a3b', '#f0c8a0'];

function clamp(v, a, b) {
  return Math.max(a, Math.min(b, v));
}

function angleLerp(a, b, t) {
  let d = b - a;
  while (d > Math.PI) d -= Math.PI * 2;
  while (d < -Math.PI) d += Math.PI * 2;
  return a + d * t;
}

function dist2(ax, az, bx, bz) {
  const dx = ax - bx;
  const dz = az - bz;
  return dx * dx + dz * dz;
}

export function createSim(city, random, audio) {
  const state = {
    time: 0,
    clock: 17.4, // golden hour, 17:24
    cash: 150,
    coins: 0,
    coinsTaken: [],
    player: {
      x: -30, z: -30, angle: 0, vx: 0, vz: 0, health: PLAYER.health,
      onFoot: true, carId: -1, armed: false, weapon: 'fists', hurtTimer: 0, regenTimer: 0,
    },
    cars: [],
    peds: [],
    enemies: [],
    wanted: { stars: 0, coolTimer: 0 },
    police: [],
    mission: null,
    missionIndex: 0,
    storyDone: false,
    messages: [],
    effects: [],
    busted: false,
    camYaw: 0,
    camPitch: 0.32,
    lastDrag: -10,
    speedKmh: 0,
  };

  // --- cars ---------------------------------------------------------------
  function addCar(kind, x, z, angle, colorHex) {
    const id = state.cars.length;
    const car = {
      id, kind, x, z, angle, speed: 0, steer: 0, color: colorHex,
      health: CAR.health, occupied: kind === 'traffic',
      laneAxis: 'x', laneLine: 0, laneDir: 1, turnCooldown: 0,
      targetSpeed: 0, brakeLight: false,
    };
    state.cars.push(car);
    return car;
  }

  function spawnTraffic() {
    const lines = city.lines;
    for (let i = 0; i < TRAFFIC.count; i += 1) {
      const vertical = random() < 0.5;
      const line = lines[Math.floor(random() * lines.length)];
      const along = (random() * 2 - 1) * (CITY.half - 20);
      const dir = random() < 0.5 ? 1 : -1;
      const car = addCar('traffic',
        vertical ? line + dir * 3.5 : along,
        vertical ? along : line + dir * 3.5,
        vertical ? (dir > 0 ? 0 : Math.PI) : (dir > 0 ? Math.PI / 2 : -Math.PI / 2),
        CAR_COLORS[Math.floor(random() * CAR_COLORS.length)]);
      car.laneAxis = vertical ? 'z' : 'x';
      car.laneLine = line;
      car.laneDir = dir;
      car.targetSpeed = TRAFFIC.speedMin + random() * (TRAFFIC.speedMax - TRAFFIC.speedMin);
      car.speed = car.targetSpeed;
    }
    // Parked cars the player can steal.
    for (let i = 0; i < 12; i += 1) {
      const spot = city.parkedSpots[Math.floor(random() * city.parkedSpots.length)];
      addCar('parked', spot.x, spot.z, spot.angle + (random() < 0.5 ? 0 : Math.PI),
        CAR_COLORS[Math.floor(random() * CAR_COLORS.length)]);
    }
    // The player's starter car is none: the first mission asks to steal one.
  }

  function spawnPeds() {
    for (let i = 0; i < PEDS.count; i += 1) {
      const onRoad = random() < 0.7;
      let x;
      let z;
      if (onRoad) {
        const line = city.lines[Math.floor(random() * city.lines.length)];
        const along = (random() * 2 - 1) * (CITY.half - 10);
        if (random() < 0.5) { x = line + (random() < 0.5 ? -8.5 : 8.5); z = along; }
        else { x = along; z = line + (random() < 0.5 ? -8.5 : 8.5); }
      } else {
        x = (random() * 2 - 1) * (CITY.half - 10);
        z = (random() * 2 - 1) * (CITY.half - 10);
      }
      if (insideBuilding(city.buildings, x, z, 1)) continue;
      state.peds.push({
        x, z, angle: random() * Math.PI * 2, speed: PEDS.speedMin + random() * (PEDS.speedMax - PEDS.speedMin),
        color: PED_COLORS[Math.floor(random() * PED_COLORS.length)],
        skin: SKIN[Math.floor(random() * SKIN.length)],
        state: 'walk', timer: random() * 6, downTimer: 0, fleeTimer: 0,
      });
    }
  }

  // Cars are looked up by their stable id, never by array index: the array is
  // filtered (traffic cleared for a screenshot), which would shift indices.
  function carById(id) {
    for (let i = 0; i < state.cars.length; i += 1) {
      if (state.cars[i].id === id) return state.cars[i];
    }
    return null;
  }

  function reset(newGame) {
    state.time = 0;
    state.cash = newGame ? 150 : state.cash;
    state.coins = 0;
    state.coinsTaken = [];
    state.player.x = -30;
    state.player.z = -30;
    state.player.angle = 0;
    state.player.vx = 0;
    state.player.vz = 0;
    state.player.health = PLAYER.health;
    state.player.onFoot = true;
    state.player.carId = -1;
    state.player.armed = false;
    state.player.weapon = 'fists';
    state.cars.length = 0;
    state.peds.length = 0;
    state.enemies.length = 0;
    state.police.length = 0;
    state.wanted.stars = 0;
    state.wanted.coolTimer = 0;
    state.mission = null;
    state.missionIndex = 0;
    state.storyDone = false;
    state.messages.length = 0;
    state.effects.length = 0;
    state.busted = false;
    state.camYaw = 0;
    state.speedKmh = 0;
    spawnTraffic();
    spawnPeds();
  }

  // --- messages -----------------------------------------------------------
  function say(text, seconds) {
    state.messages.push({ text, t: seconds || 4 });
  }

  // --- wanted ---------------------------------------------------------------
  function addWanted(stars, reason) {
    const before = state.wanted.stars;
    state.wanted.stars = clamp(state.wanted.stars + stars, 0, 5);
    state.wanted.coolTimer = WANTED.coolTime;
    if (state.wanted.stars > before && audio) audio.siren(true, state.time);
    if (reason) say(reason);
  }

  function updateWanted(dt) {
    const w = state.wanted;
    if (w.stars === 0) return;
    // Cool down when no police car is close.
    let nearest = Infinity;
    for (const p of state.police) {
      const d = dist2(p.x, p.z, state.player.x, state.player.z);
      if (d < nearest) nearest = d;
    }
    if (nearest > 45 * 45) {
      w.coolTimer -= dt;
      if (w.coolTimer <= 0) {
        w.stars -= 1;
        w.coolTimer = WANTED.coolTime;
        if (w.stars === 0) say('You lost the cops.');
      }
    } else {
      w.coolTimer = WANTED.coolTime;
    }
  }

  function updatePolice(dt) {
    const want = Math.min(state.wanted.stars * WANTED.carsPerStar, POLICE.maxCars);
    while (state.police.length < want) {
      // Spawn on the nearest road, some distance from the player.
      const line = city.lines.reduce((best, l) => (
        Math.abs(l - state.player.x) < Math.abs(best - state.player.x) ? l : best
      ), city.lines[0]);
      const along = state.player.z + (random() < 0.5 ? -55 : 55);
      const car = addCar('police', line + 3.5, clamp(along, -CITY.half, CITY.half), 0, PALETTE.police);
      car.targetSpeed = POLICE.chaseSpeed;
      car.speed = 10;
      state.police.push(car);
    }
    while (state.police.length > want) {
      const car = state.police.pop();
      car.kind = 'parked';
      car.speed = 0;
    }
    for (const car of state.police) {
      const dx = state.player.x - car.x;
      const dz = state.player.z - car.z;
      const d = Math.hypot(dx, dz) || 1;
      if (car.holdTimer > 0) {
        // Staged (screenshot): drive straight at the same speed, no ramming.
        car.holdTimer -= dt;
        car.x += Math.sin(car.angle) * car.speed * dt;
        car.z += Math.cos(car.angle) * car.speed * dt;
        continue;
      }
      const wantAngle = Math.atan2(dx, dz);
      car.angle = angleLerp(car.angle, wantAngle, Math.min(1, dt * 2.2));
      car.speed = Math.min(POLICE.chaseSpeed, car.speed + 12 * dt);
      const nx = car.x + Math.sin(car.angle) * car.speed * dt;
      const nz = car.z + Math.cos(car.angle) * car.speed * dt;
      const before = { x: car.x, z: car.z };
      car.x = nx;
      car.z = nz;
      if (resolveBuildings(city.buildings, car, 1.4)) car.speed *= 0.4;
      car.x = clamp(car.x, -CITY.half - 20, CITY.half + 20);
      car.z = clamp(car.z, -CITY.half - 20, CITY.seaZ - 4);
      // Ram the player.
      const pd = dist2(car.x, car.z, state.player.x, state.player.z);
      const hitR = state.player.onFoot ? 1.6 : 3.2;
      if (pd < hitR * hitR) {
        car.speed *= 0.3;
        car.x = before.x;
        car.z = before.z;
        hurtPlayer(POLICE.ramDamage, 'The police rammed you.');
        if (audio) audio.crash();
      }
    }
  }

  function hurtPlayer(amount, reason) {
    const p = state.player;
    if (p.hurtTimer > 0) return;
    p.health -= amount;
    p.hurtTimer = 0.6;
    p.regenTimer = 5;
    if (audio) audio.hit();
    if (p.health <= 0) {
      p.health = 0;
      state.busted = true;
      if (audio) audio.fail();
      say(reason || 'You are down.', 6);
    }
  }

  // --- player on foot -----------------------------------------------------
  function stepOnFoot(dt, input) {
    const p = state.player;
    const yaw = state.camYaw;
    let mx = 0;
    let mz = 0;
    if (input.forward()) { mx += Math.sin(yaw); mz += Math.cos(yaw); }
    if (input.back()) { mx -= Math.sin(yaw); mz -= Math.cos(yaw); }
    if (input.left()) { mx += Math.cos(yaw); mz -= Math.sin(yaw); }
    if (input.right()) { mx -= Math.cos(yaw); mz += Math.sin(yaw); }
    const len = Math.hypot(mx, mz);
    if (len > 0) {
      mx /= len;
      mz /= len;
      const speed = input.run() ? PLAYER.runSpeed : PLAYER.walkSpeed;
      p.vx += (mx * speed - p.vx) * Math.min(1, dt * 10);
      p.vz += (mz * speed - p.vz) * Math.min(1, dt * 10);
      p.angle = angleLerp(p.angle, Math.atan2(mx, mz), Math.min(1, dt * 12));
    } else {
      p.vx *= Math.max(0, 1 - dt * 8);
      p.vz *= Math.max(0, 1 - dt * 8);
    }
    p.x += p.vx * dt;
    p.z += p.vz * dt;
    resolveBuildings(city.buildings, p, PLAYER.radius);
    p.x = clamp(p.x, -CITY.half - 24, CITY.half + 24);
    p.z = clamp(p.z, -CITY.half - 24, CITY.seaZ - 3);
    // Collect sun coins.
    for (let i = 0; i < city.coins.length; i += 1) {
      if (state.coinsTaken.includes(i)) continue;
      const c = city.coins[i];
      if (dist2(p.x, p.z, c.x, c.z) < 1.4 * 1.4) {
        state.coinsTaken.push(i);
        state.coins += 1;
        state.cash += 50;
        if (audio) audio.coin();
        say(`Sun coin ${state.coins}/${COLLECTIBLES} — +$50`);
      }
    }
  }

  function nearestCar(maxDist) {
    let best = null;
    let bestD = maxDist * maxDist;
    for (const car of state.cars) {
      const d = dist2(state.player.x, state.player.z, car.x, car.z);
      if (d < bestD) { bestD = d; best = car; }
    }
    return best;
  }

  function enterCar(car) {
    const p = state.player;
    if (!car) return false;
    if (car.kind === 'traffic' && car.occupied) {
      // Carjacking: the driver bails and runs, the law notices.
      car.occupied = false;
      addWanted(WANTED.stealStars, 'Car stolen — the cops are coming.');
      spawnFleeingPed(car.x, car.z);
    } else if (car.kind === 'parked') {
      addWanted(WANTED.stealStars, 'Car stolen — the cops are coming.');
    }
    p.onFoot = false;
    p.carId = car.id;
    car.kind = 'player';
    car.speed = 0;
    if (audio) audio.click();
    return true;
  }

  function exitCar() {
    const p = state.player;
    const car = carById(p.carId); // stable id: the cars array can be filtered
    if (!car) return;
    car.kind = 'parked';
    car.speed = 0;
    p.onFoot = true;
    p.carId = -1;
    p.x = car.x + Math.cos(car.angle) * 2.4;
    p.z = car.z - Math.sin(car.angle) * 2.4;
    p.angle = car.angle;
    p.vx = 0;
    p.vz = 0;
  }

  function spawnFleeingPed(x, z) {
    state.peds.push({
      x: x + 2, z: z + 2, angle: random() * Math.PI * 2,
      speed: 3.4, color: PED_COLORS[0], skin: SKIN[0],
      state: 'flee', timer: 0, downTimer: 0, fleeTimer: 6,
    });
  }

  // --- driving --------------------------------------------------------------
  function stepDriving(dt, input) {
    const p = state.player;
    const car = carById(p.carId); // stable id: the cars array can be filtered
    if (!car) { p.onFoot = true; return; }
    const throttle = input.forward() ? 1 : input.back() ? -1 : 0;
    const steerIn = (input.left() ? 1 : 0) - (input.right() ? 1 : 0);
    const dir = car.speed >= 0 ? 1 : -1;
    car.steer += ((steerIn * CAR.steerMax * dir) - car.steer) * Math.min(1, dt * 8);
    if (throttle > 0) car.speed += CAR.accel * dt;
    else if (throttle < 0) {
      if (car.speed > 0.5) car.speed -= CAR.brake * dt;
      else car.speed -= CAR.reverseAccel * dt;
    } else {
      car.speed -= Math.sign(car.speed) * Math.min(Math.abs(car.speed), 8 * dt);
    }
    if (input.handbrake()) {
      car.speed -= Math.sign(car.speed) * Math.min(Math.abs(car.speed), 22 * dt);
      car.steer *= 1.6;
    }
    car.speed = clamp(car.speed, -CAR.maxReverse, CAR.maxSpeed);
    car.angle += (car.speed / 2.6) * Math.tan(car.steer) * dt;
    const nx = car.x + Math.sin(car.angle) * car.speed * dt;
    const nz = car.z + Math.cos(car.angle) * car.speed * dt;
    const ox = car.x;
    const oz = car.z;
    car.x = nx;
    car.z = nz;
    if (resolveBuildings(city.buildings, car, 1.6)) {
      car.speed *= 0.35;
      if (Math.abs(car.speed) > 6 && audio) audio.crash();
    }
    car.x = clamp(car.x, -CITY.half - 24, CITY.half + 24);
    car.z = clamp(car.z, -CITY.half - 24, CITY.seaZ - 3);
    // Hit pedestrians and other cars.
    for (const ped of state.peds) {
      if (ped.state === 'down') continue;
      if (dist2(car.x, car.z, ped.x, ped.z) < 2.2 * 2.2 && Math.abs(car.speed) > 3) {
        ped.state = 'down';
        ped.downTimer = 6;
        addWanted(WANTED.assaultStars, 'You hit a pedestrian!');
        if (audio) audio.crash();
      }
    }
    for (const other of state.cars) {
      if (other === car || other.kind === 'player') continue;
      const d = dist2(car.x, car.z, other.x, other.z);
      if (d < 3.4 * 3.4) {
        const push = 3.4 - Math.sqrt(d);
        const dx = (car.x - other.x) / (Math.sqrt(d) || 1);
        const dz = (car.z - other.z) / (Math.sqrt(d) || 1);
        car.x += dx * push * 0.5;
        car.z += dz * push * 0.5;
        if (other.kind === 'traffic') {
          other.x -= dx * push * 0.5;
          other.z -= dz * push * 0.5;
          other.speed *= 0.4;
        }
        if (Math.abs(car.speed) > 8) {
          car.speed *= 0.55;
          if (audio) audio.crash();
        }
      }
    }
    p.x = car.x;
    p.z = car.z;
    p.angle = car.angle;
    state.speedKmh = Math.abs(car.speed) * 3.6;
    // Camera follows the car's heading.
    state.camYaw = angleLerp(state.camYaw, car.angle, Math.min(1, dt * 1.6));
  }

  // --- traffic ---------------------------------------------------------------
  function stepTraffic(dt) {
    for (const car of state.cars) {
      if (car.kind !== 'traffic') continue;
      car.turnCooldown -= dt;
      // Slow for the car ahead on the same lane.
      let ahead = Infinity;
      for (const other of state.cars) {
        if (other === car) continue;
        const dx = other.x - car.x;
        const dz = other.z - car.z;
        const fwd = dx * Math.sin(car.angle) + dz * Math.cos(car.angle);
        const side = Math.abs(dx * Math.cos(car.angle) - dz * Math.sin(car.angle));
        if (fwd > 0 && fwd < 14 && side < 2.6 && fwd < ahead) ahead = fwd;
      }
      const want = ahead < TRAFFIC.followGap ? 0 : car.targetSpeed;
      car.speed += clamp(want - car.speed, -10 * dt, 6 * dt);
      car.x += Math.sin(car.angle) * car.speed * dt;
      car.z += Math.cos(car.angle) * car.speed * dt;
      // At an intersection, sometimes turn onto the crossing road.
      const nearX = city.lines.some((l) => Math.abs(car.x - l) < 2.2);
      const nearZ = city.lines.some((l) => Math.abs(car.z - l) < 2.2);
      if (nearX && nearZ && car.turnCooldown <= 0 && random() < 0.012) {
        const vertical = car.laneAxis === 'x';
        const line = vertical
          ? city.lines.reduce((b, l) => (Math.abs(l - car.z) < Math.abs(b - car.z) ? l : b), city.lines[0])
          : city.lines.reduce((b, l) => (Math.abs(l - car.x) < Math.abs(b - car.x) ? l : b), city.lines[0]);
        const dir = random() < 0.5 ? 1 : -1;
        car.laneAxis = vertical ? 'z' : 'x';
        car.laneLine = line;
        car.laneDir = dir;
        car.angle = vertical ? (dir > 0 ? 0 : Math.PI) : (dir > 0 ? Math.PI / 2 : -Math.PI / 2);
        car.turnCooldown = 4;
      }
      // Wrap around the far edge of the city.
      if (car.x > CITY.half + 30) car.x = -CITY.half - 28;
      if (car.x < -CITY.half - 30) car.x = CITY.half + 28;
      if (car.z > CITY.seaZ + 10) car.z = -CITY.half - 28;
      if (car.z < -CITY.half - 30) car.z = CITY.seaZ + 8;
    }
  }

  function stepPeds(dt) {
    for (const ped of state.peds) {
      if (ped.state === 'down') {
        ped.downTimer -= dt;
        if (ped.downTimer <= 0) {
          ped.state = 'flee';
          ped.fleeTimer = 5;
        }
        continue;
      }
      ped.timer -= dt;
      if (ped.state === 'flee') {
        ped.fleeTimer -= dt;
        if (ped.fleeTimer <= 0) ped.state = 'walk';
      }
      if (ped.timer <= 0) {
        ped.timer = 2 + random() * 5;
        // Pick a new heading, usually along a road or the beach.
        if (random() < 0.7) ped.angle = Math.floor(random() * 4) * (Math.PI / 2);
        else ped.angle = random() * Math.PI * 2;
      }
      const speed = ped.state === 'flee' ? ped.speed * 2.4 : ped.speed;
      const nx = ped.x + Math.sin(ped.angle) * speed * dt;
      const nz = ped.z + Math.cos(ped.angle) * speed * dt;
      if (!insideBuilding(city.buildings, nx, nz, 0.6) && Math.abs(nx) < CITY.half + 24 && nz < CITY.seaZ - 2 && nz > -CITY.half - 24) {
        ped.x = nx;
        ped.z = nz;
      } else {
        ped.angle += Math.PI / 2;
        ped.timer = 0.5;
      }
    }
  }

  // --- camera ------------------------------------------------------------------
  function camera() {
    const p = state.player;
    const dist = p.onFoot ? 7.5 : 10;
    const height = p.onFoot ? 3.6 : 4.4;
    const yaw = state.camYaw;
    const pitch = state.camPitch;
    const eye = [
      p.x - Math.sin(yaw) * Math.cos(pitch) * dist,
      height + Math.sin(pitch) * dist * 0.7,
      p.z - Math.cos(yaw) * Math.cos(pitch) * dist,
    ];
    const target = [p.x, p.onFoot ? 1.4 : 1.2, p.z];
    return { eye, target };
  }

  function applyDrag(drag, dt) {
    if (drag.x !== 0 || drag.y !== 0) {
      state.camYaw -= drag.x * 0.004;
      state.camPitch = clamp(state.camPitch + drag.y * 0.003, 0.05, 0.9);
      state.lastDrag = state.time;
    }
  }

  // --- dynamic boxes for the renderer ----------------------------------------
  function box(list, cx, cy, cz, sx, sy, sz, color, rotY) {
    list.push({ cx, cy, cz, sx, sy, sz, color, rotY: rotY || 0 });
  }

  function dynamicBoxes(time) {
    const list = [];
    const shadow = [0.12, 0.11, 0.10];
    // Mission beacon: a pulsing gold column at the current objective.
    const target = state.mission && state.mission.target;
    if (target) {
      const pulse = 1 + Math.sin(time * 3) * 0.15;
      box(list, target.x, 7, target.z, 1.0 * pulse, 14, 1.0 * pulse, [1.0, 0.8, 0.15]);
      box(list, target.x, 0.3, target.z, 3.4, 0.5, 3.4, [1.0, 0.8, 0.15]);
    }
    // Sun coins.
    for (let i = 0; i < city.coins.length; i += 1) {
      if (state.coinsTaken.includes(i)) continue;
      const c = city.coins[i];
      box(list, c.x, 0.9 + Math.sin(time * 2 + i) * 0.15, c.z, 0.5, 0.9, 0.12, [1.0, 0.84, 0.2], time * 2 + i);
    }
    // Cars.
    for (const car of state.cars) {
      const col = hexToRgb(car.color);
      box(list, car.x, 0.22, car.z, CAR.width + 0.7, 0.1, CAR.length + 0.7, shadow, car.angle);
      box(list, car.x, 0.75, car.z, CAR.width, 0.9, CAR.length, col, car.angle);
      const cabin = car.kind === 'police' ? [0.12, 0.16, 0.28] : [0.1, 0.12, 0.16];
      box(list, car.x - Math.sin(car.angle) * 0.2, 1.45, car.z - Math.cos(car.angle) * 0.2, CAR.width - 0.3, 0.7, CAR.length * 0.42, cabin, car.angle);
      if (car.kind === 'police') {
        const flash = Math.sin(time * 10) > 0;
        box(list, car.x, 1.95, car.z, 0.9, 0.25, 0.5, flash ? [1, 0.1, 0.1] : [0.1, 0.2, 1], car.angle);
      }
    }
    // Pedestrians.
    for (const ped of state.peds) {
      if (ped.state === 'down') {
        box(list, ped.x, 0.3, ped.z, 1.5, 0.5, 0.6, hexToRgb(ped.color), ped.angle);
        continue;
      }
      box(list, ped.x, 0.1, ped.z, 0.9, 0.08, 0.9, shadow, 0);
      box(list, ped.x, 0.95, ped.z, 0.55, 1.1, 0.35, hexToRgb(ped.color), ped.angle);
      box(list, ped.x, 1.75, ped.z, 0.42, 0.42, 0.42, hexToRgb(ped.skin), ped.angle);
    }
    // Enemies.
    for (const e of state.enemies) {
      if (!e.alive) continue;
      const flash = e.flash > 0 ? 1.6 : 1;
      box(list, e.x, 0.1, e.z, 0.9, 0.08, 0.9, shadow, 0);
      box(list, e.x, 0.95, e.z, 0.6, 1.15, 0.4, [0.75 * flash, 0.15, 0.15], e.angle);
      box(list, e.x, 1.75, e.z, 0.42, 0.42, 0.42, hexToRgb(SKIN[1]), e.angle);
      // Health bar above the head.
      box(list, e.x, 2.25, e.z, 0.9 * (e.health / COMBAT.enemyHealth), 0.12, 0.1, [0.2, 0.9, 0.2]);
    }
    // The player on foot.
    const p = state.player;
    if (p.onFoot) {
      const shirt = hexToRgb(PALETTE.playerShirt);
      box(list, p.x, 0.1, p.z, 0.9, 0.08, 0.9, shadow, 0);
      box(list, p.x, 0.55, p.z, 0.6, 0.7, 0.38, hexToRgb(PALETTE.playerPants), p.angle);
      box(list, p.x, 1.25, p.z, 0.68, 0.85, 0.42, shirt, p.angle);
      box(list, p.x, 1.95, p.z, 0.44, 0.44, 0.44, hexToRgb(SKIN[3]), p.angle);
      if (p.armed) {
        box(list, p.x + Math.sin(p.angle) * 0.5, 1.3, p.z + Math.cos(p.angle) * 0.5, 0.12, 0.12, 0.7, [0.15, 0.15, 0.15], p.angle);
      }
    }
    // Muzzle flashes and crash sparks.
    for (const fx of state.effects) {
      const a = 1 - fx.t / fx.life;
      box(list, fx.x, fx.y, fx.z, 0.5 * a + 0.1, 0.5 * a + 0.1, 0.5 * a + 0.1, fx.color);
    }
    return list;
  }

  // --- main step -------------------------------------------------------------
  function step(dt, input) {
    state.time += dt;
    state.clock += dt / 240; // a full game day in 4 hours of play
    if (state.clock >= 24) state.clock -= 24;
    const p = state.player;
    if (p.hurtTimer > 0) p.hurtTimer -= dt;
    if (p.regenTimer > 0) p.regenTimer -= dt;
    else if (p.health > 0 && p.health < PLAYER.health && state.wanted.stars === 0) {
      p.health = Math.min(PLAYER.health, p.health + 4 * dt);
    }
    applyDrag(input.takeDrag(), dt);
    if (p.onFoot) stepOnFoot(dt, input);
    else stepDriving(dt, input);
    stepTraffic(dt);
    stepPeds(dt);
    updatePolice(dt);
    updateWanted(dt);
    for (let i = state.effects.length - 1; i >= 0; i -= 1) {
      state.effects[i].t += dt;
      if (state.effects[i].t >= state.effects[i].life) state.effects.splice(i, 1);
    }
    for (let i = state.messages.length - 1; i >= 0; i -= 1) {
      state.messages[i].t -= dt;
      if (state.messages[i].t <= 0) state.messages.splice(i, 1);
    }
    for (const e of state.enemies) if (e.flash > 0) e.flash -= dt;
    if (audio) {
      const driving = !p.onFoot && carById(p.carId); // stable id, not an index
      audio.engine(driving ? Math.abs(carById(p.carId).speed) / CAR.maxSpeed : 0, !!driving);
      audio.siren(state.wanted.stars > 0, state.time);
    }
  }

  /** Pull the chasing police cars in right behind the player (screenshot staging). */
  function stagePolice() {
    const p = state.player;
    const car = carById(p.carId); // stable id: the cars array can be filtered
    if (!car) return;
    for (let i = 0; i < state.police.length; i += 1) {
      const pc = state.police[i];
      // Pulling alongside the player, slightly ahead: in frame, not behind the camera.
      const back = -3 + i * 2;
      const side = i % 2 === 0 ? -4.5 : 4.5;
      pc.x = car.x - Math.sin(car.angle) * back + Math.cos(car.angle) * side;
      pc.z = car.z - Math.cos(car.angle) * back - Math.sin(car.angle) * side;
      pc.angle = car.angle;
      pc.speed = car.speed;
      pc.holdTimer = 2;
    }
  }

  reset(true);

  return {
    state,
    reset,
    step,
    camera,
    dynamicBoxes,
    nearestCar,
    enterCar,
    exitCar,
    addWanted,
    hurtPlayer,
    say,
    spawnFleeingPed,
    stagePolice,
  };
}

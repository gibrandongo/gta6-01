// Solmar Bay: boot, the one game loop, and every system wired together.
// Screens: title, play, paused, wasted/busted, help.
// ?seed=N fixes the city. ?shot=start|drive|chase|mission stages a scene for a
// screenshot and sets window.__shotReady. ?selftest=1 runs a scripted play check and
// writes its results into #selftest.

import { createRandom, clamp, angleLerp, distance2D, formatMoney } from './utils.js';
import { createAudio } from './audio.js';
import { createCity } from './city.js';
import { createPlayer, createCameraRig } from './player.js';
import { createVehicles } from './vehicles.js';
import { createPedestrians } from './pedestrians.js';
import { createPolice } from './police.js';
import { createCombat } from './combat.js';
import { createMissions, MISSIONS } from './missions.js';
import { createHud } from './hud.js';
import { loadSave, writeSave, saveSummary } from './save.js';

const STEP = 1 / 60;
const MAX_FRAME = 0.25;
const START_MONEY = 250;

const params = new URLSearchParams(window.location.search);
const shot = params.get('shot');
const seedParam = Number.parseInt(params.get('seed') ?? '', 10);
const seed = Number.isInteger(seedParam) ? seedParam : 20261117;
const selftest = params.get('selftest') === '1';
const rng = createRandom(seed);

const canvas = document.getElementById('game');
const status = document.getElementById('status');
const audio = createAudio();

const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
const camera = new THREE.PerspectiveCamera(62, 1, 0.1, 1200);
const scene = new THREE.Scene();
const cameraRig = createCameraRig(camera);

function resize() {
  const w = window.innerWidth;
  const h = window.innerHeight;
  renderer.setSize(w, h, false);
  camera.aspect = w / h;
  camera.updateProjectionMatrix();
}
window.addEventListener('resize', resize);
resize();

const city = createCity(scene, seed);
const player = createPlayer(scene, city);
const vehicles = createVehicles(scene, city, rng);
const pedestrians = createPedestrians(scene, city, rng);
const police = createPolice(scene, city, vehicles, pedestrians, rng);
const combat = createCombat(scene, city, rng);
const missions = createMissions(city);
const hud = createHud(city);
combat.seedPickups();

// The mission marker beacon: a glowing pillar and a floating diamond.
const beacon = new THREE.Group();
const beaconMat = new THREE.MeshBasicMaterial({ color: 0xffd94d, transparent: true, opacity: 0.35, side: THREE.DoubleSide });
const beaconCyl = new THREE.Mesh(new THREE.CylinderGeometry(2.2, 2.2, 60, 16, 1, true), beaconMat);
beaconCyl.position.y = 30;
const beaconDiamond = new THREE.Mesh(
  new THREE.OctahedronGeometry(1.6),
  new THREE.MeshBasicMaterial({ color: 0xffd94d }),
);
beaconDiamond.position.y = 12;
beacon.add(beaconCyl, beaconDiamond);
beacon.visible = false;
scene.add(beacon);

// Game state.
const saved = loadSave();
const state = {
  screen: 'title',
  money: saved ? saved.money : START_MONEY,
  earned: saved ? saved.earned : 0,
  day: saved ? saved.day : 1,
  minutes: saved ? saved.minutes : 720,
  shooting: false,
  dragTimer: 0,
  taxiTimer: 30,
  pendingCalls: [],
  statsShots: 0,
  statsCarsStolen: 0,
  statsKills: 0,
};
if (saved) {
  missions.loadProgress(saved.completed);
  player.setPosition(saved.x, saved.z, 0);
} else {
  player.setPosition(city.spawnPoints.hideout.x, city.spawnPoints.hideout.z, Math.PI);
}

function saveGame() {
  return writeSave({
    money: state.money, health: player.state.health, armor: player.state.armor,
    completed: missions.completed, x: player.state.x, z: player.state.z,
    day: state.day, minutes: state.minutes, earned: state.earned,
  });
}

function announce(text) {
  status.textContent = text;
  hud.announce(text);
}

// ---------- input ----------
const keys = new Set();
const input = { forward: false, back: false, left: false, right: false, run: false, handbrake: false };
function readKeys() {
  input.forward = keys.has('KeyW') || keys.has('ArrowUp');
  input.back = keys.has('KeyS') || keys.has('ArrowDown');
  input.left = keys.has('KeyA') || keys.has('ArrowLeft');
  input.right = keys.has('KeyD') || keys.has('ArrowRight');
  input.run = keys.has('ShiftLeft') || keys.has('ShiftRight');
  input.handbrake = keys.has('Space');
}
let dragging = false;
let dragMoved = 0;
let lastMouseX = 0;
let lastMouseY = 0;
let lastShotAt = 0;

window.addEventListener('keydown', (e) => {
  if (e.repeat) return;
  keys.add(e.code);
  readKeys();
  if (e.code === 'Space') e.preventDefault();
  if (state.screen !== 'play') return;
  if (e.code === 'KeyE') tryEnterExitCar();
  if (e.code === 'KeyC') cameraRig.cycle();
  if (e.code === 'KeyM') {
    const muted = audio.toggleMute();
    hud.showMessage(muted ? 'Sound off.' : 'Sound on.');
  }
  if (e.code === 'KeyH') {
    state.screen = 'help';
    hud.showScreen('screenHelp');
  }
  if (e.code === 'Escape') pauseGame();
});
window.addEventListener('keyup', (e) => {
  keys.delete(e.code);
  readKeys();
});
canvas.addEventListener('mousedown', (e) => {
  dragging = true;
  dragMoved = 0;
  lastMouseX = e.clientX;
  lastMouseY = e.clientY;
  audio.unlock();
});
window.addEventListener('mousemove', (e) => {
  if (!dragging) return;
  const dx = e.clientX - lastMouseX;
  const dy = e.clientY - lastMouseY;
  lastMouseX = e.clientX;
  lastMouseY = e.clientY;
  dragMoved += Math.abs(dx) + Math.abs(dy);
  player.state.camYaw -= dx * 0.005;
  player.state.camPitch = clamp(player.state.camPitch + dy * 0.003, 0.08, 1.1);
  state.dragTimer = 0.6;
});
window.addEventListener('mouseup', (e) => {
  if (dragging && dragMoved < 6 && state.screen === 'play' && performance.now() - lastShotAt > 180) {
    lastShotAt = performance.now();
    fireWeapon();
  }
  dragging = false;
});
canvas.addEventListener('wheel', (e) => {
  e.preventDefault();
  player.state.camDist = clamp(player.state.camDist + Math.sign(e.deltaY) * 1.5, 5, 16);
}, { passive: false });
canvas.addEventListener('contextmenu', (e) => e.preventDefault());

// ---------- menus ----------
function showTitle() {
  state.screen = 'title';
  hud.showScreen('screenTitle');
  const btnContinue = document.getElementById('btnContinue');
  const saveLine = document.getElementById('saveLine');
  if (saved) {
    btnContinue.style.display = 'inline-block';
    saveLine.textContent = saveSummary(saved);
  }
  announce('Solmar Bay. Press Start Engine.');
}
document.getElementById('btnStart').addEventListener('click', () => {
  audio.unlock();
  audio.startMusic();
  startNewGame();
});
document.getElementById('btnContinue').addEventListener('click', () => {
  audio.unlock();
  audio.startMusic();
  startPlay();
});
document.getElementById('btnResume').addEventListener('click', () => startPlay());
document.getElementById('btnSave').addEventListener('click', () => {
  const ok = saveGame();
  document.getElementById('saveLine2').textContent = ok ? 'Game saved.' : 'Save failed — storage is off.';
});
document.getElementById('btnHelp').addEventListener('click', () => {
  state.screen = 'help';
  hud.showScreen('screenHelp');
});
document.getElementById('btnHelpClose').addEventListener('click', () => {
  if (state.screen === 'help') {
    state.screen = 'play';
    hud.showScreen('');
  }
});
document.getElementById('btnQuit').addEventListener('click', () => {
  saveGame();
  showTitle();
});
document.getElementById('btnRetry').addEventListener('click', () => startPlay());
document.getElementById('btnOverTitle').addEventListener('click', () => showTitle());
document.addEventListener('visibilitychange', () => {
  if (document.hidden && state.screen === 'play') pauseGame();
});

function startNewGame() {
  state.money = START_MONEY;
  state.earned = 0;
  state.day = 1;
  state.minutes = 720;
  player.state.health = 100;
  player.state.armor = 0;
  player.setPosition(city.spawnPoints.hideout.x, city.spawnPoints.hideout.z, Math.PI);
  police.clearAll();
  startPlay();
  hud.showPhone('MARA VOSS', 'Dana. You are out, I am glad. I have work — meet me at the hideout marker. First job pays $300.', 8);
  audio.phone();
}

function startPlay() {
  state.screen = 'play';
  hud.showScreen('');
  announce('Playing Solmar Bay.');
}

function pauseGame() {
  if (state.screen !== 'play') return;
  state.screen = 'paused';
  hud.showScreen('screenPause');
  document.getElementById('pauseStats').textContent =
    `Money ${formatMoney(state.money)} · earned ${formatMoney(state.earned)} · ` +
    `${missions.completed.length} of ${6} missions done · Day ${state.day} · wanted ${police.starName()}`;
  announce('Paused.');
}

function endRun(kind) {
  state.screen = 'over';
  const loss = Math.min(state.money, Math.max(100, Math.floor(state.money * 0.15)));
  state.money -= loss;
  police.clearAll();
  if (player.isInCar()) exitCar(false);
  player.state.health = 100;
  player.state.armor = 0;
  if (kind === 'busted') {
    document.getElementById('overTitle').textContent = 'BUSTED';
    document.getElementById('overText').textContent =
      `The SBPD took you in. You posted bail of ${formatMoney(loss)} and walked out at the hideout. Mara is already calling with new work.`;
    audio.busted();
  } else {
    document.getElementById('overTitle').textContent = 'WASTED';
    document.getElementById('overText').textContent =
      `You woke up at Solmar General, ${formatMoney(loss)} lighter. The city is still out there — and so is Mara's next job.`;
  }
  player.setPosition(city.spawnPoints.hideout.x, city.spawnPoints.hideout.z, 0);
  hud.showScreen('screenOver');
  saveGame();
  announce(kind === 'busted' ? 'Busted by the police.' : 'Wasted.');
}

// ---------- cars ----------
function tryEnterExitCar() {
  if (player.isInCar()) {
    exitCar(false);
    return;
  }
  const car = vehicles.nearestCar(player.state.x, player.state.z, 4.5);
  if (!car) {
    hud.showMessage('No car close enough — walk up to one and press E.');
    return;
  }
  enterCar(car);
}

function enterCar(car) {
  player.state.inCar = true;
  player.state.car = car;
  player.group.visible = false;
  car.parked = false;
  car.targetSpeed = 0;
  if (!car.owned) {
    car.owned = true;
    state.statsCarsStolen += 1;
    if (police.addHeat(12)) hud.showMessage('Car stolen — the SBPD has been called!');
    pedestrians.scareNearby(car.x, car.z, 12);
    audio.horn();
  }
  hud.showMessage(`You took the ${car.name}.`);
}

function exitCar(wrecked) {
  const car = player.state.car;
  if (!car) return;
  player.state.inCar = false;
  player.state.car = null;
  player.group.visible = true;
  const side = car.heading + Math.PI / 2;
  player.setPosition(car.x + Math.sin(side) * 2.4, car.z + Math.cos(side) * 2.4, car.heading);
  if (wrecked) {
    car.parked = true;
    car.speed = 0;
    hud.showMessage('Your car is wrecked — get out and run!');
    audio.explosion();
  }
}
player.exitCar = exitCar;

// ---------- shooting ----------
function fireWeapon() {
  if (player.isInCar() && player.state.car && Math.abs(player.state.car.speed) > 2) {
    // Drive-by: shoot from the car window.
  }
  const origin = player.isInCar() && player.state.car
    ? { x: player.state.car.x, y: 1.6, z: player.state.car.z }
    : { x: player.state.x, y: 1.7, z: player.state.z };
  // Aim at the centre of the screen, 60 units out.
  const camDir = new THREE.Vector3();
  camera.getWorldDirection(camDir);
  const target = {
    x: camera.position.x + camDir.x * 60,
    y: camera.position.y + camDir.y * 60,
    z: camera.position.z + camDir.z * 60,
  };
  const targets = [];
  for (const ped of pedestrians.peds) {
    if (!ped.dead) targets.push({ mesh: ped.mesh, kind: 'ped', ref: ped });
  }
  for (const off of police.officers) {
    if (!off.dead) targets.push({ mesh: off.mesh, kind: 'officer', ref: off });
  }
  for (const car of vehicles.cars) targets.push({ mesh: car.mesh, kind: 'car', ref: car });
  for (const car of vehicles.policeCars) targets.push({ mesh: car.mesh, kind: 'policeCar', ref: car });
  const result = combat.shoot(origin, target, targets);
  audio.shoot();
  state.statsShots += 1;
  const hit = result.hitTarget;
  if (hit) {
    if (hit.kind === 'ped') {
      hit.ref.health -= 100;
      if (hit.ref.health <= 0) {
        pedestrians.killPed(hit.ref);
        state.statsKills += 1;
        police.addHeat(10);
        pedestrians.scareNearby(hit.ref.x, hit.ref.z, 20);
        hud.showMessage('You hit a civilian — witnesses called the police!');
      }
    } else if (hit.kind === 'officer') {
      hit.ref.health -= 34;
      police.addHeat(12);
      audio.hit();
      if (hit.ref.health <= 0) {
        state.statsKills += 1;
        hud.showMessage('You dropped an officer — every cop in the bay is coming.');
      }
    } else if (hit.kind === 'car' || hit.kind === 'policeCar') {
      hit.ref.health -= 25;
      combat.burst(result.point.x, result.point.y, result.point.z, 0xffaa33, 6, 4, 0.4, 6);
      if (hit.ref.health <= 0) {
        combat.explode(hit.ref.x, hit.ref.z);
        audio.explosion();
        police.addHeat(8);
        if (hit.kind === 'policeCar') {
          vehicles.removePoliceCar(hit.ref);
        } else {
          scene.remove(hit.ref.mesh);
          vehicles.cars.splice(vehicles.cars.indexOf(hit.ref), 1);
          setTimeout(() => vehicles.spawnTrafficCar(), 4000);
        }
      } else {
        police.addHeat(4);
      }
    }
  }
}

// ---------- missions ----------
function handleMissionEvents(events) {
  for (const e of events) {
    if (e.type === 'objective') {
      hud.showMessage('New objective: ' + e.objective.text);
      hud.showPhone('MARA VOSS', e.objective.text, 5);
      audio.phone();
    } else if (e.type === 'mission-done') {
      state.money += e.mission.payout;
      state.earned += e.mission.payout;
      hud.showBanner('MISSION PASSED', `${e.mission.title} · +${formatMoney(e.mission.payout)}`, 3.2);
      audio.missionDone();
      saveGame();
      if (missions.isStoryDone()) {
        state.pendingCalls.push({ at: 3, name: 'MARA VOSS', text: 'That is every job I had, Dana. You own this bay now. Keep the engine running — the city never sleeps.' });
      } else {
        state.pendingCalls.push({ at: 3, name: 'MARA VOSS', text: 'Nice work. I have another job when you are ready — drive to the next yellow marker.' });
      }
    } else if (e.type === 'failed') {
      hud.showBanner('MISSION FAILED', e.reason, 3);
      audio.busted();
    } else if (e.type === 'collect') {
      hud.showMessage(`Cash collected ${e.got}/${e.total}.`);
      audio.cash();
    } else if (e.type === 'taxi-picked') {
      hud.showMessage('Passenger aboard — drive to the green marker.');
    } else if (e.type === 'taxi-done') {
      state.money += e.fare;
      state.earned += e.fare;
      hud.showMessage(`Fare complete: +${formatMoney(e.fare)}.`);
      audio.cash();
    } else if (e.type === 'taxi-expired') {
      hud.showMessage('The fare gave up waiting.');
    }
  }
}

function onPickup(kind) {
  if (kind === 'health') {
    player.heal(50);
    hud.showMessage('Health kit: +50 health.');
  } else if (kind === 'armor') {
    player.state.armor = 100;
    hud.showMessage('Armor vest equipped.');
  } else if (kind === 'cash') {
    state.money += 150;
    state.earned += 150;
    hud.showMessage('Stash cash: +$150.');
  }
  audio.pickup();
}

// ---------- per-frame update ----------
function step(dt, time) {
  state.minutes += dt * 0.8;
  if (state.minutes >= 1440) {
    state.minutes -= 1440;
    state.day += 1;
  }
  city.update(dt, time);
  const px = player.state.x;
  const pz = player.state.z;

  // Pending phone calls.
  for (const call of [...state.pendingCalls]) {
    call.at -= dt;
    if (call.at <= 0) {
      hud.showPhone(call.name, call.text, 6);
      audio.phone();
      state.pendingCalls.splice(state.pendingCalls.indexOf(call), 1);
    }
  }

  if (state.screen === 'title') {
    // Attract mode: traffic and pedestrians live while the title shows.
    vehicles.updateTraffic(dt, px, pz, null);
    pedestrians.update(dt, px, pz, 0, false);
    return;
  }
  if (state.screen !== 'play') return;

  if (state.dragTimer > 0) state.dragTimer -= dt;

  // Player: on foot or driving.
  if (player.isInCar()) {
    const car = player.state.car;
    const events = vehicles.drivePlayerCar(car, input, dt);
    if (events.crashed) {
      audio.crash();
      police.addHeat(2);
      combat.burst(car.x, car.y || 1, car.z, 0xcccccc, 4, 3, 0.4, 6);
    }
    player.state.x = car.x;
    player.state.z = car.z;
    player.state.speed = Math.abs(car.speed);
    // Chase camera follows the car's heading.
    if (state.dragTimer <= 0) {
      player.state.camYaw = angleLerp(player.state.camYaw, car.heading + Math.PI, dt * 2.5);
    }
    if (car.health <= 0) {
      combat.explode(car.x, car.z);
      exitCar(true);
    }
    // Run over pedestrians.
    for (const ped of [...pedestrians.peds]) {
      if (!ped.dead && Math.abs(car.speed) > 5 && distance2D(car.x, car.z, ped.x, ped.z) < 1.8) {
        pedestrians.killPed(ped);
        state.statsKills += 1;
        police.addHeat(10);
        pedestrians.scareNearby(ped.x, ped.z, 20);
        audio.crash();
      }
    }
  } else {
    player.step(input, dt);
    // Traffic can hit the player on foot.
    for (const car of vehicles.cars) {
      if (!car.parked && car.speed > 4 && distance2D(car.x, car.z, player.state.x, player.state.z) < 1.6) {
        if (player.damage(12)) {
          endRun('wasted');
          return;
        }
        audio.crash();
        player.setPosition(player.state.x + 2, player.state.z + 2, player.state.heading);
        break;
      }
    }
  }

  vehicles.updateTraffic(dt, player.state.x, player.state.z, player.isInCar() ? player.state.car : null);
  pedestrians.update(dt, player.state.x, player.state.z, player.state.speed, player.isInCar());
  combat.update(dt, time, player.state.x, player.state.z, onPickup);
  police.update(dt, player, () => endRun('busted'), () => endRun('wasted'));
  audio.setEngine(player.isInCar() ? clamp(Math.abs(player.state.speed || 0) / 34, 0, 1) : 0, player.isInCar());
  audio.setSiren(police.wanted > 0);

  // Missions and taxi fares.
  const missionEvents = missions.update(dt, {
    x: player.state.x, z: player.state.z,
    inCar: player.isInCar(), wanted: police.wanted,
    setWanted: (n) => police.setWanted(n),
    spawnCash: (x, z) => combat.spawnPickup('cash', x, z),
  });
  handleMissionEvents(missionEvents);
  if (!missions.currentMission() && !missions.taxi) {
    state.taxiTimer -= dt;
    if (state.taxiTimer <= 0) {
      state.taxiTimer = 45;
      const fare = missions.offerTaxi(rng);
      if (fare) {
        hud.showPhone('TAXI DISPATCH', `Fare waiting at the green marker — ${formatMoney(fare.fare)} if you get them there in time.`, 6);
        audio.phone();
      }
    }
  }

  // The marker beacon follows the current objective or fare.
  const marker = missions.markerPosition();
  if (marker) {
    beacon.visible = true;
    beacon.position.set(marker.x, 0, marker.z);
    beaconMat.color.setHex(missions.markerColor());
    beaconDiamond.material.color.setHex(missions.markerColor());
    beaconDiamond.position.y = 12 + Math.sin(time * 3) * 1.2;
    beaconDiamond.rotation.y = time * 2;
  } else {
    beacon.visible = false;
  }

  // HUD.
  const obj = missions.currentObjective();
  const mission = missions.currentMission();
  let objectiveTitle = 'SOLMAR BAY';
  let objectiveText = 'Free roam — Mara will call with work.';
  let objectiveDist = '';
  if (mission && obj) {
    objectiveTitle = mission.title;
    objectiveText = obj.text;
    if (obj.timer && missions.timer > 0) objectiveText += ` — ${Math.ceil(missions.timer)}s left`;
    if (obj.type === 'collect') objectiveText = obj.text.replace(/\(\d+\/\d+\)/, '');
    if (marker) objectiveDist = `${Math.round(distance2D(player.state.x, player.state.z, marker.x, marker.z))} m`;
  } else if (missions.taxi) {
    objectiveTitle = 'TAXI FARE';
    objectiveText = missions.taxi.stage === 'pickup' ? 'Pick up the passenger' : 'Drop the passenger off';
    objectiveDist = `${Math.round(distance2D(player.state.x, player.state.z, marker.x, marker.z))} m · ${formatMoney(missions.taxi.fare)}`;
  }
  hud.update(dt, {
    money: state.money, health: player.state.health, armor: player.state.armor,
    wanted: police.wanted, minutes: state.minutes, day: state.day,
    objectiveTitle, objectiveText, objectiveDist,
    speedMph: player.isInCar() && player.state.car ? Math.abs(player.state.car.speed) * 2.2 : Math.abs(player.state.speed) * 2.2,
    inCar: player.isInCar(), carName: player.isInCar() && player.state.car ? player.state.car.name : '',
    playerX: player.state.x, playerZ: player.state.z,
    heading: player.isInCar() && player.state.car ? player.state.car.heading : player.state.heading,
    marker, markerColor: missions.markerColor(),
    policeCars: vehicles.policeCars, trafficCars: vehicles.cars,
    shooting: !player.isInCar(),
  });

  // Camera.
  const target = player.isInCar() && player.state.car
    ? { x: player.state.car.x, y: 2.2, z: player.state.car.z, yaw: player.state.camYaw }
    : { x: player.state.x, y: 1.8, z: player.state.z, yaw: player.state.camYaw };
  const lookAt = new THREE.Vector3(target.x, target.y, target.z);
  cameraRig.update(target, lookAt, dt, false);
}

function renderTitleOrbit(time) {
  const r = 190;
  camera.position.set(Math.sin(time * 0.05) * r, 70, Math.cos(time * 0.05) * r);
  camera.lookAt(0, 20, 0);
}

// ---------- screenshot staging ----------
function stageShot(name) {
  state.screen = 'play';
  hud.showScreen('');
  if (name === 'start') {
    state.screen = 'title';
    hud.showScreen('screenTitle');
    // Render a few frames of the title orbit so the city shows behind the menu.
    for (let i = 0; i < 30; i++) {
      step(STEP, i * STEP);
      renderTitleOrbit(i * STEP);
      renderer.render(scene, camera);
    }
    window.__shotReady = true;
    return;
  }
  if (name === 'mission') {
    // On foot at the hideout with the first mission live.
    player.setPosition(city.spawnPoints.hideout.x, city.spawnPoints.hideout.z, Math.PI * 0.75);
    player.state.camYaw = Math.PI * 0.9;
    player.state.camPitch = 0.3;
    missions.startNext();
    hud.showPhone('MARA VOSS', MISSIONS[0].briefing, 30);
  } else if (name === 'drive') {
    const car = vehicles.nearestCar(30, -30, 400) || vehicles.cars[0];
    player.setPosition(car.x, car.z, car.heading);
    enterCar(car);
    car.speed = 16;
    player.state.camYaw = car.heading + Math.PI;
    missions.startNext();
  } else if (name === 'chase') {
    const car = vehicles.nearestCar(0, 60, 400) || vehicles.cars[0];
    player.setPosition(car.x, car.z, car.heading);
    enterCar(car);
    car.speed = 26;
    player.state.camYaw = car.heading + Math.PI;
    police.setWanted(3);
    for (let i = 0; i < 3; i++) police.update(0.5, player, () => {}, () => {});
    missions.startNext();
    hud.showPhone('MARA VOSS', 'The whole SBPD is on you — lose them!', 30);
  }
  // Advance the world so traffic, police and the camera settle into the shot.
  // Driving shots run fewer steps so the car is still moving, not wedged behind traffic.
  const steps = (name === 'drive' || name === 'chase') ? 150 : 240;
  const fakeInput = { forward: true, back: false, left: false, right: false, run: false, handbrake: false };
  const savedInput = { ...input };
  Object.assign(input, fakeInput);
  for (let i = 0; i < steps; i++) {
    step(STEP, i * STEP);
    if (name === 'drive' || name === 'chase') {
      // Keep the throttle on during the staged drive.
      Object.assign(input, fakeInput);
    }
  }
  Object.assign(input, savedInput);
  if (name === 'chase' && player.isInCar() && player.state.car) {
    // A roadblock ahead, so a police car is visible in the chase shot.
    const pc = player.state.car;
    const bx = pc.x + Math.sin(pc.heading) * 30;
    const bz = pc.z + Math.cos(pc.heading) * 30;
    const block = vehicles.spawnPoliceCar(bx, bz);
    block.heading = pc.heading + Math.PI;
    block.mesh.rotation.y = block.heading;
    block.mesh.position.set(bx, 0, bz);
  }
  renderer.render(scene, camera);
  renderer.render(scene, camera);
  window.__shotReady = true;
}

// ---------- self test ----------
function runSelfTest() {
  const results = {};
  try {
    // 1. Start and walk.
    startNewGame();
    const x0 = player.state.x;
    const z0 = player.state.z;
    const walkInput = { forward: true, back: false, left: false, right: false, run: false, handbrake: false };
    Object.assign(input, walkInput);
    for (let i = 0; i < 120; i++) step(STEP, i * STEP);
    results.walkMoved = distance2D(x0, z0, player.state.x, player.state.z);
    // 2. Steal the nearest car.
    const car = vehicles.nearestCar(player.state.x, player.state.z, 500);
    player.setPosition(car.x + 2, car.z, car.heading);
    enterCar(car);
    results.enteredCar = player.isInCar();
    results.carName = car.name;
    // 3. Drive.
    const dx0 = car.x;
    const dz0 = car.z;
    Object.assign(input, walkInput);
    for (let i = 0; i < 180; i++) step(STEP, 2 + i * STEP);
    results.driveSpeed = Math.abs(car.speed);
    results.driveMoved = distance2D(dx0, dz0, car.x, car.z);
    // 4. Mission trigger: stealing the car should complete objective 0 of mission 1.
    const m = missions.startNext();
    results.missionStarted = m ? m.id : null;
    for (let i = 0; i < 30; i++) step(STEP, 5 + i * STEP);
    results.objectiveIndex = missions.objectiveIndex;
    // 5. Fire the weapon once.
    fireWeapon();
    results.shotsFired = state.statsShots;
    // 6. Wanted level spawns police.
    police.setWanted(2);
    for (let i = 0; i < 300; i++) step(STEP, 6 + i * STEP);
    results.wanted = police.wanted;
    results.policeCars = vehicles.policeCars.length;
    // 7. HUD + minimap painted without error.
    results.hudOk = !!document.getElementById('moneyBox');
    results.minimapOk = !!document.getElementById('minimap');
    results.money = state.money;
    results.passed = results.walkMoved > 3 && results.enteredCar && results.driveSpeed > 5 &&
      results.objectiveIndex >= 1 && results.shotsFired >= 1 && results.policeCars >= 1;
  } catch (err) {
    results.error = String(err && err.message ? err.message : err);
    results.passed = false;
  }
  document.getElementById('selftest').textContent = JSON.stringify(results);
  window.__shotReady = true;
}

// ---------- main loop ----------
let last = performance.now();
let accumulator = 0;
let elapsed = 0;

function frame(now) {
  requestAnimationFrame(frame);
  const dt = Math.min((now - last) / 1000, MAX_FRAME);
  last = now;
  elapsed += dt;
  if (state.screen === 'title') {
    accumulator = 0;
    step(STEP, elapsed);
    renderTitleOrbit(elapsed);
  } else if (state.screen === 'play') {
    accumulator += dt;
    let guard = 0;
    while (accumulator >= STEP && guard < 8) {
      step(STEP, elapsed);
      accumulator -= STEP;
      guard += 1;
    }
    if (guard >= 8) accumulator = 0;
  } else {
    accumulator = 0;
  }
  renderer.render(scene, camera);
}

showTitle();
if (shot) {
  stageShot(shot);
} else if (selftest) {
  runSelfTest();
} else {
  requestAnimationFrame(frame);
}

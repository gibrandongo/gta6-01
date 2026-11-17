// Missions and combat for Solmar Bay. Five story missions take Rio Vega from a
// nobody fresh off the bus to the owner of the bay: steal a car, run a package,
// collect a debt, outrun the law, and settle things on the marina. Each mission
// is a small stage machine: reach a marker, defeat rivals, beat a timer. Combat
// is a pistol the player earns in mission 3 — aim with the camera, click to fire.

import { COMBAT, MISSION_REWARD } from './config.js';

const GARAGE = { x: -146, z: -146 };

const MISSIONS = [
  {
    name: 'First Wheels',
    intro: 'Mara: "No car, no work. Borrow one — any one — and bring it to my garage."',
    stages: [
      { label: 'Steal a car (walk up to one, press E)', target: null, kind: 'steal' },
      { label: 'Drive to Mara\'s Garage', target: { x: GARAGE.x, z: GARAGE.z }, kind: 'goto', radius: 7 },
    ],
  },
  {
    name: 'Package Run',
    intro: 'Mara: "A package is waiting at the docks. Pick it up, deliver it to the Coral Hotel. Fast."',
    stages: [
      { label: 'Pick up the package at Harbor Docks', target: { x: 180, z: -180 }, kind: 'goto', radius: 7, onArrive: 'heat' },
      { label: 'Deliver to the Coral Hotel — hurry!', target: { x: 30, z: 120 }, kind: 'goto', radius: 7, timer: 100 },
    ],
  },
  {
    name: 'Debt Collection',
    intro: 'Mara: "The market crew owes me. Take this pistol. Collect what is mine."',
    stages: [
      { label: 'Go to the Old Town market', target: { x: -90, z: 30 }, kind: 'goto', radius: 8 },
      { label: 'Deal with the three rivals', target: { x: -90, z: 30 }, kind: 'fight', count: 3 },
      { label: 'Collect the cash', target: { x: -90, z: 30 }, kind: 'goto', radius: 5 },
    ],
  },
  {
    name: 'The Getaway',
    intro: 'Mara: "One job at the bank, then vanish. The whole force will be on you."',
    stages: [
      { label: 'Reach Solmar Bank', target: { x: 90, z: -30 }, kind: 'goto', radius: 7, onArrive: 'heat3' },
      { label: 'Escape to the hideout in Palm Heights', target: { x: -180, z: 150 }, kind: 'goto', radius: 8, timer: 120 },
    ],
  },
  {
    name: 'Bayfront Finale',
    intro: 'Mara: "The Harbor Kings want the bay. End it on the marina — then the yacht is yours."',
    stages: [
      { label: 'Go to the marina pier', target: { x: 0, z: 222 }, kind: 'goto', radius: 8 },
      { label: 'Defeat the Harbor Kings', target: { x: 0, z: 222 }, kind: 'fight', count: 5 },
      { label: 'Walk to the yacht', target: { x: 0, z: 232 }, kind: 'goto', radius: 6 },
    ],
  },
];

function dist(ax, az, bx, bz) {
  return Math.hypot(ax - bx, az - bz);
}

export function createMissions(sim, random, audio, onSave) {
  const state = sim.state;

  function setIdleMarker() {
    if (state.storyDone) {
      state.mission = null;
      return;
    }
    const m = MISSIONS[state.missionIndex];
    state.mission = {
      index: state.missionIndex,
      stage: -1,
      isStart: true,
      name: m.name,
      label: `Start "${m.name}" — go to Mara's Garage`,
      target: { x: GARAGE.x, z: GARAGE.z },
      timer: 0,
      enemiesLeft: 0,
    };
  }

  function spawnEnemies(count, cx, cz) {
    state.enemies.length = 0;
    for (let i = 0; i < count; i += 1) {
      const a = (i / count) * Math.PI * 2 + random() * 0.5;
      const r = 7 + random() * 6;
      state.enemies.push({
        x: cx + Math.sin(a) * r,
        z: cz + Math.cos(a) * r,
        angle: 0,
        health: COMBAT.enemyHealth,
        alive: true,
        flash: 0,
        shootTimer: 1 + random(),
        moveTimer: 0,
      });
    }
  }

  function startMission() {
    const m = MISSIONS[state.missionIndex];
    state.mission = {
      index: state.missionIndex,
      stage: 0,
      isStart: false,
      name: m.name,
      label: m.stages[0].label,
      target: m.stages[0].target,
      timer: m.stages[0].timer || 0,
      enemiesLeft: 0,
    };
    if (state.missionIndex === 2 && !state.player.armed) {
      state.player.armed = true;
      state.player.weapon = 'pistol';
      sim.say('Pistol equipped — click to shoot, Q to holster.');
    }
    sim.say(`Mission: ${m.name}`);
    sim.say(m.intro, 6);
    if (audio) audio.mission();
  }

  function completeMission() {
    const reward = MISSION_REWARD[state.missionIndex];
    state.cash += reward;
    sim.say(`Mission complete — +$${reward}`, 5);
    if (audio) audio.mission();
    state.missionIndex += 1;
    if (state.missionIndex >= MISSIONS.length) {
      state.storyDone = true;
      state.mission = null;
      sim.say('STORY COMPLETE — Solmar Bay is yours.', 8);
    } else {
      setIdleMarker();
    }
    if (onSave) onSave();
  }

  function failMission(reason) {
    sim.say(`Mission failed: ${reason}`, 5);
    if (audio) audio.fail();
    state.enemies.length = 0;
    setIdleMarker();
  }

  function advanceStage() {
    const m = MISSIONS[state.mission.index];
    const next = state.mission.stage + 1;
    if (next >= m.stages.length) {
      completeMission();
      return;
    }
    const s = m.stages[next];
    state.mission.stage = next;
    state.mission.label = s.label;
    state.mission.target = s.target;
    state.mission.timer = s.timer || 0;
    state.mission.enemiesLeft = 0;
    if (s.kind === 'fight') {
      spawnEnemies(s.count, s.target.x, s.target.z);
      state.mission.enemiesLeft = s.count;
      sim.say('Rivals incoming — take them down!');
    }
  }

  function update(dt) {
    if (state.storyDone) return;
    if (!state.mission) setIdleMarker();
    const m = state.mission;
    const p = state.player;
    if (m.isStart) {
      if (dist(p.x, p.z, m.target.x, m.target.z) < 5) startMission();
      return;
    }
    const def = MISSIONS[m.index].stages[m.stage];
    if (m.timer > 0) {
      m.timer -= dt;
      if (m.timer <= 0) {
        failMission('Out of time.');
        return;
      }
    }
    if (def.kind === 'steal') {
      if (!p.onFoot) advanceStage();
    } else if (def.kind === 'goto') {
      if (m.target && dist(p.x, p.z, m.target.x, m.target.z) < (def.radius || 6)) {
        if (def.onArrive === 'heat') sim.addWanted(1, 'The docks crew tipped off the cops!');
        if (def.onArrive === 'heat3') sim.addWanted(3, 'The alarm is up — lose them!');
        advanceStage();
      }
    } else if (def.kind === 'fight') {
      const left = state.enemies.filter((e) => e.alive).length;
      m.enemiesLeft = left;
      if (left === 0) advanceStage();
    }
    updateEnemies(dt);
  }

  function updateEnemies(dt) {
    const p = state.player;
    for (const e of state.enemies) {
      if (!e.alive) continue;
      const d = dist(e.x, e.z, p.x, p.z);
      e.angle = Math.atan2(p.x - e.x, p.z - e.z);
      if (d > 12) {
        // Close the distance.
        e.x += Math.sin(e.angle) * 3.0 * dt;
        e.z += Math.cos(e.angle) * 3.0 * dt;
      } else if (d < 6) {
        e.x -= Math.sin(e.angle) * 1.5 * dt;
        e.z -= Math.cos(e.angle) * 1.5 * dt;
      }
      e.shootTimer -= dt;
      if (d < COMBAT.enemyRange && e.shootTimer <= 0) {
        e.shootTimer = COMBAT.enemyRate * (0.8 + random() * 0.5);
        state.effects.push({ x: e.x, y: 1.4, z: e.z, t: 0, life: 0.08, color: [1, 0.8, 0.2] });
        if (audio) audio.shot();
        if (random() < COMBAT.enemyAim) {
          sim.hurtPlayer(COMBAT.enemyDamage, 'You were shot.');
        }
      }
    }
  }

  let shootCooldown = 0;

  /** Fire the pistol toward the camera's facing. Returns true if it fired. */
  function shoot(dt) {
    shootCooldown -= dt;
    const p = state.player;
    if (!p.armed || p.weapon !== 'pistol' || !p.onFoot) return false;
    if (shootCooldown > 0) return false;
    shootCooldown = COMBAT.pistolRate;
    const yaw = state.camYaw;
    const dx = Math.sin(yaw);
    const dz = Math.cos(yaw);
    const gx = p.x + dx * 0.8;
    const gz = p.z + dz * 0.8;
    state.effects.push({ x: gx, y: 1.35, z: gz, t: 0, life: 0.07, color: [1, 0.85, 0.3] });
    if (audio) audio.shot();
    let best = null;
    let bestD = COMBAT.pistolRange;
    for (const e of state.enemies) {
      if (!e.alive) continue;
      const ex = e.x - p.x;
      const ez = e.z - p.z;
      const along = ex * dx + ez * dz;
      if (along < 1 || along > bestD) continue;
      const side = Math.abs(ex * dz - ez * dx);
      if (side < 1.6 + along * 0.06) {
        best = e;
        bestD = along;
      }
    }
    if (best) {
      best.health -= COMBAT.pistolDamage;
      best.flash = 0.15;
      state.effects.push({ x: best.x, y: 1.2, z: best.z, t: 0, life: 0.12, color: [1, 0.3, 0.2] });
      if (best.health <= 0) {
        best.alive = false;
        sim.addWanted(1, '');
        sim.say('Rival down.');
      }
    }
    return true;
  }

  function tick(dt) {
    shootCooldown = Math.max(0, shootCooldown - dt);
  }

  /** Jump straight to a mission stage (used by the screenshot stager). */
  function stageMission(index, stage) {
    state.missionIndex = index;
    const m = MISSIONS[index];
    const s = m.stages[stage];
    state.mission = {
      index,
      stage,
      isStart: false,
      name: m.name,
      label: s.label,
      target: s.target,
      timer: s.timer || 0,
      enemiesLeft: 0,
    };
    if (index === 2 && !state.player.armed) {
      state.player.armed = true;
      state.player.weapon = 'pistol';
    }
    if (s.kind === 'fight') {
      spawnEnemies(s.count, s.target.x, s.target.z);
      state.mission.enemiesLeft = s.count;
    }
  }

  setIdleMarker();

  return { update, shoot, tick, stageMission, missions: MISSIONS };
}

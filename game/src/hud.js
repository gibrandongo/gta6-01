// The HUD: DOM panels for cash, health, wanted stars, speed and the mission
// objective, plus a 2D canvas minimap drawn from the same city data the world
// uses. The title, pause and busted screens are DOM overlays in index.html;
// this file shows and hides them and keeps every number fresh.

import { CITY, DISTRICTS } from './config.js';

function districtAt(x, z) {
  for (const d of DISTRICTS) {
    if (x >= d.x0 && x <= d.x1 && z >= d.z0 && z <= d.z1) return d.name;
  }
  return 'Solmar Bay';
}

function clockText(clock) {
  const h = Math.floor(clock) % 24;
  const m = Math.floor((clock - Math.floor(clock)) * 60);
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}

export function createHud(city) {
  const el = (id) => document.getElementById(id);
  const cashEl = el('cash');
  const districtEl = el('district');
  const clockEl = el('clock');
  const starsEl = el('stars');
  const healthFill = el('health-fill');
  const healthText = el('health-text');
  const weaponEl = el('weapon');
  const speedEl = el('speed');
  const objectiveEl = el('objective');
  const objectiveLabel = el('objective-label');
  const toastEl = el('toast');
  const minimap = el('minimap');
  const mapCtx = minimap.getContext('2d');
  const titleEl = el('title-screen');
  const pauseEl = el('pause-screen');
  const bustedEl = el('busted-screen');
  const storyEl = el('story-screen');
  const titleSave = el('title-save');
  const pauseSave = el('pause-save');

  let lastCash = -1;
  let lastStars = -1;
  let lastHealth = -1;
  let lastWeapon = '';
  let lastObjective = '';
  let lastSpeed = -1;
  let lastDistrict = '';
  let lastClock = '';

  function drawMinimap(state) {
    const size = minimap.width;
    const scale = size / (CITY.half * 2 + 90);
    const toMap = (x, z) => [(x + CITY.half + 45) * scale, (z + CITY.half + 45) * scale];
    mapCtx.clearRect(0, 0, size, size);
    // Sea and sand.
    mapCtx.fillStyle = '#2e7f9e';
    mapCtx.fillRect(0, (CITY.seaZ - CITY.half - 45) * scale, size, size);
    mapCtx.fillStyle = '#e8cf9a';
    mapCtx.fillRect(0, (CITY.beachZ - CITY.half - 45) * scale, size, (CITY.seaZ - CITY.beachZ) * scale);
    // Ground.
    mapCtx.fillStyle = '#6d7a5c';
    const g0 = toMap(-CITY.half, -CITY.half);
    mapCtx.fillRect(g0[0], g0[1], CITY.half * 2 * scale, CITY.half * 2 * scale);
    // Roads.
    mapCtx.strokeStyle = '#3a3f46';
    mapCtx.lineWidth = Math.max(2, CITY.road * scale);
    for (const at of city.lines) {
      const a = toMap(at, -CITY.half);
      const b = toMap(at, CITY.half);
      mapCtx.beginPath();
      mapCtx.moveTo(a[0], a[1]);
      mapCtx.lineTo(b[0], b[1]);
      mapCtx.stroke();
      const c = toMap(-CITY.half, at);
      const d = toMap(CITY.half, at);
      mapCtx.beginPath();
      mapCtx.moveTo(c[0], c[1]);
      mapCtx.lineTo(d[0], d[1]);
      mapCtx.stroke();
    }
    // Buildings.
    mapCtx.fillStyle = '#b59a80';
    for (const b of city.buildings) {
      const p = toMap(b.x0, b.z0);
      mapCtx.fillRect(p[0], p[1], (b.x1 - b.x0) * scale, (b.z1 - b.z0) * scale);
    }
    // Sun coins not yet taken.
    mapCtx.fillStyle = '#f2c94c';
    for (let i = 0; i < city.coins.length; i += 1) {
      if (state.coinsTaken.includes(i)) continue;
      const p = toMap(city.coins[i].x, city.coins[i].z);
      mapCtx.fillRect(p[0] - 1.5, p[1] - 1.5, 3, 3);
    }
    // Mission target.
    if (state.mission && state.mission.target) {
      const p = toMap(state.mission.target.x, state.mission.target.z);
      mapCtx.fillStyle = '#ffd23d';
      mapCtx.beginPath();
      mapCtx.arc(p[0], p[1], 6, 0, Math.PI * 2);
      mapCtx.fill();
      mapCtx.strokeStyle = '#7a5a00';
      mapCtx.lineWidth = 2;
      mapCtx.stroke();
    }
    // Police cars.
    mapCtx.fillStyle = '#2a6df0';
    for (const car of state.police) {
      const p = toMap(car.x, car.z);
      mapCtx.beginPath();
      mapCtx.arc(p[0], p[1], 3.5, 0, Math.PI * 2);
      mapCtx.fill();
    }
    // Enemies.
    mapCtx.fillStyle = '#e53d3d';
    for (const e of state.enemies) {
      if (!e.alive) continue;
      const p = toMap(e.x, e.z);
      mapCtx.beginPath();
      mapCtx.arc(p[0], p[1], 3, 0, Math.PI * 2);
      mapCtx.fill();
    }
    // The player: a white arrow pointing where they face.
    const p = state.player;
    const pp = toMap(p.x, p.z);
    mapCtx.save();
    mapCtx.translate(pp[0], pp[1]);
    mapCtx.rotate(p.angle);
    mapCtx.fillStyle = '#ffffff';
    mapCtx.strokeStyle = '#222222';
    mapCtx.lineWidth = 1.5;
    mapCtx.beginPath();
    mapCtx.moveTo(0, -7);
    mapCtx.lineTo(5, 6);
    mapCtx.lineTo(0, 3);
    mapCtx.lineTo(-5, 6);
    mapCtx.closePath();
    mapCtx.fill();
    mapCtx.stroke();
    mapCtx.restore();
  }

  function update(state) {
    const p = state.player;
    if (state.cash !== lastCash) {
      lastCash = state.cash;
      cashEl.textContent = `$${state.cash.toLocaleString('en-US')}`;
    }
    const district = districtAt(p.x, p.z);
    if (district !== lastDistrict) {
      lastDistrict = district;
      districtEl.textContent = district;
    }
    const clock = clockText(state.clock);
    if (clock !== lastClock) {
      lastClock = clock;
      clockEl.textContent = clock;
    }
    if (state.wanted.stars !== lastStars) {
      lastStars = state.wanted.stars;
      starsEl.textContent = '★'.repeat(state.wanted.stars) + '☆'.repeat(5 - state.wanted.stars);
      starsEl.classList.toggle('hot', state.wanted.stars > 0);
    }
    const health = Math.ceil(p.health);
    if (health !== lastHealth) {
      lastHealth = health;
      healthFill.style.width = `${health}%`;
      healthFill.classList.toggle('low', health <= 30);
      healthText.textContent = `${health}`;
    }
    const weapon = p.armed ? 'Pistol' : 'Fists';
    if (weapon !== lastWeapon) {
      lastWeapon = weapon;
      weaponEl.textContent = weapon;
    }
    const speed = p.onFoot ? 0 : Math.round(state.speedKmh);
    if (speed !== lastSpeed) {
      lastSpeed = speed;
      speedEl.textContent = p.onFoot ? '' : `${speed} km/h`;
    }
    const objective = state.storyDone
      ? 'Story complete — Solmar Bay is yours. Free roam!'
      : state.mission
        ? `${state.mission.isStart ? '◆ ' : '► '}${state.mission.label}`
        : '';
    if (objective !== lastObjective) {
      lastObjective = objective;
      objectiveEl.textContent = objective;
      objectiveLabel.textContent = state.storyDone
        ? 'STORY COMPLETE'
        : state.mission
          ? (state.mission.isStart ? 'NEXT JOB' : `MISSION ${state.mission.index + 1} — ${state.mission.name}`)
          : '';
    }
    const msg = state.messages.length > 0 ? state.messages[state.messages.length - 1].text : '';
    if (toastEl.textContent !== msg) toastEl.textContent = msg;
    drawMinimap(state);
  }

  function showOnly(which) {
    titleEl.classList.toggle('hidden', which !== 'title');
    pauseEl.classList.toggle('hidden', which !== 'pause');
    bustedEl.classList.toggle('hidden', which !== 'busted');
    storyEl.classList.toggle('hidden', which !== 'story');
  }

  return {
    update,
    showTitle(hasSave) {
      showOnly('title');
      titleSave.classList.toggle('hidden', !hasSave);
      el('btn-continue').classList.toggle('hidden', !hasSave);
    },
    showPause() {
      showOnly('pause');
    },
    showBusted() {
      showOnly('busted');
    },
    showStory() {
      showOnly('story');
    },
    hideScreens() {
      showOnly('none');
    },
    setPauseSave(text) {
      pauseSave.textContent = text;
    },
    setBustedStats(text) {
      el('busted-stats').textContent = text;
    },
    setStoryStats(text) {
      el('story-stats').textContent = text;
    },
  };
}

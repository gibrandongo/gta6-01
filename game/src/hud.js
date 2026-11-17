// The HUD: money and health, wanted stars, the clock, the objective line, the speedo,
// the circular minimap (roads, buildings, player, mission marker, police and traffic),
// banners, phone calls from Mara, and the title / pause / game-over screens.

import { formatMoney, formatClock, distance2D } from './utils.js';

export function createHud(city) {
  const el = (id) => document.getElementById(id);
  const moneyBox = el('moneyBox');
  const healthBar = el('healthBar');
  const armorBar = el('armorBar');
  const starsEl = el('stars');
  const clockBox = el('clockBox');
  const objectiveTitle = el('objectiveTitle');
  const objectiveText = el('objectiveText');
  const objectiveDist = el('objectiveDist');
  const speedNum = el('speedNum');
  const speedLabel = el('speedLabel');
  const banner = el('banner');
  const bannerTitle = el('bannerTitle');
  const bannerSub = el('bannerSub');
  const messageEl = el('message');
  const crosshair = el('crosshair');
  const phone = el('phone');
  const phoneName = el('phoneName');
  const phoneText = el('phoneText');
  const minimap = el('minimap');
  const mctx = minimap.getContext('2d');
  const status = el('status');

  let bannerTimer = 0;
  let messageTimer = 0;
  let phoneTimer = 0;

  function setStars(wanted) {
    let html = '';
    for (let i = 0; i < 5; i++) {
      html += i < wanted ? '<span>&#9733;</span>' : '<span class="off">&#9733;</span>';
    }
    starsEl.innerHTML = html;
  }

  function showBanner(title, sub, seconds) {
    bannerTitle.textContent = title;
    bannerSub.textContent = sub || '';
    banner.style.display = 'block';
    bannerTimer = seconds || 2.6;
  }

  function showMessage(text, seconds) {
    messageEl.textContent = text;
    messageEl.style.display = 'block';
    messageTimer = seconds || 4;
  }

  function showPhone(name, text, seconds) {
    phoneName.textContent = name;
    phoneText.textContent = text;
    phone.style.display = 'block';
    phoneTimer = seconds || 6;
  }

  function announce(text) {
    status.textContent = text;
  }

  function update(dt, s) {
    // s: { money, health, armor, wanted, minutes, day, objectiveTitle, objectiveText,
    //      objectiveDist, speedMph, inCar, playerX, playerZ, heading, marker, markerColor,
    //      policeCars, trafficCars, peds, shooting }
    moneyBox.childNodes[0].textContent = formatMoney(s.money);
    healthBar.style.width = Math.max(0, s.health) + '%';
    armorBar.style.width = Math.max(0, s.armor) + '%';
    setStars(s.wanted);
    clockBox.childNodes[0].textContent = formatClock(s.minutes);
    clockBox.childNodes[1].textContent = 'DAY ' + s.day + ' · SUNNY';
    objectiveTitle.textContent = s.objectiveTitle;
    objectiveText.textContent = s.objectiveText;
    objectiveDist.textContent = s.objectiveDist || '';
    speedNum.textContent = String(Math.round(s.speedMph));
    speedLabel.textContent = s.inCar ? 'IN A ' + (s.carName || 'CAR') : 'ON FOOT';
    crosshair.style.display = s.shooting ? 'block' : 'none';
    if (bannerTimer > 0) {
      bannerTimer -= dt;
      if (bannerTimer <= 0) banner.style.display = 'none';
    }
    if (messageTimer > 0) {
      messageTimer -= dt;
      if (messageTimer <= 0) messageEl.style.display = 'none';
    }
    if (phoneTimer > 0) {
      phoneTimer -= dt;
      if (phoneTimer <= 0) phone.style.display = 'none';
    }
    drawMinimap(s);
  }

  function drawMinimap(s) {
    const W = 420;
    const half = 300;
    const scale = W / (half * 2);
    const toMap = (x, z) => [(x + half) * scale, (z + half) * scale];
    mctx.clearRect(0, 0, W, W);
    // Water and sand at the bottom.
    mctx.fillStyle = '#2a7ab8';
    mctx.fillRect(0, (340 + half) * scale, W, W);
    mctx.fillStyle = '#e8d8a0';
    mctx.fillRect(0, (300 + half) * scale, W, (40) * scale);
    // Land.
    mctx.fillStyle = '#8a9a8a';
    mctx.fillRect(0, 0, W, (300 + half) * scale);
    // Roads.
    mctx.strokeStyle = '#3a3f46';
    mctx.lineWidth = 14 * scale;
    for (const line of city.roadLines) {
      const [x1, y1] = toMap(line, -270);
      const [x2, y2] = toMap(line, 270);
      mctx.beginPath(); mctx.moveTo(x1, y1); mctx.lineTo(x2, y2); mctx.stroke();
      const [x3, y3] = toMap(-270, line);
      const [x4, y4] = toMap(270, line);
      mctx.beginPath(); mctx.moveTo(x3, y3); mctx.lineTo(x4, y4); mctx.stroke();
    }
    // Buildings.
    mctx.fillStyle = 'rgba(60,70,80,0.9)';
    for (const c of city.colliders) {
      const [x, y] = toMap(c.minX, c.minZ);
      mctx.fillRect(x, y, (c.maxX - c.minX) * scale, (c.maxZ - c.minZ) * scale);
    }
    // Traffic dots.
    mctx.fillStyle = '#ffffff';
    for (const car of s.trafficCars) {
      const [x, y] = toMap(car.x, car.z);
      mctx.fillRect(x - 2, y - 2, 4, 4);
    }
    // Police dots.
    mctx.fillStyle = '#4a8aff';
    for (const car of s.policeCars) {
      const [x, y] = toMap(car.x, car.z);
      mctx.beginPath(); mctx.arc(x, y, 5, 0, Math.PI * 2); mctx.fill();
    }
    // Mission marker: a pulsing yellow diamond.
    if (s.marker) {
      const [x, y] = toMap(s.marker.x, s.marker.z);
      const pulse = 6 + Math.sin(performance.now() / 200) * 2;
      mctx.fillStyle = s.markerColor === 0x4ad87a ? '#4ad87a' : '#ffd94d';
      mctx.beginPath();
      mctx.moveTo(x, y - pulse);
      mctx.lineTo(x + pulse, y);
      mctx.lineTo(x, y + pulse);
      mctx.lineTo(x - pulse, y);
      mctx.closePath();
      mctx.fill();
      mctx.strokeStyle = '#ffffff';
      mctx.lineWidth = 2;
      mctx.stroke();
    }
    // Player arrow.
    const [px, py] = toMap(s.playerX, s.playerZ);
    mctx.save();
    mctx.translate(px, py);
    mctx.rotate(s.heading + Math.PI); // heading 0 faces +z, which is down on the map
    mctx.fillStyle = '#ffffff';
    mctx.strokeStyle = '#111111';
    mctx.lineWidth = 2;
    mctx.beginPath();
    mctx.moveTo(0, -11);
    mctx.lineTo(8, 9);
    mctx.lineTo(0, 4);
    mctx.lineTo(-8, 9);
    mctx.closePath();
    mctx.fill();
    mctx.stroke();
    mctx.restore();
    // North tick.
    mctx.fillStyle = '#ffffff';
    mctx.font = 'bold 20px sans-serif';
    mctx.fillText('N', W / 2 - 7, 22);
  }

  function showScreen(name) {
    for (const id of ['screenTitle', 'screenPause', 'screenOver', 'screenHelp']) {
      el(id).style.display = id === name ? 'flex' : 'none';
    }
    document.getElementById('hud').style.display = name === 'screenTitle' ? 'none' : 'block';
  }

  return {
    update, showBanner, showMessage, showPhone, announce, showScreen, setStars,
  };
}

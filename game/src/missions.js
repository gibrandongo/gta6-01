// Missions and side work for Solmar Bay: a six-job story arc from the fixer Mara Voss,
// plus taxi fares that appear around the city. Each mission is a list of objectives with
// a marker, a timer where it matters, and a payout. Progress is saved between visits.

import { distance2D } from './utils.js';

export const MISSIONS = [
  {
    id: 'first-wheels',
    title: 'FIRST WHEELS',
    caller: 'MARA VOSS',
    briefing: 'Welcome back, Dana. Your old ride is impounded, so take any car on the street — that is how this city works. Bring it to the hideout on Coral Row.',
    payout: 300,
    objectives: [
      { type: 'steal', text: 'Take any car (walk up and press E)' },
      { type: 'goto', text: 'Drive to the hideout', place: 'hideout', radius: 10 },
    ],
  },
  {
    id: 'courier-run',
    title: 'COURIER RUN',
    caller: 'MARA VOSS',
    briefing: 'A client at the marina needs a package moved to the north gate — no questions, no stops. You have 100 seconds. Drive like the bay is on fire.',
    payout: 550,
    objectives: [
      { type: 'goto', text: 'Pick up the package at the marina', place: 'marina', radius: 8 },
      { type: 'goto', text: 'Deliver to the north gate', place: 'northGate', radius: 10, timer: 100 },
    ],
  },
  {
    id: 'hot-cargo',
    title: 'HOT CARGO',
    caller: 'MARA VOSS',
    briefing: 'The cargo at the pier is hot — the SBPD will be on you the second you touch it. Grab it, shake the heat, and bring it to the old town garage.',
    payout: 800,
    objectives: [
      { type: 'goto', text: 'Grab the cargo at the pier', place: 'pier', radius: 8, wanted: 2 },
      { type: 'escape', text: 'Lose the police (get wanted to 0)', },
      { type: 'goto', text: 'Deliver to the old town garage', place: 'oldTown', radius: 10 },
    ],
  },
  {
    id: 'beach-heist',
    title: 'BEACH HEIST',
    caller: 'MARA VOSS',
    briefing: 'Three cash bundles are stashed along the beach — a courier dropped them and never came back. Collect all three, on foot or by car, and bring them home.',
    payout: 1200,
    objectives: [
      { type: 'collect', text: 'Collect the beach cash (0/3)', place: 'beach', radius: 8, count: 3 },
      { type: 'goto', text: 'Return to the hideout', place: 'hideout', radius: 10 },
    ],
  },
  {
    id: 'getaway-driver',
    title: 'GETAWAY DRIVER',
    caller: 'MARA VOSS',
    briefing: 'My crew is hitting a courier van downtown. You are the wheel. Be at the plaza when it goes loud, then outrun a three-star response to the hospital roof lot.',
    payout: 1500,
    objectives: [
      { type: 'goto', text: 'Get to the downtown plaza', place: 'downtown', radius: 10, wanted: 3 },
      { type: 'escape', text: 'Outrun the police to the hospital', place: 'hospital', radius: 12, requireEscape: true },
    ],
  },
  {
    id: 'the-big-score',
    title: 'THE BIG SCORE',
    caller: 'MARA VOSS',
    briefing: 'This is the one, Dana. The bay bank vault, one quiet morning, then the loudest getaway this city has ever seen. Grab the score, lose five stars, and meet me at the pier. Do this and you own Solmar Bay.',
    payout: 5000,
    objectives: [
      { type: 'goto', text: 'Reach the bay bank downtown', place: 'downtown', radius: 8, wanted: 5 },
      { type: 'collect', text: 'Grab the score (0/1)', place: 'downtown', radius: 8, count: 1 },
      { type: 'escape', text: 'Lose the five-star heat', },
      { type: 'goto', text: 'Meet Mara at the pier', place: 'pier', radius: 10 },
    ],
  },
];

export function createMissions(city) {
  let currentIndex = -1; // -1: no mission active
  let objectiveIndex = 0;
  let timer = 0;
  let completed = [];
  let taxi = null; // { stage, px, pz, dx, dz, fare, timer }
  let collectSpawned = [];
  let collectGot = 0;

  function currentMission() {
    return currentIndex >= 0 ? MISSIONS[currentIndex] : null;
  }

  function currentObjective() {
    const m = currentMission();
    return m ? m.objectives[objectiveIndex] : null;
  }

  function startNext() {
    const next = completed.length >= MISSIONS.length ? -1 : MISSIONS.findIndex((m) => !completed.includes(m.id));
    if (next < 0) {
      currentIndex = -1;
      return null;
    }
    currentIndex = next;
    objectiveIndex = 0;
    timer = 0;
    collectSpawned = [];
    collectGot = 0;
    return MISSIONS[next];
  }

  function markerPosition() {
    const obj = currentObjective();
    if (obj && obj.place) {
      const p = city.spawnPoints[obj.place];
      if (p) return { x: p.x, z: p.z };
    }
    if (taxi && taxi.stage === 'pickup') return { x: taxi.px, z: taxi.pz };
    if (taxi && taxi.stage === 'dropoff') return { x: taxi.dx, z: taxi.dz };
    return null;
  }

  function markerColor() {
    if (currentObjective()) return 0xffd94d;
    if (taxi) return 0x4ad87a;
    return null;
  }

  // Called every frame; returns events for the HUD and the game.
  function update(dt, ctx) {
    const events = [];
    const obj = currentObjective();
    if (obj) {
      if (obj.timer && timer === 0 && objectiveIndex > 0) timer = obj.timer;
      if (obj.timer) {
        timer -= dt;
        if (timer <= 0) {
          events.push({ type: 'failed', reason: 'Out of time — Mara is not happy.' });
          currentIndex = -1;
          objectiveIndex = 0;
          timer = 0;
          return events;
        }
      }
      if (obj.type === 'steal' && ctx.inCar) {
        advance(events);
      } else if (obj.type === 'goto' && obj.place) {
        const p = city.spawnPoints[obj.place];
        if (p && distance2D(ctx.x, ctx.z, p.x, p.z) < obj.radius) {
          if (obj.wanted) ctx.setWanted(obj.wanted);
          advance(events);
        }
      } else if (obj.type === 'escape') {
        if (ctx.wanted === 0) {
          if (obj.requireEscape && obj.place) {
            const p = city.spawnPoints[obj.place];
            if (p && distance2D(ctx.x, ctx.z, p.x, p.z) < obj.radius) advance(events);
          } else {
            advance(events);
          }
        }
      } else if (obj.type === 'collect') {
        if (collectSpawned.length === 0) {
          // Scatter the bundles around the objective place.
          const p = city.spawnPoints[obj.place];
          for (let i = 0; i < obj.count; i++) {
            const cx = p.x + (i - (obj.count - 1) / 2) * 22 + (i % 2 ? 8 : -8);
            const cz = p.z + (i % 2 ? -10 : 10);
            const pickup = ctx.spawnCash(cx, cz);
            collectSpawned.push(pickup);
          }
          if (obj.place === 'downtown' && obj.wanted) ctx.setWanted(obj.wanted);
        }
        const got = collectSpawned.filter((pk) => pk.taken).length;
        if (got !== collectGot) {
          collectGot = got;
          events.push({ type: 'collect', got, total: obj.count });
        }
        if (got >= obj.count) advance(events);
      }
    }
    // Taxi fares.
    if (taxi) {
      taxi.timer -= dt;
      if (taxi.stage === 'pickup' && distance2D(ctx.x, ctx.z, taxi.px, taxi.pz) < 6) {
        taxi.stage = 'dropoff';
        events.push({ type: 'taxi-picked' });
      } else if (taxi.stage === 'dropoff' && distance2D(ctx.x, ctx.z, taxi.dx, taxi.dz) < 8) {
        events.push({ type: 'taxi-done', fare: taxi.fare });
        taxi = null;
      } else if (taxi.timer <= 0) {
        events.push({ type: 'taxi-expired' });
        taxi = null;
      }
    }
    return events;
  }

  function advance(events) {
    const m = currentMission();
    objectiveIndex += 1;
    timer = 0;
    collectSpawned = [];
    collectGot = 0;
    if (objectiveIndex >= m.objectives.length) {
      completed.push(m.id);
      events.push({ type: 'mission-done', mission: m });
      currentIndex = -1;
      objectiveIndex = 0;
    } else {
      events.push({ type: 'objective', objective: m.objectives[objectiveIndex] });
    }
  }

  function offerTaxi(rng) {
    if (taxi || currentMission()) return null;
    const px = rng.range(-240, 240);
    const pz = rng.range(-240, 240);
    const dx = rng.range(-240, 240);
    const dz = rng.range(-240, 240);
    const snappedP = city.snapToRoad(px, pz);
    const snappedD = city.snapToRoad(dx, dz);
    taxi = {
      stage: 'pickup',
      px: snappedP.x, pz: snappedP.z, dx: snappedD.x, dz: snappedD.z,
      fare: 120 + Math.floor(distance2D(snappedP.x, snappedP.z, snappedD.x, snappedD.z) / 10) * 15,
      timer: 150,
    };
    return taxi;
  }

  function loadProgress(doneList) {
    completed = [...doneList];
  }

  return {
    get currentIndex() { return currentIndex; },
    get objectiveIndex() { return objectiveIndex; },
    get completed() { return completed; },
    get taxi() { return taxi; },
    get timer() { return timer; },
    currentMission, currentObjective, startNext, markerPosition, markerColor,
    update, offerTaxi, loadProgress,
    isStoryDone() { return completed.length >= MISSIONS.length; },
  };
}

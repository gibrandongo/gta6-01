// The screenshot scenes behind ?shot=cover|city|mission|start. Each one plays
// the real rules forward from a fresh world for a fixed number of steps, steered
// by a fixed scripted input, so the frame is what real play looks like and the
// same seed always gives the same frame. The loop then paints it twice and sets
// window.__shotReady.

import { STEP } from './config.js';
import { ACTION_SHOOT } from './input.js';

function fakeInput(spec) {
  return {
    forward: () => !!spec.forward,
    back: () => !!spec.back,
    left: () => !!spec.left,
    right: () => !!spec.right,
    run: () => !!spec.run,
    handbrake: () => !!spec.handbrake,
    takeDrag: () => ({ x: 0, y: 0 }),
    takeActions: () => spec.actions || 0,
  };
}

const IDLE = fakeInput({});

/**
 * Run `seconds` of the world with the given scripted input (a function of the
 * elapsed seconds returning a fake input, or one fixed fake input).
 */
function runFor(world, seconds, script) {
  const steps = Math.round(seconds / STEP);
  for (let i = 0; i < steps; i += 1) {
    const input = typeof script === 'function' ? script(i * STEP) : script;
    world.step(STEP, input);
  }
}

/** Put the player on foot at (x, z), facing `angle`, camera behind them. */
function placeOnFoot(world, x, z, angle) {
  const p = world.state.player;
  p.x = x;
  p.z = z;
  p.angle = angle;
  p.vx = 0;
  p.vz = 0;
  world.state.camYaw = angle;
}

export function stageShot(name, world) {
  world.reset(true);
  if (name === 'start') {
    // Golden hour on the beach, the skyline ahead, title screen over it.
    placeOnFoot(world, 0, 208, Math.PI);
    world.state.camPitch = 0.18;
    runFor(world, 3, IDLE);
    return { screen: 'title' };
  }
  if (name === 'cover') {
    // A three-star chase down a straight road: stolen car, police on the tail,
    // downtown ahead. The car is placed on the road first so the chase reads.
    const car = world.sim.nearestCar(400);
    if (car) {
      world.state.player.x = car.x + 2;
      world.state.player.z = car.z;
      world.sim.enterCar(car);
      car.x = -26.5;
      car.z = -120;
      car.angle = 0;
      car.speed = 0;
      world.state.camYaw = 0;
    }
    world.sim.addWanted(3, '');
    // Clear the road ahead so the chase is not a traffic jam.
    world.state.cars = world.state.cars.filter((c) => !(c.kind === 'traffic' && Math.abs(c.x + 30) < 10));
    runFor(world, 7, fakeInput({ forward: true }));
    // Pull the chase into the frame: two police cars right on the tail.
    world.sim.stagePolice();
    runFor(world, 0.6, fakeInput({ forward: true }));
    return { screen: 'play' };
  }
  if (name === 'mission') {
    // Mission 3's shootout at the Old Town market, pistol out, rivals closing in.
    world.missions.stageMission(2, 1);
    placeOnFoot(world, -90, 44, Math.PI);
    world.state.player.armed = true;
    world.state.player.weapon = 'pistol';
    runFor(world, 2.5, IDLE);
    world.step(STEP, fakeInput({ actions: ACTION_SHOOT }));
    runFor(world, 0.4, IDLE);
    return { screen: 'play' };
  }
  // city: on foot on the sidewalk downtown, traffic and pedestrians all around.
  placeOnFoot(world, -21.5, -80, 0);
  // A pedestrian ahead on the same sidewalk, and a car passing on the road.
  const ped = world.state.peds[0];
  if (ped) { ped.x = -21.5; ped.z = -52; ped.angle = 0; }
  const car = world.state.cars.find((c) => c.kind === 'traffic');
  if (car) { car.x = -33.5; car.z = -30; car.angle = Math.PI; car.speed = 10; car.targetSpeed = 10; }
  runFor(world, 6, fakeInput({ forward: true }));
  return { screen: 'play' };
}

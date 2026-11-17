// Dana Marlowe on foot: a simple articulated figure (torso, head, legs that swing while
// walking), third-person camera with mouse-drag orbit and wheel zoom, and the enter/exit
// car handoff. Movement is camera-relative; the figure turns toward its motion.

import { clamp, angleLerp, distance2D } from './utils.js';

const WALK_SPEED = 6;
const RUN_SPEED = 10;

export function createPlayer(scene, city) {
  const group = new THREE.Group();
  const jacketMat = new THREE.MeshLambertMaterial({ color: 0xd84a6a });
  const jeansMat = new THREE.MeshLambertMaterial({ color: 0x2a4a7a });
  const skinMat = new THREE.MeshLambertMaterial({ color: 0xc8906a });
  const hairMat = new THREE.MeshLambertMaterial({ color: 0x2a1a12 });

  const torso = new THREE.Mesh(new THREE.BoxGeometry(0.85, 1.0, 0.5), jacketMat);
  torso.position.y = 1.25;
  torso.castShadow = true;
  const head = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.5, 0.5), skinMat);
  head.position.y = 2.0;
  head.castShadow = true;
  const hair = new THREE.Mesh(new THREE.BoxGeometry(0.54, 0.22, 0.54), hairMat);
  hair.position.y = 2.28;
  const legL = new THREE.Mesh(new THREE.BoxGeometry(0.32, 0.8, 0.36), jeansMat);
  legL.position.set(-0.22, 0.4, 0);
  const legR = new THREE.Mesh(new THREE.BoxGeometry(0.32, 0.8, 0.36), jeansMat);
  legR.position.set(0.22, 0.4, 0);
  const armL = new THREE.Mesh(new THREE.BoxGeometry(0.24, 0.85, 0.28), jacketMat);
  armL.position.set(-0.56, 1.25, 0);
  const armR = new THREE.Mesh(new THREE.BoxGeometry(0.24, 0.85, 0.28), jacketMat);
  armR.position.set(0.56, 1.25, 0);
  group.add(torso, head, hair, legL, legR, armL, armR);
  scene.add(group);

  const state = {
    x: 0, z: 0, heading: 0, speed: 0, health: 100, armor: 0,
    walkPhase: 0, moving: false, inCar: false, car: null,
    camYaw: Math.PI, camPitch: 0.32, camDist: 9,
  };
  group.position.set(0, 0, 0);

  function setPosition(x, z, heading) {
    state.x = x;
    state.z = z;
    state.heading = heading;
    group.position.set(x, 0, z);
    group.rotation.y = heading;
  }

  function step(input, dt) {
    // Camera-relative movement: W walks away from the camera.
    const forwardX = -Math.sin(state.camYaw);
    const forwardZ = -Math.cos(state.camYaw);
    const rightX = Math.cos(state.camYaw);
    const rightZ = -Math.sin(state.camYaw);
    const ix = (input.forward ? 1 : 0) - (input.back ? 1 : 0);
    const iz = (input.right ? 1 : 0) - (input.left ? 1 : 0);
    const mx = forwardX * ix + rightX * iz;
    const mz = forwardZ * ix + rightZ * iz;
    const len = Math.hypot(mx, mz);
    state.moving = len > 0.01;
    const targetSpeed = state.moving ? (input.run ? RUN_SPEED : WALK_SPEED) : 0;
    state.speed = THREE.MathUtils.lerp(state.speed, targetSpeed, dt * 8);
    if (state.moving) {
      const nx = state.x + (mx / len) * state.speed * dt;
      const nz = state.z + (mz / len) * state.speed * dt;
      const hit = city.collideCircle(nx, nz, 0.7);
      if (!hit.hit) {
        state.x = nx;
        state.z = nz;
      } else {
        // Slide along the wall: try each axis alone.
        if (!city.collideCircle(nx, state.z, 0.7).hit) state.x = nx;
        else if (!city.collideCircle(state.x, nz, 0.7).hit) state.z = nz;
      }
      state.heading = angleLerp(state.heading, Math.atan2(mx, mz), dt * 12);
      state.walkPhase += dt * state.speed * 1.6;
    }
    state.x = clamp(state.x, -268, 268);
    state.z = clamp(state.z, -268, 306);
    group.position.set(state.x, 0, state.z);
    group.rotation.y = state.heading;
    const swing = state.moving ? Math.sin(state.walkPhase) * 0.55 : 0;
    legL.rotation.x = swing;
    legR.rotation.x = -swing;
    armL.rotation.x = -swing * 0.7;
    armR.rotation.x = swing * 0.7;
    torso.position.y = 1.25 + (state.moving ? Math.abs(Math.sin(state.walkPhase)) * 0.06 : 0);
  }

  function cameraTarget() {
    return { x: state.x, y: 1.8, z: state.z };
  }

  function cameraPosition() {
    const target = cameraTarget();
    return {
      x: target.x + Math.sin(state.camYaw) * Math.cos(state.camPitch) * state.camDist,
      y: target.y + Math.sin(state.camPitch) * state.camDist,
      z: target.z + Math.cos(state.camYaw) * Math.cos(state.camPitch) * state.camDist,
    };
  }

  function damage(amount) {
    let remaining = amount;
    if (state.armor > 0) {
      const absorbed = Math.min(state.armor, remaining * 0.6);
      state.armor -= absorbed;
      remaining -= absorbed;
    }
    state.health -= remaining;
    if (state.health < 0) state.health = 0;
    return state.health <= 0;
  }

  function heal(amount) {
    state.health = clamp(state.health + amount, 0, 100);
  }

  return {
    group, state, setPosition, step, cameraTarget, cameraPosition, damage, heal,
    isInCar() { return state.inCar; },
  };
}

// The chase camera: follows the player or the car, eases toward its target, and keeps
// the horizon level. C toggles a closer / wider view.
export function createCameraRig(camera) {
  let mode = 0; // 0 normal, 1 close, 2 high
  const distances = [9, 6, 14];
  const heights = [0.32, 0.22, 0.55];
  let smoothPos = new THREE.Vector3(0, 10, 20);
  let smoothLook = new THREE.Vector3(0, 2, 0);

  function update(targetPos, lookAt, dt, snap) {
    const dist = distances[mode];
    const pitch = heights[mode];
    const desired = new THREE.Vector3(
      targetPos.x + Math.sin(targetPos.yaw) * Math.cos(pitch) * dist,
      targetPos.y + Math.sin(pitch) * dist,
      targetPos.z + Math.cos(targetPos.yaw) * Math.cos(pitch) * dist,
    );
    if (snap) {
      smoothPos.copy(desired);
      smoothLook.copy(lookAt);
    } else {
      smoothPos.lerp(desired, 1 - Math.exp(-dt * 6));
      smoothLook.lerp(lookAt, 1 - Math.exp(-dt * 8));
    }
    camera.position.copy(smoothPos);
    camera.lookAt(smoothLook);
  }

  return {
    cycle() { mode = (mode + 1) % 3; },
    update,
  };
}

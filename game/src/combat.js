// Combat: a hitscan pistol with a tracer and muzzle flash, damage to people and cars,
// pickups (health, armor, cash) scattered around the city, and car explosions with
// smoke, fire and a shockwave ring.

import { distance2D } from './utils.js';

export function createCombat(scene, city, rng) {
  const tracers = [];
  const particles = [];
  const pickups = [];
  const explosions = [];

  const tracerMat = new THREE.MeshBasicMaterial({ color: 0xffe27a });
  const tracerGeo = new THREE.BoxGeometry(0.06, 0.06, 1);

  function spawnTracer(from, to) {
    const len = Math.sqrt(
      (to.x - from.x) ** 2 + (to.y - from.y) ** 2 + (to.z - from.z) ** 2,
    );
    const mesh = new THREE.Mesh(tracerGeo, tracerMat);
    mesh.scale.z = Math.max(0.1, len);
    mesh.position.set((from.x + to.x) / 2, (from.y + to.y) / 2, (from.z + to.z) / 2);
    mesh.lookAt(to.x, to.y, to.z);
    scene.add(mesh);
    tracers.push({ mesh, life: 0.08 });
  }

  function burst(x, y, z, color, count, speed, life, gravity) {
    const geo = new THREE.BoxGeometry(0.22, 0.22, 0.22);
    for (let i = 0; i < count; i++) {
      const mat = new THREE.MeshBasicMaterial({ color });
      const mesh = new THREE.Mesh(geo, mat);
      mesh.position.set(x, y, z);
      scene.add(mesh);
      const a = rng.next() * Math.PI * 2;
      const up = rng.next() * 0.9 + 0.2;
      particles.push({
        mesh, life: life * (0.6 + rng.next() * 0.7), maxLife: life,
        vx: Math.cos(a) * speed * rng.next(), vy: up * speed, vz: Math.sin(a) * speed * rng.next(),
        gravity: gravity === undefined ? 9 : gravity,
      });
    }
  }

  function explode(x, z) {
    burst(x, 1.2, z, 0xff8830, 26, 9, 0.9, 6);
    burst(x, 1.0, z, 0x333333, 14, 4, 1.6, -1.5);
    burst(x, 1.5, z, 0xffe27a, 10, 12, 0.5, 4);
    const ring = new THREE.Mesh(
      new THREE.TorusGeometry(1, 0.35, 8, 24),
      new THREE.MeshBasicMaterial({ color: 0xffaa33, transparent: true, opacity: 0.9 }),
    );
    ring.rotation.x = Math.PI / 2;
    ring.position.set(x, 0.6, z);
    scene.add(ring);
    explosions.push({ mesh: ring, life: 0.5, maxLife: 0.5 });
    const light = new THREE.PointLight(0xff8830, 60, 40);
    light.position.set(x, 4, z);
    scene.add(light);
    explosions.push({ light, life: 0.35, maxLife: 0.35 });
  }

  // Fire one shot from the shooter's position toward a world point. Returns what it hit.
  function shoot(from, target, targets) {
    const dir = new THREE.Vector3(target.x - from.x, target.y - from.y, target.z - from.z);
    const len = dir.length();
    dir.normalize();
    const ray = new THREE.Raycaster(
      new THREE.Vector3(from.x, from.y, from.z),
      dir,
      0.1,
      Math.min(len + 40, 120),
    );
    const hitMeshes = [];
    const meshToTarget = new Map();
    for (const t of targets) {
      if (!t.mesh || t.dead) continue;
      t.mesh.traverse((child) => {
        if (child.isMesh) {
          hitMeshes.push(child);
          meshToTarget.set(child, t);
        }
      });
    }
    // Buildings block shots too.
    const blockers = [];
    for (const c of city.colliders) {
      const box = new THREE.Mesh(new THREE.BoxGeometry(c.maxX - c.minX, 60, c.maxZ - c.minZ));
      box.position.set((c.minX + c.maxX) / 2, 30, (c.minZ + c.maxZ) / 2);
      blockers.push(box);
    }
    const hits = ray.intersectObjects([...hitMeshes, ...blockers], false);
    let end = new THREE.Vector3(from.x + dir.x * len, from.y + dir.y * len, from.z + dir.z * len);
    let hitTarget = null;
    if (hits.length > 0) {
      const h = hits[0];
      end = h.point.clone();
      hitTarget = meshToTarget.get(h.object) || null;
      if (!hitTarget) {
        // Hit a building: spark.
        burst(end.x, end.y, end.z, 0xcccccc, 5, 3, 0.4, 6);
      }
    }
    spawnTracer(from, { x: end.x, y: end.y, z: end.z });
    return { hitTarget, point: end };
  }

  // Pickups: health kits, armor vests and cash bundles.
  const pickupColors = { health: 0x4ad87a, armor: 0x6ec6ff, cash: 0x4ad87a };
  function spawnPickup(kind, x, z) {
    const group = new THREE.Group();
    const color = kind === 'cash' ? 0x2a8a3a : pickupColors[kind];
    const box = new THREE.Mesh(
      new THREE.BoxGeometry(0.9, 0.9, 0.9),
      new THREE.MeshLambertMaterial({ color, emissive: color, emissiveIntensity: 0.35 }),
    );
    box.position.y = 1;
    const beam = new THREE.Mesh(
      new THREE.CylinderGeometry(0.5, 0.5, 4, 10, 1, true),
      new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.25, side: THREE.DoubleSide }),
    );
    beam.position.y = 2;
    group.add(box, beam);
    group.position.set(x, 0, z);
    scene.add(group);
    const pickup = { mesh: group, kind, x, z, taken: false, spin: rng.next() * 6 };
    pickups.push(pickup);
    return pickup;
  }

  function seedPickups() {
    const spots = [
      ['health', -210, -210], ['health', 210, 210], ['health', 0, -240],
      ['armor', 210, -210], ['armor', -210, 210], ['armor', 120, 120],
      ['cash', -120, 300 - 6], ['cash', 60, 294], ['cash', -240, 0], ['cash', 240, 120],
      ['health', 120, -120], ['armor', -120, -120],
    ];
    for (const [kind, x, z] of spots) spawnPickup(kind, x, z);
  }

  function update(dt, time, playerX, playerZ, onPickup) {
    for (const t of tracers) {
      t.life -= dt;
      if (t.life <= 0) {
        scene.remove(t.mesh);
        tracers.splice(tracers.indexOf(t), 1);
      }
    }
    for (const p of [...particles]) {
      p.life -= dt;
      if (p.life <= 0) {
        scene.remove(p.mesh);
        particles.splice(particles.indexOf(p), 1);
        continue;
      }
      p.vy -= p.gravity * dt;
      p.mesh.position.x += p.vx * dt;
      p.mesh.position.y += p.vy * dt;
      p.mesh.position.z += p.vz * dt;
      if (p.mesh.position.y < 0.1) p.mesh.position.y = 0.1;
    }
    for (const e of [...explosions]) {
      e.life -= dt;
      const f = Math.max(0, e.life / e.maxLife);
      if (e.mesh) {
        e.mesh.scale.setScalar(1 + (1 - f) * 9);
        e.mesh.material.opacity = f;
      }
      if (e.light) e.light.intensity = 60 * f;
      if (e.life <= 0) {
        if (e.mesh) scene.remove(e.mesh);
        if (e.light) scene.remove(e.light);
        explosions.splice(explosions.indexOf(e), 1);
      }
    }
    for (const pk of [...pickups]) {
      if (pk.taken) continue;
      pk.spin += dt * 2;
      pk.mesh.rotation.y = pk.spin;
      pk.mesh.children[0].position.y = 1 + Math.sin(time * 2 + pk.spin) * 0.15;
      if (distance2D(playerX, playerZ, pk.x, pk.z) < 1.8) {
        pk.taken = true;
        scene.remove(pk.mesh);
        pickups.splice(pickups.indexOf(pk), 1);
        onPickup(pk.kind);
      }
    }
  }

  return { shoot, explode, burst, spawnPickup, seedPickups, update, pickups };
}

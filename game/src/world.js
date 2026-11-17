// The world: one object holding the city, the simulation, the missions and the
// HUD, stepping them together in fixed 1/60 s steps. It knows nothing about
// screens or the DOM beyond what the HUD needs, and it exposes the little the
// screenshot stager and the headless self-test need.

import { STEP } from './config.js';
import { createRandom } from './random.js';
import { buildCity } from './city.js';
import { createSim } from './sim.js';
import { createMissions } from './missions.js';
import { createAudio } from './audio.js';
import { createHud } from './hud.js';
import { applySave, readSave, writeSave } from './save.js';
import { ACTION_INTERACT, ACTION_PAUSE, ACTION_SHOOT, ACTION_WEAPON } from './input.js';

export function createWorld(seed) {
  const random = createRandom(seed);
  const city = buildCity(random);
  const audio = createAudio();
  const sim = createSim(city, random, audio);
  const missions = createMissions(sim, random, audio, () => writeSave(sim.state));
  const hud = createHud(city);

  const world = {
    city,
    sim,
    missions,
    hud,
    audio,
    state: sim.state,
    screen: 'title',
    saved: false,

    reset(newGame) {
      sim.reset(newGame);
      missions.update(0);
      this.screen = 'play';
    },

    load() {
      const data = readSave();
      if (!data) return false;
      sim.reset(false);
      applySave(sim.state, data);
      missions.update(0);
      this.screen = 'play';
      return true;
    },

    save() {
      this.saved = writeSave(sim.state);
      return this.saved;
    },

    /** After being busted: back on the street, $200 lighter, heat gone. */
    respawn() {
      const state = sim.state;
      if (!state.player.onFoot) sim.exitCar();
      state.player.x = -30;
      state.player.z = -30;
      state.player.angle = 0;
      state.player.vx = 0;
      state.player.vz = 0;
      state.player.health = 100;
      state.player.hurtTimer = 0;
      state.wanted.stars = 0;
      state.wanted.coolTimer = 0;
      state.police.length = 0;
      state.enemies.length = 0;
      state.cash = Math.max(0, state.cash - 200);
      state.busted = false;
      state.camYaw = 0;
      this.screen = 'play';
      this.save();
    },

    step(dt, input) {
      const actions = input.takeActions();
      const state = sim.state;
      if (actions & ACTION_PAUSE) {
        if (this.screen === 'play') {
          this.screen = 'paused';
          this.save();
        } else if (this.screen === 'paused') {
          this.screen = 'play';
        }
      }
      if (this.screen !== 'play') return;
      if (actions & ACTION_INTERACT) {
        if (state.player.onFoot) {
          const car = sim.nearestCar(3.2);
          if (car) sim.enterCar(car);
        } else {
          sim.exitCar();
        }
      }
      if (actions & ACTION_WEAPON) {
        if (state.player.armed) {
          state.player.armed = false;
          state.player.weapon = 'fists';
        } else if (state.player.weapon === 'pistol') {
          state.player.armed = true;
        }
      }
      if (actions & ACTION_SHOOT) missions.shoot(dt);
      missions.tick(dt);
      sim.step(dt, input);
      missions.update(dt);
      if (state.busted) this.screen = 'busted';
      else if (state.storyDone && !state.storyAnnounced) {
        state.storyAnnounced = true;
        this.screen = 'story';
        this.save();
      }
    },

    /** One frame of drawing: the 3D view plus the HUD. */
    draw(renderer) {
      renderer.draw(sim.camera(), sim.dynamicBoxes(sim.state.time));
      hud.update(sim.state);
    },
  };

  return world;
}

// Boot and the one loop: input is read every frame, the world advances in fixed
// 1/60 s steps (several in a slow frame, none in a fast one), and the renderer
// paints what is there. The game moves between five screens: title, play, paused,
// busted and story-complete.
//
// ?seed=N fixes the city. ?shot=cover|city|mission|start (with &seed=N) stages
// that scene instead of running the loop, paints it twice and sets
// window.__shotReady for a screenshot.

import { STEP } from './config.js';
import { createRandom } from './random.js';
import { createWorld } from './world.js';
import { createInput } from './input.js';
import { createRenderer } from './render.js';
import { stageShot } from './shots.js';
import { hasSave } from './save.js';

/** The longest frame the loop catches up on; a longer stall is dropped. */
const MAX_FRAME = 0.25;

const params = new URLSearchParams(window.location.search);
const shot = params.get('shot');
const seedParam = Number.parseInt(params.get('seed') ?? '', 10);
const seed = Number.isInteger(seedParam) ? seedParam : Math.floor(Math.random() * 4294967296);

const canvas = document.getElementById('game');
const status = document.getElementById('status');
const world = createWorld(seed);
const renderer = createRenderer(canvas);
renderer.setStatic(world.city.boxes);

// The headless self-test and the screenshot stager drive the game through this.
window.__game = { world, seed };

function announce(message) {
  status.textContent = message;
}

function startNewGame() {
  world.audio.unlock();
  world.audio.click();
  world.reset(true);
  world.hud.hideScreens();
  announce('Playing. Follow the gold marker to start your first job.');
}

function continueGame() {
  world.audio.unlock();
  if (world.load()) {
    world.hud.hideScreens();
    announce('Welcome back to Solmar Bay.');
  } else {
    startNewGame();
  }
}

function wireButton(id, fn) {
  const button = document.getElementById(id);
  if (button) button.addEventListener('click', fn);
}

wireButton('btn-new', startNewGame);
wireButton('btn-continue', continueGame);
wireButton('btn-resume', () => {
  world.screen = 'play';
  world.hud.hideScreens();
});
wireButton('btn-save', () => {
  const ok = world.save();
  world.hud.setPauseSave(ok ? 'Saved.' : 'Save failed — storage is off.');
});
wireButton('btn-quit', () => {
  world.save();
  world.screen = 'title';
  world.hud.showTitle(hasSave());
});
wireButton('btn-retry', () => {
  world.respawn();
  world.hud.hideScreens();
  announce('Back on the street. Watch yourself.');
});
wireButton('btn-busted-title', () => {
  world.screen = 'title';
  world.hud.showTitle(hasSave());
});
wireButton('btn-roam', () => {
  world.screen = 'play';
  world.hud.hideScreens();
});
wireButton('btn-story-title', () => {
  world.screen = 'title';
  world.hud.showTitle(hasSave());
});
wireButton('btn-mute', () => {
  world.audio.unlock();
  const muted = !world.audio.isMuted();
  world.audio.setMuted(muted);
  document.getElementById('btn-mute').textContent = muted ? 'Sound: Off' : 'Sound: On';
});

window.addEventListener('keydown', (event) => {
  if (world.screen === 'title' && (event.code === 'Enter' || event.code === 'Space')) {
    event.preventDefault();
    startNewGame();
  }
});
window.addEventListener('pointerdown', () => world.audio.unlock(), { once: true });

function runShot(name) {
  const scene = stageShot(name, world);
  if (scene.screen === 'title') world.hud.showTitle(hasSave());
  else world.hud.hideScreens();
  let painted = 0;
  function paint() {
    world.draw(renderer);
    painted += 1;
    if (painted < 2) requestAnimationFrame(paint);
    else window.__shotReady = true;
  }
  requestAnimationFrame(paint);
}

function runGame() {
  const input = createInput(canvas);
  world.hud.showTitle(hasSave());
  let accumulator = 0;
  let last = performance.now();
  let lastScreen = 'title';

  function syncScreens() {
    if (world.screen === lastScreen) return;
    lastScreen = world.screen;
    if (world.screen === 'title') world.hud.showTitle(hasSave());
    else if (world.screen === 'paused') {
      world.hud.showPause();
      world.hud.setPauseSave('');
      announce('Paused.');
    } else if (world.screen === 'busted') {
      world.hud.showBusted();
      const s = world.state;
      world.hud.setBustedStats(`Cash $${s.cash.toLocaleString('en-US')} · Missions done ${s.missionIndex} of 5 · Sun coins ${s.coins} of 20`);
      announce('Busted. The cops took you in.');
    } else if (world.screen === 'story') {
      world.hud.showStory();
      const s = world.state;
      world.hud.setStoryStats(`Cash $${s.cash.toLocaleString('en-US')} · Sun coins ${s.coins} of 20 · All 5 missions complete`);
      announce('Story complete. Solmar Bay is yours.');
    } else if (world.screen === 'play') {
      world.hud.hideScreens();
    }
  }

  function frame(now) {
    requestAnimationFrame(frame);
    accumulator += Math.min((now - last) / 1000, MAX_FRAME);
    last = now;
    while (accumulator >= STEP) {
      world.step(STEP, input);
      accumulator -= STEP;
    }
    syncScreens();
    if (world.screen === 'play' || world.screen === 'paused') world.draw(renderer);
  }

  // Leaving the tab pauses a running game rather than letting the city run unseen.
  document.addEventListener('visibilitychange', () => {
    if (document.hidden && world.screen === 'play') {
      world.screen = 'paused';
      world.save();
    }
  });

  announce('Solmar Bay. Press Enter or click New Game to start.');
  requestAnimationFrame(frame);
}

if (shot) runShot(shot);
else runGame();

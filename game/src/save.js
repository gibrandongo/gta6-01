// Saving: one localStorage slot holding cash, story progress, collected sun
// coins and where the player stood. The save is written on mission complete,
// on the pause menu's Save button, and when the player quits to the title.

import { SAVE_KEY } from './config.js';

export function readSave() {
  try {
    const raw = window.localStorage.getItem(SAVE_KEY);
    if (!raw) return null;
    const data = JSON.parse(raw);
    if (!data || typeof data.cash !== 'number') return null;
    return data;
  } catch {
    return null;
  }
}

export function hasSave() {
  return readSave() !== null;
}

export function writeSave(state) {
  try {
    const data = {
      cash: state.cash,
      coins: state.coins,
      coinsTaken: state.coinsTaken,
      missionIndex: state.missionIndex,
      storyDone: state.storyDone,
      player: {
        x: state.player.x,
        z: state.player.z,
        health: state.player.health,
        armed: state.player.armed,
      },
      savedAt: new Date().toISOString(),
    };
    window.localStorage.setItem(SAVE_KEY, JSON.stringify(data));
    return true;
  } catch {
    return false;
  }
}

export function applySave(state, data) {
  state.cash = data.cash;
  state.coins = data.coins || 0;
  state.coinsTaken = Array.isArray(data.coinsTaken) ? data.coinsTaken : [];
  state.missionIndex = data.missionIndex || 0;
  state.storyDone = !!data.storyDone;
  if (data.player) {
    state.player.x = data.player.x;
    state.player.z = data.player.z;
    state.player.health = data.player.health || 100;
    state.player.armed = !!data.player.armed;
    if (state.player.armed) state.player.weapon = 'pistol';
  }
}

export function clearSave() {
  try {
    window.localStorage.removeItem(SAVE_KEY);
  } catch {
    // Storage can be off: nothing to clear.
  }
}

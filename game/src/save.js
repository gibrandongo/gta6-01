// Saving: the whole campaign state lives in one localStorage key — money, health,
// completed missions, the player's spot in the city, the day and the clock. Autosaves
// after every mission; the pause menu saves on demand.

const SAVE_KEY = 'solmar-bay-save-v1';

export function loadSave() {
  try {
    const raw = window.localStorage.getItem(SAVE_KEY);
    if (!raw) return null;
    const data = JSON.parse(raw);
    if (!data || typeof data !== 'object') return null;
    return {
      money: typeof data.money === 'number' ? data.money : 250,
      health: typeof data.health === 'number' ? data.health : 100,
      armor: typeof data.armor === 'number' ? data.armor : 0,
      completed: Array.isArray(data.completed) ? data.completed : [],
      x: typeof data.x === 'number' ? data.x : 0,
      z: typeof data.z === 'number' ? data.z : 0,
      day: typeof data.day === 'number' ? data.day : 1,
      minutes: typeof data.minutes === 'number' ? data.minutes : 720,
      earned: typeof data.earned === 'number' ? data.earned : 0,
      savedAt: typeof data.savedAt === 'number' ? data.savedAt : 0,
    };
  } catch {
    return null;
  }
}

export function writeSave(state) {
  try {
    window.localStorage.setItem(SAVE_KEY, JSON.stringify({
      money: state.money,
      health: state.health,
      armor: state.armor,
      completed: state.completed,
      x: state.x,
      z: state.z,
      day: state.day,
      minutes: state.minutes,
      earned: state.earned,
      savedAt: Date.now(),
    }));
    return true;
  } catch {
    return false;
  }
}

export function clearSave() {
  try {
    window.localStorage.removeItem(SAVE_KEY);
  } catch {
    // Ignore.
  }
}

export function saveSummary(save) {
  if (!save) return '';
  const date = new Date(save.savedAt);
  const missions = save.completed.length;
  return `Saved ${date.toLocaleString()} — $${save.money}, ${missions} mission${missions === 1 ? '' : 's'} done, day ${save.day}.`;
}

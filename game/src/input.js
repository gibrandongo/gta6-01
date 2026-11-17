// Keyboard and mouse input. Held keys are read every frame; one-shot presses
// (interact, pause, shoot, weapon) are queued as bit flags and taken once by the
// loop, so a press between two frames is never lost or counted twice. The mouse
// orbits the camera by dragging; clicking also fires the weapon when armed.

export const ACTION_INTERACT = 1;
export const ACTION_PAUSE = 2;
export const ACTION_SHOOT = 4;
export const ACTION_WEAPON = 8;
export const ACTION_HORN = 16;

const FORWARD = new Set(['KeyW', 'ArrowUp']);
const BACK = new Set(['KeyS', 'ArrowDown']);
const LEFT = new Set(['KeyA', 'ArrowLeft']);
const RIGHT = new Set(['KeyD', 'ArrowRight']);
const RUN = new Set(['ShiftLeft', 'ShiftRight']);
const HANDBRAKE = new Set(['Space']);
const INTERACT = new Set(['KeyE']);
const PAUSE = new Set(['KeyP', 'Escape']);
const WEAPON = new Set(['KeyQ', 'Digit1', 'Digit2']);
const HORN = new Set(['KeyH']);

export function createInput(canvas) {
  const held = new Set();
  let actions = 0;
  let dragX = 0;
  let dragY = 0;
  let dragging = false;

  function codeOf(event) {
    return event.code;
  }

  window.addEventListener('keydown', (event) => {
    const code = codeOf(event);
    if (FORWARD.has(code) || BACK.has(code) || LEFT.has(code) || RIGHT.has(code) || RUN.has(code) || HANDBRAKE.has(code)) {
      held.add(code);
      event.preventDefault();
    } else if (INTERACT.has(code)) {
      if (!event.repeat) actions |= ACTION_INTERACT;
      event.preventDefault();
    } else if (PAUSE.has(code)) {
      if (!event.repeat) actions |= ACTION_PAUSE;
      event.preventDefault();
    } else if (WEAPON.has(code)) {
      if (!event.repeat) actions |= ACTION_WEAPON;
    } else if (HORN.has(code)) {
      if (!event.repeat) actions |= ACTION_HORN;
    }
  });
  window.addEventListener('keyup', (event) => {
    held.delete(codeOf(event));
  });
  // A key released while the tab is hidden never sends keyup: let go on blur.
  window.addEventListener('blur', () => held.clear());

  canvas.addEventListener('pointerdown', (event) => {
    dragging = true;
    dragX = 0;
    dragY = 0;
    canvas.setPointerCapture(event.pointerId);
    if (event.button === 0) actions |= ACTION_SHOOT;
  });
  canvas.addEventListener('pointermove', (event) => {
    if (!dragging) return;
    dragX += event.movementX || 0;
    dragY += event.movementY || 0;
  });
  function endDrag() {
    dragging = false;
  }
  canvas.addEventListener('pointerup', endDrag);
  canvas.addEventListener('pointercancel', endDrag);

  function any(set) {
    for (const code of set) if (held.has(code)) return true;
    return false;
  }

  return {
    forward: () => any(FORWARD),
    back: () => any(BACK),
    left: () => any(LEFT),
    right: () => any(RIGHT),
    run: () => any(RUN),
    handbrake: () => any(HANDBRAKE),
    /** Mouse drag since the last call, in pixels. */
    takeDrag() {
      const d = { x: dragX, y: dragY };
      dragX = 0;
      dragY = 0;
      return d;
    },
    takeActions() {
      const taken = actions;
      actions = 0;
      return taken;
    },
  };
}

// Keyboard and mouse, and the pointer lock that turns the mouse into look. Alongside the
// held-key set it keeps an edge-triggered pressed set (one entry per physical press) for
// the buy menu, weapon slots and grenades, a wheel accumulator, and a click counter the
// spectate camera uses. Plain browser APIs only.
export function createInput(canvas, onLockChange) {
  const keys = new Set();
  const pressed = new Set();
  const state = { keys, locked: false, firing: false, lookX: 0, lookY: 0, wheel: 0, clicks: 0 };

  function setKey(event, down) {
    if (down) {
      if (!event.repeat) pressed.add(event.code);
      keys.add(event.code);
    } else {
      keys.delete(event.code);
    }
    if (event.code === 'Space' || event.code.startsWith('Digit')) event.preventDefault();
  }

  window.addEventListener('keydown', (event) => setKey(event, true));
  window.addEventListener('keyup', (event) => setKey(event, false));
  window.addEventListener('blur', () => {
    keys.clear();
    pressed.clear();
  });
  window.addEventListener('mousemove', (event) => {
    if (!state.locked) return;
    state.lookX += event.movementX;
    state.lookY += event.movementY;
  });
  window.addEventListener('mousedown', (event) => {
    if (!state.locked) return;
    if (event.button === 0) {
      state.firing = true;
      state.clicks += 1;
    }
  });
  window.addEventListener('mouseup', (event) => {
    if (event.button === 0) state.firing = false;
  });
  window.addEventListener('wheel', (event) => {
    if (state.locked) state.wheel += Math.sign(event.deltaY);
  }, { passive: true });
  document.addEventListener('pointerlockchange', () => {
    state.locked = document.pointerLockElement === canvas;
    if (!state.locked) {
      keys.clear();
      state.firing = false;
    }
    onLockChange(state.locked);
  });

  return {
    state,
    requestLock() {
      canvas.requestPointerLock();
    },
    takeLook() {
      const x = state.lookX;
      const y = state.lookY;
      state.lookX = 0;
      state.lookY = 0;
      return { x, y };
    },
    wasPressed(code) {
      return pressed.has(code);
    },
    clearPressed() {
      pressed.clear();
    },
  };
}

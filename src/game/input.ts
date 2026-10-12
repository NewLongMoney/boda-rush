export type Actions = {
  throttle: number;
  steer: number;
  horn: boolean;
  hornPressed: boolean;
  pausePressed: boolean;
};

const GAME_KEYS = new Set([
  "KeyW",
  "KeyA",
  "KeyS",
  "KeyD",
  "ArrowUp",
  "ArrowDown",
  "ArrowLeft",
  "ArrowRight",
  "Space",
  "KeyP",
  "Escape",
]);

function clamp(v: number, a: number, b: number) {
  return Math.max(a, Math.min(b, v));
}

function radialDeadzone(x: number, y: number, dz = 0.16) {
  const m = Math.hypot(x, y);
  if (m < dz) return { x: 0, y: 0 };
  const scale = (m - dz) / (1 - dz) / m;
  return { x: x * scale, y: y * scale };
}

export type Input = {
  sample: () => Actions;
  setKeys: (codes: string[]) => void;
  setSteer: (v: number) => void;
  setHornHeld: (held: boolean) => void;
  bindStick: (root: HTMLElement, nub: HTMLElement) => () => void;
  bindHorn: (el: HTMLElement) => () => void;
  destroy: () => void;
};

export function createInput(): Input {
  const keys = new Set<string>();
  let qa: Set<string> | null = null;
  let steerOverride: number | null = null;
  let prevHorn = false;
  let prevPause = false;
  let hornHeld = false;
  const stick = { x: 0, y: 0, active: false };

  const onKeyDown = (e: KeyboardEvent) => {
    if (GAME_KEYS.has(e.code)) e.preventDefault();
    keys.add(e.code);
  };
  const onKeyUp = (e: KeyboardEvent) => {
    keys.delete(e.code);
  };
  const clear = () => keys.clear();
  const onVis = () => {
    if (document.hidden) keys.clear();
  };

  window.addEventListener("keydown", onKeyDown);
  window.addEventListener("keyup", onKeyUp);
  window.addEventListener("blur", clear);
  document.addEventListener("visibilitychange", onVis);

  function held() {
    return qa ?? keys;
  }

  function sample(): Actions {
    const h = held();
    let steer = 0;
    if (h.has("KeyA") || h.has("ArrowLeft")) steer += 1;
    if (h.has("KeyD") || h.has("ArrowRight")) steer -= 1;
    let throttle = 0;
    if (h.has("KeyW") || h.has("ArrowUp")) throttle += 1;
    if (h.has("KeyS") || h.has("ArrowDown")) throttle -= 1;

    if (stick.active) {
      steer += -stick.x;
      throttle += stick.y;
    }

    const pads = navigator.getGamepads?.() ?? [];
    for (const pad of pads) {
      if (!pad || pad.mapping !== "standard") continue;
      const dz = radialDeadzone(pad.axes[0] ?? 0, pad.axes[1] ?? 0);
      steer += -dz.x;
      throttle += -dz.y;
    }

    if (steerOverride !== null) steer = steerOverride;
    steer = clamp(steer, -1, 1);
    throttle = clamp(throttle, -1, 1);

    const horn = h.has("Space") || hornHeld || padsHorn(pads);
    const pauseNow = h.has("Escape") || h.has("KeyP") || padsStart(pads);
    const hornPressed = horn && !prevHorn;
    const pausePressed = pauseNow && !prevPause;
    prevHorn = horn;
    prevPause = pauseNow;

    return { throttle, steer, horn, hornPressed, pausePressed };
  }

  function padsHorn(pads: Array<Gamepad | null>) {
    for (const pad of pads) {
      if (!pad) continue;
      if (pad.buttons[0]?.pressed || pad.buttons[7]?.pressed) return true;
    }
    return false;
  }
  function padsStart(pads: Array<Gamepad | null>) {
    for (const pad of pads) {
      if (pad?.buttons[9]?.pressed) return true;
    }
    return false;
  }

  function bindStick(root: HTMLElement, nub: HTMLElement) {
    let id: number | null = null;
    let originX = 0;
    let originY = 0;
    const max = 48;

    const place = (cx: number, cy: number) => {
      const dx = cx - originX;
      const dy = cy - originY;
      const m = Math.hypot(dx, dy) || 1;
      const k = m > max ? max / m : 1;
      stick.x = (dx * k) / max;
      stick.y = -(dy * k) / max;
      stick.active = true;
      nub.style.transform = `translate(${stick.x * max}px, ${-stick.y * max}px)`;
    };
    const end = (e: PointerEvent) => {
      if (id !== e.pointerId) return;
      id = null;
      stick.x = 0;
      stick.y = 0;
      stick.active = false;
      nub.style.transform = "translate(0px, 0px)";
    };
    const down = (e: PointerEvent) => {
      e.preventDefault();
      id = e.pointerId;
      root.setPointerCapture(e.pointerId);
      const rect = root.getBoundingClientRect();
      originX = rect.left + rect.width / 2;
      originY = rect.top + rect.height / 2;
      place(e.clientX, e.clientY);
    };
    const move = (e: PointerEvent) => {
      if (e.pointerId !== id) return;
      e.preventDefault();
      place(e.clientX, e.clientY);
    };
    root.addEventListener("pointerdown", down);
    root.addEventListener("pointermove", move);
    root.addEventListener("pointerup", end);
    root.addEventListener("pointercancel", end);
    return () => {
      root.removeEventListener("pointerdown", down);
      root.removeEventListener("pointermove", move);
      root.removeEventListener("pointerup", end);
      root.removeEventListener("pointercancel", end);
    };
  }

  function bindHorn(el: HTMLElement) {
    const down = (e: PointerEvent) => {
      e.preventDefault();
      hornHeld = true;
      el.setPointerCapture(e.pointerId);
    };
    const up = (e: PointerEvent) => {
      if (el.hasPointerCapture?.(e.pointerId)) hornHeld = false;
      hornHeld = false;
    };
    el.addEventListener("pointerdown", down);
    el.addEventListener("pointerup", up);
    el.addEventListener("pointercancel", up);
    el.addEventListener("lostpointercapture", () => {
      hornHeld = false;
    });
    return () => {
      el.removeEventListener("pointerdown", down);
      el.removeEventListener("pointerup", up);
      el.removeEventListener("pointercancel", up);
    };
  }

  return {
    sample,
    setKeys(codes: string[]) {
      qa = new Set(codes);
    },
    setSteer(v: number) {
      steerOverride = v;
    },
    setHornHeld(held: boolean) {
      hornHeld = held;
    },
    bindStick,
    bindHorn,
    destroy() {
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("keyup", onKeyUp);
      window.removeEventListener("blur", clear);
      document.removeEventListener("visibilitychange", onVis);
    },
  };
}

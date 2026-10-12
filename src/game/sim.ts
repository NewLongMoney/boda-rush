import type { Actions } from "@/game/input";
import {
  LANDMARKS,
  LANES,
  PARKS,
  PETROL,
  POTHOLES,
  ROADS,
  SPAWN,
  STAGES,
  TREES,
  WORLD_H,
  WORLD_W,
  buildingsNear,
  landmarkById,
  laneYaw,
  pointOnRoad,
  type Lane,
} from "@/game/world";

export type Phase = "title" | "play" | "pause" | "over";

export type Kind = "matatu" | "car" | "boda" | "truck";

export type Vehicle = {
  lane: number;
  pos: number;
  speed: number;
  base: number;
  kind: Kind;
  paint: number;
  yield: number;
  route: number;
};

export type Cop = {
  x: number;
  y: number;
  yaw: number;
  speed: number;
  sees: boolean;
  role: "chase" | "block";
};

export type Heli = { x: number; y: number; yaw: number };

export type Ending = "" | "busted" | "wrecked";

export type Popup = {
  x: number;
  y: number;
  text: string;
  life: number;
  max: number;
  tone: "good" | "bad";
};

export type Dust = {
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
  max: number;
  r: number;
};

export type Carried = {
  destId: string;
  job: string;
  clean: boolean;
  elapsed: number;
  sx: number;
  sy: number;
};

export type StageLive = { index: number; cool: number };

export type Game = {
  phase: Phase;
  x: number;
  y: number;
  yaw: number;
  speed: number;
  fuel: number;
  helmets: number;
  stun: number;
  invuln: number;
  cash: number;
  best: number;
  streak: number;
  bestStreak: number;
  fares: number;
  newBest: boolean;
  vehicles: Vehicle[];
  live: boolean[];
  cool: number[];
  carried: Carried | null;
  popups: Popup[];
  dust: Dust[];
  camX: number;
  camY: number;
  attract: number;
  shake: number;
  pulse: number;
  hornFlash: number;
  potholeCd: number;
  petrolCd: number;
  hitStop: number;
  time: number;
  events: Array<"horn" | "coin" | "crash" | "fill">;
  stars: number;
  escape: number;
  seen: boolean;
  grab: number;
  heatCd: number;
  cops: Cop[];
  heli: Heli | null;
  blockCd: number;
  ending: Ending;
  shook: number;
  huntX: number;
  huntY: number;
};

const MAX_SPEED = 270;
const ACCEL = 460;
const BRAKE = 820;
const TURN = 2.75;

function clamp(v: number, a: number, b: number) {
  return Math.max(a, Math.min(b, v));
}

function mulberry32(seed: number) {
  let a = seed;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function kindFor(name: string, r: number): Kind {
  const arterial = /Uhuru|Thika|Waiyaki|Jogoo|Langata/.test(name);
  if (arterial) {
    if (r < 0.42) return "matatu";
    if (r < 0.72) return "car";
    if (r < 0.88) return "boda";
    return "truck";
  }
  if (r < 0.22) return "matatu";
  if (r < 0.7) return "car";
  if (r < 0.9) return "boda";
  return "truck";
}

function baseSpeed(kind: Kind, r: number) {
  if (kind === "matatu") return 150 + r * 40;
  if (kind === "truck") return 90 + r * 30;
  if (kind === "boda") return 170 + r * 50;
  return 120 + r * 40;
}

const ROUTES = [23, 33, 45, 46, 58, 111, 125];

export function vehicleRadius(kind: Kind) {
  if (kind === "matatu") return 22;
  if (kind === "truck") return 26;
  if (kind === "boda") return 10;
  return 14;
}

export function createGame(best = 0, bestStreak = 0): Game {
  const g: Game = {
    phase: "title",
    x: SPAWN.x,
    y: SPAWN.y,
    yaw: SPAWN.yaw,
    speed: 0,
    fuel: 100,
    helmets: 3,
    stun: 0,
    invuln: 0,
    cash: 0,
    best,
    streak: 0,
    bestStreak,
    fares: 0,
    newBest: false,
    vehicles: [],
    live: STAGES.map(() => false),
    cool: STAGES.map(() => 0),
    carried: null,
    popups: [],
    dust: [],
    camX: 3100,
    camY: 3000,
    attract: 0,
    shake: 0,
    pulse: 0,
    hornFlash: 0,
    potholeCd: 0,
    petrolCd: 0,
    hitStop: 0,
    time: 0,
    events: [],
    stars: 0,
    escape: 0,
    seen: false,
    grab: 0,
    heatCd: 0,
    cops: [],
    heli: null,
    blockCd: 0,
    ending: "",
    shook: 0,
    huntX: SPAWN.x,
    huntY: SPAWN.y,
  };
  seedTraffic(g, 1);
  openPickups(g, 4);
  return g;
}

function seedTraffic(g: Game, salt: number) {
  const rnd = mulberry32(1000 + salt * 97);
  g.vehicles = [];
  LANES.forEach((lane, laneIndex) => {
    const span = lane.max - lane.min;
    const count = Math.max(2, Math.round(span / 460));
    for (let i = 0; i < count; i++) {
      const r = rnd();
      const kind = kindFor(lane.name, r);
      const pos = lane.min + ((i + 0.5) / count) * span;
      g.vehicles.push({
        lane: laneIndex,
        pos,
        speed: baseSpeed(kind, rnd()),
        base: baseSpeed(kind, rnd()),
        kind,
        paint: Math.floor(rnd() * 6),
        yield: 0,
        route: ROUTES[Math.floor(rnd() * ROUTES.length)]!,
      });
    }
  });
  separateFromSpawn(g);
}

function separateFromSpawn(g: Game) {
  for (const v of g.vehicles) {
    const p = vehiclePos(v);
    if (Math.hypot(p.x - SPAWN.x, p.y - SPAWN.y) < 260) {
      const lane = LANES[v.lane]!;
      v.pos = lane.dir === 1 ? lane.min + 20 : lane.max - 20;
    }
  }
}

export function vehiclePos(v: Vehicle) {
  const lane = LANES[v.lane]!;
  const wobble = v.kind === "boda" ? Math.sin(v.pos * 0.02) * 8 : 0;
  if (lane.axis === "v") return { x: lane.fixed + wobble, y: v.pos, lane };
  return { x: v.pos, y: lane.fixed + wobble, lane };
}

export function startShift(g: Game) {
  g.phase = "play";
  g.x = SPAWN.x;
  g.y = SPAWN.y;
  g.yaw = SPAWN.yaw;
  g.speed = 0;
  g.fuel = 100;
  g.helmets = 3;
  g.stun = 0;
  g.invuln = 1.1;
  g.cash = 0;
  g.streak = 0;
  g.fares = 0;
  g.newBest = false;
  g.carried = null;
  g.popups = [];
  g.dust = [];
  g.shake = 0;
  g.pulse = 0;
  g.live = STAGES.map(() => false);
  g.cool = STAGES.map(() => 0);
  g.camX = SPAWN.x;
  g.camY = SPAWN.y - 40;
  g.petrolCd = 0;
  g.potholeCd = 0;
  g.stars = 0;
  g.escape = 0;
  g.seen = false;
  g.grab = 0;
  g.heatCd = 0;
  g.cops = [];
  g.heli = null;
  g.blockCd = 0;
  g.ending = "";
  g.shook = 0;
  g.huntX = SPAWN.x;
  g.huntY = SPAWN.y;
  seedTraffic(g, Math.floor(g.time * 10) + 3);
  openPickups(g, 4);
}

function openPickups(g: Game, want: number) {
  const idle = STAGES.map((_, i) => i).filter((i) => !g.live[i] && g.cool[i]! <= 0);
  for (let n = g.live.filter(Boolean).length; n < want && idle.length; n++) {
    const pick = idle.splice(Math.floor(Math.random() * idle.length), 1)[0]!;
    g.live[pick] = true;
  }
}

function popup(g: Game, text: string, tone: "good" | "bad") {
  g.popups.push({ x: g.x, y: g.y - 28, text, life: 1.15, max: 1.15, tone });
  if (g.popups.length > 8) g.popups.shift();
}

function endRun(g: Game, ending: Ending) {
  if (g.phase === "over") return;
  g.phase = "over";
  g.ending = ending;
  g.speed = 0;
  if (g.cash > g.best) {
    g.best = g.cash;
    g.newBest = true;
  }
  if (g.streak > g.bestStreak) g.bestStreak = g.streak;
}

function addHeat(g: Game, amount: number) {
  if (g.heatCd > 0 || g.phase !== "play" || amount <= 0) return;
  g.escape = 0;
  g.heatCd = 2.4;
  if (g.stars >= 5) {
    popup(g, "5 stars", "bad");
    return;
  }
  g.stars = Math.min(5, g.stars + amount);
  g.huntX = g.x;
  g.huntY = g.y;
  popup(g, g.stars === 1 ? "Wanted" : `${g.stars} stars`, "bad");
}

function losBlocked(x0: number, y0: number, x1: number, y1: number) {
  const dist = Math.hypot(x1 - x0, y1 - y0);
  const steps = Math.max(1, Math.ceil(dist / 46));
  for (let i = 1; i < steps; i++) {
    const t = i / steps;
    const x = x0 + (x1 - x0) * t;
    const y = y0 + (y1 - y0) * t;
    for (const b of buildingsNear(x, y, 24)) {
      if (x > b.x && x < b.x + b.w && y > b.y && y < b.y + b.h) return true;
    }
  }
  return false;
}

function inPark(x: number, y: number) {
  for (const p of PARKS) {
    if (x >= p.x && x <= p.x + p.w && y >= p.y && y <= p.y + p.h) return true;
  }
  return false;
}

function nearestRoadPoint(x: number, y: number) {
  let bx = x;
  let by = y;
  let best = Infinity;
  for (const r of ROADS) {
    const cx = clamp(x, r.x + 18, r.x + r.w - 18);
    const cy = clamp(y, r.y + 18, r.y + r.h - 18);
    const d = (cx - x) * (cx - x) + (cy - y) * (cy - y);
    if (d < best) {
      best = d;
      bx = cx;
      by = cy;
    }
  }
  return { x: bx, y: by };
}

function spawnCop(g: Game): Cop {
  const fx = -Math.sin(g.yaw);
  const fy = -Math.cos(g.yaw);
  const rx = -fy;
  const ry = fx;
  for (let n = 0; n < 8; n++) {
    const back = 520 + n * 70;
    const side = (n % 2 === 0 ? 1 : -1) * (80 + n * 30);
    const x = clamp(g.x - fx * back + rx * side, 80, WORLD_W - 80);
    const y = clamp(g.y - fy * back + ry * side, 80, WORLD_H - 80);
    const near = buildingsNear(x, y, 30);
    let blocked = false;
    for (const b of near) {
      if (x > b.x - 16 && x < b.x + b.w + 16 && y > b.y - 16 && y < b.y + b.h + 16) blocked = true;
    }
    const road = nearestRoadPoint(x, y);
    if (!blocked && Math.hypot(road.x - g.x, road.y - g.y) > 340) {
      return { x: road.x, y: road.y, yaw: g.yaw, speed: 150, sees: false, role: "chase" };
    }
  }
  const spot = nearestRoadPoint(clamp(g.x - fx * 640, 80, WORLD_W - 80), clamp(g.y - fy * 640, 80, WORLD_H - 80));
  return {
    x: spot.x,
    y: spot.y,
    yaw: g.yaw,
    speed: 140,
    sees: false,
    role: "chase",
  };
}

function pushCircle(x: number, y: number, r: number) {
  let hit = false;
  for (const b of buildingsNear(x, y, r + 40)) {
    const cx = clamp(x, b.x, b.x + b.w);
    const cy = clamp(y, b.y, b.y + b.h);
    let dx = x - cx;
    let dy = y - cy;
    let d2 = dx * dx + dy * dy;
    if (d2 > r * r) continue;
    hit = true;
    if (d2 < 0.001) {
      dx = 1;
      dy = 0;
      d2 = 1;
    }
    const d = Math.sqrt(d2) || 1;
    const pen = r - d + 1;
    x += (dx / d) * pen;
    y += (dy / d) * pen;
  }
  return { x, y, hit };
}

function aheadOnRoad(g: Game, dist: number) {
  const fx = -Math.sin(g.yaw);
  const fy = -Math.cos(g.yaw);
  return nearestRoadPoint(clamp(g.x + fx * dist, 80, WORLD_W - 80), clamp(g.y + fy * dist, 80, WORLD_H - 80));
}

function stepCops(g: Game, dt: number) {
  if (g.heatCd > 0) g.heatCd -= dt;
  if (g.blockCd > 0) g.blockCd -= dt;
  if (g.stars <= 0) {
    g.cops = [];
    g.heli = null;
    g.seen = false;
    g.escape = 0;
    g.grab = 0;
    return;
  }
  while (g.cops.length < g.stars) g.cops.push(spawnCop(g));
  while (g.cops.length > g.stars) {
    let far = -1;
    let idx = 0;
    g.cops.forEach((c, i) => {
      const d = Math.hypot(c.x - g.x, c.y - g.y);
      if (d > far) {
        far = d;
        idx = i;
      }
    });
    g.cops.splice(idx, 1);
  }

  if (g.stars >= 3) {
    let block = g.cops.find((c) => c.role === "block");
    if (!block) {
      block = g.cops[g.cops.length - 1];
      if (block) block.role = "block";
    }
    if (block && g.blockCd <= 0) {
      const fx = -Math.sin(g.yaw);
      const fy = -Math.cos(g.yaw);
      const ahead = (block.x - g.x) * fx + (block.y - g.y) * fy;
      if (ahead < 160) {
        const spot = aheadOnRoad(g, 680);
        if (Math.hypot(spot.x - g.x, spot.y - g.y) > 280) {
          block.x = spot.x;
          block.y = spot.y;
          block.speed = 30;
          block.yaw = g.yaw + Math.PI;
          g.blockCd = 7;
        }
      }
    }
  } else {
    for (const cop of g.cops) cop.role = "chase";
  }

  const pfx = -Math.sin(g.yaw);
  const pfy = -Math.cos(g.yaw);
  if (g.stars >= 4) {
    if (!g.heli) g.heli = { x: g.x - pfx * 180, y: g.y - pfy * 180, yaw: g.yaw };
    const hx = g.x - pfx * 70 + Math.sin(g.time * 0.65) * 110;
    const hy = g.y - pfy * 70 + Math.cos(g.time * 0.65) * 110;
    g.heli.x += (hx - g.heli.x) * Math.min(1, dt * 1.3);
    g.heli.y += (hy - g.heli.y) * Math.min(1, dt * 1.3);
    g.heli.yaw = Math.atan2(-(g.x - g.heli.x), -(g.y - g.heli.y));
  } else {
    g.heli = null;
  }

  let any = false;
  let pinned = false;
  const range = 210 + g.stars * 58;
  for (const cop of g.cops) {
    const dx = g.x - cop.x;
    const dy = g.y - cop.y;
    const dist = Math.hypot(dx, dy) || 1;
    const cfx = -Math.sin(cop.yaw);
    const cfy = -Math.cos(cop.yaw);
    const dot = (dx / dist) * cfx + (dy / dist) * cfy;
    const clear = dist < range && !losBlocked(cop.x, cop.y, g.x, g.y);
    const close = 72 + g.stars * 10;
    cop.sees = (clear && dot > 0.4) || (dist < close && clear);
    if (cop.sees) any = true;

    const searching = !cop.sees && Math.hypot(cop.x - g.huntX, cop.y - g.huntY) < 80;
    const holding = cop.role === "block" && dist > 230;
    const txWant = holding ? cop.x : cop.sees ? g.x + pfx * 70 : g.huntX;
    const tyWant = holding ? cop.y : cop.sees ? g.y + pfy * 70 : g.huntY;
    const onRoad = pointOnRoad(cop.x, cop.y, 6);
    const road = !cop.sees && !onRoad && !holding ? nearestRoadPoint(cop.x, cop.y) : null;
    const tx = road ? road.x : txWant;
    const ty = road ? road.y : tyWant;
    const want = searching
      ? cop.yaw + Math.sin(g.time * 1.6 + cop.x) * 0.8
      : holding
        ? Math.atan2(-(g.x - cop.x), -(g.y - cop.y))
        : Math.atan2(-(tx - cop.x), -(ty - cop.y));
    const diff = Math.atan2(Math.sin(want - cop.yaw), Math.cos(want - cop.yaw));
    const turn = cop.role === "block" ? 2.1 : 1.7;
    cop.yaw += clamp(diff, -turn * dt, turn * dt);

    const cap = holding || searching ? 48 : onRoad ? 188 + g.stars * 18 : 40;
    if (Math.abs(diff) < 0.7) cop.speed += 360 * dt;
    else cop.speed -= 280 * dt;
    cop.speed = clamp(cop.speed, holding ? 0 : 36, cap);
    if (holding) cop.speed = 0;

    const fx = -Math.sin(cop.yaw);
    const fy = -Math.cos(cop.yaw);
    cop.x += fx * cop.speed * dt;
    cop.y += fy * cop.speed * dt;
    const pushed = pushCircle(cop.x, cop.y, 16);
    cop.x = clamp(pushed.x, 40, WORLD_W - 40);
    cop.y = clamp(pushed.y, 40, WORLD_H - 40);
    if (pushed.hit) {
      cop.speed *= 0.45;
      cop.yaw += 2.4 * dt;
    }

    const pdx = g.x - cop.x;
    const pdy = g.y - cop.y;
    const pd = Math.hypot(pdx, pdy) || 1;
    const along = pdx * cfx + pdy * cfy;
    const lat = pdx * -cfy + pdy * cfx;
    if (g.stars >= 2 && Math.abs(g.speed) > 100 && Math.abs(along) < 34 && Math.abs(lat) < 40 && Math.abs(lat) > 8) {
      g.yaw += Math.sign(lat) * 1.6 * dt;
      g.speed *= 0.94;
    }
    const pen = 30 - pd;
    if (pen > 0 && g.phase === "play") {
      const nx = pdx / pd;
      const ny = pdy / pd;
      g.x += nx * pen * 0.65;
      g.y += ny * pen * 0.65;
      cop.x -= nx * pen * 0.35;
      cop.y -= ny * pen * 0.35;
      if (Math.abs(g.speed) < 70) pinned = true;
      g.speed *= 0.78;
      addHeat(g, 1);
    }
  }

  const eye = g.heli !== null && pointOnRoad(g.x, g.y, 0) && !inPark(g.x, g.y);
  g.seen = any || eye;
  if (g.seen) {
    g.huntX = g.x;
    g.huntY = g.y;
    g.escape = 0;
  } else if (g.phase === "play") {
    const cover = inPark(g.x, g.y) ? 1.75 : pointOnRoad(g.x, g.y, -6) ? 1 : 1.3;
    const seconds = [0, 7, 10, 14, 19, 26][g.stars] ?? 26;
    g.escape += (dt * cover) / seconds;
    if (g.escape >= 1) {
      g.stars -= 1;
      g.escape = 0;
      g.shook += 1;
      popup(g, g.stars <= 0 ? "Lost them" : "Star dropped", "good");
      g.events.push("coin");
    }
  }

  if (g.phase !== "play") return;
  if (pinned) g.grab += dt;
  else g.grab = Math.max(0, g.grab - dt * 0.65);
  if (g.grab > 1.15) {
    popup(g, "Busted", "bad");
    endRun(g, "busted");
  }
}

function damage(g: Game, heavy: boolean) {
  g.speed *= 0.25;
  g.shake = Math.max(g.shake, heavy ? 12 : 7);
  g.hitStop = heavy ? 0.05 : 0.02;
  g.events.push("crash");
  if (!heavy || g.invuln > 0) return;
  const lostStreak = g.streak;
  g.streak = 0;
  if (g.carried) g.carried.clean = false;
  g.helmets -= 1;
  g.stun = 0.38;
  g.invuln = 1.25;
  popup(g, "Helmet hit", "bad");
  if (g.helmets <= 0) endRun(g, g.stars > 0 ? "busted" : "wrecked");
}

function chooseDest(x: number, y: number) {
  const far = LANDMARKS.filter((l) => Math.hypot(l.x - x, l.y - y) > 1100);
  const pool = far.length ? far : LANDMARKS;
  return pool[Math.floor(Math.random() * pool.length)]!;
}

function nearestLive(g: Game) {
  let best = -1;
  let bd = Infinity;
  for (let i = 0; i < STAGES.length; i++) {
    if (!g.live[i]) continue;
    const s = STAGES[i]!;
    const d = Math.hypot(s.x - g.x, s.y - g.y);
    if (d < bd) {
      bd = d;
      best = i;
    }
  }
  return best;
}

export type Hud = {
  cash: number;
  best: number;
  fuel: number;
  helmets: number;
  streak: number;
  fares: number;
  phase: Phase;
  objective: string;
  detail: string;
  speedKph: number;
  newBest: boolean;
  targetX: number;
  targetY: number;
  targetLabel: string;
  stars: number;
  escape: number;
  seen: boolean;
  ending: Ending;
  shook: number;
};

export function snapshot(g: Game): Hud {
  let objective = "Roam. Fares are optional.";
  let detail = "Hit traffic hard and the stars come on";
  let targetX = g.x;
  let targetY = g.y;
  let targetLabel = "";
  if (g.stars > 0 && g.seen && g.cops.length > 0) {
    let nearest = g.cops[0]!;
    let bd = Infinity;
    for (const c of g.cops) {
      const d = Math.hypot(c.x - g.x, c.y - g.y);
      if (d < bd) {
        bd = d;
        nearest = c;
      }
    }
    objective = `Wanted · ${g.stars} star${g.stars === 1 ? "" : "s"}`;
    const open = pointOnRoad(g.x, g.y, 0) && !inPark(g.x, g.y);
    if (g.stars >= 4 && open) detail = "Chopper has the road. Cut into the estates.";
    else if (g.stars >= 3) detail = "Roadblock ahead. Do not stop beside them.";
    else detail = "Break the sightline. Their cars die off the road.";
    const block = g.cops.find((c) => c.role === "block");
    const fx = -Math.sin(g.yaw);
    const fy = -Math.cos(g.yaw);
    if (block && (block.x - g.x) * fx + (block.y - g.y) * fy > 40) {
      targetX = block.x;
      targetY = block.y;
      targetLabel = "Roadblock";
    } else {
      targetX = nearest.x;
      targetY = nearest.y;
      targetLabel = "Police";
    }
  } else if (g.stars > 0) {
    objective = "Losing them";
    detail = "Stay off the tarmac. A star drops when the bar fills.";
    targetX = g.x;
    targetY = g.y;
  } else if (g.carried) {
    const dest = landmarkById(g.carried.destId);
    objective = `Drop · ${dest.name}`;
    detail = `${g.carried.job} · ${dest.blurb}`;
    targetX = dest.x;
    targetY = dest.y;
    targetLabel = dest.name;
  } else {
    const i = nearestLive(g);
    if (i >= 0) {
      const s = STAGES[i]!;
      objective = `Fare · ${s.name}`;
      detail = `${s.area} · or just ride`;
      targetX = s.x;
      targetY = s.y;
      targetLabel = s.name;
    }
  }
  return {
    cash: g.cash,
    best: g.best,
    fuel: g.fuel,
    helmets: g.helmets,
    streak: g.streak,
    fares: g.fares,
    phase: g.phase,
    objective,
    detail,
    speedKph: Math.round(Math.abs(g.speed) * 0.34),
    newBest: g.newBest,
    targetX,
    targetY,
    targetLabel,
    stars: g.stars,
    escape: g.escape,
    seen: g.seen,
    ending: g.ending,
    shook: g.shook,
  };
}

function resolveBuilding(g: Game) {
  const r = 14;
  const near = buildingsNear(g.x, g.y, 80);
  let hitFast = false;
  for (const b of near) {
    const cx = clamp(g.x, b.x, b.x + b.w);
    const cy = clamp(g.y, b.y, b.y + b.h);
    let dx = g.x - cx;
    let dy = g.y - cy;
    let d2 = dx * dx + dy * dy;
    if (d2 > r * r) continue;
    if (d2 < 0.001) {
      const left = g.x - b.x;
      const right = b.x + b.w - g.x;
      const top = g.y - b.y;
      const bot = b.y + b.h - g.y;
      const m = Math.min(left, right, top, bot);
      if (m === left) dx = -1;
      else if (m === right) dx = 1;
      else if (m === top) dy = -1;
      else dy = 1;
      d2 = 1;
    }
    const d = Math.sqrt(d2) || 1;
    const pen = r - d + 0.5;
    g.x += (dx / d) * pen;
    g.y += (dy / d) * pen;
    if (Math.abs(g.speed) > 230) hitFast = true;
    g.speed *= 0.45;
  }
  if (hitFast) damage(g, true);
}

function stepTraffic(g: Game, dt: number) {
  const groups = new Map<number, Vehicle[]>();
  for (const v of g.vehicles) {
    let arr = groups.get(v.lane);
    if (!arr) groups.set(v.lane, (arr = []));
    arr.push(v);
  }
  for (const [laneIndex, group] of groups) {
    const lane = LANES[laneIndex]!;
    const span = lane.max - lane.min;
    for (const v of group) {
      let target = v.base;
      if (v.yield > 0) {
        target *= 0.22;
        v.yield -= dt;
      }
      let nearest = span;
      let aheadSpeed = target;
      for (const o of group) {
        if (o === v) continue;
        let d = lane.dir === 1 ? o.pos - v.pos : v.pos - o.pos;
        if (d < 0) d += span;
        if (d < nearest) {
          nearest = d;
          aheadSpeed = o.speed;
        }
      }
      if (nearest < 110) target = Math.min(target, aheadSpeed * 0.94);
      if (nearest < 48) target = Math.min(target, 40);
      v.speed += (target - v.speed) * Math.min(1, dt * 2.4);
      v.pos += lane.dir * v.speed * dt;
      if (lane.dir === 1 && v.pos > lane.max) v.pos = lane.min + (v.pos - lane.max);
      if (lane.dir === -1 && v.pos < lane.min) v.pos = lane.max - (lane.min - v.pos);
    }
  }
}

function stepPlayer(g: Game, dt: number, a: Actions) {
  if (g.stun > 0) g.stun -= dt;
  if (g.invuln > 0) g.invuln -= dt;
  if (g.potholeCd > 0) g.potholeCd -= dt;
  if (g.petrolCd > 0) g.petrolCd -= dt;
  if (g.hornFlash > 0) g.hornFlash -= dt;

  const throttle = g.stun > 0 ? 0 : a.throttle;
  // A / left => steer > 0 => +yaw. Nose goes screen-left while facing north.
  const steer = g.stun > 0 ? 0 : a.steer;

  if (throttle > 0) g.speed += ACCEL * throttle * dt;
  else if (throttle < 0) g.speed -= BRAKE * dt;
  else {
    const d = 160 * dt;
    if (Math.abs(g.speed) <= d) g.speed = 0;
    else g.speed -= Math.sign(g.speed) * d;
  }

  const on = pointOnRoad(g.x, g.y, 0);
  const shoulder = pointOnRoad(g.x, g.y, 34);
  let cap = 285;
  if (g.fuel <= 0) cap *= 0.28;
  else if (g.fuel < 16) cap *= 0.7;
  if (!on && !shoulder) cap = Math.min(cap, 240);
  else if (!on) cap = Math.min(cap, 260);
  g.speed = clamp(g.speed, -130, cap);

  const speedFactor = clamp(Math.abs(g.speed) / 80, 0.5, 1);
  const reverse = g.speed >= 0 ? 1 : -1;
  g.yaw += steer * TURN * speedFactor * reverse * dt;

  const fx = -Math.sin(g.yaw);
  const fy = -Math.cos(g.yaw);
  g.x += fx * g.speed * dt;
  g.y += fy * g.speed * dt;
  g.x = clamp(g.x, 30, WORLD_W - 30);
  g.y = clamp(g.y, 30, WORLD_H - 30);

  resolveBuilding(g);

  if (a.hornPressed && g.hornFlash <= 0) {
    g.hornFlash = 0.28;
    g.events.push("horn");
    for (const v of g.vehicles) {
      const p = vehiclePos(v);
      const dx = p.x - g.x;
      const dy = p.y - g.y;
      const dist = Math.hypot(dx, dy);
      if (dist > 280 || dist < 1) continue;
      const dot = (dx / dist) * fx + (dy / dist) * fy;
      if (dot > 0.45) v.yield = Math.max(v.yield, 0.85);
    }
  }

  const pr = 14;
  for (const v of g.vehicles) {
    const p = vehiclePos(v);
    const vr = vehicleRadius(v.kind);
    const dx = p.x - g.x;
    const dy = p.y - g.y;
    const dist = Math.hypot(dx, dy) || 0.0001;
    const pen = pr + vr - dist;
    if (pen <= 0) continue;
    const nx = dx / dist;
    const ny = dy / dist;
    g.x -= nx * pen;
    g.y -= ny * pen;
    const vfx = -Math.sin(laneYaw(p.lane.axis, p.lane.dir));
    const vfy = -Math.cos(laneYaw(p.lane.axis, p.lane.dir));
    const relN = (fx * g.speed - vfx * v.speed) * nx + (fy * g.speed - vfy * v.speed) * ny;
    if (relN > 48) {
      g.shake = Math.max(g.shake, 8);
      g.speed *= 0.7;
      g.events.push("crash");
      addHeat(g, 1);
    } else if (relN > 20) {
      g.speed *= 0.4;
      g.shake = Math.max(g.shake, 4);
    }
    v.yield = Math.max(v.yield, 0.4);
    if (g.phase !== "play") return;
  }

  if (g.potholeCd <= 0) {
    for (const hole of POTHOLES) {
      if (Math.hypot(hole.x - g.x, hole.y - g.y) < hole.r + 8 && Math.abs(g.speed) > 110) {
        g.speed *= 0.5;
        g.shake = Math.max(g.shake, 6);
        g.potholeCd = 0.7;
        popup(g, "Pothole", "bad");
        break;
      }
    }
  }

  for (const tree of TREES) {
    const dx = g.x - tree.x;
    const dy = g.y - tree.y;
    const dist = Math.hypot(dx, dy) || 1;
    const rr = tree.acacia ? 12 : tree.r * 0.45;
    if (dist < rr + 12) {
      const pen = rr + 12 - dist;
      g.x += (dx / dist) * pen;
      g.y += (dy / dist) * pen;
      g.speed *= 0.7;
    }
  }

  if (!g.carried) {
    for (let i = 0; i < STAGES.length; i++) {
      if (!g.live[i]) continue;
      const s = STAGES[i]!;
      if (Math.hypot(s.x - g.x, s.y - g.y) < 118) {
        const dest = chooseDest(s.x, s.y);
        g.carried = {
          destId: dest.id,
          job: dest.job,
          clean: true,
          elapsed: 0,
          sx: s.x,
          sy: s.y,
        };
        g.live[i] = false;
        g.cool[i] = 10;
        g.pulse = 0.45;
        g.events.push("coin");
        popup(g, "Hopped on", "good");
        break;
      }
    }
  } else {
    g.carried.elapsed += dt;
    const dest = landmarkById(g.carried.destId);
    if (Math.hypot(dest.x - g.x, dest.y - g.y) < 120) {
      const dist = Math.hypot(dest.x - g.carried.sx, dest.y - g.carried.sy);
      let pay = 90 + dist * 0.28;
      const expected = dist / 210;
      if (g.carried.elapsed < expected) pay *= 1.12;
      if (g.carried.clean) pay *= 1.08;
      const mult = Math.min(3, 1 + g.streak * 0.25);
      pay = Math.round(pay * mult);
      g.cash += pay;
      g.fares += 1;
      if (g.carried.clean) g.streak += 1;
      else g.streak = 0;
      if (g.streak > g.bestStreak) g.bestStreak = g.streak;
      g.pulse = 0.6;
      g.events.push("coin");
      popup(g, `+KSh ${pay.toLocaleString("en-KE")}`, "good");
      g.carried = null;
      openPickups(g, 4);
    }
  }

  if (g.petrolCd <= 0 && g.fuel < 97) {
    for (const p of PETROL) {
      if (Math.hypot(p.x - g.x, p.y - g.y) < 90) {
        const cost = Math.min(g.cash, 100);
        g.cash -= cost;
        g.fuel = 100;
        g.petrolCd = 2.5;
        g.events.push("fill");
        popup(g, cost > 0 ? `Full tank −${cost}` : "Full tank", "good");
        break;
      }
    }
  }

  const burn = (0.42 + (Math.abs(g.speed) / MAX_SPEED) * 0.85) * dt;
  g.fuel = Math.max(0, g.fuel - burn);

  if (Math.abs(g.speed) > 50 && g.dust.length < 80 && Math.random() < dt * 36) {
    const bx = -fx;
    const by = -fy;
    g.dust.push({
      x: g.x + bx * 16 + (Math.random() - 0.5) * 8,
      y: g.y + by * 16 + (Math.random() - 0.5) * 8,
      vx: bx * 20 + (Math.random() - 0.5) * 30,
      vy: by * 20 + (Math.random() - 0.5) * 30,
      life: 0.45,
      max: 0.45,
      r: 3 + Math.random() * 3,
    });
  }

  const look = 100;
  const tx = g.x + fx * look;
  const ty = g.y + fy * look;
  const k = 1 - Math.exp(-5 * dt);
  g.camX += (tx - g.camX) * k;
  g.camY += (ty - g.camY) * k;
}

export function stepGame(g: Game, dt: number, a: Actions) {
  g.time += dt;
  g.shake = Math.max(0, g.shake - dt * 26);
  g.pulse = Math.max(0, g.pulse - dt);
  for (const p of g.popups) p.life -= dt;
  g.popups = g.popups.filter((p) => p.life > 0);
  for (const d of g.dust) {
    d.life -= dt;
    d.x += d.vx * dt;
    d.y += d.vy * dt;
  }
  g.dust = g.dust.filter((d) => d.life > 0);

  if (g.phase === "pause" || g.phase === "over") return;

  if (g.phase === "play" && a.pausePressed) {
    g.phase = "pause";
    return;
  }

  stepTraffic(g, dt);
  for (let i = 0; i < g.cool.length; i++) {
    if (g.cool[i]! > 0) g.cool[i] = Math.max(0, g.cool[i]! - dt);
  }

  if (g.phase === "title") {
    g.attract += dt;
    const tx = 3180 + Math.sin(g.attract * 0.17) * 420;
    const ty = 3000 + Math.cos(g.attract * 0.12) * 280;
    const k = 1 - Math.exp(-0.7 * dt);
    g.camX += (tx - g.camX) * k;
    g.camY += (ty - g.camY) * k;
    return;
  }

  stepPlayer(g, dt, a);
  if (g.phase === "play") {
    stepCops(g, dt);
    openPickups(g, g.carried ? 3 : 4);
  }
}

export function laneOf(v: Vehicle): Lane {
  return LANES[v.lane]!;
}

export const WORLD_W = 9800;
export const WORLD_H = 10400;

export type Road = {
  name: string;
  x: number;
  y: number;
  w: number;
  h: number;
  axis: "h" | "v";
};

export const ROADS: Road[] = [
  { name: "Uhuru Highway", x: 2800, y: 280, w: 280, h: 6640, axis: "v" },
  { name: "Thika Superhighway", x: 3380, y: 80, w: 260, h: 2620, axis: "v" },
  { name: "Mpaka Road", x: 760, y: 240, w: 180, h: 2100, axis: "v" },
  { name: "Mbagathi Way", x: 1320, y: 3600, w: 180, h: 2500, axis: "v" },
  { name: "Outer Ring Road", x: 4680, y: 1900, w: 200, h: 4900, axis: "v" },
  { name: "Northern Link", x: 560, y: 680, w: 3200, h: 170, axis: "h" },
  { name: "Waiyaki Way", x: 80, y: 1720, w: 3100, h: 210, axis: "h" },
  { name: "University Way", x: 980, y: 2520, w: 2700, h: 170, axis: "h" },
  { name: "Kenyatta Avenue", x: 1560, y: 3040, w: 3600, h: 190, axis: "h" },
  { name: "Haile Selassie", x: 1560, y: 3580, w: 3700, h: 170, axis: "h" },
  { name: "Ngong Road", x: 240, y: 4480, w: 3400, h: 200, axis: "h" },
  { name: "Jogoo Road", x: 2860, y: 4180, w: 6000, h: 180, axis: "h" },
  { name: "Langata Road", x: 860, y: 5580, w: 4300, h: 190, axis: "h" },
  { name: "Limuru Road", x: 1680, y: 80, w: 180, h: 1760, axis: "v" },
  { name: "Argwings Kodhek", x: 1480, y: 3200, w: 160, h: 1500, axis: "v" },
  { name: "Lusaka Road", x: 2480, y: 3920, w: 2400, h: 160, axis: "h" },
  { name: "Enterprise Road", x: 3520, y: 4700, w: 180, h: 1900, axis: "v" },
  { name: "Juja Road", x: 5600, y: 900, w: 180, h: 3500, axis: "v" },
  { name: "Mombasa Road", x: 3000, y: 6480, w: 6400, h: 230, axis: "h" },
  { name: "Magadi Road", x: 480, y: 5680, w: 180, h: 2100, axis: "v" },
  { name: "Eastern Bypass", x: 8600, y: 400, w: 230, h: 9000, axis: "v" },
  { name: "Airport North Road", x: 9080, y: 5600, w: 200, h: 2400, axis: "v" },
];

export type Lane = {
  axis: "h" | "v";
  dir: 1 | -1;
  fixed: number;
  min: number;
  max: number;
  name: string;
};

export function buildLanes(): Lane[] {
  const lanes: Lane[] = [];
  for (const r of ROADS) {
    if (r.axis === "v") {
      lanes.push({
        axis: "v",
        dir: -1,
        fixed: r.x + r.w * 0.28,
        min: r.y + 36,
        max: r.y + r.h - 36,
        name: r.name,
      });
      lanes.push({
        axis: "v",
        dir: 1,
        fixed: r.x + r.w * 0.72,
        min: r.y + 36,
        max: r.y + r.h - 36,
        name: r.name,
      });
    } else {
      lanes.push({
        axis: "h",
        dir: 1,
        fixed: r.y + r.h * 0.28,
        min: r.x + 36,
        max: r.x + r.w - 36,
        name: r.name,
      });
      lanes.push({
        axis: "h",
        dir: -1,
        fixed: r.y + r.h * 0.72,
        min: r.x + 36,
        max: r.x + r.w - 36,
        name: r.name,
      });
    }
  }
  return lanes;
}

export const LANES = buildLanes();

export function laneYaw(axis: "h" | "v", dir: 1 | -1): number {
  if (axis === "v") return dir === -1 ? 0 : Math.PI;
  return dir === 1 ? -Math.PI / 2 : Math.PI / 2;
}

export const SPAWN = { x: 2800 + 280 * 0.28, y: 3400, yaw: 0 };

export type Stage = {
  id: string;
  name: string;
  area: string;
  x: number;
  y: number;
};

export const STAGES: Stage[] = [
  { id: "rail", name: "Railways stage", area: "CBD", x: 2776, y: 4000 },
  { id: "west", name: "Westlands stage", area: "Westlands", x: 1100, y: 1954 },
  { id: "koja", name: "Koja stage", area: "CBD", x: 3104, y: 3400 },
  { id: "yaya", name: "Yaya stage", area: "Kilimani", x: 1000, y: 4704 },
  { id: "east", name: "Eastleigh stage", area: "Eastleigh", x: 4300, y: 4156 },
  { id: "thika", name: "Thika Rd stage", area: "Thika Road", x: 3664, y: 1100 },
  { id: "kangemi", name: "Kangemi stage", area: "Kangemi", x: 280, y: 1954 },
  { id: "southb", name: "South B stage", area: "South B", x: 3104, y: 5200 },
  { id: "museum", name: "Museum Hill", area: "Museum Hill", x: 1500, y: 2496 },
  { id: "bus", name: "Bus Station", area: "CBD", x: 3600, y: 3774 },
  { id: "karen", name: "Karen stage", area: "Karen", x: 420, y: 7200 },
  { id: "buru", name: "Buruburu stage", area: "Buruburu", x: 7000, y: 4120 },
  { id: "pipe", name: "Pipeline stage", area: "Mombasa Road", x: 6200, y: 6420 },
  { id: "emba", name: "Embakasi stage", area: "Embakasi", x: 8520, y: 7200 },
  { id: "nyayo", name: "Nyayo stage", area: "South C", x: 3104, y: 6420 },
];

export type LandmarkKind =
  | "kicc"
  | "tower"
  | "mall"
  | "market"
  | "park"
  | "airport"
  | "campus"
  | "archives"
  | "village"
  | "strip";

export type Landmark = {
  id: string;
  name: string;
  blurb: string;
  x: number;
  y: number;
  drawX: number;
  drawY: number;
  kind: LandmarkKind;
  job: string;
};

export const LANDMARKS: Landmark[] = [
  {
    id: "kicc",
    name: "KICC",
    blurb: "Convention centre",
    x: 2940,
    y: 3135,
    drawX: 3320,
    drawY: 2860,
    kind: "kicc",
    job: "Conference run",
  },
  {
    id: "times",
    name: "Times Tower",
    blurb: "Tax headquarters",
    x: 2940,
    y: 3920,
    drawX: 3340,
    drawY: 3920,
    kind: "tower",
    job: "Office run",
  },
  {
    id: "park",
    name: "Uhuru Park",
    blurb: "Park gate",
    x: 2200,
    y: 3135,
    drawX: 2360,
    drawY: 2880,
    kind: "park",
    job: "Park meetup",
  },
  {
    id: "sarit",
    name: "Sarit Centre",
    blurb: "Westlands",
    x: 1180,
    y: 1825,
    drawX: 1180,
    drawY: 1480,
    kind: "mall",
    job: "Mall drop",
  },
  {
    id: "yaya",
    name: "Yaya Centre",
    blurb: "Kilimani",
    x: 1100,
    y: 4580,
    drawX: 980,
    drawY: 4240,
    kind: "mall",
    job: "Supermarket",
  },
  {
    id: "east",
    name: "Eastleigh Market",
    blurb: "Garissa Lodge side",
    x: 4200,
    y: 4270,
    drawX: 4100,
    drawY: 3920,
    kind: "market",
    job: "Market drop",
  },
  {
    id: "village",
    name: "Village Market",
    blurb: "Gigiri",
    x: 1280,
    y: 765,
    drawX: 1280,
    drawY: 400,
    kind: "village",
    job: "Hotel guest",
  },
  {
    id: "jkia",
    name: "JKIA",
    blurb: "Departures drop",
    x: 9180,
    y: 7600,
    drawX: 8900,
    drawY: 7600,
    kind: "airport",
    job: "Airport dash",
  },
  {
    id: "uon",
    name: "UoN",
    blurb: "University Way",
    x: 1680,
    y: 2605,
    drawX: 1680,
    drawY: 2300,
    kind: "campus",
    job: "Campus lift",
  },
  {
    id: "archives",
    name: "Archives",
    blurb: "Kenyatta Avenue",
    x: 3680,
    y: 3135,
    drawX: 3680,
    drawY: 2860,
    kind: "archives",
    job: "Interview",
  },
  {
    id: "wilson",
    name: "Wilson",
    blurb: "Langata strip",
    x: 2200,
    y: 5670,
    drawX: 2100,
    drawY: 6000,
    kind: "strip",
    job: "Charter hop",
  },
  {
    id: "knh",
    name: "KNH",
    blurb: "Hospital hill",
    x: 1500,
    y: 4580,
    drawX: 1680,
    drawY: 4300,
    kind: "campus",
    job: "Hospital run",
  },
  {
    id: "kibera",
    name: "Kibera",
    blurb: "Ngong Road edge",
    x: 1680,
    y: 4704,
    drawX: 1900,
    drawY: 4920,
    kind: "market",
    job: "Estate drop",
  },
  {
    id: "junction",
    name: "The Junction",
    blurb: "Ngong Road",
    x: 900,
    y: 4580,
    drawX: 700,
    drawY: 4280,
    kind: "mall",
    job: "Mall drop",
  },
  {
    id: "rivers",
    name: "Two Rivers",
    blurb: "Limuru Road",
    x: 1770,
    y: 500,
    drawX: 2000,
    drawY: 280,
    kind: "mall",
    job: "Mall drop",
  },
  {
    id: "nyayostad",
    name: "Nyayo",
    blurb: "Stadium",
    x: 3080,
    y: 4000,
    drawX: 3320,
    drawY: 4300,
    kind: "park",
    job: "Match day",
  },
];

export type Petrol = { id: string; x: number; y: number; drawX: number; drawY: number };

export const PETROL: Petrol[] = [
  { id: "p1", x: 2940, y: 2100, drawX: 2660, drawY: 2060 },
  { id: "p2", x: 2940, y: 4900, drawX: 2660, drawY: 4860 },
  { id: "p3", x: 4500, y: 4270, drawX: 4500, drawY: 4000 },
  { id: "p4", x: 900, y: 765, drawX: 1100, drawY: 500 },
  { id: "p5", x: 5200, y: 6590, drawX: 5200, drawY: 6320 },
  { id: "p6", x: 8710, y: 2800, drawX: 8460, drawY: 2800 },
  { id: "p7", x: 620, y: 7400, drawX: 800, drawY: 7400 },
];

export type Park = { name: string; x: number; y: number; w: number; h: number };

export const PARKS: Park[] = [
  { name: "Uhuru Park", x: 1980, y: 2760, w: 760, h: 250 },
  { name: "Karura Forest", x: 40, y: 40, w: 900, h: 620 },
  { name: "Ngong Road Forest", x: 80, y: 3600, w: 780, h: 760 },
  { name: "Arboretum", x: 1680, y: 2000, w: 520, h: 420 },
  { name: "Nairobi National Park", x: 160, y: 7900, w: 5200, h: 2300 },
];

export type Building = {
  x: number;
  y: number;
  w: number;
  h: number;
  style: number;
  tall: number;
};

export type Tree = { x: number; y: number; r: number; acacia: boolean };
export type Pothole = { x: number; y: number; r: number };

function hash(a: number, b: number) {
  let h = Math.imul(a | 0, 374761393) + Math.imul(b | 0, 668265263);
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return (h ^ (h >>> 16)) >>> 0;
}

function overlaps(
  x: number,
  y: number,
  w: number,
  h: number,
  rects: { x: number; y: number; w: number; h: number }[],
  pad: number,
) {
  for (const r of rects) {
    if (x < r.x + r.w + pad && x + w > r.x - pad && y < r.y + r.h + pad && y + h > r.y - pad) {
      return true;
    }
  }
  return false;
}

function districtStyle(x: number, y: number) {
  if (x > 2500 && x < 4000 && y > 2400 && y < 4300) return 0;
  if (x < 2300 && y < 2600) return 1;
  if (x > 4600 && y > 2400 && y < 5200) return 2;
  if (y > 4300 && y < 5600 && x < 3000) return 3;
  if (y < 1600) return 4;
  if (y > 5000 && y < 7800 && x > 3200) return 2;
  return 5;
}

const reserved: { x: number; y: number; w: number; h: number }[] = [
  ...ROADS,
  ...PARKS,
  ...STAGES.map((s) => ({ x: s.x - 70, y: s.y - 70, w: 140, h: 140 })),
  ...PETROL.map((p) => ({ x: p.drawX - 80, y: p.drawY - 50, w: 160, h: 100 })),
  ...LANDMARKS.map((l) => ({ x: l.drawX - 110, y: l.drawY - 90, w: 220, h: 180 })),
];

const buildings: Building[] = [];
const CELL = 176;
for (let y = 70; y < WORLD_H - 70; y += CELL) {
  for (let x = 70; x < WORLD_W - 70; x += CELL) {
    const h = hash(x, y);
    const kibera = x > 1400 && x < 2400 && y > 4700 && y < 5450;
    const industrial = x > 3300 && x < 8200 && y > 5000 && y < 7600;
    const karen = x < 1500 && y > 7000;
    if (karen && h % 4 !== 0) continue;
    if (!kibera && (h % 7) < 2) continue;
    if (!kibera && (x % 640 < 84 || y % 560 < 76)) continue;
    let bw = 68 + (h % 28);
    let bh = 62 + ((h >>> 8) % 26);
    if (kibera) {
      bw = 36 + (h % 18);
      bh = 32 + ((h >>> 8) % 16);
    } else if (industrial) {
      bw = 110 + (h % 50);
      bh = 70 + ((h >>> 8) % 36);
    }
    const bx = x + ((h >>> 4) % 28) - 8;
    const by = y + ((h >>> 12) % 28) - 8;
    if (overlaps(bx, by, bw, bh, reserved, 22)) continue;
    const style = districtStyle(bx, by);
    const tall = kibera || industrial ? 0 : style === 0 ? 2 + (h % 3) : h % 2;
    buildings.push({ x: bx, y: by, w: bw, h: bh, style, tall });
  }
}
export const BUILDINGS = buildings;

const trees: Tree[] = [];
function scatterTrees(park: Park, stride: number, acacia: boolean, radius: number) {
  for (let y = park.y + 30; y < park.y + park.h - 20; y += stride) {
    for (let x = park.x + 30; x < park.x + park.w - 20; x += stride) {
      const h = hash(x, y);
      if (h % 5 === 0) continue;
      trees.push({
        x: x + (h % 24) - 12,
        y: y + ((h >>> 6) % 24) - 12,
        r: radius + (h % 8),
        acacia,
      });
    }
  }
}
scatterTrees(PARKS[0]!, 78, false, 16);
scatterTrees(PARKS[1]!, 70, false, 18);
scatterTrees(PARKS[2]!, 90, false, 16);
scatterTrees(PARKS[3]!, 80, false, 16);
scatterTrees(PARKS[4]!, 240, true, 22);
export const TREES = trees;

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

const potholes: Pothole[] = [];
const rnd = mulberry32(254);
let guard = 0;
while (potholes.length < 42 && guard < 400) {
  guard++;
  const road = ROADS[Math.floor(rnd() * ROADS.length)]!;
  const x = road.x + 28 + rnd() * (road.w - 56);
  const y = road.y + 28 + rnd() * (road.h - 56);
  let close = false;
  for (const s of STAGES) {
    if (Math.hypot(s.x - x, s.y - y) < 160) close = true;
  }
  for (const p of PETROL) {
    if (Math.hypot(p.x - x, p.y - y) < 180) close = true;
  }
  for (const existing of potholes) {
    if (Math.hypot(existing.x - x, existing.y - y) < 220) close = true;
  }
  if (!close) potholes.push({ x, y, r: 14 + rnd() * 10 });
}
export const POTHOLES = potholes;

export function pointOnRoad(x: number, y: number, pad = 0) {
  for (const r of ROADS) {
    if (x >= r.x - pad && x <= r.x + r.w + pad && y >= r.y - pad && y <= r.y + r.h + pad) return true;
  }
  return false;
}

const BUCKET = 220;
const grid = new Map<number, Building[]>();
function key(ix: number, iy: number) {
  return ix + iy * 8192;
}
for (const b of BUILDINGS) {
  const x0 = Math.floor(b.x / BUCKET);
  const y0 = Math.floor(b.y / BUCKET);
  const x1 = Math.floor((b.x + b.w) / BUCKET);
  const y1 = Math.floor((b.y + b.h) / BUCKET);
  for (let ix = x0; ix <= x1; ix++) {
    for (let iy = y0; iy <= y1; iy++) {
      const k = key(ix, iy);
      let arr = grid.get(k);
      if (!arr) grid.set(k, (arr = []));
      arr.push(b);
    }
  }
}

export function buildingsNear(x: number, y: number, radius: number) {
  const x0 = Math.floor((x - radius) / BUCKET);
  const y0 = Math.floor((y - radius) / BUCKET);
  const x1 = Math.floor((x + radius) / BUCKET);
  const y1 = Math.floor((y + radius) / BUCKET);
  const out: Building[] = [];
  for (let ix = x0; ix <= x1; ix++) {
    for (let iy = y0; iy <= y1; iy++) {
      const arr = grid.get(key(ix, iy));
      if (!arr) continue;
      for (const b of arr) {
        if (!out.includes(b)) out.push(b);
      }
    }
  }
  return out;
}

export function landmarkById(id: string) {
  return LANDMARKS.find((l) => l.id === id) ?? LANDMARKS[0]!;
}

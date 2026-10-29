// The town map: the original gentle.js map widened to 16:9 with a village on the
// east side. Tile ids >= MAGE_TILE_OFFSET come from the second tileset
// (magecity.png, 8 tiles wide); see src/components/PixiStaticMap.tsx.
import * as gentle from './gentle';

export const MAGE_TILESET_URL = '/ai-town/assets/magecity.png';
export const MAGE_TILESET_COLUMNS = 8;
export const MAGE_TILE_OFFSET = 100000;

const mage = (col: number, row: number) => MAGE_TILE_OFFSET + row * MAGE_TILESET_COLUMNS + col;

const GRASS = 271;
const OLD_WIDTH = gentle.mapwidth;
export const mapwidth = 86;
export const mapheight = gentle.mapheight;

// Layers are [layer][x][y]. Start from the old map and pad the new columns.
const grow = (layers: number[][][], fill: (layer: number) => number) =>
  layers.map((layer, i) => [
    ...layer.map((column) => [...column]),
    ...Array.from({ length: mapwidth - OLD_WIDTH }, () =>
      Array.from({ length: mapheight }, () => fill(i)),
    ),
  ]);
export const bgtiles = grow(gentle.bgtiles, (i) => (i === 0 ? GRASS : -1));
export const objmap = grow(gentle.objmap, () => -1);

const setBg = (x: number, y: number, tile: number) => (bgtiles[0][x][y] = tile);
const setObj = (x: number, y: number, tile: number, layer = 0) => (objmap[layer][x][y] = tile);

// Copy a block of the old map (all layers) somewhere else, to reuse its forest edges.
function copy(sx: number, sy: number, w: number, h: number, dx: number, dy: number) {
  for (let x = 0; x < w; x++) {
    for (let y = 0; y < h; y++) {
      if (dx + x >= mapwidth || dy + y >= mapheight) continue;
      for (const layers of [bgtiles, objmap]) {
        for (const layer of layers) {
          layer[dx + x][dy + y] = layer[sx + x][sy + y];
        }
      }
    }
  }
}

// Forest along the top and bottom of the village, copied from the forest's edges
// on the east side of the old map.
for (let dx = OLD_WIDTH; dx < mapwidth; dx += 8) {
  copy(53, 10, 8, 7, dx, 0);
  copy(52, 44, 8, 4, dx, 44);
}

// Main road from the east meadow into the village, and a north-south street.
for (let x = 61; x < mapwidth; x++) setBg(x, 24, mage(2, 41));
for (let y = 7; y < 43; y++) setBg(75, y, mage(2, 41));

// Plaza around the crossroads; its center is where a statue can go.
export const PLAZA = { x: 72, y: 20, w: 7, h: 9 };
export const STATUE_SITE = { x: 75, y: 24 };
for (let x = PLAZA.x; x < PLAZA.x + PLAZA.w; x++) {
  for (let y = PLAZA.y; y < PLAZA.y + PLAZA.h; y++) {
    const col = x === PLAZA.x ? 0 : x === PLAZA.x + PLAZA.w - 1 ? 2 : 1;
    const row = y === PLAZA.y ? 9 : y === PLAZA.y + PLAZA.h - 1 ? 11 : 10;
    setBg(x, y, mage(col, row));
  }
}
// Fountain and benches on the plaza.
setObj(73, 21, mage(6, 2));
setObj(74, 21, mage(7, 2));
setObj(73, 22, mage(6, 3));
setObj(74, 22, mage(7, 3));
setObj(76, 27, mage(0, 16));
setObj(77, 27, mage(1, 16));
setObj(73, 27, mage(0, 16));
setObj(74, 27, mage(1, 16));

// Houses: a 3x3 roof over a 3x2 wall, door in the middle of the bottom row.
const ROOFS = [
  [0, 23],
  [5, 23],
];
const WALLS = [
  [0, 4],
  [4, 26],
];
function house(x: number, y: number, style: 0 | 1) {
  const [rc, rr] = ROOFS[style];
  const [wc, wr] = WALLS[style];
  for (let i = 0; i < 3; i++) {
    for (let j = 0; j < 3; j++) setObj(x + i, y + j, mage(rc + i, rr + j));
    for (let j = 0; j < 2; j++) setObj(x + i, y + 3 + j, mage(wc + i, wr + j));
  }
  setObj(x + 1, y + 4, mage(6, 40), 1);
  // Cobbles in front of the door.
  setBg(x + 1, y + 5, mage(2, 41));
}
export const HOUSES = [
  { x: 66, y: 8, style: 0 },
  { x: 70, y: 8, style: 1 },
  { x: 78, y: 8, style: 0 },
  { x: 82, y: 8, style: 1 },
  { x: 66, y: 28, style: 1 },
  { x: 81, y: 28, style: 0 },
] as const;
for (const h of HOUSES) house(h.x, h.y, h.style);
// Paths from the north houses' doors down to the main road.
for (const h of HOUSES.filter((h) => h.y === 8)) {
  for (let y = h.y + 5; y < 24; y++) setBg(h.x + 1, y, mage(2, 41));
}

// Market along the road west of the plaza: tables, barrels and goods.
setObj(64, 21, mage(5, 0));
setObj(65, 21, mage(6, 0));
setObj(64, 22, mage(5, 1));
setObj(65, 22, mage(6, 1));
setObj(67, 22, mage(4, 1));
setObj(68, 22, mage(7, 9));
setObj(69, 26, mage(4, 2));
setObj(69, 27, mage(4, 3));
setObj(70, 26, mage(4, 9));
// Lanterns along the main road.
for (const x of [63, 70, 80, 84]) setObj(x, 25, mage(5, 41));

// Farm fields south of the road, fenced along the top.
export const FIELDS = [
  { x: 64, y: 37, w: 8, h: 5 },
  { x: 77, y: 37, w: 8, h: 5 },
];
for (const f of FIELDS) {
  for (let x = f.x; x < f.x + f.w; x++) {
    setObj(x, f.y - 1, mage(2 + (x % 2), 40));
    for (let y = f.y; y < f.y + f.h; y++) {
      setBg(x, y, (x + y) % 4 === 0 ? mage(3, 41) : mage(1, 42));
    }
  }
}

export const animatedsprites = gentle.animatedsprites;
export const tilesetpath = gentle.tilesetpath;
export const tiledim = gentle.tiledim;
export const tilesetpxw = gentle.tilesetpxw;
export const tilesetpxh = gentle.tilesetpxh;

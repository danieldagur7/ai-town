import { BaseTexture, SCALE_MODES } from 'pixi.js';
import { HAIR_COLOURS, Look, OUTFIT_COLOURS } from '../data/looks';
import { characters } from '../data/characters';

// Recolours one base sprite's cell of 32x32folk.png with a look's hair and
// outfit colours. Which colours are "hair" and which are "outfit" is learned
// from the front-facing frame: hair sits on top of the head, clothes below
// the face. Each distinct look is made once and shared.

const cache = new Map<string, Promise<BaseTexture>>();
const images = new Map<string, Promise<HTMLImageElement>>();

const CELL = { w: 96, h: 128 };

function loadImage(url: string) {
  let p = images.get(url);
  if (!p) {
    const img = new Image();
    img.src = url;
    p = img.decode().then(() => img);
    images.set(url, p);
  }
  return p;
}

const key = (r: number, g: number, b: number) => (r << 16) | (g << 8) | b;
// Loose: only used on the middle of the face, to skip eyes and mouth.
const isSkin = (r: number, g: number, b: number) => r > 90 && r >= g && g >= b;
const isOutline = (r: number, g: number, b: number) => r + g + b < 60;

export function lookUrl(look: Look) {
  return characters.find((c) => c.name === look.base)?.textureUrl;
}

export function lookBaseTexture(look: Look, textureUrl: string): Promise<BaseTexture> {
  if (!look.hair && !look.outfit) {
    return Promise.resolve(BaseTexture.from(textureUrl, { scaleMode: SCALE_MODES.NEAREST }));
  }
  const id = `${textureUrl}|${look.base}|${look.hair}|${look.outfit}`;
  let p = cache.get(id);
  if (!p) {
    p = recolour(look, textureUrl);
    cache.set(id, p);
  }
  return p;
}

async function recolour(look: Look, textureUrl: string) {
  const img = await loadImage(textureUrl);
  const c = characters.find((c) => c.name === look.base)!;
  const down = (c.spritesheetData.frames as any).down.frame as { x: number; y: number };
  const origin = { x: down.x, y: down.y };
  const canvas = document.createElement('canvas');
  canvas.width = img.width;
  canvas.height = img.height;
  const ctx = canvas.getContext('2d', { willReadFrequently: true })!;
  ctx.drawImage(img, 0, 0);
  const cell = ctx.getImageData(origin.x, origin.y, CELL.w, CELL.h);
  const d = cell.data;

  // Learn the palette from the middle "down" frame (column 1, row 0): skin
  // is whatever colours the middle of the face uses, hair is on top of the
  // head, clothes are below the face.
  const colourAt = (x: number, y: number) => {
    const i = (y * CELL.w + x) * 4;
    if (d[i + 3] < 10 || isOutline(d[i], d[i + 1], d[i + 2])) return undefined;
    return key(d[i], d[i + 1], d[i + 2]);
  };
  const skin = new Set<number>();
  for (let y = 12; y < 18; y++) {
    for (let x = 44; x < 52; x++) {
      const k = colourAt(x, y);
      if (k !== undefined && isSkin(k >> 16, (k >> 8) & 255, k & 255)) skin.add(k);
    }
  }
  const hair = new Set<number>();
  const outfit = new Set<number>();
  for (let y = 0; y < 32; y++) {
    for (let x = 32; x < 64; x++) {
      const k = colourAt(x, y);
      if (k === undefined || skin.has(k)) continue;
      if (y < 11) hair.add(k);
      else if (y > 18) outfit.add(k);
    }
  }
  // Hair that also shows on the clothes (long hair) stays hair.
  for (const k of hair) outfit.delete(k);

  const hairRamp = HAIR_COLOURS[look.hair].ramp;
  const outfitRamp = OUTFIT_COLOURS[look.outfit].ramp;
  const range = (set: Set<number>) => {
    let [lo, hi] = [255, 0];
    for (const k of set) {
      const l = luma(k >> 16, (k >> 8) & 255, k & 255);
      lo = Math.min(lo, l);
      hi = Math.max(hi, l);
    }
    return [lo, Math.max(hi, lo + 1)];
  };
  const [hLo, hHi] = range(hair);
  const [oLo, oHi] = range(outfit);
  for (let i = 0; i < d.length; i += 4) {
    if (d[i + 3] < 10) continue;
    const k = key(d[i], d[i + 1], d[i + 2]);
    const l = luma(d[i], d[i + 1], d[i + 2]);
    if (hairRamp && hair.has(k)) paint(d, i, hairRamp, (l - hLo) / (hHi - hLo));
    else if (outfitRamp && outfit.has(k)) paint(d, i, outfitRamp, (l - oLo) / (oHi - oLo));
  }
  ctx.putImageData(cell, origin.x, origin.y);
  return BaseTexture.from(canvas, { scaleMode: SCALE_MODES.NEAREST });
}

const luma = (r: number, g: number, b: number) => 0.3 * r + 0.59 * g + 0.11 * b;

function paint(d: Uint8ClampedArray, i: number, [dark, light]: readonly number[], t: number) {
  // Keep the original shading: map the old brightness onto the new colour's ramp.
  const s = Math.max(0, Math.min(1, t));
  for (let c = 0; c < 3; c++) {
    const shift = 16 - c * 8;
    const a = (dark >> shift) & 255;
    const b = (light >> shift) & 255;
    d[i + c] = Math.round(a + (b - a) * s);
  }
}

// The recoloured sheet as an image URL, for previews outside Pixi (menus).
const previewUrls = new Map<string, Promise<string>>();
export function lookPreviewUrl(look: Look, textureUrl: string): Promise<string> {
  if (!look.hair && !look.outfit) return Promise.resolve(textureUrl);
  const id = `${look.base}|${look.hair}|${look.outfit}`;
  let p = previewUrls.get(id);
  if (!p) {
    p = lookBaseTexture(look, textureUrl).then((t) =>
      (t.resource as any).source.toDataURL('image/png'),
    );
    previewUrls.set(id, p);
  }
  return p;
}

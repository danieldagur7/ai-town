import { BaseTexture, SCALE_MODES } from 'pixi.js';

// The f4 elder's cell in 32x32folk.png.
const REGION = { x: 288, y: 0, w: 96, h: 128 };

const lerp = (a: number, b: number, t: number) => Math.round(a + (b - a) * t);

// Recolors the elder's brown clothes into a white robe with gold shading, keeping
// skin, hair and outlines. Done at load time so there's no extra image asset.
export async function divineBaseTexture(textureUrl: string) {
  const img = new Image();
  img.src = textureUrl;
  await img.decode();
  const canvas = document.createElement('canvas');
  canvas.width = img.width;
  canvas.height = img.height;
  const ctx = canvas.getContext('2d')!;
  ctx.drawImage(img, 0, 0);
  const pixels = ctx.getImageData(REGION.x, REGION.y, REGION.w, REGION.h);
  const d = pixels.data;
  for (let i = 0; i < d.length; i += 4) {
    if (d[i + 3] < 10) {
      continue;
    }
    const [r, g, b] = [d[i], d[i + 1], d[i + 2]];
    const saturation = Math.max(r, g, b) - Math.min(r, g, b);
    const skin = r > 190 && g > 140 && b > 110;
    if (saturation < 25 || skin) {
      continue;
    }
    const t = Math.min(1, (0.3 * r + 0.59 * g + 0.11 * b) / 110);
    d[i] = lerp(196, 255, t);
    d[i + 1] = lerp(150, 247, t);
    d[i + 2] = lerp(52, 224, t);
  }
  ctx.putImageData(pixels, REGION.x, REGION.y);
  return BaseTexture.from(canvas, { scaleMode: SCALE_MODES.NEAREST });
}

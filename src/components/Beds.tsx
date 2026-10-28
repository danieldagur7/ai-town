import { Graphics } from '@pixi/react';
import { Graphics as PixiGraphics } from 'pixi.js';
import { useCallback } from 'react';
import { BEDS } from '../../data/beds';

// Bedrolls for the night cycle, drawn under the characters.
export function Beds({ tileDim }: { tileDim: number }) {
  const draw = useCallback(
    (g: PixiGraphics) => {
      g.clear();
      for (const { x, y } of Object.values(BEDS)) {
        const px = x * tileDim;
        const py = y * tileDim;
        // Blanket with a pillow at the top.
        g.beginFill(0x5b3a8c, 0.9);
        g.drawRoundedRect(px + 4, py + 2, tileDim - 8, tileDim - 4, 4);
        g.endFill();
        g.beginFill(0xf2e8d5, 1);
        g.drawRoundedRect(px + 7, py + 4, tileDim - 14, 7, 3);
        g.endFill();
      }
    },
    [tileDim],
  );
  return <Graphics draw={draw} />;
}

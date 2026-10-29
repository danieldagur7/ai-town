import { PixiComponent, applyDefaultProps } from '@pixi/react';
import * as PIXI from 'pixi.js';
import { AnimatedSprite, WorldMap } from '../../convex/aiTown/worldMap';
import * as campfire from '../../data/animations/campfire.json';
import * as gentlesparkle from '../../data/animations/gentlesparkle.json';
import * as gentlewaterfall from '../../data/animations/gentlewaterfall.json';
import * as gentlesplash from '../../data/animations/gentlesplash.json';
import * as windmill from '../../data/animations/windmill.json';
import { MAGE_TILESET_COLUMNS, MAGE_TILESET_URL, MAGE_TILE_OFFSET } from '../../data/town';
import { vivid } from '../vivid';
import { sun } from '../sun';

const animations = {
  'campfire.json': { spritesheet: campfire, url: '/ai-town/assets/spritesheets/campfire.png' },
  'gentlesparkle.json': {
    spritesheet: gentlesparkle,
    url: '/ai-town/assets/spritesheets/gentlesparkle32.png',
  },
  'gentlewaterfall.json': {
    spritesheet: gentlewaterfall,
    url: '/ai-town/assets/spritesheets/gentlewaterfall32.png',
  },
  'windmill.json': { spritesheet: windmill, url: '/ai-town/assets/spritesheets/windmill.png' },
  'gentlesplash.json': {
    spritesheet: gentlesplash,
    url: '/ai-town/assets/spritesheets/gentlewaterfall32.png',
  },
};

export const PixiStaticMap = PixiComponent('StaticMap', {
  create: (props: { map: WorldMap; [k: string]: any }) => {
    const map = props.map;
    const numxtiles = Math.floor(map.tileSetDimX / map.tileDim);
    const numytiles = Math.floor(map.tileSetDimY / map.tileDim);
    const bt = PIXI.BaseTexture.from(vivid(map.tileSetUrl), {
      scaleMode: PIXI.SCALE_MODES.NEAREST,
    });

    const tiles = [];
    for (let x = 0; x < numxtiles; x++) {
      for (let y = 0; y < numytiles; y++) {
        tiles[x + y * numxtiles] = new PIXI.Texture(
          bt,
          new PIXI.Rectangle(x * map.tileDim, y * map.tileDim, map.tileDim, map.tileDim),
        );
      }
    }
    // Village tiles from the second tileset (ids from MAGE_TILE_OFFSET up).
    const mageBase = PIXI.BaseTexture.from(vivid(MAGE_TILESET_URL), {
      scaleMode: PIXI.SCALE_MODES.NEAREST,
    });
    const mageTile = (index: number) => {
      const i = index - MAGE_TILE_OFFSET;
      const x = (i % MAGE_TILESET_COLUMNS) * map.tileDim;
      const y = Math.floor(i / MAGE_TILESET_COLUMNS) * map.tileDim;
      return new PIXI.Texture(mageBase, new PIXI.Rectangle(x, y, map.tileDim, map.tileDim));
    };
    const screenxtiles = map.bgTiles[0].length;
    const screenytiles = map.bgTiles[0][0].length;

    const container = new PIXI.Container();
    const allLayers = [...map.bgTiles, ...map.objectTiles];

    // The map is thousands of tile sprites; group them into chunks that Pixi
    // skips when they're off screen (a phone zoomed in only draws a few).
    const CHUNK = 16;
    const chunks = new Map<number, PIXI.Container>();
    const chunkAt = (x: number, y: number) => {
      const [cx, cy] = [Math.floor(x / CHUNK), Math.floor(y / CHUNK)];
      const key = cx * 1000 + cy;
      let chunk = chunks.get(key);
      if (!chunk) {
        chunk = new PIXI.Container();
        chunk.cullable = true;
        // Culling checks this fixed rectangle instead of recomputing bounds.
        chunk.cullArea = new PIXI.Rectangle(
          cx * CHUNK * map.tileDim,
          cy * CHUNK * map.tileDim,
          CHUNK * map.tileDim,
          CHUNK * map.tileDim,
        );
        chunks.set(key, chunk);
        container.addChild(chunk);
      }
      return chunk;
    };

    // blit bg & object layers of map onto canvas
    for (let i = 0; i < screenxtiles * screenytiles; i++) {
      const x = i % screenxtiles;
      const y = Math.floor(i / screenxtiles);
      const xPx = x * map.tileDim;
      const yPx = y * map.tileDim;

      // Add all layers of backgrounds.
      for (const layer of allLayers) {
        const tileIndex = layer[x][y];
        // Some layers may not have tiles at this location.
        if (tileIndex === -1) continue;
        const ctile = new PIXI.Sprite(
          tileIndex >= MAGE_TILE_OFFSET ? mageTile(tileIndex) : tiles[tileIndex],
        );
        ctile.x = xPx;
        ctile.y = yPx;
        chunkAt(x, y).addChild(ctile);
      }
    }

    // TODO: Add layers.
    const spritesBySheet = new Map<string, AnimatedSprite[]>();
    for (const sprite of map.animatedSprites) {
      const sheet = sprite.sheet;
      if (!spritesBySheet.has(sheet)) {
        spritesBySheet.set(sheet, []);
      }
      spritesBySheet.get(sheet)!.push(sprite);
    }
    // Windmills are a still tower with sails that turn every frame (from
    // scripts/split_windmill.py); the 8-frame sheet looked choppy.
    const windmills = spritesBySheet.get('windmill.json') ?? [];
    spritesBySheet.delete('windmill.json');
    if (windmills.length) {
      const sheetTexture = (part: string) =>
        PIXI.Texture.from(
          vivid(`/ai-town/assets/spritesheets/windmill.png`).replace('.png', `-${part}.png`),
          {
            scaleMode: PIXI.SCALE_MODES.NEAREST,
          },
        );
      const [tower, sailsTexture] = [sheetTexture('tower'), sheetTexture('sails')];
      const sails: PIXI.Sprite[] = [];
      const shadows: PIXI.Sprite[] = [];
      for (const w of windmills) {
        const scale = w.w / 208;
        // The tower's silhouette on the ground, leaning away from the sun
        // (its feet are at y=190 of the 208px frame).
        const shadow = new PIXI.Sprite(tower);
        shadow.anchor.set(0.5, 190 / 208);
        shadow.position.set(w.x + w.w / 2, w.y + 190 * scale);
        shadow.scale.set(scale, scale * 0.4);
        shadow.tint = 0x1a1030;
        container.addChild(shadow);
        shadows.push(shadow);
        const base = new PIXI.Sprite(tower);
        base.position.set(w.x, w.y);
        base.scale.set(scale);
        const s = new PIXI.Sprite(sailsTexture);
        s.anchor.set(0.5);
        s.position.set(w.x + w.w / 2, w.y + w.h / 2);
        s.scale.set(scale);
        // Each mill starts at its own angle and speed, so they don't turn in lockstep.
        s.rotation = Math.random() * Math.PI;
        (s as any).spin = 0.8 + Math.random() * 0.5;
        container.addChild(base, s);
        sails.push(s);
      }
      const turn = (dt: number) => {
        const seconds = dt / 60;
        for (const s of sails) s.rotation += (s as any).spin * seconds;
        for (const s of shadows) {
          s.skew.x = -sun.lean * 0.9;
          s.scale.y = s.scale.x * (0.35 + Math.abs(sun.lean) * 0.15);
          s.alpha = sun.strength * 0.75;
        }
      };
      PIXI.Ticker.shared.add(turn);
      container.on('destroyed', () => PIXI.Ticker.shared.remove(turn));
    }
    for (const [sheet, sprites] of spritesBySheet.entries()) {
      const animation = (animations as any)[sheet];
      if (!animation) {
        console.error('Could not find animation', sheet);
        continue;
      }
      const { spritesheet, url } = animation;
      const texture = PIXI.BaseTexture.from(vivid(url), {
        scaleMode: PIXI.SCALE_MODES.NEAREST,
      });
      const spriteSheet = new PIXI.Spritesheet(texture, spritesheet);
      spriteSheet.parse().then(() => {
        for (const sprite of sprites) {
          const pixiAnimation = spriteSheet.animations[sprite.animation];
          if (!pixiAnimation) {
            console.error('Failed to load animation', sprite);
            continue;
          }
          const pixiSprite = new PIXI.AnimatedSprite(pixiAnimation);
          pixiSprite.animationSpeed = 0.1;
          pixiSprite.autoUpdate = true;
          pixiSprite.x = sprite.x;
          pixiSprite.y = sprite.y;
          pixiSprite.width = sprite.w;
          pixiSprite.height = sprite.h;
          container.addChild(pixiSprite);
          pixiSprite.play();
        }
      });
    }

    container.x = 0;
    container.y = 0;

    // Set the hit area manually to ensure `pointerdown` events are delivered to this container.
    container.interactive = true;
    container.hitArea = new PIXI.Rectangle(
      0,
      0,
      screenxtiles * map.tileDim,
      screenytiles * map.tileDim,
    );

    return container;
  },

  applyProps: (instance, oldProps, newProps) => {
    applyDefaultProps(instance, oldProps, newProps);
  },
});

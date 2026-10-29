// A person's look: one of the base sprites (f1–f8) plus picks from the
// "feature wheel" (hair colour, outfit colour, an accessory) and an idle quirk
// that shows their personality. It is packed into the player's `character`
// string, e.g. "f3~h2~o5~a:glasses~q:bouncy", so no table changes are needed;
// a plain "f3" is the original sprite with no extras.

export const HAIR_COLOURS = [
  { name: 'Original', ramp: null },
  { name: 'Black', ramp: [0x14121c, 0x4a4458] },
  { name: 'Brown', ramp: [0x3b2216, 0x9a6440] },
  { name: 'Auburn', ramp: [0x4d1a12, 0xc2563a] },
  { name: 'Ginger', ramp: [0x7a2e0c, 0xf29a3a] },
  { name: 'Blonde', ramp: [0x8a6a24, 0xfbe39a] },
  { name: 'Silver', ramp: [0x5c6070, 0xf2f2f6] },
  { name: 'Rose', ramp: [0x7a2448, 0xff9cc8] },
  { name: 'Sky', ramp: [0x203a7a, 0x8cd0ff] },
  { name: 'Moss', ramp: [0x1f4a2a, 0x8ad67a] },
  { name: 'Violet', ramp: [0x3a1f6a, 0xb894ff] },
] as const;

export const OUTFIT_COLOURS = [
  { name: 'Original', ramp: null },
  { name: 'Crimson', ramp: [0x4a0f1a, 0xf0566a] },
  { name: 'Tangerine', ramp: [0x6a2a08, 0xffa64a] },
  { name: 'Sunflower', ramp: [0x6a5208, 0xffe36a] },
  { name: 'Meadow', ramp: [0x174a1a, 0x7ee06a] },
  { name: 'Teal', ramp: [0x0c4048, 0x5ee0d8] },
  { name: 'Cobalt', ramp: [0x101e5c, 0x6a9cff] },
  { name: 'Plum', ramp: [0x3a1048, 0xd078f0] },
  { name: 'Charcoal', ramp: [0x16161c, 0x6c6c7a] },
  { name: 'Linen', ramp: [0x6a5a48, 0xfff2dc] },
] as const;

export const ACCESSORIES = [
  'none',
  'hat',
  'cap',
  'glasses',
  'flower',
  'bow',
  'scarf',
  'beard',
  'headband',
] as const;
export type Accessory = (typeof ACCESSORIES)[number];

// Small, personal idle motions. None of them are big: they're there so you can
// tell who is who from across the square.
export const QUIRKS = {
  bouncy: 'hops on the spot now and then (cheerful, energetic)',
  sway: 'sways gently side to side (dreamy, charming)',
  fidget: 'shuffles and glances around (nervous, restless)',
  proud: 'puffs up and stands tall (confident, vain)',
  ponder: 'tilts their head, thinking (curious, clever)',
  grumble: 'stamps and shakes their head (grumpy)',
  tap: 'taps a foot impatiently (busy, impatient)',
  wobble: 'wobbles a little (clumsy, shy)',
  twirl: 'spins around once in a while (playful)',
  still: 'barely moves (calm, cold)',
} as const;
export type Quirk = keyof typeof QUIRKS;
export const QUIRK_NAMES = Object.keys(QUIRKS) as Quirk[];

export const BASES = ['f1', 'f2', 'f3', 'f4', 'f5', 'f6', 'f7', 'f8'];

export type Look = {
  base: string;
  hair: number;
  outfit: number;
  accessory: Accessory;
  quirk?: Quirk;
};

export function parseLook(character: string): Look {
  const [base, ...parts] = character.split('~');
  const look: Look = { base, hair: 0, outfit: 0, accessory: 'none' };
  for (const part of parts) {
    if (part.startsWith('h')) look.hair = clampIndex(Number(part.slice(1)), HAIR_COLOURS.length);
    else if (part.startsWith('o'))
      look.outfit = clampIndex(Number(part.slice(1)), OUTFIT_COLOURS.length);
    else if (part.startsWith('a:') && ACCESSORIES.includes(part.slice(2) as Accessory))
      look.accessory = part.slice(2) as Accessory;
    else if (part.startsWith('q:') && part.slice(2) in QUIRKS) look.quirk = part.slice(2) as Quirk;
  }
  return look;
}

export function lookString(look: Look): string {
  const parts = [look.base];
  if (look.hair) parts.push(`h${look.hair}`);
  if (look.outfit) parts.push(`o${look.outfit}`);
  if (look.accessory !== 'none') parts.push(`a:${look.accessory}`);
  if (look.quirk) parts.push(`q:${look.quirk}`);
  return parts.join('~');
}

export function isValidLook(character: string) {
  return BASES.includes(parseLook(character).base);
}

function clampIndex(n: number, length: number) {
  return Number.isInteger(n) && n >= 0 && n < length ? n : 0;
}

const pick = <T>(items: readonly T[]) => items[Math.floor(Math.random() * items.length)];

// A spin of the feature wheel. Most people get no accessory, so the ones who
// do stand out.
export function randomLook(quirk?: Quirk): Look {
  return {
    base: pick(BASES),
    hair: Math.random() < 0.3 ? 0 : 1 + Math.floor(Math.random() * (HAIR_COLOURS.length - 1)),
    outfit: Math.random() < 0.2 ? 0 : 1 + Math.floor(Math.random() * (OUTFIT_COLOURS.length - 1)),
    accessory: Math.random() < 0.45 ? 'none' : pick(ACCESSORIES.slice(1)),
    quirk: quirk ?? pick(QUIRK_NAMES),
  };
}

// A baby takes after its parents: one parent's build, either parent's hair,
// and a fresh outfit. Their quirk is their own.
export function childLook(parentA: string, parentB: string, quirk?: Quirk): Look {
  const [a, b] = [parseLook(parentA), parseLook(parentB)];
  const fresh = randomLook(quirk);
  return {
    base: pick([a.base, b.base]),
    hair: Math.random() < 0.85 ? pick([a.hair, b.hair]) : fresh.hair,
    outfit: fresh.outfit,
    accessory: Math.random() < 0.7 ? 'none' : fresh.accessory,
    quirk: fresh.quirk,
  };
}

// The original townspeople's quirks, from their personalities.
const NAMED_QUIRKS: Record<string, Quirk> = {
  Lucky: 'bouncy',
  Bob: 'grumble',
  Stella: 'sway',
  Alice: 'ponder',
  Pete: 'proud',
  Kira: 'fidget',
  Alex: 'twirl',
  Kurt: 'tap',
};

export function quirkOf(name: string, character: string): Quirk {
  const look = parseLook(character);
  if (look.quirk) return look.quirk;
  if (NAMED_QUIRKS[name]) return NAMED_QUIRKS[name];
  // Anyone else still gets a steady quirk of their own.
  let h = 0;
  for (const ch of name) h = (h * 31 + ch.charCodeAt(0)) | 0;
  return QUIRK_NAMES[Math.abs(h) % QUIRK_NAMES.length];
}

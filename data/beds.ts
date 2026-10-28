// Bed tiles for the night cycle, keyed by character name. Move them
// freely, but they must be walkable tiles on the map (data/gentle.js).
export const BEDS: Record<string, { x: number; y: number }> = {
  // West tent: Bob sleeps alone.
  Bob: { x: 10, y: 10 },
  // East tent, around the campfire.
  Lucky: { x: 43, y: 10 },
  Alice: { x: 47, y: 10 },
  Stella: { x: 44, y: 12 },
  Pete: { x: 46, y: 12 },
};

// Characters without a named bed take one of these, in agent order.
export const SPARE_BEDS = [
  { x: 43, y: 7 },
  { x: 47, y: 7 },
  { x: 45, y: 13 },
  { x: 49, y: 10 },
];

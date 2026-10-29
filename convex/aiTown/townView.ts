import { FIELDS, HOUSES, PLAZA } from '../../data/town';
import { eraOf } from './eras';
import { Structure, structureSpot } from './project';

// The townspeople's bird's-eye picture of their town, worked out from the map
// (no LLM): where things are around the plaza, which sides are crowded or still
// bare, and how good it all looks. It goes into building proposals (so they
// choose what and where with the whole town in mind), into conversations as one
// line, and onto the toolbar as a beauty score.

export const DIRECTIONS = [
  'east',
  'south-east',
  'south',
  'south-west',
  'west',
  'north-west',
  'north',
  'north-east',
] as const;
export type Direction = (typeof DIRECTIONS)[number];

export const PLAZA_CENTER = { x: PLAZA.x + PLAZA.w / 2, y: PLAZA.y + PLAZA.h / 2 };

export function directionOf(p: { x: number; y: number }): Direction {
  const angle = Math.atan2(p.y - PLAZA_CENTER.y, p.x - PLAZA_CENTER.x);
  const i = Math.round(angle / (Math.PI / 4));
  return DIRECTIONS[(i + 8) % 8];
}

export function placeOf(p: { x: number; y: number }): string {
  const d = Math.hypot(p.x - PLAZA_CENTER.x, p.y - PLAZA_CENTER.y);
  if (d < 3.5) return 'on the plaza';
  if (d < 6) return `right by the plaza, ${directionOf(p)} side`;
  const dir = directionOf(p);
  if (d < 13) return `just ${dir} of the plaza`;
  if (d < 22) return `on the ${dir} edge of town`;
  return `far out to the ${dir}`;
}

// Things built for their own sake: they make the town lovelier.
const DECORATIVE =
  /garden|fountain|park|statue|monument|memorial|pond|flower|tree|grove|arch|gazebo|bench|lantern|mural|sculpture|square|promenade|orchard|bandstand|shrine|obelisk|plaza|bridge|tower|observatory/i;
export const isDecorative = (s: { kind: string; name: string }) =>
  s.kind === 'statue' || DECORATIVE.test(s.name);

export type TownLooks = {
  // 0–100.
  beauty: number;
  // Short phrases on how it looks, best first.
  notes: string[];
  // Sides of town with the least built on them.
  bare: Direction[];
};

export function townLooks(structures: Structure[]): TownLooks {
  const spots = structures.map((s) => ({ s, p: structureSpot(s) }));
  const perSide = new Map<Direction, number>(DIRECTIONS.map((d) => [d, 0]));
  for (const { p } of spots) {
    if (Math.hypot(p.x - PLAZA_CENTER.x, p.y - PLAZA_CENTER.y) >= 6) {
      perSide.set(directionOf(p), perSide.get(directionOf(p))! + 1);
    }
  }
  const decorative = structures.filter(isDecorative).length;
  const useful = structures.length - decorative;
  const sidesUsed = [...perSide.values()].filter((n) => n > 0).length;
  let crowded = 0;
  for (let i = 0; i < spots.length; i++) {
    for (let j = i + 1; j < spots.length; j++) {
      const { p: a } = spots[i];
      const { p: b } = spots[j];
      if (Math.hypot(a.x - b.x, a.y - b.y) < 5) crowded++;
    }
  }

  // Charm: lovely things, balanced with useful ones. Balance: built on many
  // sides, not piled on one. Breathing room: few buildings jammed together.
  const charm = Math.min(40, decorative * 12 + Math.min(useful, decorative + 1) * 4);
  const balance = structures.length === 0 ? 10 : Math.min(30, sidesUsed * 6);
  const room = Math.max(0, 20 - crowded * 6);
  const beauty = Math.round(Math.min(100, 10 + charm + balance + room));

  const notes: string[] = [];
  if (structures.length === 0) notes.push('still just homes and fields around a bare plaza');
  else if (decorative === 0) notes.push('practical, but with nothing built just for beauty');
  else if (decorative > useful + 1) notes.push('pretty, though short on useful buildings');
  else notes.push('a pleasing mix of useful and lovely buildings');
  const busiest = [...perSide.entries()].sort((a, b) => b[1] - a[1])[0];
  if (structures.length >= 3 && busiest[1] >= structures.length * 0.6) {
    notes.push(`lopsided, with most building on the ${busiest[0]} side`);
  }
  if (crowded > 0) notes.push('a little cramped where buildings stand close together');
  const bare = DIRECTIONS.filter((d) => perSide.get(d) === 0);
  return { beauty, notes, bare };
}

// The full picture, for deciding what to build next and where.
export function birdsEyeView(world: { era?: number; structures?: Structure[] }): string {
  const structures = world.structures ?? [];
  const looks = townLooks(structures);
  const north = HOUSES.filter((h) => h.y < PLAZA.y).length;
  const south = HOUSES.length - north;
  const lines = [
    `Seen from above (${eraOf(world.era).name} era): the plaza is the heart of town, with ` +
      `${north} homes along the lanes to the north and ${south} to the south, ` +
      `farm fields to the ${directionOf({ x: FIELDS[0].x + 4, y: FIELDS[0].y + 2 })}, ` +
      'windmills, a river and woods out west, and a camp by the trees further west.',
  ];
  for (const s of structures) {
    lines.push(`- ${s.name}: ${placeOf(structureSpot(s))}`);
  }
  lines.push(
    `How it looks: ${looks.notes.join('; ')} (beauty ${looks.beauty}/100).` +
      (looks.bare.length > 0 ? ` Nothing built yet to the ${looks.bare.join(', ')}.` : ''),
  );
  return lines.join('\n');
}

// One line for conversations: what they think of how their town looks.
export function townLooksLine(structures: Structure[]): string {
  const looks = townLooks(structures);
  const feel =
    looks.beauty >= 75
      ? 'People are proud of how lovely the town looks'
      : looks.beauty >= 50
        ? 'The town is shaping up nicely, and people have ideas to make it lovelier'
        : 'People wish the town looked nicer';
  return ` ${feel}: ${looks.notes[0]}.`;
}

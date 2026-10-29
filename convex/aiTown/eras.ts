// The ages the town moves through. `style` is added to every art prompt in that
// era; `house` is what homes are redrawn as when the era begins (two variants);
// `ideas` nudges what townspeople propose to build.
export const ERAS = [
  {
    name: 'Village',
    emoji: '🛖',
    blurb:
      'a small farming village of wooden huts and dirt paths, where everything is done by hand',
    style: 'rustic medieval village style, wood and thatch',
    house: null,
    ideas: 'a well, a bakery, a barn, a chapel, a blacksmith, a watchtower',
  },
  {
    name: 'Town',
    emoji: '🏘️',
    blurb:
      'a growing market town of stone and timber, with craftsmen, a market and the first schools',
    style: 'late medieval stone and timber style',
    house: 'a two-story timber-framed town house with a red tiled roof',
    ideas: 'a market hall, a school, a library, a stone bridge, a clock tower, an inn',
  },
  {
    name: 'Industrial',
    emoji: '🏭',
    blurb: 'an industrial town of red brick, steam engines, factories and the railway',
    style: 'victorian industrial style, red brick, iron and steam',
    house: 'a red brick victorian terraced house with a tall chimney',
    ideas: 'a factory, a train station, a steam mill, a gas-lit post office, a printing press',
  },
  {
    name: 'Modern',
    emoji: '🏙️',
    blurb: 'a modern town with electricity, cars, phones, the internet and supermarkets',
    style: 'modern contemporary style, concrete, glass and steel',
    house: 'a modern suburban house with a flat roof, big glass windows and solar panels',
    ideas: 'a hospital, a supermarket, a power plant, a radio tower, a cinema, an office block',
  },
  {
    name: 'Future',
    emoji: '🤖',
    blurb: 'a futuristic town of robots, fusion power, maglev trains and flying cars',
    style: 'sleek futuristic sci-fi style, white panels and glowing blue lights',
    house: 'a sleek white futuristic dome house with glowing blue windows',
    ideas:
      'a fusion reactor, a robot factory, a maglev station, a skyport for flying cars, an AI lab',
  },
  {
    name: 'Space Age',
    emoji: '🚀',
    blurb: 'a spacefaring colony that launches rockets and builds stations among the stars',
    style: 'advanced space age sci-fi style, chrome, antennas and glowing lights',
    house: 'a sci-fi habitat pod with antennas and glowing windows',
    ideas:
      'a rocket launch pad, an orbital space station, a starship dock, a planetary observatory',
  },
] as const;

export function eraOf(index: number | undefined) {
  return ERAS[Math.min(Math.max(index ?? 0, 0), ERAS.length - 1)];
}

export const houseArtKey = (era: number, style: number) => `house:${era}:${style}`;
export const structureArtKey = (id: number) => `structure:${id}`;

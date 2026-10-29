// Brighter copies of the map and character art, made offline by
// scripts/make_vivid.py so the colour boost costs nothing per frame.
const VIVID = [
  'gentle-obj.png',
  'magecity.png',
  '32x32folk.png',
  'campfire.png',
  'gentlesparkle32.png',
  'gentlewaterfall32.png',
  'windmill.png',
];

export function vivid(url: string): string {
  const file = url.split('/').pop()!;
  return VIVID.includes(file) ? url.replace(/\.png$/, '-vivid.png') : url;
}

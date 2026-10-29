"""Generate a pixel-art sprite for AI Town, fully local.

Usage: python generate.py "<subject>" out.png [--size 96] [--seed 1]

SDXL-Turbo + the pixel-art-xl LoRA draws the subject on a flat background,
then the background is keyed out and the image is shrunk to `size` pixels
with nearest-neighbour so it matches the map's 16px tiles.
"""
import argparse
import sys

import torch
from diffusers import AutoPipelineForText2Image
from PIL import Image

p = argparse.ArgumentParser()
p.add_argument("subject")
p.add_argument("out")
p.add_argument("--size", type=int, default=96)
p.add_argument("--seed", type=int, default=1)
p.add_argument("--steps", type=int, default=4)
args = p.parse_args()

device = "mps" if torch.backends.mps.is_available() else "cpu"
pipe = AutoPipelineForText2Image.from_pretrained(
    "stabilityai/sdxl-turbo", torch_dtype=torch.float16, variant="fp16"
).to(device)
pipe.load_lora_weights("nerijs/pixel-art-xl", weight_name="pixel-art-xl.safetensors")

prompt = (
    f"pixel art, {args.subject}, single object, centered, top-down rpg game sprite, "
    "16-bit, plain solid white background, no ground, no shadow"
)
image = pipe(
    prompt=prompt,
    num_inference_steps=args.steps,
    guidance_scale=0.0,
    width=512,
    height=512,
    generator=torch.Generator("cpu").manual_seed(args.seed),
).images[0]

# Shrink with a box filter first (cleans the noisy pseudo-pixels), then key out
# everything close to the corner colour, flood-filling from the edges so light
# parts inside the object survive.
small = image.resize((args.size, args.size), Image.BOX).convert("RGBA")
px = small.load()
w, h = small.size
bg = [px[0, 0], px[w - 1, 0], px[0, h - 1], px[w - 1, h - 1]]
bg = tuple(sum(c[i] for c in bg) // 4 for i in range(3))


def is_bg(c):
    return sum(abs(c[i] - bg[i]) for i in range(3)) < 60


stack = [(x, y) for x in range(w) for y in (0, h - 1)] + [(x, y) for x in (0, w - 1) for y in range(h)]
seen = set()
while stack:
    x, y = stack.pop()
    if (x, y) in seen or not (0 <= x < w and 0 <= y < h):
        continue
    seen.add((x, y))
    if not is_bg(px[x, y]):
        continue
    px[x, y] = (0, 0, 0, 0)
    stack += [(x + 1, y), (x - 1, y), (x, y + 1), (x, y - 1)]

# Crop to the object and save.
box = small.getbbox()
if box:
    small = small.crop(box)
small.save(args.out)
image.save(args.out.replace(".png", ".raw.png"))
print("saved", args.out, small.size, file=sys.stderr)

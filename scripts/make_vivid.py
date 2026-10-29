"""Writes "-vivid" copies of the map and character art with richer colour.

Done once, offline, so the game gets the brighter look with no per-frame
filter cost (filters are expensive on phones). Run with the imagegen venv:
  ../imagegen/.venv/bin/python scripts/make_vivid.py
"""
from pathlib import Path

from PIL import Image, ImageEnhance

FILES = [
    "gentle-obj.png",
    "magecity.png",
    "32x32folk.png",
    "spritesheets/campfire.png",
    "spritesheets/gentlesparkle32.png",
    "spritesheets/gentlewaterfall32.png",
    "spritesheets/windmill.png",
]
ASSETS = Path(__file__).resolve().parent.parent / "public" / "assets"

for name in FILES:
    src = ASSETS / name
    img = Image.open(src).convert("RGBA")
    alpha = img.getchannel("A")
    rgb = img.convert("RGB")
    rgb = ImageEnhance.Color(rgb).enhance(1.3)
    rgb = ImageEnhance.Contrast(rgb).enhance(1.06)
    rgb = ImageEnhance.Brightness(rgb).enhance(1.04)
    out = rgb.convert("RGBA")
    out.putalpha(alpha)
    out.save(src.with_name(src.stem + "-vivid.png"))
    print("wrote", src.with_name(src.stem + "-vivid.png").name)

"""Local pixel-art server for AI Town. Keeps SDXL-Turbo + the pixel-art-xl LoRA
loaded and turns prompts into small transparent sprites.

Run (from the repo root):
  HF_HUB_OFFLINE=1 ../imagegen/.venv/bin/python scripts/imagegen_server.py

POST /generate  {"subject": "...", "size": 96, "seed": 1}  ->  image/png
GET  /health    ->  "ok"
"""
import io
import json
import sys
import threading
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

import torch
from diffusers import AutoPipelineForText2Image
from PIL import Image

PORT = 7861
device = "mps" if torch.backends.mps.is_available() else "cpu"
print(f"Loading models on {device}...", file=sys.stderr)
pipe = AutoPipelineForText2Image.from_pretrained(
    "stabilityai/sdxl-turbo", torch_dtype=torch.float16, variant="fp16"
).to(device)
pipe.load_lora_weights("nerijs/pixel-art-xl", weight_name="pixel-art-xl.safetensors")
lock = threading.Lock()


def generate(subject: str, size: int, seed: int) -> bytes:
    prompt = (
        f"pixel art, {subject}, single object, centered, rpg game sprite, "
        "16-bit, plain solid white background, no ground, no shadow"
    )
    with lock:
        image = pipe(
            prompt=prompt,
            num_inference_steps=4,
            guidance_scale=0.0,
            width=512,
            height=512,
            generator=torch.Generator("cpu").manual_seed(seed),
        ).images[0]
    # Box-filter down (cleans the noisy pseudo-pixels), then flood-fill the
    # background away from the edges so light parts inside the object survive.
    small = image.resize((size, size), Image.BOX).convert("RGBA")
    px = small.load()
    w, h = small.size
    corners = [px[0, 0], px[w - 1, 0], px[0, h - 1], px[w - 1, h - 1]]
    bg = tuple(sum(c[i] for c in corners) // 4 for i in range(3))
    stack = [(x, y) for x in range(w) for y in (0, h - 1)]
    stack += [(x, y) for x in (0, w - 1) for y in range(h)]
    seen = set()
    while stack:
        x, y = stack.pop()
        if (x, y) in seen or not (0 <= x < w and 0 <= y < h):
            continue
        seen.add((x, y))
        c = px[x, y]
        if sum(abs(c[i] - bg[i]) for i in range(3)) >= 60:
            continue
        px[x, y] = (0, 0, 0, 0)
        stack += [(x + 1, y), (x - 1, y), (x, y + 1), (x, y - 1)]
    box = small.getbbox()
    if box:
        small = small.crop(box)
    out = io.BytesIO()
    small.save(out, "PNG")
    return out.getvalue()


class Handler(BaseHTTPRequestHandler):
    def do_GET(self):
        self.send_response(200 if self.path == "/health" else 404)
        self.end_headers()
        self.wfile.write(b"ok")

    def do_POST(self):
        if self.path != "/generate":
            self.send_response(404)
            self.end_headers()
            return
        try:
            body = json.loads(self.rfile.read(int(self.headers["Content-Length"])))
            subject = str(body["subject"])[:300]
            size = max(16, min(int(body.get("size", 96)), 256))
            png = generate(subject, size, int(body.get("seed", 1)))
        except Exception as e:  # report, don't crash the server
            self.send_response(500)
            self.end_headers()
            self.wfile.write(str(e).encode())
            return
        self.send_response(200)
        self.send_header("Content-Type", "image/png")
        self.end_headers()
        self.wfile.write(png)

    def log_message(self, fmt, *args):
        print(fmt % args, file=sys.stderr)


print(f"Pixel-art server on http://127.0.0.1:{PORT}", file=sys.stderr)
ThreadingHTTPServer(("127.0.0.1", PORT), Handler).serve_forever()

#!/usr/bin/env python3
"""Render a terminal-style demo GIF for config2mcp using Pillow only."""
from PIL import Image, ImageDraw, ImageFont
import os

W, H = 880, 560
FPS_MS = 900          # frame duration
TYPE_MS = 55          # per-char typing frame duration
BG = (13, 17, 23)
FG = (230, 237, 243)
GREEN = (63, 185, 80)
CYAN = (56, 139, 253)
GRAY = (139, 148, 158)
YELLOW = (210, 153, 34)

FONT_PATHS = [
    "/System/Library/Fonts/SFNSMono.ttf",
    "/System/Library/Fonts/Menlo.ttc",
    "/System/Library/Fonts/Monaco.ttf",
]

def load_font(size=15):
    for p in FONT_PATHS:
        if os.path.exists(p):
            try:
                return ImageFont.truetype(p, size)
            except Exception:
                continue
    return ImageFont.load_default()

font = load_font(15)
fontb = load_font(16)

PROMPT = "$ "
script = [
    # (kind, text)  kind: cmd=text typed after prompt, out=plain output line,
    #                ok=green, head=yellow comment, dim=gray
    ("head", "# 1. describe your CLI in one YAML file"),
    ("cmd",  "cat ffmpeg.yaml"),
    ("out",  "prefix: ffmpeg"),
    ("out",  "tools:"),
    ("out",  "  - name: probe"),
    ("out",  "    description: Probe a media file, return JSON"),
    ("out",  "    command: ffprobe"),
    ("out",  "    params:"),
    ("out",  "      - name: input"),
    ("out",  "        positional: true"),
    ("out",  "        required: true"),
    ("", ""),
    ("head", "# 2. see what your agent gets"),
    ("cmd",  "config2mcp inspect ffmpeg.yaml"),
    ("out",  "ffmpeg_probe  →  ffprobe -print_format json ..."),
    ("out",  "    input: string (required)"),
    ("", ""),
    ("head", "# 3. serve it — any MCP client can use it now"),
    ("cmd",  "config2mcp serve ffmpeg.yaml"),
    ("ok",   "✓ MCP server ready: 3 tools on stdio"),
    ("", ""),
    ("head", "# 4. agent calls the tool (Claude / Cursor / ...)"),
    ("dim",  '> tools/call ffmpeg_probe { "input": "clip.mp4" }'),
    ("ok",   '{"streams": [{"codec": "h264", "duration": "42.0"}]}'),
]

def color_for(kind):
    return {"ok": GREEN, "head": YELLOW, "dim": GRAY}.get(kind, FG)

def draw_frame(lines, cursor_line=None, cursor_col=0):
    img = Image.new("RGB", (W, H), BG)
    d = ImageDraw.Draw(img)
    # title bar
    d.rounded_rectangle([6, 6, W - 6, 34], 6, fill=(22, 27, 34))
    for i, c in enumerate([(255, 95, 86), (255, 189, 46), (39, 201, 63)]):
        d.ellipse([20 + i * 22, 15, 32 + i * 22, 27], fill=c)
    d.text((W // 2 - 60, 12), "terminal — config2mcp", font=font, fill=GRAY)
    y = 52
    for (kind, text, is_prompt) in lines:
        x = 16
        if is_prompt:
            d.text((x, y), PROMPT, font=font, fill=GREEN)
            x += d.textlength(PROMPT, font=font)
        d.text((x, y), text, font=font, fill=color_for(kind))
        y += 24
    if cursor_line is not None:
        y = 52 + cursor_line * 24
        x = 16 + d.textlength(PROMPT, font=font) + d.textlength(script_cursor_text, font=font)
        d.rectangle([x + 1, y + 2, x + 9, y + 18], fill=FG)
    return img

frames = []
visible = []          # list of (kind, text, is_prompt)
script_cursor_text = ""

for entry in script:
    kind, text = entry
    if kind == "cmd":
        # typing animation for commands
        for i in range(1, len(text) + 1):
            script_cursor_text = text[:i]
            visible.append((kind, text[:i], True))
            frames.append(draw_frame(visible, cursor_line=len(visible) - 1))
            visible.pop()
        # settle: full command, no cursor
        visible.append((kind, text, True))
        frames.append(draw_frame(visible))
        script_cursor_text = ""
    else:
        visible.append((kind, text, False))
        frames.append(draw_frame(visible))
        # extra beat after important lines
        if kind in ("ok", "head"):
            f = draw_frame(visible)
            frames.append(f)

# hold the final frame a bit longer
frames += [frames[-1]] * 6

out = os.path.join(os.path.dirname(__file__), "..", "docs", "demo.gif")
os.makedirs(os.path.dirname(out), exist_ok=True)
frames[0].save(
    out,
    save_all=True,
    append_images=frames[1:],
    duration=TYPE_MS if len(frames) > 10 else FPS_MS,
    loop=0,
    optimize=True,
)
print(f"wrote {out} with {len(frames)} frames")

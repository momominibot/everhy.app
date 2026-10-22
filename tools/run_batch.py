#!/usr/bin/env python3
"""One guarded Seedream 5 pro run for the cosy bedroom art.

Single lock, skips finished items, no retries, stops the whole batch on the
first provider failure and persists a block that a later run refuses to pass.
"""
import json, os, subprocess, sys, time
from pathlib import Path
from PIL import Image

ROOT = Path(__file__).resolve().parents[1]
RT = ROOT
OUT = ROOT / "art"
GEN = Path(os.environ.get("COSY_GEN") or Path.home() / "Doubao/chats/2026-10-16/new-chat-12/ovumind/tools/art/gen.py")
LOCK, BLOCK, LOG = OUT / "RUN.lock", OUT / "BLOCKED.json", OUT / "run.log"
KEYS = {"green": (0, 255, 0), "blue": (0, 0, 255)}
STYLE = ("in the cosy Animal Crossing New Horizons 3D style: soft rounded chunky "
         "shapes, smooth matte clay-like materials, gentle warm lighting, pastel "
         "pink, cream, lilac and honey wood, tiny cute details")
BAD = ("error", "limit", "quota", "rate", "credit", "unauthor", "forbidden",
       "insufficient", "timeout", "timed out", "traceback")

TEXTURES = [
    {"id": "floor", "size": "1024x1024", "prompt": "Seamless tileable texture of "
     "warm honey wooden floorboards seen straight from above, planks running "
     "vertically, " + STYLE + ". Fills the frame edge to edge, even lighting, "
     "no objects, no shadows, no border, no text."},
    {"id": "wall", "size": "1024x1024", "prompt": "Seamless horizontally "
     "tileable bedroom wall seen straight on: lower third white wooden beadboard "
     "wainscot with a rounded rail, upper part soft pink wallpaper with tiny "
     "lilac and cream flowers, " + STYLE + ". Fills the frame edge to edge, even "
     "lighting, no furniture, no window, no text."},
]


def ref_for(item):
    src = Image.open(RT / item["src"]).convert("RGBA")
    scale = max(1, 768 // max(src.size))
    src = src.resize((src.width * scale, src.height * scale), Image.NEAREST)
    canvas = Image.new("RGBA", (1024, 1024), KEYS[item["key"]] + (255,))
    canvas.alpha_composite(src, ((1024 - src.width) // 2, (1024 - src.height) // 2))
    path = OUT / "refs" / f"{item['id']}.png"
    canvas.convert("RGB").save(path)
    return path


def prompt_for(item):
    key = "pure bright green #00FF00" if item["key"] == "green" else "pure bright blue #0000FF"
    return (f"Redraw this pixel-art {item['what']} {STYLE}. Keep the same front "
            "three-quarter view, proportions and layout as the reference. One object, "
            "centred, fully visible, no floor, no cast shadow, no text. "
            f"Solid flat {key} background.")


def log(msg):
    with open(LOG, "a") as f:
        f.write(time.strftime("%H:%M:%S ") + msg + "\n")
    print(msg, flush=True)


def main():
    if BLOCK.exists():
        sys.exit("BLOCKED: " + BLOCK.read_text())
    try:
        fd = os.open(LOCK, os.O_CREAT | os.O_EXCL | os.O_WRONLY)
    except FileExistsError:
        sys.exit("another run holds the lock")
    os.write(fd, str(os.getpid()).encode()); os.close(fd)
    try:
        jobs = []
        if len(sys.argv) > 1:  # a jobs file: [{id, size, prompt, ref?}]
            for j in json.loads(Path(sys.argv[1]).read_text()):
                jobs.append((j["id"], j["size"], j["prompt"], ROOT / j["ref"] if j.get("ref") else None))
        else:
            for item in json.loads((ROOT / "tools/cosy/items.json").read_text()):
                jobs.append((item["id"], item["size"], prompt_for(item), ref_for(item)))
            jobs += [(t["id"], t["size"], t["prompt"], None) for t in TEXTURES]
        for jid, size, prompt, ref in jobs:
            out = OUT / "raw" / f"{jid}.png"
            if out.exists():
                log(f"skip {jid}"); continue
            cmd = [sys.executable, str(GEN), "--out", str(out), "--size", size,
                   "--retries", "0", "--url", "--seed", "77"]
            if ref:
                cmd += ["--ref", str(ref)]
            t0 = time.time()
            p = subprocess.run(cmd + [prompt], capture_output=True, text=True,
                               timeout=150)
            try:
                said = json.loads(p.stdout.strip().splitlines()[-1]).get("out")
            except (ValueError, IndexError, AttributeError):
                said = None
            ok = (p.returncode == 0 and out.exists() and said == str(out)
                  and not any(b in p.stderr.lower() for b in BAD))
            log(f"{jid} rc={p.returncode} {time.time()-t0:.0f}s ok={ok}")
            if not ok:
                BLOCK.write_text(json.dumps({"item": jid, "rc": p.returncode,
                    "stdout": p.stdout[-800:], "stderr": p.stderr[-800:],
                    "at": time.ctime()}, indent=1))
                if out.exists():
                    out.rename(out.with_suffix(".suspect.png"))
                sys.exit(f"stopped at {jid}; see BLOCKED.json")
        log("batch complete")
    finally:
        LOCK.unlink(missing_ok=True)


if __name__ == "__main__":
    main()

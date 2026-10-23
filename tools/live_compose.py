#!/usr/bin/env python3
"""Turn a Seedance clip of a plate into a living plate: live_compose.py <clip.mp4> <mask.png> <plate.png> <out.mp4>.
Crossfade-loops the clip (0.6 s overlap, so the last frame equals the first), scales it to the plate, and lays it
over the still plate through the soft mask, so every pixel outside the mask is the painting. Writes <out>.mp4 (H.264)
and <out>.webm (VP9), then prints the mean difference from the plate outside and inside the mask for four frames:
outside should be about 2 (codec) and constant; inside clearly higher."""
import subprocess, sys, tempfile
from pathlib import Path
import numpy as np
from PIL import Image
clip, mask, plate, out = map(Path, sys.argv[1:5]); W, H = Image.open(plate).size
tmp = Path(tempfile.mkdtemp()) / 'loop.mp4'
dur = float(subprocess.check_output(['ffprobe', '-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', clip]).strip())
X = 0.6; off = round(dur - 2 * X, 3)
subprocess.run(['ffmpeg', '-v', 'error', '-y', '-i', clip, '-filter_complex',
    f'[0:v]split[a][b];[a]trim={X}:{dur},setpts=PTS-STARTPTS,scale={W}:{H}:flags=lanczos[a1];[b]trim=0:{X},setpts=PTS-STARTPTS,scale={W}:{H}:flags=lanczos[b1];[a1][b1]xfade=transition=fade:duration={X}:offset={off}[loop]',
    '-map', '[loop]', '-c:v', 'libx264', '-preset', 'medium', '-crf', '18', '-pix_fmt', 'yuv420p', '-r', '24', tmp], check=True)
L = float(subprocess.check_output(['ffprobe', '-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', tmp]).strip()); frames = int(round(L * 24))
common = ['-i', str(tmp), '-loop', '1', '-framerate', '24', '-t', f'{L:.3f}', '-i', str(mask), '-loop', '1', '-framerate', '24', '-t', f'{L:.3f}', '-i', str(plate),
          '-filter_complex', '[1:v]format=gray[m];[0:v][m]alphamerge[va];[2:v]format=rgb24[p];[p][va]overlay=0:0:shortest=1,format=yuv420p[out]', '-map', '[out]', '-frames:v', str(frames), '-r', '24', '-an']
subprocess.run(['ffmpeg', '-v', 'error', '-y'] + common + ['-c:v', 'libx264', '-preset', 'medium', '-crf', '19', '-movflags', '+faststart', str(out)], check=True)
subprocess.run(['ffmpeg', '-v', 'error', '-y', '-i', str(out), '-c:v', 'libvpx-vp9', '-b:v', '0', '-crf', '30', '-row-mt', '1', '-pix_fmt', 'yuv420p', '-an', str(out.with_suffix('.webm'))], check=True)
P = np.asarray(Image.open(plate).convert('RGB')).astype(int); M = np.asarray(Image.open(mask).convert('L'))
def frame(src, t):
    f = tmp.parent / f'f{t}.png'; subprocess.run(['ffmpeg', '-v', 'error', '-y', '-ss', str(t), '-i', str(src), '-frames:v', '1', str(f)], check=True)
    return np.asarray(Image.open(f).convert('RGB')).astype(int)
for t in [0.05, L * 0.33, L * 0.66, L - 0.1]:
    D = np.abs(frame(out, round(t, 2)) - P).mean(axis=2); print(f't={t:.2f}s  outside mask {D[M < 8].mean():.2f}  inside {D[M > 200].mean():.2f}')
print('loop seam first vs last', round(float(np.abs(frame(out, 0.05) - frame(out, L - 0.1)).mean()), 2), '| mp4', out.stat().st_size // 1024, 'KB  webm', out.with_suffix('.webm').stat().st_size // 1024, 'KB  frames', frames)

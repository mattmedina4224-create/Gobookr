"""Render a captioned 30-second still-capture demo; requires ffmpeg and four real captures."""
import argparse
import subprocess
import tempfile
from pathlib import Path

parser = argparse.ArgumentParser()
parser.add_argument("capture_dir", type=Path)
parser.add_argument("output", type=Path)
args = parser.parse_args()
shots = [
    ("home", "Choose a service and a city", "Find personal-service professionals near you."),
    ("search", "Browse local profiles", "Actual results for massage therapists in Fort Collins."),
    ("profile", "Explore a profile and its booking link", "Booking continues with the professional's provider."),
    ("claim", "Already listed? Start a claim", "Sign up or log in to begin the ownership review."),
]
font = "/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf"
args.output.parent.mkdir(parents=True, exist_ok=True)
with tempfile.TemporaryDirectory(prefix="gobookr-demo-") as work:
    work = Path(work)
    segments = []
    for index, (name, heading, caption) in enumerate(shots):
        source = args.capture_dir / f"gobookr-demo-{name}-20261004.jpg"
        if not source.is_file():
            raise SystemExit(f"Missing real capture: {source}")
        labels = [
            ("gobookr", 54, 48, 30, "0x0F172A"),
            ("Public walkthrough - still captures", 18, 820, 40, "0x475569"),
            (heading, 32, 48, 115, "0x0F172A"),
            (caption, 22, 48, 720, "0x475569"),
            (f"{index + 1} / 4     gobookr.com", 18, 48, 770, "0x475569"),
        ]
        filters = ["scale=1160:520:force_original_aspect_ratio=decrease", "pad=1280:820:(ow-iw)/2:190:color=white", "setsar=1"]
        for label_index, (label, size, x, y, color) in enumerate(labels):
            text = work / f"{index}-{label_index}.txt"
            text.write_text(label, encoding="utf-8")
            filters.append(f"drawtext=fontfile={font}:textfile={text}:fontsize={size}:fontcolor={color}:x={x}:y={y}")
        segment = work / f"{index}.mp4"
        subprocess.run(["ffmpeg", "-hide_banner", "-loglevel", "error", "-y", "-loop", "1", "-i", str(source), "-t", "7.5", "-vf", ",".join(filters), "-r", "24", "-c:v", "libx264", "-preset", "fast", "-crf", "20", "-pix_fmt", "yuv420p", str(segment)], check=True)
        segments.append(segment)
    manifest = work / "segments.txt"
    manifest.write_text("".join(f"file '{segment}'\n" for segment in segments))
    subprocess.run(["ffmpeg", "-hide_banner", "-loglevel", "error", "-y", "-f", "concat", "-safe", "0", "-i", str(manifest), "-f", "lavfi", "-i", "anullsrc=r=48000:cl=stereo", "-map", "0:v", "-map", "1:a", "-c:v", "copy", "-c:a", "aac", "-b:a", "96k", "-t", "30", "-movflags", "+faststart", str(args.output)], check=True)
print(args.output)

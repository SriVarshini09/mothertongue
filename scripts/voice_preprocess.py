#!/usr/bin/env python3
"""Convert consented browser captures to auditable 16 kHz mono WAV files.

This script is intentionally local-only. It uses an installed FFmpeg binary and
writes ignored outputs under data/voice/processed/.
"""

from __future__ import annotations

import argparse
import hashlib
import json
import subprocess
import sys
import wave
from pathlib import Path
from typing import Any


PROJECT_ROOT = Path(__file__).resolve().parents[1]
DEFAULT_DATA_ROOT = PROJECT_ROOT / "data" / "voice"


def safe_join(root: Path, relative: str) -> Path:
    """Resolve a relative dataset path and reject traversal or absolute paths."""

    base = root.resolve()
    candidate = (base / Path(relative)).resolve()
    try:
        candidate.relative_to(base)
    except ValueError as exc:
        raise ValueError(f"path escapes data root: {relative}") from exc
    return candidate


def sha256_file(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for chunk in iter(lambda: handle.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def convert_with_ffmpeg(ffmpeg: str, source: Path, target: Path) -> None:
    target.parent.mkdir(parents=True, exist_ok=True)
    command = [
        ffmpeg,
        "-hide_banner",
        "-loglevel",
        "error",
        "-y",
        "-i",
        str(source),
        "-vn",
        "-ac",
        "1",
        "-ar",
        "16000",
        "-c:a",
        "pcm_s16le",
        str(target),
    ]
    completed = subprocess.run(command, capture_output=True, text=True, check=False)
    if completed.returncode != 0:
        detail = completed.stderr.strip() or "FFmpeg returned a non-zero exit code"
        raise RuntimeError(detail)


def verify_wav(path: Path) -> None:
    with wave.open(str(path), "rb") as handle:
        if handle.getnchannels() != 1:
            raise RuntimeError(f"{path.name} is not mono")
        if handle.getframerate() != 16000:
            raise RuntimeError(f"{path.name} is not 16000 Hz")
        if handle.getsampwidth() != 2:
            raise RuntimeError(f"{path.name} is not signed 16-bit PCM")
        if handle.getnframes() == 0:
            raise RuntimeError(f"{path.name} contains no audio frames")


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--manifest", default=str(DEFAULT_DATA_ROOT / "manifest.json"))
    parser.add_argument("--data-root", default=str(DEFAULT_DATA_ROOT))
    parser.add_argument("--raw-root", default=None, help="Defaults to <data-root>/raw")
    parser.add_argument("--output-root", default=None, help="Defaults to <data-root>/processed")
    parser.add_argument("--output-manifest", default=None, help="Defaults to <output-root>/manifest.json")
    parser.add_argument("--ffmpeg", default="ffmpeg", help="FFmpeg executable name or absolute path")
    return parser.parse_args()


def main() -> int:
    args = parse_args()
    data_root = Path(args.data_root).resolve()
    raw_root = Path(args.raw_root).resolve() if args.raw_root else data_root / "raw"
    output_root = Path(args.output_root).resolve() if args.output_root else data_root / "processed"
    manifest_path = Path(args.manifest).resolve()
    output_manifest = Path(args.output_manifest).resolve() if args.output_manifest else output_root / "manifest.json"

    try:
        data_root.relative_to(PROJECT_ROOT)
        raw_root.relative_to(data_root)
        output_root.relative_to(data_root)
        output_manifest.relative_to(output_root)
    except ValueError as exc:
        print(f"VOICE_PREPROCESS_FAIL unsafe dataset path: {exc}", file=sys.stderr)
        return 1

    try:
        manifest = json.loads(manifest_path.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError) as exc:
        print(f"VOICE_PREPROCESS_FAIL cannot read manifest: {exc}", file=sys.stderr)
        return 1

    clips = manifest.get("clips")
    if not isinstance(clips, list):
        print("VOICE_PREPROCESS_FAIL manifest.clips must be an array", file=sys.stderr)
        return 1

    processed: list[dict[str, Any]] = []
    errors: list[str] = []
    output_paths: set[Path] = set()

    for clip in clips:
        clip_id = str(clip.get("id", "<unknown>"))
        audio_path = str(clip.get("audioPath", ""))
        try:
            source = safe_join(raw_root, audio_path)
            if not source.exists():
                raise FileNotFoundError(f"missing source audio {audio_path}")
            relative_audio = Path(audio_path.replace("\\", "/"))
            target = safe_join(output_root, relative_audio.with_suffix(".wav").as_posix())
            if target in output_paths:
                raise ValueError(f"duplicate output path {target}")
            output_paths.add(target)
            convert_with_ffmpeg(args.ffmpeg, source, target)
            verify_wav(target)
            converted = dict(clip)
            converted["audioPath"] = target.relative_to(data_root).as_posix()
            converted["sha256"] = sha256_file(target)
            processed.append(converted)
            print(f"PREPROCESSED {clip_id} -> {converted['audioPath']}")
        except (OSError, ValueError, RuntimeError) as exc:
            errors.append(f"{clip_id}: {exc}")

    if errors:
        for error in errors:
            print(f"FAIL {error}", file=sys.stderr)
        print(f"VOICE_PREPROCESS_FAIL clips={len(clips)} errors={len(errors)}", file=sys.stderr)
        return 1

    output_manifest.parent.mkdir(parents=True, exist_ok=True)
    output = dict(manifest)
    output["sampleRateHz"] = 16000
    output["channels"] = 1
    output["clips"] = processed
    output_manifest.write_text(json.dumps(output, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
    print(f"VOICE_PREPROCESS_OK clips={len(processed)} manifest={output_manifest}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())

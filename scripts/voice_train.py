#!/usr/bin/env python3
"""Train a small, portable emotion-style baseline from processed WAV clips.

The model is a transparent nearest-centroid classifier over aggregated acoustic
features. It is deliberately not a voice-cloning or TTS model. All processing
is local and the model is exported as JSON so a future offline app runtime can
consume it without Python or a hosted service.
"""

from __future__ import annotations

import argparse
import hashlib
import json
import math
import sys
import wave
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

try:
    import numpy as np
except ImportError as exc:  # pragma: no cover - environment guidance
    print("VOICE_TRAIN_FAIL NumPy is required. Install it in the local training environment.", file=sys.stderr)
    raise SystemExit(1) from exc


PROJECT_ROOT = Path(__file__).resolve().parents[1]
DEFAULT_DATA_ROOT = PROJECT_ROOT / "data" / "voice"
BASE_FEATURES = [
    "log_rms",
    "zero_crossing_rate",
    "spectral_centroid",
    "spectral_bandwidth",
    "spectral_rolloff",
    *[f"mfcc_{index}" for index in range(13)],
]
FEATURE_NAMES = (
    [f"{name}_mean" for name in BASE_FEATURES]
    + [f"{name}_std" for name in BASE_FEATURES]
    + ["duration_log"]
)


def safe_join(root: Path, relative: str) -> Path:
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


def read_wav(path: Path) -> tuple[np.ndarray, int]:
    with wave.open(str(path), "rb") as handle:
        channels = handle.getnchannels()
        sample_rate = handle.getframerate()
        sample_width = handle.getsampwidth()
        frame_count = handle.getnframes()
        if channels != 1 or sample_rate != 16000 or sample_width != 2:
            raise ValueError(f"{path.name} must be 16 kHz mono signed 16-bit PCM")
        raw = handle.readframes(frame_count)
    if not raw:
        raise ValueError(f"{path.name} contains no audio")
    return np.frombuffer(raw, dtype="<i2").astype(np.float32) / 32768.0, sample_rate


def mel_filterbank(sample_rate: int, n_fft: int, n_mels: int = 26) -> np.ndarray:
    def hz_to_mel(value: float) -> float:
        return 2595.0 * math.log10(1.0 + value / 700.0)

    def mel_to_hz(value: float) -> float:
        return 700.0 * (10.0 ** (value / 2595.0) - 1.0)

    minimum = hz_to_mel(0.0)
    maximum = hz_to_mel(sample_rate / 2.0)
    points = np.linspace(minimum, maximum, n_mels + 2)
    bins = np.floor((n_fft + 1) * np.array([mel_to_hz(point) for point in points]) / sample_rate).astype(int)
    filters = np.zeros((n_mels, n_fft // 2 + 1), dtype=np.float32)
    for index in range(1, n_mels + 1):
        left, center, right = int(bins[index - 1]), int(bins[index]), int(bins[index + 1])
        center = max(center, left + 1)
        right = max(right, center + 1)
        for position in range(left, min(center, filters.shape[1])):
            filters[index - 1, position] = (position - left) / max(1, center - left)
        for position in range(center, min(right, filters.shape[1])):
            filters[index - 1, position] = (right - position) / max(1, right - center)
    return filters


def extract_features(audio: np.ndarray, sample_rate: int) -> np.ndarray:
    frame_size = max(1, int(sample_rate * 0.025))
    hop_size = max(1, int(sample_rate * 0.010))
    n_fft = 512
    frame_count = max(1, 1 + math.ceil(max(0, len(audio) - frame_size) / hop_size))
    padded_size = frame_size + (frame_count - 1) * hop_size
    padded = np.pad(audio, (0, max(0, padded_size - len(audio))))
    frames = np.stack([padded[start : start + frame_size] for start in range(0, padded_size - frame_size + 1, hop_size)])
    windowed = frames * np.hamming(frame_size)
    power = np.abs(np.fft.rfft(windowed, n=n_fft)) ** 2
    frequencies = np.fft.rfftfreq(n_fft, 1.0 / sample_rate)
    total_power = np.maximum(power.sum(axis=1), 1e-12)
    rms = np.sqrt(np.mean(frames * frames, axis=1) + 1e-10)
    zero_crossing_rate = np.mean(np.diff(np.signbit(frames), axis=1), axis=1)
    centroid = (power * frequencies).sum(axis=1) / total_power / sample_rate
    bandwidth = np.sqrt((power * (frequencies[None, :] - centroid[:, None] * sample_rate) ** 2).sum(axis=1) / total_power) / sample_rate
    cumulative = np.cumsum(power, axis=1)
    rolloff_threshold = total_power * 0.85
    rolloff_bins = np.argmax(cumulative >= rolloff_threshold[:, None], axis=1)
    rolloff = frequencies[rolloff_bins] / sample_rate

    filters = mel_filterbank(sample_rate, n_fft)
    log_mel = np.log(np.maximum(power @ filters.T, 1e-10))
    n_mels = log_mel.shape[1]
    dct_basis = np.cos(
        (np.pi / n_mels)
        * (np.arange(n_mels, dtype=np.float32)[:, None] + 0.5)
        * np.arange(13, dtype=np.float32)[None, :]
    ).T
    mfcc = log_mel @ dct_basis.T

    frame_features = np.column_stack([
        np.log(rms),
        zero_crossing_rate,
        centroid,
        bandwidth,
        rolloff,
        mfcc,
    ])
    summary = np.concatenate([
        frame_features.mean(axis=0),
        frame_features.std(axis=0),
        np.array([math.log1p(len(audio) / sample_rate)], dtype=np.float32),
    ])
    return np.nan_to_num(summary.astype(np.float64), nan=0.0, posinf=0.0, neginf=0.0)


def macro_f1(actual: list[str], predicted: list[str], labels: list[str]) -> float:
    scores: list[float] = []
    for label in labels:
        true_positive = sum(item == label and guess == label for item, guess in zip(actual, predicted))
        false_positive = sum(item != label and guess == label for item, guess in zip(actual, predicted))
        false_negative = sum(item == label and guess != label for item, guess in zip(actual, predicted))
        precision = true_positive / max(1, true_positive + false_positive)
        recall = true_positive / max(1, true_positive + false_negative)
        scores.append(2.0 * precision * recall / max(1e-12, precision + recall))
    return float(sum(scores) / max(1, len(scores)))


def choose_split(speakers: list[str], labels: list[str], test_fraction: float, seed: int) -> tuple[np.ndarray, np.ndarray]:
    if len(speakers) < 2:
        raise ValueError("at least two speakers are required for speaker-independent evaluation")
    speaker_array = np.array(speakers)
    label_array = np.array(labels)
    rng = np.random.default_rng(seed)
    test_speaker_count = max(1, min(len(speakers) - 1, round(len(speakers) * test_fraction)))
    for _ in range(100):
        shuffled = rng.permutation(speaker_array)
        test_speakers = set(shuffled[:test_speaker_count].tolist())
        test_mask = np.array([speaker in test_speakers for speaker in speaker_array])
        train_mask = ~test_mask
        if len(set(label_array[train_mask].tolist())) >= 2 and test_mask.any():
            return np.flatnonzero(train_mask), np.flatnonzero(test_mask)
    raise ValueError("could not create a holdout with at least two training emotion labels; add balanced speaker recordings")


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--manifest", default=str(DEFAULT_DATA_ROOT / "processed" / "manifest.json"))
    parser.add_argument("--data-root", default=str(DEFAULT_DATA_ROOT))
    parser.add_argument("--output-dir", default=str(DEFAULT_DATA_ROOT / "processed" / "model"))
    parser.add_argument("--test-fraction", type=float, default=0.25)
    parser.add_argument("--seed", type=int, default=42)
    return parser.parse_args()


def main() -> int:
    args = parse_args()
    manifest_path = Path(args.manifest).resolve()
    data_root = Path(args.data_root).resolve()
    output_dir = Path(args.output_dir).resolve()
    try:
        manifest = json.loads(manifest_path.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError) as exc:
        print(f"VOICE_TRAIN_FAIL cannot read manifest: {exc}", file=sys.stderr)
        return 1

    if manifest.get("sampleRateHz") != 16000 or manifest.get("channels") != 1:
        print("VOICE_TRAIN_FAIL manifest must be preprocessed to 16000 Hz mono first", file=sys.stderr)
        return 1
    clips = manifest.get("clips")
    if not isinstance(clips, list) or not clips:
        print("VOICE_TRAIN_FAIL manifest has no clips", file=sys.stderr)
        return 1

    records: list[dict[str, Any]] = []
    errors: list[str] = []
    for clip in clips:
        clip_id = str(clip.get("id", "<unknown>"))
        try:
            audio_path = safe_join(data_root, str(clip["audioPath"]))
            if audio_path.suffix.lower() != ".wav":
                raise ValueError("training input must be WAV; run voice:preprocess first")
            if not audio_path.exists():
                raise FileNotFoundError(f"missing audio {clip['audioPath']}")
            expected_hash = clip.get("sha256")
            actual_hash = sha256_file(audio_path)
            if expected_hash and expected_hash.lower() != actual_hash:
                raise ValueError("sha256 does not match the processed audio")
            audio, sample_rate = read_wav(audio_path)
            records.append({
                "id": clip_id,
                "language": str(clip.get("language", "")),
                "emotion": str(clip.get("emotion", "")),
                "speakerHash": str(clip.get("speakerHash", "")),
                "features": extract_features(audio, sample_rate),
            })
        except (KeyError, OSError, ValueError) as exc:
            errors.append(f"{clip_id}: {exc}")

    if errors:
        for error in errors:
            print(f"FAIL {error}", file=sys.stderr)
        print(f"VOICE_TRAIN_FAIL clips={len(clips)} errors={len(errors)}", file=sys.stderr)
        return 1

    labels = [record["emotion"] for record in records]
    speakers = [record["speakerHash"] for record in records]
    if len(set(labels)) < 2:
        print("VOICE_TRAIN_FAIL at least two emotion labels are required", file=sys.stderr)
        return 1
    if len(set(speakers)) < 2:
        print("VOICE_TRAIN_FAIL at least two speakers are required for honest evaluation", file=sys.stderr)
        return 1

    features = np.stack([record["features"] for record in records])
    train_indices, test_indices = choose_split(speakers, labels, args.test_fraction, args.seed)
    train_features = features[train_indices]
    mean = train_features.mean(axis=0)
    scale = train_features.std(axis=0)
    scale[scale < 1e-8] = 1.0
    normalized = (features - mean) / scale
    train_labels = [labels[index] for index in train_indices]
    test_labels = [labels[index] for index in test_indices]
    train_speakers = {speakers[index] for index in train_indices}
    test_speakers = {speakers[index] for index in test_indices}
    model_labels = sorted(set(train_labels))
    centroids = {
        label: normalized[train_indices[np.array([item == label for item in train_labels])]].mean(axis=0)
        for label in model_labels
    }

    centroid_matrix = np.stack([centroids[label] for label in model_labels])
    distances = ((normalized[test_indices, None, :] - centroid_matrix[None, :, :]) ** 2).sum(axis=2)
    predictions = [model_labels[index] for index in np.argmin(distances, axis=1)]
    accuracy = float(sum(actual == predicted for actual, predicted in zip(test_labels, predictions)) / max(1, len(test_labels)))
    evaluation_labels = sorted(set(labels))
    evaluation = {
        "accuracy": accuracy,
        "macroF1": macro_f1(test_labels, predictions, evaluation_labels),
        "labels": evaluation_labels,
        "testClips": len(test_indices),
        "testSpeakers": len(test_speakers),
    }

    output_dir.mkdir(parents=True, exist_ok=True)
    model = {
        "modelType": "nearest-centroid",
        "version": 1,
        "purpose": "emotion-style-baseline",
        "featureNames": FEATURE_NAMES,
        "labels": model_labels,
        "normalization": {"mean": mean.tolist(), "scale": scale.tolist()},
        "centroids": {label: centroids[label].tolist() for label in model_labels},
        "training": {
            "manifestSha256": sha256_file(manifest_path),
            "clips": len(records),
            "speakers": len(set(speakers)),
            "trainClips": len(train_indices),
            "trainSpeakers": len(train_speakers),
            "testClips": len(test_indices),
            "testSpeakers": len(test_speakers),
            "seed": args.seed,
            "createdAt": datetime.now(timezone.utc).isoformat(),
        },
    }
    (output_dir / "emotion-model.json").write_text(json.dumps(model, indent=2) + "\n", encoding="utf-8")
    (output_dir / "evaluation.json").write_text(json.dumps(evaluation, indent=2) + "\n", encoding="utf-8")
    with (output_dir / "features.jsonl").open("w", encoding="utf-8") as handle:
        for record in records:
            handle.write(json.dumps({
                "id": record["id"],
                "language": record["language"],
                "emotion": record["emotion"],
                "speakerHash": record["speakerHash"],
                "features": record["features"].tolist(),
            }) + "\n")
    report = (
        "# MotherTongue emotion-style baseline\n\n"
        "This is a local nearest-centroid classifier for delivery-style experiments. "
        "It is not a voice-cloning or TTS model.\n\n"
        f"- Clips: {len(records)}\n"
        f"- Speakers: {len(set(speakers))} (train {len(train_speakers)}, test {len(test_speakers)})\n"
        f"- Emotion labels: {', '.join(evaluation_labels)}\n"
        f"- Speaker-independent holdout accuracy: {accuracy:.3f}\n"
        f"- Speaker-independent holdout macro-F1: {evaluation['macroF1']:.3f}\n"
        f"- Model: `emotion-model.json`\n"
    )
    (output_dir / "report.md").write_text(report, encoding="utf-8")
    print(f"VOICE_TRAIN_OK clips={len(records)} speakers={len(set(speakers))} labels={len(evaluation_labels)} accuracy={accuracy:.3f} macroF1={evaluation['macroF1']:.3f}")
    print(f"VOICE_TRAIN_MODEL {output_dir / 'emotion-model.json'}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())

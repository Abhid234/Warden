"""Download Warden's model artifacts when a container starts.

Public checkpoints are downloaded from Hugging Face. The fine-tuned English
toxicity model is intentionally not assigned a fake public repository: set
WARDEN_TOXICITY_REPO_ID to the Hugging Face repo containing that checkpoint,
or mount models/toxic-bert-finetuned into the container.
"""

from __future__ import annotations

import os
from pathlib import Path

from huggingface_hub import snapshot_download


ROOT = Path(__file__).resolve().parent
MODELS = ROOT / "models"

PUBLIC_MODELS = {
    "nsfw-image-detection": "Falconsai/nsfw_image_detection",
    "semantic-filter": "sentence-transformers/all-MiniLM-L6-v2",
    "image-semantic": "openai/clip-vit-base-patch32",
    "hinglish-toxicity-classifier": "darelphilip/hinglish-toxicity-classifier",
}


def is_downloaded(path: Path) -> bool:
    return (path / "config.json").exists() and any(
        (path / filename).exists()
        for filename in ("model.safetensors", "pytorch_model.bin", "modules.json")
    )


def download(repo_id: str, destination: Path) -> None:
    if is_downloaded(destination):
        print(f"[models] already present: {destination}")
        return
    destination.mkdir(parents=True, exist_ok=True)
    print(f"[models] downloading {repo_id} -> {destination}")
    snapshot_download(
        repo_id=repo_id,
        local_dir=str(destination),
        token=os.getenv("HF_TOKEN") or None,
    )


def main() -> None:
    MODELS.mkdir(parents=True, exist_ok=True)
    if os.getenv("WARDEN_DOWNLOAD_MODELS", "1").lower() in {"0", "false", "no"}:
        print("[models] downloading disabled; using mounted/local checkpoints")
    else:
        for directory, repo_id in PUBLIC_MODELS.items():
            download(repo_id, MODELS / directory)

        toxicity_path = MODELS / "toxic-bert-finetuned"
        toxicity_repo = os.getenv("WARDEN_TOXICITY_REPO_ID", "").strip()
        if toxicity_repo:
            download(toxicity_repo, toxicity_path)

    required = [
        MODELS / "toxic-bert-finetuned",
        MODELS / "nsfw-image-detection",
        MODELS / "semantic-filter",
        MODELS / "image-semantic",
    ]
    missing = [str(path) for path in required if not is_downloaded(path)]
    if missing:
        raise RuntimeError(
            "Missing required model checkpoints: "
            + ", ".join(missing)
            + ". Mount the models directory or set WARDEN_TOXICITY_REPO_ID "
            + "for the fine-tuned toxicity checkpoint."
        )


if __name__ == "__main__":
    main()

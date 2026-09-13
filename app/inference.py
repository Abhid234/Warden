"""Local model loading and inference for the Warden API."""

from __future__ import annotations

import io
from pathlib import Path
from typing import Any

import torch
from PIL import Image
from sentence_transformers import SentenceTransformer, util
from transformers import (
    AutoImageProcessor,
    AutoModelForImageClassification,
    AutoModelForSequenceClassification,
    AutoTokenizer,
    CLIPModel,
    CLIPProcessor,
)


ROOT = Path(__file__).resolve().parents[1]
LABELS = ["toxic", "severe_toxic", "obscene", "threat", "insult", "identity_hate"]


class WardenInference:
    """Owns the local models and exposes small inference operations."""

    def __init__(self) -> None:
        self.device = torch.device("cuda" if torch.cuda.is_available() else "cpu")
        self.toxicity_path = ROOT / "models" / "toxic-bert-finetuned"
        self.nsfw_path = ROOT / "models" / "nsfw-image-detection"
        self.semantic_path = ROOT / "models" / "semantic-filter"
        self.image_semantic_path = ROOT / "models" / "image-semantic"

        self.toxicity_tokenizer: Any = None
        self.toxicity_model: Any = None
        self.image_processor: Any = None
        self.image_model: Any = None
        self.embedder: Any = None
        self.image_text_processor: Any = None
        self.image_text_model: Any = None

    def load(
        self,
        *,
        toxicity: bool = True,
        nsfw: bool = True,
        semantic: bool = True,
        image_semantic: bool = True,
    ) -> None:
        """Load requested models once during application startup."""
        if toxicity:
            self._require_model(self.toxicity_path)
            self.toxicity_tokenizer = AutoTokenizer.from_pretrained(
                self.toxicity_path, local_files_only=True
            )
            self.toxicity_model = AutoModelForSequenceClassification.from_pretrained(
                self.toxicity_path, local_files_only=True
            ).to(self.device).eval()

        if nsfw:
            self._require_model(self.nsfw_path)
            self.image_processor = AutoImageProcessor.from_pretrained(
                self.nsfw_path, local_files_only=True
            )
            self.image_model = AutoModelForImageClassification.from_pretrained(
                self.nsfw_path, local_files_only=True, use_safetensors=False
            ).to(self.device).eval()

        if semantic:
            self._require_model(self.semantic_path)
            self.embedder = SentenceTransformer(str(self.semantic_path), device=str(self.device))

        if image_semantic:
            self._require_model(self.image_semantic_path)
            self.image_text_processor = CLIPProcessor.from_pretrained(
                self.image_semantic_path, local_files_only=True
            )
            self.image_text_model = CLIPModel.from_pretrained(
                self.image_semantic_path, local_files_only=True
            ).to(self.device).eval()

    @staticmethod
    def _require_model(path: Path) -> None:
        if not path.exists():
            raise FileNotFoundError(f"Model not found: {path}")

    def score_toxicity(self, text: str, threshold: float = 0.40) -> dict[str, Any]:
        if not text.strip():
            raise ValueError("text must be non-empty")
        inputs = self.toxicity_tokenizer(
            text, return_tensors="pt", truncation=True, max_length=192
        )
        inputs = {key: value.to(self.device) for key, value in inputs.items()}
        with torch.inference_mode():
            probabilities = torch.sigmoid(self.toxicity_model(**inputs).logits[0]).cpu()
        categories = {
            label: round(float(probabilities[index]), 4)
            for index, label in enumerate(LABELS)
        }
        is_toxic = categories["toxic"] >= threshold
        return {
            "text": text,
            "toxicity_score": categories["toxic"],
            "categories": categories,
            "trigger_detail": {"type": "span", "value": text},
            "is_toxic": is_toxic,
            "action": "warn" if is_toxic else "allow",
            "message": (
                "This comment may be toxic. Please rethink it before posting."
                if is_toxic
                else "This comment is below the toxicity warning threshold."
            ),
        }

    def classify_image(self, image_bytes: bytes, filename: str, threshold: float = 0.50) -> dict[str, Any]:
        if not image_bytes:
            raise ValueError("image must not be empty")
        try:
            image = Image.open(io.BytesIO(image_bytes)).convert("RGB")
        except Exception as exc:
            raise ValueError("uploaded file is not a valid image") from exc

        inputs = self.image_processor(images=image, return_tensors="pt")
        inputs = {key: value.to(self.device) for key, value in inputs.items()}
        with torch.inference_mode():
            probabilities = torch.softmax(self.image_model(**inputs).logits[0], dim=-1).cpu()
        scores = {
            self.image_model.config.id2label[index]: round(float(probabilities[index]), 4)
            for index in range(len(probabilities))
        }
        nsfw_score = scores.get("nsfw", 0.0)
        return {
            "filename": filename,
            "nsfw_score": nsfw_score,
            "categories": scores,
            "trigger_detail": {"type": "image_region", "value": "full image"},
            "action": "blur" if nsfw_score >= threshold else "show",
        }

    @staticmethod
    def post_to_text(post: dict[str, str]) -> str:
        fields = [
            ("Title", post.get("title", "")),
            ("Caption", post.get("caption", "")),
            ("Alt text", post.get("alt_text", "")),
            ("Account", post.get("account_name", "")),
        ]
        return "\n".join(
            f"{name}: {value}" for name, value in fields if value and value.strip()
        )

    def semantic_score(
        self, preference: str, post: dict[str, str], threshold: float = 0.25
    ) -> dict[str, Any]:
        post_text = self.post_to_text(post)
        if not preference.strip() or not post_text.strip():
            raise ValueError("preference and at least one post field must be non-empty")
        embeddings = self.embedder.encode(
            [preference, post_text], convert_to_tensor=True, normalize_embeddings=True
        )
        similarity = float(util.cos_sim(embeddings[0], embeddings[1]))
        return {
            "preference": preference,
            "post_text": post_text,
            "similarity": round(similarity, 4),
            "trigger_detail": {
                "type": "embedding_match",
                "value": f"{preference} (similarity={similarity:.4f})",
            },
            "action": "hide" if similarity >= threshold else "show",
        }

    def image_semantic_score(
        self,
        image_bytes: bytes,
        preference: str,
        filename: str,
        threshold: float = 0.25,
    ) -> dict[str, Any]:
        """Compare an image directly with a user preference using shared CLIP space."""
        if not image_bytes:
            raise ValueError("image must not be empty")
        if not preference.strip():
            raise ValueError("preference must be non-empty")
        try:
            image = Image.open(io.BytesIO(image_bytes)).convert("RGB")
        except Exception as exc:
            raise ValueError("uploaded file is not a valid image") from exc

        inputs = self.image_text_processor(
            text=[preference], images=image, return_tensors="pt", padding=True
        )
        inputs = {key: value.to(self.device) for key, value in inputs.items()}
        with torch.inference_mode():
            image_output = self.image_text_model.get_image_features(
                pixel_values=inputs["pixel_values"]
            )
            text_output = self.image_text_model.get_text_features(
                input_ids=inputs["input_ids"], attention_mask=inputs["attention_mask"]
            )
            # Transformers 5 returns a pooled output object; older releases return a tensor.
            image_features = getattr(image_output, "pooler_output", image_output)
            text_features = getattr(text_output, "pooler_output", text_output)
            image_features = image_features / image_features.norm(dim=-1, keepdim=True)
            text_features = text_features / text_features.norm(dim=-1, keepdim=True)
            similarity = float((image_features @ text_features.T)[0, 0].cpu())

        similarity = round(similarity, 4)
        return {
            "filename": filename,
            "preference": preference,
            "image_similarity": similarity,
            "trigger_detail": {
                "type": "embedding_match",
                "value": f"{preference} (image similarity={similarity:.4f})",
            },
            "action": "hide" if similarity >= threshold else "show",
        }

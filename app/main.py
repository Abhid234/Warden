"""FastAPI entry point for Warden local inference."""

from __future__ import annotations

import os
from contextlib import asynccontextmanager
from pathlib import Path
from typing import Any, Annotated, Literal
from uuid import uuid4

os.environ.setdefault("KMP_DUPLICATE_LIB_OK", "TRUE")

from fastapi import FastAPI, File, Form, HTTPException, Query, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field

from .inference import WardenInference
from .ledger import Ledger


toxicity_threshold = float(os.getenv("WARDEN_TOXICITY_THRESHOLD", "0.40"))
nsfw_threshold = float(os.getenv("WARDEN_NSFW_THRESHOLD", "0.50"))
semantic_threshold = float(os.getenv("WARDEN_SEMANTIC_THRESHOLD", "0.25"))
engine = WardenInference()
ledger = Ledger(Path(__file__).resolve().parents[1] / "data" / "ledger" / "events.jsonl")


@asynccontextmanager
async def lifespan(_: FastAPI):
    engine.load()
    yield


app = FastAPI(title="Warden API", version="0.1.0", lifespan=lifespan)
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)


class TextRequest(BaseModel):
    text: str = Field(min_length=1, max_length=20_000)


class PostFields(BaseModel):
    title: str = ""
    caption: str = ""
    alt_text: str = ""
    account_name: str = ""


class SemanticRequest(BaseModel):
    preference: str = Field(min_length=1, max_length=2_000)
    post: PostFields


class LedgerEvent(BaseModel):
    event_id: str | None = None
    ts: str | None = None
    session_id: str = Field(min_length=1, max_length=200)
    post_id: str = Field(min_length=1, max_length=500)
    source: Literal["toxicity", "nsfw_image", "semantic", "prepost"]
    action: Literal["blurred", "hidden", "warned", "shown", "overridden"]
    scores: dict[str, float] = Field(default_factory=dict)
    threshold_used: float = 0.0
    trigger_detail: dict[str, str] = Field(default_factory=dict)
    user_override: dict[str, Any] | None = None


class LedgerOverride(BaseModel):
    event_id: str = Field(min_length=1)
    session_id: str = Field(min_length=1, max_length=200)


@app.get("/health")
def health() -> dict[str, str]:
    return {"status": "ok", "device": str(engine.device)}


@app.post("/toxicity")
def toxicity(request: TextRequest) -> dict:
    try:
        return engine.score_toxicity(request.text, toxicity_threshold)
    except Exception as exc:
        raise HTTPException(status_code=500, detail="toxicity inference failed") from exc


@app.post("/prepost")
def prepost(request: TextRequest) -> dict:
    """Check a draft without rewriting or storing it."""
    return toxicity(request)


@app.post("/semantic")
def semantic(request: SemanticRequest) -> dict:
    try:
        return engine.semantic_score(
            request.preference, request.post.model_dump(), semantic_threshold
        )
    except ValueError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc
    except Exception as exc:
        raise HTTPException(status_code=500, detail="semantic inference failed") from exc


@app.post("/image/nsfw")
async def nsfw_image(file: Annotated[UploadFile, File(...)]) -> dict:
    try:
        image_bytes = await file.read()
        return engine.classify_image(image_bytes, file.filename or "upload", nsfw_threshold)
    except ValueError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc
    except Exception as exc:
        raise HTTPException(status_code=500, detail="image inference failed") from exc


@app.post("/semantic/image")
async def semantic_image(
    preference: Annotated[str, Form(...)],
    file: Annotated[UploadFile, File(...)],
) -> dict:
    try:
        image_bytes = await file.read()
        return engine.image_semantic_score(
            image_bytes, preference, file.filename or "upload", semantic_threshold
        )
    except ValueError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc
    except Exception as exc:
        raise HTTPException(status_code=500, detail="image semantic inference failed") from exc


@app.post("/ledger/event")
def create_ledger_event(request: LedgerEvent) -> dict[str, str]:
    event = request.model_dump(exclude_none=True)
    event["event_id"] = event.get("event_id") or str(uuid4())
    event["ts"] = event.get("ts") or ledger.now()
    ledger.append(event)
    return {"event_id": event["event_id"]}


@app.get("/ledger/summary")
def ledger_summary(
    session_id: str = Query(..., min_length=1, max_length=200),
) -> dict[str, Any]:
    return ledger.summary(session_id)


@app.post("/ledger/override")
def override_ledger_event(request: LedgerOverride) -> dict[str, str]:
    original = ledger.find(request.event_id, request.session_id)
    if original is None:
        raise HTTPException(status_code=404, detail="ledger event not found")

    timestamp = ledger.now()
    event = {
        "event_id": str(uuid4()),
        "ts": timestamp,
        "session_id": request.session_id,
        "post_id": original["post_id"],
        "source": original["source"],
        "action": "overridden",
        "scores": original.get("scores", {}),
        "threshold_used": original.get("threshold_used", 0.0),
        "trigger_detail": original.get("trigger_detail", {}),
        "user_override": {
            "ts": timestamp,
            "new_action": "shown",
            "original_event_id": request.event_id,
        },
        "original_event_id": request.event_id,
    }
    ledger.append(event)
    return {"event_id": event["event_id"], "original_event_id": request.event_id}

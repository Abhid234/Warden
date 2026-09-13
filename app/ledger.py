"""Append-only transparency ledger storage and aggregation."""

from __future__ import annotations

import json
import threading
from collections import defaultdict
from datetime import datetime
from pathlib import Path
from typing import Any


class Ledger:
    """Store moderation events as one immutable JSON object per line."""

    def __init__(self, path: Path) -> None:
        self.path = path
        self._lock = threading.Lock()

    @staticmethod
    def now() -> str:
        return datetime.now().astimezone().isoformat()

    def append(self, event: dict[str, Any]) -> None:
        self.path.parent.mkdir(parents=True, exist_ok=True)
        with self._lock:
            with self.path.open("a", encoding="utf-8") as handle:
                handle.write(json.dumps(event, ensure_ascii=False) + "\n")

    def read_all(self) -> list[dict[str, Any]]:
        if not self.path.exists():
            return []
        events: list[dict[str, Any]] = []
        with self.path.open("r", encoding="utf-8") as handle:
            for line in handle:
                try:
                    value = json.loads(line)
                except json.JSONDecodeError:
                    continue
                if isinstance(value, dict):
                    events.append(value)
        return events

    def find(self, event_id: str, session_id: str) -> dict[str, Any] | None:
        for event in self.read_all():
            if event.get("event_id") == event_id and event.get("session_id") == session_id:
                return event
        return None

    def summary(self, session_id: str) -> dict[str, Any]:
        events = [event for event in self.read_all() if event.get("session_id") == session_id]
        by_source: dict[str, dict[str, int]] = defaultdict(lambda: defaultdict(int))
        histograms: dict[str, list[int]] = defaultdict(lambda: [0] * 10)

        for event in events:
            source = str(event.get("source", "unknown"))
            action = str(event.get("action", "unknown"))
            by_source[source][action] += 1
            score = self._event_score(event)
            if score is not None:
                bucket = min(9, max(0, int(score * 10)))
                histograms[source][bucket] += 1

        return {
            "session_id": session_id,
            "total_events": len(events),
            "by_source": {source: dict(actions) for source, actions in by_source.items()},
            "score_histogram": dict(histograms),
            "recent_events": list(reversed(events[-20:])),
        }

    @staticmethod
    def _event_score(event: dict[str, Any]) -> float | None:
        scores = event.get("scores", {})
        if not isinstance(scores, dict):
            return None
        for key in ("toxic", "nsfw_score", "similarity_score"):
            value = scores.get(key)
            if isinstance(value, (int, float)):
                return min(1.0, max(0.0, float(value)))
        return None

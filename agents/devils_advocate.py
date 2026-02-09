"""The Devil's Advocate -- critiques decisions and surfaces risks.

Triggered by recent decisions, plans, or significant events. Challenges
assumptions, highlights risks, and suggests alternatives. Writes critique
events back into the memory system.
"""

import json
import logging
from datetime import datetime, timedelta, timezone
from pathlib import Path
from typing import Optional

import psycopg2.extras

from agents.base import QuorumAgent

logger = logging.getLogger("quorum.devils_advocate")

_PROMPT_PATH = Path(__file__).parent / "prompts" / "devils_advocate.txt"
SYSTEM_PROMPT = _PROMPT_PATH.read_text() if _PROMPT_PATH.exists() else ""

# Only critique events from the last N hours.
_DEFAULT_LOOKBACK_HOURS = 48


class DevilsAdvocateAgent(QuorumAgent):
    """Reviews recent decisions and plans, produces critiques."""

    def __init__(self, lookback_hours: int = _DEFAULT_LOOKBACK_HOURS):
        super().__init__("devils_advocate")
        self.lookback_hours = lookback_hours

    # ------------------------------------------------------------------
    # Data retrieval
    # ------------------------------------------------------------------

    def _recent_decisions_and_plans(self) -> list[dict]:
        """Fetch recent decision and insight events worth critiquing."""
        conn = self.connect_db()
        cur = conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor)
        since = datetime.now(timezone.utc) - timedelta(hours=self.lookback_hours)

        cur.execute(
            """
            SELECT * FROM events
            WHERE event_type IN ('decision', 'insight', 'opportunity')
              AND created_at >= %s
              AND id NOT IN (
                  SELECT UNNEST(ref_ids) FROM events
                  WHERE actor = 'devils_advocate' AND event_type = 'critique'
              )
            ORDER BY created_at DESC
            LIMIT 50
            """,
            [since],
        )
        rows = cur.fetchall()
        cur.close()
        return [dict(r) for r in rows]

    def _recent_high_priority_tasks(self) -> list[dict]:
        """Fetch recently created high-priority tasks (might represent decisions)."""
        conn = self.connect_db()
        cur = conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor)
        since = datetime.now(timezone.utc) - timedelta(hours=self.lookback_hours)

        cur.execute(
            """
            SELECT * FROM tasks
            WHERE priority <= 2
              AND created_at >= %s
            ORDER BY created_at DESC
            LIMIT 20
            """,
            [since],
        )
        rows = cur.fetchall()
        cur.close()
        return [dict(r) for r in rows]

    # ------------------------------------------------------------------
    # LLM interaction
    # ------------------------------------------------------------------

    def _build_payload(self, decisions: list[dict], tasks: list[dict]) -> str:
        return json.dumps(
            {
                "decisions_and_plans": [
                    {
                        "id": str(d["id"]),
                        "event_type": d.get("event_type", ""),
                        "title": d.get("title", ""),
                        "description": (d.get("description") or "")[:2000],
                        "actor": d.get("actor", ""),
                        "created_at": d["created_at"].isoformat() if d.get("created_at") else None,
                    }
                    for d in decisions
                ],
                "high_priority_tasks": [
                    {
                        "id": str(t["id"]),
                        "title": t.get("title", ""),
                        "description": (t.get("description") or "")[:1000],
                        "priority": t.get("priority"),
                        "owner": t.get("owner"),
                    }
                    for t in tasks
                ],
            },
            default=str,
        )

    def _parse_response(self, raw: str) -> list[dict]:
        cleaned = raw.strip()
        if cleaned.startswith("```"):
            cleaned = cleaned.split("\n", 1)[1] if "\n" in cleaned else cleaned[3:]
        if cleaned.endswith("```"):
            cleaned = cleaned[:-3]
        cleaned = cleaned.strip()

        try:
            result = json.loads(cleaned)
        except json.JSONDecodeError:
            logger.warning("Failed to parse devil's advocate response: %s", raw[:200])
            return []

        if not isinstance(result, list):
            return []
        return result

    # ------------------------------------------------------------------
    # Main run
    # ------------------------------------------------------------------

    def run(self) -> str:
        decisions = self._recent_decisions_and_plans()
        tasks = self._recent_high_priority_tasks()

        if not decisions and not tasks:
            logger.info("No recent decisions or high-priority tasks to critique.")
            return "Nothing to critique."

        payload = self._build_payload(decisions, tasks)
        raw = self.call_llm(SYSTEM_PROMPT, payload)
        critiques = self._parse_response(raw)

        stored = 0
        for critique in critiques:
            severity = critique.get("severity", "medium")
            target = critique.get("target", "Unknown")

            description_parts = []
            if critique.get("assumption"):
                description_parts.append(f"Assumption: {critique['assumption']}")
            if critique.get("risk"):
                description_parts.append(f"Risk: {critique['risk']}")
            if critique.get("alternative"):
                description_parts.append(f"Alternative: {critique['alternative']}")

            description = "\n".join(description_parts)

            # Find the referenced event/task ID if possible.
            ref_ids = []
            for d in decisions:
                if d.get("title") == target or str(d["id"]) == target:
                    ref_ids.append(str(d["id"]))
            for t in tasks:
                if t.get("title") == target or str(t["id"]) == target:
                    ref_ids.append(str(t["id"]))

            self.store_event(
                event_type="critique",
                title=f"Critique: {target}",
                description=description,
                metadata={"severity": severity, "target": target},
                ref_ids=ref_ids,
            )
            stored += 1

        summary = f"Reviewed {len(decisions)} decisions + {len(tasks)} tasks, wrote {stored} critiques."
        logger.info(summary)
        return summary


if __name__ == "__main__":
    logging.basicConfig(level=logging.INFO, format="%(asctime)s %(name)s %(levelname)s %(message)s")
    agent = DevilsAdvocateAgent()
    agent.execute()
